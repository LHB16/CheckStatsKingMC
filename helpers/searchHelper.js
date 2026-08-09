const { search } = require('duck-duck-scrape');

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Tra cứu thông tin trên DuckDuckGo qua HTML endpoint (Fallback nếu SDK lỗi VQD)
 */
async function fallbackHtmlSearch(query, maxResults = 4) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) return [];

    const html = await response.text();
    const results = [];

    // Parse các block kết quả bằng Regex nhẹ
    const titleRegex = /<a class="result__url" href="([^"]+)".*?>\s*([^<]+)\s*<\/a>/gi;
    const snippetRegex = /<a class="result__snippet[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;

    const titles = [];
    const snippets = [];

    let match;
    while ((match = titleRegex.exec(html)) !== null && titles.length < maxResults) {
      titles.push({ url: match[1], title: match[2].trim() });
    }

    while ((match = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
      const cleanSnippet = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      snippets.push(cleanSnippet);
    }

    for (let i = 0; i < titles.length; i++) {
      results.push({
        title: titles[i].title,
        snippet: snippets[i] || '',
        url: titles[i].url
      });
    }

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Thực hiện tìm kiếm thông tin trên internet với cơ chế Fallback an toàn
 * @param {string} query - Từ khóa cần tìm kiếm
 * @param {number} maxResults - Số lượng kết quả tối đa cần lấy (Mặc định: 4)
 * @returns {Promise<{title: string, snippet: string, url: string}[]>}
 */
async function performWebSearch(query, maxResults = 4) {
  if (!query || typeof query !== 'string' || !query.trim()) {
    return [];
  }

  const cleanQuery = query.trim();
  console.log(`[WebSearch] 🔍 Đang tìm kiếm trên Internet từ khóa: "${cleanQuery}"...`);

  // 1. Thử dùng DuckDuckScrape SDK
  try {
    const searchResults = await search(cleanQuery, {
      userAgent: BROWSER_USER_AGENT
    });

    if (searchResults && searchResults.results && searchResults.results.length > 0) {
      const validResults = searchResults.results
        .slice(0, maxResults)
        .map(item => ({
          title: item.title || '',
          snippet: item.snippet || '',
          url: item.url || ''
        }))
        .filter(item => item.snippet || item.title);

      if (validResults.length > 0) {
        console.log(`[WebSearch] ✅ Đã tìm thấy ${validResults.length} kết quả từ SDK.`);
        return validResults;
      }
    }
  } catch (error) {
    console.warn(`[WebSearch] ⚠️ SDK lỗi (${error.message}), thử chuyển sang HTML Fallback...`);
  }

  // 2. Fallback sang HTML Scraper nếu SDK gặp lỗi VQD
  try {
    const fallbackResults = await fallbackHtmlSearch(cleanQuery, maxResults);
    if (fallbackResults.length > 0) {
      console.log(`[WebSearch] ✅ Đã tìm thấy ${fallbackResults.length} kết quả từ HTML Fallback.`);
      return fallbackResults;
    }
  } catch (e) {}

  console.log('[WebSearch] ⚠️ Không thể tìm kiếm dữ liệu Web lúc này. Chuyển sang tri thức AI.');
  return [];
}

/**
 * Kiểm tra xem câu hỏi có chứa các dấu hiệu cần tra cứu Internet thời gian thực hay không
 * @param {string} text 
 * @returns {boolean}
 */
function shouldPerformWebSearch(text) {
  if (!text) return false;
  const lower = text.toLowerCase();

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
