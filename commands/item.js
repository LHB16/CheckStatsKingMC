/**
 * commands/item.js - Slash Command /item & Prefix ?item
 * @description Tra cứu thông tin vật phẩm Minecraft (Anh - Việt, ID, Emoji Discord, Stack Size)
 */

const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
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
        .setDescription('Tên tiếng Anh hoặc tiếng Việt của vật phẩm cần tìm (tối thiểu 3 ký tự)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawQuery = interaction.options?.getString('name') || interaction.options?.getString() || '';
    const query = String(rawQuery).trim();

    // 1. Kiểm tra độ dài từ khóa (yêu cầu tối thiểu 3 ký tự)
    if (!query || query.length < 3) {
      const warnEmoji = getCustomEmoji('barrier', '⚠️');
      const errorMsg = `${warnEmoji} Vui lòng nhập từ khóa có **ít nhất 3 chữ cái** để tìm kiếm vật phẩm! (VD: \`/item sword\` hoặc \`?item diamond\`)`;
      if (interaction.reply) {
        return await interaction.reply({ content: errorMsg, ephemeral: true });
      }
      return;
    }

    // 2. Tìm kiếm vật phẩm trong cơ sở dữ liệu Minecraft 1.21.4 (Không giới hạn để hỗ trợ phân trang)
    const items = searchItems(query);

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

    // 4. Phân trang kết quả (mỗi trang tối đa 25 mục do giới hạn Select Menu của Discord)
    const PAGE_SIZE = 25;
    const totalPages = Math.ceil(items.length / PAGE_SIZE);
    let currentPage = 0;
    let currentSelectedItem = null;

    const uid = `${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const selectMenuId = `item_select_${uid}`;
    const prevBtnId = `item_prev_${uid}`;
    const nextBtnId = `item_next_${uid}`;
    const pageIndicatorId = `item_page_${uid}`;

    // Hàm tạo nội dung payload tin nhắn dựa theo trang hiện tại và item đang chọn
    const generatePayload = (page, selectedItem = null) => {
      const startIdx = page * PAGE_SIZE;
      const endIdx = startIdx + PAGE_SIZE;
      const pageItems = items.slice(startIdx, endIdx);

      // Select Menu cho 25 item của trang hiện tại
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(selectMenuId)
        .setPlaceholder(`🔍 Chọn vật phẩm (Trang ${page + 1}/${totalPages} • ${pageItems.length} mục)...`);

      for (const item of pageItems) {
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

      const rows = [new ActionRowBuilder().addComponents(selectMenu)];

      // Nút điều hướng phân trang tối giản (nếu có từ 2 trang trở lên)
      if (totalPages > 1) {
        const prevButton = new ButtonBuilder()
          .setCustomId(prevBtnId)
          .setEmoji('◀️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0);

        const pageIndicator = new ButtonBuilder()
          .setCustomId(pageIndicatorId)
          .setLabel(`${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true);

        const nextButton = new ButtonBuilder()
          .setCustomId(nextBtnId)
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1);

        rows.push(new ActionRowBuilder().addComponents(prevButton, pageIndicator, nextButton));
      }

      // Tạo Embed
      let embed;
      if (selectedItem) {
        embed = formatItemEmbed(selectedItem);
        embed.setFooter({
          text: `CheckStatsKingMC • Trang ${page + 1}/${totalPages} (${items.length} kết quả) • Thiết kế bởi BinhLH`
        });
      } else {
        const compassEmoji = getCustomEmoji('compass', '🧭');
        embed = new EmbedBuilder()
          .setTitle(`${compassEmoji} Kết quả tìm kiếm cho: "${query}"`)
          .setDescription(
            `Tìm thấy **${items.length}** vật phẩm phù hợp trong Minecraft 1.21.4.\n` +
            (totalPages > 1 ? `Đang hiển thị **Trang ${page + 1}/${totalPages}** (mỗi trang tối đa 25 mục).\n\n` : '') +
            `👉 Vui lòng chọn một vật phẩm từ danh sách bên dưới để xem chi tiết:`
          )
          .setColor('#2b2d31')
          .setFooter({
            text: `CheckStatsKingMC • Trang ${page + 1}/${totalPages} (${items.length} kết quả) • Thiết kế bởi BinhLH`
          })
          .setTimestamp();
      }

      return { embeds: [embed], components: rows };
    };

    let responseMsg = null;
    if (interaction.reply) {
      const res = await interaction.reply(generatePayload(currentPage, currentSelectedItem));
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

    // 5. Thiết lập Collector lắng nghe sự kiện tương tác (Menu & Buttons)
    const collector = responseMsg.createMessageComponentCollector({
      time: 120000 // 120 giây TTL
    });

    collector.on('collect', async componentInteraction => {
      // Chỉ cho phép người thực hiện lệnh tương tác
      if (componentInteraction.user.id !== targetUserId) {
        return await componentInteraction.reply({
          content: '⚠️ Bạn không phải là người gọi lệnh tìm kiếm này!',
          ephemeral: true
        });
      }

      // Xử lý khi chọn vật phẩm trong Dropdown
      if (componentInteraction.isStringSelectMenu() && componentInteraction.customId === selectMenuId) {
        const selectedName = componentInteraction.values[0];
        const selectedDetail = getItemDetail(selectedName);

        if (!selectedDetail) {
          return await componentInteraction.reply({
            content: '❌ Không thể tìm thấy dữ liệu chi tiết của vật phẩm này!',
            ephemeral: true
          });
        }

        currentSelectedItem = selectedDetail;
        await componentInteraction.update(generatePayload(currentPage, currentSelectedItem));
      }
      // Xử lý khi bấm nút chuyển trang
      else if (componentInteraction.isButton()) {
        if (componentInteraction.customId === prevBtnId) {
          if (currentPage > 0) {
            currentPage--;
          }
          await componentInteraction.update(generatePayload(currentPage, currentSelectedItem));
        } else if (componentInteraction.customId === nextBtnId) {
          if (currentPage < totalPages - 1) {
            currentPage++;
          }
          await componentInteraction.update(generatePayload(currentPage, currentSelectedItem));
        }
      }
    });

    collector.on('end', async () => {
      // Hết hạn: Vô hiệu hóa Dropdown và Buttons
      try {
        const lastPayload = generatePayload(currentPage, currentSelectedItem);
        const disabledRows = lastPayload.components.map(row => {
          const newRow = new ActionRowBuilder();
          for (const comp of row.components) {
            if (comp instanceof StringSelectMenuBuilder) {
              newRow.addComponents(
                StringSelectMenuBuilder.from(comp)
                  .setDisabled(true)
                  .setPlaceholder('Menu tìm kiếm đã hết hạn (Dùng lại lệnh để tìm kiếm mới)')
              );
            } else if (comp instanceof ButtonBuilder) {
              newRow.addComponents(
                ButtonBuilder.from(comp).setDisabled(true)
              );
            }
          }
          return newRow;
        });

        if (responseMsg && responseMsg.edit) {
          await responseMsg.edit({ components: disabledRows }).catch(() => {});
        } else if (interaction.editReply) {
          await interaction.editReply({ components: disabledRows }).catch(() => {});
        }
      } catch (_) {}
    });
  }
};
