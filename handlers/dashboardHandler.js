/**
 * dashboardHandler.js - Xử lý REST API và Phục vụ Web UI Dashboard cho Master Node
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const trackerHelper = require('../helpers/trackerHelper');
const { getDiscordGuildModel, isMongoAvailable } = require('../helpers/mongoHelper');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Đọc body json từ request
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        const json = JSON.parse(body);
        resolve(json);
      } catch (e) {
        reject(new Error('Dữ liệu JSON không hợp lệ'));
      }
    });
    req.on('error', reject);
  });
}

// Trả về JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-worker-secret'
  });
  res.end(JSON.stringify(data));
  return true;
}

// Kiểm tra quyền xác thực qua WORKER_SECRET
function isAuthorized(req) {
  const masterSecret = process.env.WORKER_SECRET || '';
  if (!masterSecret) return true; // Nếu chưa đặt secret thì mở truy cập

  const secretHeader = req.headers['x-worker-secret'] || '';
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';

  return secretHeader === masterSecret || bearerToken === masterSecret;
}

/**
 * Đồng bộ danh sách Guilds từ Discord Client vào MongoDB
 */
async function syncDiscordGuilds(discordClient) {
  if (!discordClient || !discordClient.guilds) return [];

  const guilds = Array.from(discordClient.guilds.cache.values()).map(g => ({
    guildId: g.id,
    name: g.name,
    iconUrl: g.iconURL({ extension: 'png', size: 128 }) || null,
    memberCount: g.memberCount || 0,
    ownerId: g.ownerId || '',
    joinedAt: g.joinedAt || new Date(),
    isActive: true
  }));

  if (isMongoAvailable()) {
    try {
      const GuildModel = getDiscordGuildModel();
      for (const g of guilds) {
        await GuildModel.findOneAndUpdate(
          { guildId: g.guildId },
          { ...g, isActive: true },
          { upsert: true, returnDocument: 'after' }
        );
      }
    } catch (e) {
      console.warn('[DashboardHandler] Lỗi đồng bộ Guilds vào MongoDB:', e.message);
    }
  }

  return guilds;
}

/**
 * Xử lý chính các yêu cầu Dashboard API và Static Web UI
 */
