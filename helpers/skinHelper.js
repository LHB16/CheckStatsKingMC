/**
 * helpers/skinHelper.js
 * @description Quản lý lưu trữ và trích xuất Skin người chơi (MongoDB + RAM Cache + Fallback JSON).
 * Hỗ trợ lấy Texture ID chính xác từ NBT Head (GUI TPA) và Tablist của server KingMC.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const CACHE_FILE_PATH = path.join(__dirname, '..', 'data', 'skin_cache.json');

// RAM Cache để đọc 0ms khi Discord bot truy vấn
const ramSkinCache = new Map();

let PlayerSkinModel = null;
let isMongoConnected = false;
let saveFileTimeout = null;

/**
 * Khởi tạo Mongoose Model cho PlayerSkin
 */
function setupMongoModel() {
  if (PlayerSkinModel) return PlayerSkinModel;

  const PlayerSkinSchema = new mongoose.Schema({
    playerKey: { type: String, required: true, unique: true, index: true }, // lowercase player name
    playerName: { type: String, required: true },
    textureId: { type: String, required: true }, // Mã hash cuối của textures.minecraft.net/texture/<hash>
    skinUrl: { type: String, required: true },   // URL đầy đủ
    model: { type: String, default: 'classic' }, // 'classic' hoặc 'slim'
    lastUpdated: { type: Date, default: Date.now }
  }, {
    timestamps: true
  });

  PlayerSkinModel = mongoose.models.PlayerSkin || mongoose.model('PlayerSkin', PlayerSkinSchema);
  return PlayerSkinModel;
}

/**
 * Trích xuất textureId từ URL hoặc chuỗi hash
 * @param {string} urlOrId
 * @returns {string|null}
 */
function extractTextureId(urlOrId) {
  if (!urlOrId) return null;
  const str = String(urlOrId).trim();
  const match = str.match(/texture\/([a-f0-9]{32,64})/i);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[a-f0-9]{32,64}$/i.test(str)) {
    return str;
  }
  return null;
}

/**
 * Đọc dữ liệu từ file cache cục bộ
 */
function loadLocalDatabase() {
  try {
    const dataDir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    if (fs.existsSync(CACHE_FILE_PATH)) {
      const raw = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && item.playerKey && item.textureId) {
            ramSkinCache.set(item.playerKey, {
              playerKey: item.playerKey,
              playerName: item.playerName || item.playerKey,
              textureId: item.textureId,
              skinUrl: item.skinUrl || `http://textures.minecraft.net/texture/${item.textureId}`,
              model: item.model || 'classic',
              lastUpdated: item.lastUpdated ? new Date(item.lastUpdated).getTime() : Date.now()
            });
          }
        }
        console.log(`[SkinHelper] Đã nạp ${ramSkinCache.size} skin từ file cache cục bộ.`);
      }
    }
  } catch (err) {
    console.warn(`[SkinHelper] Lỗi khi nạp file cache skin: ${err.message}`);
  }
}

/**
 * Ghi RAM cache xuống file JSON cục bộ ngay lập tức
 */
