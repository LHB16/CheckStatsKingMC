/**
 * handlers/trackerButtonHandler.js - Xử lý tương tác Nút Bấm Theo Dõi & Xuất Biểu Đồ Số Dư
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const trackerHelper = require('../helpers/trackerHelper');
const { renderBalanceChart } = require('../helpers/renderHelper');
const { getCustomEmoji } = require('../helpers/utils');

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
        .setThumbnail(`https://mc-heads.net/head/${playerName}/3d`)
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

  return false;
}

module.exports = {
  handleTrackerButtons
};
