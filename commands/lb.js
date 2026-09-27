/**
 * commands/lb.js - Slash Command /lb & /leaderboard
 * @description Hiển thị Top 9 Bảng Xếp Hạng in-game trên KingMC (Cụm KingSMP) với Emoji 9 loại Quặng,
 * hỗ trợ bot quét trực tiếp in-game khi gõ lệnh và Dropdown Select Menu chuyển đổi nhanh các hạng mục.
 */

const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ComponentType 
} = require('discord.js');
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

const DROPDOWN_CATEGORIES = [
  'money',
  'shard',
  'kills',
  'deaths',
  'played',
  'blocks_placed',
  'blocks_mined',
  'mob_kills',
  'shop_buy',
  'shop_sell',
  'breed'
];

// Tạo Menu Dropdown với Custom Emoji 3D của Bot
function buildCategorySelectMenu(currentKey) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('lb_select_category')
    .setPlaceholder('🎮 Chọn hạng mục Bảng Xếp Hạng khác...');

  const options = DROPDOWN_CATEGORIES.map(key => {
    const c = LEADERBOARD_CATEGORIES[key];
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(c.name)
      .setValue(c.key)
      .setDescription(c.description ? c.description.substring(0, 50) : '')
      .setDefault(c.key === currentKey);

    if (c.emojiId) {
      opt.setEmoji(c.emojiId);
    }
    return opt;
  });

  selectMenu.addOptions(options);
  return new ActionRowBuilder().addComponents(selectMenu);
}

// Helper tạo Embed Top 9
function buildLeaderboardEmbed(categoryConfig, players) {
  const top9 = (players || []).slice(0, 9);
  const catEmoji = getCustomEmoji(categoryConfig.emojiKey) || '🏆';

  const lines = top9.map((p, idx) => {
    const oreEmoji = getRankOreEmoji(idx);
    const unitText = categoryConfig.unit ? ` ${categoryConfig.unit}` : '';
    return `${oreEmoji} **${p.username}** ➔ \`${p.value}${unitText}\``;
  });

  const titleText = `${catEmoji} Leaderboard: ${(categoryConfig.titleName || categoryConfig.name).toUpperCase()}`;

  return new EmbedBuilder()
    .setTitle(titleText)
    .setColor(categoryConfig.color || '#2b2d31')
    .setDescription(lines.length > 0 ? lines.join('\n') : 'Chưa có dữ liệu người chơi.')
    .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
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
    currentType = categoryConfig.key;
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
    const row = buildCategorySelectMenu(currentType);

    const replyMsg = await interaction.editReply({
      embeds: [embed],
      components: [row]
    });

    // 4. Lắng nghe tương tác Dropdown Menu để người dùng có thể đổi sang xem các hạng mục khác
    const collector = replyMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 180000 // 3 phút
    });

    collector.on('collect', async (selectInteraction) => {
      if (selectInteraction.user.id !== interaction.user.id) {
        return selectInteraction.reply({
          content: '⚠️ Chỉ người dùng lệnh này mới có thể thao tác menu!',
          ephemeral: true
        });
      }

      const selectedKey = selectInteraction.values[0];
      const newConfig = resolveCategoryConfig(selectedKey);
      if (!newConfig) return;

      currentType = newConfig.key;
      await selectInteraction.deferUpdate();

      let newPlayers = null;

      // Quét live cho hạng mục mới được chọn
      if (queueDispatcher) {
        try {
          const liveResult = await queueDispatcher.enqueueTask('leaderboard', currentType, 25000);
          if (liveResult && Array.isArray(liveResult.players) && liveResult.players.length > 0) {
            newPlayers = liveResult.players;
            await saveLeaderboardToMongo(currentType, liveResult.title, newPlayers);
          }
        } catch (_) {}
      }

      if (!newPlayers || newPlayers.length === 0) {
        const cached = await getLeaderboardCategory(currentType);
        if (cached && cached.players) {
          newPlayers = cached.players;
        }
      }

      if (newPlayers && newPlayers.length > 0) {
        const newEmbed = buildLeaderboardEmbed(newConfig, newPlayers);
        const newRow = buildCategorySelectMenu(currentType);
        await selectInteraction.editReply({
          embeds: [newEmbed],
          components: [newRow]
        });
      } else {
        const barrierEmoji = getCustomEmoji('barrier') || '⚠️';
        await selectInteraction.followUp({
          content: `${barrierEmoji} Hiện không thể tải dữ liệu cho mục **${newConfig.name}**. Vui lòng thử lại sau!`,
          ephemeral: true
        });
      }
    });

    collector.on('end', async () => {
      try {
        const disabledMenu = buildCategorySelectMenu(currentType);
        disabledMenu.components[0].setDisabled(true);
        await interaction.editReply({ components: [disabledMenu] });
      } catch (_) {}
    });
  }
};
