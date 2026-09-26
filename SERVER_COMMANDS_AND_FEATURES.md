# 📜 DANH SÁCH LỆNH, HỆ THỐNG MÁY CHỦ & ĐỀ XUẤT TÍNH NĂNG MỚI (KINGMC.VN)

> **Tài liệu được trích xuất tự động qua Bot khảo sát in-game trực tiếp trên cụm KingSMP (KingMC.vn).**  
> *Thời gian khảo sát:* 26/09/2026

---

## 🌐 1. TỔNG QUAN HỆ THỐNG MÁY CHỦ KINGMC

Máy chủ KingMC hoạt động theo mô hình mạng phân cụm (Proxy Velocity 1.7.2 - 1.21+), với lưu lượng thường trực trên **4.100+ người chơi online**.

### Các cụm máy chủ trong Menu Sảnh chính:
1. **KingSMP (Cụm máy chủ chính của Bot - Slot 24):**
   * *Mô tả:* Chế độ sinh tồn SMP cơ bản, PvP bật, chết rơi đồ, có hệ thống chợ đen và kinh tế cực kỳ sôi động.
   * *Số lượng người chơi:* **3.260+ người chơi online**.
   * *Phiên bản:* Minecraft Java 1.20+ / Bedrock hỗ trợ qua Geyser (Floodgate).
2. **MEGA EARTH (Slot 20):** Sinh tồn trên bản đồ mô phỏng Trái Đất tỉ lệ thực 500k block (~160+ người chơi).
3. **MEGA SKYBLOCK (Slot 22):** Sinh tồn đảo bay cổ điển.
4. **BATTLE ROYALE (Slot 42):** Minigame sinh tồn vòng bo PUBG/Free Fire trong Minecraft (~620+ người chơi).

---

## 📋 2. BẢNG TỔNG HỢP CÁC LỆNH IN-GAME & CHỨC NĂNG (CỤM KINGSMP)

Dưới đây là danh sách toàn bộ các câu lệnh đã được xác minh hoạt động trực tiếp trên cụm KingSMP:

### 💰 Nhóm 1: Kinh Tế & Thị Trường (Economy & Trading)

| Câu lệnh | Cú pháp | Phản hồi / Giao diện GUI | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `/bal` | `/bal [tên_player]` | Tin nhắn chat hệ thống | Xem số dư tiền mặt ($) của bản thân hoặc người chơi khác. |
| `/baltop` | `/baltop` | GUI Chest 90 slots (`ᴛᴏᴘ ᴍᴏɴᴇʏ`) | Mở bảng xếp hạng đại gia giàu nhất server (phân trang, hiển thị số dư lên tới hàng chục tỷ $ và skin đầu người chơi). |
| `/pay` | `/pay <tên_player> <số_tiền>` | Tin nhắn chat xác nhận chuyển tiền | Chuyển tiền từ ví của mình sang tài khoản người chơi khác. |
| `/ah` | `/ah [từ_khóa]` | GUI Chợ Đấu Giá 54 slots | Chợ Đấu Giá (Auction House): Xem, tìm kiếm và mua vật phẩm đang được người chơi rao bán. |
| `/order` | `/order [từ_khóa]` | GUI Đơn Hàng 54 slots | Hệ thống đặt mua tự động (Market Order): Người chơi treo tiền và số lượng để thu gom vật phẩm. |
| `/shop` | `/shop` | GUI Cửa Hàng 63 slots (`sʜᴏᴘ`) | Cửa hàng máy chủ với các gian hàng: **Shop End, Shop Nether, Shop Gear, Shop Food, Shop Shard**. |

### 🏆 Nhóm 2: Xếp Hạng & Chỉ Số Người Chơi (Stats & Leaderboard)

| Câu lệnh | Cú pháp | Phản hồi / Giao diện GUI | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `/stats` | `/stats [tên_player]` | GUI Đầu Người Chơi (`ꜱᴛᴀᴛꜱ`) | Mở bảng thống kê chi tiết chỉ số của người chơi (PvP Kills, Deaths, Đi bộ, Đào block, Giờ chơi...). |
| `/leaderboard` | `/leaderboard` | GUI 63 slots (`/ʟᴇᴀᴅᴇʀʙᴏᴀʀᴅ`) | Bảng vinh danh Top 10 của 9 chỉ số toàn server: Kills, Deaths, Played, Blocks Placed, Blocks Mined, Mob Kills, Shop Buy, Shop Sell, Animals Breed. |

### 🧭 Nhóm 3: Dịch Chuyển & Tiện Ích Sinh Tồn (Teleport & Utility)

