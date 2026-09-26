/**
 * mongoHelper.js - Quản lý Kết nối Tập trung và Models MongoDB (Worker, DiscordGuild)
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

// Cấu hình Google/Cloudflare DNS để phân giải SRV records MongoDB mượt mà trên mọi mạng
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

let isConnected = false;
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
    title: { type: String, default: 'Ủng hộ cho tôi:' },
    description: { type: String, default: 'Cảm ơn bạn đã luôn tin tưởng và sử dụng KingMC Stats Bot!\nMọi đóng góp dù lớn hay nhỏ đều là nguồn hỗ trợ quý báu.' },
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

// Kết nối MongoDB tập trung
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
    return true;
  }

  try {
    console.log('[MongoHelper] Đang kết nối tới MongoDB Atlas...');
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    setupWorkerModel();
    setupDiscordGuildModel();
    setupDonationConfigModel();
    console.log('✅ [MongoHelper] Kết nối MongoDB Atlas THÀNH CÔNG!');
    return true;
  } catch (err) {
    console.warn(`[MongoHelper] ⚠️ Không thể kết nối MongoDB Atlas: ${err.message}`);
    isConnected = false;
    return false;
  }
}

function isMongoAvailable() {
  return isConnected || (mongoose.connection && mongoose.connection.readyState === 1);
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
      title: customData.title || 'Ủng hộ cho tôi:',
      description: customData.description || 'Cảm ơn bạn đã luôn tin tưởng và sử dụng KingMC Stats Bot!\nMọi đóng góp dù lớn hay nhỏ đều là nguồn hỗ trợ quý báu.',
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

module.exports = {
  connectMongo,
  isMongoAvailable,
  getWorkerModel,
  getDiscordGuildModel,
  getDonationConfigModel,
  setupWorkerModel,
  setupDiscordGuildModel,
  setupDonationConfigModel,
  seedDonationImage,
  getDonationConfig
};
