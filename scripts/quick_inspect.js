require('dotenv').config();
const mineflayer = require('mineflayer');

const bot = mineflayer.createBot({
  host: 'kingmc.vn',
  port: 25565,
  username: process.env.MC_USERNAME || 'TestScanBot123',
  auth: 'offline',
  version: '1.20.1'
});

bot.on('spawn', () => {
  console.log('Bot đã spawn! Vị trí:', bot.entity?.position);
  console.log('Items trong túi:', bot.inventory.items().map(i => ({ slot: i.slot, name: i.name, displayName: i.displayName })));
});

bot.on('messagestr', (msg) => {
  console.log('[MSG]', msg);
  const lower = msg.toLowerCase();
  if (lower.includes('/dn') || lower.includes('dang nhap')) {
    setTimeout(() => {
      console.log('Gửi /dn...');
      bot.chat(`/dn ${process.env.MC_PASSWORD}`);
    }, 1500);
  } else if (lower.includes('thành công') || lower.includes('bạn đã đăng nhập')) {
    setTimeout(() => {
      console.log('Thử tabComplete "/"...');
      bot.tabComplete('/', (err, matches) => {
        console.log('Tab matches count:', matches ? matches.length : 0);
        if (matches && matches.length > 0) {
          console.log('Matches mẫu:', matches.slice(0, 30));
        }
      });
      console.log('Items trong túi sau khi login:', bot.inventory.items().map(i => ({ slot: i.slot, name: i.name, displayName: i.displayName })));
    }, 3000);
  }
});

bot.on('windowOpen', (w) => {
  console.log('[WINDOW OPEN]', w.title, 'Slots:', w.slots.length);
});

bot.on('error', console.error);
bot.on('kicked', console.warn);

setTimeout(() => {
  console.log('Thoát kiểm tra.');
  try { bot.quit(); } catch(e) {}
  process.exit(0);
}, 25000);