| Câu lệnh | Cú pháp | Phản hồi / Giao diện GUI | Mô tả chức năng |
| :--- | :--- | :--- | :--- |
| `/rtp` | `/rtp` | GUI 63 slots (chọn slot 15) | Random Teleport: Dịch chuyển ngẫu nhiên ra vùng hoang dã an toàn để cắm trại, farm đồ, sinh tồn. |
| `/warp` | `/warp <tên_warp>` | Dịch chuyển tức thời | Dịch chuyển tới các khu vực công cộng: `/warp afk` (treo máy nhận Shard), `/warp donate` (xem tỷ giá nạp). |
| `/tpa` | `/tpa <tên_player>` | Gửi yêu cầu dịch chuyển | Xin phép dịch chuyển tới vị trí của người chơi khác (khi người kia mở GUI chấp nhận). |
| `/rule` | `/rule` | Bảng chat hướng dẫn | Xem nội quy, điều khoản cấm và hướng dẫn cơ bản của server. |

### 💎 Nhóm 4: Nạp Thẻ, Tài Khoản & Tiền Tệ Đặc Biệt

| Câu lệnh / Khái niệm | Mô tả & Cách thức hoạt động |
| :--- | :--- |
| `/donate` | Hướng dẫn nạp thẻ cào để đổi lấy **Xu**. |
| `/donatebank` | Hướng dẫn chuyển khoản ngân hàng nạp Xu (được tặng thêm **+20% Xu khuyến mãi**). |
| **Hệ thống Tiền tệ:** | • **Tiền mặt ($):** Tiền tệ lưu thông chính in-game (giao dịch, mua bán qua `/ah`, `/order`, `/pay`).<br>• **Xu:** Tiền nạp từ thẻ/ngân hàng.<br>• **Shard (Đá tím):** Tiền tệ cày cuốc đặc biệt nhận được khi treo máy tại `/warp afk` hoặc hạ gục người chơi tại Overworld; dùng đổi đồ VIP tại `Shop Shard`. |

### 📊 "Tỷ giá thị trường chợ đen" thực tế từ chat cộng đồng KingMC:
* **Spawner Skeleton (Ske):** ~`20.000.000$` – `22.000.000$` / cái.
* **Spawner Creeper (Crep):** ~`25.000.000$` – `28.000.000$` / cái.
* **Spawner Blaze:** ~`15.000.000$` / cái.
* **Elytra (Cánh cứng):** Thường được quy đổi tương đương ~`65 Spawner Ske` hoặc `55 Spawner Crep` (~1.3 - 1.4 Tỷ $).

---

## 💡 3. BẢNG SO SÁNH HIỆN TRẠNG BOT & MỎ VÀNG DỮ LIỆU CHƯA KHAI THÁC

| Tính năng | Hiện trạng Bot | Tiềm năng khai thác thêm |
| :--- | :---: | :--- |
| **Xem số dư (`/bal`)** | ✅ Đã có | Cần thêm biểu đồ tăng trưởng tài sản theo ngày/tuần. |
| **Xem stats (`/stats`)** | ✅ Đã có | So sánh đối đầu stats giữa 2 người chơi (Compare Stats). |
| **Chợ đấu giá (`/ah`)** | ✅ Đã có | Chưa có thông báo khi có hàng giá rẻ (Sniper Alert). |
| **Đơn đặt hàng (`/order`)** | ✅ Đã có | Chưa có tính năng gợi ý giá đặt đơn hàng hợp lý nhất. |
| **Bảng xếp hạng đại gia** | ⚠️ Đang quét nền | Chưa có lệnh Discord hiển thị bảng xếp hạng trực tiếp. |
| **Leaderboard Server (9 mục)** | ❌ Chưa có | Server có sẵn `/leaderboard` cực đẹp với 9 hạng mục PvP/cày cuốc. |
| **Dữ liệu Shop Server (`/shop`)** | ❌ Chưa có | Chưa có tính năng tra cứu giá vật phẩm bán trong shop End/Nether/Gear. |
| **Tỷ giá thị trường (Spawner/Item)** | ❌ Chưa có | Người chơi chat mua bán Spawner liên tục nhưng chưa có tracker giá. |

---

## 🚀 4. ĐỀ CỬ 6 TÍNH NĂNG MỚI ĐỘT PHÁ NÊN PHÁT TRIỂN CHO BOT

Dưới đây là 6 tính năng tiềm năng nhất được thiết kế riêng cho hệ sinh thái KingMC:

