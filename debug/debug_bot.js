/**
 * debug/debug_bot.js - Interactive Minecraft GUI Debug Bot
 * @description Bot Mineflayer tương tác CLI giúp soi thông tin NBT, CustomName, Lore của từng vật phẩm trong GUI.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mineflayer = require('mineflayer');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Setup đường dẫn lưu log GUI JSON
const LOG_DUMP_PATH = path.join(__dirname, 'last_gui_dump.json');

// Cấu hình kết nối từ .env hoặc mặc định
const HOST = (process.env.MC_HOSTS || 'kingmc.vn').split(',')[0].trim();
const PORT = parseInt(process.env.MC_PORT) || 25565;
const USERNAME = process.env.MC_USERNAME || `DebugBot_${Math.floor(Math.random() * 1000)}`;
const AUTH = process.env.MC_AUTH_TYPE === 'microsoft' ? 'microsoft' : 'offline';

console.log('----------------------------------------------------');
console.log('🛠️  MINECRAFT GUI DEBUG BOT INTERACTIVE TOOL');
console.log('----------------------------------------------------');
console.log(`📡 Server: ${HOST}:${PORT}`);
console.log(`👤 Username: ${USERNAME} (${AUTH})`);
console.log(`💾 Dump log file: ${LOG_DUMP_PATH}`);
console.log('----------------------------------------------------\n');

// Hàm hỗ trợ serialize NBT Tag thành Object JSON sạch dễ đọc
function simplifyNBT(nbt) {
  if (!nbt) return null;
  
  if (typeof nbt !== 'object') return nbt;
  if (nbt.type && nbt.value !== undefined) {
    return simplifyNBT(nbt.value);
  }
  
  if (Array.isArray(nbt)) {
    return nbt.map(simplifyNBT);
  }

  const result = {};
  for (const key of Object.keys(nbt)) {
    const val = nbt[key];
    if (val && typeof val === 'object' && val.value !== undefined) {
      result[key] = simplifyNBT(val.value);
    } else {
      result[key] = simplifyNBT(val);
    }
  }
  return result;
}

// Giải mã NBT Lore
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
    return String(content);
  });
}

// Khởi tạo Bot Mineflayer
console.log('⌛ Đang kết nối tới server Minecraft...');
const bot = mineflayer.createBot({
  host: HOST,
  port: PORT,
  username: USERNAME,
  auth: AUTH,
  version: '1.20.1'
});

let lastOpenedWindow = null;
let lastDumpData = null;

// Lắng nghe sự kiện kết nối thành công
bot.once('spawn', () => {
  console.log('\n✅ [BOT] Spawn vào server thành công!');
  console.log('💡 HƯỚNG DẪN TƯƠNG TÁC:');
  console.log('  • Gõ lệnh chat trực tiếp (VD: /order tri, /ah elytra, /menu, /warp afk)');
  console.log('  • Gõ "click <slot>" để nhấp vào ô slot trong GUI đang mở (VD: click 10)');
  console.log('  • Gõ "close" để đóng GUI hiện tại');
  console.log('  • Gõ "dump" để in lại thông tin GUI vừa mở');
  console.log('  • Gõ "quit" hoặc "exit" để ngắt kết nối bot\n');
  setupReadline();
});

bot.on('error', (err) => {
  console.error('❌ [BOT LỖI]:', err.message);
});

bot.on('kicked', (reason) => {
  console.warn('⚠️ [BOT BỊ KICK]:', typeof reason === 'string' ? reason : JSON.stringify(reason));
});

bot.on('message', (jsonMsg) => {
  const msgStr = jsonMsg.toString().trim();
  if (msgStr) {
    console.log(`💬 [CHAT]: ${msgStr}`);
  }
});

// Lắng nghe sự kiện MỞ WINDOW GUI
bot.on('windowOpen', (window) => {
  lastOpenedWindow = window;
  const title = window.title ? (typeof window.title === 'string' ? window.title : JSON.stringify(window.title)) : 'GUI không tiêu đề';
  
  console.log('\n====================================================');
  console.log(`🔲 [GUI MỞ DETECTED] Title: "${title}" | Slots: ${window.slots.length} | Type: ${window.type}`);
  console.log('====================================================');

  const itemsDump = [];

  for (let i = 0; i < window.slots.length; i++) {
    const item = window.slots[i];
    if (!item) continue;

    const rawNbtClean = simplifyNBT(item.nbt);
    const extractedLore = extractLoreFromNBT(item.nbt);

    const itemDetail = {
      slot: i,
      id: item.name,
      count: item.count,
      displayName: item.displayName || null,
      customName: item.customName || null,
      customLore: item.customLore || null,
      extractedLore: extractedLore,
      nbt: rawNbtClean
    };

    itemsDump.push(itemDetail);

    // In tóm tắt ra Console với màu sắc rõ ràng
    console.log(`\n📌 [Slot #${i}] ID: \x1b[36m${item.name}\x1b[0m | Count: \x1b[33m${item.count}\x1b[0m`);
    console.log(`   ├─ displayName : "${item.displayName || ''}"`);
    if (item.customName) {
      console.log(`   ├─ customName  : \x1b[32m"${item.customName}"\x1b[0m`);
    }
    if (extractedLore.length > 0) {
      console.log(`   ├─ Lore (${extractedLore.length} lines):`);
      extractedLore.forEach((line, idx) => {
        console.log(`   │    [${idx + 1}] \x1b[90m${line}\x1b[0m`);
      });
    }
    if (rawNbtClean) {
      console.log(`   └─ NBT Raw:`, JSON.stringify(rawNbtClean).substring(0, 150) + (JSON.stringify(rawNbtClean).length > 150 ? '...' : ''));
    }
  }

  console.log('\n====================================================');
  console.log(`✨ Đã ghi tổng cộng ${itemsDump.length} vật phẩm.`);

  lastDumpData = {
    timestamp: new Date().toISOString(),
    windowTitle: title,
    windowType: window.type,
    totalSlots: window.slots.length,
    itemCount: itemsDump.length,
    items: itemsDump
  };

  try {
    fs.writeFileSync(LOG_DUMP_PATH, JSON.stringify(lastDumpData, null, 2), 'utf8');
    console.log(`💾 Đã tự động lưu dump JSON đầy đủ vào: \x1b[32m${LOG_DUMP_PATH}\x1b[0m`);
  } catch (err) {
    console.error('❌ Lỗi lưu file JSON dump:', err.message);
  }
  console.log('====================================================\n');
});

bot.on('windowClose', (window) => {
  console.log('🚪 [GUI ĐÃ ĐÓNG]');
  lastOpenedWindow = null;
});

// Setup Readline Interface cho Terminal Console
function setupReadline() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[35m[MC-DEBUG]>\x1b[0m '
  });

  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    const lower = input.toLowerCase();

    if (lower === 'quit' || lower === 'exit') {
      console.log('👋 Đang ngắt kết nối bot...');
      bot.quit();
      process.exit(0);
    }

    if (lower === 'close') {
      if (bot.currentWindow) {
        bot.closeWindow(bot.currentWindow);
        console.log('🚪 Đã gửi lệnh đóng window.');
      } else {
        console.log('⚠️ Không có window nào đang mở.');
      }
      rl.prompt();
      return;
    }

    if (lower.startsWith('click ')) {
      const slotNum = parseInt(input.split(' ')[1]);
      if (!isNaN(slotNum) && bot.currentWindow) {
        try {
          bot.clickWindow(slotNum, 0, 0);
          console.log(`🖱️ Đã click slot #${slotNum}`);
        } catch (e) {
          console.error(`❌ Lỗi click slot #${slotNum}:`, e.message);
        }
      } else {
        console.log('⚠️ Vui lòng mở window trước hoặc nhập đúng số slot (VD: click 10)');
      }
      rl.prompt();
      return;
    }

    if (lower === 'dump') {
      if (lastDumpData) {
        console.log('\n📋 [DUMP DỮ LIỆU GUI GẦN NHẤT]:');
        console.log(JSON.stringify(lastDumpData, null, 2));
      } else {
        console.log('⚠️ Chưa có dữ liệu dump GUI nào.');
      }
      rl.prompt();
      return;
    }

    // Mặc định: Gửi câu lệnh chat tới Minecraft Server
    console.log(`📤 Gửi chat/lệnh: "${input}"`);
    bot.chat(input);

    rl.prompt();
  });
}
