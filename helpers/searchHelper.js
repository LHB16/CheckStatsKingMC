const { search } = require('duck-duck-scrape');

/**
 * Thực hiện tìm kiếm thông tin trên internet qua DuckDuckGo
 * @param {string} query - Từ khóa cần tìm kiếm
 * @param {number} maxResults - Số lượng kết quả tối đa cần lấy (Mặc định: 4)
 * @returns {Promise<{title: string, snippet: string, url: string}[]>}
 */
async function performWebSearch(query, maxResults = 4) {
  try {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return [];
    }

    console.log(`[WebSearch] 🔍 Đang tìm kiếm trên Internet từ khóa: "${query}"...`);
    const searchResults = await search(query.trim());

    if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
      console.log('[WebSearch] ⚠️ Không tìm thấy kết quả tìm kiếm nào.');
      return [];
    }

    // Lọc ra các kết quả hữu ích
    const validResults = searchResults.results
      .slice(0, maxResults)
      .map(item => ({
        title: item.title || '',
        snippet: item.snippet || '',
        url: item.url || ''
      }))
      .filter(item => item.snippet || item.title);

    console.log(`[WebSearch] ✅ Đã tìm thấy ${validResults.length} kết quả từ Internet.`);
    return validResults;
  } catch (error) {
    console.error('[WebSearch] ❌ Lỗi khi tìm kiếm trên Internet:', error.message);
    return [];
  }
}

/**
 * Kiểm tra xem câu hỏi có chứa các dấu hiệu cần tra cứu Internet thời gian thực hay không
 * @param {string} text 
 * @returns {boolean}
 */
function shouldPerformWebSearch(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Danh sách từ khóa dấu hiệu cần tìm kiếm thời gian thực
  const searchKeywords = [
    'hôm nay', 'mới nhất', 'tin tức', 'thời tiết', 'giá', 'ngày', 
    'năm 2024', 'năm 2025', 'năm 2026', 'ai là', 'tìm kiếm', 'google', 
    'search', 'trực tiếp', 'tỉ số', 'bảng xếp hạng', 'sự kiện', 'vừa mới',
    'báo', 'thời sự', 'mấy giờ', 'xem'
  ];

  return searchKeywords.some(keyword => lower.includes(keyword));
}

module.exports = {
  performWebSearch,
  shouldPerformWebSearch
};
