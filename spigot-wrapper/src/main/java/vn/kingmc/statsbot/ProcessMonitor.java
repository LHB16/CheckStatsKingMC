package vn.kingmc.statsbot;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Quản lý vòng đời tiến trình con chạy Node.js bot.
 * Tự động đọc log và restart nếu tiến trình con gặp sự cố.
 */
public class ProcessMonitor implements Runnable {

    private final Logger logger;
    private final String nodePath;
    private final File botDir;
    private final Map<String, String> envVariables;

    private Process process;
    private boolean shouldRun = true;
    private Thread monitorThread;
    private Thread stdoutThread;
    private Thread stderrThread;
    
    private int consecutiveCrashes = 0;
    private static final int MAX_CONSECUTIVE_CRASHES = 5;
    private static final long RESTART_DELAY_MS = 10000; // 10 giây

    public ProcessMonitor(Logger logger, String nodePath, File botDir, Map<String, String> envVariables) {
        this.logger = logger;
        this.nodePath = nodePath.isEmpty() ? "node" : nodePath;
        this.botDir = botDir;
        this.envVariables = envVariables;
    }

    /**
     * Bắt đầu thread giám sát tiến trình.
     */
    public synchronized void start() {
        if (monitorThread != null && monitorThread.isAlive()) {
            return;
        }
        shouldRun = true;
        monitorThread = new Thread(this, "BotCheckStats-Monitor");
        monitorThread.start();
    }

    /**
     * Dừng tiến trình con và thread giám sát một cách cưỡng bức.
     */
    public synchronized void stop() {
        shouldRun = false;
        logger.info("[Supervisor] Đang yêu cầu dừng bot Node.js...");
        
        if (process != null) {
            // Tắt tiến trình con một cách an toàn bằng cách gửi SIGTERM / destroy
            process.destroy();
            try {
                // Đợi tối đa 3 giây cho tiến trình con tắt tự nhiên
                long startTime = System.currentTimeMillis();
                while (process.isAlive() && System.currentTimeMillis() - startTime < 3000) {
                    Thread.sleep(100);
                }
                if (process.isAlive()) {
                    logger.warning("[Supervisor] Tiến trình Node.js không phản hồi SIGTERM. Cưỡng bức tắt (SIGKILL)...");
                    process.destroyForcibly();
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        // Ngắt các thread đọc log
        if (stdoutThread != null) stdoutThread.interrupt();
        if (stderrThread != null) stderrThread.interrupt();
        if (monitorThread != null) monitorThread.interrupt();
        
        logger.info("[Supervisor] Đã dừng toàn bộ thread giám sát và subprocess con.");
    }

    @Override
    public void run() {
        while (shouldRun) {
            if (consecutiveCrashes >= MAX_CONSECUTIVE_CRASHES) {
                logger.severe("[Supervisor] Phát hiện bot bị crash liên tục " + MAX_CONSECUTIVE_CRASHES + " lần. " +
                        "Dừng tự động khởi động lại để tránh nghẽn CPU. Vui lòng kiểm tra cấu hình hoặc token Discord!");
                break;
            }

            try {
                logger.info("[Supervisor] Đang khởi chạy Discord Bot Subprocess...");
                
                // Khởi tạo lệnh chạy
                List<String> command = new ArrayList<>();
                command.add(nodePath);
                // Cấu hình V8 engine tối ưu RAM khi chạy trên host free (128MB max heap)
                command.add("--max-old-space-size=128");
                command.add("index.js");

                ProcessBuilder pb = new ProcessBuilder(command);
                pb.directory(botDir);

                // Nạp các biến môi trường cấu hình
                Map<String, String> pbEnv = pb.environment();
                pbEnv.putAll(envVariables);
                // Đánh dấu biến để Node.js biết nó đang chạy ký sinh trong Spigot Wrapper
                pbEnv.put("SPIGOT_WRAPPER", "true");

                // Start tiến trình
                process = pb.start();
                consecutiveCrashes = 0; // Reset số lần crash khi start thành công
                logger.info("[Supervisor] Subprocess Node.js đã khởi động thành công (PID: " + getPid(process) + ").");

                // Tạo các thread đọc luồng log (stdout & stderr) song song
                startLogReaders();

                // Đợi tiến trình con kết thúc
                int exitCode = process.waitFor();
                
                if (shouldRun) { // Nếu tự động thoát không phải do onDisable() gọi tắt
                    logger.warning("[Supervisor] Tiến trình Node.js đột ngột dừng với Exit Code: " + exitCode);
                    consecutiveCrashes++;
                    
                    if (consecutiveCrashes < MAX_CONSECUTIVE_CRASHES) {
                        logger.info("[Supervisor] Sẽ tự động khởi động lại bot sau " + (RESTART_DELAY_MS / 1000) + " giây...");
                        Thread.sleep(RESTART_DELAY_MS);
                    }
                }

            } catch (IOException e) {
                logger.log(Level.SEVERE, "[Supervisor] Không thể khởi chạy tiến trình Node.js. " +
                        "Hãy chắc chắn đường dẫn Node.js ('node-path') chính xác và file có quyền thực thi. Lỗi: " + e.getMessage(), e);
                consecutiveCrashes++;
                try {
                    Thread.sleep(RESTART_DELAY_MS);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
    }

    private void startLogReaders() {
        // Đọc stdout
        stdoutThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    // Direct log Node.js ra console Spigot
                    logger.info("[Node-Stdout] " + line);
                }
            } catch (IOException e) {
                // Bỏ qua lỗi stream đóng khi process bị kill
            }
        }, "BotCheckStats-Stdout");
        stdoutThread.start();

        // Đọc stderr
        stderrThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    logger.warning("[Node-Stderr] " + line);
                }
            } catch (IOException e) {
                // Bỏ qua lỗi stream đóng khi process bị kill
            }
        }, "BotCheckStats-Stderr");
        stderrThread.start();
    }

    /**
     * Lấy ID tiến trình (PID) cho các phiên bản Java.
     */
    private long getPid(Process p) {
        try {
            return p.toHandle().pid();
        } catch (UnsupportedOperationException e) {
            return -1;
        }
    }
}
