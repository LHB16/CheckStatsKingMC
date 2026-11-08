/**
 * mongoHelper.js - Quản lý Kết nối Tập trung và Models MongoDB (Worker, DiscordGuild)
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

// Ưu tiên Google/Cloudflare DNS lên đầu để phân giải SRV records (Minecraft & MongoDB) tức thì trên Wispbyte/Render
try {
  const existingServers = dns.getServers ? dns.getServers() : [];
  const mergedServers = Array.from(new Set(['8.8.8.8', '1.1.1.1', ...existingServers]));
  dns.setServers(mergedServers);
} catch (e) {}

// Tắt bufferCommands mặc định để tránh treo 10000ms khi mất kết nối hoặc bị chặn cổng 27017
mongoose.set('bufferCommands', false);

let isConnected = false;
let connectingPromise = null;
let WorkerModel = null;
let DiscordGuildModel = null;
let DonationConfigModel = null;

// Khởi tạo Worker Schema
function setupWorkerModel() {
  if (WorkerModel) return WorkerModel;

  const WorkerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true, unique: true },
    secret: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    status: { 
      type: String, 
      enum: ['online', 'offline', 'busy', 'error', 'unknown'], 
      default: 'unknown' 
    },
    latency: { type: Number, default: -1 },
    botUsername: { type: String, default: '' },
    lastHeartbeat: { type: Date, default: null },
    lastError: { type: String, default: '' }
  }, {
    timestamps: true
  });

  WorkerModel = mongoose.models.Worker || mongoose.model('Worker', WorkerSchema);
  return WorkerModel;
}

// Khởi tạo Discord Guild Schema
function setupDiscordGuildModel() {
  if (DiscordGuildModel) return DiscordGuildModel;

  const DiscordGuildSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    iconUrl: { type: String, default: '' },
    memberCount: { type: Number, default: 0 },
    ownerId: { type: String, default: '' },
    joinedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true }
  }, {
    timestamps: true
  });

  DiscordGuildModel = mongoose.models.DiscordGuild || mongoose.model('DiscordGuild', DiscordGuildSchema);
  return DiscordGuildModel;
}

// Khởi tạo Donation Config Schema
function setupDonationConfigModel() {
  if (DonationConfigModel) return DonationConfigModel;

  const DonationConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: 'Ủng hộ tôi' },
    description: { 
      type: String, 
      default: 'Cảm ơn bạn đã luôn tin tưởng và sử dụng Bot CheckStatsKingMC!\nMọi đóng góp dù lớn hay nhỏ đều là nguồn hỗ trợ quý báu.\n\n:emerald: **Money KingSMP:**\n└ IGN: `lhbinh001`\n\n:diamond: **VND:**\n└ Quét mã QR đính kèm bên dưới' 
    },
    accountName: { type: String, default: 'LUU HUU BINH' },
    bankName: { type: String, default: 'VietQR (Hỗ trợ tất cả ngân hàng & ví điện tử)' },
    imageBuffer: { type: Buffer, required: true },
    contentType: { type: String, default: 'image/jpeg' },
    fileName: { type: String, default: 'donate_qr.jpg' }
  }, {
    timestamps: true
  });

  DonationConfigModel = mongoose.models.DonationConfig || mongoose.model('DonationConfig', DonationConfigSchema);
  return DonationConfigModel;
}

let LeaderboardModel = null;
let RenderAccountModel = null;
let WispbyteAccountModel = null;
let BotHostingAccountModel = null;
let SystemConfigModel = null;

// Khởi tạo Wispbyte Account Schema (Lưu trữ nhiều tài khoản Wispbyte để tự động gia hạn 14 ngày / 24h)
function setupWispbyteAccountModel() {
  if (WispbyteAccountModel) return WispbyteAccountModel;

  const WispbyteAccountSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    cookie: { type: String, required: true },
    panelUrl: { type: String, default: 'https://wispbyte.com/client' },
    serverId: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    lastPingAt: { type: Date, default: null },
    lastStatus: {
      type: String,
      enum: ['ok', 'expired', 'error', 'unknown'],
      default: 'unknown'
    },
    lastMessage: { type: String, default: '' },
    renewCount: { type: Number, default: 0 }
  }, {
    timestamps: true
  });

  WispbyteAccountModel = mongoose.models.WispbyteAccount || mongoose.model('WispbyteAccount', WispbyteAccountSchema);
  return WispbyteAccountModel;
}

// Khởi tạo Render Account Schema (Lưu trữ cấu hình xoay Render trên MongoDB)
function setupRenderAccountModel() {
  if (RenderAccountModel) return RenderAccountModel;

  const RenderAccountSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    apiKey: { type: String, required: true },
    ownerId: { type: String, default: '' },
    repo: { type: String, default: '' },
    branch: { type: String, default: 'main' },
    allowedRegions: { 
      type: [String], 
      default: ['singapore', 'oregon', 'ohio', 'frankfurt', 'virginia'] 
    },
    currentRegion: { type: String, default: '' },
    activeServiceId: { type: String, default: '' },
    activeServiceUrl: { type: String, default: '' },
    maxServices: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true, index: true },
    lastRotatedAt: { type: Date, default: null },
    rotationCount: { type: Number, default: 0 }
  }, {
    timestamps: true
  });

  RenderAccountModel = mongoose.models.RenderAccount || mongoose.model('RenderAccount', RenderAccountSchema);
  return RenderAccountModel;
}

// Khởi tạo BotHosting Account Schema (Lưu trữ tài khoản Bot-Hosting.net để quản lý Worker & nhắc gia hạn 4 ngày)
function setupBotHostingAccountModel() {
  if (BotHostingAccountModel) return BotHostingAccountModel;

  const DeploymentSubSchema = new mongoose.Schema({
    deploymentId: { type: String, default: '' },
    name: { type: String, default: '' },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now },
    lastRenewedAt: { type: Date, default: Date.now },
    nextRenewDue: { type: Date, default: null }
  }, { _id: false });

  const BotHostingAccountSchema = new mongoose.Schema({
    accountId: { type: String, required: true, unique: true, index: true },
    name: { type: String, default: '' },
    apiKey: { type: String, required: true },
    deployments: { type: [DeploymentSubSchema], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    lastRemindedAt: { type: Date, default: null },
    panelUrl: { type: String, default: 'https://bot-hosting.net/panel' }
  }, {
    timestamps: true
  });

  BotHostingAccountModel = mongoose.models.BotHostingAccount || mongoose.model('BotHostingAccount', BotHostingAccountSchema);
  return BotHostingAccountModel;
}

// Khởi tạo System Config Schema (Cấu hình động cho Bot, GAS Webhook, Rotation)
function setupSystemConfigModel() {
  if (SystemConfigModel) return SystemConfigModel;

  const SystemConfigSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String, default: '' }
  }, {
    timestamps: true
  });

  SystemConfigModel = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);
  return SystemConfigModel;
}

// Khởi tạo Leaderboard Cache Schema
function setupLeaderboardModel() {
  if (LeaderboardModel) return LeaderboardModel;

  const LeaderboardSchema = new mongoose.Schema({
    categoryKey: { type: String, required: true, unique: true, index: true },
    title: { type: String, default: '' },
    players: [{
      rank: { type: Number, required: true },
      username: { type: String, required: true },
      value: { type: String, default: '0' },
      skinUrl: { type: String, default: null }
    }],
    scrapedAt: { type: Date, default: Date.now }
  }, {
    timestamps: true
  });

  LeaderboardModel = mongoose.models.Leaderboard || mongoose.model('Leaderboard', LeaderboardSchema);
  return LeaderboardModel;
}

function getLeaderboardModel() {
  return setupLeaderboardModel();
}

function getRenderAccountModel() {
  return setupRenderAccountModel();
}

function getWispbyteAccountModel() {
  return setupWispbyteAccountModel();
}

function getBotHostingAccountModel() {
  return setupBotHostingAccountModel();
}

function getSystemConfigModel() {
  return setupSystemConfigModel();
}

// Kết nối MongoDB tập trung (Chống race-condition khi nhiều module cùng gọi)
async function connectMongo() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri || !mongoUri.startsWith('mongodb')) {
    console.log('[MongoHelper] Chưa cấu hình MONGODB_URI.');
    return false;
  }

  if (mongoose.connection && mongoose.connection.readyState === 1) {
    isConnected = true;
    setupWorkerModel();
    setupDiscordGuildModel();
    setupDonationConfigModel();
    setupLeaderboardModel();
    setupRenderAccountModel();
    setupWispbyteAccountModel();
    setupBotHostingAccountModel();
    setupSystemConfigModel();
    return true;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      console.log('[MongoHelper] Đang kết nối tới MongoDB Atlas...');
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: 6000,
          bufferCommands: false
        });
      }
      isConnected = mongoose.connection.readyState === 1;
      if (isConnected) {
        setupWorkerModel();
        setupDiscordGuildModel();
        setupDonationConfigModel();
        setupLeaderboardModel();
        setupRenderAccountModel();
        setupWispbyteAccountModel();
        setupBotHostingAccountModel();
        setupSystemConfigModel();
        console.log('✅ [MongoHelper] Kết nối MongoDB Atlas THÀNH CÔNG!');
      }
      return isConnected;
    } catch (err) {
      console.warn(`[MongoHelper] ⚠️ Không thể kết nối MongoDB Atlas: ${err.message}`);
      isConnected = false;
      return false;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

function isMongoAvailable() {
  return Boolean(mongoose.connection && mongoose.connection.readyState === 1);
}

function getWorkerModel() {
  return setupWorkerModel();
}

function getDiscordGuildModel() {
  return setupDiscordGuildModel();
}

function getDonationConfigModel() {
  return setupDonationConfigModel();
}

/**
 * Nạp (Seed) hoặc cập nhật ảnh Donate vào MongoDB
 */
