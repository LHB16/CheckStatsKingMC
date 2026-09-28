/**
 * helpers/renderManager.js - Quản lý Xoay Vòng Worker Render qua Render API v1
 * Lưu trữ cấu hình và trạng thái bền vững trên MongoDB Atlas.
 */

const {
  getAllRenderAccounts,
  saveRenderAccount,
  getSystemConfig,
  setSystemConfig,
  getWorkerModel,
  isMongoAvailable
} = require('./mongoHelper');

const RENDER_API_BASE = 'https://api.render.com/v1';
const DEFAULT_REGIONS = ['singapore', 'oregon', 'ohio', 'frankfurt', 'virginia'];

// Lock chống xoay dồn dập (Cooldown)
let isRotating = false;
let lastRotationTime = 0;
const ROTATION_COOLDOWN_MS = 60000; // 60 giây giữa các lần xoay

/**
 * Gọi Render API với fetch
 */
async function callRenderApi(endpoint, apiKey, options = {}) {
  const url = `${RENDER_API_BASE}${endpoint}`;
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
    throw new Error(`[RenderAPI ${response.status}] ${message}`);
  }

  // HTTP 204 No Content
  if (response.status === 204) {
    return true;
  }

  return await response.json();
}

/**
 * Random một Region mới khác với Region cũ
 */
function getRandomRegion(allowedRegions = DEFAULT_REGIONS, excludeRegion = '') {
  const pool = Array.isArray(allowedRegions) && allowedRegions.length > 0 
    ? allowedRegions 
    : DEFAULT_REGIONS;

  const filtered = pool.filter(r => r.toLowerCase() !== (excludeRegion || '').toLowerCase());
  const finalPool = filtered.length > 0 ? filtered : pool;
  const randomIndex = Math.floor(Math.random() * finalPool.length);
  return finalPool[randomIndex];
}

/**
 * Lấy danh sách tài khoản Render từ MongoDB
 */
async function getAccounts() {
  const accounts = await getAllRenderAccounts();
  return accounts.filter(acc => acc.isActive && acc.apiKey);
}

/**
 * Chọn tài khoản Render tiếp theo để triển khai Worker
 * Ưu tiên: tài khoản có ít lần xoay nhất hoặc lâu chưa xoay nhất
 */
async function getNextAvailableAccount() {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    throw new Error('Chưa có tài khoản Render nào được cấu hình trong MongoDB (Collection: render_accounts).');
  }

  // Sắp xếp: Ưu tiên tài khoản chưa xoay lần nào, hoặc lastRotatedAt xa nhất
  accounts.sort((a, b) => {
    const timeA = a.lastRotatedAt ? new Date(a.lastRotatedAt).getTime() : 0;
    const timeB = b.lastRotatedAt ? new Date(b.lastRotatedAt).getTime() : 0;
    return timeA - timeB;
  });

  return accounts[0];
}

/**
 * Xóa Service Render theo Service ID
 */
async function deleteService(apiKey, serviceId) {
  if (!serviceId) return false;
  console.log(`[RenderManager] 🗑️ Đang gửi yêu cầu xóa Service [${serviceId}] trên Render...`);
  try {
    await callRenderApi(`/services/${serviceId}`, apiKey, { method: 'DELETE' });
    console.log(`[RenderManager] ✅ Đã xóa Service [${serviceId}] thành công.`);
    return true;
  } catch (err) {
    console.warn(`[RenderManager] ⚠️ Cảnh báo khi xóa Service [${serviceId}]: ${err.message}`);
    return false;
  }
}

/**
 * Tạo Worker Web Service mới trên Render
 */
async function createWorkerService(account, options = {}) {
  const {
    region,
    masterUrl,
    workerSecret,
    mcServerHosts,
    mcServerPort
  } = options;

  const repo = account.repo || process.env.GITHUB_REPO || 'https://github.com/luuhuubinh/botCheckStatsKingMC';
  const branch = account.branch || 'main';
  const serviceName = `kingmc-worker-${Math.random().toString(36).substring(2, 7)}`;

  // Chuẩn bị biến môi trường cho Worker
  const envVars = [
    { key: 'BOT_ROLE', value: 'worker' },
    { key: 'MASTER_URL', value: masterUrl || process.env.RENDER_EXTERNAL_URL || process.env.MASTER_URL || '' },
    { key: 'WORKER_SECRET', value: workerSecret || process.env.WORKER_SECRET || '' },
    { key: 'MC_SERVER_HOSTS', value: mcServerHosts || process.env.MC_SERVER_HOSTS || 'sgp.kingmc.vn,kingmc.vn' },
    { key: 'MC_SERVER_PORT', value: String(mcServerPort || process.env.MC_SERVER_PORT || '25565') },
    { key: 'NODE_ENV', value: 'production' }
  ];

  const payload = {
    type: 'web_service',
    name: serviceName,
    ownerId: account.ownerId,
    repo,
    branch,
    autoDeploy: 'yes',
    serviceDetails: {
      env: 'node',
      region: region || 'singapore',
      plan: 'free',
      buildCommand: 'npm install',
      startCommand: 'node index.js',
      envVars
    }
  };

  console.log(`[RenderManager] 🚀 Đang tạo Worker Service mới [${serviceName}] tại Region [${region}] trên Render...`);
  const result = await callRenderApi('/services', account.apiKey, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const service = result.service || result;
  return service;
}

/**
 * Chờ và lấy Public URL của Service sau khi tạo
 */
async function waitForServiceUrl(apiKey, serviceId, maxAttempts = 6) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const data = await callRenderApi(`/services/${serviceId}`, apiKey, { method: 'GET' });
      const service = data.service || data;
      const url = service?.serviceDetails?.url || service?.url;
      if (url) {
        return url.startsWith('http') ? url : `https://${url}`;
      }
    } catch (e) {
      console.warn(`[RenderManager] Lần thử ${i + 1}/${maxAttempts} lấy URL thất bại: ${e.message}`);
    }
    // Chờ 1.5 giây rồi thử lại
    await new Promise(r => setTimeout(r, 1500));
  }
  return null;
}

