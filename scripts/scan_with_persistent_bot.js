/**
 * scripts/scan_with_persistent_bot.js
 * @description Sử dụng chính PersistentBot của dự án để đảm bảo join chuẩn xác vào cụm Survival KingMC và khảo sát toàn bộ lệnh/tính năng.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PersistentBot = require('../mc-bot');

const OUTPUT_PATH = path.join(__dirname, '../debug/scanned_server_features.json');

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

const collectedData = {
  scanTime: new Date().toISOString(),
  botUsername: '',
  openedGUIs: [],
  discoveredCommands: [],
  commandResponses: {},
  chatLogs: []
};

// Tạo tài khoản ngẫu nhiên mới như PersistentBot yêu cầu
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let randUser = '';
let randPass = '';
for (let i = 0; i < 10; i++) {
  randUser += chars.charAt(Math.floor(Math.random() * chars.length));
  randPass += chars.charAt(Math.floor(Math.random() * chars.length));
}

collectedData.botUsername = randUser;

console.log('====================================================');
console.log('🔍 KHỞI ĐỘNG SCANNER BẰNG PERSISTENT-BOT (KINGMC)');
console.log(`🤖 Username: ${randUser} | Password: ${randPass}`);
console.log('====================================================\n');

const credentials = {
  username: randUser,
  authType: 'offline',
  password: randPass
};

const persistentBot = new PersistentBot(credentials, ['kingmc.vn', 'sgp.kingmc.vn'], 25565);
persistentBot.connect();

let scanStarted = false;

// Đợi bot khởi tạo Mineflayer instance
const initCheckInterval = setInterval(() => {
  if (persistentBot.bot && persistentBot.bot._client) {
    clearInterval(initCheckInterval);
    setupBotListeners(persistentBot.bot);
  }
}, 500);

function setupBotListeners(bot) {
  // Lắng nghe declare_commands
  bot._client.on('declare_commands', (packet) => {
    try {
      if (packet && packet.nodes && packet.rootIndex !== undefined) {
        const rootNode = packet.nodes[packet.rootIndex];
        if (rootNode && Array.isArray(rootNode.children)) {
          const cmdNames = [];
          for (const childIdx of rootNode.children) {
            const childNode = packet.nodes[childIdx];
            if (childNode && childNode.name) {
              cmdNames.push(childNode.name);
            }
          }
          console.log(`📡 [DECLARE_COMMANDS] Nhận ${cmdNames.length} lệnh từ Server!`);
          collectedData.discoveredCommands = Array.from(new Set([...collectedData.discoveredCommands, ...cmdNames]));
        }
      }
    } catch (e) {}
  });

  // Lắng nghe GUI mở
  bot.on('windowOpen', (win) => {
    const rawTitle = parseMinecraftJSON(win.title || '');
    const cleanTitle = cleanMinecraftText(rawTitle);
    console.log(`\n🔲 [GUI MỞ] Title: "${cleanTitle}" | Slots: ${win.slots.length}`);

    const items = [];
    for (let i = 0; i < win.slots.length; i++) {
      const it = win.slots[i];
      if (!it) continue;
      items.push({
        slot: i,
        id: it.name,
        displayName: it.displayName || null,
        customName: cleanMinecraftText(it.customName) || null,
        lore: extractLoreFromNBT(it.nbt)
      });
    }

    collectedData.openedGUIs.push({
      title: cleanTitle,
      slotsCount: win.slots.length,
      items: items
    });
  });

  bot.on('messagestr', (msg) => {
    const clean = cleanMinecraftText(msg);
    if (clean) {
      collectedData.chatLogs.push(`[${new Date().toLocaleTimeString()}] ${clean}`);
    }
  });
}

// Kiểm tra khi PersistentBot báo isReady (đã vào Survival và hoàn tất RTP)
const readyChecker = setInterval(async () => {
  if (persistentBot.isReady && !scanStarted && persistentBot.bot) {
    scanStarted = true;
    clearInterval(readyChecker);
    console.log('\n🟢 PERSISTENT-BOT ĐÃ SẴN SÀNG TRONG CỤM SURVIVAL!');
    await runCommandExploration(persistentBot.bot);
  }
}, 1000);

async function runCommandExploration(bot) {
  console.log('🚀 Bắt đầu gửi các câu lệnh thăm dò chức năng...');

  const commands = [
    '/help',
    '/menu',
    '/warp',
    '/jobs',
    '/quest',
    '/clan',
    '/ranks',
    '/top',
    '/market',
    '/trade',
    '/baltop',
    '/points',
    '/nap',
    '/chotroi',
    '/kit',
    '/shop'
  ];

  for (const cmd of commands) {
    console.log(`📤 Gửi lệnh: ${cmd}`);
    const logStart = collectedData.chatLogs.length;

    try {
      bot.chat(cmd);
    } catch (e) {
      console.warn('Lỗi chat:', e.message);
    }

    await sleep(3500);

    const responses = collectedData.chatLogs.slice(logStart);
    collectedData.commandResponses[cmd] = responses;

    // Đóng GUI nếu lệnh mở GUI để tránh kẹt
    if (bot.currentWindow) {
      try {
        bot.closeWindow(bot.currentWindow);
      } catch (e) {}
      await sleep(500);
    }
  }

  console.log('\n💾 Đang ghi toàn bộ kết quả vào file JSON...');
  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(collectedData, null, 2), 'utf8');
    console.log(`✅ Đã lưu kết quả thành công vào: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error('Lỗi ghi file output:', err.message);
  }

  console.log('👋 Hoàn tất quét! Tự động thoát.');
  try {
    bot.quit();
  } catch (e) {}
  process.exit(0);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Timeout an toàn sau 150 giây
setTimeout(() => {
  console.log('⏰ Timeout 150s! Lưu kết quả hiện có và thoát...');
  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(collectedData, null, 2), 'utf8');
  } catch (e) {}
  try {
    persistentBot.bot.quit();
  } catch (e) {}
  process.exit(0);
}, 150000);
