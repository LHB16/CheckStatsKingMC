/**
 * scripts/inspect_bounty_gui.js
 * In chi tiết lore và tin nhắn phản hồi của /bounty trên KingSMP
 */

require('dotenv').config();
const PersistentBot = require('../mc-bot');

function generateRandomUsername(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const credentials = {
  username: generateRandomUsername(10),
  authType: 'offline',
  password: generateRandomUsername(10)
};

const mcBot = new PersistentBot(credentials, ['kingmc.vn', 'sgp.kingmc.vn'], 25565);
mcBot.connect();

let inspected = false;

mcBot.bot?.on('message', (jsonMsg) => {
  console.log('[ALL CHAT]', jsonMsg.toString());
});

const interval = setInterval(async () => {
  if (mcBot.isReady && !inspected) {
    inspected = true;
    clearInterval(interval);
    console.log('BOT READY! Đợi 5 giây để đứng yên...');
    await new Promise(r => setTimeout(r, 5000));

    console.log('--- TEST /bounty GUI ---');
    mcBot.bot.chat('/bounty');

    const win = await new Promise((resolve) => {
      const onWin = (w) => {
        mcBot.bot.removeListener('windowOpen', onWin);
        resolve(w);
      };
      mcBot.bot.on('windowOpen', onWin);
      setTimeout(() => resolve(null), 5000);
    });

    if (win) {
      console.log('GUI TITLE:', JSON.stringify(win.title));
      console.log('SLOTS COUNT:', win.slots.length);
      for (let i = 0; i < Math.min(10, win.slots.length); i++) {
        const it = win.slots[i];
        if (it) {
          console.log(`\n=== SLOT ${i} ===`);
          console.log('Name:', it.name);
          console.log('DisplayName:', it.displayName);
          console.log('CustomName:', it.customName);
          console.log('CustomLore:', it.customLore);
          console.log('NBT display:', JSON.stringify(it.nbt?.value?.display));
        }
      }
      try { mcBot.bot.closeWindow(win); } catch(_) {}
    } else {
      console.log('KHÔNG MỞ ĐƯỢC GUI!');
    }

    await new Promise(r => setTimeout(r, 3000));
    console.log('--- TEST /bounty check ---');
    mcBot.bot.on('message', (m) => {
      console.log('[CHAT SAU CHECK]:', m.toString());
    });
    mcBot.bot.chat('/bounty check mtien04');

    await new Promise(r => setTimeout(r, 5000));
    console.log('--- TEST /bounty check hợp lệ ---');
    mcBot.bot.chat('/bounty check 108_TdzMC');

    await new Promise(r => setTimeout(r, 5000));
    try { mcBot.bot.quit(); } catch(_) {}
    process.exit(0);
  }
}, 1000);
