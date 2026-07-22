/**
 * mc-bot.js - Persistent Minecraft Bot
 * @description Quản lý một session bot cắm liên tục (AFK) với các tính năng auto-reconnect, chạy macro /menu, lấy stats và lấy order.
 */

const mineflayer = require('mineflayer');
const EventEmitter = require('events');

// Hàm loại bỏ mã màu Minecraft (§a, §b, v.v.)
function cleanMinecraftText(text) {
  if (!text) return '';
  return String(text)
    .replace(/§./g, '')
    .replace(/\u00A0/g, ' ')
    .normalize('NFC')
    .trim();
}

// Hàm parse chuẩn Minecraft JSON Text Component (có đệ quy đọc extra, text)
function parseMinecraftJSON(input) {
  if (!input) return '';
  if (typeof input === 'string') {
    try {
      if (input.startsWith('{') || input.startsWith('[')) {
        const obj = JSON.parse(input);
        return parseMinecraftJSON(obj);
      }
    } catch(e) {}
    return cleanMinecraftText(input);
  }

  if (Array.isArray(input)) {
    return input.map(i => parseMinecraftJSON(i)).join('');
  }

  if (typeof input === 'object') {
    let result = '';
    
    if (input.value !== undefined && typeof input.value === 'string') {
      try {
        const obj = JSON.parse(input.value);
        return parseMinecraftJSON(obj);
      } catch (e) {
        return cleanMinecraftText(input.value);
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
    
    return cleanMinecraftText(result || JSON.stringify(input));
  }
  
  return cleanMinecraftText(String(input));
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
      console.warn(`[MC-Bot] Bị kick: ${cleanMinecraftText(reasonText)}`);
    });

    this.bot.on('end', (reason) => {
      this.isBotOnline = false;
      this.isReady = false;
      console.log(`[MC-Bot] Mất kết nối. Đang lên lịch Reconnect sau 10 giây...`);
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
      this.startAfkRoutine();
    });

    // Lắng nghe tin nhắn từ server để tự động đăng nhập
    this.bot.on('message', (jsonMsg) => {
      const msgText = jsonMsg.toString();
      const cleanMsg = cleanMinecraftText(msgText).toLowerCase();
      
      // Tự động Login/Register
      if (this.credentials.password) {
        if (cleanMsg.includes('/dk') || cleanMsg.includes('dang ky bang lenh') || cleanMsg.includes('dang ky') || cleanMsg.includes('/register')) {
          if (!this.lastAuthTime || Date.now() - this.lastAuthTime > 2000) {
            console.log(`[MC-Bot] Server yêu cầu đăng ký. Gửi lệnh /register...`);
            this.bot.chat(`/register ${this.credentials.password} ${this.credentials.password}`);
            this.lastAuthTime = Date.now();
          }
        } else if (cleanMsg.includes('/dn') || cleanMsg.includes('vui long') || cleanMsg.includes('dang nhap') || cleanMsg.includes('/login')) {
          if (!this.lastAuthTime || Date.now() - this.lastAuthTime > 2000) {
            console.log(`[MC-Bot] Server yêu cầu đăng nhập. Gửi lệnh /login...`);
            this.bot.chat(`/login ${this.credentials.password}`);
            this.lastAuthTime = Date.now();
          }
        }
      }
    });

    // Lắng nghe khi GUI mở (để lấy stats hoặc order)
    this.bot.on('windowOpen', (window) => {
      if (!this.targetPlayer) return;

      const title = parseMinecraftJSON(window.title || '');
      console.log(`[MC-Bot] GUI Mở: "${title}" (Action: ${this.currentAction}), Đang trích xuất dữ liệu...`);

      if (this.currentAction === 'order') {
        // Trích xuất đơn hàng từ GUI 6x9 (Chỉ lấy trong phạm vi top 5x9: slot 0 tới 44)
        const orders = [];
        const maxOrderSlots = Math.min(45, window.inventoryStart || 45);

        for (let i = 0; i < maxOrderSlots; i++) {
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

          // Phân tích Tên người đặt mua (Lọc sạch từ "Đơn hàng của", "đơn hàng", "của")
          const cleanDisplayName = cleanMinecraftText(displayName);
          let buyer = cleanDisplayName
            .replace(/^.*đơn\s*hàng\s*của\s*/i, '')
            .replace(/^.*đơn\s*hàng\s*/i, '')
            .replace(/^.*của\s+/i, '')
            .trim();

          let quantity = '';
          let price = '';
          let delivered = '';

          for (const line of loreArray) {
            const cleanLine = cleanMinecraftText(line).trim();
            const lowerLine = cleanLine.toLowerCase();

            // Trích xuất Số lượng
            if (!quantity && (lowerLine.includes('số lượng') || lowerLine.includes('so luong') || lowerLine.includes('sl:'))) {
              if (cleanLine.includes(':')) {
                quantity = cleanLine.split(':').slice(1).join(':').trim();
              } else {
                quantity = cleanLine.replace(/^.*số\s*lượng\s*/i, '').trim();
              }
            }

            // Trích xuất Giá mỗi item (Nhận diện dòng chứa "giá", "gia", hoặc ký hiệu "$")
            if (!price && (lowerLine.includes('giá') || lowerLine.includes('gia') || lowerLine.includes('$'))) {
              if (cleanLine.includes(':')) {
                price = cleanLine.split(':').slice(1).join(':').trim();
              } else if (cleanLine.includes('$')) {
                const dollarIndex = cleanLine.indexOf('$');
                price = cleanLine.substring(dollarIndex).trim();
              } else {
                price = cleanLine.replace(/^.*giá\s*(mỗi\s*item)?\s*/i, '').trim();
              }
            }

            // Trích xuất Tiến độ đã giao (Nhận diện dòng chứa "đã giao" hoặc "da giao")
            if (!delivered && (lowerLine.includes('đã giao') || lowerLine.includes('da giao'))) {
              if (cleanLine.includes(':')) {
                delivered = cleanLine.split(':').slice(1).join(':').trim();
              } else {
                delivered = cleanLine.replace(/^.*đã\s*giao\s*/i, '').trim();
              }
            }
          }

          // Fallback nếu không parse được quantity từ lore
          if (!quantity && item.count && item.count > 1) {
            quantity = String(item.count);
          }

          orders.push({
            slot: i,
            itemName: item.name,
            displayName: displayName,
            buyer: buyer || 'Ẩn danh',
            quantity: quantity || 'N/A',
            price: price || 'N/A',
            delivered: delivered || null,
            lore: loreArray
          });

          // Giới hạn lấy tối đa 25 đơn hàng đầu tiên để vừa vặn Embed Discord
          if (orders.length >= 25) break;
        }

        if (this.statsPromiseResolve) {
          this.statsPromiseResolve({
            success: true,
            serverUsed: `${this.hosts[this.currentHostIndex]}:${this.port}`,
            title: title,
            orders: orders
          });

          if (this.bot && this.isBotOnline) {
            this.bot.closeWindow(window);
          }
          this.cleanupStatsState();
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
        this.statsPromiseResolve({
          success: true,
          serverUsed: `${this.hosts[this.currentHostIndex]}:${this.port}`,
          title: title,
          items: statsItems
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
    console.log(`[MC-Bot] Đang khởi động kịch bản AFK. Sẽ gõ lệnh /menu sau 60 giây nữa...`);

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
          console.log(`[MC-Bot] Đang gõ /warp afk...`);
          this.bot.chat('/warp afk');

          this.isReady = true;
          console.log(`[MC-Bot] ✅ Bot đã hoàn tất kịch bản AFK và sẵn sàng nhận lệnh từ Discord! (isReady = true)`);
        }, 10000);
        this.afkTimers.push(delay3);

      }, 4000);
      this.afkTimers.push(delay2);

    }, 60000);
    this.afkTimers.push(delay1);
  }

  getBalance(player, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.isBotOnline || !this.isReady) {
        return reject(new Error("Bot Minecraft đang trong quá trình đăng nhập hoặc khởi chạy AFK, chưa sẵn sàng nhận lệnh."));
      }

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
          resolve(message.trim());
        } else if ((message.includes('không tìm thấy') || message.includes('not found')) && message.includes(player)) {
          clearTimeout(timeoutId);
          this.bot.removeListener('messagestr', onMessage);
          this.cleanupStatsState();
          resolve(`Không tìm thấy người chơi **${player}** hoặc người chơi chưa từng đăng nhập.`);
        }
      };

      this.bot.on('messagestr', onMessage);
    });
  }

  getStats(player, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.bot || !this.isBotOnline || !this.isReady) {
        return reject(new Error('Bot Minecraft hiện đang đăng nhập hoặc khởi chạy AFK, chưa sẵn sàng nhận lệnh. Vui lòng thử lại sau.'));
      }

      if (this.targetPlayer) {
        return reject(new Error('Bot đang trong quá trình xử lý một yêu cầu khác.'));
      }

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

  cleanupStatsState() {
    this.targetPlayer = null;
    this.currentAction = null;
    this.statsPromiseResolve = null;
    this.statsPromiseReject = null;
    if (this.statsTimeout) {
      clearTimeout(this.statsTimeout);
      this.statsTimeout = null;
    }
  }
}

module.exports = PersistentBot;
