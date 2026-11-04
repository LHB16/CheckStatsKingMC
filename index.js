/**
 * index.js - Main Entrypoint for Discord Bot & Minecraft Worker Nodes
 * @description Hỗ trợ 3 chế độ hoạt động via BOT_ROLE:
 * - 'master': Chỉ chạy Discord Bot & Quản lý Hàng Đợi (Queue Dispatcher)
 * - 'worker': Chỉ chạy Minecraft Bot & Mở HTTP API Server tiếp nhận request từ Master
 * - 'standalone' (Mặc định): Chạy cả Discord Bot lẫn 1 Minecraft Bot local
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const PersistentBot = require('./mc-bot');
const skinHelper = require('./helpers/skinHelper');
const { connectMongo, isMongoAvailable, getSystemConfig, setSystemConfig } = require('./helpers/mongoHelper');

// Tự động nhận diện môi trường Wispbyte (/home/container)
const IS_WISPBYTE_CONTAINER = fs.existsSync('/home/container') || process.env.IS_WISPBYTE === 'true';

// Cấu hình từ .env (nếu chạy trên Wispbyte mà chưa đặt DISCORD_TOKEN thì mặc định là 'worker')
const defaultRole = (IS_WISPBYTE_CONTAINER && !process.env.DISCORD_TOKEN) ? 'worker' : 'standalone';
const BOT_ROLE = (process.env.BOT_ROLE || defaultRole).toLowerCase();
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const WORKER_SECRET = process.env.WORKER_SECRET || '';
const ADMIN_ID = (process.env.ADMIN_ID || '1056490968343396352').trim(); // Dùng để cấu hình Admin ID chạy lệnh qua DM

// Danh sách các Master URL ứng viên để tự động dò tìm Active Leader qua HTTPS (cổng 443) khi không dùng MongoDB (cổng 27017)
const DEFAULT_MASTER_URLS = [
  'https://checkstatskingmc-master-02.onrender.com',
  'https://checkstatskingmc-master-01.onrender.com'
];
let cachedLeaderMasterUrl = '';
let lastMasterProbeTime = 0;

/**
 * Lấy Master URL hiệu dụng:
 * 1. Nếu có kết nối MongoDB Atlas -> lấy trực tiếp từ system_configs.master_url
 * 2. Nếu chạy trên Wispbyte (chặn cổng 27017) -> Tự động quét /health qua HTTPS (cổng 443)
 *    giữa các Master để tìm đúng Master đang là Active Leader (isLeader: true)
 */
async function getEffectiveMasterUrl() {
  if (isMongoAvailable()) {
    try {
      const dbUrl = await getSystemConfig('master_url', null);
      if (dbUrl && String(dbUrl).startsWith('http')) return String(dbUrl).trim();
    } catch (e) {}
  }

  const now = Date.now();
  if (cachedLeaderMasterUrl && now - lastMasterProbeTime < 25000) {
    return cachedLeaderMasterUrl;
  }

  const rawCandidates = [
    ...(process.env.MASTER_URLS || '').split(','),
    process.env.MASTER_URL || '',
    process.env.RENDER_EXTERNAL_URL || '',
    ...DEFAULT_MASTER_URLS
  ]
    .map(u => u.trim().replace(/\/+$/, ''))
    .filter(u => u.startsWith('http'));

  const candidates = Array.from(new Set(rawCandidates));
  if (candidates.length === 0) return '';

  let fallbackReachable = '';
  for (const baseUrl of candidates) {
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(4500)
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (!fallbackReachable) fallbackReachable = baseUrl;
        if (data && data.isLeader === true) {
          if (cachedLeaderMasterUrl !== baseUrl) {
            console.log(`🛰️ [Satellite-Worker] Đã xác định Active Master Leader qua HTTPS: ${baseUrl}`);
          }
          cachedLeaderMasterUrl = baseUrl;
          lastMasterProbeTime = now;
          return baseUrl;
        }
      }
    } catch (e) {
      // Thử candidate tiếp theo
    }
  }

  cachedLeaderMasterUrl = fallbackReachable || candidates[0];
  lastMasterProbeTime = now;
  return cachedLeaderMasterUrl;
}

// Chỉ nạp các module nặng của Master / Discord khi không phải là Worker thuần túy
let Client, GatewayIntentBits, Partials;
let QueueDispatcher, CommandHandler, handleReportButtons, sendBanAlert, configHelper;
let handleAiChatMessage, handleMathMessage, isMathExpression, trackerHelper;
let handleTrackerButtons, buildTrackerOverviewMessage, handlePaginationButtons;
let getCustomEmoji, handleDashboardRequest, syncDiscordGuilds, renderManager, wispbyteManager, masterElection;

if (BOT_ROLE === 'master' || BOT_ROLE === 'standalone') {
  ({ Client, GatewayIntentBits, Partials } = require('discord.js'));
  QueueDispatcher = require('./queue-dispatcher');
  CommandHandler = require('./handlers/commandHandler');
  ({ handleReportButtons, sendBanAlert } = require('./helpers/reportHelper'));
  configHelper = require('./helpers/configHelper');
  ({ handleAiChatMessage } = require('./handlers/aiChatHandler'));
  ({ handleMathMessage, isMathExpression } = require('./handlers/mathHandler'));
  trackerHelper = require('./helpers/trackerHelper');
  ({ handleTrackerButtons, buildTrackerOverviewMessage } = require('./handlers/trackerButtonHandler'));
  ({ handlePaginationButtons } = require('./helpers/paginationHelper'));
  ({ getCustomEmoji } = require('./helpers/utils'));
  ({ handleDashboardRequest, syncDiscordGuilds } = require('./handlers/dashboardHandler'));
  renderManager = require('./helpers/renderManager');
  wispbyteManager = require('./helpers/wispbyteManager');
  masterElection = require('./helpers/masterElection');
}

// Cấu hình định danh Vệ tinh (Satellite Worker cho Wispbyte)
const SATELLITE_MODE =
  process.env.SATELLITE_MODE === 'true' ||
  IS_WISPBYTE_CONTAINER ||
  (BOT_ROLE === 'worker' && !process.env.RENDER_EXTERNAL_URL && !process.env.RENDER_SERVICE_ID);
const RAW_HOST_ID = (process.env.WORKER_ID || process.env.P_SERVER_UUID || os.hostname() || '').replace(/[^a-zA-Z0-9_-]/g, '');
const SATELLITE_WORKER_ID = RAW_HOST_ID ? RAW_HOST_ID.slice(0, 12) : Math.random().toString(36).substring(2, 8);
const SATELLITE_WORKER_NAME = (process.env.WORKER_NAME || `Wispbyte-${SATELLITE_WORKER_ID}`).trim();

const MC_AUTH_TYPE = process.env.MC_AUTH_TYPE || 'offline';
const MC_SERVER_PORT = parseInt(process.env.MC_SERVER_PORT) || 25565;
const BOT_CHECK_TIMEOUT = parseInt(process.env.BOT_CHECK_TIMEOUT) || 15000;

const MC_SERVER_HOSTS = (process.env.MC_SERVER_HOSTS || 'sgp.kingmc.vn,kingmc.vn')
  .split(',')
  .map(h => h.trim())
  .filter(h => h.length > 0);

// Global Variables
global.isBotMaintenance = false;
global.maintenanceMessage = '';
global.isAiChatEnabled = false; // Mặc định TẮT tính năng AI Chat
global.aiDisableReason = 'Tính năng trò chuyện AI hiện đang tạm tắt bởi Admin.';
global.globalDiscordClient = null;
global.runTrackerCheckCycle = null;


console.log(`==================================================`);
console.log(`🚀 Bắt đầu khởi động hệ thống với Chế độ: [${BOT_ROLE.toUpperCase()}]`);
console.log(`==================================================`);

