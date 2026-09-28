/**
 * scripts/gas_keepalive_template.js
 * 
 * ==============================================================================
 * 📜 MÃ NGUỒN GOOGLE APPS SCRIPT: TỰ ĐỘNG PING GIỮ RENDER WORKER LUÔN ONLINE (24/7)
 * ==============================================================================
 * 
 * Hướng dẫn triển khai trên Google Apps Script:
 * 1. Truy cập https://script.google.com và tạo "Dự án mới" (New Project).
 * 2. Đặt tên dự án: "Render-Worker-KeepAlive".
 * 3. Xóa toàn bộ nội dung trong file Code.gs và dán toàn bộ đoạn code bên dưới vào.
 * 4. Chạy hàm `setupTrigger()` một lần duy nhất để tạo Trigger tự động ping 5 phút/lần.
 * 5. Bấm "Triển khai" (Deploy) > "Tùy chọn triển khai mới" (New Deployment):
 *    - Loại triển khai: "Ứng dụng web" (Web app).
 *    - Mô tả: "KeepAlive Webhook".
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me).
 *    - Người có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone).
 * 6. Copy URL Web App nhận được (dạng: https://script.google.com/macros/s/.../exec).
 * 7. Lưu URL này vào bot bằng lệnh CLI:
 *    node scripts/seed_render_accounts.js --set-gas "https://script.google.com/macros/s/.../exec"
 */

const STORAGE_KEY = 'RENDER_WORKER_URLS';

/**
 * Lấy danh sách URL Worker đang lưu trữ trong Script Properties
 */
function getWorkerUrls() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

/**
 * Lưu danh sách URL Worker vào Script Properties
 */
function saveWorkerUrls(urls) {
  const props = PropertiesService.getScriptProperties();
  const cleanUrls = Array.from(new Set(urls.filter(u => u && u.startsWith('http'))));
  props.setProperty(STORAGE_KEY, JSON.stringify(cleanUrls));
}

/**
 * Webhook tiếp nhận yêu cầu thêm hoặc gỡ bỏ URL từ Master Bot
 */
function doPost(e) {
  try {
    const contents = e.postData ? e.postData.contents : '{}';
    const payload = JSON.parse(contents);
    const action = payload.action; // 'add' hoặc 'remove'
    const targetUrl = (payload.url || '').trim();

    if (!targetUrl) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Thiếu url' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const currentUrls = getWorkerUrls();

    if (action === 'add') {
      if (!currentUrls.includes(targetUrl)) {
        currentUrls.push(targetUrl);
        saveWorkerUrls(currentUrls);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        action: 'added',
        url: targetUrl,
        total: currentUrls.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'remove') {
      const updatedUrls = currentUrls.filter(u => u !== targetUrl && !targetUrl.includes(u));
      saveWorkerUrls(updatedUrls);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        action: 'removed',
        url: targetUrl,
        total: updatedUrls.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Action không hợp lệ' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Xem nhanh trạng thái danh sách Worker qua trình duyệt web (GET)
 */
function doGet(e) {
  const urls = getWorkerUrls();
  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <title>Render Worker Keep-Alive Monitor</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; background: #0f172a; color: #f8fafc; }
          h2 { color: #38bdf8; }
          ul { list-style-type: none; padding: 0; }
          li { background: #1e293b; margin: 8px 0; padding: 12px 16px; border-radius: 6px; border-left: 4px solid #10b981; }
          a { color: #60a5fa; text-decoration: none; word-break: break-all; }
          .badge { background: #0369a1; padding: 3px 8px; border-radius: 4px; font-size: 12px; }
        </style>
      </head>
      <body>
        <h2>⚡ Render Worker Keep-Alive Status</h2>
        <p>Đang giám sát và ping định kỳ <b>${urls.length}</b> Workers:</p>
        <ul>
          ${urls.map(u => `<li><span class="badge">ACTIVE</span> <a href="${u}/health" target="_blank">${u}</a></li>`).join('')}
        </ul>
        <p style="color: #94a3b8; font-size: 13px;">Thời gian cập nhật: ${new Date().toLocaleString('vi-VN')}</p>
      </body>
    </html>
  `;
  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}

/**
 * Hàm ping đồng loạt tất cả các Worker (chạy bởi Trigger mỗi 5 phút)
 */
function pingAllWorkers() {
  const urls = getWorkerUrls();
  if (urls.length === 0) {
    console.log('Không có Worker URL nào trong danh sách theo dõi.');
    return;
  }

  console.log(`Bắt đầu ping đồng loạt ${urls.length} Worker...`);
  
  const requests = urls.map(u => ({
    url: `${u.replace(/\/+$/, '')}/health`,
    method: 'get',
    muteHttpExceptions: true
  }));

  try {
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach((res, idx) => {
      const code = res.getResponseCode();
      console.log(`[Ping ${idx + 1}/${urls.length}] ${urls[idx]} -> HTTP ${code}`);
    });
  } catch (err) {
    console.error('Lỗi khi fetchAll ping:', err.message);
  }
}

/**
 * Hàm thiết lập Trigger tự động chạy định kỳ 5 phút/lần
 * CHỈ CẦN BẤM CHẠY HÀM NÀY 1 LẦN DUY NHẤT TẠI GIAO DIỆN APPS SCRIPT
 */
function setupTrigger() {
  // Xóa các trigger cũ trùng lặp
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'pingAllWorkers') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Tạo trigger mới mỗi 5 phút
  ScriptApp.newTrigger('pingAllWorkers')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('✅ Đã thiết lập thành công Trigger ping định kỳ 5 phút/lần cho hàm pingAllWorkers!');
}
