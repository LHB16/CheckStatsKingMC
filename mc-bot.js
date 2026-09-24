/**
 * mc-bot.js - Persistent Minecraft Bot
 * @description Quản lý một session bot cắm liên tục (AFK) với các tính năng auto-reconnect, chạy macro /menu, lấy stats và lấy order.
 */

const mineflayer = require('mineflayer');
const EventEmitter = require('events');
const skinHelper = require('./helpers/skinHelper');

// Hàm loại bỏ mã màu Minecraft (§a, &a, &#RRGGBB, §x..., v.v.)
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

// Chuẩn hóa phông chữ Small Caps độc lạ của Server Minecraft (ví dụ: đơɴ ʜàɴɢ ᴄủᴀ -> don hang cua)
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

// Helper gen chuỗi ngẫu nhiên 10 ký tự (chữ hoa, chữ thường, số)
function generateRandomUsername(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Hàm làm sạch tên người đặt đơn hàng (loại bỏ mọi tiền tố "Đơn hàng của", "ĐƠN HÀNG CỦA", "đơɴ ʜàɴɢ ᴄủᴀ",...)
function cleanBuyerName(str) {
  if (!str) return 'Ẩn danh';
  let cleanText = cleanMinecraftText(str);
  let normalized = normalizeSmallCaps(cleanText);

  const prefixMatch = normalized.match(/^(?:don\s*hang|order)?(?:\s*cua|\s*of|:|\s)*\s*/iu);
  if (prefixMatch && prefixMatch[0].length > 0) {
    const prefixLen = prefixMatch[0].length;
    let buyerPart = cleanText.substring(prefixLen).trim();
    buyerPart = buyerPart.replace(/^[:\-\s#]+/, '').trim();
    if (buyerPart) return buyerPart;
  }

  cleanText = cleanText.replace(/^(?:đơn\s*hàng|don\s*hang|order)?(?:\s*của|\s*cua|:|\s)*\s*/iu, '').trim();
  cleanText = cleanText.replace(/^[:\-\s#]+/, '').trim();
  return cleanText || 'Ẩn danh';
}

// Map tên màu Minecraft sang mã §
const MC_COLOR_CODES = {
  'black': '§0', 'dark_blue': '§1', 'dark_green': '§2', 'dark_aqua': '§3',
  'dark_red': '§4', 'dark_purple': '§5', 'gold': '§6', 'gray': '§7',
  'dark_gray': '§8', 'blue': '§9', 'green': '§a', 'aqua': '§b',
  'red': '§c', 'light_purple': '§d', 'yellow': '§e', 'white': '§f'
};

// Hàm parse chuẩn Minecraft JSON Text Component (có đệ quy đọc extra, text và gắn mã màu)
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
    const jsonMatch = str.match(/^(.*?)\s*(\{(?:[^{}]|"*")*\})\s*$/);
    if (jsonMatch) {
      const prefixText = jsonMatch[1].trim();
      try {
        const parsedJson = JSON.parse(jsonMatch[2]);
        const innerText = parseMinecraftJSON(parsedJson);
        if (innerText) return (prefixText ? prefixText + ' ' : '') + innerText;
      } catch (e) {}
      if (prefixText) str = prefixText;
    }
    return str.replace(/\{"color".*?\}/gi, '').trim();
  }

  if (Array.isArray(input)) {
    return input.map(i => parseMinecraftJSON(i)).join('');
  }

  if (typeof input === 'object') {
    let result = '';
    let colorPrefix = '';

    if (input.color && MC_COLOR_CODES[input.color]) {
      colorPrefix = MC_COLOR_CODES[input.color];
    }
    
    if (input.value !== undefined && typeof input.value === 'string') {
      try {
        const obj = JSON.parse(input.value);
        return colorPrefix + parseMinecraftJSON(obj);
      } catch (e) {
        result = String(input.value);
      }
    }

    if (input[''] !== undefined) {
      if (typeof input[''] === 'string') result += input[''];
      else if (typeof input[''] === 'object' && input[''].value) result += String(input[''].value);
    }
    
    if (input.text !== undefined) {
      if (typeof input.text === 'string') result += input.text;
      else if (typeof input.text === 'object' && input.text.value) result += String(input.text.value);
    }
    
    if (input.extra && Array.isArray(input.extra)) {
      result += parseMinecraftJSON(input.extra);
    }
    
    result = result.replace(/\{"color".*?\}/gi, '').trim();
    return result ? (colorPrefix + result) : '';
  }
  
  return String(input).replace(/\{"color".*?\}/gi, '').trim();
}

// Helper giải mã NBT/Component chứa Lore của vật phẩm trong Mineflayer
function extractLoreFromNbt(nbt) {
  if (!nbt) return [];
  
  const root = nbt.value || nbt;
  let rawLore = null;
  
  if (root.display) {
    const displayVal = root.display.value || root.display;
    if (displayVal) {
      rawLore = displayVal.lore || displayVal.Lore;
    }
  }
  
  if (!rawLore && root['minecraft:lore']) {
    rawLore = root['minecraft:lore'];
  }
  if (!rawLore && root.lore) {
    rawLore = root.lore;
  }
  
  if (!rawLore) return [];
  
  let lines = rawLore.value !== undefined ? rawLore.value : rawLore;
  if (lines && lines.value !== undefined) {
    lines = lines.value;
  }
  if (typeof lines === 'string') lines = [lines];
  if (!Array.isArray(lines)) return [];
  
  return lines.map(line => {
    let content = line;
    if (line && typeof line === 'object' && line.value !== undefined) {
      content = line.value;
    }
    return parseMinecraftJSON(content);
  }).filter(Boolean);
}

// Hàm sinh Username ngẫu nhiên
function generateRandomUsername(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper đợi sự kiện GUI trang mới mở ra (windowOpen) hoặc các slot được cập nhật (updateSlot)
function waitForGuiUpdate(bot, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let isResolved = false;
    let debounceTimer = null;
    let timeoutTimer = null;

    const cleanup = () => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      bot.removeListener('windowOpen', onWindowOpen);
      if (bot.currentWindow) {
        bot.currentWindow.removeListener('updateSlot', onSlotUpdate);
      }
    };

    const done = () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve();
    };

    timeoutTimer = setTimeout(() => {
      done();
    }, timeoutMs);

    const onWindowOpen = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(done, 150);
    };

    const onSlotUpdate = (slot) => {
      if (slot >= 0 && slot < 45) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(done, 150);
      }
    };

    bot.once('windowOpen', onWindowOpen);
    if (bot.currentWindow) {
      bot.currentWindow.on('updateSlot', onSlotUpdate);
    }
  });
}

