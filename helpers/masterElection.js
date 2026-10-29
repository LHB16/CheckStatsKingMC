/**
 * helpers/masterElection.js - Quản lý Bầu chọn Master (Leader Election) & High Availability Failover
 * Hỗ trợ chạy song song 2 Master (Active - Standby) trên Render / Wispbyte / VPS.
 * Tự động chuyển đổi dự phòng khi Master chính bị suspended (hết bandwidth), crash hoặc shutdown.
 */

const { getSystemConfigModel, setSystemConfig, isMongoAvailable } = require('./mongoHelper');
const renderManager = require('./renderManager');

const CONFIG_KEY_LEADER = 'master_leader';
const HEARTBEAT_INTERVAL_MS = 15000; // Gửi nhịp tim mỗi 15 giây
const FAILOVER_TIMEOUT_MS = 45000;   // Coi Leader đã chết nếu không có nhịp tim sau 45 giây
const STANDBY_CHECK_INTERVAL_MS = 10000; // Node Standby kiểm tra nhịp tim mỗi 10 giây

class MasterElection {
  constructor() {
    this.instanceId = process.env.MASTER_INSTANCE_ID || ('master_' + Math.random().toString(36).substring(2, 9));
    this.instanceName = process.env.MASTER_NAME || process.env.RENDER_SERVICE_NAME || `Master-${process.env.PORT || process.env.SERVER_PORT || 'Node'}`;
    this.isLeader = false;
    this.currentTerm = 0;
    this.electionTimer = null;
    this.discordClient = null;
    this.queueDispatcher = null;
    this.startSchedulerFn = null;
    this.getSelfUrlFn = null;
    this.adminId = (process.env.ADMIN_ID || '').trim();
    this.discordToken = process.env.DISCORD_TOKEN;
    this.isStarting = false;
  }

  /**
   * Lấy URL công khai của chính Node này
   */
  getSelfUrl() {
    if (typeof this.getSelfUrlFn === 'function') {
      return this.getSelfUrlFn();
    }
    return process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.MASTER_URL || process.env.SELF_URL || '';
  }

  /**
   * Khởi động quy trình bầu chọn Master
   */
  async start({ discordClient, queueDispatcher, startSchedulerFn, getSelfUrlFn }) {
    this.discordClient = discordClient;
    this.queueDispatcher = queueDispatcher;
    this.startSchedulerFn = startSchedulerFn;
    this.getSelfUrlFn = getSelfUrlFn;

    console.log(`[MasterElection] 🛡️ Khởi tạo Master Node: [${this.instanceName}] (ID: ${this.instanceId})`);

    // Thực hiện vòng kiểm tra đầu tiên ngay lập tức
    await this.evaluateElection();

    // Duy trì vòng lặp kiểm tra / gửi nhịp tim
    if (this.electionTimer) clearInterval(this.electionTimer);
    this.electionTimer = setInterval(() => {
      this.evaluateElection().catch(err => {
        console.warn('[MasterElection] Lỗi vòng lặp bầu chọn:', err.message);
      });
    }, this.isLeader ? HEARTBEAT_INTERVAL_MS : STANDBY_CHECK_INTERVAL_MS);
  }

  /**
   * Đánh giá và cập nhật vai trò Leader / Standby
   */
  async evaluateElection() {
    if (this.isStarting) return;
    if (!isMongoAvailable()) {
      // Nếu MongoDB chưa sẵn sàng, giữ trạng thái hiện tại
      return;
    }

    try {
      const SystemConfig = getSystemConfigModel();
      const leaderDoc = await SystemConfig.findOne({ key: CONFIG_KEY_LEADER }).lean();
      const currentLeader = leaderDoc?.value || null;
      const now = Date.now();

      // Kiểm tra tính hợp lệ của Leader hiện tại
      const hasLeader = !!(currentLeader && currentLeader.leaderId);
      const isLeaderAlive = hasLeader && (now - (currentLeader.lastHeartbeat || 0) < FAILOVER_TIMEOUT_MS);

      if (this.isLeader) {
        // --- TRƯỜNG HỢP A: BẢN THÂN ĐANG LÀ LEADER ---
        if (currentLeader && currentLeader.leaderId === this.instanceId) {
          // Gửi nhịp tim định kỳ
          await SystemConfig.updateOne(
            { key: CONFIG_KEY_LEADER },
            { 
              $set: { 
                'value.lastHeartbeat': now,
                'value.leaderUrl': this.getSelfUrl() || currentLeader.leaderUrl || '',
                'value.leaderName': this.instanceName
              } 
            }
          );
        } else if (isLeaderAlive && currentLeader.leaderId !== this.instanceId) {
          // Phát hiện Leader khác có thẩm quyền hơn (Split-brain recovery)
          console.warn(`[MasterElection] ⚠️ Phát hiện Leader khác [${currentLeader.leaderName}] (${currentLeader.leaderId}) còn sống. Đang hạ cấp về STANDBY...`);
          await this.demoteToStandby('Bị thay thế bởi Leader khác hợp lệ');
        } else {
          // Ghi đè lại quyền nếu tài liệu bị lỗi
          await this.promoteToLeader(currentLeader, false);
        }
      } else {
        // --- TRƯỜNG HỢP B: BẢN THÂN ĐANG LÀ STANDBY ---
        if (!isLeaderAlive) {
          const reason = !hasLeader ? 'Chưa có Leader nào được đăng ký' : `Leader cũ [${currentLeader.leaderName}] (${currentLeader.leaderId}) đã mất tín hiệu nhịp tim quá ${Math.round((now - currentLeader.lastHeartbeat) / 1000)}s`;
          console.warn(`[MasterElection] 🚨 ${reason}. Bắt đầu giành quyền ACTIVE LEADER...`);
          
          const success = await this.tryAcquireLeadership(currentLeader);
          if (success) {
            await this.promoteToLeader(currentLeader, true);
          }
        } else {
          // Leader cũ vẫn còn sống tốt -> Tiếp tục ở chế độ Standby
          const timeSinceHeartbeat = Math.round((now - (currentLeader.lastHeartbeat || 0)) / 1000);
          // Log định kỳ nhẹ nhàng
          if (Math.random() < 0.25) {
            console.log(`[MasterElection] 🛡️ [${this.instanceName}] đang ở chế độ STANDBY. Leader hoạt động: [${currentLeader.leaderName}] (${timeSinceHeartbeat}s trước)`);
          }
        }
      }
    } catch (err) {
      console.error('[MasterElection] Lỗi đánh giá bầu chọn:', err.message);
    }
  }