/**
 * Gửi Webhook cập nhật URL sang Google Apps Script
 */
async function notifyGoogleAppsScript(action, workerUrl) {
  try {
    const gasUrl = (await getSystemConfig('gas_keepalive_url', null)) || process.env.GAS_KEEPALIVE_URL;
    if (!gasUrl || !gasUrl.startsWith('http')) {
      console.log('[RenderManager] Chưa cấu hình gas_keepalive_url, bỏ qua thông báo Apps Script.');
      return false;
    }

    console.log(`[RenderManager] 📡 Đang gửi Webhook sang Google Apps Script (Action: ${action}, URL: ${workerUrl})...`);
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action, // 'add' | 'remove'
        url: workerUrl,
        timestamp: new Date().toISOString()
      })
    });

    if (res.ok) {
      console.log(`[RenderManager] ✅ Đồng bộ Google Apps Script thành công (${action}).`);
      return true;
    } else {
      console.warn(`[RenderManager] ⚠️ Apps Script trả về mã: ${res.status}`);
      return false;
    }
  } catch (err) {
    console.warn(`[RenderManager] ⚠️ Lỗi gửi Webhook sang Apps Script: ${err.message}`);
    return false;
  }
}

/**
 * Điều phối toàn bộ quy trình Xoay Vòng Worker (Auto Rotation Pipeline)
 * @param {Object} params - Thông tin worker bị limit: { workerUrl, reason, username, queueDispatcher, discordClient, adminId }
 */
