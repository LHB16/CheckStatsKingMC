/**
 * commands/lb.js - Slash Command /lb & /leaderboard
 * @description Hiển thị Top 9 Bảng Xếp Hạng in-game trên KingMC (Cụm KingSMP) với Emoji 9 loại Quặng.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LEADERBOARD_CATEGORIES, getLeaderboardCategory, getRankOreEmoji } = require('../helpers/leaderboardHelper');
const { getCustomEmoji } = require('../helpers/utils');

// Cấu hình 11 lựa chọn cho Slash Command theo chuẩn item in-game
const categoryChoices = Object.values(LEADERBOARD_CATEGORIES).map(c => ({
  name: c.choiceName || c.name,
  value: c.key
}));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lb')
    .setDescription('Xem Top 9 Bảng Xếp Hạng người chơi trên KingMC (Cụm KingSMP)')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Chọn hạng mục Bảng Xếp Hạng cần xem')
        .setRequired(true)
        .addChoices(...categoryChoices)
    ),

  async execute(interaction) {
    const selectedType = interaction.options.getString('type') || 'money';
    await interaction.deferReply();

    const categoryData = getLeaderboardCategory(selectedType);

    if (!categoryData || !categoryData.players || categoryData.players.length === 0) {
      const barrierEmoji = getCustomEmoji('barrier') || '⚠️';
      return interaction.editReply({
        content: `${barrierEmoji} Hiện chưa có dữ liệu cho Bảng Xếp Hạng **${selectedType}**. Vui lòng kiểm tra lại sau!`
      });
    }

    // Lấy đúng Top 9 người chơi đầu tiên
    const top9Players = categoryData.players.slice(0, 9);
    const catEmoji = getCustomEmoji(categoryData.emojiKey) || '🏆';

    // Tạo các dòng hiển thị: Emoji Quặng + Tên người chơi + Thông số (không có #hạng)
    const lines = top9Players.map((p, idx) => {
      const oreEmoji = getRankOreEmoji(idx);
      const unitText = categoryData.unit ? ` ${categoryData.unit}` : '';
      return `${oreEmoji} **${p.username}** ➔ \`${p.value}${unitText}\``;
    });

    const embed = new EmbedBuilder()
      .setTitle(`${catEmoji} ${categoryData.name.toUpperCase()} • KINGMC`)
      .setColor(categoryData.color || '#2b2d31')
      .setDescription(lines.join('\n'))
      .setTimestamp()
      .setFooter({ text: 'Cụm KingSMP • Top 9 Server' });

    // Gửi phản hồi duy nhất (không qua trang, không avatar)
    await interaction.editReply({
      embeds: [embed]
    });
  }
};