// Helper gen chuỗi ngẫu nhiên 10 ký tự (chữ hoa, chữ thường, số)
function generateRandomUsername(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Gửi tin nhắn an toàn (tự động chia nhỏ văn bản nếu vượt quá 1900 ký tự)
 */
async function safeSend(channel, payload) {
  if (typeof payload === 'string') {
    if (payload.length <= 1900) {
      return await channel.send(payload);
    }
    const chunks = [];
    let remaining = payload;
    while (remaining.length > 0) {
      if (remaining.length <= 1900) {
        chunks.push(remaining);
        break;
      }
      let splitIdx = remaining.lastIndexOf('\n', 1900);
      if (splitIdx === -1 || splitIdx < 500) splitIdx = 1900;
      chunks.push(remaining.substring(0, splitIdx));
      remaining = remaining.substring(splitIdx).trimStart();
    }
    for (const chunk of chunks) {
      await channel.send(chunk);
    }
    return;
  }
  return await channel.send(payload);
}

// Đường dẫn file lưu trữ tài khoản & mật khẩu Bot để tái sử dụng qua các lần khởi động lại (tránh bị khóa 100 acc/IP)
const BOT_CREDENTIALS_FILE = path.join(__dirname, 'data', 'bot_credentials.json');
const WORKER_CRED_CONFIG_KEY = 'bot_cred_' + (process.env.RENDER_SERVICE_ID || SATELLITE_WORKER_ID || 'local').replace(/[^a-zA-Z0-9_-]/g, '');

function saveBotCredentials(creds, syncMongo = true) {
  if (!creds || !creds.username || !creds.password) return;
  const payload = {
    username: creds.username,
    password: creds.password,
    authType: creds.authType || MC_AUTH_TYPE,
    updatedAt: new Date().toISOString()
  };
  try {
    const dir = path.dirname(BOT_CREDENTIALS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BOT_CREDENTIALS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (err) {
    console.warn(`[Worker] ⚠️ Không thể lưu thông tin tài khoản bot xuống file: ${err.message}`);
  }
  if (syncMongo && isMongoAvailable()) {
    setSystemConfig(WORKER_CRED_CONFIG_KEY, payload, `Saved Bot Credentials (${SATELLITE_WORKER_NAME || BOT_ROLE})`).catch(() => {});
  }
}

function loadSavedBotCredentials() {
  if (process.env.MC_USERNAME && process.env.MC_PASSWORD && process.env.MC_USERNAME !== 'your_minecraft_username') {
    return {
      username: process.env.MC_USERNAME.trim(),
      password: process.env.MC_PASSWORD.trim(),
      authType: MC_AUTH_TYPE,
      fromPersistent: true
    };
  }
  try {
    if (fs.existsSync(BOT_CREDENTIALS_FILE)) {
      const raw = fs.readFileSync(BOT_CREDENTIALS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username && parsed.password) {
        return {
          username: String(parsed.username).trim(),
          password: String(parsed.password).trim(),
          authType: parsed.authType || MC_AUTH_TYPE,
          fromPersistent: true
        };
      }
    }
  } catch (err) {
    console.warn(`[Worker] ⚠️ Lỗi đọc file bot_credentials.json: ${err.message}`);
  }
  return null;
}

// 1. Khởi tạo Local Minecraft Bot (Nếu ở chế độ 'worker' hoặc 'standalone')
let localMcBot = null;
let hasInitialSavedCreds = false;
if (BOT_ROLE === 'worker' || BOT_ROLE === 'standalone') {
  const savedCreds = loadSavedBotCredentials();
  hasInitialSavedCreds = Boolean(savedCreds);

  const credentials = savedCreds ? {
    username: savedCreds.username,
    authType: savedCreds.authType || MC_AUTH_TYPE,
    password: savedCreds.password
  } : {
    username: generateRandomUsername(10),
    authType: MC_AUTH_TYPE,
    password: generateRandomUsername(10)
  };

  if (hasInitialSavedCreds) {
    console.log(`[Worker] ♻️ Khôi phục tài khoản Minecraft Bot đã lưu: Username [${credentials.username}] và Password [${credentials.password}]`);
  } else {
    console.log(`[Worker] 🆕 Khởi tạo tài khoản Minecraft Bot lần đầu: Username [${credentials.username}] và Password [${credentials.password}]`);
    saveBotCredentials(credentials, false);
  }

  localMcBot = new PersistentBot(credentials, MC_SERVER_HOSTS, MC_SERVER_PORT);

  // Tự động lưu lại tài khoản mới nếu Bot bị Ban trong game và tự đổi tên
  localMcBot.on('banDetected', () => {
    if (localMcBot && localMcBot.credentials) {
      console.log(`[Worker] 💾 Đã lưu tài khoản Bot mới sau khi bị Ban: [${localMcBot.credentials.username}]`);
      saveBotCredentials(localMcBot.credentials, true);
    }
  });
  
  localMcBot.on('notifyAdmin', async (message) => {
    const MASTER_URL = await getEffectiveMasterUrl();
    if (BOT_ROLE === 'standalone' && global.globalDiscordClient && ADMIN_ID) {
      try {
        const adminUser = await global.globalDiscordClient.users.fetch(ADMIN_ID);
        if (adminUser) adminUser.send(message);
      } catch (e) {}
    } else if (MASTER_URL) {
      const targetUrl = new URL('/api/notify', MASTER_URL);
      const transport = targetUrl.protocol === 'https:' ? require('https') : require('http');
      const reqNotify = transport.request(targetUrl.href, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': WORKER_SECRET || ''
        }
      });
      reqNotify.on('error', (err) => console.error(`[Worker] Lỗi gửi notify về Master: ${err.message}`));
      reqNotify.write(JSON.stringify({ message }));
      reqNotify.end();
    } else if (BOT_ROLE === 'worker') {
      console.log(`[Worker-Notify] Cần thông báo nhưng thiếu MASTER_URL: ${message}`);
    }
  });

  localMcBot.on('ipLimitDetected', async ({ username, reason }) => {
    console.warn(`[Worker] 🚨 Nhận tín hiệu ipLimitDetected: [${username}] - Lý do: [${reason}]`);
    const isRenderWorker = Boolean(
      process.env.RENDER_SERVICE_ID ||
      process.env.RENDER_ACCOUNT_ID ||
      process.env.RENDER_EXTERNAL_URL
    );

    // Nếu là Wispbyte / Satellite Worker (không phải Render), không gọi API xóa service của Render
    if (BOT_ROLE === 'worker' && !isRenderWorker) {
      console.warn(`[Satellite-Worker] 🛡️ Worker vệ tinh [${SATELLITE_WORKER_NAME}] dính giới hạn IP. Sẽ chỉ đổi tên tài khoản mới và kết nối lại (không xoay Render).`);
      return;
    }

    const MASTER_URL = await getEffectiveMasterUrl();
    if (MASTER_URL) {
      try {
        const targetUrl = new URL('/api/worker-ip-limit', MASTER_URL);
        const transport = targetUrl.protocol === 'https:' ? require('https') : require('http');
        const payload = JSON.stringify({
          accountId: process.env.RENDER_ACCOUNT_ID || '',
          serviceId: process.env.RENDER_SERVICE_ID || '',
          serviceName: process.env.RENDER_SERVICE_NAME || '',
          username,
          reason,
          workerUrl: process.env.RENDER_EXTERNAL_URL || process.env.WORKER_URL || ''
        });
        const reqLimit = transport.request(targetUrl.href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-secret': WORKER_SECRET || ''
          }
        }, (resLimit) => {
          let resBody = '';
          resLimit.on('data', chunk => resBody += chunk);
          resLimit.on('end', () => {
            console.log(`[Worker] 📡 Kết quả gửi ipLimitDetected về Master: HTTP ${resLimit.statusCode} - ${resBody}`);
          });
        });
        reqLimit.on('error', (err) => console.error(`[Worker] Lỗi gửi ipLimitDetected về Master: ${err.message}`));
        reqLimit.write(payload);
        reqLimit.end();
      } catch (err) {
        console.error(`[Worker] Lỗi gửi ipLimitDetected: ${err.message}`);
      }
    } else if (BOT_ROLE === 'standalone') {
      renderManager.rotateWorker({
        workerUrl: process.env.RENDER_EXTERNAL_URL || 'standalone',
        reason,
        username,
        queueDispatcher,
        discordClient: global.globalDiscordClient,
        adminId: ADMIN_ID
      }).catch(e => console.error('[Standalone] Lỗi xoay worker:', e.message));
    }
  });

  localMcBot.connect();
}

/**
 * Vòng lặp kết nối Vệ tinh (Satellite Worker Loop) dành cho Wispbyte
 * Chủ động kết nối chiều đi (Outbound Long-Polling) tới Master để nhận việc mà không cần mở Port hay Domain
 */
