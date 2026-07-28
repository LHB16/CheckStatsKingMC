/**
 * commands/ah.js - Slash Command /ah <item>
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');
const configHelper = require('../helpers/configHelper');
const { renderTableImage, formatItemDisplayName } = require('../helpers/renderHelper');

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
      const itemDisplayName = formatItemDisplayName(itemQuery);

      // Trường hợp KHÔNG có vật phẩm nào trên AH
      if (items.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setTitle(`📦 Đấu Giá (AH): **${itemDisplayName}**`)
          .setDescription(`⚠️ Không có vật phẩm nào trên AH cho **${itemDisplayName}**.`)
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
              `DANH SÁCH AH: ${itemQuery.toUpperCase()}`,
              itemQuery,
              items,
              'ah'
            );
            if (imageBuffer) break;
          } catch (renderErr) {
            lastError = renderErr;
            console.error(`[Discord-Bot] Lần thử ${attempt} render ảnh AH lỗi:`, renderErr.message);
          }
        }

        if (imageBuffer) {
          const attachment = new AttachmentBuilder(imageBuffer, { name: 'ah_table.png' });

          const embed = new EmbedBuilder()
            .setTitle(`📦 Danh sách AH: **${itemQuery.toUpperCase()}** ${emoji}`)
            .setDescription(`📊 Tổng số vật phẩm trên AH: **${items.length}**`)
            .setImage('attachment://ah_table.png')
            .setColor('#2b2d31')
            .setTimestamp()
            .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

          return await interaction.editReply({ embeds: [embed], files: [attachment] });
        }
        console.error('[Discord-Bot] Render ảnh AH thất bại sau 2 lần thử:', lastError?.message);
      }

      // CHẾ ĐỘ VĂN BẢN (Text Mode)
      const embed = new EmbedBuilder()
        .setTitle(`📦 Danh sách AH: **${itemQuery.toUpperCase()}** ${emoji}`)
        .setColor('#2b2d31')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const formattedLines = items.map((item, index) => {
        const priceText = item.price || 'N/A';
        return `📦 **#${index + 1}** **${itemDisplayName}** | Giá: **${priceText}**`;
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
