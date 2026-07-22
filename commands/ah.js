/**
 * commands/ah.js - Slash Command /ah <item>
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');

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
          .setDescription(`>>> ⚠️ Không có vật phẩm nào trên AH cho **${itemQuery}**.`)
          .setColor('#ef4444')
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn AH Bot • Thiết kế bởi BinhLH' });

        return await interaction.editReply({ embeds: [emptyEmbed] });
      }

      // Trường hợp CÓ vật phẩm
      const emoji = getCustomEmoji(itemQuery);
      const embed = new EmbedBuilder()
        .setTitle(`📦 Danh sách AH: **${itemQuery.toUpperCase()}** ${emoji}`)
        .setColor('#10b981')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn AH Bot • Thiết kế bởi BinhLH' });

      // Nổi bật dữ liệu trong khung bao blockquote (>>>)
      let descriptionText = `📡 *Dữ liệu AH trích xuất từ server \`${result.serverUsed}\`*\n\n>>> `;

      const formattedLines = items.map((item) => {
        const priceText = item.price || 'N/A';
        return `📦 Giá: **${priceText}**`;
      });

      descriptionText += formattedLines.join('\n');

      if (descriptionText.length > 4096) {
        descriptionText = descriptionText.substring(0, 4080) + '...';
      }

      embed.setDescription(descriptionText);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh ah cho ${itemQuery}:`, error.message);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra AH')
        .setDescription(`Không thể lấy danh sách AH cho **${itemQuery}**.\n\n**Chi tiết lỗi:**\n\`${error.message}\``)
        .setColor('#ef4444')
        .setTimestamp();
        
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
