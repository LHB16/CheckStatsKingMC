/**
 * index.js - Main Entrypoint for Discord Bot & Minecraft Worker Nodes
 * @description Hỗ trợ 3 chế độ hoạt động via BOT_ROLE:
 * - 'master': Chỉ chạy Discord Bot & Quản lý Hàng Đợi (Queue Dispatcher)
 * - 'worker': Chỉ chạy Minecraft Bot & Mở HTTP API Server tiếp nhận request từ Master
 * - 'standalone' (Mặc định): Chạy cả Discord Bot lẫn 1 Minecraft Bot local
 */

require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const PersistentBot = require('./mc-bot');
const QueueDispatcher = require('./queue-dispatcher');
const CommandHandler = require('./handlers/commandHandler');
const { handleReportButtons, sendBanAlert } = require('./helpers/reportHelper');
const configHelper = require('./helpers/configHelper');

// Cấu hình từ .env
const BOT_ROLE = (process.env.BOT_ROLE || 'standalone').toLowerCase();
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const WORKER_SECRET = process.env.WORKER_SECRET || '';
const ADMIN_ID = (process.env.ADMIN_ID || '').trim(); // Dùng để cấu hình Admin ID chạy lệnh qua DM

const MC_USERNAME = process.env.MC_USERNAME || 'StatsChecker';
const MC_AUTH_TYPE = process.env.MC_AUTH_TYPE || 'offline';
const MC_PASSWORD = process.env.MC_PASSWORD || '';
const MC_SERVER_PORT = parseInt(process.env.MC_SERVER_PORT) || 25565;

const MC_SERVER_HOSTS = (process.env.MC_SERVER_HOSTS || 'sgp.kingmc.vn,kingmc.vn')
  .split(',')
  .map(h => h.trim())
  .filter(h => h.length > 0);

// Global Variables
global.isBotMaintenance = false;
global.maintenanceMessage = '';

console.log(`==================================================`);
console.log(`🚀 Bắt đầu khởi động hệ thống với Chế độ: [${BOT_ROLE.toUpperCase()}]`);
console.log(`==================================================`);

