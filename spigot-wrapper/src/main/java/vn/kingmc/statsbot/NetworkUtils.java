package vn.kingmc.statsbot;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.logging.Logger;

/**
 * Tiện ích kiểm tra kết nối mạng (outbound network check).
 */
public class NetworkUtils {

    /**
     * Kiểm tra xem có thể kết nối TCP tới một host và port cụ thể không.
     *
     * @param host      Địa chỉ host cần test
     * @param port      Cổng kết nối
     * @param timeoutMs Thời gian chờ tối đa (ms)
     * @return true nếu kết nối thành công, false nếu thất bại
     */
    public static boolean testConnection(String host, int port, int timeoutMs) {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * Thực hiện kiểm tra toàn diện các kết nối cần thiết cho bot hoạt động.
     *
     * @param logger     Logger của plugin để in thông báo
     * @param testMcHost Host Minecraft cần kết nối thử
     * @param mcPort     Cổng MC server
     * @return true nếu mọi kết nối cơ bản ok, false nếu có kết nối bị lỗi chặn
     */
    public static boolean checkOutboundNetwork(Logger logger, String testMcHost, int mcPort) {
        logger.info("[NetworkCheck] Đang kiểm tra kết nối outbound internet...");

        // 1. Kiểm tra kết nối tới Discord API
        boolean canConnectDiscord = testConnection("discord.com", 443, 4000);
        if (canConnectDiscord) {
            logger.info("[NetworkCheck] ✓ Kết nối tới Discord (discord.com:443) THÀNH CÔNG.");
        } else {
            logger.warning("[NetworkCheck] ✗ Kết nối tới Discord (discord.com:443) THẤT BẠI. " +
                    "Host free này có thể đã chặn kết nối mạng đi ra ngoài (Outbound network restricted).");
        }

        // 2. Kiểm tra kết nối tới Server Minecraft mục tiêu (vd: KingMC)
        boolean canConnectMc = testConnection(testMcHost, mcPort, 4000);
        if (canConnectMc) {
            logger.info("[NetworkCheck] ✓ Kết nối tới Minecraft Server mục tiêu (" + testMcHost + ":" + mcPort + ") THÀNH CÔNG.");
        } else {
            logger.warning("[NetworkCheck] ✗ Kết nối tới Minecraft Server mục tiêu (" + testMcHost + ":" + mcPort + ") THẤT BẠI.");
        }

        return canConnectDiscord && canConnectMc;
    }
}
