/**
 * commands/ah.js - Slash Command /ah <item>
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');
const configHelper = require('../helpers/configHelper');
const { renderBatchTablePages } = require('../helpers/renderHelper');
const { chunkArray, buildPaginationRow, createPaginationSession, formatAhTextPage } = require('../helpers/paginationHelper');

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
          .setDescription(`⚠️ Không tìm thấy AH cho món đồ **${itemQuery}**.`)
          .setColor('#ef4444')
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        return await interaction.editReply({ embeds: [emptyEmbed] });
      }

      // Chia nhỏ danh sách vật phẩm thành các trang 9 món (tối đa 5 trang)
      const pages = chunkArray(items, 9);
      const totalPages = pages.length;
      const page1Items = pages[0];

      // Lấy chế độ hiển thị từ configHelper ('text' hoặc 'image')
      const displayMode = configHelper.getDisplayMode();
      const emoji = getCustomEmoji(itemQuery);

      // CHẾ ĐỘ RENDER ẢNH (Image Mode) - Chụp đồng thời 1 lần tất cả các trang
      if (displayMode === 'image') {
        let imageBuffers = null;
        let lastError = null;

        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            imageBuffers = await renderBatchTablePages(
              'DANH SÁCH AH',
              itemQuery,
              pages,
              'ah'
            );
            if (imageBuffers && imageBuffers.length > 0) break;
          } catch (renderErr) {
            lastError = renderErr;
            console.error(`[Discord-Bot] Lần thử ${attempt} batch render ảnh AH lỗi:`, renderErr.message);
          }
        }

        if (imageBuffers && imageBuffers.length > 0) {
          const page1Buffer = imageBuffers[0];
          const attachment = new AttachmentBuilder(page1Buffer, { name: 'ah_table_p1.png' });

          const embed = new EmbedBuilder()
            .setImage('attachment://ah_table_p1.png')
            .setColor('#2b2d31')
            .setTimestamp()
            .setFooter({
              text: totalPages > 1
                ? `KingMC.vn Stats Bot • Trang 1/${totalPages} • Thiết kế bởi BinhLH`
                : 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH'
            });

          // Nếu có từ 2 trang trở lên, tạo session phân trang (5 phút TTL) và gắn nút
          if (totalPages > 1) {
            const sessionId = createPaginationSession({
              interaction,
              type: 'ah',
              itemQuery,
              pages,
              displayMode: 'image',
              initialImageBuffers: imageBuffers
            });

            const row = buildPaginationRow(sessionId, 1, totalPages);
            return await interaction.editReply({ embeds: [embed], files: [attachment], components: [row] });
          }

          return await interaction.editReply({ embeds: [embed], files: [attachment] });
        }
        console.error('[Discord-Bot] Render ảnh AH thất bại sau 2 lần thử:', lastError?.message);
      }

      // CHẾ ĐỘ VĂN BẢN (Text Mode)
      const textTitle = totalPages > 1
        ? `${emoji} Danh sách AH: **${itemQuery}** (Trang 1/${totalPages})`
        : `${emoji} Danh sách AH: **${itemQuery}**`;

      const embed = new EmbedBuilder()
        .setTitle(textTitle)
        .setColor('#2b2d31')
        .setTimestamp()
        .setFooter({
          text: totalPages > 1
            ? `KingMC.vn Stats Bot • Trang 1/${totalPages} • Thiết kế bởi BinhLH`
            : 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH'
        });

      const descriptionText = formatAhTextPage(page1Items, itemQuery, 1, 9);
      embed.setDescription(descriptionText);

      // Nếu có từ 2 trang trở lên, tạo session phân trang (20s TTL) và gắn nút
      if (totalPages > 1) {
        const sessionId = createPaginationSession({
          interaction,
          type: 'ah',
          itemQuery,
          pages,
          displayMode: 'text'
        });

        const row = buildPaginationRow(sessionId, 1, totalPages);
        return await interaction.editReply({ embeds: [embed], components: [row] });
      }

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
