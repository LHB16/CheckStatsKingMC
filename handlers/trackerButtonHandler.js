/**
 * handlers/trackerButtonHandler.js - Xử lý tương tác Nút Bấm Theo Dõi & Xuất Biểu Đồ Số Dư
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const trackerHelper = require('../helpers/trackerHelper');
const { renderBalanceChart } = require('../helpers/renderHelper');
const { getCustomEmoji } = require('../helpers/utils');
const skinHelper = require('../helpers/skinHelper');

// Bộ nhớ tạm lưu lại view ban đầu (embeds) của tin nhắn check bal / stats để phục vụ nút "Quay lại"
// Map<messageId, { embeds: any[], playerName: string, timestamp: number }>
const originalViewCache = new Map();

// Tự động dọn dẹp cache sau mỗi 30 phút để giải phóng bộ nhớ
setInterval(() => {
  const now = Date.now();
  for (const [msgId, data] of originalViewCache.entries()) {
    if (now - data.timestamp > 60 * 60 * 1000) {
      originalViewCache.delete(msgId);
    }
  }
}, 30 * 60 * 1000).unref();

/**
 * Xử lý các tương tác nút bấm liên quan đến Balance Tracker
 * @param {import('discord.js').ButtonInteraction} interaction 
 * @returns {Promise<boolean>} true nếu tương tác được xử lý, false nếu không phải nút tracker
 */
