/**
 * helpers/utils.js - Các hàm tiện ích bổ trợ cho Bot Check Stats
 */

// Từ điển Custom Emojis Discord để hiển thị icon Minecraft in-game
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
function getCustomEmoji(itemName) {
  if (!itemName) return '🔹';
  const nameLower = itemName.toLowerCase();
  
  // 1. Khớp chính xác
  if (CUSTOM_EMOJIS[nameLower]) return CUSTOM_EMOJIS[nameLower];
  
  // 2. Khớp từ khóa
  for (const [key, emoji] of Object.entries(CUSTOM_EMOJIS)) {
    if (nameLower.includes(key)) {
      return emoji;
    }
  }
  
  return '🔹'; // Icon mặc định nếu không có hình khối
}

// Định dạng tên vật phẩm Minecraft (vd: iron_chestplate -> Iron Chestplate)
function formatItemName(name) {
  if (!name) return 'Unknown';
  return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Hàm phân loại tên để lấy tiêu đề nhãn
function getStatsLabel(item) {
  const nameLower = (item.name || '').toLowerCase();
  const displayNameLower = (item.displayName || '').toLowerCase();

  if (displayNameLower.includes('tiền') || displayNameLower.includes('xu') || displayNameLower.includes('money') || displayNameLower.includes('coin')) return 'Tài chính';
  if (displayNameLower.includes('shard') || displayNameLower.includes('ngôi sao') || displayNameLower.includes('sao') || displayNameLower.includes('★')) return 'Shards';
  if (displayNameLower.includes('kill') || displayNameLower.includes('giết') || displayNameLower.includes('hạ gục')) return 'Kills';
  if (displayNameLower.includes('death') || displayNameLower.includes('chết') || displayNameLower.includes('bị giết')) return 'Deaths';
  if (displayNameLower.includes('thời gian') || displayNameLower.includes('time') || displayNameLower.includes('giờ') || displayNameLower.includes('playtime')) return 'Thời gian chơi';
  if (displayNameLower.includes('rank') || displayNameLower.includes('danh hiệu') || displayNameLower.includes('cấp') || displayNameLower.includes('level')) return 'Rank/Cấp độ';

  return item.displayName || 'Thông tin';
}

// Lọc các item trang trí không cần thiết trong GUI stats
function isDecorationItem(item) {
  const nameLower = (item.name || '').toLowerCase();
  const displayName = (item.displayName || '').trim();
  
  if (nameLower.includes('glass_pane') || nameLower === 'air' || nameLower === 'barrier') {
    return true;
  }
  if (!displayName || displayName === ' ' || displayName === '§f') {
    return true;
  }
  if ((!item.lore || item.lore.length === 0) && (nameLower.includes('pane') || nameLower.includes('stained'))) {
    return true;
  }
  
  return false;
}

module.exports = {
  CUSTOM_EMOJIS,
  getCustomEmoji,
  formatItemName,
  getStatsLabel,
  isDecorationItem
};