  /**
   * Cố gắng giành quyền Leader nguyên tử (Atomic CAS Lock)
   */
  async tryAcquireLeadership(oldLeader) {
    try {
      const SystemConfig = getSystemConfigModel();
      const now = Date.now();
      const newTerm = ((oldLeader && oldLeader.term) || 0) + 1;
      const selfUrl = this.getSelfUrl();

      const newLeaderValue = {
        leaderId: this.instanceId,
        leaderName: this.instanceName,
        leaderUrl: selfUrl,
        lastHeartbeat: now,
        term: newTerm,
        promotedAt: now
      };

      // Điều kiện atomic: Hoặc chưa có doc, hoặc nhịp tim cũ đã hết hạn
      const filter = oldLeader && oldLeader.lastHeartbeat
        ? { key: CONFIG_KEY_LEADER, 'value.lastHeartbeat': oldLeader.lastHeartbeat }
        : { key: CONFIG_KEY_LEADER };

      const res = await SystemConfig.findOneAndUpdate(
        filter,
        { 
          key: CONFIG_KEY_LEADER, 
          value: newLeaderValue,
          description: 'Thông tin Master Node Active (Leader Election)' 
        },
        { upsert: true, returnDocument: 'after' }
      );

      if (res && res.value && res.value.leaderId === this.instanceId) {
        this.currentTerm = newTerm;
        return true;
      }
      return false;
    } catch (err) {
      console.warn('[MasterElection] Không thể giành quyền Leader:', err.message);
      return false;
    }
  }

