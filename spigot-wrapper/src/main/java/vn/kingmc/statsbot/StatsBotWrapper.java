package vn.kingmc.statsbot;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

/**
 * Lớp chính của plugin Spigot Wrapper quản lý Discord Bot ký sinh.
 */
public class StatsBotWrapper extends JavaPlugin {

    private ProcessMonitor processMonitor;
    private File botFolder;

    @Override
    public void onEnable() {
        getLogger().info("=================================================");
        getLogger().info("   BotCheckStatsWrapper đang khởi động...       ");
        getLogger().info("=================================================");

        // 1. Tạo và nạp config.yml
        saveDefaultConfig();
        FileConfiguration config = getConfig();

        // 2. Thiết lập thư mục chứa mã nguồn Node.js
        String botFolderName = config.getString("bot-folder", "bot");
        botFolder = new File(getDataFolder(), botFolderName);
        if (!botFolder.exists()) {
            boolean created = botFolder.mkdirs();
            if (created) {
                getLogger().info("[Init] Đã tạo thư mục bot: " + botFolder.getAbsolutePath());
            }
        }

        // Kiểm tra xem file index.js có tồn tại trong thư mục bot không
        File indexJs = new File(botFolder, "index.js");
        if (!indexJs.exists()) {
            getLogger().warning("=================================================");
            getLogger().warning(" ⚠️ PHÁT HIỆN THIẾU MÃ NGUỒN NODE.JS BOT ⚠️");
            getLogger().warning(" Vui lòng sao chép các file của Discord Bot bao gồm:");
            getLogger().warning(" - index.js, mc-bot.js, package.json");
            getLogger().warning(" - và thư mục node_modules");
            getLogger().warning(" Vào thư mục sau trên Server Minecraft:");
            getLogger().warning(" " + botFolder.getAbsolutePath());
            getLogger().warning(" Sau đó, hãy khởi động lại server hoặc reload plugin.");
            getLogger().warning("=================================================");
            return;
        }

        // 3. Lấy cấu hình kiểm tra mạng
        String hostsStr = config.getString("minecraft-bot.hosts", "sgp.kingmc.vn,kingmc.vn");
        int mcPort = config.getInt("minecraft-bot.port", 25565);
        String firstHost = hostsStr.split(",")[0].trim();

        // Kiểm tra kết nối outbound
        boolean networkOk = NetworkUtils.checkOutboundNetwork(getLogger(), firstHost, mcPort);
        if (!networkOk) {
            getLogger().warning("[NetworkCheck] Phát hiện sự cố kết nối mạng đi ngoài. Bot có thể hoạt động không ổn định.");
        }

        // 4. Thu thập các biến cấu hình để truyền làm biến môi trường (Environment Variables)
        Map<String, String> envVars = new HashMap<>();
        
        // Discord Configs
        envVars.put("DISCORD_TOKEN", config.getString("discord.token", ""));
        envVars.put("CLIENT_ID", config.getString("discord.client-id", ""));
        envVars.put("GUILD_ID", config.getString("discord.guild-id", ""));
        envVars.put("ADMIN_ID", config.getString("discord.admin-id", ""));

        // Minecraft Bot Configs
        envVars.put("MC_USERNAME", config.getString("minecraft-bot.username", "CheckStatsBot"));
        envVars.put("MC_AUTH_TYPE", config.getString("minecraft-bot.auth-type", "offline"));
        envVars.put("MC_PASSWORD", config.getString("minecraft-bot.password", ""));
        envVars.put("MC_SERVER_HOSTS", hostsStr);
        envVars.put("MC_SERVER_PORT", String.valueOf(mcPort));
        envVars.put("BOT_CHECK_TIMEOUT", String.valueOf(config.getInt("minecraft-bot.timeout", 15000)));
        
        // bypass Render Health Check port mặc định khi chạy ký sinh (chọn random port hoặc set port tượng trưng)
        envVars.put("PORT", "29999"); 

        // 5. Khởi tạo ProcessMonitor giám sát subprocess Node.js
        String nodePath = config.getString("node-path", "");
        String absoluteNodePath = "";
        
        if (nodePath != null && !nodePath.trim().isEmpty()) {
            File nodeFile = new File(nodePath.trim());
            if (!nodeFile.isAbsolute()) {
                // Java tự động phân giải tương đối so với thư mục chạy (user.dir)
                nodeFile = nodeFile.getAbsoluteFile();
            }
            
            if (!nodeFile.exists()) {
                getLogger().severe("=================================================");
                getLogger().severe(" ❌ KHÔNG TÌM THẤY FILE THỰC THI NODE.JS ❌");
                getLogger().severe(" Đường dẫn cấu hình: " + nodePath);
                getLogger().severe(" Đường dẫn tuyệt đối tìm kiếm: " + nodeFile.getAbsolutePath());
                getLogger().severe(" Vui lòng kiểm tra lại xem file node đã được giải nén đúng chưa!");
                getLogger().severe("=================================================");
                return;
            }
            
            // Cấp quyền thực thi cho file node (cực kỳ quan trọng khi chạy trên host Linux free)
            if (!nodeFile.canExecute()) {
                getLogger().info("[Init] Phát hiện file node chưa có quyền thực thi. Đang cố gắng cấp quyền...");
                boolean success = nodeFile.setExecutable(true);
                if (success) {
                    getLogger().info("[Init] ✓ Cấp quyền thực thi thành công.");
                } else {
                    getLogger().warning("[Init] ✗ Không thể cấp quyền thực thi. Bạn có thể cần tự chạy lệnh chmod +x cho file node này.");
                }
            }
            absoluteNodePath = nodeFile.getAbsolutePath();
        } else {
            absoluteNodePath = "node"; // Sử dụng node có sẵn trong hệ thống
        }

        processMonitor = new ProcessMonitor(getLogger(), absoluteNodePath, botFolder, envVars);
        processMonitor.start();

        getLogger().info("Plugin Wrapper đã được kích hoạt và khởi chạy tiến trình giám sát bot.");
    }

    @Override
    public void onDisable() {
        getLogger().info("Đang tắt plugin Wrapper...");
        if (processMonitor != null) {
            processMonitor.stop();
            processMonitor = null;
        }
        getLogger().info("Đã tắt plugin Wrapper và giải phóng tài nguyên subprocess.");
    }
}
