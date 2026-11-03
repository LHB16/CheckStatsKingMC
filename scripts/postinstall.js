/**
 * scripts/postinstall.js - Tự động tải Chrome cho Puppeteer nếu môi trường hỗ trợ
 * Tự động bỏ qua trên Wispbyte (/home/container), chế độ Worker (BOT_ROLE=worker),
 * hoặc khi bật biến PUPPETEER_SKIP_DOWNLOAD=true.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

const isWispbyteContainer = fs.existsSync('/home/container');
const botRole = (process.env.BOT_ROLE || '').toLowerCase();
const skipDownload =
  process.env.PUPPETEER_SKIP_DOWNLOAD === 'true' ||
  process.env.SKIP_PUPPETEER_DOWNLOAD === 'true' ||
  process.env.IS_WISPBYTE === 'true' ||
  botRole === 'worker' ||
  isWispbyteContainer;

// Tự động dọn dẹp cache Puppeteer/npm cũ trên Wispbyte để giải phóng ổ cứng ngay lập tức
if (isWispbyteContainer) {
  const cachesToClean = [
    '/home/container/.cache/puppeteer',
    '/home/container/.npm/_cacache'
  ];
  for (const cacheDir of cachesToClean) {
    try {
      if (fs.existsSync(cacheDir)) {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        console.log(`[PostInstall] 🧹 Đã dọn dẹp thư mục bộ nhớ đệm nặng: ${cacheDir}`);
      }
    } catch (e) {
      console.warn(`[PostInstall] ⚠️ Không thể xóa ${cacheDir}: ${e.message}`);
    }
  }
}

if (skipDownload) {
  console.log('[PostInstall] ℹ️ Phát hiện môi trường Worker / Wispbyte (/home/container). Bỏ qua tải Chrome để tiết kiệm ổ cứng.');
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
