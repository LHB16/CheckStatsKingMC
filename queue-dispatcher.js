/**
 * queue-dispatcher.js - Quản lý Hàng Đợi (Task Queue) và Điều Phối Công Việc Nhiều Worker
 * @description Hỗ trợ phân phối tải (Round-Robin), thử lại hàng đợi, batch parallel,
 * và quản lý Worker động lưu trữ trong MongoDB.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { getWorkerModel, isMongoAvailable } = require('./helpers/mongoHelper');

class QueueDispatcher {
  constructor() {
    this.queue = [];
    this.workerSecret = process.env.WORKER_SECRET || '';

    // Node Worker địa phương (nếu ở chế độ standalone)
    this.localBot = null;

    // Quản lý trạng thái bận nội bộ để tránh xung đột
    this.busyWorkers = new Set(); // Chứa 'local' hoặc baseUrl của remote worker
    this.lastWorkerIndex = 0;      // Con trỏ Round-Robin
    this.retryTimer = null;       // Timer kiểm tra lại hàng đợi định kỳ
    this.isProcessingQueue = false;

    // Danh sách dự phòng từ file .env (nếu chưa kết nối MongoDB)
    this.envWorkerUrls = (process.env.WORKER_URLS || '')
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0);

    // Bộ nhớ đệm danh sách Worker
    this.cachedWorkers = [];
    this.isInitialized = false;

    // Khởi chạy vòng lặp kiểm tra sức khỏe Worker định kỳ
    this.healthMonitorTimer = null;
  }

  setLocalBot(bot) {
    this.localBot = bot;
  }

  /**
   * Khởi tạo danh sách Worker từ MongoDB
   * Tự động di chuyển (migrate) WORKER_URLS từ .env vào MongoDB nếu DB chưa có
   */
  async initWorkers() {
    try {
      if (isMongoAvailable()) {
        const Worker = getWorkerModel();
        const count = await Worker.countDocuments();

        // Nếu DB chưa có worker nào mà .env có, tự động nạp từ .env vào DB
        if (count === 0 && this.envWorkerUrls.length > 0) {
          console.log('[QueueDispatcher] 📦 Đang tự động lưu danh sách Worker từ .env vào MongoDB...');
          for (let i = 0; i < this.envWorkerUrls.length; i++) {
            const rawUrl = this.envWorkerUrls[i];
            try {
              const parsed = new URL(rawUrl);
              const cleanUrl = `${parsed.protocol}//${parsed.host}`;
              await Worker.create({
                name: `Worker-${i + 1}`,
                url: cleanUrl,
                secret: this.workerSecret,
                isActive: true,
                status: 'unknown'
              });
            } catch (err) {
              console.warn(`[QueueDispatcher] URL không hợp lệ từ .env: ${rawUrl}`);
            }
          }
        }

        // Tải danh sách từ DB
        const dbWorkers = await Worker.find().sort({ createdAt: 1 }).lean();
        this.cachedWorkers = dbWorkers;
        console.log(`[QueueDispatcher] ✅ Đã nạp ${dbWorkers.length} Worker từ MongoDB.`);
      } else {
        // Fallback: Sử dụng danh sách từ .env
        this.cachedWorkers = this.envWorkerUrls.map((url, idx) => ({
          _id: `env_${idx}`,
          name: `Env-Worker-${idx + 1}`,
          url,
          secret: this.workerSecret,
          isActive: true,
          status: 'unknown',
          latency: -1,
          botUsername: 'N/A'
        }));
        console.log(`[QueueDispatcher] ℹ️ Sử dụng ${this.cachedWorkers.length} Worker từ biến môi trường .env.`);
      }
    } catch (e) {
      console.warn('[QueueDispatcher] Lỗi khi nạp Worker từ MongoDB:', e.message);
    } finally {
      this.isInitialized = true;
      this.startHealthMonitor();
    }
  }

  /**
   * Khởi động tiến trình kiểm tra ping và sức khỏe Worker định kỳ (30s)
   */
  startHealthMonitor() {
    if (this.healthMonitorTimer) return;

    // Ping kiểm tra ngay lần đầu
    this.refreshAllWorkersHealth().catch(() => {});

    // Lặp lại mỗi 30 giây
    this.healthMonitorTimer = setInterval(() => {
      this.refreshAllWorkersHealth().catch(() => {});
    }, 30000);
  }

  /**
   * Cập nhật trạng thái và độ trễ của tất cả Worker
   */
  async refreshAllWorkersHealth() {
    const workers = await this.getAllWorkers();
    for (const w of workers) {
      if (!w.isActive) continue;
      await this.pingWorker(w._id).catch(() => {});
    }
  }

  /**
   * Lấy danh sách toàn bộ Worker (từ MongoDB hoặc Cache)
   */
  async getAllWorkers() {
    try {
      if (isMongoAvailable()) {
        const Worker = getWorkerModel();
        const dbWorkers = await Worker.find().sort({ createdAt: 1 }).lean();
        this.cachedWorkers = dbWorkers;
        return dbWorkers;
      }
    } catch (e) {
      console.warn('[QueueDispatcher] Lỗi đọc Worker từ MongoDB:', e.message);
    }
    return this.cachedWorkers;
  }

  /**
   * Thêm Worker mới vào MongoDB
   */
  async addWorker({ name, url, secret }) {
    if (!url) throw new Error('Vui lòng nhập URL của Worker.');

    // Chuẩn hóa URL
    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch (e) {
      throw new Error('URL không hợp lệ. Vui lòng nhập đúng định dạng (vd: https://kingmc-worker.onrender.com).');
    }
    const cleanUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const cleanName = (name || '').trim() || `Worker-${Date.now().toString().slice(-4)}`;
    const cleanSecret = (secret || '').trim() || this.workerSecret;

    if (isMongoAvailable()) {
      const Worker = getWorkerModel();
      const existing = await Worker.findOne({ url: cleanUrl });
      if (existing) {
        throw new Error(`Worker với URL "${cleanUrl}" đã tồn tại trên hệ thống.`);
      }

      const newWorker = await Worker.create({
        name: cleanName,
        url: cleanUrl,
        secret: cleanSecret,
        isActive: true,
        status: 'unknown',
        latency: -1
      });

      // Ping ngay lập tức để lấy thông tin ban đầu
      this.pingWorker(newWorker._id).catch(() => {});
      await this.getAllWorkers();
      return newWorker;
    } else {
      const newWorker = {
        _id: `mem_${Date.now()}`,
        name: cleanName,
        url: cleanUrl,
        secret: cleanSecret,
        isActive: true,
        status: 'unknown',
        latency: -1
      };
      this.cachedWorkers.push(newWorker);
      return newWorker;
    }
  }

  /**
   * Cập nhật thông tin Worker
   */
  async updateWorker(id, updates) {
    if (isMongoAvailable()) {
      const Worker = getWorkerModel();
      const updated = await Worker.findByIdAndUpdate(id, updates, { returnDocument: 'after' }).lean();
      await this.getAllWorkers();
      return updated;
    } else {
      const idx = this.cachedWorkers.findIndex(w => String(w._id) === String(id));
      if (idx !== -1) {
        this.cachedWorkers[idx] = { ...this.cachedWorkers[idx], ...updates };
        return this.cachedWorkers[idx];
      }
      return null;
    }
  }

  /**
   * Bật/Tắt hoạt động của Worker
   */
  async toggleWorkerActive(id) {
    if (isMongoAvailable()) {
      const Worker = getWorkerModel();
      const worker = await Worker.findById(id);
      if (!worker) throw new Error('Không tìm thấy Worker.');
      worker.isActive = !worker.isActive;
      await worker.save();
      await this.getAllWorkers();
      return worker;
    } else {
      const worker = this.cachedWorkers.find(w => String(w._id) === String(id));
      if (!worker) throw new Error('Không tìm thấy Worker.');
      worker.isActive = !worker.isActive;
      return worker;
    }
  }

  /**
   * Xóa Worker khỏi hệ thống
   */
  async removeWorker(id) {
    if (isMongoAvailable()) {
      const Worker = getWorkerModel();
      const deleted = await Worker.findByIdAndDelete(id);
      if (!deleted) throw new Error('Không tìm thấy Worker để xóa.');
      await this.getAllWorkers();
      return deleted;
    } else {
      const idx = this.cachedWorkers.findIndex(w => String(w._id) === String(id));
      if (idx === -1) throw new Error('Không tìm thấy Worker để xóa.');
      const removed = this.cachedWorkers.splice(idx, 1);
      return removed[0];
    }
  }

  /**
   * Ping và kiểm tra sức khỏe của một Worker cụ thể
   */
  async pingWorker(id) {
    const workers = await this.getAllWorkers();
    const worker = workers.find(w => String(w._id) === String(id));
    if (!worker) throw new Error('Không tìm thấy Worker.');

    const startTime = Date.now();
    try {
      const health = await this.checkRemoteWorkerHealth(worker.url);
      const latency = Date.now() - startTime;

      let status = 'offline';
      let botUsername = '';
      let lastError = '';

      if (health && health.status === 'OK') {
        if (health.busy) {
          status = 'busy';
        } else if (health.online && health.ready) {
          status = 'online';
        } else {
          status = 'busy';
        }
        botUsername = health.username || '';
      } else {
        lastError = 'Không phản hồi đúng cấu trúc /health';
      }

      const updates = {
        status,
        latency: status !== 'offline' ? latency : -1,
        botUsername,
        lastHeartbeat: new Date(),
        lastError
      };

      await this.updateWorker(id, updates);
      return { success: true, ...updates };
    } catch (err) {
      const updates = {
        status: 'offline',
        latency: -1,
        lastHeartbeat: new Date(),
        lastError: err.message
      };
      await this.updateWorker(id, updates);
      return { success: false, ...updates };
    }
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
        const secret = worker.secret || this.workerSecret;
        return await this.executeRemoteWorker(worker.url, action, player, timeoutMs, secret);
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

    // 2. Lấy danh sách Worker đang kích hoạt (isActive === true)
    const workers = await this.getAllWorkers();
    const activeWorkers = workers.filter(w => w.isActive !== false);

    for (const w of activeWorkers) {
      if (this.busyWorkers.has(w.url)) continue;

      try {
        const status = await this.checkRemoteWorkerHealth(w.url);
        if (status && status.online && status.ready && !status.busy) {
          available.push({ 
            type: 'remote', 
            id: w._id,
            name: w.name || w.url, 
            url: w.url,
            secret: w.secret || this.workerSecret 
          });
        }
      } catch (e) {
        console.warn(`[QueueDispatcher] Không thể kết nối tới Remote Worker ${w.url}: ${e.message}`);
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

  // Kiểm tra Health của Remote Worker
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
  executeRemoteWorker(baseUrl, action, player, timeoutMs, secretOverride = null) {
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
            'x-worker-secret': secretOverride || this.workerSecret
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
   */
  async dispatchBatchTasks(action, players, timeoutMs = 15000, delayBetweenCommandsMs = 3000, onPlayerResult = null) {
    if (!players || players.length === 0) {
      return { total: 0, successCount: 0, failCount: 0, workerCount: 0, details: [] };
    }

    const uniquePlayers = Array.from(new Set(players.map(p => p.trim()).filter(p => p.length > 0)));

    // 1. Quét tìm tất cả các Worker đang Online & Sẵn sàng
    let activeWorkers = await this.getAvailableWorkers();

    if (activeWorkers.length === 0) {
      console.log('[QueueDispatcher] ⏳ Chưa có Worker nào rảnh, đang đợi 2 giây để quét lại...');
      await new Promise(r => setTimeout(r, 2000));
      activeWorkers = await this.getAvailableWorkers();
    }

    if (activeWorkers.length === 0) {
      if (this.localBot) {
        activeWorkers.push({ type: 'local', name: 'Local-Worker', url: 'local' });
      } else {
        const workers = await this.getAllWorkers();
        const firstActive = workers.find(w => w.isActive);
        if (firstActive) {
          activeWorkers.push({ 
            type: 'remote', 
            name: firstActive.name || firstActive.url, 
            url: firstActive.url,
            secret: firstActive.secret || this.workerSecret 
          });
        } else {
          throw new Error('Không tìm thấy bất kỳ Worker nào đang online hoặc sẵn sàng để kiểm tra.');
        }
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

        if (i < workerPlayers.length - 1 && delayBetweenCommandsMs > 0) {
          await new Promise(r => setTimeout(r, delayBetweenCommandsMs));
        }
      }
    });

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
        id: 'local',
        type: 'local',
        name: 'Local Worker',
        url: 'local',
        username: this.localBot.credentials?.username || 'N/A',
        online: this.localBot.isBotOnline,
        ready: this.localBot.isReady,
        busy: !this.localBot.isReady || !!this.localBot.targetPlayer || this.busyWorkers.has('local'),
        isActive: true,
        latency: 0,
        targetPlayer: this.localBot.targetPlayer || null
      });
    }

    // 2. Quét Remote Workers từ danh sách đã nạp
    const workers = await this.getAllWorkers();
    for (const w of workers) {
      list.push({
        id: w._id,
        type: 'remote',
        name: w.name || w.url,
        url: w.url,
        username: w.botUsername || 'N/A',
        online: w.status === 'online',
        ready: w.status === 'online',
        busy: w.status === 'busy' || this.busyWorkers.has(w.url),
        status: w.status || 'unknown',
        isActive: w.isActive !== false,
        latency: w.latency >= 0 ? w.latency : -1,
        lastHeartbeat: w.lastHeartbeat,
        lastError: w.lastError || ''
      });
    }

    return list;
  }

  // Gửi lệnh restart tới 1 Remote Worker qua API /api/restart
  restartRemoteWorker(baseUrl, secretOverride = null) {
    return new Promise((resolve, reject) => {
      try {
        const url = new URL('/api/restart', baseUrl);
        const transport = url.protocol === 'https:' ? https : http;

        const options = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-secret': secretOverride || this.workerSecret
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

  // Restart 1 worker theo ID
  async restartWorkerById(id) {
    if (id === 'local' && this.localBot) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let newName = '';
      for (let i = 0; i < 10; i++) newName += chars.charAt(Math.floor(Math.random() * chars.length));
      this.localBot.credentials.username = newName;
      this.localBot.credentials.password = newName;
      if (this.localBot.bot) {
        this.localBot.bot.end('Restart request from Master Dashboard');
      } else {
        this.localBot.scheduleReconnect();
      }
      return { success: true, username: newName };
    }

    const workers = await this.getAllWorkers();
    const worker = workers.find(w => String(w._id) === String(id));
    if (!worker) throw new Error('Không tìm thấy Worker.');

    const res = await this.restartRemoteWorker(worker.url, worker.secret);
    if (res && res.username) {
      await this.updateWorker(worker._id, { botUsername: res.username });
    }
    return res;
  }

  // Gửi lệnh restart tới toàn bộ Workers
  async restartAllWorkers() {
    const results = [];
    const workers = await this.getAllWorkers();

    if (this.localBot) {
      try {
        const res = await this.restartWorkerById('local');
        results.push({ type: 'local', name: 'Local Worker', success: true, username: res.username });
      } catch (e) {
        results.push({ type: 'local', name: 'Local Worker', success: false, error: e.message });
      }
    }

    for (const w of workers) {
      try {
        const res = await this.restartRemoteWorker(w.url, w.secret);
        results.push({ type: 'remote', name: w.name || w.url, success: true, username: res.username || 'RemoteBot' });
      } catch (e) {
        results.push({ type: 'remote', name: w.name || w.url, success: false, error: e.message });
      }
    }

    return results;
  }
}

module.exports = QueueDispatcher;
