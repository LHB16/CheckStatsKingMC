/**
 * commands/math.js - Slash Command /math
 * Tính toán biểu thức toán học thuần túy (Pure Math Engine)
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { evaluateMath } = require('../handlers/mathHandler');
const { getCustomEmoji } = require('../helpers/utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('math')
    .setDescription('Tính toán biểu thức toán học thuần túy, tức thì và an toàn')
    .addStringOption(option =>
      option.setName('expression')
        .setDescription('Biểu thức toán học (VD: 12*2, (15+25)*4/2, 2^16, 100%7)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const expression = interaction.options.getString('expression');
    if (!expression || !expression.trim()) {
      return await interaction.reply({
        content: '⚠️ Vui lòng nhập biểu thức toán học cần tính toán! VD: `/math expression: (15 + 25) * 4 / 2`',
        ephemeral: true
      });
    }

    const evalResult = evaluateMath(expression);
    if (!evalResult.success) {
      return await interaction.reply({
        content: `⚠️ **Lỗi tính toán:** ${evalResult.error}`,
        ephemeral: true
      });
    }

    const bookshelfEmoji = getCustomEmoji('bookshelf', '📚');
    const resultEmbed = new EmbedBuilder()
      .setColor('#57F287')
      .setDescription(`${bookshelfEmoji} Kết quả là: **${evalResult.formattedResult}**`)
      .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
      .setTimestamp();

    await interaction.reply({ embeds: [resultEmbed] });
  }
};
