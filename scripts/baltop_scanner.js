/**
 * scripts/baltop_scanner.js - Công cụ độc lập quét /baltop trên KingMC
 * @description Tự động kết nối vào cụm Survival KingMC, mở /baltop, duyệt từng trang để bóc tách:
 * - Thứ hạng (#Rank)
 * - Tên người chơi (Username)
 * - Số dư (Balance)
 * - Texture Skin (NBT Skull/Profile)
 * Lưu trữ trực tiếp và vĩnh viễn vào MongoDB Atlas + file data/skin_cache.json.
 * 
 * Cách sử dụng:
 *   node scripts/baltop_scanner.js               (Quét mặc định 20 trang đầu = 900 người chơi)
 *   node scripts/baltop_scanner.js --pages 50    (Quét 50 trang đầu = 2.250 người chơi)
 *   node scripts/baltop_scanner.js --all         (Quét liên tục đến trang cuối cùng theo quy tắc 5 lần tiêu đề không đổi)
 *   node scripts/baltop_scanner.js --delay 2000  (Tùy chỉnh khoảng nghỉ giữa các trang, mặc định 1800ms)
 */

require('dotenv').config();
const mineflayer = require('mineflayer');
const skinHelper = require('../helpers/skinHelper');

// --- Cấu hình tham số CLI ---
const args = process.argv.slice(2);
let maxPages = 20;
let isScanAll = false;
let delayBetweenPages = 1800; // ms

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pages' && args[i + 1]) {
    maxPages = parseInt(args[i + 1], 10) || 20;
    i++;
  } else if (args[i] === '--all') {
    isScanAll = true;
  } else if (args[i] === '--delay' && args[i + 1]) {
    delayBetweenPages = parseInt(args[i + 1], 10) || 1800;
    i++;
  }
}

// Cấu hình Server từ .env
const MC_SERVER_HOSTS = (process.env.MC_SERVER_HOSTS || 'kingmc.vn,sgp.kingmc.vn')
  .split(',')
  .map(h => h.trim())
  .filter(h => h.length > 0);
const MC_SERVER_PORT = parseInt(process.env.MC_SERVER_PORT) || 25565;
const BOT_PASSWORD = 'Scan' + Math.floor(100000 + Math.random() * 900000);
const BOT_USERNAME = 'BTopScan' + Math.floor(100 + Math.random() * 900);

console.log('====================================================');
console.log('🚀 KHỞI ĐỘNG BALTOP CRAWLER (KINGMC.VN)');
console.log(`📌 Chế độ: ${isScanAll ? 'QUÉT TẤT CẢ ĐẾN TRANG CUỐI (--all)' : `Quét tối đa ${maxPages} trang (--pages ${maxPages})`}`);
console.log(`⏱️ Độ trễ giữa các trang: ${delayBetweenPages}ms`);
console.log(`🤖 Tên Bot: [${BOT_USERNAME}]`);
console.log('====================================================\n');

