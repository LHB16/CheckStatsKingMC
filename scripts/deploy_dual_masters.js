/**
 * scripts/deploy_dual_masters.js - Tự động tạo 2 Master Web Service trên Render qua Render API v1
 */

require('dotenv').config();
const { connectMongo, getAllRenderAccounts, setSystemConfig, saveRenderAccount } = require('../helpers/mongoHelper');
const renderManager = require('../helpers/renderManager');

const RENDER_API_BASE = 'https://api.render.com/v1';

async function callRenderApi(endpoint, apiKey, options = {}) {
  const url = `${RENDER_API_BASE}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Accept': 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });
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
  if (response.status === 204) return true;
  return await response.json();
}

async function getDefaultEnvironmentId(apiKey, ownerId) {
  try {
    const endpoint = ownerId ? `/projects?ownerId=${ownerId}&limit=10` : `/projects?limit=10`;
    const res = await callRenderApi(endpoint, apiKey, { method: 'GET' });
    if (Array.isArray(res) && res.length > 0) {
      for (const item of res) {
        const proj = item.project || item;
        if (Array.isArray(proj.environmentIds) && proj.environmentIds.length > 0) {
          return proj.environmentIds[0];
        }
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function waitForServiceUrl(apiKey, serviceId, maxWaitSec = 60) {
  const startTime = Date.now();
  while ((Date.now() - startTime) < maxWaitSec * 1000) {
    try {
      const res = await callRenderApi(`/services/${serviceId}`, apiKey, { method: 'GET' });
      const service = res?.service || res;
      const url = service?.serviceDetails?.url || service?.url;
      if (url) return url;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 4000));
  }
  return `https://${serviceId}.onrender.com`;
}

async function createMasterServiceOnAccount(account, config) {
  const { instanceId, instanceName, region, serviceName } = config;

  const repo = 'https://github.com/LHB16/CheckStatsKingMC';
  const branch = 'main';

  const envVars = [
    { key: 'ADMIN_ID', value: String(process.env.ADMIN_ID || '1056490968343396352') },
    { key: 'BOT_ROLE', value: 'master' },
    { key: 'CLIENT_ID', value: String(process.env.CLIENT_ID || '1526205250627834007') },
    { key: 'DISCORD_TOKEN', value: String(process.env.DISCORD_TOKEN || '') },
    { key: 'GITHUB_REPO', value: String(process.env.GITHUB_REPO || 'https://github.com/LHB16/CheckStatsKingMC') },
    { key: 'GROQ_API_KEYS', value: String(process.env.GROQ_API_KEYS || '') },
    { key: 'GROQ_MODEL', value: String(process.env.GROQ_MODEL || 'openai/gpt-oss-120b') },
    { key: 'MONGODB_URI', value: String(process.env.MONGODB_URI || '') },
    { key: 'WORKER_SECRET', value: String(process.env.WORKER_SECRET || '') },
    { key: 'WORKER_URLS', value: String(process.env.WORKER_URLS || '') },
    { key: 'MASTER_INSTANCE_ID', value: instanceId },
    { key: 'MASTER_NAME', value: instanceName },
    { key: 'PUPPETEER_SKIP_DOWNLOAD', value: 'false' },
    { key: 'NODE_ENV', value: 'production' }
  ];

  const targetEnvId = account.environmentId || await getDefaultEnvironmentId(account.apiKey, account.ownerId);

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
  }

  console.log(`[DeployMaster] 🚀 Đang gửi yêu cầu tạo [${serviceName}] (${instanceName}) tại Region [${region}] trên Render account [${account.name}]...`);
  const result = await callRenderApi('/services', account.apiKey, {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const createdService = result?.service || result;
  const serviceId = createdService.id;
  console.log(`[DeployMaster] ✅ Đã tạo Service thành công! Service ID: ${serviceId}`);

  let publicUrl = createdService?.serviceDetails?.url || createdService?.url;
  if (!publicUrl) {
    console.log(`[DeployMaster] ⏳ Đang đợi Render cấp phát Public URL cho ${serviceName}...`);
    publicUrl = await waitForServiceUrl(account.apiKey, serviceId);
  }
  console.log(`[DeployMaster] 🌐 Public URL: ${publicUrl}`);

  return { serviceId, publicUrl, serviceName };
}

(async () => {
  const connected = await connectMongo();
  if (!connected) {
    console.error('Không thể kết nối MongoDB Atlas');
    process.exit(1);
  }

  const accounts = await getAllRenderAccounts();
  const acc1 = accounts.find(a => a.accountId === 'render_acc_01');
  const acc2 = accounts.find(a => a.accountId === 'render_acc_02');

  if (!acc1 || !acc2) {
    console.error('Không tìm thấy đủ render_acc_01 và render_acc_02');
    process.exit(1);
  }

  console.log('==================================================');
  console.log('🚀 BẮT ĐẦU TẠO 2 MASTER WEB SERVICE TRÊN RENDER');
  console.log('==================================================');

  // Master 1: Singapore
  const master1Config = {
    instanceId: 'master-render-01',
    instanceName: 'Master-Render-01 (Primary)',
    region: 'singapore',
    serviceName: `checkstatskingmc-master-01`
  };
  const master1 = await createMasterServiceOnAccount(acc1, master1Config);

  // Master 2: Oregon
  const master2Config = {
    instanceId: 'master-render-02',
    instanceName: 'Master-Render-02 (Backup)',
    region: 'oregon',
    serviceName: `checkstatskingmc-master-02`
  };
  const master2 = await createMasterServiceOnAccount(acc2, master2Config);

  console.log('\n==================================================');
  console.log('🎉 TẠO 2 MASTER THÀNH CÔNG!');
  console.log(`1. MASTER 1 (Primary - Singapore): ${master1.publicUrl} (ID: ${master1.serviceId})`);
  console.log(`2. MASTER 2 (Backup - Oregon):    ${master2.publicUrl} (ID: ${master2.serviceId})`);
  console.log('==================================================\n');

  // Đồng bộ master_url ban đầu sang Master 1
  await setSystemConfig('master_url', master1.publicUrl, 'URL của Active Master Node hiện tại');
  console.log(`[DeployMaster] 📡 Đã gán master_url mặc định ban đầu: ${master1.publicUrl}`);

  // Cập nhật thông tin vào tài khoản render trong DB
  acc1.activeServiceId = master1.serviceId;
  acc1.activeServiceUrl = master1.publicUrl;
  acc1.currentRegion = 'singapore';
  await saveRenderAccount(acc1);

  acc2.activeServiceId = master2.serviceId;
  acc2.activeServiceUrl = master2.publicUrl;
  acc2.currentRegion = 'oregon';
  await saveRenderAccount(acc2);

  // Gửi thông báo tới Google Apps Script để ping cả 2 Master
  try {
    await renderManager.notifyGoogleAppsScript('add', master1.publicUrl, { isMaster: true });
    await renderManager.notifyGoogleAppsScript('add', master2.publicUrl, { isMaster: true });
    console.log('[DeployMaster] 📡 Đã đồng bộ cả 2 URL Master sang Google Apps Script Keep-Alive!');
  } catch (e) {
    console.warn('[DeployMaster] Lỗi báo Google Apps Script:', e.message);
  }

  process.exit(0);
})().catch(err => {
  console.error('[DeployMaster] ❌ Thất bại:', err);
  process.exit(1);
});
