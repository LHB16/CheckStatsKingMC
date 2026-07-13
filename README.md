# 🚀 Hướng Dẫn Deploy Lên Render & Google Apps Script Keep-Alive

Tài liệu này hướng dẫn bạn cách đưa Bot Discord check stats lên cloud **Render** (miễn phí) và cấu hình **Google Apps Script** để ping bot 5 phút một lần giúp bot hoạt động liên tục không bị ngủ đông.

---

## 1. Deploy Lên Render (Web Service)

Render cung cấp gói miễn phí (Free Tier) rất phù hợp cho bot, nhưng yêu cầu ứng dụng phải bind vào một cổng HTTP (đã được cấu hình sẵn trong code trên cổng `3000` hoặc tự động nhận cổng từ Render qua `process.env.PORT`).

### Các bước thực hiện:

1. **Đưa code lên GitHub:**
   - Tạo một repository mới trên GitHub (để chế độ riêng tư - Private).
   - Commit toàn bộ code trong thư mục `botCheckStatsKingMC` lên repo này (không commit file `.env`).

2. **Tạo Web Service trên Render:**
   - Đăng nhập vào [Render.com](https://render.com/).
   - Click nút **New +** ở góc phải -> Chọn **Web Service**.
   - Kết nối tài khoản GitHub của bạn và chọn repository bot vừa tải lên.

3. **Cấu hình thông số Web Service:**
   - **Name:** Đặt tên cho dịch vụ của bạn (Ví dụ: `kingmc-stats-bot`).
   - **Region:** Chọn vùng gần Việt Nam nhất (Ví dụ: `Singapore` hoặc `Oregon`).
   - **Branch:** `main` (hoặc branch chính của bạn).
   - **Root Directory:** Để trống (nếu code nằm ngay ngoài thư mục gốc).
   - **Runtime:** `Node`.
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Chọn gói **Free**.

4. **Cấu hình Biến môi trường (Environment Variables):**
   - Kéo xuống dưới click vào mục **Advanced** -> Chọn **Add Environment Variable**.
   - Thêm đầy đủ các biến môi trường tương tự như file `.env`:
     * `DISCORD_TOKEN`: Token của Discord Bot.
     * `CLIENT_ID`: Application ID của Discord Bot.
     * `GUILD_ID`: ID Server Discord test (nếu muốn đăng ký slash command ngay lập tức). Nếu muốn đăng ký toàn cầu thì để trống hoặc không điền.
     * `MC_USERNAME`: Tên tài khoản Minecraft clone dùng để check stats (Ví dụ: `CheckStatsBot`).
     * `MC_AUTH_TYPE`: `offline` (hoặc `microsoft`).
     * `MC_PASSWORD`: Mật khẩu tài khoản (nếu dùng microsoft hoặc server yêu cầu đăng nhập).
     * `MC_SERVER_HOSTS`: `sgp.kingmc.vn,kingmc.vn`
     * `MC_SERVER_PORT`: `25565`
     * `BOT_CHECK_TIMEOUT`: `15000`

5. **Deploy:**
   - Nhấn **Deploy Web Service** và chờ Render build + start ứng dụng.
   - Khi màn hình hiện log `[HTTP-Server] Đang chạy trên cổng...` và Render hiển thị trạng thái **Live** (màu xanh lá) là thành công.
   - Copy URL của Web Service từ Render dashboard (dạng: `https://ten-app-cua-ban.onrender.com`).

---

## 2. Cấu Hưng Google Apps Script Để Ping Render Không Ngủ (Keep-Alive)

Mặc định, dịch vụ Free trên Render sẽ tự động "ngủ đông" (Spin down) nếu không nhận được yêu cầu HTTP nào sau 15 phút. Khi ngủ đông, bot Discord sẽ bị offline. Ta sẽ dùng Google Apps Script (hoàn toàn miễn phí và chạy ngầm trên máy chủ Google) để cứ mỗi 5 phút gửi 1 request ping đến Render để đánh thức bot.

### Các bước thực hiện:

1. Truy cập vào trang quản lý [Google Apps Script](https://script.google.com/).
2. Đăng nhập bằng tài khoản Google của bạn.
3. Click vào nút **Dự án mới (New Project)**.
4. Xóa toàn bộ code mặc định trong trình biên tập và dán đoạn code sau vào:

```javascript
// Thay thế URL dưới đây bằng URL Web Service Render của bạn
const RENDER_APP_URL = "https://ten-app-cua-ban.onrender.com/";

function keepPlaystatsBotAlive() {
  try {
    const response = UrlFetchApp.fetch(RENDER_APP_URL);
    const responseCode = response.getResponseCode();
    Logger.log("Ping Render thành công! Mã phản hồi: " + responseCode);
  } catch (error) {
    Logger.log("Lỗi khi ping Render: " + error.toString());
  }
}
```

5. Click vào biểu tượng **Lưu (Save - hình đĩa mềm)** hoặc nhấn `Ctrl + S`. Bạn có thể đổi tên dự án thành `Ping Render Stats Bot`.
6. Nhấp vào nút **Chạy (Run)** để test thử script. 
   - *Lưu ý:* Lần đầu chạy Google sẽ yêu cầu cấp quyền (Authorization). Bạn click **Xem quyền (Review Permissions)** -> Chọn tài khoản Google -> Click **Nâng cao (Advanced)** -> Chọn **Đi tới dự án không an toàn (Go to project (unsafe))** -> Chọn **Cho phép (Allow)**.
   - Kiểm tra tab "Nhật ký thực thi (Execution log)" bên dưới, nếu hiện `Ping Render thành công! Mã phản hồi: 200` nghĩa là code chạy hoàn hảo.

### Thiết lập Trigger tự động chạy mỗi 5 phút:

1. Nhìn sang cột menu bên trái, click vào biểu tượng **Kích hoạt (Triggers - hình đồng hồ báo thức)**.
2. Click nút **Thêm bộ kích hoạt (Add Trigger)** ở góc dưới bên phải.
3. Cấu hình bộ kích hoạt như sau:
   - **Chọn chức năng để chạy (Choose which function to run):** `keepPlaystatsBotAlive`
   - **Chọn triển khai để chạy (Choose which deployment should run):** `Head`
   - **Chọn nguồn sự kiện (Select event source):** `Theo thời gian (Time-driven)`
   - **Chọn loại trình kích hoạt dựa trên thời gian (Select type of time-based trigger):** `Trình hẹn giờ theo phút (Minutes timer)`
   - **Chọn khoảng thời gian tính bằng phút (Select minute interval):** `Mỗi 5 phút (Every 5 minutes)`
4. Nhấn **Lưu (Save)** ở góc dưới.

Từ bây giờ, cứ mỗi 5 phút, Google Apps Script sẽ tự động gửi 1 request GET đến Render để giữ cho container luôn hoạt động, đảm bảo bot Discord của bạn hoạt động 24/7 không bao giờ ngủ đông!