function flushLocalDatabase() {
  try {
    const dataDir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const list = Array.from(ramSkinCache.values());
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[SkinHelper] Lỗi khi ghi file cache skin: ${err.message}`);
  }
}

/**
 * Lưu RAM cache xuống file JSON cục bộ (Debounced 500ms)
 */
function scheduleSaveLocalDatabase() {
  if (saveFileTimeout) clearTimeout(saveFileTimeout);

  saveFileTimeout = setTimeout(() => {
    flushLocalDatabase();
  }, 500);
}

/**
 * Khởi tạo SkinHelper: Nạp Cache RAM và đồng bộ MongoDB
 */
async function initSkinHelper() {
  loadLocalDatabase();

  // Kiểm tra nếu mongoose đã được kết nối từ trước (ví dụ do trackerHelper kết nối)
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    isMongoConnected = true;
    setupMongoModel();
    await syncFromMongo();
    return;
  }

  // Nếu chưa kết nối, thử kết nối qua MONGODB_URI nếu có
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && mongoUri.startsWith('mongodb')) {
    try {
      if (mongoose.connection.readyState === 0) {
        console.log('[SkinHelper] Đang kết nối tới MongoDB Atlas...');
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
      }
      isMongoConnected = true;
      setupMongoModel();
      console.log('✅ [SkinHelper] Kết nối MongoDB Atlas THÀNH CÔNG cho hệ thống Skin!');
      await syncFromMongo();
    } catch (err) {
      console.warn(`[SkinHelper] ⚠️ Không thể kết nối MongoDB Atlas cho Skin: ${err.message}. Sử dụng file cục bộ.`);
      isMongoConnected = false;
    }
  } else {
    console.log('[SkinHelper] Chưa cấu hình MONGODB_URI cho Skin. Sử dụng file cục bộ.');
  }

  // Lắng nghe sự kiện kết nối của Mongoose nếu kết nối muộn
  mongoose.connection.on('connected', async () => {
    isMongoConnected = true;
    setupMongoModel();
    await syncFromMongo();
  });
}

/**
 * Đồng bộ tất cả skin từ MongoDB vào RAM Cache
 */
async function syncFromMongo() {
  if (!PlayerSkinModel) return;
  try {
    const allSkins = await PlayerSkinModel.find({});
    for (const s of allSkins) {
      ramSkinCache.set(s.playerKey, {
        playerKey: s.playerKey,
        playerName: s.playerName,
        textureId: s.textureId,
        skinUrl: s.skinUrl,
        model: s.model || 'classic',
        lastUpdated: s.lastUpdated ? s.lastUpdated.getTime() : Date.now()
      });
    }
    console.log(`[SkinHelper] 🚀 Đã đồng bộ ${allSkins.length} skin từ MongoDB vào RAM Cache.`);
    scheduleSaveLocalDatabase();
  } catch (err) {
    console.error(`[SkinHelper] Lỗi khi đồng bộ từ MongoDB: ${err.message}`);
  }
}

/**
 * Lưu hoặc cập nhật skin của người chơi (vào RAM Cache + MongoDB + Fallback File)
 * @param {string} playerName
 * @param {string} textureUrlOrId
 * @param {string} model
 */
async function saveSkin(playerName, textureUrlOrId, model = 'classic') {
  if (!playerName || !textureUrlOrId) return null;

  const cleanName = String(playerName).trim();
  const playerKey = cleanName.toLowerCase();
  const textureId = extractTextureId(textureUrlOrId);

  if (!textureId) return null;

  const skinUrl = `http://textures.minecraft.net/texture/${textureId}`;
  const record = {
    playerKey,
    playerName: cleanName,
    textureId,
    skinUrl,
    model: model || 'classic',
    lastUpdated: Date.now()
  };

  // Cập nhật RAM Cache tức thì
  ramSkinCache.set(playerKey, record);
  flushLocalDatabase(); // Ghi file ngay lập tức để không bị mất dữ liệu

  // Cập nhật MongoDB ngầm (asynchronous)
  if (isMongoConnected && PlayerSkinModel) {
    PlayerSkinModel.findOneAndUpdate(
      { playerKey },
      {
        playerKey,
        playerName: cleanName,
        textureId,
        skinUrl,
        model: model || 'classic',
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    ).catch(err => {
      console.error(`[SkinHelper] Lỗi lưu skin vào MongoDB cho [${cleanName}]: ${err.message}`);
    });
  }

  return record;
}

/**
 * Lấy dữ liệu skin của người chơi từ RAM cache
 * @param {string} playerName
 * @returns {object|null}
 */
function getSkin(playerName) {
  if (!playerName) return null;
  const playerKey = String(playerName).trim().toLowerCase();
  return ramSkinCache.get(playerKey) || null;
}

/**
 * Tìm kiếm skin của người chơi trong bot.players (Tablist) không phân biệt chữ hoa/thường
 * @param {object} bot Mineflayer bot instance
 * @param {string} playerName Tên người chơi
 * @returns {{url: string, model: string, textureId: string}|null}
 */
function findSkinInTablist(bot, playerName) {
  if (!bot || !bot.players || !playerName) return null;
  const lower = String(playerName).trim().toLowerCase();

  for (const [uname, p] of Object.entries(bot.players)) {
    if (uname.toLowerCase() === lower || (p.username && p.username.toLowerCase() === lower)) {
      if (p.skinData && p.skinData.url) {
        const textureId = extractTextureId(p.skinData.url);
        if (textureId) {
          return {
            url: p.skinData.url,
            model: p.skinData.model || 'classic',
            textureId
          };
        }
      }
    }
  }
  return null;
}

/**
 * Tạo Avatar URL chuẩn (ưu tiên 100% Texture ID đã lưu từ KingMC)
 * @param {string} playerName
 * @param {number} size Kích thước pixel (mặc định 64)
 * @param {boolean} is3D Có render dạng 3D Isometric không (mặc định true)
 * @returns {string}
 */
function getAvatarUrl(playerName, size = 64, is3D = true) {
  const cleanName = String(playerName || '').trim();
  if (!cleanName) {
    return is3D
      ? 'https://mc-heads.net/head/MHF_Steve/3d'
      : 'https://mc-heads.net/avatar/MHF_Steve/64';
  }

  const cached = getSkin(cleanName);
  if (cached && cached.textureId) {
    // mc-heads.net hỗ trợ render trực tiếp bằng textureId (hash)
    if (is3D) {
      return `https://mc-heads.net/head/${cached.textureId}/3d`;
    } else {
      return `https://mc-heads.net/avatar/${cached.textureId}/${size}`;
    }
  }

  // Fallback: Gọi theo tên tài khoản Mojang
  if (is3D) {
    return `https://mc-heads.net/head/${encodeURIComponent(cleanName)}/3d`;
  } else {
    return `https://mc-heads.net/head/${encodeURIComponent(cleanName)}/${size}`;
  }
}

/**
 * Giải mã chuỗi Base64 Skin Texture của Mojang / SkinsRestorer
 * @param {string} base64Str
 * @returns {{url: string, model: string}|null}
 */
function parseSkinBase64(base64Str) {
  if (!base64Str || typeof base64Str !== 'string') return null;
  const trimmed = base64Str.trim();
  if (trimmed.length < 20) return null;

  try {
    const jsonStr = Buffer.from(trimmed, 'base64').toString('utf8');
    if (!jsonStr.includes('textures') && !jsonStr.includes('SKIN')) return null;
    const parsed = JSON.parse(jsonStr);
    const skinObj = parsed?.textures?.SKIN;
    if (skinObj && skinObj.url) {
      return {
        url: skinObj.url,
        model: skinObj.metadata?.model || 'classic'
      };
    }
  } catch (e) {}
  return null;
}

/**
 * Quét đệ quy tìm chuỗi Base64 skin bên trong object bất kỳ (hỗ trợ độ sâu tới 20 cấp)
 */
function scanForSkinBase64(obj, depth = 0) {
  if (!obj || depth > 20) return null;
  if (typeof obj === 'string') {
    if (obj.length > 30) {
      const skin = parseSkinBase64(obj);
      if (skin) return skin;
    }
    return null;
  }
  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const res = scanForSkinBase64(obj[key], depth + 1);
      if (res) return res;
    }
  }
  return null;
}

