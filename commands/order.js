/**
 * commands/order.js - Slash Command /order <item>
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');

function cleanBuyerName(str) {
  if (!str) return 'Ẩn danh';
  let clean = String(str)
    .replace(/§./g, '')
    .replace(/[\u00A0\u200B\uFEFF]/g, ' ')
    .normalize('NFC')
    .trim();

  const lower = clean.toLowerCase();
  const prefixes = [
    'đơn hàng của',
    'don hang cua',
    'đơn hàng:',
    'don hang:',
    'đơn hàng',
    'don hang',
    'order của',
    'order cua',
    'order:',
    'của ',
    'cua '
  ];

  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      clean = clean.substring(prefix.length).trim();
      break;
    }
  }

  clean = clean.replace(/^[:\-\s#]+/, '').trim();
  return clean || 'Ẩn danh';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('order')
    .setDescription('Kiểm tra danh sách đơn hàng (order) của một item trên KingMC')
    .addStringOption(option => 
      option.setName('item')
        .setDescription('Tên item cần kiểm tra (ví dụ: elytra)')
        .setRequired(true)
    ),

  async execute(interaction, queueDispatcher) {
    const itemQuery = interaction.options.getString('item').trim();
    const BOT_CHECK_TIMEOUT = parseInt(process.env.BOT_CHECK_TIMEOUT) || 15000;

    await interaction.deferReply();

    try {
      // Gửi tác vụ vào Queue Dispatcher
      const result = await queueDispatcher.enqueueTask('order', itemQuery, BOT_CHECK_TIMEOUT);

      const orders = result.orders || [];

      // Trường hợp KHÔNG có đơn hàng nào
      if (orders.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle(`📦 Đơn hàng: **${itemQuery}**`)
          .setDescription(`>>> ⚠️ Không có order (đơn hàng) nào cho **${itemQuery}**.`)
          .setColor('#ef4444')
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Order Bot • Thiết kế bởi BinhLH' });

        return await interaction.editReply({ embeds: [emptyEmbed] });
      }

      // Trường hợp CÓ đơn hàng
      const emoji = getCustomEmoji(itemQuery);
      const embed = new EmbedBuilder()
        .setTitle(`📦 Danh sách đơn hàng: **${itemQuery.toUpperCase()}** ${emoji}`)
        .setColor('#10b981')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Order Bot • Thiết kế bởi BinhLH' });

      // Nổi bật dữ liệu trong khung bao blockquote (>>>)
      let descriptionText = `📡 *Dữ liệu đơn hàng trích xuất từ server \`${result.serverUsed}\`*\n\n>>> `;

      const formattedLines = orders.map((order, index) => {
        const priceText = order.price || 'N/A';
        return `📦 Giá: **${priceText}**`;
      });

      descriptionText += formattedLines.join('\n');

      if (descriptionText.length > 4096) {
        descriptionText = descriptionText.substring(0, 4080) + '...';
      }

      embed.setDescription(descriptionText);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh order cho ${itemQuery}:`, error.message);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra đơn hàng')
        .setDescription(`Không thể lấy danh sách đơn hàng cho **${itemQuery}**.\n\n**Chi tiết lỗi:**\n\`${error.message}\``)
        .setColor('#ef4444')
        .setTimestamp();
        
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`report_error_order_${itemQuery}`)
            .setLabel('Báo lỗi')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ embeds: [errorEmbed], components: [row] });
    }
  }
};
