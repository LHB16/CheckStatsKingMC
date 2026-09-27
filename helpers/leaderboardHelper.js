/**
 * helpers/leaderboardHelper.js - Quản lý và xử lý dữ liệu Bảng Xếp Hạng (Leaderboard)
 */

const fs = require('fs');
const path = require('path');
const { getCustomEmoji, cleanMinecraftText } = require('./utils');
const skinHelper = require('./skinHelper');
const { getLeaderboardModel, isMongoAvailable } = require('./mongoHelper');

const DATA_FILE = path.join(__dirname, '../data/leaderboard_test_data.json');
const CACHE_FILE = path.join(__dirname, '../data/leaderboard_cache.json');

// Danh mục 11 hạng mục của cụm KingSMP theo chuẩn item in-game
const LEADERBOARD_CATEGORIES = {
  money: {
    key: 'money',
    choiceName: '🟢 Emerald (Money)',
    name: 'Emerald (Money)',
    itemType: 'emerald',
    emojiKey: 'emerald',
    emojiId: '1553090824496222248',
    color: '#10b981', // Emerald green
    unit: '$',
    description: 'Bảng xếp hạng người chơi giàu nhất cụm KingSMP'
  },
  shards: {
    key: 'shards',
    choiceName: '🔮 Amethyst Shard (Shards)',
    name: 'Amethyst Shard (Shards)',
    itemType: 'amethyst_shard',
    emojiKey: 'amethyst_shard',
    emojiId: '1553093457247993856',
    color: '#a855f7', // Amethyst purple
    unit: 'Shard',
    description: 'Bảng xếp hạng sở hữu nhiều đá tím Shard nhất'
  },
  kills: {
    key: 'kills',
    choiceName: '🗡️ Netherite Sword (Kills)',
    name: 'Netherite Sword (Kills)',
    itemType: 'netherite_sword',
    emojiKey: 'netherite_sword',
    emojiId: '1553097648175579146',
    color: '#ef4444', // Red
    unit: 'mạng',
    description: 'Bảng xếp hạng số lần hạ gục người chơi khác'
  },
  deaths: {
    key: 'deaths',
    choiceName: '💀 Skeleton Skull (Deaths)',
    name: 'Skeleton Skull (Deaths)',
    itemType: 'skeleton_skull',
    emojiKey: 'skeleton_skull',
    emojiId: '1553099418599825511',
    color: '#64748b', // Gray
    unit: 'lần',
    description: 'Bảng xếp hạng số lần tử trận trên chiến trường'
  },
  played: {
    key: 'played',
    choiceName: '⏰ Clock (Played)',
    name: 'Clock (Played)',
    itemType: 'clock',
    emojiKey: 'clock',
    emojiId: '1553094595020066927',
    color: '#f59e0b', // Amber
    unit: '',
    description: 'Bảng xếp hạng thời gian online cày cuốc tích lũy'
  },
  blocks_placed: {
    key: 'blocks_placed',
    choiceName: '🧱 Bricks (Blocks Placed)',
    name: 'Bricks (Blocks Placed)',
    itemType: 'bricks',
    emojiKey: 'bricks',
    emojiId: '1553094120023531641',
    color: '#b45309', // Brown
    unit: 'block',
    description: 'Bảng xếp hạng số lượng khối block đã đặt'
  },
  blocks_mined: {
    key: 'blocks_mined',
    choiceName: '⛏️ Diamond Pickaxe (Blocks Mined)',
    name: 'Diamond Pickaxe (Blocks Mined)',
    itemType: 'diamond_pickaxe',
    emojiKey: 'diamond_pickaxe',
    emojiId: '1553095447046922342',
    color: '#06b6d4', // Cyan
    unit: 'block',
    description: 'Bảng xếp hạng số lượng khối khoáng sản đã khai thác'
  },
  mob_kills: {
    key: 'mob_kills',
    choiceName: '🧟 Zombie Head (Mob Kills)',
    name: 'Zombie Head (Mob Kills)',
    itemType: 'zombie_head',
    emojiKey: 'zombie_head',
    emojiId: '1553101292220711126',
    color: '#84cc16', // Lime
    unit: 'quái',
    description: 'Bảng xếp hạng số lượng quái vật đã tiêu diệt'
  },
  shop_buy_total: {
    key: 'shop_buy_total',
    choiceName: '📦 Chest (Shop Buy Total)',
    name: 'Chest (Shop Buy Total)',
    itemType: 'chest',
    emojiKey: 'chest',
    emojiId: '1553094447237963796',
    color: '#eab308', // Yellow
    unit: '$',
    description: 'Bảng xếp hạng tổng giá trị tiền mua đồ tại Shop'
  },
  shop_sell_total: {
    key: 'shop_sell_total',
    choiceName: '🪙 Gold Ingot (Shop Sell Total)',
    name: 'Gold Ingot (Shop Sell Total)',
    itemType: 'gold_ingot',
    emojiKey: 'gold_ingot',
    emojiId: '1553096094412701798',
    color: '#eab308', // Gold
    unit: '$',
    description: 'Bảng xếp hạng tổng giá trị tiền kiếm được từ bán đồ Shop'
  },
  animals_breed: {
    key: 'animals_breed',
    choiceName: '🌾 Wheat (Animals Breed)',
    name: 'Wheat (Animals Breed)',
    itemType: 'wheat',
    emojiKey: 'wheat',
    emojiId: '1553100962460340335',
    color: '#84cc16', // Grass green
    unit: 'lần',
    description: 'Bảng xếp hạng số lần nhân giống vật nuôi'
  }
};