/**
 * Bóc tách dữ liệu Skin (URL & Model) từ NBT của vật phẩm Player Head trong Mineflayer
 * @param {object} nbt NBT của vật phẩm (item.nbt)
 * @returns {{url: string, model: string, textureId: string}|null}
 */
function extractSkinDataFromNbt(nbt) {
  if (!nbt) return null;

  // Cách 1: Quét đệ quy toàn bộ cây NBT tìm chuỗi Base64 Skin (nhanh, chính xác 100% cho mọi định dạng)
  const scanned = scanForSkinBase64(nbt);
  if (scanned && scanned.url) {
    const textureId = extractTextureId(scanned.url);
    if (textureId) {
      return { ...scanned, textureId };
    }
  }

  // Cách 2: Duyệt cây cấu trúc NBT chuẩn của SkullOwner hoặc minecraft:profile
  try {
    const root = nbt.value || nbt;
    const skullOwner = root.SkullOwner || root.skullOwner || root['minecraft:profile'] || root.profile;
    if (skullOwner) {
      const ownerVal = skullOwner.value || skullOwner;
      const properties = ownerVal.Properties || ownerVal.properties;
      if (properties) {
        const propsVal = properties.value || properties;

        // Định dạng 1: Object chứa textures (Spigot / Paper cũ)
        const textures = propsVal.textures || propsVal.Textures;
        if (textures) {
          const texVal = textures.value || textures;
          const list = Array.isArray(texVal) ? texVal : (texVal.value || []);
          for (const entry of list) {
            const itemVal = entry.value || entry;
            const base64Str = itemVal.Value ? (itemVal.Value.value || itemVal.Value) : (itemVal.value || itemVal);
            if (typeof base64Str === 'string' && base64Str.length > 20) {
              const parsed = parseSkinBase64(base64Str);
              if (parsed && parsed.url) {
                const textureId = extractTextureId(parsed.url);
                return { ...parsed, textureId };
              }
            }
          }
        }

        // Định dạng 2: Array các properties [{ name: 'textures', value: '...' }] (1.20.5+ / 1.21)
        if (Array.isArray(propsVal)) {
          for (const prop of propsVal) {
            const propObj = prop.value || prop;
            const propName = propObj.name ? (propObj.name.value || propObj.name) : '';
            if (propName === 'textures') {
              const base64Str = propObj.value ? (propObj.value.value || propObj.value) : '';
              if (typeof base64Str === 'string' && base64Str.length > 20) {
                const parsed = parseSkinBase64(base64Str);
                if (parsed && parsed.url) {
                  const textureId = extractTextureId(parsed.url);
                  return { ...parsed, textureId };
                }
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  return null;
}

module.exports = {
  initSkinHelper,
  saveSkin,
  getSkin,
  getAvatarUrl,
  extractTextureId,
  extractSkinDataFromNbt,
  parseSkinBase64,
  findSkinInTablist,
  flushLocalDatabase
};
