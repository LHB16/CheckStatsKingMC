/**
 * handlers/trackerButtonHandler.js - Xử lý tương tác Nút Bấm Theo Dõi & Xuất Biểu Đồ Số Dư
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const trackerHelper = require('../helpers/trackerHelper');
const { renderBalanceChart } = require('../helpers/renderHelper');
const { getCustomEmoji } = require('../helpers/utils');
const skinHelper = require('../helpers/skinHelper');

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

    // TRƯỜNG HỢP 1: Chưa theo dõi -> BẬT THEO DÕI
    if (!isTracking) {
      await interaction.deferUpdate();

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

      const successEmbed = new EmbedBuilder()
        .setTitle(`🔔 Đã Bật Theo Dõi: **${playerName}**`)
        .setColor('#10b981')
        .setThumbnail(skinHelper.getAvatarUrl(playerName, 64, true))
        .setDescription(
          `✅ Hệ thống đã bắt đầu theo dõi số dư của người chơi **${playerName}**.\n\n` +
          `⏰ **Chu kỳ:** Tự động kiểm tra định kỳ **1 giờ / lần** khi có Worker rảnh.\n` +
          `☁️ **Lưu trữ:** Dữ liệu biến động được lưu trữ an toàn trong vòng **3 ngày (72h)**.\n\n` +
          `👉 Bạn có thể bấm nút **📈 Xem biểu đồ** bên dưới bất kỳ lúc nào để nhận ảnh biểu đồ biến động!`
        )
        .setTimestamp()
        .setFooter({ text: 'KingMc Stats Bot' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`track_bal_${playerName}`)
          .setLabel('📈 Xem biểu đồ biến động')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.followUp({ embeds: [successEmbed], components: [row] });
      return true;
    }

    // TRƯỜNG HỢP 2: Đã theo dõi -> XUẤT BIỂU ĐỒ BIẾN ĐỘNG 3 NGÀY
    await interaction.deferReply();

    try {
      const historyData = await trackerHelper.getPlayerHistory(playerName);
      if (!historyData) {
        return await interaction.editReply({
          content: `⚠️ Không tìm thấy dữ liệu theo dõi cho người chơi **${playerName}**.`
        });
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
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({ embeds: [chartEmbed], files: [attachment], components: [row] });
      return true;
    } catch (err) {
      console.error(`[TrackerButton] Lỗi vẽ biểu đồ cho ${playerName}:`, err.message);
      await interaction.editReply({
        content: `❌ Không thể tạo biểu đồ biến động lúc này: ${err.message}`
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
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.editReply({ embeds: [chartEmbed], files: [attachment], components: [row] });
      return true;
    } catch (err) {
      console.error(`[TrackerButton] Lỗi làm mới biểu đồ cho ${playerName}:`, err.message);
      return true;
    }
  }

  // 3. Nút Hủy theo dõi (Đã vô hiệu hóa để tránh người dùng tùy tiện hủy)
  if (customId.startsWith('untrack_bal_')) {
    const playerName = customId.replace('untrack_bal_', '').trim();
    await interaction.reply({
      content: `⚠️ Tính năng hủy theo dõi qua nút bấm đã bị vô hiệu hóa để tránh việc bất kỳ ai cũng có thể tự ý hủy theo dõi người chơi **${playerName}**.\nChỉ Admin mới có thể quản lý qua lệnh \`!tracker untrack <player>\`.`,
      ephemeral: true
    });
    return true;
  }

  // 4. Nút Phân trang danh sách Tracker Overview
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

  // 5. Nút Kích hoạt chu kỳ kiểm tra ngay lập tức (Admin)
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
