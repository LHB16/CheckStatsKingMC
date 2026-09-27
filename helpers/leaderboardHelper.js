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
    choiceName: 'money',
    name: 'Money',
    titleName: 'MONEY',
    cmdArg: 'money',
    slot: 0,
    itemType: 'emerald',
    emojiKey: 'emerald',
    emojiId: '1553090824496222248',
    color: '#10b981', // Emerald green
    unit: '$',
    aliases: ['money'],
    description: 'Bảng xếp hạng người chơi giàu nhất cụm KingSMP'
  },
  shard: {
    key: 'shard',
    choiceName: 'shard',
    name: 'Shards',
    titleName: 'SHARDS',
    cmdArg: 'shards',
    slot: 1,
    itemType: 'amethyst_shard',
    emojiKey: 'amethyst_shard',
    emojiId: '1553093457247993856',
    color: '#a855f7', // Amethyst purple
    unit: 'Shard',
    aliases: ['shard', 'shards'],
    description: 'Bảng xếp hạng sở hữu nhiều đá tím Shard nhất'
  },
  kills: {
    key: 'kills',
    choiceName: 'kills',
    name: 'Kills',
    titleName: 'KILLS',
    cmdArg: 'kills',
    slot: 2,
    itemType: 'netherite_sword',
    emojiKey: 'netherite_sword',
    emojiId: '1553097648175579146',
    color: '#ef4444', // Red
    unit: 'mạng',
    aliases: ['kills'],
    description: 'Bảng xếp hạng số lần hạ gục người chơi khác'
  },
  deaths: {
    key: 'deaths',
    choiceName: 'deaths',
    name: 'Deaths',
    titleName: 'DEATHS',
    cmdArg: 'deaths',
    slot: 3,
    itemType: 'skeleton_skull',
    emojiKey: 'skeleton_skull',
    emojiId: '1553099418599825511',
    color: '#64748b', // Gray
    unit: 'lần',
    aliases: ['deaths'],
    description: 'Bảng xếp hạng số lần tử trận trên chiến trường'
  },
  played: {
    key: 'played',
    choiceName: 'played',
    name: 'Played',
    titleName: 'PLAYED',
    cmdArg: 'played',
    slot: 4,
    itemType: 'clock',
    emojiKey: 'clock',
    emojiId: '1553094595020066927',
    color: '#f59e0b', // Amber
    unit: '',
    aliases: ['played'],
    description: 'Bảng xếp hạng thời gian online cày cuốc tích lũy'
  },
  blocks_placed: {
    key: 'blocks_placed',
    choiceName: 'blocks_placed',
    name: 'Blocks Placed',
    titleName: 'BLOCKS PLACED',
    cmdArg: 'blocks_placed',
    slot: 5,
    itemType: 'bricks',
    emojiKey: 'bricks',
    emojiId: '1553094120023531641',
    color: '#b45309', // Brown
    unit: 'block',
    aliases: ['blocks_placed'],
    description: 'Bảng xếp hạng số lượng khối block đã đặt'
  },
  blocks_mined: {
    key: 'blocks_mined',
    choiceName: 'blocks_mined',
    name: 'Blocks Mined',
    titleName: 'BLOCKS MINED',
    cmdArg: 'blocks_mined',
    slot: 6,
    itemType: 'diamond_pickaxe',
    emojiKey: 'diamond_pickaxe',
    emojiId: '1553095447046922342',
    color: '#06b6d4', // Cyan
    unit: 'block',
    aliases: ['blocks_mined'],
    description: 'Bảng xếp hạng số lượng khối khoáng sản đã khai thác'
  },
  mob_kills: {
    key: 'mob_kills',
    choiceName: 'mob_kills',
    name: 'Mob Kills',
    titleName: 'MOB KILLS',
    cmdArg: 'mob_kills',
    slot: 7,
    itemType: 'zombie_head',
    emojiKey: 'zombie_head',
    emojiId: '1553101292220711126',
    color: '#84cc16', // Lime
    unit: 'quái',
    aliases: ['mob_kills'],
    description: 'Bảng xếp hạng số lượng quái vật đã tiêu diệt'
  },
  shop_buy: {
    key: 'shop_buy',
    choiceName: 'shop_buy',
    name: 'Shop Buy',
    titleName: 'SHOP BUY TOTAL',
    cmdArg: 'buy_total',
    slot: 8,
    itemType: 'chest',
    emojiKey: 'chest',
    emojiId: '1553094447237963796',
    color: '#eab308', // Yellow
    unit: '$',
    aliases: ['shop_buy', 'shop_buy_total', 'buy_total'],
    description: 'Bảng xếp hạng tổng giá trị tiền mua đồ tại Shop'
  },
  shop_sell: {
    key: 'shop_sell',
    choiceName: 'shop_sell',
    name: 'Shop Sell',
    titleName: 'SHOP SELL TOTAL',
    cmdArg: 'sell_total',
    slot: 9,
    itemType: 'gold_ingot',
    emojiKey: 'gold_ingot',
    emojiId: '1553096094412701798',
    color: '#eab308', // Gold
    unit: '$',
    aliases: ['shop_sell', 'shop_sell_total', 'sell_total'],
    description: 'Bảng xếp hạng tổng giá trị tiền kiếm được từ bán đồ Shop'
  },
  breed: {
    key: 'breed',
    choiceName: 'breed',
    name: 'Breed',
    titleName: 'ANIMALS BREED',
    cmdArg: 'breed',
    slot: 10,
    itemType: 'wheat',
    emojiKey: 'wheat',
    emojiId: '1553100962460340335',
    color: '#84cc16', // Grass green
    unit: 'lần',
    aliases: ['breed', 'animals_breed'],
    description: 'Bảng xếp hạng số lần nhân giống vật nuôi'
  }
};

