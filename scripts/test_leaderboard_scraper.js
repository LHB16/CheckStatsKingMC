/**
 * scripts/test_leaderboard_scraper.js
 * @description Script kiểm thử cào toàn bộ 11 bảng xếp hạng trong GUI /leaderboard của KingMC (Cụm KingSMP).
 * Sử dụng 1 tài khoản test cố định từ data/test_bot_credentials.json (không ảnh hưởng bot production trên Render).
 */

const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const CRED_FILE = path.join(__dirname, '../data/test_bot_credentials.json');
const OUTPUT_FILE = path.join(__dirname, '../data/leaderboard_test_data.json');

// 1. Tải thông tin tài khoản test duy nhất
function getTestCredentials() {
  if (fs.existsSync(CRED_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
      if (data && data.username && data.password) {
        return data;
      }
    } catch (e) {
      console.warn('Lỗi đọc test_bot_credentials.json:', e.message);
    }
  }

  const creds = {
    username: process.env.MC_USERNAME || 'sdffsdfsghhdf',
    password: process.env.MC_PASSWORD || 'ahshsdsd',
    authType: process.env.MC_AUTH_TYPE || 'offline'
  };

  fs.writeFileSync(CRED_FILE, JSON.stringify(creds, null, 2), 'utf8');
  return creds;
}

const credentials = getTestCredentials();

console.log('====================================================');
console.log('🏆 BẮT ĐẦU SCRIPT KIỂM THỬ LEADERBOARD SCRAPER');
console.log(`🤖 Tài khoản Test: [${credentials.username}]`);
console.log(`🔒 File lưu thông tin: ${CRED_FILE}`);
console.log(`💾 File kết quả xuất ra: ${OUTPUT_FILE}`);
console.log('====================================================\n');

// Các hàm tiện ích parse text / NBT Minecraft
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

function parseMinecraftJSON(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    try {
      return parseMinecraftJSON(JSON.parse(input));
    } catch {
      return input;
    }
  }
  let res = '';
  if (input.text) res += input.text;
  if (Array.isArray(input.extra)) {
    res += input.extra.map(i => parseMinecraftJSON(i)).join('');
  }
  return res;
}

function extractLoreFromNBT(nbt) {
  if (!nbt) return [];
  const root = nbt.value || nbt;
  let rawLore = null;

  if (root.display) {
    const disp = root.display.value || root.display;
    if (disp) rawLore = disp.lore || disp.Lore;
  }
  if (!rawLore && root['minecraft:lore']) rawLore = root['minecraft:lore'];
  if (!rawLore && root.lore) rawLore = root.lore;

  if (!rawLore) return [];

  let lines = rawLore.value !== undefined ? rawLore.value : rawLore;
  if (lines && lines.value !== undefined) lines = lines.value;
  if (typeof lines === 'string') lines = [lines];
  if (!Array.isArray(lines)) return [];

  return lines.map(line => {
    let content = line;
    if (line && typeof line === 'object' && line.value !== undefined) {
      content = line.value;
    }
    return cleanMinecraftText(content);
  }).filter(l => l.length > 0);
}

function extractItemDetail(item, slotIdx) {
  if (!item) return null;
  const customName = item.customName ? cleanMinecraftText(parseMinecraftJSON(item.customName)) : null;
  const displayName = item.displayName ? cleanMinecraftText(item.displayName) : null;
  const lore = extractLoreFromNBT(item.nbt);

  let skinUrl = null;
  try {
    const root = item.nbt && (item.nbt.value || item.nbt);
    const skullOwner = root && (root.SkullOwner || root.skullowner || root['minecraft:profile']);
    const props = skullOwner && (skullOwner.Properties || skullOwner.properties);
    const textures = props && (props.textures || props.Textures);
    if (textures) {
      const texVal = Array.isArray(textures.value) ? textures.value[0] : (Array.isArray(textures) ? textures[0] : textures);
      const valStr = texVal && (texVal.Value || texVal.value);
      if (valStr) {
        const decoded = Buffer.from(valStr, 'base64').toString('utf8');
        const json = JSON.parse(decoded);
        skinUrl = json?.textures?.SKIN?.url || null;
      }
    }
  } catch (_) {}

  return {
    slot: slotIdx,
    name: item.name,
    count: item.count,
    displayName: customName || displayName || item.name,
    lore: lore,
    skinUrl: skinUrl
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForGuiUpdate(bot, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let isResolved = false;
    let timeoutTimer = null;
    let debounceTimer = null;

    const done = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve(bot.currentWindow);
    };

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      bot.removeListener('windowOpen', onWindowOpen);
      if (bot.currentWindow) {
        bot.currentWindow.removeListener('updateSlot', onSlotUpdate);
      }
    };

    timeoutTimer = setTimeout(done, timeoutMs);

    const onWindowOpen = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(done, 250);
    };

    const onSlotUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(done, 250);
    };

    bot.once('windowOpen', onWindowOpen);
    if (bot.currentWindow) {
      bot.currentWindow.on('updateSlot', onSlotUpdate);
    }
  });
}