async function handleTrackerButtons(interaction) {
  if (!interaction.isButton()) return false;

  const { customId } = interaction;

  // 1. Nút Bật theo dõi hoặc Xem biểu đồ
  if (customId.startsWith('track_bal_')) {
    const playerName = customId.replace('track_bal_', '').trim();
    if (!playerName) return false;

    const isTracking = await trackerHelper.isTracking(playerName);

    // TRƯỜNG HỢP 1: Chưa theo dõi -> BẬT THEO DÕI (Cập nhật trực tiếp nút bấm trên tin nhắn hiện tại)
    if (!isTracking) {
      // Cố gắng trích xuất số dư hiện tại từ Embed tin nhắn (nếu có)
      let currentBal = null;
      if (interaction.message && interaction.message.embeds && interaction.message.embeds.length > 0) {
        const desc = interaction.message.embeds[0].description || '';
        const match = desc.match(/`([^`]+)`/);
        if (match) {
          currentBal = match[1];
        }
      }

      await trackerHelper.setTracking(playerName, true, currentBal);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`track_bal_${playerName}`)
          .setLabel('📈 Xem biểu đồ biến động')
          .setStyle(ButtonStyle.Success)
      );

      // Chỉnh sửa trực tiếp nút bấm trên tin nhắn ban đầu
      await interaction.update({ components: [row] });

      // Gửi phản hồi thông báo nhẹ chỉ cho người bấm (ephemeral)
      try {
        await interaction.followUp({
          content: `🔔 Đã bật theo dõi số dư cho người chơi **${playerName}** thành công!\n⏰ Tự động kiểm tra định kỳ 1 giờ / lần. Dữ liệu lưu trữ trong 3 ngày.`,
          ephemeral: true
        });
      } catch (e) {}

      return true;
    }

    // TRƯỜNG HỢP 2: Đã theo dõi -> XUẤT BIỂU ĐỒ BIẾN ĐỘNG 3 NGÀY (Sửa trực tiếp tin nhắn hiện tại)
    // Lưu lại Embeds ban đầu của tin nhắn check bal / stats để phục vụ nút "Quay lại"
    if (interaction.message && interaction.message.embeds && interaction.message.embeds.length > 0) {
      if (!originalViewCache.has(interaction.message.id)) {
        originalViewCache.set(interaction.message.id, {
          embeds: interaction.message.embeds.map(e => EmbedBuilder.from(e)),
          playerName,
          timestamp: Date.now()
        });
      }
    }

    await interaction.deferUpdate();

    try {
      const historyData = await trackerHelper.getPlayerHistory(playerName);
      if (!historyData) {
        await interaction.followUp({
          content: `⚠️ Không tìm thấy dữ liệu theo dõi cho người chơi **${playerName}**.`,
          ephemeral: true
        });
        return true;
      }

      const chartBuffer = await renderBalanceChart(playerName, historyData);
      const attachment = new AttachmentBuilder(chartBuffer, { name: `balance_chart_${playerName}.png` });

      const stats = historyData.stats || {};
      const isPositive = (stats.balanceChange || 0) >= 0;
      const changeSign = isPositive ? '+' : '-';
      const changeStr = `${changeSign}$${Math.abs(stats.balanceChange || 0).toLocaleString('en-US')} (${isPositive ? '+' : ''}${stats.changePercent}%)`;

      const chartEmbed = new EmbedBuilder()
        .setTitle(`📈 Biểu Đồ Biến Động Số Dư: **${playerName}**`)
        .setDescription(
          `📊 **Thống kê 3 ngày gần nhất:**\n` +
          `• Số dư hiện tại: **$${(stats.currentBalance || 0).toLocaleString('en-US')}**\n` +
          `• Biến động: **${changeStr}**\n` +
          `• Đỉnh / Đáy: **$${(stats.maxBalance || 0).toLocaleString('en-US')}** / **$${(stats.minBalance || 0).toLocaleString('en-US')}**\n` +
          `• Tổng số mốc ghi nhận: **${stats.count}** lần đo`
        )
        .setImage(`attachment://balance_chart_${playerName}.png`)
        .setColor(isPositive ? '#10b981' : '#ef4444')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Tự động kiểm tra mỗi 1h • Thiết kế bởi BinhLH' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`refresh_chart_${playerName}`)
          .setLabel('🔄 Làm mới biểu đồ')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`back_to_info_${playerName}`)
          .setLabel('🔙 Quay lại')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [chartEmbed], files: [attachment], components: [row] });
      return true;
    } catch (err) {
      console.error(`[TrackerButton] Lỗi vẽ biểu đồ cho ${playerName}:`, err.message);
      await interaction.followUp({
        content: `❌ Không thể tạo biểu đồ biến động lúc này: ${err.message}`,
        ephemeral: true
      });
      return true;
    }
  }

  // 2. Nút Làm mới biểu đồ
  if (customId.startsWith('refresh_chart_')) {
    const playerName = customId.replace('refresh_chart_', '').trim();
    await interaction.deferUpdate();

    try {
      const historyData = await trackerHelper.getPlayerHistory(playerName);
      if (!historyData) return true;

      const chartBuffer = await renderBalanceChart(playerName, historyData);
      const attachment = new AttachmentBuilder(chartBuffer, { name: `balance_chart_${playerName}.png` });

      const stats = historyData.stats || {};
      const isPositive = (stats.balanceChange || 0) >= 0;
      const changeSign = isPositive ? '+' : '-';
      const changeStr = `${changeSign}$${Math.abs(stats.balanceChange || 0).toLocaleString('en-US')} (${isPositive ? '+' : ''}${stats.changePercent}%)`;

      const chartEmbed = new EmbedBuilder()
        .setTitle(`📈 Biểu Đồ Biến Động Số Dư: **${playerName}**`)
        .setDescription(
          `📊 **Thống kê 3 ngày gần nhất (Đã làm mới):**\n` +
          `• Số dư hiện tại: **$${(stats.currentBalance || 0).toLocaleString('en-US')}**\n` +
          `• Biến động: **${changeStr}**\n` +
          `• Đỉnh / Đáy: **$${(stats.maxBalance || 0).toLocaleString('en-US')}** / **$${(stats.minBalance || 0).toLocaleString('en-US')}**\n` +
          `• Tổng số mốc ghi nhận: **${stats.count}** lần đo`
        )
        .setImage(`attachment://balance_chart_${playerName}.png`)
        .setColor(isPositive ? '#10b981' : '#ef4444')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Tự động kiểm tra mỗi 1h • Thiết kế bởi BinhLH' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`refresh_chart_${playerName}`)
          .setLabel('🔄 Làm mới biểu đồ')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`back_to_info_${playerName}`)
          .setLabel('🔙 Quay lại')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [chartEmbed], files: [attachment], components: [row] });
      return true;
    } catch (err) {
      console.error(`[TrackerButton] Lỗi làm mới biểu đồ cho ${playerName}:`, err.message);
      return true;
    }
  }

  // 3. Nút Quay lại thông tin check bal / stats ban đầu
  if (customId.startsWith('back_to_info_')) {
    const playerName = customId.replace('back_to_info_', '').trim();
    await interaction.deferUpdate();

    try {
      const cached = originalViewCache.get(interaction.message.id);
      let restoredEmbeds = [];

      if (cached && cached.embeds && cached.embeds.length > 0) {
        restoredEmbeds = cached.embeds;
      } else {
        // Fallback tái tạo Embed số dư nếu cache bị xóa
        const historyData = await trackerHelper.getPlayerHistory(playerName);
        const emeraldEmoji = getCustomEmoji('emerald');
        const latestBal = (historyData && historyData.stats && historyData.stats.currentBalance != null)
          ? `$${Number(historyData.stats.currentBalance).toLocaleString('en-US')}`
          : 'N/A';

        const fallbackEmbed = new EmbedBuilder()
          .setTitle(`${emeraldEmoji} Số dư người chơi: **${playerName}**`)
          .setColor('#2b2d31')
          .setThumbnail(skinHelper.getAvatarUrl(playerName, 64, true))
          .setDescription(`${emeraldEmoji} **SỐ DƯ:** \`${latestBal}\`\n\n\u200B`)
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });
        restoredEmbeds = [fallbackEmbed];
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`track_bal_${playerName}`)
          .setLabel('📈 Xem biểu đồ biến động')
          .setStyle(ButtonStyle.Success)
      );

      // Cập nhật lại tin nhắn: xóa bỏ attachments biểu đồ, khôi phục embed và nút xem biểu đồ
      await interaction.editReply({
        embeds: restoredEmbeds,
        attachments: [],
        components: [row]
      });
      return true;
    } catch (err) {
      console.error(`[TrackerButton] Lỗi khi quay lại thông tin cho ${playerName}:`, err.message);
      return true;
    }
  }

  // 4. Nút Hủy theo dõi (Đã vô hiệu hóa để tránh người dùng tùy tiện hủy)
  if (customId.startsWith('untrack_bal_')) {
    const playerName = customId.replace('untrack_bal_', '').trim();
    await interaction.reply({
      content: `⚠️ Tính năng hủy theo dõi qua nút bấm đã bị vô hiệu hóa để tránh việc bất kỳ ai cũng có thể tự ý hủy theo dõi người chơi **${playerName}**.\nChỉ Admin mới có thể quản lý qua lệnh \`!tracker untrack <player>\`.`,
      ephemeral: true
    });
    return true;
  }

  // 5. Nút Phân trang danh sách Tracker Overview
  if (customId.startsWith('tracker_page_')) {
    const pageStr = customId.replace('tracker_page_', '');
    const pageNum = parseInt(pageStr) || 1;
    await interaction.deferUpdate();

    try {
      const overview = await trackerHelper.getTrackerOverview();
      const payload = buildTrackerOverviewMessage(overview, pageNum);
      await interaction.editReply(payload);
    } catch (err) {
      console.error('[TrackerButton] Lỗi chuyển trang tracker:', err.message);
    }
    return true;
  }

  // 6. Nút Kích hoạt chu kỳ kiểm tra ngay lập tức (Admin)
  if (customId === 'tracker_run_check') {
    const ADMIN_ID = (process.env.ADMIN_ID || '').trim();
    if (ADMIN_ID && interaction.user.id !== ADMIN_ID) {
      await interaction.reply({
        content: '⚠️ Chỉ Admin mới có quyền kích hoạt chu kỳ kiểm tra số dư ngay lập tức!',
        ephemeral: true
      });
      return true;
    }

    await interaction.reply({
      content: '🔄 **Đang bắt đầu chu kỳ kiểm tra số dư định kỳ cho các người chơi ngay lập tức...**',
      ephemeral: true
    });

    if (global.trackerSchedulerInstance) {
      global.trackerSchedulerInstance.runCheckCycle(interaction.channel);
    }
    return true;
  }

  return false;
}

