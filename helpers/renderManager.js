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

// Quản lý Lock và Cooldown theo từng tài khoản riêng biệt để không chặn lẫn nhau
const activeAccountRotations = new Set();
const accountCooldownMap = new Map();
const ACCOUNT_COOLDOWN_MS = 25000; // 25 giây giữa các lần xoay cho cùng 1 tài khoản
let isRotatingAll = false;

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
 * Lấy Environment ID mặc định của tài khoản (từ Project đầu tiên nếu có)
 */
async function getDefaultEnvironmentId(apiKey, ownerId) {
  try {
    const endpoint = ownerId ? `/projects?ownerId=${ownerId}&limit=10` : `/projects?limit=10`;
    const res = await callRenderApi(endpoint, apiKey, { method: 'GET' });
    if (Array.isArray(res) && res.length > 0) {
      for (const item of res) {
        const proj = item.project || item;
        if (Array.isArray(proj.environmentIds) && proj.environmentIds.length > 0) {
          console.log(`[RenderManager] 📁 Tìm thấy Project [${proj.name}] (Env: ${proj.environmentIds[0]})`);
          return proj.environmentIds[0];
        }
      }
    }
    return null;
  } catch (err) {
    console.warn(`[RenderManager] Không thể lấy Project Environment: ${err.message}`);
    return null;
  }
}

/**
 * Lấy danh sách các Service trên Render của tài khoản (gộp cả Ungrouped và trong Project)
 */