async function startSatelliteClientLoop() {
  if (BOT_ROLE !== 'worker' || !SATELLITE_MODE || !localMcBot) return;

  console.log(`🛰️ [Satellite-Worker] Đã kích hoạt chế độ Vệ tinh cho [${SATELLITE_WORKER_NAME}] (ID: ${SATELLITE_WORKER_ID})`);

  async function executeLocalTask(action, player, timeoutMs) {
    if (!localMcBot || !localMcBot.isBotOnline || !localMcBot.isReady) {
      throw new Error('Satellite Worker Minecraft Bot chưa sẵn sàng');
    }
    if (localMcBot.targetPlayer) {
      throw new Error('Satellite Worker Minecraft Bot đang bận');
    }

    if (action === 'stats') return await localMcBot.getStats(player, timeoutMs || 15000);
    if (action === 'bal') return await localMcBot.getBalance(player, timeoutMs || 15000);
    if (action === 'order') return await localMcBot.getOrder(player, timeoutMs || 15000);
    if (action === 'ah') return await localMcBot.getAh(player, timeoutMs || 15000);
    if (action === 'online') return await localMcBot.getOnline(player, timeoutMs || 15000);
    if (action === 'leaderboard' || action === 'lb') return await localMcBot.getLeaderboard(player, timeoutMs || 20000);
    if (action === 'bounty') return await localMcBot.getBounty(player, timeoutMs || 15000);
    throw new Error(`Hành động không hợp lệ: ${action}`);
  }

  let isRunningTask = false;
  let warnedMissingMasterUrl = false;

  while (true) {
    try {
      const masterUrl = await getEffectiveMasterUrl();
      if (!masterUrl || !masterUrl.startsWith('http')) {
        if (!warnedMissingMasterUrl) {
          warnedMissingMasterUrl = true;
          console.warn('[Satellite-Worker] ⚠️ Chưa lấy được MASTER_URL (do chưa điền MASTER_URL trong .env và chưa kết nối được MongoDB Atlas). Hãy điền MASTER_URL=https://... vào file .env hoặc bật 0.0.0.0/0 trong Network Access của MongoDB Atlas.');
        }
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      warnedMissingMasterUrl = false;

      const pollUrl = new URL('/api/satellite/poll', masterUrl).href;
      const isOnline = Boolean(localMcBot.isBotOnline);
      const isReady = Boolean(localMcBot.isReady);
      const isBusy = Boolean(!localMcBot.isReady || localMcBot.targetPlayer || isRunningTask);

      const res = await fetch(pollUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-worker-secret': WORKER_SECRET || ''
        },
        body: JSON.stringify({
          workerId: SATELLITE_WORKER_ID,
          name: SATELLITE_WORKER_NAME,
          username: localMcBot.credentials?.username || 'N/A',
          online: isOnline,
          ready: isReady,
          busy: isBusy,
          targetPlayer: localMcBot.targetPlayer || null
        })
      });

      if (!res.ok) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }

      const data = await res.json().catch(() => ({}));

      // 1. Nếu Master gửi lệnh restart (giữ nguyên tài khoản & mật khẩu cũ để tránh bị khóa 100 acc/IP)
      if (data.command === 'restart') {
        saveBotCredentials(localMcBot.credentials, true);
        console.log(`[Satellite-Worker] 🔄 Nhận lệnh restart từ Master. Giữ nguyên tài khoản cũ: [${localMcBot.credentials.username}]`);
        if (localMcBot.bot) {
          localMcBot.bot.end('Satellite remote restart request');
        } else {
          localMcBot.scheduleReconnect();
        }
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // 2. Nếu Master giao tác vụ
      if (data.task && data.task.taskId) {
        const { taskId, action, player, timeoutMs } = data.task;
        console.log(`[Satellite-Worker] 🚀 Nhận tác vụ #${taskId}: [${action}] cho "${player}" từ Master...`);
        isRunningTask = true;

        (async () => {
          let taskSuccess = false;
          let taskResult = null;
          let taskError = '';

          try {
            taskResult = await executeLocalTask(action, player, timeoutMs);
            taskSuccess = true;
          } catch (err) {
            taskError = err.message;
          } finally {
            isRunningTask = false;
          }

          try {
            const resultUrl = new URL('/api/satellite/result', masterUrl).href;
            await fetch(resultUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-worker-secret': WORKER_SECRET || ''
              },
              body: JSON.stringify({
                taskId,
                workerId: SATELLITE_WORKER_ID,
                success: taskSuccess,
                result: taskResult,
                error: taskError
              })
            });
          } catch (postErr) {
            console.error(`[Satellite-Worker] ❌ Lỗi gửi kết quả tác vụ #${taskId} về Master:`, postErr.message);
          }
        })();

        // Đợi ngắn rồi tiếp tục poll trạng thái bận
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // Nếu đang chưa sẵn sàng hoặc bận thì nghỉ 2.5s giữa các nhịp Heartbeat
      if (!isOnline || !isReady || isBusy) {
        await new Promise(r => setTimeout(r, 2500));
      } else {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }
}

// Khởi tạo Queue Dispatcher sớm cho Master / Standalone
let queueDispatcher = null;
if (BOT_ROLE === 'master' || BOT_ROLE === 'standalone') {
  queueDispatcher = new QueueDispatcher();
  if (localMcBot) {
    queueDispatcher.setLocalBot(localMcBot);
  }
}

// Tự động đồng bộ Master URL tới Google Apps Script Keep-Alive
async function syncMasterKeepalive() {
  if (BOT_ROLE !== 'master' && BOT_ROLE !== 'standalone') return;
  try {
    const masterUrl = (await getSystemConfig('master_url', null)) || process.env.RENDER_EXTERNAL_URL || process.env.MASTER_URL || '';
    if (masterUrl && masterUrl.startsWith('http')) {
      await renderManager.notifyGoogleAppsScript('add', masterUrl, { isMaster: true });
    }
  } catch (err) {
    console.warn('[KeepAlive] Không thể tự động đồng bộ Master URL với Google Apps Script:', err.message);
  }
}

// Kết nối MongoDB tập trung sớm và nạp Worker (Tự động bỏ qua cổng 27017 trên Wispbyte Worker để tránh bị firewall chặn)
const shouldSkipMongoOnWispbyte = IS_WISPBYTE_CONTAINER && BOT_ROLE === 'worker' && process.env.ENABLE_MONGO_ON_WISPBYTE !== 'true';

if (shouldSkipMongoOnWispbyte) {
  console.log('[Satellite-Worker] ℹ️ Đang chạy trên Wispbyte Container: Bỏ qua kết nối cổng 27017 MongoDB, sử dụng kết nối HTTPS (cổng 443) trực tiếp tới Master.');
  skinHelper.initSkinHelper({ skipMongo: true }).catch(() => {});
  startSatelliteClientLoop().catch(err => console.error('[Satellite-Worker] Lỗi vòng lặp:', err.message));
} else {
  connectMongo().then(async (connected) => {
    skinHelper.initSkinHelper().catch(e => console.warn('[SkinHelper] Lỗi khởi tạo:', e.message));
    if (connected) {
      if (localMcBot) {
        if (!hasInitialSavedCreds) {
          const mongoCreds = await getSystemConfig(WORKER_CRED_CONFIG_KEY, null);
          if (mongoCreds && mongoCreds.username && mongoCreds.password) {
            localMcBot.credentials.username = mongoCreds.username;
            localMcBot.credentials.password = mongoCreds.password;
            saveBotCredentials(localMcBot.credentials, false);
            console.log(`[Worker] ♻️ Đã đồng bộ khôi phục tài khoản Bot từ MongoDB: [${mongoCreds.username}]`);
            if (localMcBot.bot) {
              localMcBot.bot.end('Sync credentials from MongoDB');
            }
          } else {
            saveBotCredentials(localMcBot.credentials, true);
          }
        } else {
          saveBotCredentials(localMcBot.credentials, true);
        }
      }
      if (configHelper) {
        await configHelper.syncFromMongo();
      }
      if (queueDispatcher) {
        await queueDispatcher.initWorkers();
      }
      syncMasterKeepalive().catch(() => {});
    }
    startSatelliteClientLoop().catch(err => console.error('[Satellite-Worker] Lỗi vòng lặp:', err.message));
  }).catch(err => {
    console.warn('[MongoHelper] Lỗi khởi tạo MongoDB ban đầu:', err.message);
    skinHelper.initSkinHelper({ skipMongo: true }).catch(() => {});
    startSatelliteClientLoop().catch(e => console.error('[Satellite-Worker] Lỗi vòng lặp:', e.message));
  });
}

// Bộ lắng nghe lệnh trực tiếp từ Console (Hỗ trợ gõ /tatchat, /batchat, /restart trên Wispbyte Console)
if (process.stdin && typeof process.stdin.on === 'function') {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (rawInput) => {
    const input = String(rawInput || '').trim();
    if (!input) return;
    const lower = input.toLowerCase();

    if (lower === '/tatchat' || lower === 'tatchat') {
      if (localMcBot) {
        localMcBot.showChatLog = !localMcBot.showChatLog;
        console.log(`[Console] ${localMcBot.showChatLog ? '🔊 Đã BẬT' : '🔇 Đã TẮT'} hiển thị tin nhắn [MC-Bot Chat] trên Console.`);
      }
      return;
    }

    if (lower === '/batchat' || lower === 'batchat') {
      if (localMcBot) {
        localMcBot.showChatLog = true;
        console.log('[Console] 🔊 Đã BẬT hiển thị tin nhắn [MC-Bot Chat] trên Console.');
      }
      return;
    }

    if (lower === '/restart' || lower === 'restart') {
      if (localMcBot) {
        saveBotCredentials(localMcBot.credentials, true);
        console.log(`[Console] 🔄 Đang khởi động lại kết nối Minecraft Bot (giữ nguyên tài khoản [${localMcBot.credentials.username}])...`);
        if (localMcBot.bot) {
          localMcBot.bot.end('Console manual restart');
        } else {
          localMcBot.scheduleReconnect();
        }
      }
      return;
    }

    if (lower === '/resetacc' || lower === 'resetacc') {
      if (localMcBot) {
        const newName = generateRandomUsername(10);
        localMcBot.credentials.username = newName;
        localMcBot.credentials.password = generateRandomUsername(10);
        saveBotCredentials(localMcBot.credentials, true);
        console.log(`[Console] 🆕 Đã tạo tài khoản mới và lưu lại: [${newName}]...`);
        if (localMcBot.bot) {
          localMcBot.bot.end('Console manual resetacc');
        } else {
          localMcBot.scheduleReconnect();
        }
      }
      return;
    }

    // Cho phép gõ lệnh trực tiếp vào game nếu bắt đầu bằng dấu /
    if (input.startsWith('/') && localMcBot && localMcBot.bot && localMcBot.isBotOnline) {
      console.log(`[Console] 💬 Gửi lệnh vào game: ${input}`);
      localMcBot.bot.chat(input);
    }
  });
}

