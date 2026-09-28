/**
 * scripts/gas_keepalive_template.js
 * 
 * ==============================================================================
 * 📜 MÃ NGUỒN GOOGLE APPS SCRIPT: TỰ ĐỘNG PING GIỮ MASTER & WORKERS LUÔN ONLINE (24/7)
 * ==============================================================================
 * 
 * Hướng dẫn triển khai trên Google Apps Script:
 * 1. Truy cập https://script.google.com và tạo "Dự án mới" (New Project).
 * 2. Đặt tên dự án: "Render-KeepAlive-Monitor".
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
const MASTER_KEY = 'RENDER_MASTER_URL';

/**
 * Lấy URL Master Bot đang lưu trữ trong Script Properties
 */
function getMasterUrl() {
  const props = PropertiesService.getScriptProperties();
  return (props.getProperty(MASTER_KEY) || '').trim();
}

/**
 * Lưu hoặc xóa URL Master Bot trong Script Properties
 */
function saveMasterUrl(url) {
  const props = PropertiesService.getScriptProperties();
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    props.deleteProperty(MASTER_KEY);
  } else {
    props.setProperty(MASTER_KEY, cleanUrl);
  }
}

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
 * Hỗ trợ cả Master Node và Worker Nodes
 */
function doPost(e) {
  try {
    const contents = e.postData ? e.postData.contents : '{}';
    const payload = JSON.parse(contents);
    const action = payload.action; // 'add' hoặc 'remove'
    const targetUrl = (payload.url || '').trim();
    const isMaster = Boolean(payload.isMaster || payload.role === 'master' || payload.type === 'master');

    if (!targetUrl) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Thiếu url' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Xử lý đăng ký / hủy Master Node
    if (isMaster) {
      if (action === 'add') {
        saveMasterUrl(targetUrl);
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          action: 'master_updated',
          url: targetUrl
        })).setMimeType(ContentService.MimeType.JSON);
      }

      if (action === 'remove') {
        saveMasterUrl('');
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          action: 'master_removed'
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // Xử lý danh sách Worker Nodes
    const currentUrls = getWorkerUrls();

    if (action === 'add') {
      if (!currentUrls.includes(targetUrl)) {
        currentUrls.push(targetUrl);
        saveWorkerUrls(currentUrls);
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        action: 'worker_added',
        url: targetUrl,
        totalWorkers: currentUrls.length
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'remove') {
      const updatedUrls = currentUrls.filter(u => u !== targetUrl && !targetUrl.includes(u));
      saveWorkerUrls(updatedUrls);
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        action: 'worker_removed',
        url: targetUrl,
        totalWorkers: updatedUrls.length
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
 * Xem nhanh trạng thái danh sách Master và Worker qua trình duyệt web (GET)
 */
function doGet(e) {
  const masterUrl = getMasterUrl();
  const workerUrls = getWorkerUrls();
  const totalCount = (masterUrl ? 1 : 0) + workerUrls.length;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Render Keep-Alive Monitor</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; background: #0f172a; color: #f8fafc; }
          h2 { color: #38bdf8; margin-bottom: 6px; }
          .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
          .section-title { font-size: 15px; color: #cbd5e1; margin-top: 24px; margin-bottom: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          ul { list-style-type: none; padding: 0; margin: 0; }
          li { background: #1e293b; margin: 8px 0; padding: 12px 16px; border-radius: 6px; display: flex; align-items: center; gap: 12px; }
          li.master { border-left: 4px solid #f59e0b; }
          li.worker { border-left: 4px solid #10b981; }
          a { color: #60a5fa; text-decoration: none; word-break: break-all; }
          a:hover { text-decoration: underline; }
          .badge { padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .badge.master { background: #b45309; color: #fef3c7; }
          .badge.worker { background: #047857; color: #d1fae5; }
          .empty-box { background: #1e293b; padding: 14px; border-radius: 6px; color: #64748b; font-style: italic; font-size: 13px; }
        </style>
      </head>
      <body>
        <h2>⚡ Render Keep-Alive Monitor</h2>
        <div class="subtitle">Đang giám sát và ping định kỳ <b>${totalCount}</b> dịch vụ (chu kỳ 5 phút/lần)</div>
        
        <div class="section-title">👑 MASTER BOT</div>
        ${masterUrl ? `
          <ul>
            <li class="master">
              <span class="badge master">MASTER</span>
              <a href="${masterUrl.replace(/\/+$/, '')}/health" target="_blank">${masterUrl}</a>
            </li>
          </ul>
        ` : `
          <div class="empty-box">Chưa cấu hình Master URL (Sẽ tự động cập nhật khi Master khởi động hoặc cấu hình trên Web UI Dashboard).</div>
        `}

        <div class="section-title">🤖 WORKER BOTS (${workerUrls.length})</div>
        ${workerUrls.length > 0 ? `
          <ul>
            ${workerUrls.map(u => `
              <li class="worker">
                <span class="badge worker">WORKER</span>
                <a href="${u.replace(/\/+$/, '')}/health" target="_blank">${u}</a>
              </li>
            `).join('')}
          </ul>
        ` : `
          <div class="empty-box">Chưa có Worker nào trong danh sách.</div>
        `}

        <p style="color: #64748b; font-size: 12px; margin-top: 30px;">Thời gian cập nhật: ${new Date().toLocaleString('vi-VN')}</p>
      </body>
    </html>
  `;
  return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
}

/**
 * Hàm ping đồng loạt tất cả các Node (Master & Workers)
 * Chạy bởi Trigger mỗi 5 phút (Tên hàm giữ nguyên để tương thích Trigger sẵn có)
 */
function pingAllWorkers() {
  const masterUrl = getMasterUrl();
  const workerUrls = getWorkerUrls();

  const targets = [];
  if (masterUrl && masterUrl.startsWith('http')) {
    targets.push({ url: masterUrl, role: 'MASTER' });
  }

  workerUrls.forEach(u => {
    if (u && u.startsWith('http') && u !== masterUrl) {
      targets.push({ url: u, role: 'WORKER' });
    }
  });

  if (targets.length === 0) {
    console.log('Không có dịch vụ nào (Master hoặc Worker) trong danh sách theo dõi.');
    return;
  }

  console.log(`Bắt đầu ping đồng loạt ${targets.length} dịch vụ (Master: ${masterUrl ? 1 : 0}, Workers: ${workerUrls.length})...`);
  
  const requests = targets.map(t => ({
    url: `${t.url.replace(/\/+$/, '')}/health`,
    method: 'get',
    muteHttpExceptions: true
  }));

  try {
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach((res, idx) => {
      const code = res.getResponseCode();
      const target = targets[idx];
      console.log(`[Ping ${idx + 1}/${targets.length}] [${target.role}] ${target.url} -> HTTP ${code}`);
    });
  } catch (err) {
    console.error('Lỗi khi fetchAll ping:', err.message);
  }
}

/**
 * Alias cho hàm ping để gọi với tên tổng quát
 */
function pingAllServices() {
  pingAllWorkers();
}

/**
 * Hàm thiết lập Trigger tự động chạy định kỳ 5 phút/lần
 * CHỈ CẦN BẤM CHẠY HÀM NÀY 1 LẦN DUY NHẤT TẠI GIAO DIỆN APPS SCRIPT
 */
function setupTrigger() {
  // Xóa các trigger cũ trùng lặp
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === 'pingAllWorkers' || fn === 'pingAllServices') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Tạo trigger mới mỗi 5 phút
  ScriptApp.newTrigger('pingAllWorkers')
    .timeBased()
    .everyMinutes(5)
    .create();

  console.log('✅ Đã thiết lập thành công Trigger ping định kỳ 5 phút/lần cho hàm pingAllWorkers (Master & Workers)!');
}
