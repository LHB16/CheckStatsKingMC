const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config/sensitive_words.json');

/**
 * Đọc cấu hình từ cấm từ file JSON
 */
function getFilterConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const rawData = fs.readFileSync(CONFIG_PATH, 'utf8');
      return JSON.parse(rawData);
    }
  } catch (error) {
    console.error('[FilterHelper] Lỗi đọc config từ cấm:', error.message);
  }
  return {
    enabled: true,
    blockMessage: '⚠️ Câu hỏi của bạn chứa từ ngữ hoặc nội dung nhạy cảm. Vui lòng giữ môi trường văn minh!',
    badWords: []
  };
}

/**
 * Kiểm tra xem văn bản có chứa từ nhạy cảm hay không
 * @param {string} text 
 * @returns {{ isBlocked: boolean, matchedWord: string|null, blockMessage: string }}
 */
function checkSensitiveContent(text) {
  if (!text || typeof text !== 'string') {
    return { isBlocked: false, matchedWord: null, blockMessage: '' };
  }

  const config = getFilterConfig();
  if (!config.enabled || !Array.isArray(config.badWords) || config.badWords.length === 0) {
    return { isBlocked: false, matchedWord: null, blockMessage: '' };
  }

  const lowerText = text.toLowerCase();

  for (const word of config.badWords) {
    if (!word || !word.trim()) continue;
    const cleanWord = word.trim().toLowerCase();

    // Kiểm tra từ đơn hoặc cụm từ
    // Dùng regex boundary nếu là ký tự latin, hoặc includes nếu chứa ký tự có dấu
    const regex = new RegExp(`(?:^|\\s|\\b)${escapeRegExp(cleanWord)}(?:$|\\s|\\b)`, 'i');
    if (regex.test(lowerText) || lowerText.includes(cleanWord)) {
      return {
        isBlocked: true,
        matchedWord: word,
        blockMessage: config.blockMessage || '⚠️ Tin nhắn chứa từ ngữ không phù hợp!'
      };
    }
  }

  return { isBlocked: false, matchedWord: null, blockMessage: '' };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  checkSensitiveContent,
  getFilterConfig
};
