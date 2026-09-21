/**
 * helpers/trackerHelper.js - Quản lý Danh Sách Theo Dõi & Lịch Sử Số Dư (Balance Tracker)
 * Hỗ trợ MongoDB Atlas (ưu tiên) và fallback sang file JSON cục bộ (data/balance_tracker.json).
 * Tự động đồng bộ các biến môi trường Render dạng td-<player>.
 */

const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

// Cấu hình Google/Cloudflare DNS để phân giải SRV records MongoDB mượt mà trên mọi mạng
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

// Đường dẫn file lưu trữ dữ liệu cục bộ dự phòng
const DATA_DIR = path.join(__dirname, '../data');
const LOCAL_DB_PATH = path.join(DATA_DIR, 'balance_tracker.json');

// Thời gian tối đa lưu trữ lịch sử: 3 ngày (tính bằng milliseconds)
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Trạng thái kết nối MongoDB
let isMongoConnected = false;
let TrackedPlayerModel = null;

// Bộ nhớ đệm RAM (Dùng khi MongoDB chưa kết nối hoặc chạy chế độ Fallback)
// Map<string (lowercase), { playerName: string, isTracking: boolean, trackedAt: number, lastChecked: number, history: Array<{ timestamp: number, balance: number, formatted: string }> }>
const localCache = new Map();

/**
 * Đảm bảo thư mục data/ tồn tại
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.error('[TrackerHelper] Không thể tạo thư mục data:', e.message);
    }
  }
}

/**
 * Đọc dữ liệu từ file JSON cục bộ
 */
function loadLocalDatabase() {
  ensureDataDir();
  if (fs.existsSync(LOCAL_DB_PATH)) {
    try {
      const content = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
      const data = JSON.parse(content);
      localCache.clear();
      for (const [key, val] of Object.entries(data)) {
        localCache.set(key.toLowerCase(), val);
      }
      console.log(`[TrackerHelper] Đã nạp ${localCache.size} người chơi từ file cục bộ.`);
    } catch (err) {
      console.error('[TrackerHelper] Lỗi đọc file balance_tracker.json:', err.message);
    }
  }
}

/**
 * Lưu dữ liệu RAM ra file JSON cục bộ
 */
function saveLocalDatabase() {
  ensureDataDir();
  try {
    const obj = {};
    for (const [key, val] of localCache.entries()) {
      obj[key] = val;
    }
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    console.error('[TrackerHelper] Lỗi ghi file balance_tracker.json:', err.message);
  }
}

/**
 * Khởi tạo Mongoose Schema & Model
 */
function setupMongoModel() {
  if (TrackedPlayerModel) return TrackedPlayerModel;

  const HistoryItemSchema = new mongoose.Schema({
    timestamp: { type: Date, default: Date.now },
    balance: { type: Number, required: true },
    formatted: { type: String, default: '' }
  }, { _id: false });

  const TrackedPlayerSchema = new mongoose.Schema({
    playerKey: { type: String, required: true, unique: true, index: true }, // lowercase player name
    playerName: { type: String, required: true },
    isTracking: { type: Boolean, default: true, index: true },
    trackedAt: { type: Date, default: Date.now },
    lastChecked: { type: Date, default: Date.now },
    history: [HistoryItemSchema]
  }, {
    timestamps: true
  });

  TrackedPlayerModel = mongoose.models.TrackedPlayer || mongoose.model('TrackedPlayer', TrackedPlayerSchema);
  return TrackedPlayerModel;
}

/**
 * Chuyển chuỗi số dư (ví dụ: "$1,250,500" hoặc "$1.5M") thành số Number thuần túy
 */
