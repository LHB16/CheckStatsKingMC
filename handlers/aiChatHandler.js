const { checkSensitiveContent } = require('../helpers/filterHelper');
const { performWebSearch, shouldPerformWebSearch } = require('../helpers/searchHelper');
const groqManager = require('../helpers/groqHelper');

// Bộ nhớ đệm lưu lịch sử chat ngắn hạn theo channelId hoặc userId
// Map<string, Array<{role: string, content: string}>>
const conversationHistory = new Map();
const MAX_HISTORY = 6; // Lưu tối đa 6 câu thoại gần nhất (3 cặp hỏi - đáp)

/**
 * Xử lý sự kiện tin nhắn trong Discord (Mention tag @bot)
 * @param {import('discord.js').Message} message 
 */
async function handleAiChatMessage(message) {
  try {
    // 1. Bỏ qua tin nhắn từ Bot khác hoặc từ chính bot
    if (message.author.bot) return;

    const clientUser = message.client.user;
    
    // 2. Kiểm tra xem bot có được tag/mention không
    const isMentioned = message.mentions.has(clientUser);
    
    // Nếu không được mention thì bỏ qua
    if (!isMentioned) return;

    // 2.5 Kiểm tra xem tính năng AI Chat có đang bị Admin TẮT hay không
    if (global.isAiChatEnabled === false) {
      console.log(`[AIChat] Bỏ qua câu hỏi vì tính năng AI Chat hiện đang bị TẮT.`);
      return;
    }

    // 3. Tách lấy câu hỏi sạch (xóa tag bot khỏi chuỗi tin nhắn)
    const mentionRegex = new RegExp(`<@!?${clientUser.id}>`, 'g');
    const promptText = message.content.replace(mentionRegex, '').trim();

    if (!promptText) {
      await message.reply('👋 Bạn vừa tag mình! Bạn cần trợ giúp gì? Hãy nhắn câu hỏi kèm theo nhé.');
      return;
    }

    // 4. Kiểm tra từ ngữ nhạy cảm / không phù hợp (Im lặng bỏ qua, không nhắn vào kênh)
    const filterResult = checkSensitiveContent(promptText);
    if (filterResult.isBlocked) {
      console.log(`[AIChat] 🛑 Chặn câu hỏi nhạy cảm từ ${message.author.tag}: "${promptText}" (Từ vi phạm: ${filterResult.matchedWord})`);
      return;
    }

    // 5. Hiển thị trạng thái "đang gõ..." (typing indicator)
    await message.channel.sendTyping();

    // 6. Tự động tìm kiếm thông tin trên Internet nếu câu hỏi yêu cầu dữ liệu thời gian thực
    let finalPromptContent = promptText;
    if (shouldPerformWebSearch(promptText)) {
      const searchResults = await performWebSearch(promptText, 4);
      if (searchResults.length > 0) {
        const searchContext = searchResults
          .map((item, idx) => `[${idx + 1}] ${item.title}\nNội dung: ${item.snippet}\nNguồn: ${item.url}`)
          .join('\n\n');
        
        finalPromptContent = `[Dữ liệu tìm kiếm thời gian thực từ Internet]:\n${searchContext}\n\n[Câu hỏi của người dùng]: "${promptText}"\n\nHãy dựa vào dữ liệu tìm kiếm thời gian thực trên (nếu có ích) để tổng hợp và trả lời ngắn gọn, chính xác bằng tiếng Việt.`;
      }
    }

    // 7. Quản lý lịch sử cuộc hội thoại
    const historyKey = message.channel.isDMBased() ? message.author.id : message.channel.id;
    if (!conversationHistory.has(historyKey)) {
      conversationHistory.set(historyKey, []);
    }
    const history = conversationHistory.get(historyKey);

    // Chuẩn bị tin nhắn gửi sang Groq AI
    const messages = [
      ...history,
      { role: 'user', content: finalPromptContent }
    ];

    // 8. Gửi câu hỏi sang Groq AI (với cơ chế xoay vòng API Keys)
    const aiReply = await groqManager.chat(messages);

    // 8. Cập nhật lịch sử thoại
    history.push({ role: 'user', content: promptText });
    history.push({ role: 'assistant', content: aiReply });
    
    // Giới hạn số lượng tin nhắn trong lịch sử
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    // 9. Trả lời trên Discord (Xử lý cắt nhỏ tin nhắn nếu dài hơn 2000 ký tự)
    if (aiReply.length <= 2000) {
      await message.reply(aiReply);
    } else {
      const chunks = splitMessage(aiReply, 1900);
      for (let i = 0; i < chunks.length; i++) {
        if (i === 0) {
          await message.reply(chunks[i]);
        } else {
          await message.channel.send(chunks[i]);
        }
      }
    }
  } catch (error) {
    console.error('[AIChat] Lỗi xử lý trò chuyện AI:', error.message);
    try {
      await message.reply(`⚠️ Rất tiếc, đã xảy ra lỗi khi kết nối với AI: ${error.message}`);
    } catch (e) {}
  }
}

/**
 * Cắt nhỏ tin nhắn dài thành mảng các chuỗi ngắn vừa vặn với giới hạn Discord (2000 chars)
 */
function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  let currentChunk = '';

  const lines = text.split('\n');
  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > maxLength) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + '\n' + line : line;
    }
  }
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

module.exports = {
  handleAiChatMessage
};