async function rotateWorker({
  workerUrl = '',
  reason = 'IP Limit',
  username = '',
  queueDispatcher = null,
  discordClient = null,
  adminId = ''
} = {}) {
  const now = Date.now();

  // Kiểm tra tính năng tự động xoay có bị tắt không
  const isEnabled = await getSystemConfig('auto_rotate_enabled', true);
  if (!isEnabled) {
    console.log('[RenderManager] ⚠️ Tính năng Auto-Rotation hiện đang TẮT trong system_configs.');
    return { success: false, reason: 'Auto-Rotation is disabled' };
  }

  // Kiểm tra Cooldown
  if (isRotating || (now - lastRotationTime < ROTATION_COOLDOWN_MS)) {
    console.log(`[RenderManager] ⏳ Đang trong thời gian cooldown xoay vòng (còn ${Math.ceil((ROTATION_COOLDOWN_MS - (now - lastRotationTime)) / 1000)}s). Bỏ qua request.`);
    return { success: false, reason: 'Cooldown active' };
  }

  isRotating = true;
  lastRotationTime = now;

  console.log(`\n=============================================================`);
  console.log(`🔄 [RenderManager] KÍCH HOẠT TIẾN TRÌNH TỰ ĐỘNG XOAY RENDER WORKER`);
  console.log(`• Worker cũ: ${workerUrl || 'N/A'}`);
  console.log(`• Username: ${username || 'N/A'}`);
  console.log(`• Lý do: ${reason}`);
  console.log(`=============================================================\n`);

  try {
    // 1. Tìm tài khoản Render tương ứng
    const accounts = await getAccounts();
    if (accounts.length === 0) {
      throw new Error('Không tìm thấy tài khoản Render nào trong MongoDB (Collection: render_accounts).');
    }

    // Tìm tài khoản đang chạy URL này, nếu không thấy thì chọn tài khoản tiếp theo
    let targetAccount = accounts.find(a => 
      (a.activeServiceUrl && workerUrl && a.activeServiceUrl.includes(workerUrl)) ||
      (a.activeServiceUrl && workerUrl && workerUrl.includes(a.activeServiceUrl))
    );

    if (!targetAccount) {
      targetAccount = await getNextAvailableAccount();
    }

    console.log(`[RenderManager] Sử dụng tài khoản Render: [${targetAccount.name || targetAccount.accountId}]`);

    // 2. Xóa Service cũ nếu có
    const oldServiceId = targetAccount.activeServiceId;
    const oldRegion = targetAccount.currentRegion || 'singapore';
    const oldUrl = targetAccount.activeServiceUrl || workerUrl;

    if (oldServiceId) {
      await deleteService(targetAccount.apiKey, oldServiceId);
    }

    // Gỡ Worker cũ khỏi QueueDispatcher & MongoDB Worker
    if (oldUrl) {
      if (queueDispatcher) {
        const allW = await queueDispatcher.getAllWorkers();
        const found = allW.find(w => w.url === oldUrl || oldUrl.includes(w.url));
        if (found) {
          await queueDispatcher.removeWorker(found._id).catch(() => {});
          console.log(`[RenderManager] Đã gỡ Worker cũ khỏi QueueDispatcher: ${oldUrl}`);
        }
      } else if (isMongoAvailable()) {
        const WorkerModel = getWorkerModel();
        await WorkerModel.deleteMany({ url: { $regex: oldUrl } });
      }

      // Thông báo Google Apps Script gỡ URL cũ
      await notifyGoogleAppsScript('remove', oldUrl);
    }

    // 3. Chọn ngẫu nhiên Region mới (khác với Region cũ)
    const newRegion = getRandomRegion(targetAccount.allowedRegions, oldRegion);
    console.log(`[RenderManager] Đổi khu vực: [${oldRegion}] ➔ [${newRegion}]`);

    // 4. Tạo Service mới trên Render
    const masterUrl = (await getSystemConfig('master_url', null)) || process.env.RENDER_EXTERNAL_URL || process.env.MASTER_URL || '';
    const newService = await createWorkerService(targetAccount, {
      region: newRegion,
      masterUrl,
      workerSecret: process.env.WORKER_SECRET,
      mcServerHosts: process.env.MC_SERVER_HOSTS,
      mcServerPort: process.env.MC_SERVER_PORT
    });

    const newServiceId = newService.id;
    console.log(`[RenderManager] Đã tạo Service mới trên Render. ID: [${newServiceId}]`);

    // 5. Lấy Public URL của Service mới
    let newUrl = newService?.serviceDetails?.url || newService?.url;
    if (!newUrl) {
      newUrl = await waitForServiceUrl(targetAccount.apiKey, newServiceId);
    }
    if (!newUrl && newService.slug) {
      newUrl = `https://${newService.slug}.onrender.com`;
    }

    console.log(`[RenderManager] 🌐 Public URL của Worker mới: [${newUrl || 'Đang cấp phát...'}]`);

    // 6. Cập nhật trạng thái vào MongoDB (Collection: render_accounts)
    await saveRenderAccount({
      accountId: targetAccount.accountId,
      activeServiceId: newServiceId,
      activeServiceUrl: newUrl || '',
      currentRegion: newRegion,
      lastRotatedAt: new Date(),
      rotationCount: (targetAccount.rotationCount || 0) + 1
    });

    // 7. Thêm Worker mới vào QueueDispatcher / MongoDB WorkerModel
    if (newUrl) {
      if (queueDispatcher) {
        await queueDispatcher.addWorker({
          name: `Worker-${newRegion.toUpperCase()}`,
          url: newUrl,
          secret: process.env.WORKER_SECRET || ''
        }).catch(e => console.warn('[RenderManager] Lỗi thêm worker vào QueueDispatcher:', e.message));
      }

      // 8. Đăng ký URL mới sang Google Apps Script để kích hoạt ping 5 phút/lần
      await notifyGoogleAppsScript('add', newUrl);
    }

    // 9. Gửi thông báo đến Admin Discord
    if (discordClient && adminId) {
      try {
        const adminUser = await discordClient.users.fetch(adminId);
        if (adminUser) {
          const alertMessage = 
            `🔄 **[Render Auto-Rotation] Đã Xoay Worker Thành Công!**\n` +
            `• **Lý do kích hoạt:** \`${reason}\`\n` +
            `• **Tài khoản Render:** \`${targetAccount.name || targetAccount.accountId}\`\n` +
            `• **Đổi Region:** \`${oldRegion}\` ➔ \`${newRegion}\` (Đã nhận dải IP mới)\n` +
            `• **Worker cũ (Đã xóa):** \`${oldUrl || 'N/A'}\`\n` +
            `• **Worker mới (Đang deploy):** \`${newUrl || 'Đang tạo'}\`\n` +
            `• **Google Apps Script:** Đã cập nhật URL ping giữ Online\n` +
            `• **MongoDB Atlas:** Đã đồng bộ trạng thái vĩnh viễn.`;
          await adminUser.send(alertMessage);
        }
      } catch (err) {
        console.warn('[RenderManager] Không thể gửi thông báo Discord Admin:', err.message);
      }
    }

    console.log(`[RenderManager] 🎉 Quy trình Xoay Vòng Worker hoàn tất thành công!\n`);
    return {
      success: true,
      serviceId: newServiceId,
      url: newUrl,
      region: newRegion
    };

  } catch (err) {
    console.error(`[RenderManager] ❌ Lỗi nghiêm trọng trong quá trình xoay Worker: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    isRotating = false;
  }
}

module.exports = {
  callRenderApi,
  getRandomRegion,
  getAccounts,
  getNextAvailableAccount,
  deleteService,
  createWorkerService,
  waitForServiceUrl,
  notifyGoogleAppsScript,
  rotateWorker
};
