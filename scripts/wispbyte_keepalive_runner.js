/**
 * scripts/wispbyte_keepalive_runner.js
 * Script chạy trên GitHub Actions (hoặc CLI độc lập) để tự động truy cập Client Panel
 * cho TOÀN BỘ các tài khoản Wispbyte được lưu trong MongoDB Atlas (bảng wispbyteaccounts).
 */

require('dotenv').config();
const { connectMongo } = require('../helpers/mongoHelper');
const { checkAllWispbyteAccounts } = require('../helpers/wispbyteManager');

async function main() {
  console.log('=============================================================');
  console.log('🛰️ [Wispbyte KeepAlive Runner] Khởi động tiến trình gia hạn đa tài khoản...');
  console.log('=============================================================');

  const connected = await connectMongo();
  if (!connected) {
    console.error('❌ Không thể kết nối tới MongoDB Atlas. Vui lòng kiểm tra biến môi trường MONGODB_URI.');
    process.exit(1);
  }

  const summary = await checkAllWispbyteAccounts({ manual: false });
  console.log('\n=============================================================');
  console.log(`🏁 Hoàn tất! Tổng số tài khoản: ${summary.total || 0} | Thành công: ${summary.okCount || 0} | Hết hạn/Lỗi: ${(summary.expiredCount || 0) + (summary.errorCount || 0)}`);
  console.log('=============================================================');

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Lỗi nghiêm trọng trong Wispbyte KeepAlive Runner:', err);
  process.exit(1);
});
