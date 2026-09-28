/**
 * scripts/seed_render_accounts.js
 * Tool CLI quản trị tài khoản Render và cấu hình hệ thống trên MongoDB Atlas
 * 
 * Cách dùng:
 * 1. Nạp từ file JSON:
 *    node scripts/seed_render_accounts.js
 *    (hoặc: node scripts/seed_render_accounts.js --file ./path/to/my_accounts.json)
 * 
 * 2. Xem danh sách tài khoản hiện có trong MongoDB:
 *    node scripts/seed_render_accounts.js --list
 * 
 * 3. Kiểm tra kết nối Render API của tài khoản:
 *    node scripts/seed_render_accounts.js --test <accountId>
 * 
 * 4. Cài đặt Webhook Google Apps Script:
 *    node scripts/seed_render_accounts.js --set-gas "https://script.google.com/macros/s/.../exec"
 * 
 * 5. Bật/Tắt tính năng Auto Rotate:
 *    node scripts/seed_render_accounts.js --set-rotate true
 * 
 * 6. Xóa tài khoản Render:
 *    node scripts/seed_render_accounts.js --delete <accountId>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  connectMongo,
  getAllRenderAccounts,
  saveRenderAccount,
  deleteRenderAccount,
  setSystemConfig,
  getSystemConfig
} = require('../helpers/mongoHelper');
const { callRenderApi } = require('../helpers/renderManager');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--seed';

  console.log('🔄 Đang kết nối tới MongoDB Atlas...');
  const connected = await connectMongo();
  if (!connected) {
    console.error('❌ Không thể kết nối tới MongoDB. Vui lòng kiểm tra lại biến MONGODB_URI trong file .env.');
    process.exit(1);
  }

  // --- LỆNH: Xem danh sách tài khoản (--list) ---
  if (command === '--list') {
    const accounts = await getAllRenderAccounts();
    console.log(`\n📋 Danh sách Tài khoản Render trong MongoDB (${accounts.length} tài khoản):`);
    console.log('----------------------------------------------------------------------');
    if (accounts.length === 0) {
      console.log('Chưa có tài khoản nào. Hãy chạy lệnh nạp tài khoản: node scripts/seed_render_accounts.js');
    } else {
      accounts.forEach((acc, idx) => {
        const maskedKey = acc.apiKey ? `${acc.apiKey.substring(0, 8)}...${acc.apiKey.substring(acc.apiKey.length - 4)}` : 'N/A';
        console.log(`[${idx + 1}] ID: ${acc.accountId} | Tên: ${acc.name || 'N/A'}`);
        console.log(`    • API Key: ${maskedKey}`);
        console.log(`    • Owner ID: ${acc.ownerId || 'N/A'}`);
        console.log(`    • Trạng thái: ${acc.isActive ? '✅ Đang bật' : '❌ Đang tắt'}`);
        console.log(`    • Service hiện tại: ${acc.activeServiceId || 'Chưa có'}`);
        console.log(`    • Public URL: ${acc.activeServiceUrl || 'Chưa có'}`);
        console.log(`    • Region: ${acc.currentRegion || 'Chưa chọn'} (Cho phép: ${acc.allowedRegions?.join(', ') || 'all'})`);
        console.log(`    • Số lần xoay: ${acc.rotationCount || 0} | Lần xoay cuối: ${acc.lastRotatedAt ? new Date(acc.lastRotatedAt).toLocaleString('vi-VN') : 'Chưa xoay'}`);
        console.log('----------------------------------------------------------------------');
      });
    }

    // Hiển thị thêm system config
    const gasUrl = await getSystemConfig('gas_keepalive_url', 'Chưa cấu hình');
    const autoRotate = await getSystemConfig('auto_rotate_enabled', true);
    console.log(`⚙️ Cấu hình hệ thống:`);
    console.log(`    • Google Apps Script URL: ${gasUrl}`);
    console.log(`    • Tự động xoay (Auto-Rotate): ${autoRotate ? 'BẬT' : 'TẮT'}\n`);
    process.exit(0);
  }

  // --- LỆNH: Cài đặt Webhook Google Apps Script (--set-gas <url>) ---
  if (command === '--set-gas') {
    const url = args[1];
    if (!url || !url.startsWith('http')) {
      console.error('❌ Vui lòng nhập đúng định dạng URL Google Apps Script. Ví dụ:');
      console.error('node scripts/seed_render_accounts.js --set-gas "https://script.google.com/macros/s/.../exec"');
      process.exit(1);
    }
    await setSystemConfig('gas_keepalive_url', url.trim(), 'Webhook Google Apps Script để ping keep-alive');
    console.log(`✅ Đã lưu Google Apps Script Webhook URL thành công: ${url.trim()}`);
    process.exit(0);
  }

  // --- LỆNH: Bật/Tắt tính năng Auto Rotate (--set-rotate <true|false>) ---
  if (command === '--set-rotate') {
    const val = (args[1] || '').toLowerCase() === 'true';
    await setSystemConfig('auto_rotate_enabled', val, 'Trạng thái bật/tắt tự động xoay Worker khi giới hạn IP');
    console.log(`✅ Đã đặt trạng thái Auto-Rotate thành: [${val ? 'BẬT' : 'TẮT'}]`);
    process.exit(0);
  }

  // --- LỆNH: Xóa tài khoản (--delete <id>) ---
  if (command === '--delete') {
    const id = args[1];
    if (!id) {
      console.error('❌ Vui lòng nhập accountId cần xóa. Ví dụ: node scripts/seed_render_accounts.js --delete render_acc_01');
      process.exit(1);
    }
    const ok = await deleteRenderAccount(id);
    if (ok) {
      console.log(`✅ Đã xóa thành công tài khoản [${id}] khỏi MongoDB.`);
    } else {
      console.log(`⚠️ Không tìm thấy tài khoản [${id}] trong MongoDB.`);
    }
    process.exit(0);
  }

  // --- LỆNH: Kiểm tra kết nối Render API (--test <accountId>) ---
  if (command === '--test') {
    const id = args[1];
    const accounts = await getAllRenderAccounts();
    const acc = accounts.find(a => a.accountId === id) || accounts[0];
    if (!acc) {
      console.error('❌ Không tìm thấy tài khoản để kiểm tra.');
      process.exit(1);
    }
    console.log(`🔍 Đang kiểm tra Render API với tài khoản [${acc.name || acc.accountId}]...`);
    try {
      const owners = await callRenderApi('/owners', acc.apiKey, { method: 'GET' });
      console.log('✅ Kết nối Render API THÀNH CÔNG!');
      console.log('Danh sách Owners / Workspaces tìm thấy:', JSON.stringify(owners, null, 2));
      if (!acc.ownerId && Array.isArray(owners) && owners.length > 0) {
        const suggestedOwnerId = owners[0].owner?.id || owners[0].id;
        console.log(`💡 Gợi ý Owner ID: ${suggestedOwnerId}`);
      }
    } catch (e) {
      console.error('❌ Kết nối thất bại:', e.message);
    }
    process.exit(0);
  }

  // --- LỆNH MẶC ĐỊNH: Nạp tài khoản từ file JSON (--seed [--file <path>]) ---
  let filePath = path.join(__dirname, '../config/render_accounts.json');
  if (command === '--file' && args[1]) {
    filePath = path.resolve(args[1]);
  } else if (args.includes('--file')) {
    const fIdx = args.indexOf('--file');
    if (args[fIdx + 1]) filePath = path.resolve(args[fIdx + 1]);
  }

  if (!fs.existsSync(filePath)) {
    // Nếu chưa có file render_accounts.json, gợi ý tạo từ file example
    const examplePath = path.join(__dirname, '../config/render_accounts.example.json');
    console.warn(`\n⚠️ Không tìm thấy file: ${filePath}`);
    console.log(`💡 Bạn có thể tạo file cấu hình bằng cách sao chép file mẫu:`);
    console.log(`   copy config\\render_accounts.example.json config\\render_accounts.json`);
    console.log(`   Sau đó điền apiKey và ownerId của Render vào rồi chạy lại lệnh này.\n`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(filePath, 'utf8');
    const accounts = JSON.parse(rawData);

    if (!Array.isArray(accounts) || accounts.length === 0) {
      console.error('❌ File cấu hình phải là một mảng JSON chứa danh sách tài khoản.');
      process.exit(1);
    }

    console.log(`📦 Bắt đầu nạp ${accounts.length} tài khoản từ file [${filePath}] lên MongoDB Atlas...\n`);

    let successCount = 0;
    for (const item of accounts) {
      const accountId = item.accountId || item.id;
      if (!accountId || !item.apiKey) {
        console.warn(`⚠️ Bỏ qua record không hợp lệ (thiếu accountId hoặc apiKey):`, item);
        continue;
      }

      // Tự động fetch ownerId nếu chưa có
      if (!item.ownerId) {
        try {
          const owners = await callRenderApi('/owners', item.apiKey, { method: 'GET' });
          if (Array.isArray(owners) && owners.length > 0) {
            item.ownerId = owners[0].owner?.id || owners[0].id || '';
            console.log(`  └ Tự động tìm thấy Owner ID cho [${accountId}]: ${item.ownerId}`);
          }
        } catch (e) {
          console.warn(`  └ Không thể tự lấy Owner ID cho [${accountId}]: ${e.message}`);
        }
      }

      await saveRenderAccount(item);
      console.log(`✅ Đã lưu tài khoản: [${accountId}] - ${item.name || 'Không tên'}`);
      successCount++;
    }

    console.log(`\n🎉 Nạp hoàn tất! Đã lưu thành công ${successCount}/${accounts.length} tài khoản vào MongoDB Atlas.`);
    console.log(`👉 Bạn có thể xóa file cục bộ [${filePath}] hoặc giữ lại vì nó đã được cấu hình trong .gitignore không bị đẩy lên GitHub.`);
    console.log(`👉 Kiểm tra lại danh sách trên DB bằng lệnh: node scripts/seed_render_accounts.js --list\n`);
  } catch (err) {
    console.error('❌ Lỗi khi đọc hoặc lưu tài khoản:', err.message);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Lỗi không mong muốn:', err);
  process.exit(1);
});
