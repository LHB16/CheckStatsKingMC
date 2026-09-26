/**
 * helpers/paginationHelper.js - Quản lý Phân Trang, Nút Bấm & Bộ Nhớ Đệm Tạm Thời (20s TTL)
 * @description Chia nhỏ danh sách vật phẩm/đơn hàng thành các trang 9 món, hỗ trợ Lazy Render và tự dọn dẹp RAM sau 20s.
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { renderTableImage, formatItemDisplayName, normalizeSmallCaps, cleanBuyerName } = require('./renderHelper');
const { getCustomEmoji } = require('./utils');

// Bộ nhớ đệm lưu trữ các phiên phân trang đang hoạt động
const paginationSessions = new Map();

// Thời gian sống của phiên (5 phút = 300,000 ms)
const SESSION_TTL_MS = 5 * 60 * 1000;

/**
 * Chia một mảng thành các mảng con (chunking) theo kích thước chỉ định
 * @param {Array} array 
 * @param {number} size - Mặc định 9
 * @returns {Array<Array>}
 */
function chunkArray(array, size = 9) {
  if (!Array.isArray(array) || array.length === 0) return [];
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Tạo hàng nút bấm điều hướng phân trang Discord
 * @param {string} sessionId 
 * @param {number} currentPage 
 * @param {number} totalPages 
 * @param {boolean} disabled - Vô hiệu hóa toàn bộ nút (khi hết hạn)
 * @returns {ActionRowBuilder}
 */
function buildPaginationRow(sessionId, currentPage, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`page_${sessionId}_prev`)
      .setLabel('◀️ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`page_${sessionId}_indicator`)
      .setLabel(`Trang ${currentPage}/${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`page_${sessionId}_next`)
      .setLabel('Sau ▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || currentPage >= totalPages)
  );
}

/**
 * Tạo mô tả text cho một trang danh sách AH
 */
function formatAhTextPage(items, itemQuery, pageIndex, pageSize = 9) {
  const startIndex = (pageIndex - 1) * pageSize;
  const blocks = items.map((item, idx) => {
    const stt = startIndex + idx + 1;
    const priceText = item.price || 'N/A';
    const cleanDisplay = (item.displayName || '').replace(/§[0-9a-fk-or]/gi, '').trim();
    const rawName = item.itemName || item.name;
    const normalizedDisplay = normalizeSmallCaps(cleanDisplay);
    const isOrderTitle = /^(?:don\s*hang|order)/i.test(normalizedDisplay)
      || normalizedDisplay.includes('don hang')
      || cleanDisplay.toLowerCase().includes('đơn hàng');

    const nameToShow = (cleanDisplay && cleanDisplay !== 'Item' && !isOrderTitle)
      ? cleanDisplay
      : (rawName ? formatItemDisplayName(rawName) : itemQuery);

    const quantity = item.quantity || item.count || '1';
    const seller = item.seller || 'Ẩn danh';

    // Lấy đúng Emoji 3D cho vật phẩm này
    const itemEmoji = getCustomEmoji(rawName || itemQuery || cleanDisplay);
    const line1 = `${itemEmoji} **#${stt} ${nameToShow}** | Số lượng: \`${quantity}\``;
    const line2 = `   └─ Người bán: **${seller}** | Giá: **${priceText}**`;

    return `${line1}\n${line2}`;
  });

  let text = blocks.join('\n\n');
  if (text.length > 4096) {
    text = text.substring(0, 4080) + '...';
  }
  return text;
}

/**
 * Tạo mô tả text cho một trang danh sách Order
 */