async function seedDonationImage(filePath, customData = {}) {
  const connected = await connectMongo();
  if (!connected) {
    throw new Error('Không thể kết nối MongoDB để seed dữ liệu ảnh donate.');
  }

  const Model = setupDonationConfigModel();
  if (!fs.existsSync(filePath)) {
    throw new Error(`File ảnh không tồn tại tại đường dẫn: ${filePath}`);
  }

  const imageBuffer = fs.readFileSync(filePath);
  const key = customData.key || 'donate_qr';

  const doc = await Model.findOneAndUpdate(
    { key },
    {
      key,
      title: customData.title || 'Ủng hộ tôi',
      description: customData.description || 'Cảm ơn bạn đã luôn tin tưởng và sử dụng Bot CheckStatsKingMC!\nMọi đóng góp dù lớn hay nhỏ đều là nguồn hỗ trợ quý báu.\n\n:emerald: **Money KingSMP:**\n└ IGN: `lhbinh001`\n\n:diamond: **VND:**\n└ Quét mã QR đính kèm bên dưới',
      accountName: customData.accountName || 'LUU HUU BINH',
      bankName: customData.bankName || 'VietQR (Mọi ứng dụng ngân hàng & ví điện tử)',
      imageBuffer,
      contentType: customData.contentType || 'image/jpeg',
      fileName: customData.fileName || 'donate_qr.jpg'
    },
    { upsert: true, returnDocument: 'after' }
  );

  console.log(`✅ [MongoHelper] Đã lưu/cập nhật ảnh donate vào MongoDB Atlas (Key: ${key}, Size: ${imageBuffer.length} bytes).`);
  return doc;
}

