/**
 * scripts/scan_server_commands.js
 * @description Tự động join vào KingMC, vào cụm Survival chính, quét declare_commands, tabComplete và các lệnh/menu server.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');

const MC_SERVER_HOSTS = (process.env.MC_SERVER_HOSTS || 'kingmc.vn,sgp.kingmc.vn')
  .split(',')
  .map(h => h.trim())
  .filter(h => h.length > 0);
const MC_SERVER_PORT = parseInt(process.env.MC_SERVER_PORT) || 25565;

const USERNAME = process.env.MC_USERNAME || ('ScanBot_' + Math.floor(100 + Math.random() * 900));
const PASSWORD = process.env.MC_PASSWORD || 'KingMC123456';
const AUTH_TYPE = process.env.MC_AUTH_TYPE || 'offline';

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
  targetServer: `${MC_SERVER_HOSTS[0]}:${MC_SERVER_PORT}`,
  botUsername: USERNAME,
  lobbyMenu: [],
  survivalMenus: [],
  declareCommandsList: [],
  tabCompleteList: [],
  commandResponses: {},
  chatLogs: []
};

console.log('====================================================');
console.log('🔍 KHỞI ĐỘNG SCANNER LỆNH & TÍNH NĂNG KINGMC.VN');
console.log(`🤖 Bot: ${USERNAME} (${AUTH_TYPE})`);
console.log(`🌐 Server: ${MC_SERVER_HOSTS[0]}:${MC_SERVER_PORT}`);
console.log('====================================================\n');

const bot = mineflayer.createBot({
  host: MC_SERVER_HOSTS[0],
  port: MC_SERVER_PORT,
  username: USERNAME,
  auth: AUTH_TYPE,
  version: '1.20.1',
  checkTimeoutInterval: 60000
});

let isInSurvival = false;
let isEnteringSurvival = false;
let lastAuthTime = 0;
let explorationStarted = false;

// Bắt gói declare_commands từ server
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
        console.log(`📡 [DECLARE_COMMANDS] Nhận ${cmdNames.length} lệnh từ Server! (Đang ở: ${isInSurvival ? 'Cụm Survival' : 'Lobby'})`);
        collectedData.declareCommandsList = Array.from(new Set([...collectedData.declareCommandsList, ...cmdNames]));
      }
    }
  } catch (err) {
    console.warn('Lỗi declare_commands:', err.message);
  }
});

bot.on('messagestr', (message) => {
  const msg = cleanMinecraftText(message);
  if (!msg) return;
  console.log(`[Chat] ${msg}`);
  collectedData.chatLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

  const lower = msg.toLowerCase();

  // Xử lý đăng ký / đăng nhập với khoảng nghỉ an toàn
  if (lower.includes('/dk') || lower.includes('dang ky')) {
    if (Date.now() - lastAuthTime > 4000) {
      lastAuthTime = Date.now();
      console.log(`[Bot] Gửi lệnh đăng ký sau 1.5s...`);
      setTimeout(() => bot.chat(`/dk ${PASSWORD} ${PASSWORD}`), 1500);
    }
  } else if (lower.includes('/dn') || lower.includes('dang nhap') || lower.includes('vui long')) {
    if (Date.now() - lastAuthTime > 4000) {
      lastAuthTime = Date.now();
      console.log(`[Bot] Gửi lệnh đăng nhập sau 1.5s...`);
      setTimeout(() => bot.chat(`/dn ${PASSWORD}`), 1500);
    }
  }

  // Khi đăng nhập thành công: CHỜ 7 GIÂY (theo cơ chế chống spam của server)
  if (lower.includes('đăng nhập thành công') || lower.includes('dang nhap thanh cong') || lower.includes('phiên đăng nhập đã được kết nối')) {
    if (!isInSurvival && !isEnteringSurvival) {
      isEnteringSurvival = true;
      console.log('[Bot] ✅ Đăng nhập thành công! Đợi 7.0s an toàn rồi mở /menu để vào cụm Survival...');
      setTimeout(() => {
        console.log('[Bot] Đang gõ /menu...');
        bot.chat('/menu');
      }, 7000);
    }
  }
});

// Bắt mở GUI
bot.on('windowOpen', (win) => {
  const rawTitle = parseMinecraftJSON(win.title || '');
  const cleanTitle = cleanMinecraftText(rawTitle);
  console.log(`\n🔲 [GUI MỞ] Title: "${cleanTitle}" | Slots: ${win.slots.length}`);

  const items = [];
  for (let i = 0; i < win.slots.length; i++) {
    const item = win.slots[i];
    if (!item) continue;
    const itemLore = extractLoreFromNBT(item.nbt);
    items.push({
      slot: i,
      id: item.name,
      displayName: item.displayName || null,
      customName: cleanMinecraftText(item.customName) || null,
      lore: itemLore
    });
  }

  if (!isInSurvival) {
    collectedData.lobbyMenu.push({
      title: cleanTitle,
      items: items
    });

    console.log('[Bot] Đang đợi 3.0s rồi click slot 24 (Cụm Survival)...');
    setTimeout(() => {
      try {
        bot.clickWindow(24, 0, 0);
        isInSurvival = true;
        console.log('[Bot] ✅ Đã click slot 24! Đợi 8.0s để vào cụm Survival...');

        setTimeout(() => {
          if (!explorationStarted) {
            startSurvivalExploration();
          }
        }, 8000);
      } catch (e) {
        console.error('Lỗi click slot 24:', e.message);
      }
    }, 3000);
  } else {
    collectedData.survivalMenus.push({
      title: cleanTitle,
      items: items
    });
  }
});

async function startSurvivalExploration() {
  explorationStarted = true;
  console.log('\n====================================================');
  console.log('🚀 BẮT ĐẦU KHÁM PHÁ & QUÉT LỆNH TRONG CỤM SURVIVAL...');
  console.log('====================================================\n');

  // 1. Tab complete
  try {
    console.log('[1/4] Thử TabComplete danh sách lệnh "/"...');
    if (typeof bot.tabComplete === 'function') {
      bot.tabComplete('/', (err, matches) => {
        if (!err && matches) {
          const cleanMatches = matches.map(m => m.replace(/^\//, ''));
          console.log(`👉 TabComplete trả về ${cleanMatches.length} lệnh!`);
          collectedData.tabCompleteList = cleanMatches;
        }
      });
    }
  } catch (e) {
    console.warn('Lỗi tabComplete:', e.message);
  }

  await sleep(3500);

  // 2. Thử lần lượt các lệnh tính năng phổ biến (giãn cách 3.5s để an toàn tuyệt đối)
  const testCommands = [
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
    '/kit'
  ];

  console.log('[2/4] Kiểm tra phản hồi các lệnh tính năng chính...');
  for (const cmd of testCommands) {
    console.log(`📤 Thử lệnh: ${cmd}`);
    
    const currentLogsCount = collectedData.chatLogs.length;
    bot.chat(cmd);
    await sleep(3500);

    const responses = collectedData.chatLogs.slice(currentLogsCount);
    collectedData.commandResponses[cmd] = responses;

    // Đóng window nếu lệnh làm mở GUI để không cản các lệnh sau
    if (bot.currentWindow) {
      try {
        bot.closeWindow(bot.currentWindow);
      } catch (e) {}
      await sleep(500);
    }
  }

  console.log('[3/4] Đang tổng hợp toàn bộ kết quả quét...');
  await sleep(2000);

  // Ghi file JSON
  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(collectedData, null, 2), 'utf8');
    console.log(`\n💾 Đã lưu dữ liệu quét đầy đủ vào: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error('Lỗi ghi file output:', err.message);
  }

  console.log('✅ Quét hoàn tất thành công! Đang ngắt kết nối bot...');
  try { bot.quit(); } catch (e) {}
  process.exit(0);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Timeout an toàn
setTimeout(() => {
  console.log('⏰ Hết thời gian chờ (120s). Lưu dữ liệu và thoát bot...');
  try {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(collectedData, null, 2), 'utf8');
  } catch (e) {}
  try { bot.quit(); } catch (e) {}
  process.exit(0);
}, 120000);
