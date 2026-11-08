/**
 * helpers/botHostingManager.js - Quản lý Worker trên Bot-Hosting.net qua REST API v1
 * & Tự động gửi tin nhắn kèm link nhắc Admin gia hạn gói Free vào 8h00 sáng mỗi ngày.
 */

const {
  getAllBotHostingAccounts,
  saveBotHostingAccount,
  deleteBotHostingAccount,
  isMongoAvailable
} = require('./mongoHelper');

const BOT_HOSTING_API_BASE = 'https://bot-hosting.net/api/v1';
const PANEL_URL = 'https://bot-hosting.net/panel';

let schedulerTimer = null;

/**
 * Gọi REST API của Bot-Hosting.net
 */
async function callBotHostingApi(endpoint, apiKey, options = {}) {
  const url = `${BOT_HOSTING_API_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedError;
    try {
      parsedError = JSON.parse(errorText);
    } catch (e) {
      parsedError = errorText;
    }
    const message = parsedError?.message || parsedError?.error || errorText || `HTTP ${response.status}`;
    throw new Error(`[BotHosting API ${response.status}] ${message}`);
  }

  if (response.status === 204) {
    return true;
  }

  return await response.json();
}

/**
 * Lấy danh sách deployments từ Bot-Hosting.net
 */
async function listDeployments(apiKey) {
  try {
    const res = await callBotHostingApi('/deployments', apiKey, { method: 'GET' });
    if (Array.isArray(res)) return res;
    if (res?.deployments && Array.isArray(res.deployments)) return res.deployments;
    if (res?.data && Array.isArray(res.data)) return res.data;
    return [];
  } catch (err) {
    console.error('[BotHostingManager] Lỗi lấy danh sách deployments:', err.message);
    throw err;
  }
}

/**
 * Lấy chi tiết 1 deployment
 */
async function getDeployment(apiKey, deploymentId) {
  return await callBotHostingApi(`/deployments/${deploymentId}`, apiKey, { method: 'GET' });
}

/**
 * Tạo Worker Deployment mới trên Bot-Hosting.net kéo từ GitHub
 */
async function createWorkerDeployment(account, options = {}) {
  const apiKey = account.apiKey;
  if (!apiKey) throw new Error('Tài khoản chưa có apiKey');

  const repo = options.repo || account.repo || process.env.GITHUB_REPO || 'luuhuubinh/botCheckStatsKingMC';
  const cleanRepo = repo.replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '');
  const branch = options.branch || account.branch || process.env.GIT_BRANCH || 'wispbyte';
  const serviceName = options.name || `kingmc-worker-${Math.random().toString(36).substring(2, 7)}`;

  const masterUrl = options.masterUrl || process.env.RENDER_EXTERNAL_URL || process.env.MASTER_URL || '';
  const workerSecret = options.workerSecret || process.env.WORKER_SECRET || '';
  const mcServerHosts = options.mcServerHosts || process.env.MC_SERVER_HOSTS || 'sgp.kingmc.vn,kingmc.vn';
  const mcServerPort = options.mcServerPort || process.env.MC_SERVER_PORT || '25565';

  const payload = {
    name: serviceName,
    source: 'github',
    githubRepo: cleanRepo,
    branch,
    runtime: 'nodejs',
    runtimeVersion: '22',
    env: {
      BOT_ROLE: 'worker',
      SATELLITE_MODE: 'true',
      MASTER_URL: String(masterUrl),
      WORKER_SECRET: String(workerSecret),
      MC_SERVER_HOSTS: String(mcServerHosts),
      MC_SERVER_PORT: String(mcServerPort),
      WORKER_NAME: String(serviceName),
      NODE_ENV: 'production'
    }
  };

  console.log(`[BotHostingManager] 🚀 Đang tạo Worker [${serviceName}] từ repo [${cleanRepo}#${branch}] trên Bot-Hosting.net...`);
  const result = await callBotHostingApi('/deployments', apiKey, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const deploymentData = result.deployment || result.data || result;
  const deploymentId = deploymentData.id || deploymentData._id || deploymentData.deploymentId || '';

  // Lưu thông tin deployment vào MongoDB
  try {
    const deployments = Array.isArray(account.deployments) ? [...account.deployments] : [];
    deployments.push({
      deploymentId,
      name: serviceName,
      status: 'active',
      createdAt: new Date(),
      lastRenewedAt: new Date(),
      nextRenewDue: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
    });
    await saveBotHostingAccount({
      ...account,
      deployments
    });
  } catch (dbErr) {
    console.warn('[BotHostingManager] Không thể lưu deployment vào MongoDB:', dbErr.message);
  }

  console.log(`[BotHostingManager] ✅ Đã tạo Worker thành công! ID: [${deploymentId}]`);
  return deploymentData;
}

/**
 * Khởi động lại deployment
 */
async function restartDeployment(apiKey, deploymentId) {
  if (!deploymentId) throw new Error('Thiếu deploymentId');
  console.log(`[BotHostingManager] 🔄 Đang gửi lệnh restart tới deployment [${deploymentId}]...`);
  return await callBotHostingApi(`/deployments/${deploymentId}/power`, apiKey, {
    method: 'POST',
    body: JSON.stringify({ action: 'restart' })
  });
}

/**
 * Xóa deployment trên Bot-Hosting.net
 */
async function deleteDeployment(apiKey, deploymentId, accountId = '') {
  if (!deploymentId) throw new Error('Thiếu deploymentId');
  console.log(`[BotHostingManager] 🗑️ Đang gửi lệnh xóa deployment [${deploymentId}]...`);
  await callBotHostingApi(`/deployments/${deploymentId}`, apiKey, {
    method: 'DELETE'
  });

  if (accountId) {
    try {
      const accounts = await getAllBotHostingAccounts();
      const targetAcc = accounts.find(a => a.accountId === accountId);
      if (targetAcc && Array.isArray(targetAcc.deployments)) {
        const filtered = targetAcc.deployments.filter(d => d.deploymentId !== deploymentId);
        await saveBotHostingAccount({
          ...targetAcc,
          deployments: filtered
        });
      }
    } catch (e) {}
  }

  return true;
}

/**
 * Tính số mili-giây tới đúng 8:00 AM (múi giờ Việt Nam UTC+7) tiếp theo
 */
function getMsUntilNext8AM() {
  const now = new Date();
  // Lấy thời gian UTC thực tế tính theo ms
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  // Giờ Việt Nam là UTC + 7
  const vnTime = new Date(utcMs + (7 * 3600000));

  const targetVn = new Date(vnTime);
  targetVn.setHours(8, 0, 0, 0);

  // Nếu hiện tại đã quá 8:00 AM giờ VN thì hẹn 8:00 AM ngày mai
  if (vnTime.getTime() >= targetVn.getTime()) {
    targetVn.setDate(targetVn.getDate() + 1);
  }

  return targetVn.getTime() - vnTime.getTime();
}

/**
 * Gửi tin nhắn nhắc nhở gia hạn Bot-Hosting tới Admin Discord
 */
async function sendBotHostingReminder({ discordClient = null, adminId = '', manual = false } = {}) {
  const accounts = await getAllBotHostingAccounts();
  const activeAccounts = accounts.filter(a => a.isActive && a.apiKey);

  if (activeAccounts.length === 0) {
    if (manual && discordClient && adminId) {
      try {
        const adminUser = await discordClient.users.fetch(adminId);
        if (adminUser) {
          await adminUser.send('ℹ️ Chưa có tài khoản Bot-Hosting nào trong hệ thống. Dùng `!bothost add <accountId> <apiKey>` để thêm.');
        }
      } catch (e) {}
    }
    return { success: false, message: 'Chưa có tài khoản Bot-Hosting được cấu hình.' };
  }

  if (!discordClient || !adminId) {
    console.warn('[BotHostingReminder] Thiếu discordClient hoặc adminId để gửi tin nhắn.');
    return { success: false, message: 'Thiếu cấu hình Discord Client hoặc Admin ID.' };
  }

  let adminUser = null;
  try {
    adminUser = await discordClient.users.fetch(adminId);
  } catch (err) {
    console.warn(`[BotHostingReminder] Không thể fetch Discord Admin ID [${adminId}]:`, err.message);
    return { success: false, message: err.message };
  }

  if (!adminUser) return { success: false, message: 'Không tìm thấy Admin User.' };

  const nowVN = new Date(Date.now() + 7 * 3600000).toLocaleTimeString('vi-VN', { hour12: false });
  let reminderCount = 0;

  for (const acc of activeAccounts) {
    let deployments = [];
    try {
      deployments = await listDeployments(acc.apiKey);
    } catch (e) {
      // Fallback về danh sách lưu trong DB nếu API lỗi
      deployments = acc.deployments || [];
    }

    let depListText = '';
    if (deployments.length > 0) {
      depListText = deployments.map((d, idx) => {
        const dId = d.id || d.deploymentId || 'N/A';
        const dName = d.name || `Worker-${idx + 1}`;
        const dStatus = d.status || 'unknown';
        return `• **${dName}** (ID: \`${dId}\`) - Trạng thái: \`${dStatus}\``;
      }).join('\n');
    } else {
      depListText = '• *Hiện chưa có Worker nào đang chạy.*';
    }

    const message = 
      `⏰ **[NHẮC NHỞ GIA HẠN BOT-HOSTING] (Hẹn giờ: 8:00 AM)**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 **Tài khoản:** \`${acc.name || acc.accountId}\`\n` +
      `🛰️ **Danh sách Worker:**\n${depListText}\n\n` +
      `⚠️ **LƯU Ý:** Gói Free của Bot-Hosting yêu cầu **bấm Renew mỗi 4 ngày** để duy trì Worker không bị ngắt kết nối!\n\n` +
      `🔗 **Truy cập nhanh để gia hạn:**\n` +
      `👉 **[Click vào đây để vào Panel Bot-Hosting](${PANEL_URL})**\n\n` +
      `💡 *Các bước bấm:* Chọn server ➔ Vào mục **Billing** ➔ Bấm **Renew free plan** ➔ Chờ xác minh ➔ Bấm **Renew for...** hoàn tất!`;

    try {
      await adminUser.send(message);
      reminderCount++;
      // Cập nhật lastRemindedAt vào DB
      await saveBotHostingAccount({
        ...acc,
        lastRemindedAt: new Date()
      }).catch(() => {});
    } catch (sendErr) {
      console.warn(`[BotHostingReminder] Lỗi gửi DM cho Admin cho tài khoản [${acc.accountId}]:`, sendErr.message);
    }
  }

  console.log(`[BotHostingReminder] ✅ Đã gửi tin nhắn nhắc nhở cho ${reminderCount} tài khoản tới Admin lúc ${nowVN}.`);
  return { success: true, count: reminderCount };
}

/**
 * Khởi động bộ lập lịch gửi tin nhắn nhắc nhở vào đúng 8:00 AM mỗi ngày
 */
function startBotHostingReminderScheduler({ discordClient = null, adminId = '' } = {}) {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  function scheduleNextRun() {
    const delay = getMsUntilNext8AM();
    const hours = (delay / 3600000).toFixed(1);
    console.log(`[BotHostingReminder] ⏰ Đã kích hoạt bộ lập lịch! Lần nhắc gia hạn tiếp theo vào 8:00 AM (sau ~${hours} giờ).`);

    schedulerTimer = setTimeout(async () => {
      try {
        await sendBotHostingReminder({ discordClient, adminId, manual: false });
      } catch (err) {
        console.error('[BotHostingReminder] Lỗi trong chu kỳ nhắc nhở 8h sáng:', err.message);
      }
      // Lên lịch đệ quy cho ngày tiếp theo
      scheduleNextRun();
    }, delay);
  }

  scheduleNextRun();
}

module.exports = {
  callBotHostingApi,
  listDeployments,
  getDeployment,
  createWorkerDeployment,
  restartDeployment,
  deleteDeployment,
  sendBotHostingReminder,
  startBotHostingReminderScheduler,
  getAllBotHostingAccounts,
  saveBotHostingAccount,
  deleteBotHostingAccount
};
