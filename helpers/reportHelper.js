/**
 * helpers/reportHelper.js - Xử lý thông báo báo lỗi tới Discord Admin
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Bộ nhớ lưu chi tiết lỗi của từng tác vụ gần đây (TTL 15 phút)
const errorStore = new Map();

function recordError(type, targetPlayer, error) {
  const key = `${type}_${targetPlayer.toLowerCase()}`;
  const errorMsg = error instanceof Error ? (error.stack || error.message) : String(error);
  errorStore.set(key, {
    errorMsg: errorMsg.length > 1000 ? errorMsg.substring(0, 995) + '...' : errorMsg,
    timestamp: Date.now()
  });

  // Tự động dọn dẹp các lỗi quá 15 phút
  const now = Date.now();
  for (const [k, v] of errorStore.entries()) {
    if (now - v.timestamp > 15 * 60 * 1000) {
      errorStore.delete(k);
    }
  }
}

async function sendBanAlert(client, username, reason) {
  const ADMIN_ID = process.env.ADMIN_ID;
  if (!ADMIN_ID || !client) return;

  try {
    const admin = await client.users.fetch(ADMIN_ID);
    if (admin) {
      const timeString = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const banEmbed = new EmbedBuilder()
        .setTitle('🚨 CẢNH BÁO KHẨN CẤP: BOT BỊ BAN/CẤM! 🚨')
        .setColor('#dc2626')
        .addFields(
          { name: '⏰ Thời gian phát hiện', value: timeString, inline: true },
          { name: '🤖 Tài khoản Bot', value: `\`${username}\``, inline: true },
          { name: '📝 Lý do / Nội dung từ Server', value: `\`\`\`${reason || 'Không rõ lý do'}\`\`\`` }
        )
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      await admin.send({ embeds: [banEmbed] });
      console.log(`[ReportHelper] Đã gửi thông báo Cảnh báo BAN tới Admin (${ADMIN_ID}).`);
    }
  } catch (err) {
    console.error('[ReportHelper] Lỗi khi gửi thông báo Ban tới Admin:', err);
  }
}

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
        const typeName = type === 'stats' ? 'Lấy Stats (Chỉ số)' : (type === 'bal' ? 'Lấy Balance (Số dư)' : (type === 'order' ? 'Lấy Đơn hàng (Order)' : (type === 'ah' ? 'Lấy Chợ đấu giá (AH)' : 'Không rõ')));
        
        const key = `${type}_${targetPlayer.toLowerCase()}`;
        const errorInfo = errorStore.get(key);
        const errorDetail = errorInfo ? errorInfo.errorMsg : 'Không tìm thấy chi tiết log lỗi trong bộ nhớ đệm.';

        const reportEmbed = new EmbedBuilder()
          .setTitle('⚠️ THÔNG BÁO BÁO LỖI HỆ THỐNG ⚠️')
          .setColor('#ff3333')
          .addFields(
            { name: '⏰ Thời gian báo', value: timeString, inline: true },
            { name: '👤 Người báo', value: `${reporter.tag} (${reporter.toString()})`, inline: true },
            { name: '🎮 Tên Player/Item lỗi', value: `\`${targetPlayer}\``, inline: true },
            { name: '⚙️ Loại lỗi', value: typeName, inline: true },
            { name: '🚨 Full Chi tiết Lỗi (Admin Debug)', value: `\`\`\`${errorDetail}\`\`\`` }
          )
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        await admin.send({ embeds: [reportEmbed] });
        
        await interaction.update({
          content: `✅ Gửi báo lỗi thành công tới Admin về người chơi/vật phẩm **${targetPlayer}**.\nNếu đây thực sự là lỗi hệ thống, Admin sẽ cố gắng khắc phục sớm nhất có thể! Cảm ơn bạn đã phản hồi.`,
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
  handleReportButtons,
  recordError,
  sendBanAlert
};
