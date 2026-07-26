/**
 * commands/bal.js - Slash Command /bal
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bal')
    .setDescription('Kiểm tra số dư (balance) của một người chơi trên KingMC')
    .addStringOption(option => 
      option.setName('player')
        .setDescription('Tên người chơi cần kiểm tra')
        .setRequired(true)
    ),

  async execute(interaction, queueDispatcher) {
    const targetPlayer = interaction.options.getString('player').trim();
    const BOT_CHECK_TIMEOUT = parseInt(process.env.BOT_CHECK_TIMEOUT) || 15000;

    await interaction.deferReply();

    try {
      // Gửi tác vụ vào Queue Dispatcher
      const balanceText = await queueDispatcher.enqueueTask('bal', targetPlayer, BOT_CHECK_TIMEOUT);
      const emeraldEmoji = getCustomEmoji('emerald');

      let cleanVal = balanceText;
      if (cleanVal.includes('$')) {
        const dollarIndex = cleanVal.indexOf('$');
        cleanVal = cleanVal.substring(dollarIndex).replace(/balance/gi, '').trim();
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`${emeraldEmoji} Số dư người chơi: **${targetPlayer}**`)
        .setColor('#2b2d31')
        .setThumbnail(`https://minotar.net/helm/${targetPlayer}/128.png`)
        .setDescription(`${emeraldEmoji} **SỐ DƯ:** \`${cleanVal}\`\n\n\u200B`)
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh bal cho ${targetPlayer}:`, error.message);
      recordError('bal', targetPlayer, error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra số dư')
        .setDescription(`Không thể lấy số dư của người chơi **${targetPlayer}**.\n\n⚠️ Đã có lỗi xảy ra trong quá trình xử lý yêu cầu. Vui lòng thử lại sau hoặc bấm nút **Báo lỗi** bên dưới để gửi thông báo tới Admin!`)
        .setColor('#ef4444')
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`report_error_bal_${targetPlayer}`)
            .setLabel('Báo lỗi')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ embeds: [errorEmbed], components: [row] });
    }
  }
};
