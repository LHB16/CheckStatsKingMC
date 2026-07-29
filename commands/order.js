/**
 * commands/order.js - Slash Command /order <item>
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');
const configHelper = require('../helpers/configHelper');
const { renderTableImage, formatItemDisplayName } = require('../helpers/renderHelper');

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
      const itemDisplayName = formatItemDisplayName(itemQuery);

      // Trường hợp KHÔNG có đơn hàng nào
      if (orders.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle(`📦 Đơn hàng: **${itemDisplayName}**`)
          .setDescription(`⚠️ Không có order (đơn hàng) nào cho **${itemDisplayName}**.`)
          .setColor('#ef4444')
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        return await interaction.editReply({ embeds: [emptyEmbed] });
      }

      // Lấy chế độ hiển thị từ configHelper ('text' hoặc 'image')
      const displayMode = configHelper.getDisplayMode();
      const emoji = getCustomEmoji(itemQuery);

      // CHẾ ĐỘ RENDER ẢNH (Image Mode)
      if (displayMode === 'image') {
        let imageBuffer = null;
        let lastError = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            imageBuffer = await renderTableImage(
              `DANH SÁCH ORDER: ${itemQuery.toUpperCase()}`,
              itemQuery,
              orders,
              'order'
            );
            if (imageBuffer) break;
          } catch (renderErr) {
            lastError = renderErr;
            console.error(`[Discord-Bot] Lần thử ${attempt} render ảnh Order lỗi:`, renderErr.message);
          }
        }

        if (imageBuffer) {
          const attachment = new AttachmentBuilder(imageBuffer, { name: 'order_table.png' });

          const embed = new EmbedBuilder()
            .setImage('attachment://order_table.png')
            .setColor('#2b2d31')
            .setTimestamp()
            .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

          return await interaction.editReply({ embeds: [embed], files: [attachment] });
        }
        console.error('[Discord-Bot] Render ảnh Order thất bại sau 2 lần thử:', lastError?.message);
      }

      // CHẾ ĐỘ VĂN BẢN (Text Mode)
      const embed = new EmbedBuilder()
        .setTitle(`📦 Danh sách đơn hàng: **${itemQuery.toUpperCase()}** ${emoji}`)
        .setColor('#2b2d31')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const formattedLines = orders.map((order, index) => {
        const priceText = order.price || 'N/A';
        const cleanDisplay = (order.displayName || '').replace(/§[0-9a-fk-or]/gi, '').trim();
        const rawName = order.itemName || order.name;
        const nameToShow = (cleanDisplay && cleanDisplay !== 'Item' && !cleanDisplay.toLowerCase().includes('đơn hàng'))
          ? cleanDisplay
          : formatItemDisplayName(rawName || itemQuery);
        return `📦 **#${index + 1}** **${nameToShow}** | Giá: **${priceText}**`;
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