// 2. Khởi tạo kết nối Bot Mineflayer
const HOST = (process.env.MC_SERVER_HOSTS || 'kingmc.vn').split(',')[0].trim();
const PORT = parseInt(process.env.MC_SERVER_PORT) || 25565;

console.log(`📡 Đang kết nối tới ${HOST}:${PORT} bằng tài khoản [${credentials.username}]...`);
const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: credentials.username,
  auth: credentials.authType === 'microsoft' ? 'microsoft' : 'offline',
  version: '1.20.1'
});

let isLoggedIn = false;
let isInSMP = false;
let isScraping = false;

bot.on('error', (err) => {
  console.error(`❌ [Bot Error]: ${err.message}`);
});

bot.on('kicked', (reason) => {
  console.warn(`⚠️ [Bot Kicked]: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
});

bot.on('spawn', () => {
  console.log('✅ Bot đã spawn vào server!');
});

bot.on('respawn', () => {
  console.log('🔄 Bot respawn / chuyển cụm máy chủ!');
});

bot.on('message', async (jsonMsg) => {
  const msgText = jsonMsg.toString();
  const cleanMsg = cleanMinecraftText(msgText);
  if (cleanMsg) {
    console.log(`💬 [Server Chat]: ${cleanMsg}`);
  }

  const lowerMsg = cleanMsg.toLowerCase();

  // 1. Tự động Login / Register
  if (lowerMsg.includes('/register') || lowerMsg.includes('dang ky bang lenh') || lowerMsg.includes('dang ky')) {
    console.log('🔑 Server yêu cầu đăng ký. Gửi /register...');
    await sleep(500);
    bot.chat(`/register ${credentials.password} ${credentials.password}`);
  } else if (lowerMsg.includes('/login') || lowerMsg.includes('/dn') || lowerMsg.includes('dang nhap') || lowerMsg.includes('vui long')) {
    if (!isLoggedIn && (lowerMsg.includes('/dn') || lowerMsg.includes('/login') || lowerMsg.includes('mật khẩu'))) {
      console.log('🔑 Server yêu cầu đăng nhập. Gửi /login...');
      await sleep(500);
      bot.chat(`/login ${credentials.password}`);
    }
  }

  if (lowerMsg.includes('đăng nhập thành công') || lowerMsg.includes('bạn đã đăng nhập') || lowerMsg.includes('dang nhap thanh cong')) {
    if (!isLoggedIn) {
      isLoggedIn = true;
      console.log('🎉 Đăng nhập thành công! Đợi 2.5s rồi tiến hành mở Menu vào KingSMP...');
      setTimeout(() => {
        enterKingSMP();
      }, 2500);
    }
  }
});

// Điều hướng vào cụm KingSMP
async function enterKingSMP() {
  if (isInSMP) return;

  console.log('🚀 Bắt đầu quy trình vào cụm KingSMP...');

  let menuOpened = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (isInSMP) break;

    console.log(`[Menu] 📤 Gõ /menu (Lần ${attempt}/5)...`);
    bot.chat('/menu');

    const win = await waitForGuiUpdate(bot, 3000);
    if (win) {
      const rawTitle = parseMinecraftJSON(win.title || '');
      const cleanTitle = cleanMinecraftText(rawTitle);
      console.log(`[Menu] ✅ Đã mở GUI: "${cleanTitle}" (${win.slots.length} slots)`);

      // Kiểm tra slot 24 (KingSMP)
      const slot24 = win.slots[24];
      if (slot24) {
        const itemInfo = extractItemDetail(slot24, 24);
        console.log(`[Menu] 📌 Tìm thấy slot 24: "${itemInfo.displayName}" | Lore: ${itemInfo.lore.slice(0, 2).join(' ')}`);
      }

      console.log('👉 Click vào slot 24 để kết nối vào KingSMP...');
      try {
        bot.clickWindow(24, 0, 0);
      } catch (err) {
        console.warn('Lỗi click slot 24:', err.message);
      }

      menuOpened = true;
      break;
    } else {
      console.log('⏳ Chưa mở được menu, chờ 2 giây trước khi thử lại...');
      await sleep(2000);
    }
  }

  if (!menuOpened) {
    console.error('❌ Không thể mở Menu chọn cụm server!');
    return;
  }

  // Đợi chuyển cụm máy chủ sang KingSMP (5 giây)
  console.log('⏳ Đang đợi server chuyển sang cụm KingSMP (6 giây)...');
  await sleep(6000);

  // Đóng window cũ nếu còn sót lại sau khi đổi proxy
  if (bot.currentWindow) {
    try {
      bot.closeWindow(bot.currentWindow);
    } catch (_) {}
    await sleep(500);
  }

  isInSMP = true;
  console.log('\n🟢 BOT ĐÃ VÀO CỤM KINGSMP THÀNH CÔNG! CHUẨN BỊ CÀO LEADERBOARD...');
  await sleep(2000);

  if (!isScraping) {
    isScraping = true;
    startLeaderboardScraping();
  }
}

// Mở GUI /leaderboard chính
async function openLeaderboardMenu(maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (bot.currentWindow) {
      try {
        bot.closeWindow(bot.currentWindow);
      } catch (_) {}
      await sleep(600);
    }

    console.log(`[Leaderboard] 📤 Gõ /leaderboard (Lần thử ${attempt}/${maxRetries})...`);
    bot.chat('/leaderboard');

    const win = await waitForGuiUpdate(bot, 3500);
    if (win) {
      const rawTitle = parseMinecraftJSON(win.title || '');
      const cleanTitle = cleanMinecraftText(rawTitle);
      console.log(`[Leaderboard] ✅ Đã mở GUI: "${cleanTitle}" (${win.slots.length} slots)`);
      return win;
    }

    console.log('⏳ Chưa mở được GUI /leaderboard, đợi 2 giây thử lại...');
    await sleep(2000);
  }
  throw new Error('Không thể mở GUI /leaderboard sau 4 lần thử!');
}

// Tiến trình cào toàn bộ 11 bảng xếp hạng
async function startLeaderboardScraping() {
  const resultData = {
    scrapedAt: new Date().toISOString(),
    serverHost: HOST,
    serverPort: PORT,
    botAccount: credentials.username,
    categories: {}
  };

  try {
    // 1. Mở GUI chính
    let mainWin = await openLeaderboardMenu();
    const containerSlotCount = mainWin.inventoryStart || 27;

    // 2. Quét danh sách các hạng mục (item slot 0..containerSlotCount-1)
    const categorySlots = [];
    for (let i = 0; i < containerSlotCount; i++) {
      const it = mainWin.slots[i];
      if (!it) continue;

      const detail = extractItemDetail(it, i);
      // Bỏ qua thanh trang trí
      if (detail.name.includes('stained_glass_pane') || detail.name.includes('barrier')) {
        continue;
      }
      categorySlots.push(detail);
    }

    console.log(`\n====================================================`);
    console.log(`📋 PHÁT HIỆN TỔNG CỘNG ${categorySlots.length} HẠNG MỤC TRONG GUI /LEADERBOARD:`);
    categorySlots.forEach((c, idx) => {
      console.log(`   [${idx + 1}] Slot #${c.slot} | ID: \x1b[36m${c.name}\x1b[0m | Tên: \x1b[32m"${c.displayName}"\x1b[0m`);
    });
    console.log(`====================================================\n`);

    // 3. Lần lượt click từng item để mở sub-GUI và cào dữ liệu
    for (let idx = 0; idx < categorySlots.length; idx++) {
      const cat = categorySlots[idx];
      console.log(`\n----------------------------------------------------`);
      console.log(`🎯 [${idx + 1}/${categorySlots.length}] Đang xử lý: "${cat.displayName}" (Slot #${cat.slot} - ID: ${cat.name})`);

      // Đảm bảo GUI /leaderboard chính đang mở
      let curWin = bot.currentWindow;
      const curTitle = curWin ? cleanMinecraftText(parseMinecraftJSON(curWin.title || '')) : '';
      if (!curWin || !curTitle.toUpperCase().includes('LEADERBOARD')) {
        console.log('🔄 Đang mở lại GUI /leaderboard chính...');
        curWin = await openLeaderboardMenu();
      }

      console.log(`👉 Click vào Slot #${cat.slot}...`);
      try {
        bot.clickWindow(cat.slot, 0, 0);
      } catch (err) {
        console.warn(`Lỗi click slot #${cat.slot}:`, err.message);
      }

      // Đợi sub-GUI mở ra
      const subWin = await waitForGuiUpdate(bot, 3500);
      if (!subWin) {
        console.warn(`⚠️ Không nhận được phản hồi sub-GUI cho slot #${cat.slot}`);
        continue;
      }

      const subTitleRaw = parseMinecraftJSON(subWin.title || '');
      const subTitleClean = cleanMinecraftText(subTitleRaw);
      const subContainerCount = subWin.inventoryStart || 54;
      console.log(`✨ Đã mở Sub-GUI: "${subTitleClean}" (${subWin.slots.length} slots)`);

      const players = [];
      const allItems = [];
      let backSlot = -1;

      for (let s = 0; s < subContainerCount; s++) {
        const item = subWin.slots[s];
        if (!item) continue;

        const detail = extractItemDetail(item, s);
        allItems.push(detail);

        // Nhận diện nút Back
        const lowerDisp = (detail.displayName || '').toLowerCase();
        const lowerName = detail.name.toLowerCase();
        if (lowerDisp.includes('quay lại') || lowerDisp.includes('back') || lowerDisp.includes('trang trước') ||
            lowerName.includes('arrow') || lowerName.includes('bed') || lowerName.includes('barrier')) {
          backSlot = s;
        }

        // Nhận diện item người chơi đua top
        const hasRankLore = detail.lore.some(line => {
          const l = line.toLowerCase();
          return l.includes('top') || l.includes('#') || l.includes('hạng') || l.includes('điểm') || l.includes('$');
        });

        if (detail.name.includes('head') || detail.name.includes('skull') || hasRankLore) {
          players.push({
            slot: s,
            itemName: detail.name,
            displayName: detail.displayName,
            lore: detail.lore,
            skinUrl: detail.skinUrl
          });
        }
      }

      console.log(`📊 Đã cào được ${players.length} người chơi trong bảng "${subTitleClean}".`);
      if (players.length > 0) {
        console.log(`   👑 Top 1: ${players[0].displayName}`);
        players[0].lore.forEach(l => console.log(`      └─ ${l}`));
      }

      resultData.categories[cat.name] = {
        slot: cat.slot,
        itemType: cat.name,
        categoryName: cat.displayName,
        subGuiTitle: subTitleClean,
        totalPlayers: players.length,
        players: players,
        rawItems: allItems
      };

      // Đóng sub-GUI hoặc bấm nút Back để về menu chính
      console.log('🔙 Đang thoát sub-GUI để về GUI chính...');
      if (backSlot !== -1) {
        console.log(`👉 Bấm nút Back (Slot #${backSlot})...`);
        try {
          bot.clickWindow(backSlot, 0, 0);
          await waitForGuiUpdate(bot, 1500);
        } catch (_) {}
      } else {
        try {
          bot.closeWindow(subWin);
        } catch (_) {}
        await sleep(800);
      }

      // Nghỉ nhẹ 1.2s giữa các lần cào
      await sleep(1200);
    }

    // 4. Lưu toàn bộ kết quả vào file JSON
    console.log('\n====================================================');
    console.log('💾 ĐANG GHI DỮ LIỆU CÀO ĐƯỢC VÀO FILE JSON...');
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(resultData, null, 2), 'utf8');
    console.log(`✅ ĐÃ LƯU THÀNH CÔNG TẠI: ${OUTPUT_FILE}`);
    console.log('====================================================\n');

    // In bảng tổng kết
    console.log('🎉 BẢNG TỔNG KẾT 11 HẠNG MỤC CÀO ĐƯỢC:');
    console.table(
      Object.values(resultData.categories).map(c => ({
        'Item ID': c.itemType,
        'Hạng Mục': c.categoryName,
        'Tiêu Đề Sub-GUI': c.subGuiTitle,
        'Số Người': c.totalPlayers,
        'Top 1': c.players[0] ? c.players[0].displayName : 'N/A'
      }))
    );

  } catch (err) {
    console.error('❌ Lỗi trong quá trình quét leaderboard:', err);
  } finally {
    console.log('\n👋 Hoàn tất script test. Đang ngắt kết nối bot...');
    try {
      bot.quit();
    } catch (_) {}
    process.exit(0);
  }
}

// Timeout an toàn 180 giây
setTimeout(() => {
  console.log('\n⏰ Timeout 180s! Tự động ngắt kết nối bot test...');
  try {
    bot.quit();
  } catch (_) {}
  process.exit(0);
}, 180000);
