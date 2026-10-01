/**
 * helpers/itemHelper.js - Tra cứu dữ liệu vật phẩm Minecraft (Anh - Việt, ID, Emoji Discord)
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, parseEmoji } = require('discord.js');
const { getCustomEmoji } = require('./utils');

// Nạp dữ liệu Minecraft phiên bản 1.21.4
const mcData = require('minecraft-data')('1.21.4');

// Nạp từ điển tiếng Việt chuẩn Minecraft
const LANG_VI_FILE = path.join(__dirname, '../data/minecraft_lang_vi.json');
let viLang = {};

try {
  if (fs.existsSync(LANG_VI_FILE)) {
    viLang = JSON.parse(fs.readFileSync(LANG_VI_FILE, 'utf8'));
  }
} catch (err) {
  console.warn('[ItemHelper] Không thể nạp từ điển tiếng Việt:', err.message);
}

// Emoji Minecraft Discord cho các trường thông tin thay thế emoji mặc định
const EMOJI_BOOK = getCustomEmoji('enchanted_book') || '<:enchanted_book:1553095604786429973>';
const EMOJI_NAME_TAG = getCustomEmoji('name_tag') || '<:name_tag:1553097564360937553>';
const EMOJI_CHEST = getCustomEmoji('chest') || '<:chest:1553094447237963796>';

/**
 * Lấy tên tiếng Việt của item từ mã namespaced (VD: diamond_sword -> Kiếm kim cương)
 */
function getVietnameseName(itemName, fallbackName = '') {
  if (!itemName) return fallbackName;
  const keyItem = `item.minecraft.${itemName}`;
  const keyBlock = `block.minecraft.${itemName}`;
  return viLang[keyItem] || viLang[keyBlock] || fallbackName || itemName;
}

/**
 * Lấy thông tin chi tiết đầy đủ của item
 * @param {string|number|object} itemInput
 */
function getItemDetail(itemInput) {
  let item = null;
  if (typeof itemInput === 'object' && itemInput && itemInput.name) {
    item = itemInput;
  } else if (typeof itemInput === 'number' || /^\d+$/.test(String(itemInput).trim())) {
    const numId = parseInt(itemInput, 10);
    item = mcData.items[numId] || mcData.blocks[numId];
  } else if (typeof itemInput === 'string') {
    const clean = itemInput.toLowerCase().replace(/^minecraft:/i, '').trim();
    item = mcData.itemsByName[clean] || mcData.blocksByName[clean];
  }

  if (!item) return null;

  const vietnameseName = getVietnameseName(item.name, item.displayName);
  const emoji = getCustomEmoji(item.name, '🔹');

  return {
    id: item.id,
    name: item.name,
    displayName: item.displayName || item.name,
    stackSize: item.stackSize || 64,
    vietnameseName,
    emoji
  };
}

/**
 * Tìm kiếm danh sách vật phẩm theo từ khóa tiếng Anh hoặc tiếng Việt
 * @param {string} query - Từ khóa cần tìm (yêu cầu >= 3 ký tự)
 * @param {number} limit - Số kết quả tối đa (mặc định 0 = không giới hạn, trả về tất cả kết quả)
 */
function searchItems(query, limit = 0) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];

  const qNoAccents = (q || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  const qUnderscore = q.replace(/[\s-]+/g, '_');
  const items = mcData.itemsArray || [];
  const matches = [];
  const seenNames = new Set();

  for (const item of items) {
    if (seenNames.has(item.name)) continue;

    const name = item.name.toLowerCase();
    const displayName = (item.displayName || '').toLowerCase();
    const viName = getVietnameseName(item.name, '').toLowerCase();
    const viNameNoAccents = viName ? viName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd') : '';
    let score = -1;

    // 1. Khớp chính xác hoàn toàn
    if (name === qUnderscore || displayName === q || viName === q || viNameNoAccents === qNoAccents) {
      score = 0;
    }
    // 2. Bắt đầu bằng từ khóa
    else if (
      name.startsWith(qUnderscore) ||
      displayName.startsWith(q) ||
      viName.startsWith(q) ||
      (viNameNoAccents && viNameNoAccents.startsWith(qNoAccents))
    ) {
      score = 1;
    }
    // 3. Có từ đơn lẻ trong tên bắt đầu bằng từ khóa (VD: "Sword" bắt đầu bằng "swo")
    else if (
      displayName.split(/\s+/).some(w => w.startsWith(q)) ||
      (viName && viName.split(/\s+/).some(w => w.startsWith(q))) ||
      (viNameNoAccents && viNameNoAccents.split(/\s+/).some(w => w.startsWith(qNoAccents)))
    ) {
      score = 2;
    }
    // 4. Chứa từ khóa bên trong tên
    else if (
      name.includes(qUnderscore) ||
      displayName.includes(q) ||
      viName.includes(q) ||
      (viNameNoAccents && viNameNoAccents.includes(qNoAccents))
    ) {
      score = 3;
    }

    if (score !== -1) {
      seenNames.add(item.name);
      matches.push({
        item,
        score,
        length: name.length
      });
    }
  }

  // Sắp xếp ưu tiên: Điểm score nhỏ hơn -> Tên ngắn hơn
  matches.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.length - b.length;
  });

  const finalMatches = limit > 0 ? matches.slice(0, limit) : matches;
  return finalMatches.map(m => getItemDetail(m.item));
}

/**
 * Tạo Embed hiển thị chi tiết vật phẩm chuẩn theo mẫu yêu cầu
 * @param {object} itemDetail
 */
function formatItemEmbed(itemDetail) {
  const { displayName, vietnameseName, name, id, stackSize, emoji } = itemDetail;

  const lines = [
    `${emoji} **Tên tiếng Anh :** ${displayName}`,
    `${EMOJI_BOOK} **Tên tiếng Việt :** ${vietnameseName}`,
    `${EMOJI_NAME_TAG} **ID :** \`${name}\` | \`${id}\``,
    `${EMOJI_CHEST} **Stack Size :** ${stackSize}`
  ];

  return new EmbedBuilder()
    .setTitle(`${emoji} Thông Tin Vật Phẩm: ${displayName}`)
    .setDescription(lines.join('\n'))
    .setColor('#2b2d31')
    .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
    .setTimestamp();
}

/**
 * Trích xuất emoji thích hợp cho StringSelectMenuOptionBuilder
 * @param {string} emojiStr
 */
function resolveSelectMenuEmoji(emojiStr) {
  if (!emojiStr) return undefined;
  try {
    const parsed = parseEmoji(emojiStr);
    if (parsed && (parsed.id || parsed.name)) {
      return parsed;
    }
  } catch (_) {}
  return undefined;
}

module.exports = {
  mcData,
  searchItems,
  getItemDetail,
  getVietnameseName,
  formatItemEmbed,
  resolveSelectMenuEmoji,
  EMOJI_BOOK,
  EMOJI_NAME_TAG,
  EMOJI_CHEST
};
