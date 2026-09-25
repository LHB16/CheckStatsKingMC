/**
 * helpers/utils.js - Các hàm tiện ích bổ trợ cho Bot Check Stats
 */

const fs = require('fs');
const path = require('path');

// Đường dẫn file mapping emoji đã upload lên Discord
const DISCORD_EMOJI_FILE = path.join(__dirname, '../public/textures/discord_emojis.json');
let DYNAMIC_EMOJIS = {};

function loadDynamicEmojis() {
  if (fs.existsSync(DISCORD_EMOJI_FILE)) {
    try {
      DYNAMIC_EMOJIS = JSON.parse(fs.readFileSync(DISCORD_EMOJI_FILE, 'utf8'));
    } catch (_) {}
  }
}
loadDynamicEmojis();

// Tự động cập nhật cache khi có emoji mới được upload
if (fs.existsSync(DISCORD_EMOJI_FILE)) {
  try {
    const watcher = fs.watch(DISCORD_EMOJI_FILE, () => {
      loadDynamicEmojis();
    });
    if (watcher && watcher.unref) watcher.unref();
  } catch (_) {}
}

// Từ điển Custom Emojis Discord để hiển thị icon Minecraft in-game (Dự phòng)
const CUSTOM_EMOJIS = {
  'emerald': '<:emerald:1526222843585757405>',
  'sunflower': '<:gold_ingot:1526222925349388298>', // Dùng gold ingot đỡ cho xu
  'nether_star': '<:amethyst_shard:1526223433715810444>', // Dùng shard đỡ cho nether_star
  'diamond_sword': '<:netherite_sword:1526222996941967621>',
  'sword': '<:netherite_sword:1526222996941967621>',
  'skeleton_skull': '<:skeleton_skull:1526223042873655357>',
  'zombie_head': '<:zombie_head:1526223269437374464>',
  'clock': '<:clockss:1526227967422890225>',
  'chest': '<:chest:1526222711079174346>',
  'pickaxe': '<:diamond_pickaxe:1526222779287081040>',
  'gold': '<:gold_ingot:1526222925349388298>',
  'amethyst': '<:amethyst_shard:1526223433715810444>',
  'wheat': '<:wheat:1526223092974751766>',
  'brick': '<:brickss:1526227925865599130>'
};

