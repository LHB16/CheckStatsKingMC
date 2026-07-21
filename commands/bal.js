/**
 * commands/bal.js - Slash Command /bal
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
      
      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(`💰 Số dư của ${targetPlayer}`)
        .setDescription(`>>> ${balanceText}`)
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh bal cho ${targetPlayer}:`, error.message);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra số dư')
        .setDescription(`Không thể lấy số dư của người chơi **${targetPlayer}**.\n\n**Chi tiết lỗi:**\n\`${error.message}\`\n\n⚠️ *Nhắc nhở: Trước khi báo lỗi, hãy chắc chắn rằng bạn đã nhập đúng tên người chơi (player) trên KingMC.*`)
        .setColor('#ef4444')
        .setTimestamp();

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
