/**
 * scripts/upload_discord_emojis.js
 * 
 * Tự động tải các emoji đã tối ưu lên Discord Application Emojis.
 * - Hỗ trợ resume (tiếp tục từ vị trí dừng, không upload trùng)
 * - Tự động đồng bộ với danh sách Application Emojis hiện có trên Discord
 * - Tự động xử lý Rate Limit và có delay an toàn giữa các request
 * - Lưu bản đồ ánh xạ vào public/textures/discord_emojis.json
 * 
 * Cách dùng:
 * - node scripts/upload_discord_emojis.js              (Upload toàn bộ các emoji còn thiếu)
 * - node scripts/upload_discord_emojis.js --limit 50   (Chỉ upload 50 emoji đầu tiên để test)
 * - node scripts/upload_discord_emojis.js --sync-only  (Chỉ đồng bộ danh sách đã có về file JSON)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const CLIENT_ID = process.env.CLIENT_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!CLIENT_ID || !DISCORD_TOKEN) {
  console.error('❌ Thiếu CLIENT_ID hoặc DISCORD_TOKEN trong file .env!');
  process.exit(1);
}

const MANIFEST_PATH = path.join(__dirname, '../public/textures/emojis_manifest.json');
const OPT_DIR = path.join(__dirname, '../public/textures/emojis_optimized');
const MAP_OUTPUT_PATH = path.join(__dirname, '../public/textures/discord_emojis.json');

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

// Parse CLI flags
const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const IS_SYNC_ONLY = args.includes('--sync-only');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🤖 Bắt đầu quản lý & Upload Discord Application Emojis...');
  console.log(`- Bot Application ID: ${CLIENT_ID}`);

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ Chưa tìm thấy file manifest! Hãy chạy scripts/optimize_textures_to_emojis.js trước.`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const allItemKeys = Object.keys(manifest);
  console.log(`📦 Tổng số vật phẩm trong manifest: ${allItemKeys.length}`);

  // 1. Tải danh sách emojis hiện có trên Application từ Discord
  console.log('📡 Đang đồng bộ danh sách Emoji hiện tại từ Discord API...');
  let existingEmojis = [];
  try {
    const res = await rest.get(Routes.applicationEmojis(CLIENT_ID));
    existingEmojis = res.items || [];
    console.log(`✅ Hiện tại Application đang có ${existingEmojis.length} emoji trên Discord.`);
  } catch (err) {
    console.error(`❌ Lỗi khi lấy danh sách emoji từ Discord:`, err.message);
    process.exit(1);
  }

  // Đọc file map local nếu có
  let emojiMap = {};
  if (fs.existsSync(MAP_OUTPUT_PATH)) {
    try {
      emojiMap = JSON.parse(fs.readFileSync(MAP_OUTPUT_PATH, 'utf8'));
    } catch (_) {}
  }

  // Đưa các emoji đã tồn tại trên Discord vào mapping
  const discordEmojiByName = new Map();
  existingEmojis.forEach(e => {
    discordEmojiByName.set(e.name.toLowerCase(), e);
  });

  // Cập nhật lại emojiMap theo những gì thực sự có trên Discord
  for (const itemKey of allItemKeys) {
    const info = manifest[itemKey];
    if (discordEmojiByName.has(info.emojiName.toLowerCase())) {
      const e = discordEmojiByName.get(info.emojiName.toLowerCase());
      emojiMap[itemKey] = `<:${e.name}:${e.id}>`;
    }
  }

  // Lưu file mapping
  fs.writeFileSync(MAP_OUTPUT_PATH, JSON.stringify(emojiMap, null, 2), 'utf8');

  if (IS_SYNC_ONLY) {
    console.log(`🎉 Đã đồng bộ thành công ${Object.keys(emojiMap).length} emoji vào file ${MAP_OUTPUT_PATH}`);
    return;
  }

  // Lọc ra các item chưa được upload
  const pendingItems = allItemKeys.filter(k => !emojiMap[k]);
  console.log(`📋 Số lượng emoji cần tải lên: ${pendingItems.length} / ${allItemKeys.length}`);

  if (pendingItems.length === 0) {
    console.log('🎉 Toàn bộ emoji đã được tải lên đầy đủ!');
    return;
  }

  const toProcess = pendingItems.slice(0, LIMIT);
  console.log(`🚀 Sẽ tiến hành tải lên: ${toProcess.length} emoji (Limit: ${LIMIT === Infinity ? 'Toàn bộ' : LIMIT})...`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const itemKey = toProcess[i];
    const info = manifest[itemKey];
    const imgPath = path.join(OPT_DIR, info.file);

    if (!fs.existsSync(imgPath)) {
      console.warn(`⚠️ Không tìm thấy ảnh tối ưu: ${imgPath}`);
      failCount++;
      continue;
    }

    try {
      const buffer = fs.readFileSync(imgPath);
      const dataUri = 'data:image/png;base64,' + buffer.toString('base64');

      const emojiRes = await rest.post(Routes.applicationEmojis(CLIENT_ID), {
        body: {
          name: info.emojiName,
          image: dataUri
        }
      });

      const emojiString = `<:${emojiRes.name}:${emojiRes.id}>`;
      emojiMap[itemKey] = emojiString;
      successCount++;

      // Ghi lại tiến độ vào file ngay lập tức
      fs.writeFileSync(MAP_OUTPUT_PATH, JSON.stringify(emojiMap, null, 2), 'utf8');

      console.log(`[${i + 1}/${toProcess.length}] Uploaded: ${emojiString} (${itemKey})`);

      // Delay nhẹ 500ms giữa các request để giữ an toàn rate limit
      await sleep(500);
    } catch (err) {
      failCount++;
      console.error(`❌ [${i + 1}/${toProcess.length}] Thất bại (${itemKey} - ${info.emojiName}):`, err.message);

      // Nếu gặp rate limit gắt gao thì nghỉ tạm 3 giây
      if (err.status === 429) {
        console.log('⏳ Gặp Rate Limit, đang chờ 3 giây trước khi tiếp tục...');
        await sleep(3000);
      }
    }
  }

  console.log('\n=======================================');
  console.log(`🎉 Kết quả đợt upload:`);
  console.log(`- Thành công: ${successCount}`);
  console.log(`- Thất bại: ${failCount}`);
  console.log(`- Tổng emoji hiện có trong map: ${Object.keys(emojiMap).length}/${allItemKeys.length}`);
  console.log(`- File ánh xạ đã cập nhật: ${MAP_OUTPUT_PATH}`);
  console.log('=======================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
