/**
 * mongoHelper.js - Quản lý Kết nối Tập trung và Models MongoDB (Worker, DiscordGuild)
 */

const mongoose = require('mongoose');

let isConnected = false;
let WorkerModel = null;
let DiscordGuildModel = null;

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

module.exports = {
  connectMongo,
  isMongoAvailable,
  getWorkerModel,
  getDiscordGuildModel,
  setupWorkerModel,
  setupDiscordGuildModel
};
