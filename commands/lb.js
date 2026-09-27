/**
 * commands/lb.js - Slash Command /lb & /leaderboard
 * @description Hiển thị Top 9 Bảng Xếp Hạng in-game trên KingMC (Cụm KingSMP) với Emoji 9 loại Quặng,
 * hỗ trợ bot quét trực tiếp in-game khi gõ lệnh.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { 
  LEADERBOARD_CATEGORIES, 
  resolveCategoryConfig,
  getLeaderboardCategory, 
  saveLeaderboardToMongo, 
  getRankOreEmoji 
} = require('../helpers/leaderboardHelper');
const { getCustomEmoji } = require('../helpers/utils');

// Cấu hình 11 lựa chọn ngắn gọn không emoji cho Slash Command
const categoryChoices = [
  { name: 'money', value: 'money' },
  { name: 'shard', value: 'shard' },
  { name: 'kills', value: 'kills' },
  { name: 'deaths', value: 'deaths' },
  { name: 'played', value: 'played' },
  { name: 'blocks_placed', value: 'blocks_placed' },
  { name: 'blocks_mined', value: 'blocks_mined' },
  { name: 'mob_kills', value: 'mob_kills' },
  { name: 'shop_buy', value: 'shop_buy' },
  { name: 'shop_sell', value: 'shop_sell' },
  { name: 'breed', value: 'breed' }
];

// Helper tạo Embed Top 9
function buildLeaderboardEmbed(categoryConfig, players) {
  const top9 = (players || []).slice(0, 9);
  const catEmoji = getCustomEmoji(categoryConfig.emojiKey) || '🏆';

  const lines = top9.map((p, idx) => {
    const oreEmoji = getRankOreEmoji(idx);
    const unitText = categoryConfig.unit ? ` ${categoryConfig.unit}` : '';
    return `${oreEmoji} ${p.username} ➔ ${p.value}${unitText}`;
  });

  const titleText = `${catEmoji} Leaderboard: ${(categoryConfig.titleName || categoryConfig.name).toUpperCase()}`;

  return new EmbedBuilder()
    .setTitle(titleText)
    .setColor(categoryConfig.color || '#2b2d31')
    .setDescription(lines.length > 0 ? lines.join('\n') : 'Chưa có dữ liệu người chơi.')
    .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' })
    .setTimestamp();
}

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

  async execute(interaction, queueDispatcher) {
    let currentType = interaction.options ? (interaction.options.getString('type') || 'money') : 'money';
    await interaction.deferReply();

    const categoryConfig = resolveCategoryConfig(currentType);
    let players = null;

    // 1. Thử cho bot in-game đi quét trực tiếp nếu có QueueDispatcher
    if (queueDispatcher) {
      try {
        console.log(`[LB] 🚀 Đang điều phối Minecraft Bot quét Live cho hạng mục: ${currentType}...`);
        const liveResult = await queueDispatcher.enqueueTask('leaderboard', currentType, 25000);
        if (liveResult && Array.isArray(liveResult.players) && liveResult.players.length > 0) {
          players = liveResult.players;
          // Lưu vào MongoDB để phục vụ các lần xem tiếp theo
          await saveLeaderboardToMongo(currentType, liveResult.title, players);
        }
      } catch (err) {
        console.warn(`[LB] ⚠️ Quét trực tiếp in-game không thành công (${err.message}). Đang tìm kiếm trong Database...`);
      }
    }

    // 2. Nếu quét live không được, lấy từ Database / Cache
    if (!players || players.length === 0) {
      const cached = await getLeaderboardCategory(currentType);
      if (cached && cached.players && cached.players.length > 0) {
        players = cached.players;
      }
    }

    // 3. Nếu vẫn không có dữ liệu
    if (!players || players.length === 0) {
      const barrierEmoji = getCustomEmoji('barrier') || '⚠️';
      return interaction.editReply({
        content: `${barrierEmoji} Minecraft Bot hiện đang bận hoặc đang kết nối lại, đồng thời chưa có dữ liệu lưu trong Database cho mục **${categoryConfig.name}**. Vui lòng thử lại sau giây lát!`
      });
    }

    const embed = buildLeaderboardEmbed(categoryConfig, players);

    return interaction.editReply({
      embeds: [embed]
    });
  }
};
