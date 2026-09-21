# 🚀 Hướng Dẫn Deploy Lên Render (Hỗ Trợ Chạy Nhiều Render Để Vượt Giới Hạn IP)

Tài liệu này hướng dẫn bạn cách triển khai bot theo mô hình **Master - Worker** trên nền tảng **Render (Free)** để vượt qua giới hạn IP (IP limit/max connections per IP) của Server Minecraft KingMC.

---

## 🏗️ Tổng Quan Mô Hình Triển Khai (Architecture)

1. **Render 1 (Master - Discord Bot):**
   - Đảm nhận việc nhận lệnh từ Discord (`/stats`, `/bal`).
   - Quản lý Hàng Đợi (Queue Manager).
   - Tự động tìm Render Worker nào đang Rảnh (trên địa chỉ IP khác) để gửi lệnh thực thi.
   - Nhận thông báo sự kiện (disconnect, kick) từ Worker để gửi cho Admin qua Discord.
   - Cấu hình: `BOT_ROLE=master`

2. **Render 2, Render 3... (Worker Bots - Vệ tinh):**
   - Mỗi Render Worker tạo 1 Web Service trên Render -> Sở hữu **1 Địa chỉ IP Cloud riêng biệt**.
   - Mỗi Worker duy trì 1 tài khoản Minecraft Bot AFK in-game.
   - Mở HTTP API endpoint để Master gọi lấy dữ liệu.
   - Cấu hình: `BOT_ROLE=worker`

*(Ghi chú: Nếu bạn chỉ có 1 tài khoản bot Minecraft và muốn chạy đơn giản trên 1 Render duy nhất, hãy đặt `BOT_ROLE=standalone`).*

---

## 🛠️ Hướng Dẫn Chi Tiết Triển Khai

### BƯỚC 1: Tạo Render Master (Discord Bot & Điều phối)

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
   * `MONGODB_URI`: Chuỗi kết nối MongoDB Atlas M0 Free (ví dụ: `mongodb+srv://user:pass@cluster.mongodb.net/kingmc_stats?retryWrites=true&w=majority`) để lưu trữ lịch sử số dư 3 ngày không bao giờ mất khi Render reset.
7. Nhấn **Deploy**. Copy URL của Master (Ví dụ: `https://kingmc-master-bot.onrender.com`).

---

### BƯỚC 2: Tạo Render Worker 1 (Tài khoản MC 1 - IP 1)

1. Truy cập Render dashboard -> **New +** -> **Web Service**.
2. Kết nối tới Repository GitHub của bot.
3. Đặt tên: `kingmc-worker-1`
4. Runtime: `Node`
5. Build Command: `npm install`
6. Start Command: `node index.js`
7. Cấu hình **Environment Variables**:
   * `BOT_ROLE`: `worker`
   * `WORKER_SECRET`: `dat_mot_mat_khau_bi_mat_123` *(phải giống nhau trên Master và các Worker)*
   * `MASTER_URL`: `https://kingmc-master-bot.onrender.com` *(URL của Master lấy từ Bước 1 để Worker báo cáo)*
   * `MC_USERNAME`: `TênBotMinecraft01`
   * `MC_PASSWORD`: `mat_khau_bot_1`
   * `MC_SERVER_HOSTS`: `sgp.kingmc.vn,kingmc.vn`
   * `MC_SERVER_PORT`: `25565`
8. Nhấn **Deploy** -> Copy URL của Worker 1 (Ví dụ: `https://kingmc-worker-1.onrender.com`). Sau đó nhớ cập nhật URL này vào biến `WORKER_URLS` của Master nhé.

---

### BƯỚC 3: Tạo Render Worker 2 (Tài khoản MC 2 - IP 2) *(Nếu muốn chạy 2+ IP)*

1. Lặp lại bước 2 trên Render để tạo thêm 1 Web Service mới.
2. Đặt tên: `kingmc-worker-2`
3. Cấu hình **Environment Variables**:
   * `BOT_ROLE`: `worker`
   * `WORKER_SECRET`: `dat_mot_mat_khau_bi_mat_123`
   * `MASTER_URL`: `https://kingmc-master-bot.onrender.com`
   * `MC_USERNAME`: `TênBotMinecraft02`
   * `MC_PASSWORD`: `mat_khau_bot_2`
   * `MC_SERVER_HOSTS`: `sgp.kingmc.vn,kingmc.vn`
   * `MC_SERVER_PORT`: `25565`
4. Nhấn **Deploy** -> Copy URL của Worker 2 (Ví dụ: `https://kingmc-worker-2.onrender.com`). Nhớ cập nhật URL này vào biến `WORKER_URLS` của Master.

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

---

## 📈 Tính Năng Theo Dõi Số Dư (Balance Tracker) & Biểu Đồ 3 Ngày

Hệ thống tích hợp tính năng tự động theo dõi biến động số dư của người chơi và xuất biểu đồ trực quan:

1. **Cách theo dõi số dư:**
   - Người dùng gõ lệnh `/bal <tên_người_chơi>` (hoặc `?bal <tên>`).
   - Nhấn nút **`🔔 Theo dõi số dư`** bên dưới tin nhắn kết quả để kích hoạt theo dõi.
   - Master sẽ tự động điều phối lần lượt cho các Worker rảnh kiểm tra số dư định kỳ **1 giờ / lần** và lưu trữ lịch sử trên **MongoDB Atlas** (lưu trữ tối đa 3 ngày gần nhất).

2. **Xuất biểu đồ biến động:**
   - Khi đang theo dõi, người dùng bấm nút **`📈 Xem biểu đồ biến động`** (hoặc nhấn theo dõi lần nữa).
   - Bot sẽ sử dụng Puppeteer kết xuất ra ảnh **Biểu đồ đường (Line Chart PNG)** sắc nét kèm avatar skin 3D, số dư cao nhất (Đỉnh), thấp nhất (Đáy), số dư hiện tại và mức biến động (+/- $ và %).
   - Bấm **`Hủy theo dõi`** nếu muốn dừng theo dõi người chơi đó.

3. **Tự động nhận diện biến môi trường Render:**
   - Hệ thống tự động đọc các biến môi trường có tiền tố `td-<tên_người_chơi>` (ví dụ `td-BinhLH`) khi khởi động để đưa vào danh sách theo dõi.

---

## ⚙️ Các Chế Độ Mặc Định & Lệnh Quản Trị Admin

* **Chế độ hiển thị danh sách (`displayMode`):** Mặc định là **`IMAGE`** (xuất bảng ảnh 3D icon Minecraft cho `/ah`, `/order`). Đổi chế độ qua lệnh `!mode text` hoặc `!mode image`.
* **Tính năng Trò chuyện AI:** Mặc định **TẮT**. Bật lại bằng lệnh `!ai on [lời_nhắn]` (hoặc tắt bằng `!ai off`).
* **Lệnh Quản trị Balance Tracker:**
  - `!tracker`: Xem danh sách toàn bộ người chơi đang được theo dõi và trạng thái MongoDB.
  - `!tracker check`: Kích hoạt chu kỳ kiểm tra số dư ngay lập tức mà không cần chờ 1 giờ.
  - `!tracker untrack <tên>`: Hủy theo dõi một người chơi thủ công.

Chúc mừng! Hệ thống Bot Discord của bạn giờ đây đã được vận hành chuyên nghiệp với kiến trúc phân tán nhiều IP, có Hàng đợi điều phối tự động 24/7 và hệ thống theo dõi số dư đám mây MongoDB Atlas!