// Helper gen tên random
function generateRandomUsername(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

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
        } else if (action === 'online') {
          result = await localMcBot.getOnline(player, timeoutMs || 15000);
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
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
  });

  if (localMcBot) {
    localMcBot.on('banDetected', async (data) => {
      const { oldUsername, newUsername, password, reason } = data;
      console.warn(`[Index] Phát hiện bot bị BAN. Cũ: ${oldUsername}, Mới: ${newUsername}`);
      
      if (ADMIN_ID) {
         try {
           const adminUser = await client.users.fetch(ADMIN_ID);
           if (adminUser) {
             adminUser.send(`🚨 **CẢNH BÁO BAN TÀI KHOẢN** 🚨\n- **Bot cũ**: \`${oldUsername}\`\n- **Mật khẩu**: ||${password}||\n- **Lý do quét được**: \`${reason}\`\n- **Tên bot mới (đã tự động đổi)**: \`${newUsername}\`\nHệ thống đang tự động khởi động lại worker này.`);
           }
         } catch(e) {
           console.error('Không thể gửi DM cho Admin:', e);
         }
      } else {
         sendBanAlert(client, oldUsername, reason);
      }
    });
  }

  const commandHandler = new CommandHandler(client, queueDispatcher);
  commandHandler.loadCommands();

  client.once('clientReady', async () => {
    console.log(`[Discord-Bot] Bot đã trực tuyến với tên: ${client.user.tag}`);
    await commandHandler.registerSlashCommands(DISCORD_TOKEN, CLIENT_ID, GUILD_ID);
  });

  client.on('interactionCreate', async (interaction) => {
    // Chặn Slash Commands khi bảo trì
    if (global.isBotMaintenance && interaction.isChatInputCommand()) {
       if (!ADMIN_ID || interaction.user.id !== ADMIN_ID) {
          return interaction.reply({ content: `⚠️ **Bảo trì:** ${global.maintenanceMessage}`, ephemeral: true });
       }
    }

    // Xử lý nút báo lỗi Admin
    const isReportHandled = await handleReportButtons(interaction, client);
    if (isReportHandled) return;

    // Xử lý Slash Commands
    await commandHandler.handleInteraction(interaction);
  });

  // Lắng nghe lệnh qua DM hoặc Kênh chat (Admin)
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Log debug để dễ dàng kiểm tra
    if (message.content.startsWith('!')) {
      console.log(`[Admin-Debug] Nhận tin nhắn: "${message.content}" từ User ID: ${message.author.id} (Tên: ${message.author.tag}). ADMIN_ID hiện tại trong .env là: "${ADMIN_ID}"`);
    }

    // Kiểm tra ADMIN_ID nếu đã được cấu hình
    if (ADMIN_ID && message.author.id !== ADMIN_ID) {
      console.warn(`[Admin-Debug] Bỏ qua tin nhắn vì User ID (${message.author.id}) không khớp với ADMIN_ID (${ADMIN_ID}).`);
      return;
    }
    
    if (!message.content.startsWith('!')) return;
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'help') {
         await message.channel.send('**Danh sách lệnh Admin:**\n- `!status` hoặc `!workers`: Xem danh sách và trạng thái toàn bộ Workers (Local & Remote)\n- `!restart`: Random tên mới và khởi động lại bot ngay lập tức\n- `!mode` hoặc `!render`: Chuyển đổi chế độ hiển thị danh sách (Text / Image)\n- `!toggle off/on [lời nhắn]`: Bật/tắt việc nhận Slash Commands từ user khác.');
      } else if (command === 'mode' || command === 'render') {
         const targetMode = args.shift()?.toLowerCase();
         let newMode;
         if (targetMode === 'text' || targetMode === 'image') {
           newMode = configHelper.setDisplayMode(targetMode);
         } else {
           newMode = configHelper.toggleDisplayMode();
         }
         const modeDesc = newMode === 'image'
           ? '🖼️ **IMAGE** (Tạo bảng HTML 3D Icon 32x32px đính kèm Embed PNG)'
           : '📝 **TEXT** (Dòng chữ Embed truyền thống + Tên Item)';
         await message.channel.send(`✅ Đã chuyển đổi chế độ hiển thị danh sách sang: **${newMode.toUpperCase()}**\n${modeDesc}`);
      } else if (command === 'status' || command === 'workers') {
         const workers = await queueDispatcher.getAllWorkersStatus();
         if (workers.length === 0) {
           await message.channel.send('⚠️ Hiện chưa có Worker nào được cấu hình.');
           return;
         }

         let text = `📊 **DANH SÁCH WORKERS DANG HOẠT ĐỘNG (${workers.length}):**\n\n`;
         workers.forEach((w, idx) => {
           let statusStr = '';
           if (!w.online) {
             statusStr = '❌ **Offline**';
           } else if (!w.ready) {
             statusStr = '⏳ **Đang chuẩn bị / Đăng nhập**';
           } else if (w.busy) {
             statusStr = `🟡 **Đang bận** (Check: \`${w.targetPlayer || '?'}\`)`;
           } else {
             statusStr = '🟢 **Rảnh / Sẵn sàng**';
           }

           text += `**${idx + 1}. [${w.type.toUpperCase()}] ${w.name}**\n`;
           text += `   - Bot Username: \`${w.username}\`\n`;
           text += `   - Trạng thái: ${statusStr}\n`;
           if (w.error) text += `   - Lỗi: \`${w.error}\`\n`;
           text += '\n';
         });

         await message.channel.send(text);
      } else if (command === 'restart') {
         if (localMcBot) {
           const newName = generateRandomUsername(Math.floor(Math.random() * 7) + 8);
           localMcBot.credentials.username = newName;
           if (localMcBot.bot) localMcBot.bot.quit('Admin forced restart');
           else localMcBot.scheduleReconnect();
           await message.channel.send(`Đã đổi tên worker thành \`${newName}\` và bắt đầu khởi động lại.`);
         }
      } else if (command === 'toggle') {
         const sub = args.shift()?.toLowerCase();
         if (sub === 'off') {
            global.isBotMaintenance = true;
            global.maintenanceMessage = args.join(' ') || 'Hệ thống đang bảo trì, vui lòng quay lại sau.';
            await message.channel.send(`✅ Đã TẮT nhận lệnh. Lời nhắn: ${global.maintenanceMessage}`);
         } else if (sub === 'on') {
            global.isBotMaintenance = false;
            global.maintenanceMessage = '';
            await message.channel.send('✅ Đã BẬT nhận lệnh trở lại.');
         } else {
            await message.channel.send('Cú pháp: `!toggle on` hoặc `!toggle off [lời nhắn]`');
         }
      }
    } catch (cmdErr) {
      console.error('[Admin-Debug] Lỗi gửi tin nhắn trả lời:', cmdErr);
    }
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
