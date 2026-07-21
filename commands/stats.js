/**
 * commands/stats.js - Slash Command /stats
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji, getStatsLabel, isDecorationItem } = require('../helpers/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Kiểm tra stats (chỉ số) của một người chơi trên KingMC')
    .addStringOption(option => 
      option.setName('player')
        .setDescription('Tên người chơi Minecraft cần kiểm tra')
        .setRequired(true)
    ),

  async execute(interaction, queueDispatcher) {
    const targetPlayer = interaction.options.getString('player').trim();
    const BOT_CHECK_TIMEOUT = parseInt(process.env.BOT_CHECK_TIMEOUT) || 15000;

    await interaction.deferReply();

    try {
      // Gửi tác vụ vào Queue Dispatcher
      const result = await queueDispatcher.enqueueTask('stats', targetPlayer, BOT_CHECK_TIMEOUT);

      // Trang trí giao diện hiển thị Embed
      const embed = new EmbedBuilder()
        .setTitle(`✨ Thống kê người chơi: **${targetPlayer}** ✨`)
        .setColor('#2b2d31')
        .setThumbnail(`https://minotar.net/helm/${targetPlayer}/128.png`)
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const validItems = (result.items || []).filter(item => !isDecorationItem(item));

      if (validItems.length === 0) {
        embed.setDescription(`>>> 📡 *Dữ liệu được trích xuất từ server \`${result.serverUsed}\`*\n\n⚠️ **Lưu ý:** Không tìm thấy stats nào hữu ích hoặc người chơi này chưa từng đăng nhập.`);
        embed.setColor('#ef4444');
      } else {
        let descriptionText = `📡 *Dữ liệu được trích xuất từ server \`${result.serverUsed}\`*\n\n`;
        const formattedItems = [];
        
        validItems.forEach(item => {
          const label = getStatsLabel(item);
          const emoji = getCustomEmoji(item.name);
          
          const cleanLoreLines = (item.lore || [])
            .map(line => line.trim())
            .filter(line => {
              if (!line) return false;
              if (/^[_\-+=*~]*$/.test(line)) return false;
              if (line.includes('------') || line.includes('======') || line.includes('______')) return false;
              const lower = line.toLowerCase();
              if (lower.includes('nhấp') || lower.includes('click') || lower.includes('click chuột')) return false;
              return true;
            });

          const valueText = cleanLoreLines.join(', ');
          if (valueText) {
            formattedItems.push(`${emoji} **${(item.displayName || label).toUpperCase()}** | ${valueText}`);
          }
        });

        descriptionText += formattedItems.join('\n');

        if (descriptionText.length > 4096) {
          descriptionText = descriptionText.substring(0, 4080) + '...';
        }
        
        embed.setDescription(descriptionText);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh stats cho ${targetPlayer}:`, error.message);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra stats')
        .setDescription(`Không thể lấy stats của người chơi **${targetPlayer}**.\n\n**Chi tiết lỗi:**\n\`${error.message}\`\n\n⚠️ *Nhắc nhở: Trước khi báo lỗi, hãy chắc chắn rằng bạn đã nhập đúng tên người chơi (player) trên KingMC.*`)
        .setColor('#ef4444')
        .setTimestamp();
        
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`report_error_stats_${targetPlayer}`)
            .setLabel('Báo lỗi')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ embeds: [errorEmbed], components: [row] });
    }
  }
};