function parseBalanceStringToNumber(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;

  let str = String(val).trim().replace(/\$/g, '').replace(/,/g, '').replace(/balance/gi, '').trim();

  // Xử lý hậu tố viết tắt (k, m, b, t)
  const lastChar = str.slice(-1).toLowerCase();
  let multiplier = 1;
  if (lastChar === 'k') {
    multiplier = 1e3;
    str = str.slice(0, -1);
  } else if (lastChar === 'm') {
    multiplier = 1e6;
    str = str.slice(0, -1);
  } else if (lastChar === 'b') {
    multiplier = 1e9;
    str = str.slice(0, -1);
  } else if (lastChar === 't') {
    multiplier = 1e12;
    str = str.slice(0, -1);
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.round(num * multiplier);
}

/**
 * Quét các biến môi trường Render có dạng td-<player> hoặc td_<player>
 */
async function scanRenderEnvVariables() {
  const envKeys = Object.keys(process.env);
  let importedCount = 0;

  for (const key of envKeys) {
    let playerName = null;
    if (key.toLowerCase().startsWith('td-')) {
      playerName = key.substring(3).trim();
    } else if (key.toLowerCase().startsWith('td_')) {
      playerName = key.substring(3).trim();
    }

    if (playerName && playerName.length > 0) {
      const alreadyTracking = await isTracking(playerName);
      if (!alreadyTracking) {
        console.log(`[TrackerHelper] 🔍 Phát hiện biến môi trường [${key}]: Tự động kích hoạt theo dõi cho "${playerName}"`);
        await setTracking(playerName, true);
        importedCount++;
      }
    }
  }

  if (importedCount > 0) {
    console.log(`[TrackerHelper] Đã tự động nhập ${importedCount} người chơi từ biến môi trường Render.`);
  }
}

/**
 * Khởi tạo Tracker (Kết nối MongoDB và đọc dữ liệu)
 */
async function initTracker() {
  loadLocalDatabase();

  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && mongoUri.startsWith('mongodb')) {
    try {
      console.log('[TrackerHelper] Đang kết nối tới MongoDB Atlas...');
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 5000
      });
      isMongoConnected = true;
      setupMongoModel();
      console.log(' [TrackerHelper] Kết nối MongoDB Atlas THÀNH CÔNG! Dữ liệu được lưu trữ đám mây vĩnh viễn.');

      // Đồng bộ từ MongoDB vào cache RAM để truy xuất nhanh
      const allPlayers = await TrackedPlayerModel.find({ isTracking: true });
      for (const p of allPlayers) {
        localCache.set(p.playerKey, {
          playerName: p.playerName,
          isTracking: p.isTracking,
          trackedAt: p.trackedAt ? p.trackedAt.getTime() : Date.now(),
          lastChecked: p.lastChecked ? p.lastChecked.getTime() : Date.now(),
          history: (p.history || []).map(h => ({
            timestamp: h.timestamp ? h.timestamp.getTime() : Date.now(),
            balance: h.balance,
            formatted: h.formatted
          }))
        });
      }
      console.log(`[TrackerHelper] Đã đồng bộ ${allPlayers.length} người chơi từ MongoDB.`);
    } catch (err) {
      console.warn(`[TrackerHelper]  Không thể kết nối tới MongoDB Atlas: ${err.message}. Đang chuyển sang chế độ dự phòng file JSON.`);
      isMongoConnected = false;
    }
  } else {
    console.log('[TrackerHelper] Chưa cấu hình MONGODB_URI. Sử dụng bộ nhớ dự phòng file cục bộ.');
  }

  // Quét các biến môi trường dạng td-<tên>
  await scanRenderEnvVariables();
}

/**
 * Kiểm tra xem người chơi có đang được theo dõi không
 */
async function isTracking(playerName) {
  if (!playerName) return false;
  const key = playerName.toLowerCase().trim();

  if (localCache.has(key)) {
    return !!localCache.get(key).isTracking;
  }

  if (isMongoConnected && TrackedPlayerModel) {
    try {
      const doc = await TrackedPlayerModel.findOne({ playerKey: key });
      if (doc) {
        localCache.set(key, {
          playerName: doc.playerName,
          isTracking: doc.isTracking,
          trackedAt: doc.trackedAt?.getTime() || Date.now(),
          lastChecked: doc.lastChecked?.getTime() || Date.now(),
          history: (doc.history || []).map(h => ({
            timestamp: h.timestamp?.getTime() || Date.now(),
            balance: h.balance,
            formatted: h.formatted
          }))
        });
        return doc.isTracking;
      }
    } catch (e) {
      console.error('[TrackerHelper] Lỗi truy vấn isTracking:', e.message);
    }
  }

  return false;
}

