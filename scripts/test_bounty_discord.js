/**
 * scripts/test_bounty_discord.js
 * @description Script chạy bot local đăng nhập vào KingMC (KingSMP), cào /bounty và gửi kết quả vào Discord
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const PersistentBot = require('../mc-bot');
const { getCustomEmoji } = require('../helpers/utils');
const skinHelper = require('../helpers/skinHelper');

const CHANNEL_ID = '1531198642055282768'; // #test_bot_mc

function generateRandomUsername(length = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function run() {
  console.log('==================================================');
  console.log('🚀 Bắt đầu Script Kiểm thử Bot Local & Gửi Discord');
  console.log('==================================================');

  // 1. Khởi tạo Discord Client
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages
    ]
  });

  await discordClient.login(process.env.DISCORD_TOKEN);
  console.log(`[Discord] Đã đăng nhập với tư cách: ${discordClient.user.tag}`);

  const channel = await discordClient.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    console.error(`[Discord] Không tìm thấy kênh text với ID: ${CHANNEL_ID}`);
    process.exit(1);
  }

  await channel.send('⏳ **[Test Bot Local]** Đang khởi động Bot Minecraft kết nối vào máy chủ KingMC (cụm KingSMP) để kiểm tra lệnh `/bounty`...');

  // 2. Khởi tạo Minecraft Bot Local
  const credentials = {
    username: generateRandomUsername(10),
    authType: 'offline',
    password: generateRandomUsername(10)
  };

  console.log(`[MC-Bot] Tạo tài khoản bot test: [${credentials.username}]`);
  const mcBot = new PersistentBot(credentials, ['sgp.kingmc.vn', 'kingmc.vn'], 25565);
  mcBot.connect();

  let isProcessing = false;

  // Lắng nghe khi bot sẵn sàng
  const readyInterval = setInterval(async () => {
    if (mcBot.isReady && !isProcessing) {
      isProcessing = true;
      clearInterval(readyInterval);
      console.log('\n🟢 [MC-Bot] Bot đã sẵn sàng trong cụm KingSMP! Đang tiến hành lấy dữ liệu /bounty...');

      try {
        await channel.send(`🤖 **[MC-Bot]** Đã vào cụm **KingSMP** với username \`${credentials.username}\`. Đang mở GUI \`/bounty\`...`);

        // ==============================================================
        // TEST 1: CHẾ ĐỘ TOP 5 TIỀN THƯỞNG
        // ==============================================================
        console.log('[Test-Bounty] Chờ 2s để ổn định sau khi vào cụm...');
        await new Promise(r => setTimeout(r, 2000));
        console.log('[Test-Bounty] Gọi getBounty() lấy Top 5...');
        const topResult = await mcBot.getBounty(null, 25000);
        console.log('[Test-Bounty] Kết quả Top 5:', JSON.stringify(topResult, null, 2));

        const netherStarEmoji = getCustomEmoji('nether_star');
        const emeraldEmoji = getCustomEmoji('emerald');
        const swordEmoji = getCustomEmoji('diamond_sword');
        const barrierEmoji = getCustomEmoji('barrier');
        const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

        const embedTop = new EmbedBuilder()
          .setTitle(`${netherStarEmoji} **TOP 5 TIỀN THƯỞNG (BOUNTY) - KINGSMP** ${netherStarEmoji}`)
          .setColor('#2b2d31')
          .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
          .setTimestamp();

        if (topResult.bounties && topResult.bounties.length > 0) {
          embedTop.setThumbnail(skinHelper.getAvatarUrl(topResult.bounties[0].player, 64, true));
          const descLines = topResult.bounties.map((b, idx) => {
            const rankIcon = rankEmojis[idx] || `#${b.rank}`;
            return (
              `${rankIcon} **${b.player}**\n` +
              `┣ ${emeraldEmoji} **Tiền thưởng:** \`${b.amount}\`\n` +
              `┗ 👤 **Người tạo:** \`${b.creators}\``
            );
          });
          embedTop.setDescription(descLines.join('\n\n') + '\n\n\u200B');
        } else {
          embedTop.setDescription(`${barrierEmoji} Hiện tại chưa có danh sách tiền thưởng nào.`);
        }

        await channel.send({ embeds: [embedTop] });

        // ==============================================================
        // TEST 2: CHẾ ĐỘ KIỂM TRA CÁ NHÂN VỚI TOP 1 VỪA LẤY ĐƯỢC
        // ==============================================================
        if (topResult.bounties && topResult.bounties.length > 0) {
          const top1Player = topResult.bounties[0].player;
          console.log(`[Test-Bounty] Đang kiểm tra cá nhân cho Top 1: ${top1Player}...`);
          await new Promise(r => setTimeout(r, 3500));

          const checkResult = await mcBot.getBounty(top1Player, 20000);
          console.log('[Test-Bounty] Kết quả check cá nhân:', JSON.stringify(checkResult, null, 2));

          if (checkResult.success) {
            const embedCheck = new EmbedBuilder()
              .setTitle(`${swordEmoji} Tiền Thưởng: **${checkResult.player}** ${swordEmoji}`)
              .setColor('#2b2d31')
              .setThumbnail(skinHelper.getAvatarUrl(checkResult.player, 64, true))
              .setDescription(
                `👤 **Người chơi:** \`${checkResult.player}\`\n` +
                `${emeraldEmoji} **Tiền thưởng hiện tại:** \`${checkResult.amount}\`\n\n\u200B`
              )
              .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
              .setTimestamp();

            await channel.send({ embeds: [embedCheck] });
          } else {
            const embedInvalid = new EmbedBuilder()
              .setTitle(`${barrierEmoji} Không Hợp Lệ`)
              .setColor('#ef4444')
              .setDescription(`${barrierEmoji} **${checkResult.error || `Người chơi không hợp lệ: ${top1Player}`}**`)
              .setThumbnail(skinHelper.getAvatarUrl(top1Player, 64, true))
              .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
              .setTimestamp();

            await channel.send({ embeds: [embedInvalid] });
          }
        }

        // ==============================================================
        // TEST 3: CHẾ ĐỘ KIỂM TRA NGƯỜI CHƠI KHÔNG HỢP LỆ (mtien04)
        // ==============================================================
        console.log('[Test-Bounty] Đang kiểm tra người chơi không hợp lệ: mtien04...');
        await new Promise(r => setTimeout(r, 3500));
        const invalidResult = await mcBot.getBounty('mtien04', 20000);
        console.log('[Test-Bounty] Kết quả kiểm tra không hợp lệ:', JSON.stringify(invalidResult, null, 2));

        if (!invalidResult.success) {
          const embedInvalid = new EmbedBuilder()
            .setTitle(`${barrierEmoji} Không Hợp Lệ`)
            .setColor('#ef4444')
            .setDescription(`${barrierEmoji} **${invalidResult.error || 'Người chơi không hợp lệ: KhongHopLe999XYZ'}**`)
            .setThumbnail(skinHelper.getAvatarUrl('KhongHopLe999XYZ', 64, true))
            .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
            .setTimestamp();

          await channel.send({ embeds: [embedInvalid] });
        }

        await channel.send('✅ **[Test Bot Local] Hoàn thành toàn bộ quy trình kiểm thử!** Bot đang ngắt kết nối an toàn.');
        console.log('✅ Hoàn tất thành công!');
      } catch (err) {
        console.error('❌ Lỗi trong quá trình kiểm thử:', err);
        await channel.send(`❌ **[Test Bot Local Lỗi]:** \`${err.message}\``);
      } finally {
        setTimeout(() => {
          try {
            if (mcBot.bot) mcBot.bot.quit();
          } catch (_) {}
          process.exit(0);
        }, 2000);
      }
    }
  }, 1000);

  // Timeout tổng thể 120s
  setTimeout(() => {
    if (!isProcessing) {
      console.warn('⏰ Quá thời gian chờ bot sẵn sàng (120s). Thoát...');
      channel.send('⚠️ **[Test Bot Local]** Quá thời gian chờ kết nối máy chủ (120s). Đang dừng lại.').catch(() => {});
      try {
        if (mcBot.bot) mcBot.bot.quit();
      } catch (_) {}
      process.exit(1);
    }
  }, 120000);
}

run().catch((e) => {
  console.error('Lỗi khởi chạy script:', e);
  process.exit(1);
});