async function handleDashboardRequest(req, res, context) {
  const { queueDispatcher, discordClient, runCheckCycle } = context;
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Xử lý CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-worker-secret'
    });
    res.end();
    return true;
  }

  // ==========================================
  // 1. AUTH API ROUTES
  // ==========================================
  if (pathname === '/api/auth/login' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const masterSecret = process.env.WORKER_SECRET || '';
      const providedSecret = (body.secret || '').trim();

      if (!masterSecret) {
        return sendJson(res, 200, {
          success: true,
          message: 'Hệ thống chưa đặt WORKER_SECRET. Đăng nhập mở.',
          token: 'no-secret-configured'
        });
      }

      if (providedSecret === masterSecret) {
        return sendJson(res, 200, {
          success: true,
          message: 'Đăng nhập thành công',
          token: masterSecret
        });
      } else {
        return sendJson(res, 401, {
          success: false,
          error: 'Mật khẩu bảo mật (WORKER_SECRET) không chính xác.'
        });
      }
    } catch (err) {
      return sendJson(res, 400, { success: false, error: err.message });
    }
  }

  if (pathname === '/api/auth/check' && method === 'GET') {
    const authorized = isAuthorized(req);
    return sendJson(res, authorized ? 200 : 401, {
      success: authorized,
      authenticated: authorized
    });
  }

  // ==========================================
  // KIỂM TRA BẢO MẬT CHO TẤT CẢ CÁC API KHÁC
  // ==========================================
  if (pathname.startsWith('/api/')) {
    if (!isAuthorized(req)) {
      return sendJson(res, 401, {
        success: false,
        error: 'Unauthorized: Bạn cần đăng nhập bằng WORKER_SECRET để thực hiện thao tác này.'
      });
    }

    // ==========================================
    // 2. OVERVIEW API ROUTE
    // ==========================================
    if (pathname === '/api/overview' && method === 'GET') {
      try {
        const workers = await queueDispatcher.getAllWorkersStatus();
        const activeWorkers = workers.filter(w => w.isActive !== false);
        const onlineWorkers = activeWorkers.filter(w => w.online);
        const busyWorkers = activeWorkers.filter(w => w.busy);

        const players = await trackerHelper.getAllPlayersDetailed();
        const activePlayers = players.filter(p => p.isTracking);
        const totalBalance = activePlayers.reduce((acc, cur) => acc + (cur.currentBalance || 0), 0);

        let guildsCount = 0;
        if (discordClient && discordClient.guilds) {
          guildsCount = discordClient.guilds.cache.size;
        } else if (isMongoAvailable()) {
          const GuildModel = getDiscordGuildModel();
          guildsCount = await GuildModel.countDocuments({ isActive: true });
        }

        return sendJson(res, 200, {
          success: true,
          data: {
            serverTime: new Date().toISOString(),
            uptimeSeconds: Math.floor(process.uptime()),
            botRole: process.env.BOT_ROLE || 'master',
            mongoConnected: isMongoAvailable(),
            queue: {
              length: queueDispatcher.queue.length,
              busyWorkersCount: queueDispatcher.busyWorkers.size,
              isProcessing: queueDispatcher.isProcessingQueue
            },
            workers: {
              total: workers.length,
              active: activeWorkers.length,
              online: onlineWorkers.length,
              busy: busyWorkers.length,
              offline: activeWorkers.length - onlineWorkers.length
            },
            trackers: {
              total: players.length,
              active: activePlayers.length,
              totalBalance,
              totalBalanceFormatted: `$${totalBalance.toLocaleString()}`
            },
            guilds: {
              total: guildsCount
            }
          }
        });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // ==========================================
    // 3. WORKERS API ROUTES
    // ==========================================
    if (pathname === '/api/workers' && method === 'GET') {
      try {
        const workers = await queueDispatcher.getAllWorkersStatus();
        return sendJson(res, 200, { success: true, data: workers });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    if (pathname === '/api/workers' && method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const newWorker = await queueDispatcher.addWorker(body);
        return sendJson(res, 201, {
          success: true,
          message: 'Đã thêm Worker thành công',
          data: newWorker
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // Các route /api/workers/:id/...
    const workerSubMatch = pathname.match(/^\/api\/workers\/([^/]+)(?:\/([^/]+))?$/);
    if (workerSubMatch) {
      const workerId = decodeURIComponent(workerSubMatch[1]);
      const action = workerSubMatch[2];

      // DELETE /api/workers/:id
      if (!action && method === 'DELETE') {
        try {
          const removed = await queueDispatcher.removeWorker(workerId);
          return sendJson(res, 200, {
            success: true,
            message: 'Đã xóa Worker thành công',
            data: removed
          });
        } catch (err) {
          return sendJson(res, 400, { success: false, error: err.message });
        }
      }

      // PUT /api/workers/:id/toggle
      if (action === 'toggle' && (method === 'PUT' || method === 'POST')) {
        try {
          const updated = await queueDispatcher.toggleWorkerActive(workerId);
          return sendJson(res, 200, {
            success: true,
            message: 'Đã chuyển đổi trạng thái Worker',
            data: updated
          });
        } catch (err) {
          return sendJson(res, 400, { success: false, error: err.message });
        }
      }

      // POST /api/workers/:id/ping
      if (action === 'ping' && method === 'POST') {
        try {
          const pingRes = await queueDispatcher.pingWorker(workerId);
          return sendJson(res, 200, { success: true, data: pingRes });
        } catch (err) {
          return sendJson(res, 400, { success: false, error: err.message });
        }
      }

      // POST /api/workers/:id/restart
      if (action === 'restart' && method === 'POST') {
        try {
          const restartRes = await queueDispatcher.restartWorkerById(workerId);
          return sendJson(res, 200, {
            success: true,
            message: 'Đã gửi lệnh restart tới Worker',
            data: restartRes
          });
        } catch (err) {
          return sendJson(res, 400, { success: false, error: err.message });
        }
      }
    }

    // POST /api/workers-restart-all
    if (pathname === '/api/workers-restart-all' && method === 'POST') {
      try {
        const results = await queueDispatcher.restartAllWorkers();
        return sendJson(res, 200, { success: true, data: results });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // ==========================================
    // 4. TRACKERS API ROUTES
    // ==========================================
    if (pathname === '/api/trackers' && method === 'GET') {
      try {
        const players = await trackerHelper.getAllPlayersDetailed();
        return sendJson(res, 200, { success: true, data: players });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    if (pathname === '/api/trackers' && method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const { playerName, initialBalance } = body;
        if (!playerName || !playerName.trim()) {
          return sendJson(res, 400, { success: false, error: 'Vui lòng cung cấp tên người chơi Minecraft.' });
        }
        const updated = await trackerHelper.setTracking(playerName.trim(), true, initialBalance);
        return sendJson(res, 201, {
          success: true,
          message: `Đã kích hoạt theo dõi số dư cho ${playerName.trim()}`,
          data: updated
        });
      } catch (err) {
        return sendJson(res, 400, { success: false, error: err.message });
      }
    }

    // POST /api/trackers/check-now
    if (pathname === '/api/trackers/check-now' && method === 'POST') {
      try {
        if (typeof runCheckCycle === 'function') {
          // Kích hoạt bất đồng bộ
          runCheckCycle().catch(e => console.error('[Dashboard] Lỗi chạy check cycle thủ công:', e.message));
          return sendJson(res, 200, {
            success: true,
            message: 'Đã bắt đầu chu kỳ quét số dư người chơi trong nền.'
          });
        } else {
          return sendJson(res, 400, { success: false, error: 'Tiến trình kiểm tra chưa sẵn sàng' });
        }
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // Các route /api/trackers/:key/...
    const trackerSubMatch = pathname.match(/^\/api\/trackers\/([^/]+)(?:\/([^/]+))?$/);
    if (trackerSubMatch) {
      const playerKey = decodeURIComponent(trackerSubMatch[1]);
      const action = trackerSubMatch[2];

      // DELETE /api/trackers/:key
      if (!action && method === 'DELETE') {
        try {
          const removed = await trackerHelper.removePlayer(playerKey);
          return sendJson(res, 200, {
            success: true,
            message: `Đã xóa người chơi "${playerKey}" khỏi danh sách theo dõi.`,
            data: removed
          });
        } catch (err) {
          return sendJson(res, 400, { success: false, error: err.message });
        }
      }

      // PUT /api/trackers/:key/toggle
      if (action === 'toggle' && (method === 'PUT' || method === 'POST')) {
        try {
          const updated = await trackerHelper.togglePlayerTracking(playerKey);
          return sendJson(res, 200, {
            success: true,
            message: 'Đã chuyển đổi trạng thái theo dõi người chơi',
            data: updated
          });
        } catch (err) {
          return sendJson(res, 400, { success: false, error: err.message });
        }
      }

      // GET /api/trackers/:key/history
      if (action === 'history' && method === 'GET') {
        try {
          const historyData = await trackerHelper.getPlayerHistory(playerKey);
          if (!historyData) {
            return sendJson(res, 404, { success: false, error: 'Không tìm thấy dữ liệu người chơi này' });
          }
          return sendJson(res, 200, { success: true, data: historyData });
        } catch (err) {
          return sendJson(res, 500, { success: false, error: err.message });
        }
      }
    }

    // ==========================================
    // 5. GUILDS API ROUTES
    // ==========================================
    if (pathname === '/api/guilds' && method === 'GET') {
      try {
        let guilds = [];
        if (discordClient && discordClient.guilds) {
          guilds = await syncDiscordGuilds(discordClient);
        } else if (isMongoAvailable()) {
          const GuildModel = getDiscordGuildModel();
          guilds = await GuildModel.find({ isActive: true }).sort({ memberCount: -1 }).lean();
        }
        return sendJson(res, 200, { success: true, data: guilds });
      } catch (err) {
        return sendJson(res, 500, { success: false, error: err.message });
      }
    }

    // API không tồn tại
    return sendJson(res, 404, { success: false, error: 'Endpoint API không tồn tại' });
  }

  // ==========================================
  // 6. PHỤC VỤ STATIC WEB UI (DASHBOARD)
  // ==========================================
  const distDir = path.join(__dirname, '../dashboard/dist');
  if (fs.existsSync(distDir)) {
    // Chuẩn hóa đường dẫn file tĩnh
    let relativePath = pathname;
    if (relativePath === '/' || relativePath === '/dashboard') {
      relativePath = '/index.html';
    }

    let filePath = path.join(distDir, relativePath);

    // Kiểm tra an toàn chống Directory Traversal
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return true;
    }

    // Nếu file có thật trên đĩa
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
      return true;
    }

    // Nếu không phải file trực tiếp (SPA routing như /workers, /tracker, /overview) -> trả về index.html
    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexPath).pipe(res);
      return true;
    }
  }

  return false; // Không thuộc dashboard handler, nhường cho index.js xử lý tiếp
}

module.exports = {
  handleDashboardRequest,
  syncDiscordGuilds
};
