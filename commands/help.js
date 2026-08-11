/**
 * commands/help.js - Slash Command /help & Prefix ?help
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem danh sách lệnh hướng dẫn sử dụng bot dành cho người dùng'),

  async execute(interaction) {
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    const embed = new EmbedBuilder()
      .setTitle('📖 **HƯỚNG DẪN SỬ DỤNG BOT KINGMC** 📖')
      .setColor('#2b2d31')
      .setThumbnail('https://mc-heads.net/head/BinhLH/3d')
      .setDescription(
        `Chào mừng bạn đến với **KingMC Stats Bot**!\n` +
        `Bạn có thể sử dụng các lệnh bằng **Slash Command (\`/\`)** hoặc **Tiền tố (\`?\`)** trực tiếp trong kênh chat.`
      )
      .addFields(
        {
          name: '👤 **LỆNH KIỂM TRA NGƯỜI CHƠI**',
          value: 
            `• \`?stats <tên>\` hoặc \`/stats <tên>\`\n` +
            `  └ *Xem thống kê (chỉ số) chi tiết của người chơi.*\n` +
            `• \`?bal <tên>\` hoặc \`/bal <tên>\`\n` +
            `  └ *Xem số dư tài khoản (tiền/xu) của người chơi.*`,
          inline: false
        },
        {
          name: '🛒 **LỆNH THỊ TRƯỜNG & VẬT PHẨM**',
          value: 
            `• \`?ah [tên vật phẩm]\` hoặc \`/ah [tên]\`\n` +
            `  └ *Tra cứu vật phẩm đang rao bán trên Chợ Đen (AH).*\n` +
            `• \`?order [tên vật phẩm]\` hoặc \`/order [tên]\`\n` +
            `  └ *Tra cứu các đơn đặt hàng thị trường.*`,
          inline: false
        },
        {
          name: '🌐 **LỆNH HỆ THỐNG & TRẠNG THÁI**',
          value: 
            `• \`?online [cụm server]\` hoặc \`/online [cụm]\`\n` +
            `  └ *Xem danh sách & số lượng người chơi đang online.*\n` +
            `• \`?ping\` hoặc \`/ping\`\n` +
            `  └ *Kiểm tra độ trễ Discord Bot & trạng thái máy chủ KingMC.*\n` +
            `• \`?help\` hoặc \`/help\`\n` +
            `  └ *Hiển thị bảng trợ giúp này.*`,
          inline: false
        },
        {
          name: '💡 **MẸO SỬ DỤNG**',
          value: 
            `• Bạn có thể bấm trực tiếp nút **Báo lỗi** dưới các kết quả nếu gặp sự cố.\n` +
            `• Sử dụng cú pháp ví dụ: \`?stats BinhLH\` hoặc \`?ah kiem\``,
          inline: false
        }
      )
      .setTimestamp()
      .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

    if (interaction.editReply) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
};