/**
 * Tạo Discord Embed & Button ActionRow cho danh sách người chơi theo dõi (có phân trang)
 * @param {object} overview - Dữ liệu từ trackerHelper.getTrackerOverview()
 * @param {number} page - Trang hiện tại (1-indexed)
 * @param {number} pageSize - Số người chơi trên mỗi trang (mặc định 8)
 */
function buildTrackerOverviewMessage(overview, page = 1, pageSize = 8) {
  const total = overview.totalTracked || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, total);
  const currentPlayers = (overview.players || []).slice(startIndex, endIndex);

  const embed = new EmbedBuilder()
    .setTitle(`📊 HỆ THỐNG THEO DÕI SỐ DƯ (BALANCE TRACKER)`)
    .setColor('#10b981')
    .setThumbnail('https://mc-heads.net/head/BinhLH/3d')
    .setTimestamp()
    .setFooter({
      text: `Trang ${currentPage}/${totalPages} • Tổng cộng: ${total} người chơi • KingMC.vn Stats Bot`
    });

  let desc = `• Kết nối CSDL: ${overview.isMongoConnected ? '🟢 **MongoDB Atlas (Đám mây)**' : '🟡 **Dự phòng file JSON**'}\n`;
  desc += `• Tổng số người chơi đang theo dõi: **${total}**\n\n`;

  if (total === 0) {
    desc += `_Hiện chưa có người chơi nào được theo dõi. Dùng \`!tracker add <tên>\` hoặc nút **Theo dõi** sau khi tra cứu \`/bal <tên>\` để thêm!_`;
  } else {
    currentPlayers.forEach((p, idx) => {
      const timeStr = p.lastChecked ? p.lastChecked.toLocaleString('vi-VN') : 'Chưa đo';
      desc += `**${startIndex + idx + 1}. ${p.name}**\n`;
      desc += `   └ Số dư: \`${p.latestBalance}\` • Lần đo: **${p.pointsCount}** • Gần nhất: \`${timeStr}\`\n`;
    });
    desc += `\n_Lệnh Admin: \`!tracker check\` (kiểm tra ngay) • \`!tracker add <tên>\` • \`!tracker untrack <tên>\`_`;
  }

  embed.setDescription(desc);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tracker_page_${currentPage - 1}`)
      .setLabel('◀️ Trước')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId('tracker_page_indicator')
      .setLabel(`${currentPage}/${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`tracker_page_${currentPage + 1}`)
      .setLabel('Sau ▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages),
    new ButtonBuilder()
      .setCustomId('tracker_run_check')
      .setLabel('🔄 Kiểm tra ngay')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

module.exports = {
  handleTrackerButtons,
  buildTrackerOverviewMessage
};