function formatOrderTextPage(orders, itemQuery, pageIndex, pageSize = 9) {
  const startIndex = (pageIndex - 1) * pageSize;
  const blocks = orders.map((order, idx) => {
    const stt = startIndex + idx + 1;
    const priceText = order.price || 'N/A';
    const cleanDisplay = (order.displayName || '').replace(/§[0-9a-fk-or]/gi, '').trim();
    const rawName = order.itemName || order.name;
    const normalizedDisplay = normalizeSmallCaps(cleanDisplay);
    const isOrderTitle = /^(?:don\s*hang|order)/i.test(normalizedDisplay)
      || normalizedDisplay.includes('don hang')
      || cleanDisplay.toLowerCase().includes('đơn hàng');

    let itemQueryId = (rawName && rawName !== 'player_head' && rawName !== 'skull' && rawName !== 'air')
      ? rawName
      : null;

    const nameToShow = (cleanDisplay && !isOrderTitle && cleanDisplay !== 'Item' && cleanDisplay !== 'Vật phẩm')
      ? cleanDisplay
      : (itemQueryId ? formatItemDisplayName(itemQueryId) : itemQuery);

    let buyerName = order.buyer;
    if (!buyerName || buyerName === 'Ẩn danh' || /^(?:don\s*hang|order)/i.test(normalizeSmallCaps(buyerName))) {
      buyerName = cleanBuyerName(order.displayName || cleanDisplay);
    }
    buyerName = buyerName || 'Ẩn danh';

    // Xác định thông tin tiến độ giao hoặc số lượng
    const progressInfo = order.delivered
      ? `Đã giao: \`${order.delivered}\``
      : (order.remaining ? `Còn lại: \`${order.remaining}\`` : `Số lượng: \`${order.quantity || '1'}\``);

    // Lấy đúng Emoji 3D cho vật phẩm order này
    const itemEmoji = getCustomEmoji(itemQueryId || rawName || itemQuery || cleanDisplay);
    const line1 = `${itemEmoji} **#${stt} ${nameToShow}** | ${progressInfo}`;
    const line2 = `   └─ Người mua: **${buyerName}** | Giá: **${priceText}**`;

    return `${line1}\n${line2}`;
  });

  let text = blocks.join('\n\n');
  if (text.length > 4096) {
    text = text.substring(0, 4080) + '...';
  }
  return text;
}

/**
 * Khởi tạo một phiên phân trang mới với TTL 5 phút
 * @param {object} params
 * @param {import('discord.js').CommandInteraction} params.interaction
 * @param {'ah'|'order'} params.type
 * @param {string} params.itemQuery
 * @param {Array<Array>} params.pages
 * @param {'image'|'text'} params.displayMode
 * @param {Array<Buffer>|Buffer|null} params.initialImageBuffers
 * @param {Buffer|null} params.initialImageBuffer
 * @returns {string} sessionId
 */
function createPaginationSession({ interaction, type, itemQuery, pages, displayMode, initialImageBuffers = null, initialImageBuffer = null }) {
  // Sinh sessionId ngẫu nhiên không chứa dấu gạch dưới để tránh xung đột định dạng customId
  const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  const cachedImages = new Map();
  if (Array.isArray(initialImageBuffers)) {
    initialImageBuffers.forEach((buf, idx) => {
      if (buf) cachedImages.set(idx + 1, buf);
    });
  } else if (initialImageBuffer) {
    cachedImages.set(1, initialImageBuffer);
  }

  const session = {
    id: sessionId,
    interaction,
    type,
    itemQuery,
    pages,
    totalPages: pages.length,
    currentPage: 1,
    displayMode,
    cachedImages,
    timer: null
  };

  // Kích hoạt bộ đếm thời gian 5 phút để dọn dẹp RAM và làm mờ nút
  const scheduleCleanup = () => {
    return setTimeout(async () => {
      try {
        const disabledRow = buildPaginationRow(sessionId, session.currentPage, session.totalPages, true);
        if (session.interaction) {
          await session.interaction.editReply({ components: [disabledRow] }).catch(() => {});
        }
      } catch (e) {}

      // Xóa hoàn toàn khỏi RAM
      if (session.cachedImages) session.cachedImages.clear();
      session.pages = null;
      paginationSessions.delete(sessionId);
    }, SESSION_TTL_MS);
  };

  session.timer = scheduleCleanup();
  paginationSessions.set(sessionId, session);

  return sessionId;
}

/**
 * Xử lý sự kiện khi người dùng nhấn nút chuyển trang trên Discord
 * @param {import('discord.js').ButtonInteraction} interaction 
 * @returns {Promise<boolean>} true nếu đã xử lý
 */
