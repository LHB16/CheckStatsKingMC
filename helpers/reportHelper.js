/**
 * helpers/reportHelper.js - Xử lý thông báo báo lỗi tới Discord Admin
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

async function handleReportButtons(interaction, client) {
  if (!interaction.isButton()) return false;
  
  const customId = interaction.customId;
  
  if (customId.startsWith('report_error_')) {
    const parts = customId.split('_');
    const type = parts[2] || 'unknown';
    const targetPlayer = parts.slice(3).join('_');

    const confirmRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_report_${type}_${targetPlayer}`)
          .setLabel('Xác nhận báo lỗi')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel_report')
          .setLabel('Hủy')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({
      content: `⚠️ **Nhắc nhở quan trọng:** Trước khi bấm xác nhận báo lỗi, hãy chắc chắn rằng tên người chơi **${targetPlayer}** in-game là chính xác.\n\nBạn có muốn tiếp tục báo lỗi này tới Admin không?`,
      components: [confirmRow],
      ephemeral: true
    });
    return true;
  } 
  
  if (customId.startsWith('confirm_report_')) {
    const parts = customId.split('_');
    const type = parts[2] || 'unknown';
    const targetPlayer = parts.slice(3).join('_');
    const reporter = interaction.user;
    
    const ADMIN_ID = process.env.ADMIN_ID;
    if (!ADMIN_ID) {
      await interaction.reply({
        content: '❌ Lỗi: Chưa cấu hình ID Admin (`ADMIN_ID`) trong file cấu hình `.env` của bot.',
        ephemeral: true
      });
      return true;
    }

    try {
      const admin = await client.users.fetch(ADMIN_ID);
      if (admin) {
        const timeString = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const typeName = type === 'stats' ? 'Lấy Stats (Chỉ số)' : (type === 'bal' ? 'Lấy Balance (Số dư)' : 'Không rõ');
        
        const reportEmbed = new EmbedBuilder()
          .setTitle('⚠️ THÔNG BÁO BÁO LỖI HỆ THỐNG ⚠️')
          .setColor('#ff3333')
          .addFields(
            { name: '⏰ Thời gian báo', value: timeString, inline: true },
            { name: '👤 Người báo', value: `${reporter.tag} (${reporter.toString()})`, inline: true },
            { name: '🎮 Tên Player lỗi', value: `\`${targetPlayer}\``, inline: true },
            { name: '⚙️ Loại lỗi', value: typeName, inline: true }
          )
          .setTimestamp();

        await admin.send({ embeds: [reportEmbed] });
        
        await interaction.update({
          content: `✅ Gửi báo lỗi thành công tới Admin về người chơi **${targetPlayer}**.\nNếu đây thực sự là lỗi hệ thống, Admin sẽ cố gắng khắc phục sớm nhất có thể! Cảm ơn bạn đã phản hồi.`,
          components: []
        });
      } else {
        throw new Error('Không tìm thấy Admin Discord với ID đã cấu hình.');
      }
    } catch (err) {
      console.error('[Discord-Bot] Lỗi gửi báo lỗi cho Admin:', err);
      await interaction.update({
        content: `❌ Gửi báo lỗi thất bại. Chi tiết: \`${err.message}\``,
        components: []
      });
    }
    return true;
  } 
  
  if (customId === 'cancel_report') {
    await interaction.update({
      content: '❌ Đã hủy yêu cầu báo lỗi.',
      components: []
    });
    return true;
  }

  return false;
}

module.exports = {
  handleReportButtons
};