/**
 * Bật hoặc tắt trạng thái theo dõi của một người chơi
 * @param {string} playerName - Tên người chơi
 * @param {boolean} tracking - true để bật, false để tắt
 * @param {string|number|null} initialBalance - Số dư ban đầu để lưu điểm đầu tiên ngay lập tức
 */
async function setTracking(playerName, tracking = true, initialBalance = null) {
  if (!playerName) return;
  const cleanName = playerName.trim();
  const key = cleanName.toLowerCase();
  const now = Date.now();

  let item = localCache.get(key);
  if (!item) {
    item = {
      playerName: cleanName,
      isTracking: tracking,
      trackedAt: now,
      lastChecked: now,
      history: []
    };
  } else {
    item.isTracking = tracking;
    if (tracking && !item.trackedAt) {
      item.trackedAt = now;
    }
  }

  // Nếu bật theo dõi và có số dư ban đầu, ghi nhận điểm đầu tiên ngay
  if (tracking && initialBalance !== null && initialBalance !== undefined) {
    const balNum = parseBalanceStringToNumber(initialBalance);
    const balFormatted = String(initialBalance);

    // Tránh trùng mốc trong cùng 1 phút
    const lastPoint = item.history[item.history.length - 1];
    if (!lastPoint || (now - lastPoint.timestamp > 60000)) {
      item.history.push({
        timestamp: now,
        balance: balNum,
        formatted: balFormatted
      });
      item.lastChecked = now;
    }
  }

  // Lọc dữ liệu tối đa 3 ngày
  const cutoffTime = now - THREE_DAYS_MS;
  item.history = item.history.filter(h => h.timestamp >= cutoffTime);

  localCache.set(key, item);
  saveLocalDatabase();

  // Lưu lên MongoDB nếu có kết nối
  if (isMongoConnected && TrackedPlayerModel) {
    try {
      await TrackedPlayerModel.findOneAndUpdate(
        { playerKey: key },
        {
          playerName: cleanName,
          isTracking: tracking,
          trackedAt: new Date(item.trackedAt),
          lastChecked: new Date(item.lastChecked),
          history: item.history.map(h => ({
            timestamp: new Date(h.timestamp),
            balance: h.balance,
            formatted: h.formatted
          }))
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (err) {
      console.error(`[TrackerHelper] Lỗi lưu MongoDB cho ${cleanName}:`, err.message);
    }
  }

  return item;
}

/**
 * Thêm một điểm dữ liệu kiểm tra số dư vào lịch sử
 */
async function addBalanceRecord(playerName, rawBalance) {
  if (!playerName) return;
  const cleanName = playerName.trim();
  const key = cleanName.toLowerCase();
  const now = Date.now();

  const balNum = parseBalanceStringToNumber(rawBalance);
  const balFormatted = String(rawBalance).trim();

  let item = localCache.get(key);
  if (!item) {
    item = {
      playerName: cleanName,
      isTracking: true,
      trackedAt: now,
      lastChecked: now,
      history: []
    };
  }

  item.lastChecked = now;
  item.history.push({
    timestamp: now,
    balance: balNum,
    formatted: balFormatted
  });

  // Tự động dọn dẹp các mốc cũ hơn 3 ngày
  const cutoffTime = now - THREE_DAYS_MS;
  item.history = item.history.filter(h => h.timestamp >= cutoffTime);

  localCache.set(key, item);
  saveLocalDatabase();

  if (isMongoConnected && TrackedPlayerModel) {
    try {
      await TrackedPlayerModel.findOneAndUpdate(
        { playerKey: key },
        {
          playerName: cleanName,
          lastChecked: new Date(now),
          $push: {
            history: {
              timestamp: new Date(now),
              balance: balNum,
              formatted: balFormatted
            }
          }
        },
        { upsert: true }
      );

      // Cắt bỏ dữ liệu cũ hơn 3 ngày trên MongoDB
      await TrackedPlayerModel.updateOne(
        { playerKey: key },
        {
          $pull: {
            history: {
              timestamp: { $lt: new Date(cutoffTime) }
            }
          }
        }
      );
    } catch (err) {
      console.error(`[TrackerHelper] Lỗi thêm record MongoDB cho ${cleanName}:`, err.message);
    }
  }

  return item;
}

/**
 * Lấy lịch sử và thông tin thống kê số dư của một người chơi (tối đa 3 ngày)
 */
async function getPlayerHistory(playerName) {
  if (!playerName) return null;
  const key = playerName.toLowerCase().trim();

  let item = localCache.get(key);

  if (!item && isMongoConnected && TrackedPlayerModel) {
    try {
      const doc = await TrackedPlayerModel.findOne({ playerKey: key });
      if (doc) {
        item = {
          playerName: doc.playerName,
          isTracking: doc.isTracking,
          trackedAt: doc.trackedAt?.getTime() || Date.now(),
          lastChecked: doc.lastChecked?.getTime() || Date.now(),
          history: (doc.history || []).map(h => ({
            timestamp: h.timestamp?.getTime() || Date.now(),
            balance: h.balance,
            formatted: h.formatted
          }))
        };
        localCache.set(key, item);
      }
    } catch (e) {
      console.error('[TrackerHelper] Lỗi getPlayerHistory:', e.message);
    }
  }

  if (!item) return null;

  // Lọc chỉ giữ các điểm trong vòng 3 ngày
  const cutoffTime = Date.now() - THREE_DAYS_MS;
  const filteredHistory = (item.history || []).filter(h => h.timestamp >= cutoffTime);

  // Sắp xếp theo thứ tự thời gian tăng dần
  filteredHistory.sort((a, b) => a.timestamp - b.timestamp);

  // Tính toán các chỉ số thống kê
  let minBalance = 0;
  let maxBalance = 0;
  let currentBalance = 0;
  let startBalance = 0;
  let balanceChange = 0;
  let changePercent = 0;

  if (filteredHistory.length > 0) {
    const balances = filteredHistory.map(h => h.balance);
    minBalance = Math.min(...balances);
    maxBalance = Math.max(...balances);
    startBalance = filteredHistory[0].balance;
    currentBalance = filteredHistory[filteredHistory.length - 1].balance;
    balanceChange = currentBalance - startBalance;
    changePercent = startBalance > 0 ? ((balanceChange / startBalance) * 100).toFixed(2) : 0;
  }

  return {
    playerName: item.playerName || playerName,
    isTracking: item.isTracking,
    trackedAt: item.trackedAt,
    lastChecked: item.lastChecked,
    history: filteredHistory,
    stats: {
      count: filteredHistory.length,
      startBalance,
      currentBalance,
      minBalance,
      maxBalance,
      balanceChange,
      changePercent
    }
  };
}

/**
 * Lấy danh sách tất cả người chơi đang được theo dõi (isTracking = true)
 */
async function getAllTrackedPlayers() {
  const result = [];

  if (isMongoConnected && TrackedPlayerModel) {
    try {
      const docs = await TrackedPlayerModel.find({ isTracking: true }).select('playerName playerKey lastChecked');
      return docs.map(d => d.playerName);
    } catch (e) {
      console.error('[TrackerHelper] Lỗi getAllTrackedPlayers:', e.message);
    }
  }

  // Fallback qua RAM Cache
  for (const [key, val] of localCache.entries()) {
    if (val.isTracking) {
      result.push(val.playerName);
    }
  }
  return result;
}

/**
 * Lấy tổng hợp danh sách trạng thái theo dõi cho Admin xem
 */
async function getTrackerOverview() {
  const players = [];
  const cutoffTime = Date.now() - THREE_DAYS_MS;

  for (const [key, val] of localCache.entries()) {
    if (val.isTracking) {
      const validPoints = (val.history || []).filter(h => h.timestamp >= cutoffTime);
      const latestPoint = validPoints[validPoints.length - 1];
      players.push({
        name: val.playerName,
        pointsCount: validPoints.length,
        lastChecked: val.lastChecked ? new Date(val.lastChecked) : null,
        latestBalance: latestPoint ? latestPoint.formatted : 'Chưa có'
      });
    }
  }

  return {
    isMongoConnected,
    totalTracked: players.length,
    players
  };
}

module.exports = {
  initTracker,
  isTracking,
  setTracking,
  addBalanceRecord,
  getPlayerHistory,
  getAllTrackedPlayers,
  getTrackerOverview,
  parseBalanceStringToNumber
};