  /**
   * Nâng cấp Node lên thành Active Leader
   */
  async promoteToLeader(previousLeader = null, wasFailover = false) {
    this.isStarting = true;
    this.isLeader = true;
    console.log(`==================================================`);
    console.log(`👑 [MasterElection] NODE [${this.instanceName}] ĐÃ TRỞ THÀNH ACTIVE LEADER (Term: ${this.currentTerm})`);
    console.log(`==================================================`);

    try {
      const selfUrl = this.getSelfUrl();
      if (selfUrl) {
        // Cập nhật master_url tập trung trên MongoDB cho tất cả Worker
        await setSystemConfig('master_url', selfUrl, 'URL của Active Master Node hiện tại');
        console.log(`[MasterElection] 📡 Đã đồng bộ Master URL mới lên MongoDB: ${selfUrl}`);

        // Tự động báo Google Apps Script chuyển hướng Ping định kỳ sang Master mới
        renderManager.notifyGoogleAppsScript('add', selfUrl, { isMaster: true }).catch(err => {
          console.warn('[MasterElection] Không thể đồng bộ URL mới với Google Apps Script:', err.message);
        });
      }

      // Khởi động Discord Bot (nếu chưa đăng nhập)
      if (this.discordClient && !this.discordClient.readyAt) {
        console.log('[MasterElection] 🤖 Đang đăng nhập Discord Bot cho Active Master Node...');
        if (this.discordToken && this.discordToken !== 'your_discord_bot_token_here') {
          await this.discordClient.login(this.discordToken).catch(err => {
            console.error('[MasterElection] Lỗi đăng nhập Discord Bot:', err.message);
          });
        }
      }

      // Khởi chạy tiến trình theo dõi số dư định kỳ
      if (!global.trackerSchedulerInstance && typeof this.startSchedulerFn === 'function') {
        global.trackerSchedulerInstance = this.startSchedulerFn(this.queueDispatcher);
        global.runTrackerCheckCycle = global.trackerSchedulerInstance?.runCheckCycle;
      }

      // Gửi cảnh báo Failover tới Admin Discord (nếu vừa tiếp quản sau sự cố của node trước)
      if (wasFailover && previousLeader && previousLeader.leaderName) {
        setTimeout(async () => {
          if (this.discordClient && this.adminId) {
            try {
              const adminUser = await this.discordClient.users.fetch(this.adminId);
              if (adminUser) {
                await adminUser.send(
                  `🚨 **[HỆ THỐNG TỰ ĐỘNG CHUYỂN ĐỔI MASTER]**\n` +
                  `• Master cũ \`${previousLeader.leaderName}\` (${previousLeader.leaderId}) đã mất tín hiệu (hết bandwidth hoặc tắt).\n` +
                  `• **Master mới tiếp quản:** \`${this.instanceName}\` (\`${this.instanceId}\`)\n` +
                  `• **URL:** \`${selfUrl || 'Chưa có URL'}\`\n` +
                  `• Discord Bot và bộ điều phối Worker đã được kích hoạt tiếp tục phục vụ!`
                ).catch(() => {});
              }
            } catch (e) {}
          }
        }, 6000);
      }
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Hạ cấp Node về Standby (khi nhường quyền hoặc dừng hoạt động)
   */
  async demoteToStandby(reason = 'Tự nguyện nhường quyền') {
    if (!this.isLeader) return;
    this.isLeader = false;
    console.log(`[MasterElection] 🛡️ [${this.instanceName}] chuyển về trạng thái STANDBY. Lý do: ${reason}`);

    // Dừng Tracker Scheduler
    if (global.trackerSchedulerInstance && global.trackerSchedulerInstance.timer) {
      clearInterval(global.trackerSchedulerInstance.timer);
      global.trackerSchedulerInstance = null;
      global.runTrackerCheckCycle = null;
    }

    // Ngắt kết nối Discord Bot để tránh duplicate reply
    if (this.discordClient && this.discordClient.readyAt) {
      console.log('[MasterElection] 🔌 Đang ngắt kết nối Discord Bot để nhường cho Leader mới...');
      try {
        this.discordClient.destroy();
      } catch (err) {
        console.warn('[MasterElection] Lỗi khi ngắt kết nối Discord Client:', err.message);
      }
    }
  }

  /**
   * Tự nguyện từ chức để Master dự phòng tiếp quản ngay lập tức
   */
  async stepDown(reason = 'Chuyển đổi thủ công') {
    console.log(`[MasterElection] 🔄 [${this.instanceName}] đang từ chức Leader: ${reason}`);
    try {
      const SystemConfig = getSystemConfigModel();
      // Đặt heartbeat về 0 để node Standby nhận diện và tiếp quản ngay lập tức
      await SystemConfig.updateOne(
        { key: CONFIG_KEY_LEADER, 'value.leaderId': this.instanceId },
        { $set: { 'value.lastHeartbeat': 0, 'value.resigned': true } }
      );
      await this.demoteToStandby(reason);
      return { success: true, message: `Node [${this.instanceName}] đã từ chức Leader thành công.` };
    } catch (err) {
      console.error('[MasterElection] Lỗi khi từ chức:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Lấy thông tin trạng thái Master hiện tại
   */
  async getStatus() {
    let currentLeader = null;
    let isLeaderAlive = false;
    let timeSinceHeartbeat = -1;

    try {
      if (isMongoAvailable()) {
        const SystemConfig = getSystemConfigModel();
        const doc = await SystemConfig.findOne({ key: CONFIG_KEY_LEADER }).lean();
        currentLeader = doc?.value || null;
        if (currentLeader && currentLeader.lastHeartbeat) {
          timeSinceHeartbeat = Math.round((Date.now() - currentLeader.lastHeartbeat) / 1000);
          isLeaderAlive = timeSinceHeartbeat < Math.round(FAILOVER_TIMEOUT_MS / 1000);
        }
      }
    } catch (e) {}

    return {
      thisNode: {
        instanceId: this.instanceId,
        instanceName: this.instanceName,
        isLeader: this.isLeader,
        selfUrl: this.getSelfUrl(),
        uptimeSeconds: Math.floor(process.uptime())
      },
      currentLeader: currentLeader ? {
        leaderId: currentLeader.leaderId,
        leaderName: currentLeader.leaderName,
        leaderUrl: currentLeader.leaderUrl,
        lastHeartbeatAgoSec: timeSinceHeartbeat,
        isAlive: isLeaderAlive,
        term: currentLeader.term
      } : null,
      failoverTimeoutSec: Math.round(FAILOVER_TIMEOUT_MS / 1000)
    };
  }
}

module.exports = new MasterElection();
