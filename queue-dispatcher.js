/**
 * queue-dispatcher.js - Quản lý Hàng Đợi (Task Queue) và Điều Phối Công Việc Nhiều Worker
 * @description Hỗ trợ phân phối tải (Round-Robin), tự động thử lại hàng đợi, và chia đều người chơi (Batch Parallel)
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class QueueDispatcher {
  constructor() {
    this.queue = [];
    this.workerUrls = (process.env.WORKER_URLS || '')
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0);
    this.workerSecret = process.env.WORKER_SECRET || '';

    // Node Worker địa phương (nếu ở chế độ standalone)
    this.localBot = null;

    // Quản lý trạng thái bận nội bộ để tránh xung đột
    this.busyWorkers = new Set(); // Chứa 'local' hoặc baseUrl của remote worker
    this.lastWorkerIndex = 0;      // Con trỏ Round-Robin
    this.retryTimer = null;       // Timer kiểm tra lại hàng đợi định kỳ
    this.isProcessingQueue = false;
  }

  setLocalBot(bot) {
    this.localBot = bot;
  }

  // Thêm công việc vào hàng đợi
  enqueueTask(action, player, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const task = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        action, // 'stats', 'bal', 'order', 'ah', 'online'
        player,
        timeoutMs,
        createdAt: Date.now(),
        resolve,
        reject
      };

      console.log(`[QueueDispatcher] 📥 Đã thêm tác vụ #${task.id} (${action} cho ${player}) vào hàng đợi. Vị trí hàng đợi: ${this.queue.length + 1}`);
      this.queue.push(task);

      // Thời gian chờ tối đa trong hàng đợi
      task.timer = setTimeout(() => {
        const index = this.queue.findIndex(t => t.id === task.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          console.warn(`[QueueDispatcher] ⚠️ Tác vụ #${task.id} (${action} ${player}) bị Timeout trong Hàng đợi!`);
          reject(new Error(`Yêu cầu bị quá thời gian chờ (${timeoutMs / 1000}s) trong hàng đợi do tất cả các Bot đều đang bận hoặc đang kết nối lại.`));
        }
      }, timeoutMs + 10000);

      this.processQueue();
    });
  }

  // Đảm bảo có vòng lặp retry nếu hàng đợi còn tác vụ nhưng chưa có worker rảnh
  scheduleQueueRetry() {
    if (this.queue.length === 0) {
      if (this.retryTimer) {
        clearInterval(this.retryTimer);
        this.retryTimer = null;
      }
      return;
    }

    if (!this.retryTimer) {
      this.retryTimer = setInterval(() => {
        if (this.queue.length > 0) {
          this.processQueue();
        } else {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
      }, 1500);
    }
  }

  // Xử lý hàng đợi với cơ chế phân phối song song cho các worker rảnh
  async processQueue() {
    if (this.isProcessingQueue || this.queue.length === 0) {
      this.scheduleQueueRetry();
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.queue.length > 0) {
        // Tìm worker đang rảnh và sẵn sàng theo Round-Robin
        const availableWorker = await this.findAvailableWorker();
        if (!availableWorker) {
          // Không còn worker nào rảnh tại thời điểm này
          break;
        }

        const task = this.queue.shift();
        if (!task) break;

        clearTimeout(task.timer);
        const workerKey = availableWorker.type === 'local' ? 'local' : availableWorker.url;
        this.busyWorkers.add(workerKey);

        console.log(`[QueueDispatcher] 🚀 Phân phối tác vụ #${task.id} (${task.action} ${task.player}) tới Worker [${availableWorker.name}]...`);

        // Thực thi tác vụ bất đồng bộ (không chặn vòng lặp để worker khác cùng nhận việc)
        this.executeTaskOnWorker(availableWorker, task.action, task.player, task.timeoutMs)
          .then((result) => {
            task.resolve(result);
          })
          .catch((err) => {
            console.error(`[QueueDispatcher] ❌ Thất bại tác vụ #${task.id} trên Worker [${availableWorker.name}]:`, err.message);
            task.reject(err);
          })
          .finally(() => {
            this.busyWorkers.delete(workerKey);
            // Kích hoạt lại xử lý hàng đợi ngay khi worker này rảnh
            setImmediate(() => this.processQueue());
          });
      }
    } finally {
      this.isProcessingQueue = false;
      this.scheduleQueueRetry();
    }
  }

  // Thực thi tác vụ trực tiếp trên 1 worker cụ thể (Local hoặc Remote)
  async executeTaskOnWorker(worker, action, player, timeoutMs = 15000) {
    const workerKey = worker.type === 'local' ? 'local' : worker.url;
    this.busyWorkers.add(workerKey);

    try {
      if (worker.type === 'local') {
        if (!this.localBot || !this.localBot.isBotOnline || !this.localBot.isReady) {
          throw new Error('Local Worker Minecraft Bot chưa sẵn sàng hoặc đang kết nối lại.');
        }

        if (action === 'stats') {
          return await this.localBot.getStats(player, timeoutMs);
        } else if (action === 'bal') {
          return await this.localBot.getBalance(player, timeoutMs);
        } else if (action === 'order') {
          return await this.localBot.getOrder(player, timeoutMs);
        } else if (action === 'ah') {
          return await this.localBot.getAh(player, timeoutMs);
        } else if (action === 'online') {
          return await this.localBot.getOnline(player, timeoutMs);
        } else {
          throw new Error(`Hành động không hợp lệ: ${action}`);
        }
      } else {
        return await this.executeRemoteWorker(worker.url, action, player, timeoutMs);
      }
    } finally {
      this.busyWorkers.delete(workerKey);
    }
  }

  // Lấy danh sách toàn bộ Worker đang rảnh & sẵn sàng nhận lệnh
  async getAvailableWorkers() {
    const available = [];

    // 1. Kiểm tra Local Worker
    if (this.localBot && !this.busyWorkers.has('local')) {
      if (this.localBot.isBotOnline && this.localBot.isReady && !this.localBot.targetPlayer) {
        available.push({ type: 'local', name: 'Local-Worker', url: 'local' });
      }
    }

    // 2. Kiểm tra Remote Workers
    for (const baseUrl of this.workerUrls) {
      if (this.busyWorkers.has(baseUrl)) continue;

      try {
        const status = await this.checkRemoteWorkerHealth(baseUrl);
        if (status && status.online && status.ready && !status.busy) {
          available.push({ type: 'remote', name: baseUrl, url: baseUrl });
        }
      } catch (e) {
        console.warn(`[QueueDispatcher] Không thể kết nối tới Remote Worker ${baseUrl}: ${e.message}`);
      }
    }

    return available;
  }

  // Tìm 1 Worker rảnh sử dụng cơ chế Round-Robin để trải đều tải
  async findAvailableWorker() {
    const available = await this.getAvailableWorkers();
    if (available.length === 0) return null;

    // Chọn worker tiếp theo theo vòng tròn (Round-Robin)
    const selected = available[this.lastWorkerIndex % available.length];
    this.lastWorkerIndex = (this.lastWorkerIndex + 1) % available.length;
    return selected;
  }

  // Kiểm tra Health của Remote Worker (Tăng timeout lên 6000ms để ổn định)
  checkRemoteWorkerHealth(baseUrl) {
    return new Promise((resolve) => {
      try {
        const url = new URL('/health', baseUrl);
        const transport = url.protocol === 'https:' ? https : http;

        const req = transport.get(url.href, { timeout: 6000 }, (res) => {
          let rawData = '';
          res.on('data', chunk => rawData += chunk);
          res.on('end', () => {
            try {
              const data = JSON.parse(rawData);
              resolve(data);
            } catch (e) {
              resolve(null);
            }
          });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });
      } catch (err) {
        resolve(null);
      }
    });
  }

  // Gửi lệnh thực thi tới Remote Worker qua HTTP POST /api/execute
  executeRemoteWorker(baseUrl, action, player, timeoutMs) {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL('/api/execute', baseUrl);
        const transport = url.protocol === 'https:' ? https : http;

        const postData = JSON.stringify({
          action,
          player,
          timeoutMs
        });

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'x-worker-secret': this.workerSecret
          },
          timeout: timeoutMs + 4000
        };

        const req = transport.request(url.href, options, (res) => {
          let rawData = '';
          res.on('data', chunk => rawData += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(rawData);
              if (res.statusCode === 200 && parsed.success) {
                resolve(parsed.result);
              } else {
                reject(new Error(parsed.error || `Remote Worker trả về mã lỗi HTTP ${res.statusCode}`));
              }
            } catch (e) {
              reject(new Error(`Lỗi parse dữ liệu từ Remote Worker: ${e.message}`));
            }
          });
        });

        req.on('error', (err) => reject(new Error(`Lỗi kết nối tới Worker ${baseUrl}: ${err.message}`)));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Remote Worker ${baseUrl} bị Timeout!`));
        });

        req.write(postData);
        req.end();
      } catch (err) {
        reject(new Error(`Không thể khởi tạo request tới ${baseUrl}: ${err.message}`));
      }
    });
  }

  /**
   * Phân bổ danh sách người chơi (hoặc items) TRẢI ĐỀU cho toàn bộ Workers đang rảnh và sẵn sàng
   * Chạy song song (Parallel) giữa các worker, mỗi worker có khoảng nghỉ an toàn giữa các lệnh
   * @param {string} action - 'bal', 'stats', v.v.
   * @param {Array<string>} players - Danh sách người chơi cần kiểm tra
   * @param {number} timeoutMs - Timeout cho mỗi lệnh check
   * @param {number} delayBetweenCommandsMs - Delay an toàn giữa 2 lệnh trên CÙNG 1 worker (tránh spam server KingMC)
   * @param {Function} onPlayerResult - Callback được gọi ngay khi 1 player hoàn thành
   */
  async dispatchBatchTasks(action, players, timeoutMs = 15000, delayBetweenCommandsMs = 3000, onPlayerResult = null) {
    if (!players || players.length === 0) {
      return { total: 0, successCount: 0, failCount: 0, workerCount: 0, details: [] };
    }

    // Lọc danh sách không trùng lặp
    const uniquePlayers = Array.from(new Set(players.map(p => p.trim()).filter(p => p.length > 0)));

    // 1. Quét tìm tất cả các Worker đang Online & Sẵn sàng
    let activeWorkers = await this.getAvailableWorkers();

    // Nếu không có worker nào rảnh ngay lúc này, chờ 2 giây rồi thử quét lại 1 lần nữa
    if (activeWorkers.length === 0) {
      console.log('[QueueDispatcher] ⏳ Chưa có Worker nào rảnh, đang đợi 2 giây để quét lại...');
      await new Promise(r => setTimeout(r, 2000));
      activeWorkers = await this.getAvailableWorkers();
    }

    // Nếu vẫn không có worker nào rảnh:
    if (activeWorkers.length === 0) {
      // Fallback: nếu có localBot thì dùng localBot, hoặc nếu có cấu hình workerUrls thì thử worker đầu tiên
      if (this.localBot) {
        activeWorkers.push({ type: 'local', name: 'Local-Worker', url: 'local' });
      } else if (this.workerUrls.length > 0) {
        activeWorkers.push({ type: 'remote', name: this.workerUrls[0], url: this.workerUrls[0] });
      } else {
        throw new Error('Không tìm thấy bất kỳ Worker nào đang online hoặc sẵn sàng để kiểm tra.');
      }
    }

    console.log(`[QueueDispatcher] ⚖️ Phân phối trải đều ${uniquePlayers.length} người chơi cho ${activeWorkers.length} Worker: [${activeWorkers.map(w => w.name).join(', ')}]`);

    // 2. Chia đều người chơi thành các nhóm (Buckets) cho từng Worker
    const buckets = activeWorkers.map(w => ({
      worker: w,
      players: []
    }));

    uniquePlayers.forEach((player, index) => {
      const bucketIdx = index % buckets.length;
      buckets[bucketIdx].players.push(player);
    });

    buckets.forEach((b, i) => {
      console.log(`   └─ Worker #${i + 1} [${b.worker.name}]: Đảm nhận ${b.players.length} người chơi (${b.players.join(', ') || 'trống'})`);
    });

    const allResults = [];
    let successCount = 0;
    let failCount = 0;

    // 3. Khởi chạy từng Worker xử lý danh sách của mình SONG SONG (Parallel)
    const workerPromises = buckets.map(async (bucket) => {
      const { worker, players: workerPlayers } = bucket;

      for (let i = 0; i < workerPlayers.length; i++) {
        const player = workerPlayers[i];
        console.log(`[QueueDispatcher] ⏳ [${worker.name}] Bắt đầu kiểm tra "${player}" (${i + 1}/${workerPlayers.length})...`);

        try {
          const result = await this.executeTaskOnWorker(worker, action, player, timeoutMs);
          successCount++;
          const record = { player, worker: worker.name, success: true, result };
          allResults.push(record);

          if (onPlayerResult) {
            try { await onPlayerResult(record); } catch (e) {}
          }
        } catch (err) {
          failCount++;
          console.warn(`[QueueDispatcher] ⚠️ [${worker.name}] Lỗi kiểm tra "${player}": ${err.message}`);
          const record = { player, worker: worker.name, success: false, error: err.message };
          allResults.push(record);

          if (onPlayerResult) {
            try { await onPlayerResult(record); } catch (e) {}
          }
        }

        // Nghỉ an toàn giữa các lệnh trên cùng worker (tránh bị KingMC áp dụng spam/cooldown)
        if (i < workerPlayers.length - 1 && delayBetweenCommandsMs > 0) {
          await new Promise(r => setTimeout(r, delayBetweenCommandsMs));
        }
      }
    });

    // Chờ toàn bộ các Worker hoàn thành công việc được giao
    await Promise.allSettled(workerPromises);

    return {
      total: uniquePlayers.length,
      successCount,
      failCount,
      workerCount: activeWorkers.length,
      workers: activeWorkers.map(w => w.name),
      details: allResults
    };
  }

  // Lấy trạng thái của toàn bộ Workers (Local + Remote)
  async getAllWorkersStatus() {
    const list = [];

    // 1. Quét Local Worker (nếu có)
    if (this.localBot) {
      list.push({
        type: 'local',
        name: 'Local Worker',
        username: this.localBot.credentials?.username || 'N/A',
        online: this.localBot.isBotOnline,
        ready: this.localBot.isReady,
        busy: !this.localBot.isReady || !!this.localBot.targetPlayer || this.busyWorkers.has('local'),
        targetPlayer: this.localBot.targetPlayer || null
      });
    }

    // 2. Quét danh sách Remote Workers qua HTTP /health
    for (const baseUrl of this.workerUrls) {
      try {
        const health = await this.checkRemoteWorkerHealth(baseUrl);
        if (health) {
          list.push({
            type: 'remote',
            name: baseUrl,
            username: health.username || 'RemoteBot',
            online: !!health.online,
            ready: !!health.ready,
            busy: !!health.busy || this.busyWorkers.has(baseUrl),
            targetPlayer: health.targetPlayer || null
          });
        } else {
          list.push({
            type: 'remote',
            name: baseUrl,
            username: 'N/A',
            online: false,
            ready: false,
            busy: false,
            targetPlayer: null,
            error: 'Không thể kết nối / Timeout'
          });
        }
      } catch (e) {
        list.push({
          type: 'remote',
          name: baseUrl,
          username: 'N/A',
          online: false,
          ready: false,
          busy: false,
          targetPlayer: null,
          error: e.message
        });
      }
    }

    return list;
  }

  // Gửi lệnh restart tới 1 Remote Worker qua API /api/restart
  restartRemoteWorker(baseUrl) {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL('/api/restart', baseUrl);
        const transport = url.protocol === 'https:' ? https : http;

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-secret': this.workerSecret
          },
          timeout: 6000
        };

        const req = transport.request(url.href, options, (res) => {
          let rawData = '';
          res.on('data', chunk => rawData += chunk);
          res.on('end', () => {
            try {
              const parsed = JSON.parse(rawData);
              if (res.statusCode === 200 && parsed.success) {
                resolve(parsed);
              } else {
                reject(new Error(parsed.error || `Lỗi HTTP ${res.statusCode}`));
              }
            } catch (e) {
              reject(new Error(`Lỗi parse dữ liệu từ Worker: ${e.message}`));
            }
          });
        });

        req.on('error', (err) => reject(new Error(`Lỗi kết nối tới Worker ${baseUrl}: ${err.message}`)));
        req.on('timeout', () => {
          req.destroy();
          reject(new Error(`Worker ${baseUrl} bị Timeout!`));
        });

        req.end();
      } catch (err) {
        reject(new Error(`Không thể gửi yêu cầu restart tới ${baseUrl}: ${err.message}`));
      }
    });
  }

  // Gửi lệnh restart tới toàn bộ Workers (Local + Remote)
  async restartAllWorkers() {
    const results = [];

    // Helper gen chuỗi ngẫu nhiên 10 ký tự
    const generateRandomStr = (len = 10) => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };

    // 1. Restart Local Worker nếu có
    if (this.localBot) {
      try {
        const newName = generateRandomStr(10);
        const newPass = generateRandomStr(10);
        this.localBot.credentials.username = newName;
        this.localBot.credentials.password = newPass;

        if (this.localBot.bot) {
          this.localBot.bot.end('Restart request from Master');
        } else {
          this.localBot.scheduleReconnect();
        }
        results.push({ type: 'local', name: 'Local Worker', success: true, username: newName });
      } catch (e) {
        results.push({ type: 'local', name: 'Local Worker', success: false, error: e.message });
      }
    }

    // 2. Restart tất cả Remote Workers
    for (const baseUrl of this.workerUrls) {
      try {
        const res = await this.restartRemoteWorker(baseUrl);
        results.push({ type: 'remote', name: baseUrl, success: true, username: res.username || 'RemoteBot' });
      } catch (e) {
        results.push({ type: 'remote', name: baseUrl, success: false, error: e.message });
      }
    }

    return results;
  }
}

module.exports = QueueDispatcher;
