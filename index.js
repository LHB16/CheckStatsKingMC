/**
 * index.js - Main Entrypoint for Discord Bot & Minecraft Worker Nodes
 * @description Hỗ trợ 3 chế độ hoạt động via BOT_ROLE:
 * - 'master': Chỉ chạy Discord Bot & Quản lý Hàng Đợi (Queue Dispatcher)
 * - 'worker': Chỉ chạy Minecraft Bot & Mở HTTP API Server tiếp nhận request từ Master
 * - 'standalone' (Mặc định): Chạy cả Discord Bot lẫn 1 Minecraft Bot local
 */

require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits } = require('discord.js');
const PersistentBot = require('./mc-bot');
const QueueDispatcher = require('./queue-dispatcher');
const CommandHandler = require('./handlers/commandHandler');
const { handleReportButtons } = require('./helpers/reportHelper');

// Cấu hình từ .env
const BOT_ROLE = (process.env.BOT_ROLE || 'standalone').toLowerCase();
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const WORKER_SECRET = process.env.WORKER_SECRET || '';

const MC_USERNAME = process.env.MC_USERNAME || 'StatsChecker';
const MC_AUTH_TYPE = process.env.MC_AUTH_TYPE || 'offline';
const MC_PASSWORD = process.env.MC_PASSWORD || '';
const MC_SERVER_PORT = parseInt(process.env.MC_SERVER_PORT) || 25565;

const MC_SERVER_HOSTS = (process.env.MC_SERVER_HOSTS || 'sgp.kingmc.vn,kingmc.vn')
  .split(',')
  .map(h => h.trim())
  .filter(h => h.length > 0);

console.log(`==================================================`);
console.log(`🚀 Bắt đầu khởi động hệ thống với Chế độ: [${BOT_ROLE.toUpperCase()}]`);
console.log(`==================================================`);

// 1. Khởi tạo Local Minecraft Bot (Nếu ở chế độ 'worker' hoặc 'standalone')
let localMcBot = null;
if (BOT_ROLE === 'worker' || BOT_ROLE === 'standalone') {
  const credentials = {
    username: MC_USERNAME,
    authType: MC_AUTH_TYPE,
    password: MC_PASSWORD
  };
  localMcBot = new PersistentBot(credentials, MC_SERVER_HOSTS, MC_SERVER_PORT);
  localMcBot.connect();
}

// 2. Khởi tạo HTTP Server (Health Check cho Render & Worker API endpoints)
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Endpoint kiểm tra Health Check
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const isOnline = localMcBot ? localMcBot.isBotOnline : true;
    const isReady = localMcBot ? localMcBot.isReady : true;
    const isBusy = localMcBot ? (!localMcBot.isReady || !!localMcBot.targetPlayer) : false;

    const healthStatus = {
      status: 'OK',
      role: BOT_ROLE,
      online: isOnline,
      ready: isReady,
      busy: isBusy,
      username: MC_USERNAME,
      timestamp: new Date().toISOString()
    };
    return res.end(JSON.stringify(healthStatus));
  }

  // Endpoint API thực thi lệnh dành cho Worker Node
  if (url.pathname === '/api/execute' && req.method === 'POST') {
    if (WORKER_SECRET) {
      const authHeader = req.headers['x-worker-secret'];
      if (authHeader !== WORKER_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Sai WORKER_SECRET' }));
      }
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { action, player, timeoutMs } = payload;

        if (!localMcBot || !localMcBot.isBotOnline || !localMcBot.isReady) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Worker Minecraft Bot chưa sẵn sàng (đang kết nối hoặc AFK setup)' }));
        }

        if (localMcBot.targetPlayer) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Worker Minecraft Bot đang bận' }));
        }

        let result;
        if (action === 'stats') {
          result = await localMcBot.getStats(player, timeoutMs || 15000);
        } else if (action === 'bal') {
          result = await localMcBot.getBalance(player, timeoutMs || 15000);
        } else if (action === 'order') {
          result = await localMcBot.getOrder(player, timeoutMs || 15000);
        } else if (action === 'ah') {
          result = await localMcBot.getAh(player, timeoutMs || 15000);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ success: false, error: 'Hành động không hợp lệ' }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[HTTP-Server] Đang lắng nghe trên cổng ${PORT} (${BOT_ROLE.toUpperCase()}).`);
});

// 3. Khởi tạo Discord Client & Queue Dispatcher (Nếu ở chế độ 'master' hoặc 'standalone')
if (BOT_ROLE === 'master' || BOT_ROLE === 'standalone') {
  const queueDispatcher = new QueueDispatcher();
  if (localMcBot) {
    queueDispatcher.setLocalBot(localMcBot);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  });

  const commandHandler = new CommandHandler(client, queueDispatcher);
  commandHandler.loadCommands();

  client.once('clientReady', async () => {
    console.log(`[Discord-Bot] Bot đã trực tuyến với tên: ${client.user.tag}`);
    await commandHandler.registerSlashCommands(DISCORD_TOKEN, CLIENT_ID, GUILD_ID);
  });

  client.on('interactionCreate', async (interaction) => {
    // Xử lý nút báo lỗi Admin
    const isReportHandled = await handleReportButtons(interaction, client);
    if (isReportHandled) return;

    // Xử lý Slash Commands
    await commandHandler.handleInteraction(interaction);
  });

  if (DISCORD_TOKEN && DISCORD_TOKEN !== 'your_discord_bot_token_here') {
    client.login(DISCORD_TOKEN);
  } else {
    console.error('[Discord-Bot] Chưa cấu hình DISCORD_TOKEN trong file .env!');
  }
}

// Bắt ngoại lệ để tránh crash process
process.on('uncaughtException', err => {
  console.error('[Process] Lỗi uncaughtException:', err);
});

process.on('unhandledRejection', reason => {
  console.error('[Process] Lỗi unhandledRejection:', reason);
});
