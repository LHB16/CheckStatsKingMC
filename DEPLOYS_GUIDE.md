# 🚀 Hướng Dẫn Deploy Lên Render (Hỗ Trợ Chạy Nhiều Render Để Vượt Giới Hạn IP)

Tài liệu này hướng dẫn bạn cách triển khai bot theo mô hình **Master - Worker** trên nền tảng **Render (Free)** để vượt qua giới hạn IP (IP limit/max connections per IP) của Server Minecraft KingMC.

---

## 🏗️ Tổng Quan Mô Hình Triển Khai (Architecture)

1. **Render 1 (Master - Discord Bot):**
   - Đảm nhận việc nhận lệnh từ Discord (`/stats`, `/bal`).
   - Quản lý Hàng Đợi (Queue Manager).
   - Tự động tìm Render Worker nào đang Rảnh (trên địa chỉ IP khác) để gửi lệnh thực thi.
   - Cấu hình: `BOT_ROLE=master`

2. **Render 2, Render 3... (Worker Bots - Vệ tinh):**
   - Mỗi Render Worker tạo 1 Web Service trên Render -> Sở hữu **1 Địa chỉ IP Cloud riêng biệt**.
   - Mỗi Worker duy trì 1 tài khoản Minecraft Bot AFK in-game.
   - Mở HTTP API endpoint để Master gọi lấy dữ liệu.
   - Cấu hình: `BOT_ROLE=worker`

*(Ghi chú: Nếu bạn chỉ có 1 tài khoản bot Minecraft và muốn chạy đơn giản trên 1 Render duy nhất, hãy đặt `BOT_ROLE=standalone`).*

---

## 🛠️ Hướng Dẫn Chi Tiết Triển Khai

### BƯỚC 1: Tạo Render Worker 1 (Tài khoản MC 1 - IP 1)

1. Truy cập Render dashboard -> **New +** -> **Web Service**.
2. Kết nối tới Repository GitHub của bot.
3. Đặt tên: `kingmc-worker-1`
4. Runtime: `Node`
5. Build Command: `npm install`
6. Start Command: `node index.js`
7. Cấu hình **Environment Variables**:
   * `BOT_ROLE`: `worker`
   * `WORKER_SECRET`: `dat_mot_mat_khau_bi_mat_123` *(phải giống nhau trên Master và các Worker)*
   * `MC_USERNAME`: `TênBotMinecraft01`
   * `MC_PASSWORD`: `mat_khau_bot_1`
   * `MC_SERVER_HOSTS`: `sgp.kingmc.vn,kingmc.vn`
   * `MC_SERVER_PORT`: `25565`
8. Nhấn **Deploy** -> Copy URL của Worker 1 (Ví dụ: `https://kingmc-worker-1.onrender.com`).

---

### BƯỚC 2: Tạo Render Worker 2 (Tài khoản MC 2 - IP 2) *(Nếu muốn chạy 2+ IP)*

1. Lặp lại bước 1 trên Render để tạo thêm 1 Web Service mới.
2. Đặt tên: `kingmc-worker-2`
3. Cấu hình **Environment Variables**:
   * `BOT_ROLE`: `worker`
   * `WORKER_SECRET`: `dat_mot_mat_khau_bi_mat_123`
   * `MC_USERNAME`: `TênBotMinecraft02`
   * `MC_PASSWORD`: `mat_khau_bot_2`
   * `MC_SERVER_HOSTS`: `sgp.kingmc.vn,kingmc.vn`
   * `MC_SERVER_PORT`: `25565`
4. Nhấn **Deploy** -> Copy URL của Worker 2 (Ví dụ: `https://kingmc-worker-2.onrender.com`).

---

### BƯỚC 3: Tạo Render Master (Discord Bot Chữ Ký)

1. Tạo Web Service mới trên Render.
2. Đặt tên: `kingmc-master-bot`
3. Runtime: `Node`
4. Build Command: `npm install`
5. Start Command: `node index.js`
6. Cấu hình **Environment Variables**:
   * `BOT_ROLE`: `master`
   * `WORKER_SECRET`: `dat_mot_mat_khau_bi_mat_123`
   * `WORKER_URLS`: `https://kingmc-worker-1.onrender.com,https://kingmc-worker-2.onrender.com` *(dán danh sách URL Worker cách nhau bằng dấu phẩy)*
   * `DISCORD_TOKEN`: Token Discord Bot
   * `CLIENT_ID`: Application ID Discord
   * `GUILD_ID`: ID Guild test (hoặc để trống nếu global)
   * `ADMIN_ID`: Discord ID Admin nhận tin nhắn báo lỗi
7. Nhấn **Deploy**. Copy URL của Master (Ví dụ: `https://kingmc-master-bot.onrender.com`).

---

## ⏰ Cấu Hình Google Apps Script Keep-Alive (Cho tất cả các Render)

Để giữ cho Master và các Workers không bị Render "ngủ đông" (Spin down) sau 15 phút:

1. Truy cập [Google Apps Script](https://script.google.com/).
2. Tạo dự án mới, dán code sau vào:

```javascript
const RENDER_URLS = [
  "https://kingmc-master-bot.onrender.com/health",
  "https://kingmc-worker-1.onrender.com/health",
  "https://kingmc-worker-2.onrender.com/health"
];

function keepAllBotsAlive() {
  RENDER_URLS.forEach(url => {
    try {
      const response = UrlFetchApp.fetch(url);
      Logger.log("Ping success [" + url + "]: " + response.getResponseCode());
    } catch (e) {
      Logger.log("Ping error [" + url + "]: " + e.toString());
    }
  });
}
```

3. Đặt Trigger tự động chạy hàm `keepAllBotsAlive` **mỗi 5 phút**.

Chúc mừng! Hệ thống Bot Discord của bạn giờ đây đã được vận hành chuyên nghiệp với kiến trúc phân tán nhiều IP, có Hàng đợi điều phối tự động 24/7!
