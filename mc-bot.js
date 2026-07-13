/**
 * mc-bot.js - Persistent Minecraft Bot
 * @description Quản lý một session bot cắm liên tục (AFK) với các tính năng auto-reconnect, chạy macro /menu và lấy stats.
 */

const mineflayer = require('mineflayer');
const EventEmitter = require('events');

// Hàm loại bỏ mã màu Minecraft (§a, §b, v.v.)
function cleanMinecraftText(text) {
  if (!text) return '';
  return String(text).replace(/§./g, '').trim();
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
    
    // Server có thể gói thuộc tính value
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

// Helper giải mã NBT chứa Lore của vật phẩm trong Mineflayer
function extractLoreFromNbt(nbt) {
  if (!nbt || !nbt.value) return [];
  const display = nbt.value.display;
  if (!display || !display.value) return [];
  const lore = display.value.lore || display.value.Lore;
  if (!lore || !lore.value) return [];
  
  let lines = lore.value;
  if (typeof lines === 'string') lines = [lines];
  if (!Array.isArray(lines)) return [];
  
  return lines.map(line => parseMinecraftJSON(line));
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
    
    // Trạng thái AFK
    this.afkRoutineRunning = false;
    this.afkTimers = [];

    // Trạng thái Stats (xử lý song song với AFK)
    this.statsPromiseResolve = null;
    this.statsPromiseReject = null;
    this.statsTimeout = null;
    this.targetPlayer = null;
    this.isBotOnline = false;
  }

  connect() {
    this.clearAllTimers();
    const host = this.hosts[this.currentHostIndex];
    console.log(`[MC-Bot] Đang kết nối tới ${host}:${this.port}...`);

    const options = {
      host: host,
      port: this.port,
      username: this.credentials.username,
      version: '1.20.1' // Version fix cứng để tương thích KingMC
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
      // Sẽ tự động gọi 'end' sau đó
    });

    this.bot.on('kicked', (reason) => {
      const reasonText = typeof reason === 'string' ? reason : JSON.stringify(reason);
      console.warn(`[MC-Bot] Bị kick: ${cleanMinecraftText(reasonText)}`);
    });

    this.bot.on('end', (reason) => {
      this.isBotOnline = false;
      console.log(`[MC-Bot] Mất kết nối. Đang lên lịch Reconnect sau 10 giây...`);
      // Thử host tiếp theo nếu mất kết nối
      this.currentHostIndex = (this.currentHostIndex + 1) % this.hosts.length;
      
      if (this.statsPromiseReject) {
        this.statsPromiseReject(new Error('Bot bị ngắt kết nối đột ngột trong lúc lấy stats.'));
        this.cleanupStatsState();
      }

      this.scheduleReconnect();
    });

    this.bot.once('spawn', () => {
      this.isBotOnline = true;
      console.log(`[MC-Bot] Đã spawn vào server thành công! Bắt đầu kịch bản AFK.`);
      this.startAfkRoutine();
    });

    // Lắng nghe tin nhắn từ server để tự động /warp afk VÀ tự động đăng nhập
    this.bot.on('message', (jsonMsg) => {
      const msgText = jsonMsg.toString();
      const cleanMsg = cleanMinecraftText(msgText).toLowerCase();
      
      // 1. Tự động Login/Register (theo script cũ của dự án)
      if (this.credentials.password) {
        if (cleanMsg.includes('/dk') || cleanMsg.includes('dang ky bang lenh') || cleanMsg.includes('dang ky') || cleanMsg.includes('/register')) {
          // Lọc không lặp lại nếu vừa gửi
          if (!this.lastAuthTime || Date.now() - this.lastAuthTime > 2000) {
            console.log(`[MC-Bot] Server yêu cầu đăng ký. Gửi lệnh /register...`);
            this.bot.chat(`/register ${this.credentials.password} ${this.credentials.password}`); // Nhiều server chặn alias /dk, dùng lệnh gốc /register 2 pass là an toàn nhất
            this.lastAuthTime = Date.now();
          }
        } else if (cleanMsg.includes('/dn') || cleanMsg.includes('vui long') || cleanMsg.includes('dang nhap') || cleanMsg.includes('login')) {
          if (!this.lastAuthTime || Date.now() - this.lastAuthTime > 2000) {
            console.log(`[MC-Bot] Server yêu cầu đăng nhập. Gửi lệnh /login...`);
            this.bot.chat(`/login ${this.credentials.password}`);
            this.lastAuthTime = Date.now();
          }
        }
      }

      // 2. Tự động /warp afk
      const keywords = ["bạn đã được chuyển", "đang có tài khoản cùng ip", "dịch chuyển đã bị"];
      
      const matched = keywords.some(kw => cleanMsg.includes(kw));
      if (matched) {
        console.log(`[MC-Bot] Bắt được từ khóa AFK ("${cleanMinecraftText(msgText)}"). Gõ lại /warp afk sau 6 giây...`);
        const t = setTimeout(() => {
          if (this.bot && this.isBotOnline) {
            this.bot.chat('/warp afk');
          }
        }, 6000);
        this.afkTimers.push(t);
      }
    });

    // Lắng nghe khi GUI mở (để lấy stats)
    this.bot.on('windowOpen', (window) => {
      if (!this.targetPlayer) return; // Nếu không có ai yêu cầu stats thì bỏ qua

      const title = parseMinecraftJSON(window.title || '');
      console.log(`[MC-Bot] GUI Mở: "${title}", Đang trích xuất Stats...`);

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
        
        // Cố gắng đóng cửa sổ để tránh lỗi
        if (this.bot && this.isBotOnline) {
           this.bot.closeWindow(window);
        }
        
        this.cleanupStatsState();
      }
    });
  }

  scheduleReconnect() {
    this.clearAllTimers();
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
    console.log(`[MC-Bot] Đang khởi động kịch bản AFK. Sẽ gõ lệnh /menu sau 60 giây nữa (theo script cài đặt)...`);

    // Kịch bản: delay 60000 -> chat /menu -> delay 4000 -> click slot 24 -> delay 10000 -> chat /warp afk
    const delay1 = setTimeout(() => {
      if (!this.afkRoutineRunning || !this.bot || !this.isBotOnline) return;
      console.log(`[MC-Bot] Đang gõ /menu...`);
      this.bot.chat('/menu');
      
      const delay2 = setTimeout(() => {
        if (!this.afkRoutineRunning || !this.bot || !this.isBotOnline) return;
        console.log(`[MC-Bot] Đang click slot 24...`);
        
        // Lưu ý: clickWindow có thể throws error nếu GUI không mở kịp hoặc slot không hợp lệ
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
          // Từ lúc này, vòng lặp (loop) được duy trì bởi onMessage (chat listener)
        }, 10000);
        this.afkTimers.push(delay3);

      }, 4000);
      this.afkTimers.push(delay2);

    }, 60000);
    this.afkTimers.push(delay1);
  }

  getStats(player, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      if (!this.bot || !this.isBotOnline) {
        return reject(new Error('Bot Minecraft hiện đang ngoại tuyến hoặc đang reconnect. Vui lòng thử lại sau.'));
      }

      if (this.targetPlayer) {
        return reject(new Error('Bot đang trong quá trình lấy thông tin một người khác.'));
      }

      this.targetPlayer = player;
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

  cleanupStatsState() {
    this.targetPlayer = null;
    this.statsPromiseResolve = null;
    this.statsPromiseReject = null;
    if (this.statsTimeout) {
      clearTimeout(this.statsTimeout);
      this.statsTimeout = null;
    }
  }
}

module.exports = PersistentBot;