### 🌟 1. Lệnh Bảng Vinh Danh Server: `/leaderboard` hoặc `/top` (Độ ưu tiên: Cao)
* **Ý tưởng:** Khai thác GUI `/leaderboard` và `/baltop` có sẵn của server KingSMP.
* **Cách hoạt động:** Cho phép người dùng Discord xem Top 10 của các hạng mục:
  * 👑 *Top Đại gia ($)* (từ Baltop)
  * ⚔️ *Top Kills (PvP)*
  * 💀 *Top Deaths*
  * ⏳ *Top Giờ chơi (Playtime)*
  * ⛏️ *Top Đào khoáng (Blocks Mined)*
  * 🏹 *Top Săn quái (Mob Kills)*
* **Giá trị mang lại:** Tạo sự cạnh tranh gay gắt và động lực đua top giữa các người chơi/clan ngay trên Discord!

### 🎯 2. Trợ Lý Săn Hàng Hời & Cảnh Báo Giá Tự Động: `/sniper` hoặc `/alert` (Độ ưu tiên: Cực cao)
* **Ý tưởng:** "Stock Market Tracker" dành riêng cho chợ đen KingMC.
* **Cách hoạt động:**
  * Người chơi gõ `/alert add item:spawner_skeleton max_price:19000000` (Báo cho tôi nếu có ai bán Spawner Ske dưới 19M).
  * Hoặc `/alert add item:elytra max_price:1000000000`.
  * Bot định kỳ 2-5 phút mở ngầm `/ah` kiểm tra. Nếu tìm thấy vật phẩm thỏa mãn điều kiện giá rẻ, bot tự động gửi DM hoặc tag người dùng trên Discord: *"🚨 Phát hiện Spawner Skeleton đang bán chỉ 18.5M bởi người chơi [XYZ]! Hãy vào game xúc ngay!"*
* **Giá trị mang lại:** Tính năng siêu "hot" mà bất kỳ dân buôn hay người cày cuốc nào trên KingMC cũng khao khát!

### 📈 3. Chỉ Số Tỷ Giá Thị Trường Spawner & Vật Phẩm Hot: `/market` hoặc `/price` (Độ ưu tiên: Cao)
* **Ý tưởng:** Tổng hợp dữ liệu giá sàn (thấp nhất), giá trần (cao nhất), và giá trung bình từ `/ah` và `/order`.
* **Cách hoạt động:** Gõ `/price ske` -> Bot trả lời:
  * *Giá trung bình 24h qua:* 20.8M$
  * *Đang rao bán rẻ nhất trên AH:* 20.0M$ (bởi `playerA`)
  * *Đơn hàng thu mua cao nhất trên Order:* 20.5M$ (bởi `playerB`)
  * *Biến động:* ↗️ Tăng 3.5% so với hôm qua.
* **Giá trị mang lại:** Giúp người chơi định giá chính xác tài sản, tránh bị mua đắt hoặc bán hớ.

### 🏪 4. Tra Cứu Danh Mục Cửa Hàng Server: `/shop` (Độ ưu tiên: Trung bình)
* **Ý tưởng:** Tra cứu danh mục hàng hóa của server mà không cần mở game.
* **Cách hoạt động:** Gõ `/shop shard` hoặc `/shop gear` -> Bot hiển thị danh sách các vật phẩm có thể mua/đổi, giá tiền mặt hoặc số Shard cần thiết để sở hữu.

### ⚔️ 5. So Kèo Chỉ Số Đối Đầu PvP: `/compare <player1> <player2>` (Độ ưu tiên: Trung bình)
* **Ý tưởng:** Cho phép 2 người chơi so sánh chỉ số trực tiếp với nhau.
* **Cách hoạt động:** Bot lấy dữ liệu `/stats` của cả 2 bên và render ra 1 ảnh hoặc bảng so sánh đối đầu: K/D Ratio, số giờ chơi, tài sản chênh lệch, ai nhỉnh hơn ở khía cạnh nào. Rất thích hợp cho các trận gạ kèo PvP hoặc tranh cãi trình độ trong server.

### 🎲 6. Bot Trung Gian / Mini-game Sự Kiện Tự Động (Độ ưu tiên: Ý tưởng mở rộng)
* **Ý tưởng:** Tận dụng tính năng `/pay` và chat ingame của bot để làm trung gian uy tín hoặc tổ chức minigame (Lô tô, Quay số may mắn, Đoán số trúng thưởng) tự động trả thưởng in-game cho thành viên Discord.

---

> [!TIP]
> **Đề xuất bước tiếp theo:** Bạn có thể chọn ngay **1 hoặc 2 tính năng** bạn thích nhất trong danh sách trên (ví dụ: *Tính năng #1 - Bảng xếp hạng `/top`* hoặc *Tính năng #2 - Cảnh báo giá `/alert`*) để chúng ta cùng tiến hành lên kế hoạch chi tiết và code nhé!