async function handlePaginationButtons(interaction) {
  if (!interaction.isButton()) return false;
  const { customId } = interaction;

  if (!customId.startsWith('page_')) return false;

  // Trích xuất chính xác sessionId và action bằng Regex an toàn tuyệt đối
  const match = customId.match(/^page_(.+)_(prev|next|indicator)$/);
  if (!match) return false;

  const sessionId = match[1];
  const action = match[2]; // 'prev' | 'next' | 'indicator'

  if (action === 'indicator') {
    return true;
  }

  const session = paginationSessions.get(sessionId);

  // Phiên đã hết hạn (sau 5 phút)
  if (!session) {
    const barrierEmoji = getCustomEmoji('barrier');
    await interaction.reply({
      content: `${barrierEmoji} Phiên xem trang đã hết hạn (5 phút) để giải phóng tài nguyên. Vui lòng gõ lại lệnh nếu muốn tra cứu tiếp nhé!`,
      ephemeral: true
    }).catch(() => {});
    return true;
  }

  let newPage = session.currentPage;
  if (action === 'prev') {
    newPage = Math.max(1, session.currentPage - 1);
  } else if (action === 'next') {
    newPage = Math.min(session.totalPages, session.currentPage + 1);
  }

  if (newPage === session.currentPage) {
    await interaction.deferUpdate().catch(() => {});
    return true;
  }

  await interaction.deferUpdate().catch(() => {});

  // Reset lại bộ đếm thời gian 20s khi có tương tác (để người dùng có thêm 20s xem trang mới)
  if (session.timer) clearTimeout(session.timer);
  session.timer = setTimeout(async () => {
    try {
      const disabledRow = buildPaginationRow(sessionId, session.currentPage, session.totalPages, true);
      if (session.interaction) {
        await session.interaction.editReply({ components: [disabledRow] }).catch(() => {});
      }
    } catch (e) {}

    if (session.cachedImages) session.cachedImages.clear();
    session.pages = null;
    paginationSessions.delete(sessionId);
  }, SESSION_TTL_MS);

  session.currentPage = newPage;
  const pageItems = session.pages[newPage - 1] || [];
  const startIndex = (newPage - 1) * 9 + 1;

  try {
    // 1. Chế độ render ảnh
    if (session.displayMode === 'image') {
      let imageBuffer = session.cachedImages.get(newPage);

      // Nếu trang chưa có trong cache -> Render theo yêu cầu (Lazy Render)
      if (!imageBuffer) {
        const titlePrefix = session.type === 'ah' ? 'DANH SÁCH AH' : 'DANH SÁCH ORDER';
        const pageTitle = `${titlePrefix}: ${session.itemQuery} (TRANG ${newPage}/${session.totalPages})`;
        
        imageBuffer = await renderTableImage(
          pageTitle,
          session.itemQuery,
          pageItems,
          session.type,
          startIndex
        );

        if (imageBuffer) {
          session.cachedImages.set(newPage, imageBuffer);
        }
      }

      if (imageBuffer) {
        const fileName = `${session.type}_table_p${newPage}.png`;
        const attachment = new AttachmentBuilder(imageBuffer, { name: fileName });

        const embed = new EmbedBuilder()
          .setImage(`attachment://${fileName}`)
          .setColor('#2b2d31')
          .setTimestamp()
          .setFooter({ text: `KingMC.vn Stats Bot • Trang ${newPage}/${session.totalPages} • Thiết kế bởi BinhLH` });

        const row = buildPaginationRow(sessionId, newPage, session.totalPages);
        await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
        return true;
      }
    }

    // 2. Chế độ văn bản (Text Mode)
    const emoji = getCustomEmoji(session.itemQuery);
    const titlePrefix = session.type === 'ah' ? 'Danh sách AH' : 'Danh sách đơn hàng';

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} ${titlePrefix}: **${session.itemQuery}** (Trang ${newPage}/${session.totalPages})`)
      .setColor('#2b2d31')
      .setTimestamp()
      .setFooter({ text: `KingMC.vn Stats Bot • Trang ${newPage}/${session.totalPages} • Thiết kế bởi BinhLH` });

    const descText = session.type === 'ah'
      ? formatAhTextPage(pageItems, session.itemQuery, newPage, 9)
      : formatOrderTextPage(pageItems, session.itemQuery, newPage, 9);

    embed.setDescription(descText);

    const row = buildPaginationRow(sessionId, newPage, session.totalPages);
    await interaction.editReply({ embeds: [embed], files: [], components: [row] });
    return true;

  } catch (err) {
    console.error(`[PaginationHelper] Lỗi khi chuyển sang trang ${newPage}:`, err.message);
  }

  return true;
}

module.exports = {
  chunkArray,
  buildPaginationRow,
  createPaginationSession,
  handlePaginationButtons,
  formatAhTextPage,
  formatOrderTextPage
};
