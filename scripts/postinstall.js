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

// Tự động dọn dẹp cache Puppeteer/npm cũ trên Wispbyte / Bot-Hosting để giải phóng ổ cứng ngay lập tức
if (isWispbyteContainer) {
  const cachesToClean = [
    '/home/container/.cache',
    '/home/container/.npm'
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

// Tự động xóa dữ liệu các phiên bản Bedrock trong minecraft-data (tiết kiệm ~280 MB ổ cứng cho Worker)
// Luôn bảo lưu toàn bộ data/bedrock/common/* vì minecraft-data bắt buộc phải nạp features.json, protocolVersions.json, versions.json, legacy.json
try {
  const bedrockDir = path.join(__dirname, '..', 'node_modules', 'minecraft-data', 'minecraft-data', 'data', 'bedrock');
  const commonDir = path.join(bedrockDir, 'common');

  const requiredFiles = {
    'features.json': '[]',
    'protocolVersions.json': '[]',
    'versions.json': '[]',
    'legacy.json': '{}'
  };

  // Lưu lại nội dung các file hiện có nếu hợp lệ
  const preservedContents = {};
  for (const filename of Object.keys(requiredFiles)) {
    const filePath = path.join(commonDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        preservedContents[filename] = fs.readFileSync(filePath, 'utf8');
      } catch (e) {}
    }
  }

  if (fs.existsSync(bedrockDir)) {
    const items = fs.readdirSync(bedrockDir);
    for (const item of items) {
      if (item !== 'common') {
        const itemPath = path.join(bedrockDir, item);
        try {
          fs.rmSync(itemPath, { recursive: true, force: true });
        } catch (e) {}
      }
    }
  }

  if (!fs.existsSync(commonDir)) {
    fs.mkdirSync(commonDir, { recursive: true });
  }

  // Khôi phục hoặc tạo file mặc định cho toàn bộ metadata của bedrock/common
  for (const [filename, defaultContent] of Object.entries(requiredFiles)) {
    const filePath = path.join(commonDir, filename);
    if (!fs.existsSync(filePath)) {
      const content = preservedContents[filename] || defaultContent;
      fs.writeFileSync(filePath, content, 'utf8');
    }
  }
  console.log('[PostInstall] 🧹 Đã dọn dẹp các phiên bản Bedrock thừa (bảo lưu toàn bộ bedrock/common, giải phóng ~280 MB ổ cứng)!');
} catch (e) {
  console.warn('[PostInstall] ⚠️ Không thể dọn dẹp thư mục Bedrock:', e.message);
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
