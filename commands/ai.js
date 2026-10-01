/**
 * commands/ai.js - Slash Command /ai
 * Trò chuyện trực tiếp với AI thông qua Groq API (Đồng bộ với lệnh ?ai)
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkSensitiveContent } = require('../helpers/filterHelper');
const { performWebSearch, shouldPerformWebSearch } = require('../helpers/searchHelper');
const { countWords } = require('../helpers/utils');
const groqManager = require('../helpers/groqHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ai')
    .setDescription('Trò chuyện & hỏi đáp với Groq AI KingMC (Có hỗ trợ Tra cứu Web)')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Câu hỏi hoặc nội dung bạn muốn trò chuyện với AI')
        .setRequired(true)
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question')?.trim();
    if (!question) {
      return await interaction.reply({
        content: '⚠️ Vui lòng nhập câu hỏi bạn muốn hỏi AI! VD: `/ai question: Cách chế tạo khiên trong Minecraft?`',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    // 0. Kiểm tra nếu Admin đã tắt tính năng AI Chat
    if (global.isAiChatEnabled === false) {
      return await interaction.editReply({
        content: `⚠️ **Thông báo:** ${global.aiDisableReason || 'Tính năng trò chuyện AI hiện đang tạm tắt.'}`
      });
    }

    // 1. Kiểm tra từ ngữ nhạy cảm (Im lặng bỏ qua)
    const filterResult = checkSensitiveContent(question);
    if (filterResult.isBlocked) {
      console.log(`[Slash-AI] 🛑 Chặn câu hỏi nhạy cảm từ ${interaction.user.tag}: "${question}" (Từ vi phạm: ${filterResult.matchedWord})`);
      try {
        await interaction.deleteReply();
      } catch (e) {}
      return;
    }

    try {
      // 2. Tra cứu Internet nếu câu hỏi yêu cầu dữ liệu thực tế / thời gian thực
      let finalPrompt = question;
      let usedWebSearch = false;

      if (shouldPerformWebSearch(question)) {
        const searchResults = await performWebSearch(question, 4);
        if (searchResults.length > 0) {
          usedWebSearch = true;
          const searchContext = searchResults
            .map((item, idx) => `[${idx + 1}] ${item.title}\nNội dung: ${item.snippet}\nNguồn: ${item.url}`)
            .join('\n\n');
          
          finalPrompt = `[Dữ liệu tìm kiếm thời gian thực từ Internet]:\n${searchContext}\n\n[Câu hỏi của người dùng]: "${question}"\n\nHãy dựa vào dữ liệu tìm kiếm thời gian thực trên (nếu có ích) để tổng hợp và trả lời thật ngắn gọn, súc tích (bắt buộc dưới 100 từ) bằng tiếng Việt.`;
        }
      }

      // 3. Gửi câu hỏi sang Groq AI
      const aiReply = await groqManager.chat([{ role: 'user', content: finalPrompt }]);

      // 3.1. Kiểm tra giới hạn độ dài phản hồi (tối đa 100 chữ)
      const wordCount = countWords(aiReply);
      if (wordCount > 100) {
        console.warn(`[Slash-AI] ⚠️ Phản hồi AI quá dài (${wordCount} chữ > 100 chữ). Lập tức drop câu trả lời.`);
        const warningEmbed = new EmbedBuilder()
          .setTitle('⚠️ Không thể trả lời')
          .setDescription('Câu trả lời từ AI vượt quá giới hạn cho phép (tối đa 100 chữ). Vui lòng đặt câu hỏi cụ thể hơn hoặc yêu cầu tóm tắt ngắn gọn!')
          .setColor('#f59e0b')
          .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
          .setTimestamp();

        return await interaction.editReply({ embeds: [warningEmbed] });
      }

      // 4. Hiển thị kết quả dạng Embed hoặc tin nhắn tùy độ dài
      if (aiReply.length <= 4000) {
        const embed = new EmbedBuilder()
          .setTitle(`💬 Trả lời cho: "${question.length > 50 ? question.substring(0, 47) + '...' : question}"`)
          .setDescription(aiReply)
          .setColor(usedWebSearch ? '#10b981' : '#3b82f6')
          .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ content: `**💬 Câu hỏi:** ${question}\n\n**🤖 AI:** ${aiReply.substring(0, 1900)}` });
      }
    } catch (error) {
      console.error(`[Slash-AI] Lỗi khi xử lý câu hỏi "${question}":`, error.message);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kết nối AI')
        .setDescription(`Không thể nhận phản hồi từ AI lúc này.\n\n⚠️ **Chi tiết lỗi:** ${error.message}`)
        .setColor('#ef4444')
        .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
        .setTimestamp();

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