// Helper loại bỏ mã màu Minecraft
function cleanMinecraftText(text) {
  if (!text) return '';
  return String(text)
    .replace(/§x(§[0-9a-f]){6}/gi, '')
    .replace(/&x(&[0-9a-f]){6}/gi, '')
    .replace(/&#[0-9a-f]{6}/gi, '')
    .replace(/§#[0-9a-f]{6}/gi, '')
    .replace(/§[0-9a-fk-or]/gi, '')
    .replace(/&[0-9a-fk-or]/gi, '')
    .replace(/§./g, '')
    .replace(/[\u00A0\u200B\uFEFF]/g, ' ')
    .normalize('NFC')
    .trim();
}

// Chuẩn hóa phông chữ Small Caps độc lạ của Server Minecraft (ví dụ: ᴛᴏᴘ ᴍᴏɴᴇʏ -> top money)
function normalizeSmallCaps(str) {
  if (!str) return '';
  return String(str)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/ᴀ/g, 'a')
    .replace(/ʙ/g, 'b')
    .replace(/ᴄ/g, 'c')
    .replace(/ᴅ/g, 'd')
    .replace(/ᴇ/g, 'e')
    .replace(/ғ/g, 'f')
    .replace(/ɢ/g, 'g')
    .replace(/ʜ/g, 'h')
    .replace(/ɪ/g, 'i')
    .replace(/ᴊ/g, 'j')
    .replace(/ᴋ/g, 'k')
    .replace(/ʟ/g, 'l')
    .replace(/ᴍ/g, 'm')
    .replace(/ɴ/g, 'n')
    .replace(/ᴏ/g, 'o')
    .replace(/ᴘ/g, 'p')
    .replace(/ǫ/g, 'q')
    .replace(/ʀ/g, 'r')
    .replace(/ꜱ/g, 's')
    .replace(/ᴛ/g, 't')
    .replace(/ᴜ/g, 'u')
    .replace(/ᴠ/g, 'v')
    .replace(/ᴡ/g, 'w')
    .replace(/x/g, 'x')
    .replace(/ʏ/g, 'y')
    .replace(/ᴢ/g, 'z')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Helper parse JSON Text Component của Minecraft
function parseMinecraftJSON(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    let str = input.trim();
    if (str.startsWith('{') || str.startsWith('[')) {
      try {
        const obj = JSON.parse(str);
        return parseMinecraftJSON(obj);
      } catch (e) {}
    }
    return str;
  }
  if (Array.isArray(input)) {
    return input.map(item => parseMinecraftJSON(item)).join('');
  }
  if (typeof input === 'object') {
    let result = '';
    if (input.text) result += input.text;
    if (input.extra && Array.isArray(input.extra)) {
      result += input.extra.map(item => parseMinecraftJSON(item)).join('');
    }
    return result;
  }
  return String(input);
}

// Helper bóc tách lore từ NBT
function extractLoreFromNbt(nbt) {
  if (!nbt || !nbt.value) return [];
  try {
    const display = nbt.value.display;
    if (!display || !display.value) return [];
    const lore = display.value.Lore;
    if (!lore || !lore.value || !lore.value.value) return [];
    const list = lore.value.value;
    if (Array.isArray(list)) {
      return list.map(item => cleanMinecraftText(parseMinecraftJSON(item)));
    }
  } catch (e) {}
  return [];
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runScanner() {
  // 1. Khởi tạo SkinHelper để kết nối MongoDB Atlas & File Cache
  console.log('[1/4] Đang kết nối MongoDB Atlas & Nạp RAM Cache...');
  await skinHelper.initSkinHelper();

  // 2. Kết nối Bot Mineflayer vào KingMC
  const targetHost = MC_SERVER_HOSTS[0] || 'kingmc.vn';
  console.log(`[2/4] Đang kết nối Bot vào Server: [${targetHost}:${MC_SERVER_PORT}]...`);

  const bot = mineflayer.createBot({
    host: targetHost,
    port: MC_SERVER_PORT,
    username: BOT_USERNAME,
    auth: 'offline',
    version: '1.20.1',
    checkTimeoutInterval: 60000
  });

  let isInSurvival = false;
  let isEnteringSurvival = false;
  let hasOpenedBaltop = false;
  let isScanning = false;
  let hasAuthed = false;

  // Xử lý chat auth (đăng ký / đăng nhập) - Chỉ gửi 1 lần và có delay
  bot.on('messagestr', (message) => {
    const msg = cleanMinecraftText(message);
    console.log(`[KingMC Chat] ${msg}`);
    const lower = msg.toLowerCase();

    if (!hasAuthed) {
      if (lower.includes('đăng ký') || lower.includes('dang ky') || lower.includes('/dk')) {
        hasAuthed = true;
        console.log(`[Bot] 📝 Gửi lệnh đăng ký: /dk ...`);
        setTimeout(() => {
          bot.chat(`/dk ${BOT_PASSWORD} ${BOT_PASSWORD}`);
        }, 1000);
      } else if (lower.includes('đăng nhập') || lower.includes('dang nhap') || lower.includes('/dn')) {
        hasAuthed = true;
        console.log(`[Bot] 🔑 Gửi lệnh đăng nhập: /dn ...`);
        setTimeout(() => {
          bot.chat(`/dn ${BOT_PASSWORD}`);
        }, 1000);
      }
    }

    // Khi nhận được thông báo đã đăng nhập ở Sảnh -> Mở /menu để chọn cụm Survival
    if (lower.includes('bạn đã đăng nhập') || lower.includes('ban da dang nhap') || lower.includes('phiên đăng nhập đã được kết nối')) {
      if (!isInSurvival && !isEnteringSurvival) {
        isEnteringSurvival = true;
        console.log('[Bot] ✅ Đã ở Sảnh chính! Đợi 2.5s rồi mở /menu để vào cụm Survival...');
        setTimeout(() => {
          bot.chat('/menu');
        }, 2500);
      }
    }
  });

  // Khi bot spawn lần đầu hoặc sau khi đổi cụm server
  bot.on('spawn', () => {
    const dim = bot.game?.dimension || 'world';
    console.log(`[Bot] Đã Spawn tại dimension: [${dim}]`);
  });

  // Xử lý mở GUI (menu sảnh & baltop)
  bot.on('windowOpen', async (win) => {
    const rawTitle = parseMinecraftJSON(win.title || '');
    const cleanTitle = cleanMinecraftText(rawTitle);
    const normTitle = normalizeSmallCaps(cleanTitle);
    console.log(`[GUI Mở] Tiêu đề: "${cleanTitle}" [${normTitle}] (Số slots: ${win.slots.length})`);

    // A. Nếu đang ở sảnh và GUI là /menu -> click slot 24 để vào cụm Survival
    if (!isInSurvival && (normTitle.includes('chon may chu') || normTitle.includes('menu') || normTitle.includes('sanh'))) {
      console.log('[Bot] ⏳ Đợi 2s rồi click slot 24 (Cụm Survival)...');
      setTimeout(() => {
        try {
          bot.clickWindow(24, 0, 0);
          isInSurvival = true;
          console.log('[Bot] ✅ Đã click slot 24. Đợi 6s chuyển server rồi mở /baltop...');

          setTimeout(() => {
            console.log('\n[3/4] 🟢 Đã vào cụm Survival! Gửi lệnh /baltop bắt đầu cào dữ liệu...');
            bot.chat('/baltop');
          }, 6000);
        } catch (e) {
          console.warn('[Bot] Lỗi khi click slot 24:', e.message);
        }
      }, 2000);
      return;
    }

    // B. Nếu GUI là TOP MONEY (/baltop) -> Bắt đầu quá trình quét
    if (normTitle.includes('top money') || normTitle.includes('baltop')) {
      if (isScanning) return; // Tránh chạy song song nhiều tiến trình quét
      isScanning = true;
      console.log('[4/4] 🚀 BẮT ĐẦU QUÉT BALTOP GUI...\n');
      await startBaltopExtraction(bot, win);
    }
  });

  bot.on('error', (err) => {
    console.error(`❌ [Bot Error]: ${err.message}`);
  });

  bot.on('kicked', (reason) => {
    console.warn(`⚠️ [Bot Bị Kick]: ${cleanMinecraftText(JSON.stringify(reason))}`);
    process.exit(1);
  });

  bot.on('end', () => {
    console.log('🛑 [Bot] Kết nối đã kết thúc.');
  });
}

/**
 * Tiến trình duyệt và bóc tách dữ liệu Baltop qua từng trang
 */
async function startBaltopExtraction(bot, initialWindow) {
  let currentWindow = initialWindow;
  let totalPlayersScanned = 0;
  let totalNewSkinsSaved = 0;
  let pagesCount = 0;
  let lastTitle = '';
  let sameTitleCount = 0; // Đếm số lần tiêu đề không đổi liên tiếp

  const startTime = Date.now();

  while (true) {
    pagesCount++;
    const currentTitle = cleanMinecraftText(parseMinecraftJSON(currentWindow.title || ''));
    console.log(`----------------------------------------------------`);
    console.log(`📖 Đang quét: "${currentTitle}" (Trang thứ ${pagesCount})`);

    // Quét 45 slots đầu tiên (hàng 0 đến hàng 4)
    let pagePlayersCount = 0;
    const maxItemSlots = Math.min(45, currentWindow.inventoryStart || 45);

    for (let i = 0; i < maxItemSlots; i++) {
      const item = currentWindow.slots[i];
      if (!item) continue;

      let rawName = item.displayName || item.customName || '';
      rawName = cleanMinecraftText(parseMinecraftJSON(rawName));
      if (!rawName) continue;

      // Bóc tách Rank và Username (VD: "#1 Duymuprup" hoặc "1 Duymuprup")
      let rank = i + 1;
      let playerName = rawName;
      const rankMatch = rawName.match(/^(?:#|top\s*)?(\d+)\s+([a-zA-Z0-9_]+)/i);
      if (rankMatch) {
        rank = parseInt(rankMatch[1], 10);
        playerName = rankMatch[2];
      } else {
        playerName = rawName.replace(/^[#\d\s:]+/, '').trim();
      }

      if (!playerName || playerName.length < 3) continue;

      // Bóc tách Số dư (Balance) từ Lore
      let balance = 'N/A';
      let loreArray = item.customLore ? item.customLore.map(l => cleanMinecraftText(parseMinecraftJSON(l))) : extractLoreFromNbt(item.nbt);
      if (loreArray.length > 0) {
        balance = loreArray[0];
      }

      // Bóc tách Skin từ NBT của player_head
      let hasNewSkin = false;
      if (item.nbt) {
        try {
          const skinData = skinHelper.extractSkinDataFromNbt(item.nbt);
          if (skinData && skinData.url) {
            const existing = skinHelper.getSkin(playerName);
            if (!existing || !existing.textureId) {
              hasNewSkin = true;
              totalNewSkinsSaved++;
            }
            // Lưu trực tiếp vào RAM Cache + MongoDB Atlas + skin_cache.json
            await skinHelper.saveSkin(playerName, skinData.url, skinData.model);
          }
        } catch (e) {}
      }

      pagePlayersCount++;
      totalPlayersScanned++;

      if (hasNewSkin) {
        console.log(`  ⭐ [#${rank}] ${playerName} | Số dư: ${balance} -> [SKIN MỚI ĐÃ LƯU]`);
      }
    }

    console.log(`✅ Trang ${pagesCount}: Đã xử lý ${pagePlayersCount} người chơi. (Tổng cộng: ${totalPlayersScanned} người, ${totalNewSkinsSaved} skin mới)`);

    // Kiểm tra điều kiện dừng số trang cấu hình (nếu không chạy --all)
    if (!isScanAll && pagesCount >= maxPages) {
      console.log(`\n🎯 Đã hoàn thành chỉ tiêu ${maxPages} trang (--pages ${maxPages}).`);
      break;
    }

    // Chuẩn bị click slot 53 để sang trang tiếp theo
    console.log(`⏳ Đợi ${delayBetweenPages}ms rồi click slot 53 sang trang kế tiếp...`);
    await sleep(delayBetweenPages);

    // Lưu lại tiêu đề đã chuẩn hóa trước khi click
    lastTitle = normalizeSmallCaps(currentTitle);

    // Click slot 53 (mũi tên trang tiếp theo)
    try {
      bot.clickWindow(53, 0, 0);
    } catch (err) {
      console.warn(`[BaltopScanner] Lỗi khi click slot 53: ${err.message}`);
      break;
    }

    // Đợi 1.5s để server nạp trang mới
    await sleep(1500);

    const newWindow = bot.currentWindow;
    if (!newWindow) {
      console.log('[BaltopScanner] Window đã bị đóng.');
      break;
    }

    currentWindow = newWindow;
    const newTitle = cleanMinecraftText(parseMinecraftJSON(currentWindow.title || ''));
    const newNormTitle = normalizeSmallCaps(newTitle);

    // QUY TẮC CỦA NGƯỜI DÙNG: Kiểm tra nếu tiêu đề GUI không đổi 5 lần liên tiếp -> Trang cuối cùng!
    if (newNormTitle === lastTitle) {
      sameTitleCount++;
      console.log(`⚠️ [Phát hiện trang cuối] Tiêu đề không đổi: "${newTitle}" (Lần ${sameTitleCount}/5)`);
      if (sameTitleCount >= 5) {
        console.log(`\n🏁 ĐÃ ĐẠT ĐẾN TRANG CUỐI CÙNG CỦA BALTOP! (Tiêu đề không thay đổi sau 5 lần kiểm tra)`);
        break;
      }
    } else {
      sameTitleCount = 0; // Reset bộ đếm nếu tiêu đề đã đổi sang trang mới thành công
    }
  }

  // Kết thúc quá trình quét
  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log('\n====================================================');
  console.log('🎉 TỔNG KẾT QUÁ TRÌNH QUÉT BALTOP');
  console.log(`📄 Tổng số trang đã quét: ${pagesCount}`);
  console.log(`👥 Tổng số người chơi ghi nhận: ${totalPlayersScanned}`);
  console.log(`🎭 Tổng số Skin mới được nạp vào MongoDB: ${totalNewSkinsSaved}`);
  console.log(`⏱️ Thời gian thực thi: ${durationSec} giây`);
  console.log('====================================================');

  try {
    bot.closeWindow(currentWindow);
  } catch (e) {}

  setTimeout(() => {
    bot.end();
    console.log('👋 Đã ngắt kết nối an toàn. Tiến trình kết thúc.');
    process.exit(0);
  }, 1000);
}

// Bắt đầu chạy tiến trình
runScanner().catch((err) => {
  console.error('❌ Lỗi tiến trình Crawler:', err);
  process.exit(1);
});