// Bảng 9 emoji quặng đại diện cho thứ hạng 1 đến 9
const RANK_ORE_EMOJIS = [
  'netherite_ingot', // Hạng 1: Netherite
  'diamond',         // Hạng 2: Kim Cương
  'emerald',         // Hạng 3: Ngọc Lục Bảo
  'gold_ingot',      // Hạng 4: Vàng
  'iron_ingot',      // Hạng 5: Sắt
  'redstone',        // Hạng 6: Đá Đỏ
  'lapis_lazuli',    // Hạng 7: Ngọc Lưu Ly
  'coal',            // Hạng 8: Than
  'copper_ingot'     // Hạng 9: Đồng
];

function getRankOreEmoji(rankIndex) {
  const emojiKey = RANK_ORE_EMOJIS[rankIndex];
  if (!emojiKey) return '🔹';
  return getCustomEmoji(emojiKey) || '🔹';
}

// Hàm trích xuất giá trị sạch từ Lore JSON
function parseLoreValue(loreArray) {
  if (!loreArray || !loreArray.length) return '0';
  for (const line of loreArray) {
    if (!line) continue;
    if (typeof line === 'string' && line.trim().startsWith('{')) {
      try {
        const obj = JSON.parse(line);
        if (obj.text) return cleanMinecraftText(obj.text);
      } catch (_) {}
    }
    const clean = cleanMinecraftText(line);
    if (clean && !clean.toLowerCase().includes('click') && !clean.toLowerCase().includes('trang')) {
      return clean;
    }
  }
  return cleanMinecraftText(loreArray[0]);
}

// Hàm tải toàn bộ dữ liệu bảng xếp hạng đã cào từ file local
function loadLeaderboardRawData() {
  const filePath = fs.existsSync(CACHE_FILE) ? CACHE_FILE : DATA_FILE;
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[LeaderboardHelper] Lỗi đọc dữ liệu cache:', err.message);
    return null;
  }
}

/**
 * Lấy dữ liệu bảng xếp hạng từ MongoDB
 */
async function getLeaderboardFromMongo(categoryKey) {
  if (!isMongoAvailable()) return null;
  try {
    const Model = getLeaderboardModel();
    const doc = await Model.findOne({ categoryKey }).lean();
    return doc;
  } catch (e) {
    console.warn('[LeaderboardHelper] Lỗi đọc MongoDB:', e.message);
    return null;
  }
}

/**
 * Lưu dữ liệu bảng xếp hạng vào MongoDB
 */
async function saveLeaderboardToMongo(categoryKey, title, players) {
  if (!isMongoAvailable()) return false;
  try {
    const Model = getLeaderboardModel();
    await Model.findOneAndUpdate(
      { categoryKey },
      { categoryKey, title, players, scrapedAt: new Date() },
      { upsert: true, new: true }
    );
    return true;
  } catch (e) {
    console.warn('[LeaderboardHelper] Lỗi ghi MongoDB:', e.message);
    return false;
  }
}

/**
 * Lấy dữ liệu bảng xếp hạng (ưu tiên MongoDB, sau đó tới file local)
 * @param {string} typeKey - key của hạng mục (money, shards, kills, ...)
 * @returns {object|null}
 */
async function getLeaderboardCategory(typeKey) {
  const config = LEADERBOARD_CATEGORIES[typeKey];
  if (!config) return null;

  // 1. Thử lấy từ MongoDB
  const mongoData = await getLeaderboardFromMongo(typeKey);
  if (mongoData && Array.isArray(mongoData.players) && mongoData.players.length > 0) {
    return {
      ...config,
      scrapedAt: mongoData.scrapedAt,
      subGuiTitle: mongoData.title,
      totalPlayers: mongoData.players.length,
      players: mongoData.players
    };
  }

  // 2. Thử lấy từ file local nếu có
  const rawData = loadLeaderboardRawData();
  if (!rawData || !rawData.categories) return null;

  const rawCat = rawData.categories[config.itemType];
  if (!rawCat) return null;

  const formattedPlayers = (rawCat.players || []).map((p, idx) => {
    let rank = idx + 1;
    let username = p.displayName || '';

    const rankMatch = username.match(/^#(\d+)\s*(.*)$/);
    if (rankMatch) {
      rank = parseInt(rankMatch[1], 10);
      username = rankMatch[2].trim();
    }

    const value = parseLoreValue(p.lore);

    return {
      rank,
      username: username || `Người chơi #${rank}`,
      value: value,
      rawLore: p.lore,
      skinUrl: p.skinUrl || null,
      avatarUrl: skinHelper.getAvatarUrl(username, 64, true)
    };
  });

  return {
    ...config,
    scrapedAt: rawData.scrapedAt,
    subGuiTitle: rawCat.subGuiTitle,
    totalPlayers: formattedPlayers.length,
    players: formattedPlayers
  };
}

module.exports = {
  LEADERBOARD_CATEGORIES,
  RANK_ORE_EMOJIS,
  getRankOreEmoji,
  getLeaderboardCategory,
  getLeaderboardFromMongo,
  saveLeaderboardToMongo,
  loadLeaderboardRawData,
  parseLoreValue
};