class PersistentBot extends EventEmitter {
  constructor(credentials, hosts, port) {
    super();
    this.credentials = credentials;
    this.hosts = hosts;
    this.port = port;
    this.currentHostIndex = 0;
    
    this.bot = null;
    this.reconnectTimeout = null;
    
    // Trạng thái AFK và Ready Check
    this.afkRoutineRunning = false;
    this.afkTimers = [];
    this.isBotOnline = false;
    this.isReady = false;

    // Trạng thái Yêu cầu (Stats / Bal / Order)
    this.statsPromiseResolve = null;
    this.statsPromiseReject = null;
    this.statsTimeout = null;
    this.targetPlayer = null;
    this.currentAction = null; // 'stats' | 'bal' | 'order'
    this.isProcessingOrder = false;
  }

  connect() {
    this.clearAllTimers();
    this.isBotOnline = false;
    this.isReady = false;

    const host = this.hosts[this.currentHostIndex];
    console.log(`[MC-Bot] Đang kết nối tới ${host}:${this.port}...`);

    const options = {
      host: host,
      port: this.port,
      username: this.credentials.username,
      version: '1.20.1'
    };

    if (this.credentials.authType === 'microsoft') {
      options.auth = 'microsoft';
    } else {
      options.auth = 'offline';
    }

    try {
      this.bot = mineflayer.createBot(options);
      this.authSent = false;
    } catch (e) {
      console.error(`[MC-Bot] Lỗi khởi tạo mineflayer: ${e.message}`);
      this.scheduleReconnect();
      return;
    }

    this.registerEvents();
  }

