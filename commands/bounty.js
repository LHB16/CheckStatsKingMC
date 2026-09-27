/**
 * commands/bounty.js - Slash Command /bounty & Prefix ?bounty
 * @description Kiểm tra Top 5 Tiền Thưởng (Bounty) hoặc xem tiền thưởng của người chơi cụ thể trên cụm KingSMP
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCustomEmoji } = require('../helpers/utils');
const { recordError } = require('../helpers/reportHelper');
const { getRankOreEmoji } = require('../helpers/leaderboardHelper');
const skinHelper = require('../helpers/skinHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bounty')
    .setDescription('Xem bảng xếp hạng tiền thưởng (Bounty) hoặc kiểm tra tiền thưởng của người chơi trên KingSMP')
    .addStringOption(option =>
      option.setName('player')
        .setDescription('Tên người chơi cần kiểm tra tiền thưởng (để trống nếu muốn xem Top 5)')
        .setRequired(false)
    ),

  async execute(interaction, queueDispatcher) {
    const rawPlayer = interaction.options ? interaction.options.getString('player') : null;
    const targetPlayer = rawPlayer ? rawPlayer.trim() : null;
    const BOT_CHECK_TIMEOUT = parseInt(process.env.BOT_CHECK_TIMEOUT) || 15000;

    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    try {
      // Gửi tác vụ vào hàng đợi Queue Dispatcher
      const result = await queueDispatcher.enqueueTask('bounty', targetPlayer || '', BOT_CHECK_TIMEOUT);

      const netherStarEmoji = getCustomEmoji('nether_star');
      const emeraldEmoji = getCustomEmoji('emerald');
      const barrierEmoji = getCustomEmoji('barrier');
      const swordEmoji = getCustomEmoji('diamond_sword');
      const writableBookEmoji = getCustomEmoji('writable_book');

      // -----------------------------------------------------------------
      // CHẾ ĐỘ 1: KIỂM TRA TIỀN THƯỞNG 1 NGƯỜI CHƠI (/bounty check <player>)
      // -----------------------------------------------------------------
      if (result && result.mode === 'check') {
        if (!result.success) {
          // Thất bại: Người chơi không hợp lệ
          const errorEmbed = new EmbedBuilder()
            .setTitle(`${barrierEmoji} Không Hợp Lệ`)
            .setColor('#ef4444')
            .setDescription(`${barrierEmoji} **${result.error || `Người chơi không hợp lệ: ${targetPlayer}`}**`)
            .setThumbnail(skinHelper.getAvatarUrl(targetPlayer, 64, true))
            .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
            .setTimestamp();

          return await interaction.editReply({ embeds: [errorEmbed] });
        }

        // Thành công:
        const cleanPlayer = result.player || targetPlayer;
        const amount = result.amount || '$0';

        const embed = new EmbedBuilder()
          .setTitle(`${swordEmoji} Tiền Thưởng: **${cleanPlayer}** ${swordEmoji}`)
          .setColor('#2b2d31')
          .setThumbnail(skinHelper.getAvatarUrl(cleanPlayer, 64, true))
          .setDescription(
            `👤 **Người chơi:** \`${cleanPlayer}\`\n` +
            `${emeraldEmoji} **Tiền thưởng hiện tại:** \`${amount}\`\n\n\u200B`
          )
          .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
          .setTimestamp();

        return await interaction.editReply({ embeds: [embed] });
      }

      // -----------------------------------------------------------------
      // CHẾ ĐỘ 2: TOP 5 TIỀN THƯỞNG (GUI /bounty)
      // -----------------------------------------------------------------
      const bounties = (result && result.bounties) ? result.bounties : [];

      const embed = new EmbedBuilder()
        .setTitle(`${netherStarEmoji} **Top 5 Bounty** ${netherStarEmoji}`)
        .setColor('#2b2d31')
        .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
        .setTimestamp();

      if (bounties.length > 0) {
        const descLines = bounties.map((b, idx) => {
          const oreIcon = getRankOreEmoji(idx);
          return (
            `${oreIcon} **${b.player}**\n` +
            `┣ ${emeraldEmoji} **Tiền thưởng:** \`${b.amount}\`\n` +
            `┗ ${writableBookEmoji} **Người tạo:** \`${b.creators}\``
          );
        });

        embed.setDescription(descLines.join('\n\n') + '\n\n\u200B');
      } else {
        embed.setDescription(`${barrierEmoji} Hiện tại chưa có danh sách tiền thưởng nào trên server.`);
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh bounty (${targetPlayer || 'Top 5'}):`, error.message);
      recordError('bounty', targetPlayer || 'Top 5', error);

      const barrierEmoji = getCustomEmoji('barrier');
      const errorEmbed = new EmbedBuilder()
        .setTitle(`${barrierEmoji} Lỗi kiểm tra tiền thưởng`)
        .setDescription(`Không thể lấy dữ liệu tiền thưởng từ máy chủ KingMC.\n\n${barrierEmoji} **Chi tiết:** \`${error.message}\`\n\nVui lòng thử lại sau hoặc bấm nút **Báo lỗi** bên dưới để gửi thông báo tới Admin!`)
        .setColor('#ef4444')
        .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
        .setTimestamp();

      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`report_error_bounty_${targetPlayer || 'top'}`)
            .setLabel('Báo lỗi')
            .setStyle(ButtonStyle.Danger)
        );

      await interaction.editReply({ embeds: [errorEmbed], components: [row] });
    }
  }
};
