/**
 * commands/chat.js - Slash Command /chat
 * Trò chuyện trực tiếp với AI thông qua Groq API
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkSensitiveContent } = require('../helpers/filterHelper');
const { performWebSearch, shouldPerformWebSearch } = require('../helpers/searchHelper');
const groqManager = require('../helpers/groqHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Trò chuyện thông minh với Groq AI (Có hỗ trợ Tra cứu Web)')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Câu hỏi hoặc nội dung bạn muốn trò chuyện với AI')
        .setRequired(true)
    ),

  async execute(interaction) {
    const question = interaction.options.getString('question').trim();

    await interaction.deferReply();

    // 1. Kiểm tra từ ngữ nhạy cảm
    const filterResult = checkSensitiveContent(question);
    if (filterResult.isBlocked) {
      const blockEmbed = new EmbedBuilder()
        .setTitle('🛡️ Nội dung không phù hợp')
        .setDescription(filterResult.blockMessage)
        .setColor('#ef4444')
        .setTimestamp();
      
      return await interaction.editReply({ embeds: [blockEmbed] });
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
          
          finalPrompt = `[Dữ liệu tìm kiếm thời gian thực từ Internet]:\n${searchContext}\n\n[Câu hỏi của người dùng]: "${question}"\n\nHãy dựa vào dữ liệu tìm kiếm thời gian thực trên (nếu có ích) để tổng hợp và trả lời ngắn gọn, chính xác bằng tiếng Việt.`;
        }
      }

      // 3. Gửi câu hỏi sang Groq AI
      const aiReply = await groqManager.chat([{ role: 'user', content: finalPrompt }]);

      // 4. Hiển thị kết quả dạng Embed hoặc tin nhắn tùy độ dài
      if (aiReply.length <= 4000) {
        const embed = new EmbedBuilder()
          .setTitle(`💬 Trả lời cho: "${question.length > 50 ? question.substring(0, 47) + '...' : question}"`)
          .setDescription(aiReply)
          .setColor(usedWebSearch ? '#10b981' : '#3b82f6')
          .setTimestamp()
          .setFooter({ text: `Powered by Groq AI ${usedWebSearch ? '• 🌐 Đã tra cứu Internet' : ''} • Thiết kế bởi BinhLH` });

        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.editReply({ content: `**💬 Câu hỏi:** ${question}\n\n**🤖 AI:** ${aiReply.substring(0, 1900)}` });
      }
    } catch (error) {
      console.error(`[Slash-Chat] Lỗi khi xử lý câu hỏi "${question}":`, error.message);
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kết nối AI')
        .setDescription(`Không thể nhận phản hồi từ AI lúc này.\n\n⚠️ **Chi tiết lỗi:** ${error.message}`)
        .setColor('#ef4444');

      await interaction.editReply({ embeds: [errorEmbed] });
    }
  }
};
