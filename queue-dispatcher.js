/**
 * queue-dispatcher.js - Quản lý Hàng Đợi (Task Queue) và Điều Phối Công Việc Nhiều Worker
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

class QueueDispatcher {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.workerUrls = (process.env.WORKER_URLS || '')
      .split(',')
      .map(u => u.trim())
      .filter(u => u.length > 0);
    this.workerSecret = process.env.WORKER_SECRET || '';
    
    // Node Worker địa phương (nếu ở chế độ standalone)
    this.localBot = null;
  }

  setLocalBot(bot) {
    this.localBot = bot;
  }

  // Thêm công việc vào hàng đợi
  enqueueTask(action, player, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const task = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        action, // 'stats' hoặc 'bal'
        player,
        timeoutMs,
        createdAt: Date.now(),
        resolve,
        reject
      };

      console.log(`[QueueDispatcher] Đã thêm tác vụ #${task.id} (${action} cho ${player}) vào hàng đợi. Vị trí hàng đợi: ${this.queue.length + 1}`);
      this.queue.push(task);

      // Thời gian chờ tối đa trong hàng đợi
      task.timer = setTimeout(() => {
        const index = this.queue.findIndex(t => t.id === task.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          console.warn(`[QueueDispatcher] Tác vụ #${task.id} bị Timeout trong Hàng đợi!`);
          reject(new Error(`Yêu cầu bị quá thời gian chờ (${timeoutMs / 1000}s) trong hàng đợi do tất cả các Bot đều đang bận hoặc đang đăng nhập.`));
        }
      }, timeoutMs + 10000);

      this.processQueue();
    });
  }

  // Xử lý hàng đợi
  async processQueue() {
    if (this.queue.length === 0) return;

    // Tìm một Worker đang rảnh và SẴN SÀNG (isReady = true)
    const availableWorker = await this.findAvailableWorker();
    if (!availableWorker) {
      // Không có worker rảnh/sẵn sàng, chờ đợt kiểm tra tiếp theo
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    clearTimeout(task.timer);
    console.log(`[QueueDispatcher] Bắt đầu thực thi tác vụ #${task.id} (${task.action} ${task.player}) trên Worker [${availableWorker.name}]...`);

    try {
      let result;
      if (availableWorker.type === 'local') {
        if (task.action === 'stats') {
          result = await this.localBot.getStats(task.player, task.timeoutMs);
        } else if (task.action === 'bal') {
          result = await this.localBot.getBalance(task.player, task.timeoutMs);
        }
      } else {
        result = await this.executeRemoteWorker(availableWorker.url, task.action, task.player, task.timeoutMs);
      }

      task.resolve(result);
    } catch (err) {
      console.error(`[QueueDispatcher] Thất bại tác vụ #${task.id} trên Worker [${availableWorker.name}]:`, err.message);
      task.reject(err);
    } finally {
      // Tiếp tục xử lý tác vụ tiếp theo trong hàng đợi nếu có
      setImmediate(() => this.processQueue());
    }
  }

  // Tìm Worker đang Rảnh & Sẵn Sàng (Idle, Online & isReady)
  async findAvailableWorker() {
    // 1. Ưu tiên kiểm tra Local Bot trước (nếu có và đã ready)
    if (this.localBot && this.localBot.isBotOnline && this.localBot.isReady && !this.localBot.targetPlayer) {
      return { type: 'local', name: 'Local-Worker' };
    }

    // 2. Kiểm tra các Remote Workers qua HTTP /health
    for (const baseUrl of this.workerUrls) {
      try {
        const status = await this.checkRemoteWorkerHealth(baseUrl);
        if (status && status.online && status.ready && !status.busy) {
          return { type: 'remote', name: baseUrl, url: baseUrl };
        }
      } catch (e) {
        console.warn(`[QueueDispatcher] Không thể kết nối tới Remote Worker ${baseUrl}: ${e.message}`);
      }
    }

    return null; // Không tìm thấy worker nào rảnh
  }

  // Kiểm tra Health của Remote Worker
  checkRemoteWorkerHealth(baseUrl) {
    return new Promise((resolve) => {
      const url = new URL('/health', baseUrl);
      const transport = url.protocol === 'https:' ? https : http;
      
      const req = transport.get(url.href, { timeout: 3000 }, (res) => {
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
    });
  }

  // Gửi lệnh thực thi tới Remote Worker API
  executeRemoteWorker(baseUrl, action, player, timeoutMs) {
    return new Promise((resolve, reject) => {
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
        timeout: timeoutMs + 2000
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
              reject(new Error(parsed.error || `Remote Worker trả về lỗi HTTP ${res.statusCode}`));
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
    });
  }
}

module.exports = QueueDispatcher;
