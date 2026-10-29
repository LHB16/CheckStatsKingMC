/**
 * scripts/postinstall.js - Tự động tải Chrome cho Puppeteer nếu môi trường hỗ trợ
 * Cho phép bỏ qua trên Wispbyte hoặc các môi trường dung lượng thấp bằng biến:
 * PUPPETEER_SKIP_DOWNLOAD=true
 */

const { execSync } = require('child_process');

if (process.env.PUPPETEER_SKIP_DOWNLOAD === 'true' || process.env.SKIP_PUPPETEER_DOWNLOAD === 'true') {
  console.log('[PostInstall] ℹ️ Đã phát hiện cờ PUPPETEER_SKIP_DOWNLOAD=true. Bỏ qua tải Chrome để tiết kiệm dung lượng ổ cứng (1 GB limit).');
  process.exit(0);
}

try {
  console.log('[PostInstall] 🚀 Đang cài đặt trình duyệt Chrome cho Puppeteer...');
  execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
  console.log('[PostInstall] ✅ Cài đặt Chrome hoàn tất!');
} catch (err) {
  console.warn('[PostInstall] ⚠️ Không thể tải Chrome tự động:', err.message);
  console.warn('[PostInstall] 💡 Bot vẫn có thể hoạt động ở chế độ TEXT hoặc sử dụng Chromium có sẵn.');
}
