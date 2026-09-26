/**
 * commands/bal.js - Slash Command /bal
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');
const trackerHelper = require('../helpers/trackerHelper');
const skinHelper = require('../helpers/skinHelper');

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
      const result = await queueDispatcher.enqueueTask('bal', targetPlayer, BOT_CHECK_TIMEOUT);
      const emeraldEmoji = getCustomEmoji('emerald');
      const netherStarEmoji = getCustomEmoji('nether_star');
      const bellEmoji = getCustomEmoji('bell');
      const mapEmoji = getCustomEmoji('map');
      const barrierEmoji = getCustomEmoji('barrier');

      // Lưu cache skin vào Master Node nếu kết quả có chứa skin
      if (result && typeof result === 'object' && result.skin) {
        const skinData = result.skin;
        const skinUrlOrId = skinData.skinUrl || skinData.url || skinData.textureId;
        if (skinUrlOrId) {
          await skinHelper.saveSkin(targetPlayer, skinUrlOrId, skinData.model);
        }
      }

      const balanceText = (typeof result === 'object' && result.balance) ? result.balance : String(result || '');
      let cleanVal = balanceText;
      if (cleanVal.includes('$')) {
        const dollarIndex = cleanVal.indexOf('$');
        cleanVal = cleanVal.substring(dollarIndex).replace(/balance/gi, '').trim();
      }

      // Kiểm tra trạng thái theo dõi hiện tại của người chơi
      const isTracking = await trackerHelper.isTracking(targetPlayer);

      // Nếu đang được theo dõi, cập nhật luôn điểm số dư này vào lịch sử
      if (isTracking) {
        await trackerHelper.addBalanceRecord(targetPlayer, cleanVal);
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`${netherStarEmoji} Số dư người chơi: **${targetPlayer}** ${netherStarEmoji}`)
        .setColor('#2b2d31')
        .setThumbnail(skinHelper.getAvatarUrl(targetPlayer, 64, true))
        .setDescription(`${emeraldEmoji} **SỐ DƯ:** \`${cleanVal}\`\n\n\u200B`)
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      // Tạo nút bấm tương tác theo dõi số dư
      const row = new ActionRowBuilder();
      if (!isTracking) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`track_bal_${targetPlayer}`)
            .setLabel('Theo dõi số dư')
            .setEmoji(bellEmoji)
            .setStyle(ButtonStyle.Primary)
        );
      } else {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`track_bal_${targetPlayer}`)
            .setLabel('Xem biến động')
            .setEmoji(mapEmoji)
            .setStyle(ButtonStyle.Success)
        );
      }

      await interaction.editReply({ embeds: [embed], components: [row] });
    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh bal cho ${targetPlayer}:`, error.message);
      recordError('bal', targetPlayer, error);

      const barrierEmoji = getCustomEmoji('barrier');
      const errorEmbed = new EmbedBuilder()
        .setTitle(`${barrierEmoji} Lỗi kiểm tra số dư`)
        .setDescription(`Không thể lấy số dư của người chơi **${targetPlayer}**.\n\n${barrierEmoji} Đã có lỗi xảy ra trong quá trình xử lý yêu cầu. Vui lòng thử lại sau hoặc bấm nút **Báo lỗi** bên dưới để gửi thông báo tới Admin!`)
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
