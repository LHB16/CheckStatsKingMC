/**
 * commands/online.js - Slash Command /online
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { recordError } = require('../helpers/reportHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('online')
    .setDescription('Kiểm tra trạng thái trực tuyến, ping và thế giới của một người chơi trên KingMC')
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
      const result = await queueDispatcher.enqueueTask('online', targetPlayer, BOT_CHECK_TIMEOUT);

      if (result.online) {
        // Người chơi đang ONLINE (bỏ thanh màu bên trái theo yêu cầu)
        const embed = new EmbedBuilder()
          .setTitle(`🟢 Người chơi **${targetPlayer}** đang Online!`)
          .setThumbnail(`https://minotar.net/helm/${targetPlayer}/128.png`)
          .addFields(
            { name: '📶 Ping', value: `\`${result.ping || 'N/A'}\``, inline: true },
            { name: '🌐 Thế giới', value: `\`${result.world || 'N/A'}\``, inline: true }
          )
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Người chơi OFFLINE hoặc nhập sai tên
        const serverMessage = result.message || `${targetPlayer} đã offline hoặc bạn nhập sai tên.`;

        const embed = new EmbedBuilder()
          .setTitle(`🔴 Trạng thái người chơi: **${targetPlayer}**`)
          .setThumbnail(`https://minotar.net/helm/${targetPlayer}/128.png`)
          .setDescription(`⚠️ **${serverMessage}**`)
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh online cho ${targetPlayer}:`, error.message);
      recordError('online', targetPlayer, error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra Online')
        .setDescription(`Không thể kiểm tra trạng thái của người chơi **${targetPlayer}**.\n\n⚠️ Đã có lỗi xảy ra trong quá trình xử lý yêu cầu. Vui lòng thử lại sau hoặc bấm nút **Báo lỗi** bên dưới để gửi thông báo tới Admin!`)
        .setColor('#ef4444')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`report_error_online_${targetPlayer}`)
            .setLabel('Báo lỗi')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ embeds: [errorEmbed], components: [row] });
    }
  }
};
