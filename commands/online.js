/**
 * commands/online.js - Slash Command /online
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');
const skinHelper = require('../helpers/skinHelper');

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

      // Lưu cache skin vào Master Node nếu kết quả có chứa skin
      if (result && result.skin && result.skin.url) {
        skinHelper.saveSkin(targetPlayer, result.skin.url, result.skin.model);
      }

      const barrierEmoji = getCustomEmoji('barrier');
      const redstoneEmoji = getCustomEmoji('redstone');
      const compassEmoji = getCustomEmoji('compass');

      if (result.online) {
        // Người chơi đang ONLINE (bỏ thanh màu bên trái theo yêu cầu)
        const embed = new EmbedBuilder()
          .setTitle(`🟢 Người chơi **${targetPlayer}** đang Online!`)
          .setThumbnail(skinHelper.getAvatarUrl(targetPlayer, 64, true))
          .addFields(
            { name: `${redstoneEmoji} Ping`, value: `\`${result.ping || 'N/A'}\``, inline: true },
            { name: `${compassEmoji} Thế giới`, value: `\`${result.world || 'N/A'}\``, inline: true }
          )
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Người chơi OFFLINE hoặc nhập sai tên
        const serverMessage = result.message || `${targetPlayer} đã offline hoặc bạn nhập sai tên.`;

        const embed = new EmbedBuilder()
          .setTitle(`🔴 Trạng thái người chơi: **${targetPlayer}**`)
          .setThumbnail(skinHelper.getAvatarUrl(targetPlayer, 64, true))
          .setDescription(`${barrierEmoji} **${serverMessage}**`)
          .setTimestamp()
          .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

        await interaction.editReply({ embeds: [embed] });
      }

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh online cho ${targetPlayer}:`, error.message);
      recordError('online', targetPlayer, error);

      const barrierEmoji = getCustomEmoji('barrier');
      const errorEmbed = new EmbedBuilder()
        .setTitle(`${barrierEmoji} Lỗi kiểm tra Online`)
        .setDescription(`Không thể kiểm tra trạng thái của người chơi **${targetPlayer}**.\n\n${barrierEmoji} Đã có lỗi xảy ra trong quá trình xử lý yêu cầu. Vui lòng thử lại sau hoặc bấm nút **Báo lỗi** bên dưới để gửi thông báo tới Admin!`)
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
