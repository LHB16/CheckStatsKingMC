/**
 * commands/chat.js - Slash Command /chat
 * Trò chuyện trực tiếp với AI thông qua Groq API
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkSensitiveContent } = require('../helpers/filterHelper');
const groqManager = require('../helpers/groqHelper');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Trò chuyện thông minh với Groq AI')
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
      // 2. Gửi câu hỏi sang Groq AI
      const aiReply = await groqManager.chat([{ role: 'user', content: question }]);

      // 3. Hiển thị kết quả dạng Embed hoặc tin nhắn tùy độ dài
      if (aiReply.length <= 4000) {
        const embed = new EmbedBuilder()
          .setTitle(`💬 Trả lời cho: "${question.length > 50 ? question.substring(0, 47) + '...' : question}"`)
          .setDescription(aiReply)
          .setColor('#3b82f6')
          .setTimestamp()
          .setFooter({ text: 'Powered by Groq AI • Thiết kế bởi BinhLH' });

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