/**
 * Lấy dữ liệu ảnh và cấu hình Donate trực tiếp từ MongoDB
 */
async function getDonationConfig(key = 'donate_qr') {
  const connected = await connectMongo();
  if (!connected) return null;

  const Model = setupDonationConfigModel();
  let doc = await Model.findOne({ key }).lean();

  // Tự động seed nếu MongoDB chưa có dữ liệu nhưng có file ảnh dự phòng trong public/images
  if (!doc) {
    const defaultImagePath = path.join(__dirname, '../public/images/donate_qr.jpg');
    if (fs.existsSync(defaultImagePath)) {
      console.log(`[MongoHelper] Chưa có record [${key}] trong MongoDB, đang tự động nạp từ file cục bộ...`);
      doc = await seedDonationImage(defaultImagePath, { key });
    }
  }

  // Đảm bảo dữ liệu nhị phân BSON Binary của MongoDB được chuyển đổi chuẩn thành Buffer của Node.js
  if (doc && doc.imageBuffer) {
    if (!Buffer.isBuffer(doc.imageBuffer)) {
      if (doc.imageBuffer.buffer) {
        doc.imageBuffer = Buffer.from(doc.imageBuffer.buffer);
      } else {
        doc.imageBuffer = Buffer.from(doc.imageBuffer);
      }
    }
  }

  return doc;
}