async function listServices(apiKey, ownerId, environmentId = null) {
  const serviceMap = new Map();
  try {
    const endpoint = ownerId ? `/services?ownerId=${ownerId}&limit=50` : `/services?limit=50`;
    const res = await callRenderApi(endpoint, apiKey, { method: 'GET' });
    if (Array.isArray(res)) {
      for (const item of res) {
        const s = item.service || item;
        if (s && s.id) serviceMap.set(s.id, s);
      }
    }
  } catch (err) {
    console.warn(`[RenderManager] ⚠️ Không thể lấy Services theo ownerId từ Render: ${err.message}`);
  }

  // Quét thêm các service nằm trong Environment của Project (nếu có)
  const targetEnvId = environmentId || await getDefaultEnvironmentId(apiKey, ownerId);
  if (targetEnvId) {
    try {
      const envRes = await callRenderApi(`/services?environmentId=${targetEnvId}&limit=50`, apiKey, { method: 'GET' });
      if (Array.isArray(envRes)) {
        for (const item of envRes) {
          const s = item.service || item;
          if (s && s.id) serviceMap.set(s.id, s);
        }
      }
    } catch (e) {}
  }

  return Array.from(serviceMap.values());
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

  // Chuẩn bị biến môi trường cho Worker (Chuẩn Render API: mảng các { key, value } chuỗi)
  const envVars = [
    { key: 'BOT_ROLE', value: 'worker' },
    { key: 'RENDER_ACCOUNT_ID', value: String(account.accountId || '') },
    { key: 'MASTER_URL', value: String(masterUrl || process.env.RENDER_EXTERNAL_URL || process.env.MASTER_URL || '') },
    { key: 'WORKER_SECRET', value: String(workerSecret || process.env.WORKER_SECRET || '') },
    { key: 'MC_SERVER_HOSTS', value: String(mcServerHosts || process.env.MC_SERVER_HOSTS || 'sgp.kingmc.vn,kingmc.vn') },
    { key: 'MC_SERVER_PORT', value: String(mcServerPort || process.env.MC_SERVER_PORT || '25565') },
    { key: 'NODE_ENV', value: 'production' }
  ];

  // Tự động tìm Environment ID của Project (ví dụ: "My project") để gom worker vào chung project
  const targetEnvId = account.environmentId || await getDefaultEnvironmentId(account.apiKey, account.ownerId);

  // Chuẩn cấu trúc Render API v1 POST /services:
  // - environmentId: nếu có, đưa service vào Project tương ứng
  // - envVars nằm ở cấp root của request body
  // - serviceDetails chứa runtime, plan, region
  // - envSpecificDetails chứa buildCommand, startCommand đối với native runtime (node)
  const payload = {
    type: 'web_service',
    name: serviceName,
    ownerId: account.ownerId,
    repo,
    branch,
    autoDeploy: 'yes',
    envVars,
    serviceDetails: {
      runtime: 'node',
      env: 'node',
      region: region || 'singapore',
      plan: 'free',
      envSpecificDetails: {
        buildCommand: 'npm install',
        startCommand: 'node index.js'
      }
    }
  };

  if (targetEnvId) {
    payload.environmentId = targetEnvId;
    console.log(`[RenderManager] 📦 Gom Worker mới vào Project (Environment: ${targetEnvId})`);
  }

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
 * Thực hiện xoay Worker cho 1 tài khoản Render cụ thể
 */
async function rotateSingleAccount(targetAccount, {
  workerUrl = '',
  reason = 'Manual Rotation',
  queueDispatcher = null,
  discordClient = null,
  adminId = ''
} = {}) {
  console.log(`\n-------------------------------------------------------------`);
  console.log(`🔄 [RenderManager] Xoay Worker cho tài khoản: [${targetAccount.name || targetAccount.accountId}]`);
  console.log(`-------------------------------------------------------------`);

  // 1. Xóa Service cũ nếu có
  const oldServiceId = targetAccount.activeServiceId;
  const oldRegion = targetAccount.currentRegion || 'singapore';
  const oldUrl = targetAccount.activeServiceUrl || workerUrl;

  if (oldServiceId) {
    await deleteService(targetAccount.apiKey, oldServiceId);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Quét dọn dẹp các service worker cũ tồn đọng trên tài khoản này
  try {
    console.log(`[RenderManager] 🔍 Đang quét dọn dẹp Worker cũ trên tài khoản [${targetAccount.name || targetAccount.accountId}]...`);
    const existingServices = await listServices(targetAccount.apiKey, targetAccount.ownerId);
    const matchedWorkers = existingServices.filter(s => {
      if (s.id === oldServiceId) return false;
      const sUrl = s?.serviceDetails?.url || s?.url || '';
      const isUrlMatch = (workerUrl && sUrl && (sUrl.includes(workerUrl) || workerUrl.includes(sUrl))) ||
                         (oldUrl && sUrl && (sUrl.includes(oldUrl) || oldUrl.includes(sUrl)));
      const isNameMatch = s?.name && s.name.startsWith('kingmc-worker-');
      return isUrlMatch || isNameMatch;
    });

    for (const w of matchedWorkers) {
      console.log(`[RenderManager] 🗑️ Dọn dẹp Worker cũ tồn đọng: [${w.id}] (${w.name})...`);
      await deleteService(targetAccount.apiKey, w.id);
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (cleanErr) {
    console.warn(`[RenderManager] ⚠️ Cảnh báo quét dọn dẹp worker cũ: ${cleanErr.message}`);
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

    await notifyGoogleAppsScript('remove', oldUrl);
  }

  // 2. Chọn Region mới ngẫu nhiên (khác Region cũ)
  const newRegion = getRandomRegion(targetAccount.allowedRegions, oldRegion);
  console.log(`[RenderManager] Đổi khu vực [${targetAccount.name || targetAccount.accountId}]: [${oldRegion}] ➔ [${newRegion}]`);

  // 3. Tạo Service mới trên Render
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

  // 4. Lấy Public URL của Service mới
  let newUrl = newService?.serviceDetails?.url || newService?.url;
  if (!newUrl) {
    newUrl = await waitForServiceUrl(targetAccount.apiKey, newServiceId);
  }
  if (!newUrl && newService.slug) {
    newUrl = `https://${newService.slug}.onrender.com`;
  }

  console.log(`[RenderManager] 🌐 Public URL của Worker mới: [${newUrl || 'Đang cấp phát...'}]`);

  // 5. Cập nhật trạng thái vào MongoDB (Collection: render_accounts)
  await saveRenderAccount({
    accountId: targetAccount.accountId,
    activeServiceId: newServiceId,
    activeServiceUrl: newUrl || '',
    currentRegion: newRegion,
    lastRotatedAt: new Date(),
    rotationCount: (targetAccount.rotationCount || 0) + 1
  });

  // 6. Thêm Worker mới vào QueueDispatcher / MongoDB WorkerModel
  if (newUrl) {
    if (queueDispatcher) {
      await queueDispatcher.addWorker({
        name: `Worker-${targetAccount.name || targetAccount.accountId}-${newRegion.toUpperCase()}`,
        url: newUrl,
        secret: process.env.WORKER_SECRET || ''
      }).catch(e => console.warn('[RenderManager] Lỗi thêm worker vào QueueDispatcher:', e.message));
    }

    await notifyGoogleAppsScript('add', newUrl);
  }

  // 7. Gửi thông báo đến Admin Discord
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

  console.log(`[RenderManager] ✅ Hoàn tất xoay tài khoản [${targetAccount.name || targetAccount.accountId}]!\n`);
  return {
    success: true,
    accountId: targetAccount.accountId,
    name: targetAccount.name,
    serviceId: newServiceId,
    url: newUrl,
    region: newRegion,
    oldRegion
  };
}

/**
 * Xoay Vòng Toàn Bộ Worker trên tất cả các tài khoản Render đang kích hoạt
 */
async function rotateAllWorkers(options = {}) {
  const accounts = await getAccounts();
  if (accounts.length === 0) {
    throw new Error('Không tìm thấy tài khoản Render nào đang kích hoạt trong MongoDB.');
  }

  console.log(`\n=============================================================`);
  console.log(`🔄 [RenderManager] BẮT ĐẦU XOAY TOÀN BỘ WORKER (${accounts.length} TÀI KHOẢN)`);
  console.log(`• Danh sách tài khoản: ${accounts.map(a => a.name || a.accountId).join(', ')}`);
  console.log(`=============================================================\n`);

  const results = [];
  for (const acc of accounts) {
    try {
      const res = await rotateSingleAccount(acc, options);
      results.push(res);
    } catch (err) {
      console.error(`[RenderManager] ❌ Lỗi xoay tài khoản [${acc.name || acc.accountId}]: ${err.message}`);
      results.push({
        success: false,
        accountId: acc.accountId,
        name: acc.name,
        error: err.message
      });
    }
    // Nghỉ 2 giây giữa các tài khoản để đảm bảo ổn định
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=============================================================`);
  console.log(`🎉 [RenderManager] ĐÃ HOÀN TẤT XOAY TOÀN BỘ WORKER! (${results.filter(r => r.success).length}/${accounts.length} thành công)`);
  console.log(`=============================================================\n`);

  return {
    success: true,
    total: accounts.length,
    successful: results.filter(r => r.success).length,
    results
  };
}

/**
 * Điều phối toàn bộ quy trình Xoay Vòng Worker (Auto Rotation Pipeline)
 * @param {Object} params - { workerUrl, reason, username, rotateAll, accountId, queueDispatcher, discordClient, adminId }
 */
async function rotateWorker({
  workerUrl = '',
  reason = 'IP Limit',
  username = '',
  rotateAll = false,
  accountId = null,
  serviceId = null,
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

  // 1. Trường hợp xoay đồng loạt TẤT CẢ Worker
  if (rotateAll) {
    if (isRotatingAll) {
      console.log('[RenderManager] ⏳ Đang có tiến trình xoay toàn bộ Worker đang chạy. Bỏ qua request.');
      return { success: false, reason: 'Rotate all already in progress' };
    }
    isRotatingAll = true;
    try {
      return await rotateAllWorkers({
        reason,
        queueDispatcher,
        discordClient,
        adminId
      });
    } finally {
      isRotatingAll = false;
    }
  }

  try {
    // 2. Tìm tài khoản Render cụ thể
    const accounts = await getAccounts();
    if (accounts.length === 0) {
      throw new Error('Không tìm thấy tài khoản Render nào trong MongoDB (Collection: render_accounts).');
    }

    const cleanUrl = (u) => (u || '').replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();

    let targetAccount = null;

    // Ưu tiên 1: Theo accountId
    if (accountId) {
      targetAccount = accounts.find(a => a.accountId === accountId);
    }

    // Ưu tiên 2: Theo serviceId
    if (!targetAccount && serviceId) {
      targetAccount = accounts.find(a => a.activeServiceId === serviceId);
    }

    // Ưu tiên 3: Theo Worker URL
    if (!targetAccount && workerUrl) {
      const cWorker = cleanUrl(workerUrl);
      targetAccount = accounts.find(a => {
        if (!a.activeServiceUrl) return false;
        const cActive = cleanUrl(a.activeServiceUrl);
        return cActive === cWorker || cActive.includes(cWorker) || cWorker.includes(cActive);
      });
    }

    // Ưu tiên 4: Fallback tài khoản tiếp theo
    if (!targetAccount) {
      targetAccount = await getNextAvailableAccount();
    }

    const targetId = targetAccount.accountId;

    // Kiểm tra nếu tài khoản này đang trong tiến trình xoay
    if (activeAccountRotations.has(targetId)) {
      console.log(`[RenderManager] ⏳ Tài khoản [${targetAccount.name || targetId}] đang trong quá trình xoay. Bỏ qua request trùng lặp.`);
      return { success: false, reason: 'Account rotation already in progress' };
    }

    // Kiểm tra Cooldown riêng của tài khoản này
    const lastRotatedTime = accountCooldownMap.get(targetId) || 0;
    if (now - lastRotatedTime < ACCOUNT_COOLDOWN_MS) {
      const remainingSec = Math.ceil((ACCOUNT_COOLDOWN_MS - (now - lastRotatedTime)) / 1000);
      console.log(`[RenderManager] ⏳ Tài khoản [${targetAccount.name || targetId}] đang trong cooldown (còn ${remainingSec}s). Bỏ qua request.`);
      return { success: false, reason: 'Account cooldown active' };
    }

    activeAccountRotations.add(targetId);
    accountCooldownMap.set(targetId, now);

    try {
      return await rotateSingleAccount(targetAccount, {
        workerUrl,
        reason,
        queueDispatcher,
        discordClient,
        adminId
      });
    } finally {
      activeAccountRotations.delete(targetId);
    }

  } catch (err) {
    console.error(`[RenderManager] ❌ Lỗi nghiêm trọng trong quá trình xoay Worker: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  callRenderApi,
  getRandomRegion,
  getAccounts,
  getNextAvailableAccount,
  listServices,
  deleteService,
  createWorkerService,
  waitForServiceUrl,
  notifyGoogleAppsScript,
  rotateSingleAccount,
  rotateAllWorkers,
  rotateWorker
};

