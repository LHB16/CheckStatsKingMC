/**
 * commands/item.js - Slash Command /item & Prefix ?item
 * @description Tra cứu thông tin vật phẩm Minecraft (Anh - Việt, ID, Emoji Discord, Stack Size)
 */

const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  EmbedBuilder,
  ComponentType
} = require('discord.js');
const {
  searchItems,
  getItemDetail,
  formatItemEmbed,
  resolveSelectMenuEmoji
} = require('../helpers/itemHelper');
const { getCustomEmoji } = require('../helpers/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('Tra cứu thông tin vật phẩm Minecraft (Anh - Việt, ID, Emoji Discord)')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Tên tiếng Anh của vật phẩm cần tìm (tối thiểu 3 ký tự)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawQuery = interaction.options?.getString('name') || interaction.options?.getString() || '';
    const query = String(rawQuery).trim();

    // 1. Kiểm tra độ dài từ khóa (yêu cầu tối thiểu 3 ký tự)
    if (!query || query.length < 3) {
      const warnEmoji = getCustomEmoji('barrier', '⚠️');
      const errorMsg = `${warnEmoji} Vui lòng nhập từ khóa tiếng Anh có **ít nhất 3 chữ cái** để tìm kiếm vật phẩm! (VD: \`/item sword\` hoặc \`?item diamond\`)`;
      if (interaction.reply) {
        return await interaction.reply({ content: errorMsg, ephemeral: true });
      }
      return;
    }

    // 2. Tìm kiếm vật phẩm trong cơ sở dữ liệu Minecraft 1.21.4
    const items = searchItems(query, 25);

    // Không tìm thấy vật phẩm
    if (items.length === 0) {
      const barrierEmoji = getCustomEmoji('barrier', '❌');
      const notFoundMsg = `${barrierEmoji} Không tìm thấy vật phẩm Minecraft nào khớp với từ khóa "**${query}**".\n> 💡 *Hãy thử từ khóa ngắn hơn hoặc phổ biến hơn (VD: \`dia\`, \`sword\`, \`apple\`, \`mace\`).*`;
      return await interaction.reply({ content: notFoundMsg, ephemeral: true });
    }

    const targetUserId = interaction.user?.id || interaction.author?.id;

    // 3. Nếu chỉ có duy nhất 1 kết quả: Trả về Embed chi tiết ngay lập tức
    if (items.length === 1) {
      const detailEmbed = formatItemEmbed(items[0]);
      return await interaction.reply({ embeds: [detailEmbed] });
    }

    // 4. Nếu tìm thấy nhiều kết quả: Hiển thị Dropdown Select Menu (Tối đa 25 mục)
    const selectMenuId = `item_select_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(selectMenuId)
      .setPlaceholder(`🔍 Chọn vật phẩm muốn xem (${items.length} kết quả)...`);

    for (const item of items) {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(item.displayName.slice(0, 100))
        .setValue(item.name)
        .setDescription(`${item.vietnameseName} • ID: ${item.name}`.slice(0, 100));

      const parsedEmoji = resolveSelectMenuEmoji(item.emoji);
      if (parsedEmoji) {
        option.setEmoji(parsedEmoji);
      }
      selectMenu.addOptions(option);
    }

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const compassEmoji = getCustomEmoji('compass', '🧭');
    const summaryEmbed = new EmbedBuilder()
      .setTitle(`${compassEmoji} Kết quả tìm kiếm cho: "${query}"`)
      .setDescription(`Tìm thấy **${items.length}** vật phẩm phù hợp.\nVui lòng chọn một vật phẩm từ danh sách bên dưới để xem chi tiết thông tin:`)
      .setColor('#2b2d31')
      .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
      .setTimestamp();

    let responseMsg = null;
    if (interaction.reply) {
      const res = await interaction.reply({ embeds: [summaryEmbed], components: [row] });
      // Lấy Message object nếu là Slash Command
      if (interaction.fetchReply) {
        try {
          responseMsg = await interaction.fetchReply();
        } catch (_) {}
      } else if (res && typeof res.createMessageComponentCollector === 'function') {
        responseMsg = res;
      }
    }

    if (!responseMsg) return;

    // 5. Thiết lập Collector lắng nghe sự kiện khi người dùng chọn trong Dropdown
    const collector = responseMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000 // 60 giây TTL
    });

    collector.on('collect', async selectInteraction => {
      // Chỉ cho phép người thực hiện lệnh tương tác
      if (selectInteraction.user.id !== targetUserId) {
        return await selectInteraction.reply({
          content: '⚠️ Bạn không phải là người gọi lệnh tìm kiếm này!',
          ephemeral: true
        });
      }

      const selectedName = selectInteraction.values[0];
      const selectedDetail = getItemDetail(selectedName);

      if (!selectedDetail) {
        return await selectInteraction.reply({
          content: '❌ Không thể tìm thấy dữ liệu chi tiết của vật phẩm này!',
          ephemeral: true
        });
      }

      const detailEmbed = formatItemEmbed(selectedDetail);

      // Cập nhật Embed chi tiết nhưng vẫn giữ Dropdown để người dùng có thể chọn món khác nếu muốn
      await selectInteraction.update({
        embeds: [detailEmbed],
        components: [row]
      });
    });

    collector.on('end', async () => {
      // Hết hạn 60s: Vô hiệu hóa Dropdown để tránh click lỗi
      try {
        const disabledRow = new ActionRowBuilder().addComponents(
          selectMenu
            .setDisabled(true)
            .setPlaceholder('Menu tìm kiếm đã hết hạn (Dùng lại lệnh để tìm kiếm mới)')
        );
        if (responseMsg && responseMsg.edit) {
          await responseMsg.edit({ components: [disabledRow] }).catch(() => {});
        } else if (interaction.editReply) {
          await interaction.editReply({ components: [disabledRow] }).catch(() => {});
        }
      } catch (_) {}
    });
  }
};