/**
 * Lấy cấu hình hệ thống từ MongoDB theo key (có giá trị mặc định)
 */
async function getSystemConfig(key, defaultValue = null) {
  try {
    if (!isMongoAvailable()) return defaultValue;
    const Model = setupSystemConfigModel();
    const doc = await Model.findOne({ key }).lean();
    return doc ? doc.value : defaultValue;
  } catch (err) {
    console.warn(`[MongoHelper] Lỗi lấy SystemConfig [${key}]:`, err.message);
    return defaultValue;
  }
}

/**
 * Lưu/Cập nhật cấu hình hệ thống vào MongoDB
 */
async function setSystemConfig(key, value, description = '') {
  try {
    if (!isMongoAvailable()) return false;
    const Model = setupSystemConfigModel();
    await Model.findOneAndUpdate(
      { key },
      { key, value, description },
      { upsert: true, returnDocument: 'after' }
    );
    return true;
  } catch (err) {
    console.error(`[MongoHelper] Lỗi lưu SystemConfig [${key}]:`, err.message);
    return false;
  }
}

/**
 * Lấy danh sách toàn bộ Render Account từ MongoDB
 */
async function getAllRenderAccounts() {
  try {
    if (!isMongoAvailable()) return [];
    const Model = setupRenderAccountModel();
    return await Model.find().sort({ createdAt: 1 }).lean();
  } catch (err) {
    console.warn('[MongoHelper] Lỗi lấy danh sách RenderAccount:', err.message);
    return [];
  }
}

/**
 * Lưu hoặc cập nhật Render Account vào MongoDB
 */
