/**
 * commands/ah.js - Slash Command /ah <item>
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ah')
    .setDescription('Kiểm tra giá vật phẩm trên Chợ Đấu Giá (AH) KingMC')
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
      const result = await queueDispatcher.enqueueTask('ah', itemQuery, BOT_CHECK_TIMEOUT);

      const items = result.items || [];

      // Trường hợp KHÔNG có vật phẩm nào trên AH
      if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle(`📦 Đấu Giá (AH): **${itemQuery}**`)
          .setDescription(`⚠️ Không có vật phẩm nào trên AH cho **${itemQuery}**.`)
          .setColor('#ef4444')
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        return await interaction.editReply({ embeds: [emptyEmbed] });
      }

      // Trường hợp CÓ vật phẩm
      const emoji = getCustomEmoji(itemQuery);
      const embed = new EmbedBuilder()
        .setTitle(`📦 Danh sách AH: **${itemQuery.toUpperCase()}** ${emoji}`)
        .setColor('#2b2d31')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const formattedLines = items.map((item, index) => {
        const priceText = item.price || 'N/A';
        const sellerText = item.seller ? ` | Người bán: **${item.seller}**` : '';
        return `📦 **#${index + 1}** | Giá: **${priceText}**${sellerText}`;
      });

      let descriptionText = formattedLines.join('\n');

      if (descriptionText.length > 4096) {
        descriptionText = descriptionText.substring(0, 4080) + '...';
      }

      embed.setDescription(descriptionText);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh ah cho ${itemQuery}:`, error.message);
      recordError('ah', itemQuery, error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra AH')
        .setDescription(`Không thể lấy danh sách AH cho **${itemQuery}**.\n\n⚠️ Đã có lỗi xảy ra trong quá trình xử lý yêu cầu. Vui lòng thử lại sau hoặc bấm nút **Báo lỗi** bên dưới để gửi thông báo tới Admin!`)
        .setColor('#ef4444')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });
        
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`report_error_ah_${itemQuery}`)
            .setLabel('Báo lỗi')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ embeds: [errorEmbed], components: [row] });
    }
  }
};
