const { Groq } = require('groq-sdk');

class GroqManager {
  constructor() {
    this.apiKeys = this.loadApiKeys();
    this.currentIndex = 0;
    this.defaultModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    this.systemPrompt = process.env.GROQ_SYSTEM_PROMPT || 
      'Bạn là một AI trợ lý thân thiện, thông minh và hữu ích trên Discord. Hãy trả lời ngắn gọn, lịch sự và bằng tiếng Việt ngoại trừ khi người dùng yêu cầu ngôn ngữ khác.';
  }

  /**
   * Đọc danh sách API Keys từ môi trường (.env)
   * Hỗ trợ cả GROQ_API_KEYS (phân cách bởi dấu phẩy) và GROQ_API_KEY đơn lẻ
   */
  loadApiKeys() {
    const rawKeys = process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '';
    const keys = rawKeys
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    if (keys.length === 0) {
      console.warn('[GroqHelper] ⚠️ Không tìm thấy GROQ_API_KEYS trong .env!');
    } else {
      console.log(`[GroqHelper] 🔑 Đã tải thành công ${keys.length} Groq API Key(s).`);
    }
    return keys;
  }

  /**
   * Lấy API Key hiện tại
   */
  getCurrentKey() {
    if (this.apiKeys.length === 0) {
      this.apiKeys = this.loadApiKeys();
    }
    if (this.apiKeys.length === 0) return null;
    return this.apiKeys[this.currentIndex];
  }

  /**
   * Chuyển sang API Key tiếp theo
   */
  rotateKey() {
    if (this.apiKeys.length <= 1) return;
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    console.log(`[GroqHelper] 🔄 Đã xoay vòng sang API Key index: ${this.currentIndex + 1}/${this.apiKeys.length}`);
  }

  /**
   * Gửi yêu cầu hỏi đáp tới Groq AI với cơ chế tự động xoay vòng API Key
   * @param {Array<{role: string, content: string}>} userMessages - Mảng tin nhắn đối thoại
   * @param {Object} options - Tùy chọn nâng cao (temperature, max_tokens, v.v.)
   */
  async chat(userMessages, options = {}) {
    if (this.apiKeys.length === 0) {
      throw new Error('Chưa cấu hình GROQ_API_KEYS trong file .env!');
    }

    const maxAttempts = this.apiKeys.length;
    let lastError = null;

    // Đảm bảo tin nhắn có system prompt ở đầu
    const messages = [
      { role: 'system', content: options.systemPrompt || this.systemPrompt },
      ...userMessages
    ];

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const apiKey = this.getCurrentKey();
      try {
        const groq = new Groq({ apiKey });

        const completion = await groq.chat.completions.create({
          messages: messages,
          model: options.model || this.defaultModel,
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens || 1024,
        });

        const reply = completion.choices[0]?.message?.content;
        if (!reply) {
          throw new Error('Phản hồi từ Groq AI rỗng!');
        }

        return reply;
      } catch (error) {
        lastError = error;
        const isRateLimitOrAuth = 
          error.status === 429 || 
          error.status === 401 || 
          error.status === 403 ||
          (error.message && (error.message.includes('rate limit') || error.message.includes('quota')));

        console.warn(`[GroqHelper] ⚠️ Lỗi khi gọi API (Key ${this.currentIndex + 1}): ${error.message}`);

        if (isRateLimitOrAuth && this.apiKeys.length > 1) {
          console.log(`[GroqHelper] Thử nghiệm chuyển sang API key tiếp theo...`);
          this.rotateKey();
        } else if (attempt < maxAttempts - 1) {
          this.rotateKey();
        } else {
          break;
        }
      }
    }

    throw new Error(`Tất cả các Groq API Keys đều gặp lỗi hoặc hết quota: ${lastError?.message || 'Unknown error'}`);
  }
}

const groqManager = new GroqManager();
module.exports = groqManager;