async function saveRenderAccount(accountData) {
  try {
    if (!isMongoAvailable()) return null;
    const Model = setupRenderAccountModel();
    const accountId = accountData.accountId || accountData.id;
    if (!accountId) throw new Error('Thiếu accountId khi lưu RenderAccount');

    const updatePayload = { ...accountData, accountId };
    delete updatePayload.id;

    const doc = await Model.findOneAndUpdate(
      { accountId },
      updatePayload,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    return doc;
  } catch (err) {
    console.error('[MongoHelper] Lỗi lưu RenderAccount:', err.message);
    throw err;
  }
}

/**
 * Xóa Render Account khỏi MongoDB
 */
async function deleteRenderAccount(accountId) {
  try {
    if (!isMongoAvailable()) return false;
    const Model = setupRenderAccountModel();
    const res = await Model.findOneAndDelete({ accountId });
    return !!res;
  } catch (err) {
    console.error('[MongoHelper] Lỗi xóa RenderAccount:', err.message);
    return false;
  }
}

/**
 * Lấy danh sách toàn bộ Wispbyte Account từ MongoDB
 */
async function getAllWispbyteAccounts() {
  try {
    if (!isMongoAvailable()) return [];
    const Model = setupWispbyteAccountModel();
    return await Model.find().sort({ createdAt: 1 }).lean();
  } catch (err) {
    console.warn('[MongoHelper] Lỗi lấy danh sách WispbyteAccount:', err.message);
    return [];
  }
}

/**
 * Lưu hoặc cập nhật Wispbyte Account vào MongoDB
 */
async function saveWispbyteAccount(accountData) {
  try {
    if (!isMongoAvailable()) return null;
    const Model = setupWispbyteAccountModel();
    const accountId = accountData.accountId || accountData.id;
    if (!accountId) throw new Error('Thiếu accountId khi lưu WispbyteAccount');

    const updatePayload = { ...accountData, accountId };
    delete updatePayload.id;

    const doc = await Model.findOneAndUpdate(
      { accountId },
      updatePayload,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    return doc;
  } catch (err) {
    console.error('[MongoHelper] Lỗi lưu WispbyteAccount:', err.message);
    throw err;
  }
}

/**
 * Xóa Wispbyte Account khỏi MongoDB
 */
async function deleteWispbyteAccount(accountId) {
  try {
    if (!isMongoAvailable()) return false;
    const Model = setupWispbyteAccountModel();
    const res = await Model.findOneAndDelete({ accountId });
    return !!res;
  } catch (err) {
    console.error('[MongoHelper] Lỗi xóa WispbyteAccount:', err.message);
    return false;
  }
}

/**
 * Lấy danh sách toàn bộ BotHosting Account từ MongoDB
 */
async function getAllBotHostingAccounts() {
  try {
    if (!isMongoAvailable()) return [];
    const Model = setupBotHostingAccountModel();
    return await Model.find().sort({ createdAt: 1 }).lean();
  } catch (err) {
    console.warn('[MongoHelper] Lỗi lấy danh sách BotHostingAccount:', err.message);
    return [];
  }
}

/**
 * Lưu hoặc cập nhật BotHosting Account vào MongoDB
 */
async function saveBotHostingAccount(accountData) {
  try {
    if (!isMongoAvailable()) return null;
    const Model = setupBotHostingAccountModel();
    const accountId = accountData.accountId || accountData.id;
    if (!accountId) throw new Error('Thiếu accountId khi lưu BotHostingAccount');

    const updatePayload = { ...accountData, accountId };
    delete updatePayload.id;

    const doc = await Model.findOneAndUpdate(
      { accountId },
      updatePayload,
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();
    return doc;
  } catch (err) {
    console.error('[MongoHelper] Lỗi lưu BotHostingAccount:', err.message);
    throw err;
  }
}

/**
 * Xóa BotHosting Account khỏi MongoDB
 */
async function deleteBotHostingAccount(accountId) {
  try {
    if (!isMongoAvailable()) return false;
    const Model = setupBotHostingAccountModel();
    const res = await Model.findOneAndDelete({ accountId });
    return !!res;
  } catch (err) {
    console.error('[MongoHelper] Lỗi xóa BotHostingAccount:', err.message);
    return false;
  }
}

module.exports = {
  connectMongo,
  isMongoAvailable,
  getWorkerModel,
  getDiscordGuildModel,
  getDonationConfigModel,
  getLeaderboardModel,
  getRenderAccountModel,
  getWispbyteAccountModel,
  getBotHostingAccountModel,
  getSystemConfigModel,
  setupWorkerModel,
  setupDiscordGuildModel,
  setupDonationConfigModel,
  setupLeaderboardModel,
  setupRenderAccountModel,
  setupWispbyteAccountModel,
  setupBotHostingAccountModel,
  setupSystemConfigModel,
  seedDonationImage,
  getDonationConfig,
  getSystemConfig,
  setSystemConfig,
  getAllRenderAccounts,
  saveRenderAccount,
  deleteRenderAccount,
  getAllWispbyteAccounts,
  saveWispbyteAccount,
  deleteWispbyteAccount,
  getAllBotHostingAccounts,
  saveBotHostingAccount,
  deleteBotHostingAccount
};