// Hàm lấy Emoji dựa theo tên vật phẩm Minecraft
function getCustomEmoji(itemInput, fallback = '🔹') {
  if (!itemInput) return fallback;

  // Hỗ trợ cả string và object (item từ Mineflayer / AH / Order)
  let rawName = '';
  if (typeof itemInput === 'object') {
    rawName = itemInput.itemName || itemInput.name || itemInput.displayName || '';
  } else {
    rawName = String(itemInput);
  }

  if (!rawName) return fallback;

  let clean = cleanMinecraftText(rawName)
    .toLowerCase()
    .replace(/^minecraft:/i, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

  if (!clean) return fallback;

  // 1. Khớp chính xác trong Dynamic Emojis (Discord Application Emojis mới)
  if (DYNAMIC_EMOJIS[clean]) return DYNAMIC_EMOJIS[clean];

  // 2. Khớp chính xác trong CUSTOM_EMOJIS dự phòng
  if (CUSTOM_EMOJIS[clean]) return CUSTOM_EMOJIS[clean];

  // 3. Khớp tiền tố/hậu tố trong Dynamic Emojis (vd: minecraft:enchanted_golden_apple -> golden_apple)
  for (const [key, emoji] of Object.entries(DYNAMIC_EMOJIS)) {
    if (clean === key || clean.endsWith('_' + key) || clean.startsWith(key + '_')) {
      return emoji;
    }
  }

  // 4. Khớp chứa từ khóa trong Dynamic Emojis
  for (const [key, emoji] of Object.entries(DYNAMIC_EMOJIS)) {
    if (clean.includes(key)) {
      return emoji;
    }
  }

  // 5. Khớp từ khóa trong CUSTOM_EMOJIS
  for (const [key, emoji] of Object.entries(CUSTOM_EMOJIS)) {
    if (clean.includes(key)) {
      return emoji;
    }
  }

  return fallback;
}

// Định dạng tên vật phẩm Minecraft (vd: iron_chestplate -> Iron Chestplate)
function formatItemName(name) {
  if (!name) return 'Unknown';
  return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Hàm loại bỏ mã màu Minecraft (§a, &a, &#RRGGBB, §x..., v.v.)
function cleanMinecraftText(text) {
  if (!text) return '';
  return String(text)
    .replace(/§x(§[0-9a-f]){6}/gi, '')
    .replace(/&x(&[0-9a-f]){6}/gi, '')
    .replace(/&#[0-9a-f]{6}/gi, '')
    .replace(/§#[0-9a-f]{6}/gi, '')
    .replace(/§[0-9a-fk-or]/gi, '')
    .replace(/&[0-9a-fk-or]/gi, '')
    .replace(/§./g, '')
    .replace(/[\u00A0\u200B\uFEFF]/g, ' ')
    .normalize('NFC')
    .trim();
}

// Hàm phân loại tên để lấy tiêu đề nhãn
function getStatsLabel(item) {
  const nameLower = (item.name || '').toLowerCase();
  const rawClean = cleanMinecraftText(item.displayName || '');
  const displayNameLower = rawClean.toLowerCase();

  if (displayNameLower.includes('tiền') || displayNameLower.includes('xu') || displayNameLower.includes('money') || displayNameLower.includes('coin')) return 'Tài chính';
  if (displayNameLower.includes('shard') || displayNameLower.includes('ngôi sao') || displayNameLower.includes('sao') || displayNameLower.includes('★')) return 'Shards';
  if (displayNameLower.includes('kill') || displayNameLower.includes('giết') || displayNameLower.includes('hạ gục')) return 'Kills';
  if (displayNameLower.includes('death') || displayNameLower.includes('chết') || displayNameLower.includes('bị giết')) return 'Deaths';
  if (displayNameLower.includes('thời gian') || displayNameLower.includes('time') || displayNameLower.includes('giờ') || displayNameLower.includes('playtime')) return 'Thời gian chơi';
  if (displayNameLower.includes('rank') || displayNameLower.includes('danh hiệu') || displayNameLower.includes('cấp') || displayNameLower.includes('level')) return 'Rank/Cấp độ';

  return rawClean || 'Thông tin';
}

// Lọc các item trang trí không cần thiết trong GUI stats
function isDecorationItem(item) {
  const nameLower = (item.name || '').toLowerCase();
  const displayName = cleanMinecraftText(item.displayName || '');
  
  if (nameLower.includes('glass_pane') || nameLower === 'air' || nameLower === 'barrier') {
    return true;
  }
  if (!displayName) {
    return true;
  }
  if ((!item.lore || item.lore.length === 0) && (nameLower.includes('pane') || nameLower.includes('stained'))) {
    return true;
  }
  
  return false;
}

/**
 * Định dạng khoảng thời gian tương đối (VD: "30s trước", "15m trước", "2h trước", "3d trước")
 * @param {Date|number|string} timestamp 
 * @returns {string}
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Chưa đo';
  const time = timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  if (isNaN(time)) return 'Chưa đo';

  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 60) return `${diffSec}s trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h trước`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d trước`;
}

/**
 * Định dạng ngày giờ theo múi giờ Việt Nam (UTC+7, Asia/Ho_Chi_Minh)
 * @param {Date|number|string} date 
 * @param {boolean} includeSeconds 
 * @returns {string}
 */
function formatVietnamTime(date, includeSeconds = true) {
  if (!date) return 'Chưa đo';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Chưa đo';

  return d.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

module.exports = {
  CUSTOM_EMOJIS,
  loadDynamicEmojis,
  cleanMinecraftText,
  getCustomEmoji,
  formatItemName,
  getStatsLabel,
  isDecorationItem,
  formatTimeAgo,
  formatVietnamTime
};