// 2. Khởi tạo HTTP Server (Health Check cho Render & Worker API endpoints & Dashboard Web UI)
const PORT = parseInt(process.env.SERVER_PORT || process.env.PORT) || 3000;
const HOST = '0.0.0.0';

// Bộ nhớ đệm giới hạn IP (Rate Limiter)
const ipRateLimitMap = new Map();

// Tự động dọn dẹp bộ nhớ đệm IP mỗi 10 giây
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRateLimitMap.entries()) {
    if (now - data.startTime > 10000) {
      ipRateLimitMap.delete(ip);
    }
  }
}, 10000);

const server = http.createServer(async (req, res) => {

  // --- IP Rate Limiting (Chống Spam/DDoS Lớp 7) ---
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const authSecret = req.headers['x-worker-secret'];
  
  // NẾU CÓ KHÓA BÍ MẬT HỢP LỆ (TỪ MASTER GỬI TỚI) -> BỎ QUA RATE LIMIT
  const isMaster = WORKER_SECRET && authSecret === WORKER_SECRET;

  if (clientIp && !isMaster) {
    const now = Date.now();
    let rateData = ipRateLimitMap.get(clientIp);
    
    if (!rateData) {
      rateData = { count: 1, startTime: now };
      ipRateLimitMap.set(clientIp, rateData);
    } else {
      if (now - rateData.startTime < 10000) { // Khung thời gian: 10 giây
        rateData.count++;
        if (rateData.count > 20) { // Giới hạn: Tối đa 20 requests / 10 giây
          res.writeHead(429, { 'Content-Type': 'text/plain' });
          return res.end('429 Too Many Requests: Bạn đang spam quá nhanh!');
        }
      } else {
        // Hết khung 10s, reset lại bộ đếm
        rateData.count = 1;
        rateData.startTime = now;
      }
    }
  }
  // --- Kết thúc Rate Limiting ---

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Endpoint kiểm tra Health Check
  if (url.pathname === '/health' || (BOT_ROLE === 'worker' && url.pathname === '/')) {
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
      username: localMcBot ? localMcBot.credentials.username : 'NoLocalBot',
      isLeader: BOT_ROLE === 'master' ? masterElection.isLeader : (BOT_ROLE === 'standalone' ? true : undefined),
      masterInstanceId: BOT_ROLE === 'master' ? masterElection.instanceId : undefined,
      timestamp: new Date().toISOString()
    };
    return res.end(JSON.stringify(healthStatus));
  }

  // Endpoint API restart dành cho Worker Node từ xa
  if (url.pathname === '/api/restart' && req.method === 'POST') {
    if (WORKER_SECRET) {
      const authHeader = req.headers['x-worker-secret'];
      if (authHeader !== WORKER_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Sai WORKER_SECRET' }));
      }
    }

    if (!localMcBot) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: false, error: 'Node này không chạy Local Worker' }));
    }

    saveBotCredentials(localMcBot.credentials, true);
    console.log(`[Worker] 🔄 Nhận lệnh restart từ xa từ Master. Giữ nguyên tài khoản cũ: [${localMcBot.credentials.username}]`);

    if (localMcBot.bot) {
      localMcBot.bot.end('Remote restart request');
    } else {
      localMcBot.scheduleReconnect();
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      success: true,
      message: 'Đã nhận lệnh restart thành công (giữ nguyên tài khoản cũ)',
      username: localMcBot.credentials.username
    }));
  }

  // Endpoint API nhận thông báo (từ Worker gửi về Master)
  if (url.pathname === '/api/notify' && req.method === 'POST') {
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
        const { message } = payload;
        if (global.globalDiscordClient && ADMIN_ID && message) {
          try {
            const adminUser = await global.globalDiscordClient.users.fetch(ADMIN_ID);
            if (adminUser) adminUser.send(message);
          } catch(e) {
            console.error('Không thể gửi DM notify:', e.message);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint API nhận báo cáo Worker bị giới hạn IP / Ban IP -> Kích hoạt xoay Worker trên Render
  if (url.pathname === '/api/worker-ip-limit' && req.method === 'POST') {
    if (WORKER_SECRET) {
      const authHeader = req.headers['x-worker-secret'];
      if (authHeader !== WORKER_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Sai WORKER_SECRET' }));
      }
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { username, reason, workerUrl, accountId, serviceId } = payload;
        console.warn(`[Master API] 🚨 Nhận báo cáo IP Limit từ Worker [${username || 'N/A'}] (Account: ${accountId || 'N/A'}, Service: ${serviceId || 'N/A'}, URL: ${workerUrl || 'N/A'}): ${reason}`);
        
        // Kích hoạt tiến trình Xoay Render Worker bất đồng bộ
        renderManager.rotateWorker({
          accountId,
          serviceId,
          workerUrl,
          reason,
          username,
          queueDispatcher,
          discordClient: global.globalDiscordClient,
          adminId: ADMIN_ID
        }).then(result => {
          console.log('[Master API] Kết quả xoay Render Worker:', result);
        }).catch(err => {
          console.error('[Master API] Lỗi khi xoay Render Worker:', err.message);
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Đã nhận báo cáo giới hạn IP và bắt đầu tiến trình xoay Worker.'
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Endpoint API dành cho Satellite Worker (Wispbyte): Poll tác vụ & gửi Heartbeat
  if (url.pathname === '/api/satellite/poll' && req.method === 'POST') {
    if (WORKER_SECRET) {
      const authHeader = req.headers['x-worker-secret'];
      if (authHeader !== WORKER_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Sai WORKER_SECRET' }));
      }
    }

    if (!queueDispatcher) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: false, error: 'Node này không chạy QueueDispatcher' }));
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const pollResponse = await queueDispatcher.handleSatellitePoll(payload, 12000);
        if (!res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(pollResponse));
        }
      } catch (err) {
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      }
    });
    return;
  }

  // Endpoint API dành cho Satellite Worker (Wispbyte): Gửi trả kết quả thực thi tác vụ
  if (url.pathname === '/api/satellite/result' && req.method === 'POST') {
    if (WORKER_SECRET) {
      const authHeader = req.headers['x-worker-secret'];
      if (authHeader !== WORKER_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ success: false, error: 'Unauthorized: Sai WORKER_SECRET' }));
      }
    }

    if (!queueDispatcher) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: false, error: 'Node này không chạy QueueDispatcher' }));
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const out = queueDispatcher.resolveSatelliteTask(payload);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, ...out }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
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
        } else if (action === 'leaderboard' || action === 'lb') {
          result = await localMcBot.getLeaderboard(player, timeoutMs || 20000);
        } else if (action === 'bounty') {
          result = await localMcBot.getBounty(player, timeoutMs || 15000);
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

  // 2. Phục vụ Web UI Dashboard & Dashboard REST API nếu là Master hoặc Standalone
  if (BOT_ROLE === 'master' || BOT_ROLE === 'standalone') {
    try {
      const handled = await handleDashboardRequest(req, res, {
        queueDispatcher,
        discordClient: global.globalDiscordClient,
        runCheckCycle: () => {
          if (typeof global.runTrackerCheckCycle === 'function') {
            return global.runTrackerCheckCycle();
          }
          return Promise.reject(new Error('Tiến trình kiểm tra chưa khởi động'));
        }
      });
      if (handled) return;
    } catch (err) {
      console.error('[DashboardHandler] Lỗi xử lý request:', err.message);
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: false, error: 'Endpoint không tồn tại' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[HTTP-Server] Đang lắng nghe trên ${HOST}:${PORT} (${BOT_ROLE.toUpperCase()}).`);
  setTimeout(() => {
    syncMasterKeepalive().catch(() => {});
  }, 3000);
});

/**
 * Tiến trình kiểm tra định kỳ số dư toàn bộ người chơi đang được theo dõi
 * Chạy mỗi 1 giờ trên Master Node
 */
function startTrackerScheduler(queueDispatcher) {
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const intervalMs = parseInt(process.env.TRACKER_INTERVAL_MS) || ONE_HOUR_MS;

  console.log(`[TrackerScheduler] ⏱️ Đã kích hoạt tiến trình theo dõi số dư (Chu kỳ: ${intervalMs / 1000}s/lần)...`);

  let isChecking = false;

  function renderProgressBar(completed, total, barLen = 10) {
    if (total === 0) return '░'.repeat(barLen);
    const ratio = Math.min(1, Math.max(0, completed / total));
    const filled = Math.round(ratio * barLen);
    const empty = Math.max(0, barLen - filled);
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }

  function formatProgressText(completed, total, success, fail, lastRecord = null) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bar = renderProgressBar(completed, total, 10);
    const barrierEmoji = getCustomEmoji('barrier');
    let text = `🔄 **Đang kiểm tra số dư định kỳ cho các tài khoản theo dõi...**\n` +
      `📊 Tiến độ: \`[ ${bar} ]\` **${completed}/${total}** (${percent}%)\n` +
      `• Thành công: **${success}** ✅ | Thất bại: **${fail}** ${barrierEmoji}`;
    if (lastRecord && lastRecord.player) {
      const statusIcon = lastRecord.success ? '✅' : barrierEmoji;
      text += `\n• Vừa kiểm tra: **${lastRecord.player}** ${statusIcon} *(Worker: ${lastRecord.worker || 'Local'})*`;
    }
    return text;
  }

  async function runCheckCycle(targetContext = null) {
    let targetChannel = null;
    let statusMsg = null;
    let targetInteraction = null;

    if (targetContext) {
      if (typeof targetContext.send === 'function') {
        targetChannel = targetContext;
      } else if (targetContext.isCommand || targetContext.isButton || (targetContext.user && targetContext.editReply)) {
        targetInteraction = targetContext;
        targetChannel = targetContext.channel;
      } else if (typeof targetContext === 'object') {
        targetChannel = targetContext.channel || null;
        statusMsg = targetContext.message || null;
        targetInteraction = targetContext.interaction || null;
      }
    }

    if (isChecking) {
      const barrierEmoji = getCustomEmoji('barrier');
      const runningMsg = `${barrierEmoji} Tiến trình kiểm tra số dư hiện đang chạy, vui lòng đợi hoàn tất chu kỳ này.`;
      console.log(`[TrackerScheduler] ${runningMsg}`);
      if (targetInteraction) {
        await targetInteraction.editReply({ content: runningMsg }).catch(() => {});
      } else if (statusMsg) {
        await statusMsg.edit(runningMsg).catch(() => {});
      } else if (targetChannel) {
        await safeSend(targetChannel, runningMsg).catch(() => {});
      }
      return;
    }

    isChecking = true;
    const startTime = Date.now();
    let completedCount = 0;
    let successCount = 0;
    let failCount = 0;

    let lastEditTime = 0;
    let editTimer = null;
    let pendingText = null;

    const updateProgress = async (text, force = false) => {
      pendingText = text;
      const now = Date.now();
      if (force || now - lastEditTime >= 1500) {
        if (editTimer) {
          clearTimeout(editTimer);
          editTimer = null;
        }
        lastEditTime = now;
        const content = pendingText;
        pendingText = null;
        try {
          if (statusMsg) {
            await statusMsg.edit(content).catch(() => {});
          }
          if (targetInteraction) {
            await targetInteraction.editReply({ content }).catch(() => {});
          }
        } catch (e) {
          // ignore
        }
      } else if (!editTimer) {
        editTimer = setTimeout(() => {
          editTimer = null;
          updateProgress(pendingText, true);
        }, 1500 - (now - lastEditTime));
      }
    };

    try {
      const trackedPlayers = await trackerHelper.getAllTrackedPlayers();
      if (!trackedPlayers || trackedPlayers.length === 0) {
        const emptyMsg = 'ℹ️ Hiện chưa có người chơi nào trong danh sách theo dõi.';
        if (targetInteraction) {
          await targetInteraction.editReply({ content: emptyMsg }).catch(() => {});
        } else if (statusMsg) {
          await statusMsg.edit(emptyMsg).catch(() => {});
        } else if (targetChannel) {
          await safeSend(targetChannel, emptyMsg).catch(() => {});
        }
        return;
      }

      console.log(`[TrackerScheduler] 🔄 Bắt đầu chu kỳ kiểm tra số dư định kỳ cho ${trackedPlayers.length} người chơi: [${trackedPlayers.join(', ')}]`);

      // Gửi tin nhắn khởi tạo nếu chưa có
      if (!statusMsg && !targetInteraction && targetChannel) {
        statusMsg = await safeSend(targetChannel, formatProgressText(0, trackedPlayers.length, 0, 0)).catch(() => null);
      } else {
        await updateProgress(formatProgressText(0, trackedPlayers.length, 0, 0), true);
      }

      // Callback lưu số dư và cập nhật tiến trình ngay khi 1 player hoàn thành
      const handlePlayerRecord = async (record) => {
        completedCount++;
        if (record.success && record.result) {
          successCount++;
          const rawBal = record.result;
          const balStr = (rawBal && typeof rawBal === 'object' && rawBal.balance) ? rawBal.balance : String(rawBal || '');
          let cleanVal = balStr;
          if (cleanVal && cleanVal.includes('$')) {
            const dollarIndex = cleanVal.indexOf('$');
            cleanVal = cleanVal.substring(dollarIndex).replace(/balance/gi, '').trim();
          }

          if (cleanVal) {
            await trackerHelper.addBalanceRecord(record.player, cleanVal);
            console.log(`[TrackerScheduler] ✅ [${record.worker}] Đã lưu số dư mới cho "${record.player}": ${cleanVal}`);
          }
        } else {
          failCount++;
        }

        // Cập nhật tiến trình thời gian thực
        updateProgress(formatProgressText(completedCount, trackedPlayers.length, successCount, failCount, record));
      };

      // Phân bổ trải đều người chơi cho các Worker chạy song song
      const batchResult = await queueDispatcher.dispatchBatchTasks(
        'bal',
        trackedPlayers,
        BOT_CHECK_TIMEOUT,
        3000, // delay 3 giây an toàn giữa các lệnh trên cùng 1 worker để tránh spam KingMC
        handlePlayerRecord
      );

      const durationSec = Math.round((Date.now() - startTime) / 1000);
      console.log(`[TrackerScheduler] 🏁 Hoàn thành chu kỳ kiểm tra số dư định kỳ (${successCount} thành công, ${failCount} thất bại qua ${batchResult.workerCount} workers).`);

      const barrierEmoji = getCustomEmoji('barrier');
      const summaryText = `🏁 **Đã hoàn thành chu kỳ kiểm tra số dư định kỳ:**\n` +
        `• Tổng số người chơi: **${batchResult.total}**\n` +
        `• Thành công: **${successCount}** ✅\n` +
        `• Thất bại / Timeout: **${failCount}** ${barrierEmoji}\n` +
        `• Số Worker tham gia: **${batchResult.workerCount}** (${batchResult.workers.join(', ')})\n` +
        `• Thời gian thực hiện: **${durationSec}s**`;

      await updateProgress(summaryText, true);

      // Nếu chỉ có targetChannel thuần túy không gửi được statusMsg từ đầu, gửi tin nhắn tổng kết
      if (!statusMsg && !targetInteraction && targetChannel) {
        await safeSend(targetChannel, summaryText).catch(() => {});
      }
    } catch (cycleErr) {
      console.error('[TrackerScheduler] Lỗi trong chu kỳ kiểm tra:', cycleErr.message);
      const errText = `❌ Đã xảy ra lỗi trong chu kỳ kiểm tra: \`${cycleErr.message}\``;
      await updateProgress(errText, true);
      if (!statusMsg && !targetInteraction && targetChannel) {
        await safeSend(targetChannel, errText).catch(() => {});
      }
    } finally {
      if (editTimer) {
        clearTimeout(editTimer);
        editTimer = null;
      }
      isChecking = false;
    }
  }

  // Khởi chạy vòng lặp setInterval
  const timer = setInterval(runCheckCycle, intervalMs);
  global.runTrackerCheckCycle = runCheckCycle;

  return { runCheckCycle, timer };
}

// 3. Khởi tạo Discord Client (Nếu ở chế độ 'master' hoặc 'standalone')
if (BOT_ROLE === 'master' || BOT_ROLE === 'standalone') {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
  });
  
  global.globalDiscordClient = client;

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

  let isHelpersInitialized = false;
  client.on('clientReady', async () => {
    console.log(`[Discord-Bot] Bot đã trực tuyến với tên: ${client.user.tag}`);

    // Đăng ký Slash Commands và đồng bộ Guild trong nền (non-blocking) để bot phản hồi lệnh ngay lập tức
    setImmediate(async () => {
      await commandHandler.registerSlashCommands(DISCORD_TOKEN, CLIENT_ID, GUILD_ID).catch(e => console.warn('[Index] Lỗi đăng ký Slash Commands:', e.message));
      await syncDiscordGuilds(client).catch(e => console.warn('[Index] Lỗi đồng bộ Guild ban đầu:', e.message));
    });

    if (!isHelpersInitialized) {
      isHelpersInitialized = true;
      // Khởi tạo hệ thống lưu trữ theo dõi số dư (MongoDB / JSON)
      trackerHelper.initTracker().catch(() => {});
      // Khởi tạo hệ thống lưu trữ skin (MongoDB / JSON)
      skinHelper.initSkinHelper().catch(() => {});
    }

    // Khởi chạy tiến trình kiểm tra số dư định kỳ 1 giờ / lần (nếu chưa chạy)
    if (!global.trackerSchedulerInstance) {
      global.trackerSchedulerInstance = startTrackerScheduler(queueDispatcher);
      global.runTrackerCheckCycle = global.trackerSchedulerInstance?.runCheckCycle;
    }

    // Khởi chạy bộ lập lịch tự động truy cập Wispbyte Client Panel 24h / lần cho đa tài khoản
    wispbyteManager.startWispbyteKeepAliveScheduler({
      discordClient: client,
      adminId: ADMIN_ID
    });
  });

  // Tự động đồng bộ khi Bot tham gia hoặc rời server Discord
  client.on('guildCreate', async () => {
    await syncDiscordGuilds(client).catch(e => console.warn('[Index] Lỗi đồng bộ guildCreate:', e.message));
  });
  client.on('guildDelete', async () => {
    await syncDiscordGuilds(client).catch(e => console.warn('[Index] Lỗi đồng bộ guildDelete:', e.message));
  });

  client.on('interactionCreate', async (interaction) => {
    // Chặn nếu là Master Node nhưng không phải Active Leader (Standby)
    if (BOT_ROLE === 'master' && !masterElection.isLeader) {
      return;
    }

    // Chặn Slash Commands khi bảo trì
    if (global.isBotMaintenance && interaction.isChatInputCommand()) {
       if (!ADMIN_ID || interaction.user.id !== ADMIN_ID) {
          const barrierEmoji = getCustomEmoji('barrier');
          return interaction.reply({ content: `${barrierEmoji} **Bảo trì:** ${global.maintenanceMessage}`, ephemeral: true });
       }
    }

    // Xử lý nút báo lỗi Admin
    const isReportHandled = await handleReportButtons(interaction, client);
    if (isReportHandled) return;

    // Xử lý nút Theo dõi & Xuất biểu đồ số dư
    const isTrackerHandled = await handleTrackerButtons(interaction);
    if (isTrackerHandled) return;

    // Xử lý nút Phân trang (AH & Order) với TTL 20s
    const isPaginationHandled = await handlePaginationButtons(interaction);
    if (isPaginationHandled) return;

    // Kiểm tra giới hạn máy chủ Discord (Hỗ trợ Whitelist, Blacklist & Membership, ngoại trừ Admin)
    if (interaction.isChatInputCommand()) {
      const isAdmin = ADMIN_ID && interaction.user.id === ADMIN_ID;
      if (!isAdmin) {
        const mode = configHelper.getRestrictionMode();
        if (mode === 'membership') {
          const isMember = await configHelper.isUserInMainGuild(client, interaction.user.id);
          if (!isMember) {
            const payload = configHelper.createMemberRestrictionPayload();
            return interaction.reply({ ...payload, ephemeral: true });
          }
        } else {
          const isAllowed = configHelper.isGuildAllowed(interaction.guildId);
          if (!isAllowed) {
            const payload = configHelper.createRestrictionPayload();
            return interaction.reply({ ...payload, ephemeral: true });
          }
        }
      }
    }

    // Xử lý Slash Commands
    await commandHandler.handleInteraction(interaction);
  });

  // Lắng nghe lệnh qua DM hoặc Kênh chat (Admin)
  // Lắng nghe lệnh qua DM hoặc Kênh chat (Admin & User)
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Chặn nếu là Master Node nhưng không phải Active Leader (Standby)
    if (BOT_ROLE === 'master' && !masterElection.isLeader) {
      return;
    }

    // 1. Nhận diện ngữ cảnh: Tin nhắn riêng (DM)
    const isDirectMessage = !message.guild;
    const cleanText = (message.content || '').trim();

    // KIỂM TRA GIỚI HẠN MÁY CHỦ CHO PHÉP (Hỗ trợ Whitelist, Blacklist & Membership, Master vẫn DM bình thường)
    const isAdmin = ADMIN_ID && message.author.id === ADMIN_ID;

    if (!isAdmin) {
      const mode = configHelper.getRestrictionMode();

      if (mode === 'membership') {
        // Chế độ Membership: Cho phép dùng ở mọi server & DM, nhưng bắt buộc người dùng là thành viên Server chính
        const isCallingBot = isDirectMessage || cleanText.startsWith('?') || (message.mentions && message.mentions.has(client.user?.id));
        if (isCallingBot) {
          const isMember = await configHelper.isUserInMainGuild(client, message.author.id);
          if (!isMember) {
            const payload = configHelper.createMemberRestrictionPayload();
            return message.reply(payload);
          }
        }
      } else {
        // A. Nếu nhắn tin riêng (DM) nhưng không phải là Master/Admin
        if (isDirectMessage) {
          const payload = configHelper.createRestrictionPayload();
          return message.reply(payload);
        }

        // B. Nếu ở server không được phép (theo Whitelist/Blacklist) và người dùng tương tác tới Bot (? hoặc @mention)
        if (message.guild && !configHelper.isGuildAllowed(message.guild.id)) {
          const isCallingBot = cleanText.startsWith('?') || (message.mentions && message.mentions.has(client.user?.id));
          if (isCallingBot) {
            const payload = configHelper.createRestrictionPayload();
            return message.reply(payload);
          }
          return; // Không tương tác với bot trong server không hợp lệ thì bỏ qua
        }
      }
    }

    // Danh sách lệnh hợp lệ
    const allowedCommands = ['stats', 'order', 'bal', 'ah', 'online', 'ping', 'help', 'lb', 'donate', 'bounty', 'item', 'math', 'ai', 'chat'];
    const adminCommands = ['help', 'status', 'workers', 'restart', 'mode', 'render', 'toggle', 'ai', 'tracker', 'theodoi', 'master', 'failover', 'wispbyte'];

    // 2. Kiểm tra xem có phải lệnh game/người dùng hay không
    // Hỗ trợ: ?stats trong server hoặc stats trong DM
    let isGameCommand = false;
    let commandName = '';
    let commandArgs = [];
    let showPrefixTip = false;

    if (cleanText.startsWith('?')) {
      commandArgs = cleanText.slice(1).trim().split(/ +/);
      commandName = commandArgs.shift()?.toLowerCase();
      if (allowedCommands.includes(commandName)) {
        isGameCommand = true;
        showPrefixTip = !isDirectMessage;
      }
    } else if (isDirectMessage && cleanText) {
      commandArgs = cleanText.split(/ +/);
      const firstWord = commandArgs.shift()?.toLowerCase();
      if (allowedCommands.includes(firstWord)) {
        isGameCommand = true;
        commandName = firstWord;
        showPrefixTip = false;
      }
    }

    // --- XỬ LÝ LỆNH GAME / NGƯỜI DÙNG ---
    if (isGameCommand) {
      const command = client.commands.get(commandName);
      if (!command) return;

      const barrierEmoji = getCustomEmoji('barrier');

      // Chặn nếu đang bảo trì (trừ Admin)
      if (global.isBotMaintenance) {
        if (!ADMIN_ID || message.author.id !== ADMIN_ID) {
          return message.channel.send(`${barrierEmoji} **Bảo trì:** ${global.maintenanceMessage}`);
        }
      }

      const argStr = commandArgs.join(' ').trim();
      const noArgRequiredCommands = ['ping', 'help', 'lb', 'donate', 'bounty'];
      if (!noArgRequiredCommands.includes(commandName) && !argStr) {
        const exampleSyntax = `?${commandName} BinhLH`;
        return message.channel.send(`${barrierEmoji} Lệnh \`${commandName}\` cần có tham số (tên người chơi hoặc vật phẩm). VD: \`${exampleSyntax}\` hoặc \`/${commandName}\``);
      }

      const userId = message.author.id;
      const spamCheck = commandHandler.checkSpam(userId);
      if (spamCheck.isSpam) {
        return message.channel.send(spamCheck.message);
      }

      // Thông báo lưu ý chuyển đổi khi người dùng vẫn đang gõ '?'
      const tipText = `> 💡 **Lưu ý:** *Nếu lệnh tiền tố \`?${commandName}\` không phản hồi, bạn hãy sử dụng Slash Command (\`/${commandName}\`) nhé!*`;

      const attachTip = (payload) => {
        if (!showPrefixTip) return payload;
        if (typeof payload === 'string') {
          return `${payload}\n${tipText}`;
        }
        const newPayload = { ...payload };
        if (newPayload.content) {
          newPayload.content = `${newPayload.content}\n${tipText}`;
        } else {
          newPayload.content = tipText;
        }
        return newPayload;
      };

      // Fake Interaction Object để dùng chung logic với Slash Commands
      const interaction = {
        user: message.author,
        client: client,
        options: {
          getString: () => argStr
        },
        deferReply: async () => {
          interaction._replyMessage = await message.channel.send('⏳ Đang xử lý yêu cầu...');
        },
        editReply: async (data) => {
          const finalData = attachTip(data);
          if (interaction._replyMessage) {
            const editPayload = typeof finalData === 'string'
              ? { content: finalData }
              : { content: '', ...finalData };
            try {
              await interaction._replyMessage.edit(editPayload);
            } catch (editErr) {
              console.warn('[Index] Không thể sửa replyMessage, gửi tin nhắn mới:', editErr.message);
              await message.channel.send(finalData);
            }
          } else {
            await message.channel.send(finalData);
          }
        },
        reply: async (data) => {
          await message.channel.send(attachTip(data));
        },
        followUp: async (data) => {
          await message.channel.send(data);
        }
      };

      try {
        await command.execute(interaction, queueDispatcher);
      } catch (error) {
        console.error(`[Discord] Lỗi lệnh text ${commandName}:`, error);
      } finally {
        commandHandler.finishUserTask(userId);
      }
      return;
    }

    // 4. Kiểm tra xem có phải lệnh Quản trị (Admin) hay không
    // BẮT BUỘC phải có tiền tố '!': !status, !restart, !mode, !toggle, !ai on/off, !tracker, v.v. (kể cả trong DM lẫn server)
    // Nếu không có '!', Admin sẽ được đối xử như một người dùng bình thường (được hỏi AI, dùng lệnh game, tính toán,...)
    let isAdminCommand = false;
    let command = '';
    let args = [];

    if (cleanText.startsWith('!')) {
      args = cleanText.slice(1).trim().split(/ +/);
      command = args.shift()?.toLowerCase();
      if (adminCommands.includes(command)) {
        isAdminCommand = true;
      }
    }

    // --- XỬ LÝ LỆNH ADMIN ---
    if (isAdminCommand) {
      console.log(`[Admin-Debug] Nhận lệnh Admin: "${command}" từ User ID: ${message.author.id} (Tên: ${message.author.tag}). ADMIN_ID cấu hình: "${ADMIN_ID}"`);

      // Kiểm tra ADMIN_ID nếu đã được cấu hình
      if (ADMIN_ID && message.author.id !== ADMIN_ID) {
        console.warn(`[Admin-Debug] Bỏ qua tin nhắn vì User ID (${message.author.id}) không khớp với ADMIN_ID (${ADMIN_ID}).`);
        return;
      }

    try {
      if (command === 'help') {
         await safeSend(message.channel, '**Danh sách lệnh Admin:**\n- `!master [status/switch]`: Xem hoặc chuyển đổi quyền giữa 2 Master (Active / Standby)\n- `!status` hoặc `!workers`: Xem danh sách và trạng thái toàn bộ Workers (Local, Remote Render & Satellite Wispbyte)\n- `!wispbyte [list/add/remove/check]`: Quản lý đa tài khoản Wispbyte & tự động truy cập Client Panel 24h/lần\n- `!restart`: Random tên mới và khởi động lại bot ngay lập tức\n- `!mode` hoặc `!render`: Chuyển đổi chế độ hiển thị danh sách (Text / Image)\n- `!toggle off/on [lời nhắn]`: Bật/tắt việc nhận Slash Commands từ user khác.\n- `!ai off/on [lời nhắn]`: Bật/tắt tính năng trò chuyện AI với người dùng.\n- `!tracker [trang]`: Xem danh sách và trạng thái theo dõi số dư định kỳ (phân trang)\n- `!tracker add <tên>`: Bật theo dõi số dư cho một người chơi\n- `!tracker untrack <tên>`: Hủy theo dõi một người chơi\n- `!tracker check`: Kích hoạt vòng lặp check bal cho các người chơi ngay lập tức');
      } else if (command === 'wispbyte') {
         const sub = (args.shift() || 'list').toLowerCase();
         if (sub === 'add' || sub === 'set') {
           const accountId = (args.shift() || '').trim();
           const cookieStr = args.join(' ').trim();
           if (!accountId || !cookieStr) {
             return await safeSend(message.channel, '📖 **Cú pháp thêm/cập nhật tài khoản Wispbyte:**\n`!wispbyte add <tên_hoặc_id_acc> <chuỗi_cookie>`\n\n*Ví dụ:*\n`!wispbyte add wisp_acc_1 cf_clearance=...; session=...`');
           }
           await wispbyteManager.saveWispbyteAccount({
             accountId,
             name: accountId,
             cookie: cookieStr,
             isActive: true
           });
           await safeSend(message.channel, `✅ Đã lưu tài khoản Wispbyte **${accountId}** vào MongoDB Atlas! Đang kiểm tra kết nối Client Panel...`);
           const testRes = await wispbyteManager.pingSingleWispbyteAccount({
             accountId,
             name: accountId,
             cookie: cookieStr
           });
           const icon = testRes.success ? '🟢' : '🔴';
           return await safeSend(message.channel, `${icon} **Kết quả kiểm tra [${accountId}]:** ${testRes.message}`);
         } else if (sub === 'remove' || sub === 'delete' || sub === 'xoa') {
           const accountId = (args.shift() || '').trim();
           if (!accountId) {
             return await safeSend(message.channel, '⚠️ Cú pháp: `!wispbyte remove <id_acc>`');
           }
           const ok = await wispbyteManager.deleteWispbyteAccount(accountId);
           return await safeSend(message.channel, ok ? `🗑️ Đã xóa tài khoản Wispbyte **${accountId}**.` : `⚠️ Không tìm thấy tài khoản **${accountId}**.`);
         } else if (sub === 'check' || sub === 'renew' || sub === 'ping') {
           const statusMsg = await safeSend(message.channel, '⏳ **Đang truy cập Client Panel cho toàn bộ các tài khoản Wispbyte...**');
           const checkRes = await wispbyteManager.checkAllWispbyteAccounts({
             discordClient: client,
             adminId: ADMIN_ID,
             manual: true
           });
           if (!checkRes.results || checkRes.results.length === 0) {
             return await statusMsg.edit('ℹ️ Chưa có tài khoản Wispbyte nào được cấu hình. Dùng `!wispbyte add <id_acc> <cookie>` để thêm.');
           }
           let txt = `🛰️ **KẾT QUẢ GIA HẠN / TRUY CẬP WISPBYTE (${checkRes.okCount}/${checkRes.total} thành công):**\n\n`;
           checkRes.results.forEach((r, idx) => {
             const icon = r.success ? '🟢' : (r.status === 'expired' ? '🔴' : '🟡');
             txt += `**${idx + 1}. ${icon} ${r.name}** (\`${r.accountId}\`)\n   └ ${r.message} *(Tổng lần giữ hạn: ${r.renewCount})*\n`;
           });
           return await statusMsg.edit(txt);
         } else {
           const accounts = await wispbyteManager.getAllWispbyteAccounts();
           if (accounts.length === 0) {
             return await safeSend(message.channel, 'ℹ️ **Chưa có tài khoản Wispbyte nào trong hệ thống.**\n\n📖 **Hướng dẫn quản lý đa tài khoản Wispbyte (Tự động giữ hạn 14 ngày):**\n• Thêm tài khoản: `!wispbyte add <id_acc> <cookie>`\n• Kiểm tra/Gia hạn ngay tất cả acc: `!wispbyte check`\n• Xóa tài khoản: `!wispbyte remove <id_acc>`');
           }
           let txt = `🛰️ **DANH SÁCH TÀI KHOẢN WISPBYTE (${accounts.length}):**\n\n`;
           accounts.forEach((a, idx) => {
             const icon = a.lastStatus === 'ok' ? '🟢' : (a.lastStatus === 'expired' ? '🔴' : '⚪');
             const lastTime = a.lastPingAt ? new Date(a.lastPingAt).toLocaleString('vi-VN') : 'Chưa chạy';
             txt += `**${idx + 1}. ${icon} ${a.name || a.accountId}** (\`${a.accountId}\`)\n`;
             txt += `   • Lần truy cập cuối: \`${lastTime}\` (Giữ hạn: **${a.renewCount || 0}** lần)\n`;
             if (a.lastMessage) txt += `   • Chi tiết: ${a.lastMessage}\n`;
           });
           txt += `\n💡 *Hệ thống tự động truy cập tất cả tài khoản mỗi 24h. Gõ \`!wispbyte check\` để chạy ngay.*`;
           return await safeSend(message.channel, txt);
         }
      } else if (command === 'tracker' || command === 'theodoi') {
         const sub = args.shift()?.toLowerCase();
         if (sub === 'help') {
           return await safeSend(message.channel, '📖 **Cú pháp lệnh !tracker:**\n- `!tracker [trang]`: Xem danh sách người chơi theo dõi (mặc định trang 1, VD: `!tracker 2`)\n- `!tracker add <tên>`: Bật theo dõi số dư cho một người chơi\n- `!tracker untrack <tên>`: Hủy theo dõi một người chơi\n- `!tracker check`: Kích hoạt chu kỳ kiểm tra số dư ngay lập tức');
         } else if (sub === 'untrack' || sub === 'remove' || sub === 'xoa') {
           const target = args.join(' ').trim();
           if (!target) {
             const barrierEmoji = getCustomEmoji('barrier');
             return await safeSend(message.channel, `${barrierEmoji} Cú pháp: \`!tracker untrack <tên_người_chơi>\``);
           }
           await trackerHelper.setTracking(target, false);
           await safeSend(message.channel, `✅ Đã hủy theo dõi số dư của người chơi: **${target}**`);
         } else if (sub === 'add' || sub === 'track' || sub === 'them') {
           const target = args.join(' ').trim();
           if (!target) {
             const barrierEmoji = getCustomEmoji('barrier');
             return await safeSend(message.channel, `${barrierEmoji} Cú pháp: \`!tracker add <tên_người_chơi>\``);
           }
           await trackerHelper.setTracking(target, true);
           await safeSend(message.channel, `✅ Đã thêm người chơi **${target}** vào danh sách theo dõi số dư định kỳ!`);
         } else if (sub === 'check' || sub === 'run') {
           const statusMsg = await safeSend(message.channel, '🔄 **Bắt đầu chu kỳ kiểm tra số dư định kỳ cho các người chơi ngay lập tức...**');
           if (global.trackerSchedulerInstance) {
             global.trackerSchedulerInstance.runCheckCycle({
               message: statusMsg,
               channel: message.channel
             });
           }
         } else {
           const page = parseInt(sub) || 1;
           const overview = await trackerHelper.getTrackerOverview();
           const payload = buildTrackerOverviewMessage(overview, page);
           await message.channel.send(payload);
         }
      } else if (command === 'ai') {
         const sub = args.shift()?.toLowerCase();
         if (sub === 'off') {
            global.isAiChatEnabled = false;
            global.aiDisableReason = args.join(' ') || 'Tính năng trò chuyện AI hiện đang tạm tắt.';
            await message.channel.send(`🔴 Đã **TẮT** tính năng trò chuyện AI. Lời nhắn: \`${global.aiDisableReason}\``);
         } else if (sub === 'on') {
            global.isAiChatEnabled = true;
            global.aiDisableReason = '';
            await message.channel.send('🟢 Đã **BẬT** lại tính năng trò chuyện AI.');
         } else {
            const statusStr = global.isAiChatEnabled ? '🟢 Đang **BẬT**' : `🔴 Đang **TẮT** (Lý do: \`${global.aiDisableReason}\`)`;
            await message.channel.send(`🤖 **Trạng thái AI Chat:** ${statusStr}\n\n⚙️ **Cú pháp Admin:** \`!ai on\` hoặc \`!ai off [lời nhắn]\`\n💡 *Ghi chú: Để hỏi đáp AI, vui lòng dùng \`?ai <câu hỏi>\` hoặc Slash Command \`/ai\` (trong tin nhắn riêng DM chỉ cần gõ: \`ai <câu hỏi>\`).*`);
         }
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
           const barrierEmoji = getCustomEmoji('barrier');
           await message.channel.send(`${barrierEmoji} Hiện chưa có Worker nào được cấu hình.`);
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

          await safeSend(message.channel, text);
      } else if (command === 'restart') {
         const statusMsg = await message.channel.send('🔄 **Đang gửi yêu cầu khởi động lại (restart) tới tất cả các Workers...**');
         const results = await queueDispatcher.restartAllWorkers();

         if (results.length === 0) {
           const barrierEmoji = getCustomEmoji('barrier');
           await statusMsg.edit(`${barrierEmoji} Hiện không tìm thấy Worker nào (Local hoặc Remote) được cấu hình để restart.`);
           return;
         }

         let replyText = `✅ **ĐÃ GỬI LỆNH RESTART TỚI TẤT CẢ WORKERS (${results.length}):**\n\n`;
         results.forEach((res, idx) => {
           if (res.success) {
             replyText += `**${idx + 1}. [${res.type.toUpperCase()}] ${res.name}**\n   - Trạng thái: 🟢 Đã nhận lệnh restart (Giữ nguyên tài khoản: \`${res.username}\`)\n`;
           } else {
             replyText += `**${idx + 1}. [${res.type.toUpperCase()}] ${res.name}**\n   - Trạng thái: ❌ Thất bại (\`${res.error}\`)\n`;
           }
         });
         await statusMsg.edit(replyText);
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
      } else if (command === 'master' || command === 'failover') {
         const sub = args.shift()?.toLowerCase();
         if (sub === 'switch' || sub === 'handoff' || sub === 'stepdown') {
            const statusMsg = await message.channel.send('🔄 **Đang gửi yêu cầu từ chức Leader... Master dự phòng sẽ tự động tiếp quản!**');
            const res = await masterElection.stepDown('Admin yêu cầu chuyển quyền qua lệnh !master switch');
            if (res.success) {
              await statusMsg.edit('✅ **Đã bàn giao quyền Leader thành công!** Node này đã trở về trạng thái STANDBY.');
            } else {
              await statusMsg.edit(`❌ Chuyển đổi thất bại: ${res.error}`);
            }
         } else {
            const st = await masterElection.getStatus();
            const leaderInfo = st.currentLeader;
            let desc = `👑 **HỆ THỐNG LUÂN PHIÊN 2 MASTER (HIGH AVAILABILITY):**\n\n`;
            desc += `• **Node hiện tại:** \`${st.thisNode.instanceName}\` (\`${st.thisNode.instanceId}\`)\n`;
            desc += `• **Vai trò:** ${st.thisNode.isLeader ? '🟢 **ACTIVE LEADER** (Đang trực tiếp phục vụ)' : '🛡️ **STANDBY BACKUP** (Đang chờ dự phòng)'}\n`;
            desc += `• **URL:** \`${st.thisNode.selfUrl || 'Chưa cấu hình URL'}\`\n\n`;
            if (leaderInfo) {
              desc += `• **Leader đang giữ quyền:** \`${leaderInfo.leaderName}\` (ID: \`${leaderInfo.leaderId}\`)\n`;
              desc += `• **URL Leader:** \`${leaderInfo.leaderUrl || 'N/A'}\`\n`;
              desc += `• **Nhịp tim cuối:** \`${leaderInfo.lastHeartbeatAgoSec}s trước\` (${leaderInfo.isAlive ? '🟢 Sống' : '🔴 Mất tín hiệu'})\n`;
              desc += `• **Nhiệm kỳ (Term):** \`#${leaderInfo.term}\`\n`;
            } else {
              desc += `• **Leader đang giữ quyền:** *Chưa xác định*\n`;
            }
            desc += `• **Thời gian chờ Failover:** \`${st.failoverTimeoutSec}s\`\n\n`;
            desc += `💡 *Để chuyển quyền ngay cho Master dự phòng, gõ:* \`!master switch\``;
            await safeSend(message.channel, desc);
         }
      }
    } catch (cmdErr) {
      console.error('[Admin-Debug] Lỗi gửi tin nhắn trả lời:', cmdErr);
    }
    return;
  }

  // --- LUỒNG 2: TRỢ LÝ AI (ĐỘC LẬP & TÁCH RỜI VỚI LUỒNG LỆNH) ---
  // Kích hoạt khi:
  // 1. Dùng lệnh tiền tố rõ ràng: ?ai <câu hỏi> (trong guild hoặc DM)
  // 2. Nhắn trong tin nhắn riêng (DM): ai <câu hỏi>
  const isAiExplicitCommand = /^\?ai(\s+|$)/i.test(cleanText) ||
    (isDirectMessage && /^ai(\s+|$)/i.test(cleanText));
  if (isAiExplicitCommand) {
    if (global.isAiChatEnabled === false) {
      await message.reply(`⚠️ **Thông báo:** ${global.aiDisableReason || 'Tính năng AI Chat hiện đang tạm tắt.'}`);
      return;
    }
    const promptText = cleanText.replace(/^\??ai\s*/i, '').trim();
    if (!promptText) {
      await message.reply('👋 Bạn đã gọi kênh AI! Vui lòng nhập câu hỏi kèm theo. VD: `?ai Cách chế tạo khiên trong Minecraft?` hoặc dùng Slash Command `/ai`.');
      return;
    }
    await handleAiChatMessage(message, promptText);
    return;
  }

  // --- LUỒNG 3: TÍNH TOÁN TOÁN HỌC THUẦN TÚY (PURE MATH ENGINE) ---
  // 1. Cú pháp tiền tố: ?math <biểu thức>, ?calc <biểu thức>, ?tinh <biểu thức> (hoặc trong DM: math ...)
  const isMathExplicitCommand = /^\?(math|calc|tinh)(\s+|$)/i.test(cleanText) ||
    (isDirectMessage && /^(math|calc|tinh)(\s+|$)/i.test(cleanText));
  if (isMathExplicitCommand) {
    const mathExpression = cleanText.replace(/^\??(math|calc|tinh)\s*/i, '').trim();
    await handleMathMessage(message, mathExpression);
    return;
  }

  // 2. Tự động nhận dạng phép tính toán học (không cần chữ math):
  // Hỗ trợ:
  // - Khi có tiền tố ? (kênh chat hoặc DM): ?12*2, ? 12*2, ?(15+5)*2
  // - Trong tin nhắn riêng (DM): 12*2, (15 + 25) * 4
  let mathCandidate = null;
  if (cleanText.startsWith('?')) {
    mathCandidate = cleanText.slice(1).trim();
  } else if (isDirectMessage) {
    mathCandidate = cleanText.trim();
  }

  if (mathCandidate && isMathExpression(mathCandidate)) {
    await handleMathMessage(message, mathCandidate);
    return;
  }
  });

  if (BOT_ROLE === 'master') {
    // Khởi động cơ chế bầu chọn Master tự động (High Availability Active - Standby)
    console.log('[Index] 🚀 Bắt đầu khởi động cơ chế bầu chọn Master (Leader Election)...');
    masterElection.start({
      discordClient: client,
      queueDispatcher,
      startSchedulerFn: startTrackerScheduler,
      getSelfUrlFn: () => process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || process.env.MASTER_URL || process.env.SELF_URL || ''
    }).catch(err => {
      console.error('[Index] Lỗi khởi động MasterElection:', err.message);
    });
  } else {
    // Chế độ Standalone: Luôn tự đăng nhập Discord bot trực tiếp
    if (DISCORD_TOKEN && DISCORD_TOKEN !== 'your_discord_bot_token_here') {
      client.login(DISCORD_TOKEN);
    } else {
      console.error('[Discord-Bot] Chưa cấu hình DISCORD_TOKEN trong file .env!');
    }
  }
}

// Bắt ngoại lệ để tránh crash process
process.on('uncaughtException', err => {
  console.error('[Process] Lỗi uncaughtException:', err);
});

process.on('unhandledRejection', reason => {
  console.error('[Process] Lỗi unhandledRejection:', reason);
});
