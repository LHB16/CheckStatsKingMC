/**
 * scripts/optimize_textures_to_emojis.js
 * 
 * Tối ưu hóa 1.654 texture 3D thành kích thước và định dạng chuẩn cho Discord Emojis.
 * - Auto-trim khoảng trống trong suốt (Dead Space)
 * - Tự động căn giữa, padding 4px an toàn
 * - Chuẩn hóa kích thước 128x128 px
 * - Áp dụng thuật toán Sharpening giúp hiển thị sắc nét trong chat (cỡ 20-24px)
 * - Xuất file manifest ánh xạ tên Minecraft Item -> Tên Discord Emoji
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const INPUT_DIR = path.join(__dirname, '../public/textures/3d');
const OUTPUT_DIR = path.join(__dirname, '../public/textures/emojis_optimized');
const MANIFEST_PATH = path.join(__dirname, '../public/textures/emojis_manifest.json');

// Hàm chuẩn hóa tên emoji chuẩn Discord (2-32 ký tự, a-z, 0-9, _)
function sanitizeEmojiName(filename) {
  let name = filename.replace(/\.png$/i, '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (name.length > 32) {
    name = name
      .replace(/smithing_template/, 'template')
      .replace(/polished_blackstone/, 'pol_blackstone')
      .replace(/copper_grate/, 'cop_grate');
    if (name.length > 32) {
      name = name.slice(0, 32);
    }
  }
  name = name.replace(/_+$/, '');
  return name;
}

async function optimizeImage(filename) {
  const inputFilePath = path.join(INPUT_DIR, filename);
  const outputFilePath = path.join(OUTPUT_DIR, filename);

  try {
    // 1. Auto-trim pixel trong suốt
    const trimmedBuffer = await sharp(inputFilePath)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 10 })
      .toBuffer();

    // 2. Fit vào 120x120, đặt trên canvas 128x128 trong suốt, tăng độ nét viền
    await sharp(trimmedBuffer)
      .resize(120, 120, {
        fit: 'inside',
        withoutEnlargement: false
      })
      .extend({
        top: 4,
        bottom: 4,
        left: 4,
        right: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .resize(128, 128, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .sharpen({ sigma: 1.0, m1: 1.5, m2: 2.5 })
      .png({ compressionLevel: 9, effort: 7 })
      .toFile(outputFilePath);

    return {
      success: true,
      filename,
      itemKey: filename.replace(/\.png$/i, '').toLowerCase(),
      emojiName: sanitizeEmojiName(filename),
      outputPath: outputFilePath
    };
  } catch (err) {
    console.error(`❌ Lỗi xử lý ${filename}:`, err.message);
    return { success: false, filename, error: err.message };
  }
}

async function main() {
  console.log('🚀 Bắt đầu quá trình tối ưu hóa 3D Textures thành Emojis...');

  if (!fs.existsSync(INPUT_DIR)) {
    console.error(`❌ Thư mục nguồn không tồn tại: ${INPUT_DIR}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.png'));
  const total = files.length;
  console.log(`📦 Tìm thấy ${total} file ảnh PNG trong thư mục nguồn.`);

  const startTime = Date.now();
  const manifest = {};
  const BATCH_SIZE = 24; // Xử lý đồng thời 24 ảnh một lúc
  let completed = 0;
  let successCount = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(file => optimizeImage(file)));

    results.forEach(res => {
      if (res.success) {
        manifest[res.itemKey] = {
          file: res.filename,
          emojiName: res.emojiName
        };
        successCount++;
      }
    });

    completed += batch.length;
    const percent = ((completed / total) * 100).toFixed(1);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r⏳ Tiến độ: ${completed}/${total} (${percent}%) - Thời gian: ${elapsedSec}s`);
  }

  console.log('\n');

  // Ghi file manifest ánh xạ
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Hoàn tất!`);
  console.log(`- Thành công: ${successCount}/${total} ảnh`);
  console.log(`- Thư mục ảnh đã tối ưu: ${OUTPUT_DIR}`);
  console.log(`- File Manifest: ${MANIFEST_PATH}`);
  console.log(`- Tổng thời gian xử lý: ${totalTime} giây`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