  registerEvents() {
    this.bot.on('error', (err) => {
      console.error(`[MC-Bot] Lỗi kết nối: ${err.message}`);
    });

    this.bot.on('kicked', (reason) => {
      const reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
      const cleanReason = cleanMinecraftText(reasonText);
      console.warn(`[MC-Bot] Bị kick: ${cleanReason}`);

      const lowerReason = cleanReason.toLowerCase();
      if (lowerReason.includes('ban') || lowerReason.includes('banned') || lowerReason.includes('bị cấm') || lowerReason.includes('bi cam') || lowerReason.includes('bị ban') || lowerReason.includes('bi ban')) {
        this.emit('banDetected', { username: this.credentials.username, reason: cleanReason });
      } else {
        this.emit('notifyAdmin', `⚠️ **Worker [\`${this.credentials.username}\`]** bị kick khỏi server! Lý do: \`${cleanReason}\``);
      }
    });

    this.bot.on('end', (reason) => {
      this.isBotOnline = false;
      this.isReady = false;
      console.log(`[MC-Bot] Mất kết nối. Đang lên lịch Reconnect sau 10 giây...`);
      this.emit('notifyAdmin', `🔴 **Worker [\`${this.credentials.username}\`]** mất kết nối. Đang chờ reconnect sau 10 giây...`);
      this.currentHostIndex = (this.currentHostIndex + 1) % this.hosts.length;
      
      if (this.statsPromiseReject) {
        this.statsPromiseReject(new Error('Bot bị ngắt kết nối đột ngột trong lúc lấy dữ liệu.'));
        this.cleanupStatsState();
      }

      this.scheduleReconnect();
    });

    this.bot.once('spawn', () => {
      this.isBotOnline = true;
      this.isReady = false;
      console.log(`[MC-Bot] Đã spawn vào server thành công! Bắt đầu kịch bản AFK.`);

      // Quét toàn bộ người chơi hiện có trong Tablist khi vừa spawn
      try {
        if (this.bot.players) {
          let tabCount = 0;
          for (const [uname, p] of Object.entries(this.bot.players)) {
            if (p && p.username && p.skinData && p.skinData.url) {
              skinHelper.saveSkin(p.username, p.skinData.url, p.skinData.model);
              tabCount++;
            }
          }
          if (tabCount > 0) {
            console.log(`[MC-Bot] 🎭 Đã quét và nạp ${tabCount} skin từ Tablist khi vừa vào server.`);
          }
        }
      } catch (err) {
        console.warn(`[MC-Bot] Lỗi khi quét Tablist ban đầu: ${err.message}`);
      }

      this.startAfkRoutine();
    });

    // Lắng nghe sự kiện người chơi vào server hoặc cập nhật Tablist để gom skin 24/7
    this.bot.on('playerJoined', (player) => {
      if (player && player.username && player.skinData && player.skinData.url) {
        skinHelper.saveSkin(player.username, player.skinData.url, player.skinData.model);
      }
    });

    this.bot.on('playerUpdated', (player) => {
      if (player && player.username && player.skinData && player.skinData.url) {
        skinHelper.saveSkin(player.username, player.skinData.url, player.skinData.model);
      }
    });

    this.bot.on('death', () => {
      console.log(`[MC-Bot] Bot đã chết. Đang chờ hồi sinh và thực hiện lại /rtp sau 5 giây...`);
      const deathTimer = setTimeout(() => {
        if (this.isBotOnline) {
          this.performRtp();
        }
      }, 5000);
      this.afkTimers.push(deathTimer);
    });

      // Lắng nghe tin nhắn từ server để tự động đăng nhập & phát hiện bị đá ra lobby / bị ban
    this.bot.on('message', (jsonMsg) => {
      const msgText = jsonMsg.toString();
      const cleanMsg = cleanMinecraftText(msgText);
      console.log(`[MC-Bot Chat] ${cleanMsg}`);
      const lowerMsg = cleanMsg.toLowerCase();
      
      // Bỏ qua các thông báo hệ thống / nội quy mặc định của KingMC
      const isSystemNotice = lowerMsg.includes('điều này là bị cấm') || 
                             lowerMsg.includes('dieu nay la bi cam') || 
                             lowerMsg.includes('điều này bị cấm') || 
                             lowerMsg.includes('dieu nay bi cam');
      
      // Kiểm tra xem có tin nhắn báo bị ban hay không
      if (!isSystemNotice && (lowerMsg.includes('ban') || lowerMsg.includes('banned') || lowerMsg.includes('bị cấm') || lowerMsg.includes('bi cam') || lowerMsg.includes('bị ban') || lowerMsg.includes('bi ban'))) {
        if (lowerMsg.includes('permanently') || lowerMsg.includes('bị cấm') || lowerMsg.includes('bị ban') || lowerMsg.includes('phạt cấm') || lowerMsg.includes('you are banned')) {
          console.warn(`[MC-Bot] 🚨 ĐÃ PHÁT HIỆN THÔNG BÁO BỊ BAN: ${cleanMsg}`);
          
          const oldName = this.credentials.username;
          // Random tên 100% (độ dài ngẫu nhiên từ 8 - 14 ký tự)
          const newName = generateRandomUsername(Math.floor(Math.random() * 7) + 8);
          this.credentials.username = newName;
          
          this.emit('banDetected', { 
             oldUsername: oldName,
             newUsername: newName,
             password: this.credentials.password,
             reason: cleanMsg 
          });
          
          if (this.bot) this.bot.end('Reconnecting due to ban');
        }
      }

      // Kiểm tra từ khóa "kingmc.vn" kết hợp với check toạ độ (Lobby)
      if (lowerMsg.includes('kingmc.vn')) {
        const pos = this.bot.entity ? this.bot.entity.position : null;
        let isLobby = false;

        if (pos) {
           const dx = Math.abs(pos.x - 0.50);
           const dy = Math.abs(pos.y - 41.00);
           const dz = Math.abs(pos.z - 0.80);
           // Sai số khoảng 2 block
           if (dx <= 2.0 && dy <= 2.0 && dz <= 2.0) {
              isLobby = true;
           } else {
              console.log(`[MC-Bot] Có chữ kingmc.vn nhưng Toạ độ không phải Lobby (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}). Bỏ qua...`);
           }
        }

        if (isLobby) {
          if (!this.lastAuthTime || Date.now() - this.lastAuthTime > 5000) {
            this.lastAuthTime = Date.now();
            console.log(`[MC-Bot] ⚠️ Đã xác nhận đang ở Lobby (Toạ độ + chat). Chuyển bot sang trạng thái BẬN và gõ /dn...`);
            
            this.isReady = false; // Đặt bot ở trạng thái bận
            this.clearAllTimers(); // Hủy các timer AFK cũ
  
            if (this.statsPromiseReject) {
              this.statsPromiseReject(new Error('Bot bị chuyển về lobby (yêu cầu đăng nhập lại).'));
              this.cleanupStatsState();
            }
  
            if (this.credentials.password) {
              this.bot.chat(`/dn ${this.credentials.password}`);
              
              // Đợi 2.5s rồi khởi chạy lại kịch bản AFK (gõ /menu, click slot 24, /warp afk)
              const afkTimer = setTimeout(() => {
                console.log(`[MC-Bot] Đã xong gõ /dn. Bắt đầu lại kịch bản click GUI chọn server...`);
                this.startAfkRoutine();
              }, 2500);
              this.afkTimers.push(afkTimer);
            }
          }
        }
        return;
      }

      // Tự động Login/Register tiêu chuẩn
      if (this.credentials.password) {
        if (lowerMsg.includes('/dk') || lowerMsg.includes('dang ky bang lenh') || lowerMsg.includes('dang ky') || lowerMsg.includes('/register')) {
          if (!this.lastAuthTime || Date.now() - this.lastAuthTime > 3000) {
            console.log(`[MC-Bot] Server yêu cầu đăng ký. Gửi lệnh /register...`);
            this.bot.chat(`/register ${this.credentials.password} ${this.credentials.password}`);
            this.lastAuthTime = Date.now();
          }
        } else if (lowerMsg.includes('/dn') || lowerMsg.includes('vui long') || lowerMsg.includes('dang nhap') || lowerMsg.includes('/login')) {
          if (!this.lastAuthTime || Date.now() - this.lastAuthTime > 3000) {
            console.log(`[MC-Bot] Server yêu cầu đăng nhập. Gửi lệnh /login...`);
            this.bot.chat(`/login ${this.credentials.password}`);
            this.lastAuthTime = Date.now();
          }
        }
      }
    });

    // Lắng nghe khi GUI mở (để lấy stats hoặc order)
    this.bot.on('windowOpen', (window) => {
      const title = parseMinecraftJSON(window.title || '');
      
      if (!this.targetPlayer) return;

      console.log(`[MC-Bot] GUI Mở: "${title}" (Action: ${this.currentAction}), Đang trích xuất dữ liệu...`);

      if (this.currentAction === 'online') {
        let foundHeadItem = null;
        let extractedSkin = null;
        const maxSlots = Math.min(window.inventoryStart || 45, window.slots.length);

        for (let i = 0; i < maxSlots; i++) {
          const item = window.slots[i];
          if (!item) continue;

          // Trích xuất Skin từ NBT của vật phẩm Head trong GUI TPA
          if (item.nbt) {
            try {
              const skinData = skinHelper.extractSkinDataFromNbt(item.nbt);
              if (skinData && skinData.url) {
                console.log(`[MC-Bot] 🎭 Đã bóc tách thành công Skin từ GUI TPA cho [${this.targetPlayer}]: ${skinData.url}`);
                skinHelper.saveSkin(this.targetPlayer, skinData.url, skinData.model);
                extractedSkin = skinData;
              }
            } catch (err) {
              console.warn(`[MC-Bot] Lỗi khi bóc tách Skin NBT: ${err.message}`);
            }
          }

          let displayName = item.displayName || '';
          if (item.customName) displayName = item.customName;
          displayName = parseMinecraftJSON(displayName);

          let loreArray = [];
          if (item.customLore) {
            loreArray = item.customLore.map(l => parseMinecraftJSON(l));
          } else {
            loreArray = extractLoreFromNbt(item.nbt);
          }

          const itemStr = (item.name || '') + ' ' + displayName + ' ' + loreArray.join(' ');
          if (item.name.includes('head') || item.name.includes('skull') || itemStr.toLowerCase().includes('world') || itemStr.includes('ms)')) {
            foundHeadItem = {
              displayName,
              lore: loreArray
            };
            break;
          }
        }

        if (!foundHeadItem) {
          for (let i = 0; i < maxSlots; i++) {
            const item = window.slots[i];
            if (!item) continue;
            let displayName = item.displayName || '';
            if (item.customName) displayName = item.customName;
            displayName = parseMinecraftJSON(displayName);
            let loreArray = item.customLore ? item.customLore.map(l => parseMinecraftJSON(l)) : extractLoreFromNbt(item.nbt);
            
            const fullText = (displayName + ' ' + loreArray.join(' ')).toLowerCase();
            if (fullText.includes('world')) {
              foundHeadItem = { displayName, lore: loreArray };
              break;
            }
          }
        }

        let ping = 'N/A';
        let world = 'N/A';
        let playerName = this.targetPlayer;

        // Helper bóc tách tên World từ câu chữ bất kỳ
        const parseWorldFromText = (text) => {
          if (!text) return null;
          const clean = cleanMinecraftText(text).trim();
          if (!clean) return null;

          // Mẫu 1: Dạng "WORLD world_the_end" hoặc "WORLD world" hoặc "WORLD: nether"
          const m1 = clean.match(/WORLD[:\s]+([a-zA-Z0-9_\-]+)/i);
          if (m1 && m1[1]) {
            let res = m1[1].trim();
            if (res.startsWith('_')) res = 'world' + res;
            return res;
          }

          // Mẫu 2: Dạng chứa từ "world"
          const lower = clean.toLowerCase();
          if (lower.includes('world')) {
            const idx = lower.indexOf('world');
            if (idx !== -1) {
              let after = clean.substring(idx + 5).replace(/^[:\s\-=]+/, '').trim();
              if (after) {
                let first = after.split(/\s+/)[0];
                if (first.startsWith('_')) first = 'world' + first;
                return first;
              }
              return 'world';
            }
          }
          return null;
        };

        if (foundHeadItem) {
          const fullText = foundHeadItem.displayName + ' ' + foundHeadItem.lore.join(' ');

          const pingMatch = fullText.match(/(\d+\s*ms)/i);
          if (pingMatch) {
            ping = pingMatch[1];
          }

          for (const line of [foundHeadItem.displayName, ...foundHeadItem.lore]) {
            const w = parseWorldFromText(line);
            if (w) {
              world = w;
              break;
            }
          }

          if (foundHeadItem.displayName) {
            let cleanName = cleanMinecraftText(foundHeadItem.displayName).replace(/\s*\(\d+\s*ms\).*/i, '').trim();
            if (cleanName) playerName = cleanName;
          }
        }

        // Fallback: Quét toàn bộ GUI nếu world vẫn là N/A
        if (world === 'N/A') {
          for (let i = 0; i < maxSlots; i++) {
            const item = window.slots[i];
            if (!item) continue;
            let displayName = item.displayName || '';
            if (item.customName) displayName = item.customName;
            displayName = parseMinecraftJSON(displayName);
            let loreArray = item.customLore ? item.customLore.map(l => parseMinecraftJSON(l)) : extractLoreFromNbt(item.nbt);

            for (const line of [displayName, ...loreArray]) {
              const w = parseWorldFromText(line);
              if (w) {
                world = w;
                break;
              }
            }
            if (world !== 'N/A') break;
          }
        }

        if (this.statsPromiseResolve) {
          const finalSkin = extractedSkin || skinHelper.getSkin(playerName) || skinHelper.findSkinInTablist(this.bot, playerName);
          if (finalSkin && finalSkin.url) {
            skinHelper.saveSkin(playerName, finalSkin.url, finalSkin.model);
          }

          this.statsPromiseResolve({
            online: true,
            player: playerName,
            ping: ping,
            world: world,
            skin: finalSkin || null
          });

          if (this.bot && this.isBotOnline) {
            this.bot.closeWindow(window);
          }
          this.cleanupStatsState();
        }
        return;
      }

      if (this.currentAction === 'order') {
        this.handleOrderWindow(window);
        return;
      }

      if (this.currentAction === 'ah') {
        if (this.onAhMessageListener && this.bot) {
          this.bot.removeListener('messagestr', this.onAhMessageListener);
          this.onAhMessageListener = null;
        }

        // Trích xuất vật phẩm đấu giá từ GUI 6x9 (Chỉ quét 45 ô đầu: hàng 1 đến 5, bỏ qua hàng 6 chức năng)
        const scanAh = () => {
          const items = [];
          const maxAhSlots = Math.min(45, window.inventoryStart || 45);

          for (let i = 0; i < maxAhSlots; i++) {
            const item = window.slots[i];
            if (!item) continue;

            let displayName = item.displayName || '';
            if (item.customName) displayName = item.customName;
            displayName = parseMinecraftJSON(displayName);

            // Bỏ qua item trang trí/kính/barrier/air
            const nameLower = (item.name || '').toLowerCase();
            if (nameLower.includes('pane') || nameLower === 'air' || nameLower === 'barrier') continue;

            let loreArray = [];
            if (item.customLore) {
              loreArray = item.customLore.map(l => parseMinecraftJSON(l));
            } else {
              loreArray = extractLoreFromNbt(item.nbt);
            }

            if (loreArray.length === 0) continue;

            let price = '';
            let seller = '';
            let expiration = '';

            for (const line of loreArray) {
              const cleanLine = cleanMinecraftText(line).trim();
              const lowerLine = cleanLine.toLowerCase();

              // Trích xuất Giá mỗi item (Ví dụ: giá: $ 638M)
              if (!price) {
                if (lowerLine.includes('giá') || lowerLine.includes('gia') || lowerLine.includes('$')) {
                  if (cleanLine.includes(':')) {
                    price = cleanLine.split(':').slice(1).join(':').trim();
                  } else if (cleanLine.includes('$')) {
                    const dollarIndex = cleanLine.indexOf('$');
                    price = cleanLine.substring(dollarIndex).trim();
                  }
                }
              }

              // Trích xuất Người bán (Ví dụ: người bán: KhoaCoCaiNjt)
              if (!seller) {
                if (lowerLine.includes('người bán') || lowerLine.includes('nguoi ban') || lowerLine.includes('seller')) {
                  if (cleanLine.includes(':')) {
                    seller = cleanLine.split(':').slice(1).join(':').trim();
                  }
                }
              }

              // Trích xuất Thời gian hết hạn (Ví dụ: hết hạn vào: 2 ngày)
              if (!expiration) {
                if (lowerLine.includes('hết hạn') || lowerLine.includes('het han') || lowerLine.includes('expire')) {
                  if (cleanLine.includes(':')) {
                    expiration = cleanLine.split(':').slice(1).join(':').trim();
                  }
                }
              }
            }

            items.push({
              slot: i,
              itemName: item.name,
              displayName: displayName,
              price: price || 'N/A',
              seller: seller || 'Ẩn danh',
              expiration: expiration || null,
              lore: loreArray
            });
          }
          return items;
        };

        const finishAh = (ahItems) => {
          if (this.statsPromiseResolve) {
            this.statsPromiseResolve({
              success: true,
              serverUsed: `${this.hosts[this.currentHostIndex]}:${this.port}`,
              title: title,
              items: ahItems
            });

            if (this.bot && this.isBotOnline) {
              try { this.bot.closeWindow(window); } catch(e) {}
            }
            this.cleanupStatsState();
          }
        };

        const initialItems = scanAh();
        if (initialItems.length > 0) {
          finishAh(initialItems);
        } else {
          // Nếu packet window_items tới trễ, đợi 250ms để nạp slot rồi quét lại
          setTimeout(() => {
            const retryItems = scanAh();
            finishAh(retryItems);
          }, 250);
        }
        return;
      }

      // Xử lý mặc định cho GUI Stats
      const statsItems = [];
      for (let i = 0; i < window.inventoryStart; i++) {
        const item = window.slots[i];
        if (!item) continue;

        let displayName = item.displayName || '';
        if (item.customName) displayName = item.customName;
        displayName = parseMinecraftJSON(displayName);

        let loreArray = [];
        if (item.customLore) {
          loreArray = item.customLore.map(l => parseMinecraftJSON(l));
        } else {
          loreArray = extractLoreFromNbt(item.nbt);
        }

        statsItems.push({
          slot: i,
          name: item.name,
          displayName: displayName,
          lore: loreArray
        });
      }

      if (statsItems.length > 0 && this.statsPromiseResolve) {
        const playerSkin = skinHelper.getSkin(this.targetPlayer) || skinHelper.findSkinInTablist(this.bot, this.targetPlayer);
        this.statsPromiseResolve({
          success: true,
          serverUsed: `${this.hosts[this.currentHostIndex]}:${this.port}`,
          title: title,
          items: statsItems,
          skin: playerSkin || null
        });
        
        if (this.bot && this.isBotOnline) {
           this.bot.closeWindow(window);
        }
        
        this.cleanupStatsState();
      }
    });
  }

