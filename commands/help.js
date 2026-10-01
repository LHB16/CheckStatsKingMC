/**
 * commands/help.js - Slash Command /help & Prefix ?help
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem danh sách lệnh hướng dẫn sử dụng bot dành cho người dùng'),

  async execute(interaction) {
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    const enchantedBookEmoji = getCustomEmoji('enchanted_book');
    const nameTagEmoji = getCustomEmoji('name_tag');
    const enderChestEmoji = getCustomEmoji('ender_chest');
    const compassEmoji = getCustomEmoji('compass');
    const redstoneTorchEmoji = getCustomEmoji('redstone_torch');

    const embed = new EmbedBuilder()
      .setTitle(`${enchantedBookEmoji} **HƯỚNG DẪN SỬ DỤNG BOT KINGMC** ${enchantedBookEmoji}`)
      .setColor('#2b2d31')
      .setThumbnail('https://mc-heads.net/head/BinhLH/3d')
      .setDescription(
        `Chào mừng bạn đến với **KingMC Stats Bot**!\n` +
        `Bạn có thể sử dụng các lệnh bằng **Slash Command (\`/\`)** hoặc **Tiền tố (\`?\`)** trực tiếp trong kênh chat.`
      )
      .addFields(
        {
          name: `${nameTagEmoji} **LỆNH KIỂM TRA NGƯỜI CHƠI**`,
          value: 
            `• \`/stats <tên>\` (hoặc \`?stats <tên>\`)\n` +
            `  └ *Xem thống kê (chỉ số) chi tiết của người chơi.*\n` +
            `• \`/bal <tên>\` (hoặc \`?bal <tên>\`)\n` +
            `  └ *Xem số dư tài khoản (tiền/xu) của người chơi.*\n` +
            `• \`/bounty [tên]\` (hoặc \`?bounty [tên]\`)\n` +
            `  └ *Xem Top 5 tiền thưởng hoặc kiểm tra tiền thưởng của người chơi.*`,
          inline: false
        },
        {
          name: `${enderChestEmoji} **LỆNH THỊ TRƯỜNG & VẬT PHẨM**`,
          value: 
            `• \`/item <tên>\` (hoặc \`?item <tên>\`)\n` +
            `  └ *Tra cứu thông tin vật phẩm Minecraft (Anh - Việt, ID, Emoji Discord).*\n` +
            `• \`/ah [tên]\` (hoặc \`?ah [tên]\`)\n` +
            `  └ *Tra cứu vật phẩm đang rao bán trên Chợ Đen (AH).*\n` +
            `• \`/order [tên]\` (hoặc \`?order [tên]\`)\n` +
            `  └ *Tra cứu các đơn đặt hàng thị trường.*`,
          inline: false
        },
        {
          name: `${compassEmoji} **LỆNH HỆ THỐNG & TRẠNG THÁI**`,
          value: 
            `• \`/online [cụm]\` (hoặc \`?online [cụm]\`)\n` +
            `  └ *Xem danh sách & số lượng người chơi đang online.*\n` +
            `• \`/ping\` (hoặc \`?ping\`)\n` +
            `  └ *Kiểm tra độ trễ Discord Bot & trạng thái máy chủ KingMC.*\n` +
            `• \`/lb\` (hoặc \`?lb\`)\n` +
            `  └ *Xem Top 9 Bảng Xếp Hạng in-game (tiền, kills, giờ chơi, đào khoáng...)*\n` +
            `• \`/donate\` (hoặc \`?donate\`)\n` +
            `  └ *Xem thông tin & mã QR ủng hộ kinh phí duy trì bot.*\n` +
            `• \`/help\` (hoặc \`?help\`)\n` +
            `  └ *Hiển thị bảng trợ giúp này.*`,
          inline: false
        },
        {
          name: `🧮 **TIỆN ÍCH TÍNH TOÁN & TRỢ LÝ**`,
          value: 
            `• \`/math <biểu thức>\` (hoặc \`?math <biểu thức>\` / \`?<biểu thức>\`)\n` +
            `  └ *Tính toán toán học thuần túy: \`+\`, \`-\`, \`*\`, \`/\`, \`%\`, \`^\`, dấu ngoặc... VD: \`/math expression: 12*2\` hoặc \`?12*2\`*\n` +
            `• \`/ai <câu hỏi>\` (hoặc \`?ai <câu hỏi>\`)\n` +
            `  └ *Trò chuyện hỏi đáp cùng trợ lý AI KingMC (có hỗ trợ tra cứu Web thời gian thực).*`,
          inline: false
        },
        {
          name: `${redstoneTorchEmoji} **MẸO SỬ DỤNG & LƯU Ý**`,
          value: 
            `• Bạn có thể dùng **Slash Command** (\`/stats <tên>\`) hoặc **Tiền tố** (\`?stats <tên>\`).\n` +
            `• 💡 **Lưu ý:** Khuyến khích sử dụng Slash Command (\`/\`) để có trải nghiệm nhanh, mượt và gợi ý tham số chính xác nhất!\n` +
            `• Bạn có thể bấm trực tiếp nút **Báo lỗi** dưới các kết quả nếu gặp sự cố.`,
          inline: false
        }
      )
      .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
      .setTimestamp();

    if (interaction.editReply) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
};
