/**
 * commands/lb.js - Slash Command /lb & /leaderboard
 * @description Hiển thị Top 9 Bảng Xếp Hạng in-game trên KingMC (Cụm KingSMP) với Emoji 9 loại Quặng,
 * hỗ trợ bot quét live in-game khi gõ lệnh và Dropdown Select Menu với Custom Emoji 3D của Bot.
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
  getLeaderboardCategory, 
  saveLeaderboardToMongo, 
  getRankOreEmoji 
} = require('../helpers/leaderboardHelper');
const { getCustomEmoji } = require('../helpers/utils');

// Cấu hình 11 lựa chọn cho Slash Command theo chuẩn item in-game
const categoryChoices = Object.values(LEADERBOARD_CATEGORIES).map(c => ({
  name: c.choiceName || c.name,
  value: c.key
}));

// Tạo Menu Dropdown với Custom Emoji 3D của Bot
function buildCategorySelectMenu(currentKey) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('lb_select_category')
    .setPlaceholder('🎮 Chọn hạng mục Bảng Xếp Hạng khác...');

  const options = Object.values(LEADERBOARD_CATEGORIES).map(c => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(c.name)
      .setValue(c.key)
      .setDescription(c.description.substring(0, 50))
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
function buildLeaderboardEmbed(categoryConfig, players, isLive = false) {
  const top9 = (players || []).slice(0, 9);
  const catEmoji = getCustomEmoji(categoryConfig.emojiKey) || '🏆';

  const lines = top9.map((p, idx) => {
    const oreEmoji = getRankOreEmoji(idx);
    const unitText = categoryConfig.unit ? ` ${categoryConfig.unit}` : '';
    return `${oreEmoji} **${p.username}** ➔ \`${p.value}${unitText}\``;
  });

  const footerText = isLive 
    ? 'Cụm KingSMP • Top 9 Server • Vừa quét trực tiếp in-game 🟢' 
    : 'Cụm KingSMP • Top 9 Server • Dữ liệu từ cơ sở dữ liệu';

  return new EmbedBuilder()
    .setTitle(`${catEmoji} ${categoryConfig.name.toUpperCase()} • KINGMC`)
    .setColor(categoryConfig.color || '#2b2d31')
    .setDescription(lines.length > 0 ? lines.join('\n') : 'Chưa có dữ liệu người chơi.')
    .setTimestamp()
    .setFooter({ text: footerText });
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

    const categoryConfig = LEADERBOARD_CATEGORIES[currentType] || LEADERBOARD_CATEGORIES.money;
    let players = null;
    let isLive = false;

    // 1. Thử cho bot in-game đi quét trực tiếp nếu có QueueDispatcher
    if (queueDispatcher) {
      try {
        console.log(`[LB] 🚀 Đang điều phối Minecraft Bot quét Live cho hạng mục: ${currentType}...`);
        const liveResult = await queueDispatcher.enqueueTask('leaderboard', currentType, 25000);
        if (liveResult && Array.isArray(liveResult.players) && liveResult.players.length > 0) {
          players = liveResult.players;
          isLive = true;
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

    const embed = buildLeaderboardEmbed(categoryConfig, players, isLive);
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

      const newType = selectInteraction.values[0];
      const newConfig = LEADERBOARD_CATEGORIES[newType];
      if (!newConfig) return;

      currentType = newType;
      await selectInteraction.deferUpdate();

      let newPlayers = null;
      let newIsLive = false;

      // Quét live cho hạng mục mới được chọn
      if (queueDispatcher) {
        try {
          const liveResult = await queueDispatcher.enqueueTask('leaderboard', newType, 25000);
          if (liveResult && Array.isArray(liveResult.players) && liveResult.players.length > 0) {
            newPlayers = liveResult.players;
            newIsLive = true;
            await saveLeaderboardToMongo(newType, liveResult.title, newPlayers);
          }
        } catch (_) {}
      }

      if (!newPlayers || newPlayers.length === 0) {
        const cached = await getLeaderboardCategory(newType);
        if (cached && cached.players) {
          newPlayers = cached.players;
        }
      }

      if (newPlayers && newPlayers.length > 0) {
        const newEmbed = buildLeaderboardEmbed(newConfig, newPlayers, newIsLive);
        const newRow = buildCategorySelectMenu(newType);
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