  scheduleReconnect() {
    this.clearAllTimers();
    this.isReady = false;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 10000);
  }

  clearAllTimers() {
    this.afkRoutineRunning = false;
    for (const t of this.afkTimers) {
      clearTimeout(t);
    }
    this.afkTimers = [];
  }

  startAfkRoutine() {
    this.afkRoutineRunning = true;
    this.isReady = false;
    console.log(`[MC-Bot] Đang khởi động kịch bản AFK. Sẽ gõ lệnh /menu sau 6 giây nữa...`);

    const delay1 = setTimeout(() => {
      if (!this.afkRoutineRunning || !this.bot || !this.isBotOnline) return;
      console.log(`[MC-Bot] Đang gõ /menu...`);
      this.bot.chat('/menu');
      
      const delay2 = setTimeout(() => {
        if (!this.afkRoutineRunning || !this.bot || !this.isBotOnline) return;
        console.log(`[MC-Bot] Đang click slot 24...`);
        
        try {
          const currentWindow = this.bot.currentWindow;
          if (currentWindow) {
             this.bot.clickWindow(24, 0, 0);
          } else {
             console.log(`[MC-Bot] Không có window /menu nào đang mở để click!`);
          }
        } catch(e) {
          console.error(`[MC-Bot] Lỗi click menu: ${e.message}`);
        }

        const delay3 = setTimeout(() => {
          if (!this.afkRoutineRunning || !this.bot || !this.isBotOnline) return;
          this.scanTablistSkins();
          this.performRtp();
        }, 6000);
        this.afkTimers.push(delay3);

      }, 4000);
      this.afkTimers.push(delay2);

    }, 6000);
    this.afkTimers.push(delay1);
  }

  scanTablistSkins() {
    try {
      if (!this.bot || !this.bot.players) return;
      let count = 0;
      for (const [uname, p] of Object.entries(this.bot.players)) {
        if (p && p.username && p.skinData && p.skinData.url) {
          skinHelper.saveSkin(p.username, p.skinData.url, p.skinData.model);
          count++;
        }
      }
      if (count > 0) {
        console.log(`[MC-Bot] 🎭 Đã quét và nạp ${count} skin từ Tablist của server hiện tại.`);
      }
    } catch (err) {
      console.warn(`[MC-Bot] Lỗi khi quét Tablist: ${err.message}`);
    }
  }

  async ensurePlayerSkin(playerName, timeoutMs = 2500) {
    if (!playerName) return null;
    const cleanName = String(playerName).trim();
    if (!cleanName) return null;

    // 1. Kiểm tra RAM cache trước
    const existing = skinHelper.getSkin(cleanName);
    if (existing && existing.textureId) {
      return existing;
    }

    // 2. Tìm kiếm trong Tablist hiện tại (0ms)
    const tabSkin = skinHelper.findSkinInTablist(this.bot, cleanName);
    if (tabSkin && tabSkin.url) {
      console.log(`[MC-Bot] 🎭 Tự động lấy Skin từ Tablist cho [${cleanName}]: ${tabSkin.url}`);
      return await skinHelper.saveSkin(cleanName, tabSkin.url, tabSkin.model);
    }

    // 3. Nếu chưa có và bot đang rảnh + online -> Mở ngầm /tpa để lấy skin từ GUI
    if (!this.bot || !this.isBotOnline || !this.isReady || this.targetPlayer) {
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;
      let timer = null;
      let retryTimer = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (retryTimer) clearTimeout(retryTimer);
        this.bot.removeListener('windowOpen', onWindow);
        this.bot.removeListener('messagestr', onMsg);
      };

      const finish = (res) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        // Cho một khoảng delay nhỏ 150ms để server Minecraft xử lý đóng window trước khi chat lệnh tiếp theo
        setTimeout(() => resolve(res), 150);
      };

      timer = setTimeout(() => {
        finish(null);
      }, timeoutMs);

      const onMsg = (message) => {
        const cleanMsg = cleanMinecraftText(message).toLowerCase();
        if (cleanMsg.includes('offline') || cleanMsg.includes('nhập sai tên') || cleanMsg.includes('nhap sai ten') || cleanMsg.includes('không thể')) {
          finish(null);
        }
      };

      const onWindow = (win) => {
        const scan = () => {
          try {
            const maxSlots = Math.min(win.inventoryStart || 45, win.slots.length);
            let foundSkin = null;

            for (let i = 0; i < maxSlots; i++) {
              const item = win.slots[i];
              if (!item || !item.nbt) continue;

              const skin = skinHelper.extractSkinDataFromNbt(item.nbt);
              if (skin && skin.url) {
                foundSkin = skin;
                break;
              }
            }

            if (foundSkin && foundSkin.url) {
              console.log(`[MC-Bot] 🎭 Auto-fetch Skin qua /tpa thành công cho [${cleanName}]: ${foundSkin.url}`);
              skinHelper.saveSkin(cleanName, foundSkin.url, foundSkin.model);
              if (this.bot && this.isBotOnline) {
                try { this.bot.closeWindow(win); } catch(e) {}
              }
              finish(foundSkin);
              return true;
            }
          } catch (e) {
            // ignore
          }
          return false;
        };

        // Quét lần 1 ngay khi mở GUI
        if (scan()) return;

        // Nếu packet window_items đang tới trễ, đợi thêm 250ms để nạp đầy đủ NBT slot rồi quét lại
        retryTimer = setTimeout(() => {
          if (scan()) return;
          if (this.bot && this.isBotOnline) {
            try { this.bot.closeWindow(win); } catch(e) {}
          }
          finish(null);
        }, 250);
      };

      this.bot.once('windowOpen', onWindow);
      this.bot.once('messagestr', onMsg);
      console.log(`[MC-Bot] 🔍 Auto-fetch Skin ngầm qua /tpa ${cleanName}...`);
      this.bot.chat(`/tpa ${cleanName}`);
    });
  }

  performRtp() {
    this.isReady = false; // Chuyển sang trạng thái bận
    console.log(`[MC-Bot] Đang gõ /rtp...`);
    this.bot.chat('/rtp');
    
    const rtpDelay = setTimeout(() => {
      if (!this.bot || !this.isBotOnline) return;
      console.log(`[MC-Bot] Đang click slot 15 trong GUI /rtp...`);
      try {
        const currentWindow = this.bot.currentWindow;
        if (currentWindow) {
          this.bot.clickWindow(15, 0, 0);
        } else {
          console.log(`[MC-Bot] Không có window /rtp nào đang mở để click!`);
        }
      } catch (e) {
        console.error(`[MC-Bot] Lỗi click rtp: ${e.message}`);
      }
      
      this.isReady = true;
      this.scanTablistSkins();
      this.emit('notifyAdmin', `🟢 **Worker [\`${this.credentials.username}\`]** đã READY và rảnh rỗi chờ lệnh.`);
      console.log(`[MC-Bot] ✅ Đã hoàn tất /rtp và sẵn sàng nhận lệnh từ Discord. Sẽ lặp lại sau 1 giờ.`);
      
      // Lặp lại sau 1 giờ (3600000 ms)
      const nextRtpTimer = setTimeout(() => {
        if (this.isBotOnline) {
          this.performRtp();
        }
      }, 3600000);
      this.afkTimers.push(nextRtpTimer);
      
    }, 2000);
    this.afkTimers.push(rtpDelay);
  }

  async getBalance(player, timeoutMs = 15000) {
    if (!this.isBotOnline || !this.isReady) {
      throw new Error("Bot Minecraft đang trong quá trình đăng nhập hoặc khởi chạy AFK, chưa sẵn sàng nhận lệnh.");
    }

    if (this.targetPlayer) {
      throw new Error("Bot đang trong quá trình xử lý một yêu cầu khác.");
    }

    return new Promise((resolve, reject) => {
      this.targetPlayer = player;
      this.currentAction = 'bal';
      console.log(`[MC-Bot] Yêu cầu lấy balance: ${player}`);
      this.bot.chat(`/balance ${player}`);

      const timeoutId = setTimeout(() => {
        this.bot.removeListener('messagestr', onMessage);
        this.cleanupStatsState();
        reject(new Error(`Timeout! Không nhận được phản hồi balance từ server sau ${timeoutMs/1000} giây.`));
      }, timeoutMs);

      const onMessage = (message, messagePosition, jsonMsg) => {
        if (message.includes(player) && (message.includes(' có $') || message.includes(' balance ') || message.includes('$'))) {
          if (message.includes('<') && message.includes('>')) return;
          if (message.includes(': ')) return;

          clearTimeout(timeoutId);
          this.bot.removeListener('messagestr', onMessage);
          this.cleanupStatsState();
          const skin = skinHelper.getSkin(player);
          resolve({
            balance: message.trim(),
            skin: skin || null
          });
        } else if ((message.includes('không tìm thấy') || message.includes('not found')) && message.includes(player)) {
          clearTimeout(timeoutId);
          this.bot.removeListener('messagestr', onMessage);
          this.cleanupStatsState();
          const skin = skinHelper.getSkin(player);
          resolve({
            balance: `Không tìm thấy người chơi **${player}** hoặc người chơi chưa từng đăng nhập.`,
            skin: skin || null
          });
        }
      };

      this.bot.on('messagestr', onMessage);
    });
  }

  async getStats(player, timeoutMs = 15000) {
    if (!this.bot || !this.isBotOnline || !this.isReady) {
      throw new Error('Bot Minecraft hiện đang đăng nhập hoặc khởi chạy AFK, chưa sẵn sàng nhận lệnh. Vui lòng thử lại sau.');
    }

    if (this.targetPlayer) {
      throw new Error('Bot đang trong quá trình xử lý một yêu cầu khác.');
    }

    // Tự động kiểm tra và lấy Skin ngầm nếu chưa có trong cache
    await this.ensurePlayerSkin(player, 1200).catch(() => {});

    return new Promise((resolve, reject) => {
      this.targetPlayer = player;
      this.currentAction = 'stats';
      this.statsPromiseResolve = resolve;
      this.statsPromiseReject = reject;

      console.log(`[MC-Bot] Yêu cầu lấy stats: ${player}`);
      this.bot.chat(`/stats ${player}`);

      this.statsTimeout = setTimeout(() => {
        if (this.statsPromiseReject) {
          this.statsPromiseReject(new Error('Timeout! Không mở được bảng Stats sau ' + (timeoutMs/1000) + ' giây.'));
          this.cleanupStatsState();
        }
      }, timeoutMs);
    });
  }

  async handleOrderWindow(initialWindow) {
    if (this.isProcessingOrder) return;
    this.isProcessingOrder = true;

    try {
      const rawTarget = (this.targetPlayer || '').toLowerCase().trim();
      const normalizedTarget = normalizeSmallCaps(rawTarget).replace(/[\s_\-]+/g, '');

      // Xác định chế độ lọc ID đặc biệt
      const isBoneQuery = (normalizedTarget === 'bone' || normalizedTarget === 'xuong');
      const isBoneBlockQuery = (normalizedTarget === 'boneblock' || normalizedTarget === 'khoixuong');

      const orders = [];
      const MAX_PAGES = 10;
      let currentPage = 1;

      // Hàm quét các slot từ 0 đến 44 của một GUI
      const scanWindow = (win) => {
        if (!win || !win.slots) return;
        const maxOrderSlots = Math.min(45, win.inventoryStart || 45);

        for (let i = 0; i < maxOrderSlots; i++) {
          const item = win.slots[i];
          if (!item) continue;

          let displayName = item.displayName || '';
          if (item.customName) displayName = item.customName;
          displayName = parseMinecraftJSON(displayName);

          // Bỏ qua item trang trí/kính/barrier/air
          const nameLower = (item.name || '').toLowerCase();
          if (nameLower.includes('pane') || nameLower === 'air' || nameLower === 'barrier') continue;

          // Lọc chính xác item ID cho bone và bone_block
          if (isBoneQuery) {
            if (nameLower !== 'bone') continue;
          } else if (isBoneBlockQuery) {
            if (nameLower !== 'bone_block') continue;
          }

          let loreArray = [];
          if (item.customLore) {
            loreArray = item.customLore.map(l => parseMinecraftJSON(l));
          } else {
            loreArray = extractLoreFromNbt(item.nbt);
          }

          if (loreArray.length === 0) continue;

          // Phân tích Tên người đặt mua (Lọc sạch từ "Đơn hàng của", "đơn hàng", "của")
          const cleanDisplayName = cleanMinecraftText(displayName);
          let buyer = cleanBuyerName(cleanDisplayName);

          let quantity = '';
          let price = '';
          let delivered = '';

          for (const line of loreArray) {
            const cleanLine = cleanMinecraftText(line).trim();
            const lowerLine = cleanLine.toLowerCase();

            // Trích xuất Số lượng (Ví dụ: SỐ LƯỢNG: 50000 Blaze Rod)
            if (!quantity) {
              if (
                lowerLine.includes('số lượng') ||
                lowerLine.includes('so luong') ||
                lowerLine.includes('sl:') ||
                lowerLine.includes('cần mua') ||
                lowerLine.includes('can mua')
              ) {
                if (cleanLine.includes(':')) {
                  quantity = cleanLine.split(':').slice(1).join(':').trim();
                } else {
                  quantity = cleanLine.replace(/^.*?(?:số\s*lượng|so\s*luong|cần\s*mua|sl)\s*/iu, '').trim();
                }
              }
            }

            // Trích xuất Giá mỗi item (Ví dụ: GIÁ MỖI ITEM: $ 151.6)
            if (!price) {
              if (lowerLine.includes('giá') || lowerLine.includes('gia') || lowerLine.includes('$')) {
                if (cleanLine.includes(':')) {
                  price = cleanLine.split(':').slice(1).join(':').trim();
                } else if (cleanLine.includes('$')) {
                  const dollarIndex = cleanLine.indexOf('$');
                  price = cleanLine.substring(dollarIndex).trim();
                }
              }
            }

            // Trích xuất Tiến độ đã giao (Ví dụ: ĐÃ GIAO: 49985/50000)
            if (!delivered) {
              if (lowerLine.includes('đã giao') || lowerLine.includes('da giao')) {
                if (cleanLine.includes(':')) {
                  delivered = cleanLine.split(':').slice(1).join(':').trim();
                }
              }
            }
          }

          // Fallback nếu không parse được quantity từ lore
          if (!quantity && item.count) {
            quantity = String(item.count);
          }

          orders.push({
            slot: i,
            page: 1,
            itemName: item.name,
            displayName: displayName,
            buyer: buyer || 'Ẩn danh',
            quantity: quantity || '1',
            price: price || 'N/A',
            delivered: delivered || null,
            lore: loreArray
          });
        }
      };

      // Quét toàn bộ 45 ô đầu tiên (5 hàng x 9 slot, bỏ qua hàng 6 chức năng)
      scanWindow(initialWindow);

      const finishOrder = () => {
        const finalTitle = parseMinecraftJSON(initialWindow.title || '');

        if (this.statsPromiseResolve) {
          this.statsPromiseResolve({
            success: true,
            serverUsed: `${this.hosts[this.currentHostIndex]}:${this.port}`,
            title: finalTitle,
            orders: orders
          });

          if (this.bot && this.isBotOnline) {
            try {
              this.bot.closeWindow(initialWindow);
            } catch (e) {}
          }
          this.cleanupStatsState();
        }
      };

      if (orders.length > 0) {
        finishOrder();
      } else {
        // Nếu packet window_items tới trễ, đợi 250ms để nạp slot rồi quét lại
        setTimeout(() => {
          orders.length = 0;
          scanWindow(initialWindow);
          finishOrder();
        }, 250);
      }
    } catch (err) {
      console.error(`[MC-Bot] Lỗi trong quá trình quét Order:`, err);
      if (this.statsPromiseReject) {
        this.statsPromiseReject(err);
      }
      this.cleanupStatsState();
    }
  }

  getOrder(itemQuery, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.bot || !this.isBotOnline || !this.isReady) {
        return reject(new Error('Bot Minecraft hiện đang đăng nhập hoặc khởi chạy AFK, chưa sẵn sàng nhận lệnh. Vui lòng thử lại sau.'));
      }

      if (this.targetPlayer) {
        return reject(new Error('Bot đang trong quá trình xử lý một yêu cầu khác.'));
      }

      this.targetPlayer = itemQuery;
      this.currentAction = 'order';
      this.statsPromiseResolve = resolve;
      this.statsPromiseReject = reject;

      console.log(`[MC-Bot] Yêu cầu lấy đơn hàng: /order ${itemQuery}`);
      this.bot.chat(`/order ${itemQuery}`);

      this.statsTimeout = setTimeout(() => {
        if (this.statsPromiseReject) {
          this.statsPromiseReject(new Error('Timeout! Không mở được bảng Đơn hàng (Order) sau ' + (timeoutMs/1000) + ' giây.'));
          this.cleanupStatsState();
        }
      }, timeoutMs);
    });
  }

  getAh(itemQuery, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.bot || !this.isBotOnline || !this.isReady) {
        return reject(new Error('Bot Minecraft hiện đang đăng nhập hoặc khởi chạy AFK, chưa sẵn sàng nhận lệnh. Vui lòng thử lại sau.'));
      }

      if (this.targetPlayer) {
        return reject(new Error('Bot đang trong quá trình xử lý một yêu cầu khác.'));
      }

      this.targetPlayer = itemQuery;
      this.currentAction = 'ah';
      this.statsPromiseResolve = resolve;
      this.statsPromiseReject = reject;

      const onAhMessage = (message) => {
        const cleanMsg = cleanMinecraftText(message).trim();
        const lowerMsg = cleanMsg.toLowerCase();

        // Bỏ qua tin nhắn chat của người chơi thường trong server (ví dụ: <Player> chat)
        if (cleanMsg.includes('<') && cleanMsg.includes('>')) return;

        if (
          lowerMsg.includes('không tìm thấy vật phẩm nào với từ khóa') ||
          lowerMsg.includes('khong tim thay vat pham nao voi tu khoa') ||
          lowerMsg.includes('không tìm thấy vật phẩm nào') ||
          lowerMsg.includes('khong tim thay vat pham nao') ||
          lowerMsg.includes('không tìm thấy vật phẩm') ||
          lowerMsg.includes('khong tim thay vat pham') ||
          lowerMsg.includes('không có vật phẩm nào') ||
          lowerMsg.includes('khong co vat pham nao')
        ) {
          console.log(`[MC-Bot] ℹ️ Server thông báo không tìm thấy AH cho "${itemQuery}": ${cleanMsg}`);
          if (this.onAhMessageListener && this.bot) {
            this.bot.removeListener('messagestr', this.onAhMessageListener);
            this.onAhMessageListener = null;
          }
          this.cleanupStatsState();
          resolve({
            success: true,
            serverUsed: `${this.hosts[this.currentHostIndex]}:${this.port}`,
            title: 'Chợ Đấu Giá',
            items: []
          });
        }
      };

      this.onAhMessageListener = onAhMessage;
      this.bot.on('messagestr', onAhMessage);

      console.log(`[MC-Bot] Yêu cầu lấy Chợ Đấu Giá: /ah ${itemQuery}`);
      this.bot.chat(`/ah ${itemQuery}`);

      this.statsTimeout = setTimeout(() => {
        if (this.onAhMessageListener && this.bot) {
          this.bot.removeListener('messagestr', this.onAhMessageListener);
          this.onAhMessageListener = null;
        }

        if (this.statsPromiseReject) {
          this.statsPromiseReject(new Error('Timeout! Không mở được bảng Chợ Đấu Giá (AH) sau ' + (timeoutMs/1000) + ' giây.'));
          this.cleanupStatsState();
        }
      }, timeoutMs);
    });
  }

  getOnline(player, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.bot || !this.isBotOnline || !this.isReady) {
        return reject(new Error('Bot Minecraft hiện đang đăng nhập hoặc khởi chạy AFK, chưa sẵn sàng nhận lệnh. Vui lòng thử lại sau.'));
      }

      if (this.targetPlayer) {
        return reject(new Error('Bot đang trong quá trình xử lý một yêu cầu khác.'));
      }

      this.targetPlayer = player;
      this.currentAction = 'online';
      this.statsPromiseResolve = resolve;
      this.statsPromiseReject = reject;

      const onMessage = (message, messagePosition, jsonMsg) => {
        const cleanMsg = cleanMinecraftText(message).trim();
        const lowerMsg = cleanMsg.toLowerCase();

        if (
          lowerMsg.includes('đã offline') ||
          lowerMsg.includes('da offline') ||
          lowerMsg.includes('offline') ||
          lowerMsg.includes('nhập sai tên') ||
          lowerMsg.includes('nhap sai ten')
        ) {
          if (cleanMsg.includes('<') && cleanMsg.includes('>')) return;

          if (this.onOnlineMessageListener) {
            this.bot.removeListener('messagestr', this.onOnlineMessageListener);
            this.onOnlineMessageListener = null;
          }

          this.cleanupStatsState();
          resolve({
            online: false,
            message: cleanMsg
          });
        }
      };

      this.onOnlineMessageListener = onMessage;
      this.bot.on('messagestr', onMessage);

      console.log(`[MC-Bot] Yêu cầu kiểm tra online: /tpa ${player}`);
      this.bot.chat(`/tpa ${player}`);

      this.statsTimeout = setTimeout(() => {
        if (this.onOnlineMessageListener) {
          this.bot.removeListener('messagestr', this.onOnlineMessageListener);
          this.onOnlineMessageListener = null;
        }

        if (this.statsPromiseReject) {
          this.statsPromiseReject(new Error('Timeout! Không nhận được phản hồi kiểm tra Online sau ' + (timeoutMs / 1000) + ' giây.'));
          this.cleanupStatsState();
        }
      }, timeoutMs);
    });
  }

  cleanupStatsState() {
    this.targetPlayer = null;
    this.currentAction = null;
    this.isProcessingOrder = false;
    this.statsPromiseResolve = null;
    this.statsPromiseReject = null;
    if (this.onOnlineMessageListener && this.bot) {
      this.bot.removeListener('messagestr', this.onOnlineMessageListener);
      this.onOnlineMessageListener = null;
    }
    if (this.onAhMessageListener && this.bot) {
      this.bot.removeListener('messagestr', this.onAhMessageListener);
      this.onAhMessageListener = null;
    }
    if (this.statsTimeout) {
      clearTimeout(this.statsTimeout);
      this.statsTimeout = null;
    }
  }
}

module.exports = PersistentBot;
