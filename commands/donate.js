/**
 * commands/donate.js - Slash Command /donate
 * Hiển thị thông tin & mã QR ủng hộ kinh phí duy trì bot KingMC (Lấy dữ liệu ảnh trực tiếp từ MongoDB)
 */

const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { getDonationConfig } = require('../helpers/mongoHelper');
const { getCustomEmoji } = require('../helpers/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('Xem thông tin & mã QR ủng hộ kinh phí duy trì bot KingMC'),

  async execute(interaction) {
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    try {
      // Truy xuất dữ liệu ảnh và thông tin chuyển khoản trực tiếp từ MongoDB Atlas
      const donationData = await getDonationConfig('donate_qr');

      if (!donationData || !donationData.imageBuffer) {
        const barrierEmoji = getCustomEmoji('barrier');
        const errorMsg = `${barrierEmoji} Hiện chưa tìm thấy dữ liệu mã QR quyên góp trên hệ thống MongoDB. Vui lòng liên hệ Admin!`;
        if (interaction.editReply) {
          return await interaction.editReply({ content: errorMsg });
        }
        return await interaction.reply({ content: errorMsg });
      }

      // Chuẩn hóa dữ liệu ảnh sang Buffer chuẩn của Node.js
      let rawBuffer = donationData.imageBuffer;
      if (!Buffer.isBuffer(rawBuffer)) {
        if (rawBuffer && rawBuffer.buffer) {
          rawBuffer = Buffer.from(rawBuffer.buffer);
        } else if (rawBuffer) {
          rawBuffer = Buffer.from(rawBuffer);
        }
      }

      // Tạo tệp đính kèm từ Image Buffer nhị phân lưu trữ trong MongoDB
      const fileName = donationData.fileName || 'donate_qr.jpg';
      const qrAttachment = new AttachmentBuilder(rawBuffer, { name: fileName });

      const netherStarEmoji = getCustomEmoji('nether_star');
      const emeraldEmoji = getCustomEmoji('emerald');
      const sunflowerEmoji = getCustomEmoji('sunflower');

      const embed = new EmbedBuilder()
        .setTitle(`${netherStarEmoji} **${donationData.title || 'Ủng hộ cho tôi:'}**`)
        .setColor('#2b2d31')
        .setDescription(
          `Cảm ơn bạn đã luôn tin tưởng và sử dụng **KingMC Stats Bot**!\n\n` +
          `Mọi đóng góp dù lớn hay nhỏ đều là nguồn hỗ trợ quý báu giúp duy trì chi phí vận hành máy chủ, proxy và các tính năng bot hoạt động mượt mà 24/7.\n\n` +
          `**Thông tin nhận ủng hộ:**\n` +
          `• ${emeraldEmoji} **Chủ tài khoản:** \`${donationData.accountName || 'LUU HUU BINH'}\`\n` +
          `• ${sunflowerEmoji} **Hình thức:** \`${donationData.bankName || 'VietQR (Mọi ứng dụng ngân hàng & ví điện tử)'}\`\n` +
          `• 📲 **Cách thực hiện:** Mở bất kỳ ứng dụng ngân hàng hoặc ví điện tử (ZaloPay, Viettel Money, Momo, VNPay...) và quét mã QR bên dưới.`
        )
        .setImage(`attachment://${fileName}`)
        .setFooter({ text: 'KingMC.vn Stats Bot • Cảm ơn sự đồng hành của bạn! • Thiết kế bởi BinhLH' })
        .setTimestamp();

      const responsePayload = {
        embeds: [embed],
        files: [qrAttachment]
      };

      if (interaction.editReply) {
        await interaction.editReply(responsePayload);
      } else {
        await interaction.reply(responsePayload);
      }
    } catch (err) {
      console.error('[DonateCommand] Lỗi khi xử lý lệnh /donate:', err);
      const barrierEmoji = getCustomEmoji('barrier');
      const errorPayload = {
        content: `${barrierEmoji} Đã xảy ra lỗi khi tải dữ liệu quyên góp từ cơ sở dữ liệu: \`${err.message}\``,
        ephemeral: true
      };

      if (interaction.editReply) {
        await interaction.editReply(errorPayload);
      } else {
        await interaction.reply(errorPayload);
      }
    }
  }
};