// Đăng ký alias cho các key cũ để tương thích hoàn toàn
LEADERBOARD_CATEGORIES.shards = LEADERBOARD_CATEGORIES.shard;
LEADERBOARD_CATEGORIES.shop_buy_total = LEADERBOARD_CATEGORIES.shop_buy;
LEADERBOARD_CATEGORIES.buy_total = LEADERBOARD_CATEGORIES.shop_buy;
LEADERBOARD_CATEGORIES.shop_sell_total = LEADERBOARD_CATEGORIES.shop_sell;
LEADERBOARD_CATEGORIES.sell_total = LEADERBOARD_CATEGORIES.shop_sell;
LEADERBOARD_CATEGORIES.animals_breed = LEADERBOARD_CATEGORIES.breed;

/**
 * Tìm cấu hình danh mục từ bất kỳ key/alias nào
 */
function resolveCategoryConfig(key) {
  if (!key) return LEADERBOARD_CATEGORIES.money;
  const lower = String(key).toLowerCase().trim();
  if (LEADERBOARD_CATEGORIES[lower]) return LEADERBOARD_CATEGORIES[lower];
  for (const cat of Object.values(LEADERBOARD_CATEGORIES)) {
    if (cat.aliases && cat.aliases.includes(lower)) return cat;
    if (cat.cmdArg && cat.cmdArg.toLowerCase() === lower) return cat;
  }
  return LEADERBOARD_CATEGORIES.money;
}

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
    const config = resolveCategoryConfig(categoryKey);
    const searchKeys = config && config.aliases ? config.aliases : [categoryKey];
    const doc = await Model.findOne({ categoryKey: { $in: searchKeys } }).lean();
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
    const config = resolveCategoryConfig(categoryKey);
    const primaryKey = config ? config.key : categoryKey;
    const Model = getLeaderboardModel();
    const searchKeys = config && config.aliases ? config.aliases : [primaryKey];
    await Model.findOneAndUpdate(
      { categoryKey: { $in: searchKeys } },
      { categoryKey: primaryKey, title, players, scrapedAt: new Date() },
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
  const config = resolveCategoryConfig(typeKey);
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
  resolveCategoryConfig,
  getRankOreEmoji,
  getLeaderboardCategory,
  getLeaderboardFromMongo,
  saveLeaderboardToMongo,
  loadLeaderboardRawData,
  parseLoreValue
};
