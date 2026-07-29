# 🛠️ MINECRAFT GUI DEBUG BOT

Công cụ Debug Bot Minecraft tương tác giúp soi chi tiết dữ liệu (Item ID, NBT Tag, CustomName, Lore) từng ô vật phẩm khi mở GUI trong server Minecraft.

## 🚀 Cách sử dụng

### 1. Khởi chạy Debug Bot
Mở Terminal tại thư mục gốc của dự án và chạy câu lệnh:

```bash
node debug/debug_bot.js
```

### 2. Các câu lệnh tương tác trong Console
Sau khi bot spawn vào server thành công, bạn có thể gõ trực tiếp các lệnh sau trong Terminal:

- **Gõ lệnh Chat / Lệnh Minecraft:**
  - `/order tri` (Mở danh sách đơn hàng cho vật phẩm tri/trident)
  - `/ah elytra` (Mở danh sách đấu giá elytra)
  - `/menu` (Mở menu server)
  - `/warp afk` (Warp sang khu vực AFK)

- **Thao tác GUI:**
  - `click <slot_number>`: Nhấp vào ô slot trong GUI đang mở (Ví dụ: `click 24`).
  - `close`: Đóng cửa sổ GUI hiện tại.
  - `dump`: In lại toàn bộ cấu trúc dữ liệu JSON của GUI vừa mở ra Console.
  - `quit` hoặc `exit`: Ngắt kết nối và thoát bot.

### 3. File log tự động
Mỗi khi một GUI bất kỳ được mở, thông tin chi tiết của tất cả item trong GUI đó sẽ tự động được xuất ra file JSON:

📁 **`debug/last_gui_dump.json`**

Bạn có thể mở file này ra bằng VS Code hoặc bất kỳ trình soạn thảo văn bản nào để xem/copy cấu trúc JSON chính xác của server.
