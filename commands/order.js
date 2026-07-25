/**
 * commands/order.js - Slash Command /order <item>
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');

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
          .setDescription(`⚠️ Không có order (đơn hàng) nào cho **${itemQuery}**.`)
          .setColor('#ef4444')
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        return await interaction.editReply({ embeds: [emptyEmbed] });
      }

      // Trường hợp CÓ đơn hàng
      const emoji = getCustomEmoji(itemQuery);
      const embed = new EmbedBuilder()
        .setTitle(`📦 Danh sách đơn hàng: **${itemQuery.toUpperCase()}** ${emoji}`)
        .setColor('#2b2d31')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const formattedLines = orders.map((order, index) => {
        const priceText = order.price || 'N/A';
        const buyerText = order.buyer ? ` | **${order.buyer}**` : '';
        return `📦 **#${index + 1}** | Giá: **${priceText}**${buyerText}`;
      });

      let descriptionText = formattedLines.join('\n');

      if (descriptionText.length > 4096) {
        descriptionText = descriptionText.substring(0, 4080) + '...';
      }

      embed.setDescription(descriptionText);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh order cho ${itemQuery}:`, error.message);
      recordError('order', itemQuery, error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra đơn hàng')
        .setDescription(`Không thể lấy danh sách đơn hàng cho **${itemQuery}**.\n\n⚠️ Đã có lỗi xảy ra trong quá trình xử lý yêu cầu. Vui lòng thử lại sau hoặc bấm nút **Báo lỗi** bên dưới để gửi thông báo tới Admin!`)
        .setColor('#ef4444')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });
        
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
