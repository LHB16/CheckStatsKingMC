/**
 * helpers/wispbyteManager.js - Quản lý Đa Tài Khoản Wispbyte & Tự Động Truy Cập Client Panel (24h/lần)
 * Giải quyết quy tắc bắt buộc truy cập Client Panel ít nhất 1 lần mỗi 14 ngày của Wispbyte
 * cho NHIỀU tài khoản Wispbyte (nhiều Worker vệ tinh) cùng lúc.
 */

const {
  getAllWispbyteAccounts,
  saveWispbyteAccount,
  deleteWispbyteAccount,
  isMongoAvailable
} = require('./mongoHelper');

const DEFAULT_PANEL_URL = 'https://wispbyte.com/client';
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let schedulerTimer = null;
let isCheckingAll = false;

/**
 * Chuyển chuỗi Cookie header ("key1=val1; key2=val2") thành mảng Cookie object cho Puppeteer
 */
function parseCookieString(cookieStr, domain = '.wispbyte.com') {
  if (!cookieStr || typeof cookieStr !== 'string') return [];
  return cookieStr
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(pair => {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) return null;
      const name = pair.substring(0, eqIdx).trim();
      const value = pair.substring(eqIdx + 1).trim();
      if (!name) return null;
      return {
        name,
        value,
        domain,
        path: '/',
        httpOnly: false,
        secure: true
      };
    })
    .filter(Boolean);
}

/**
 * Truy cập Client Panel cho 1 tài khoản Wispbyte (Kết hợp HTTP Request + Puppeteer Isolated Context nếu có)
 */
async function pingSingleWispbyteAccount(account) {
  const targetUrl = (account.panelUrl || DEFAULT_PANEL_URL).trim();
  const cookieHeader = (account.cookie || '').trim();
  const userAgent = (account.userAgent || DEFAULT_USER_AGENT).trim();

  if (!cookieHeader) {
    return {
      accountId: account.accountId,
      name: account.name || account.accountId,
      success: false,
      status: 'error',
      message: 'Thiếu chuỗi Cookie đăng nhập'
    };
  }

  let status = 'unknown';
  let message = '';
  let usedMethod = 'HTTP';

  // Bước 1: Thử gọi HTTP GET kèm Cookie tới trang Client Panel & API người dùng
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      },
      redirect: 'manual'
    });

    const location = res.headers.get('location') || '';
    const html = await res.text().catch(() => '');

    // Kiểm tra nếu bị redirect về trang login/auth
    if (
      res.status === 301 ||
      res.status === 302 ||
      res.status === 307 ||
      res.status === 308
    ) {
      if (location.includes('login') || location.includes('auth') || location.includes('discord')) {
        status = 'expired';
        message = `Phiên Cookie đã hết hạn (Redirect tới: ${location})`;
      } else {
        status = 'ok';
        message = `HTTP ${res.status} -> ${location}`;
      }
    } else if (res.status === 200) {
      const lowerHtml = html.toLowerCase();
      if (
        (lowerHtml.includes('login with discord') || lowerHtml.includes('sign in to your account')) &&
        !lowerHtml.includes('logout') &&
        !lowerHtml.includes('servers')
      ) {
        status = 'expired';
        message = 'Trang trả về giao diện bắt đăng nhập lại (Cookie hết hạn)';
      } else {
        status = 'ok';
        message = `Truy cập Client Panel thành công (HTTP 200)`;
      }
    } else if (res.status === 401 || res.status === 403) {
      // Nếu 403 có thể do Cloudflare chặn HTTP thuần -> Thử tiếp bằng Puppeteer bên dưới
      status = 'cloudflare_or_auth';
      message = `HTTP ${res.status} (Cần trình duyệt thực thi JS/Cloudflare)`;
    } else {
      status = 'error';
      message = `HTTP Status ${res.status}`;
    }
  } catch (httpErr) {
    status = 'error';
    message = `Lỗi kết nối HTTP: ${httpErr.message}`;
  }

  // Bước 2: Nếu môi trường có Puppeteer (Master / Standalone) -> Mở BrowserContext độc lập
  // để thực thi JS trên trang Client Panel (giúp Wispbyte kích hoạt đầy đủ AJAX keep-alive cho từng acc)
  if (status === 'ok' || status === 'cloudflare_or_auth') {
    try {
      let puppeteer = null;
      try {
        puppeteer = require('puppeteer');
      } catch (e) {
        puppeteer = null;
      }

      if (puppeteer) {
        const browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        });

        try {
          // Tạo ngữ cảnh ẩn danh riêng biệt cho từng tài khoản Wispbyte để không lẫn Cookie
          const context = await browser.createBrowserContext();
          const page = await context.newPage();
          await page.setUserAgent(userAgent);

          // Chặn tải quảng cáo, hình ảnh, font chữ nặng để tránh treo trang (Navigation Timeout) và tiết kiệm RAM
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const rType = req.resourceType();
            const rUrl = req.url().toLowerCase();
            if (
              rType === 'image' ||
              rType === 'media' ||
              rType === 'font' ||
              rUrl.includes('googlesyndication') ||
              rUrl.includes('doubleclick') ||
              rUrl.includes('criteo') ||
              rUrl.includes('google-analytics') ||
              rUrl.includes('adsystem')
            ) {
              return req.abort().catch(() => {});
            }
            return req.continue().catch(() => {});
          });

          const parsedUrl = new URL(targetUrl);
          const baseHostname = parsedUrl.hostname.replace(/^www\./, '');
          const cookiesDot = parseCookieString(cookieHeader, `.${baseHostname}`);
          const cookiesExact = parseCookieString(cookieHeader, baseHostname);
          const allCookies = [...cookiesDot, ...cookiesExact];
          if (allCookies.length > 0) {
            await page.setCookie(...allCookies);
          }

          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await new Promise(r => setTimeout(r, 3500));

          const currentUrl = page.url();
          const pageTitle = await page.title().catch(() => '');

          if (currentUrl.includes('/login') || currentUrl.includes('/auth/')) {
            status = 'expired';
            message = `Cookie hết hạn (Bị chuyển hướng tới ${currentUrl})`;
          } else {
            // Tìm và bấm nút Renew / Extend nếu Wispbyte hiển thị trên giao diện
            const clickedRenew = await page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('button, a'));
              const renewBtn = buttons.find(el => {
                const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
                return txt.includes('renew') || txt.includes('extend') || txt.includes('keep alive');
              });
              if (renewBtn) {
                renewBtn.click();
                return true;
              }
              return false;
            }).catch(() => false);

            status = 'ok';
            usedMethod = 'Puppeteer';
            message = `Đã truy cập Client Panel thành công (${pageTitle || currentUrl})${clickedRenew ? ' & bấm nút Renew' : ''}`;
          }

          await context.close().catch(() => {});
        } finally {
          await browser.close().catch(() => {});
        }
      } else if (status === 'cloudflare_or_auth') {
        status = 'error';
        message = 'Wispbyte yêu cầu trình duyệt (Cloudflare) nhưng node này không cài Puppeteer';
      }
    } catch (pupErr) {
      // Nếu HTTP bước 1 đã OK thì vẫn giữ nguyên kết quả OK từ HTTP
      if (status !== 'ok') {
        status = 'error';
        message = `Lỗi Puppeteer: ${pupErr.message}`;
      }
    }
  }

  const isSuccess = status === 'ok';
  const updatedData = {
    accountId: account.accountId,
    lastPingAt: new Date(),
    lastStatus: isSuccess ? 'ok' : (status === 'expired' ? 'expired' : 'error'),
    lastMessage: `[${usedMethod}] ${message}`,
    renewCount: isSuccess ? ((account.renewCount || 0) + 1) : (account.renewCount || 0)
  };

  if (isMongoAvailable()) {
    await saveWispbyteAccount(updatedData).catch(() => {});
  }

  return {
    accountId: account.accountId,
    name: account.name || account.accountId,
    success: isSuccess,
    status: updatedData.lastStatus,
    message: updatedData.lastMessage,
    renewCount: updatedData.renewCount,
    lastPingAt: updatedData.lastPingAt
  };
}

/**
 * Quét và truy cập Client Panel cho TẤT CẢ các tài khoản Wispbyte đang kích hoạt
 */
async function checkAllWispbyteAccounts({ discordClient = null, adminId = '', manual = false } = {}) {
  if (isCheckingAll) {
    return {
      success: false,
      message: 'Tiến trình kiểm tra/gia hạn Wispbyte đang chạy, vui lòng đợi hoàn tất.'
    };
  }

  isCheckingAll = true;
  try {
    const accounts = await getAllWispbyteAccounts();
    const activeAccounts = accounts.filter(a => a.isActive !== false && a.cookie);

    if (activeAccounts.length === 0) {
      return {
        success: true,
        total: 0,
        results: [],
        message: 'Chưa có tài khoản Wispbyte nào được cấu hình.'
      };
    }

    console.log(`[WispbyteKeepAlive] 🌐 Bắt đầu truy cập Client Panel định kỳ cho ${activeAccounts.length} tài khoản Wispbyte...`);
    const results = [];

    for (const acc of activeAccounts) {
      console.log(`[WispbyteKeepAlive] ⏳ Đang truy cập tài khoản [${acc.name || acc.accountId}]...`);
      const res = await pingSingleWispbyteAccount(acc);
      results.push(res);
      console.log(`[WispbyteKeepAlive] ➔ Kết quả [${acc.name || acc.accountId}]: ${res.status.toUpperCase()} - ${res.message}`);
      // Nghỉ 3 giây giữa các tài khoản
      await new Promise(r => setTimeout(r, 3000));
    }

    const okCount = results.filter(r => r.success).length;
    const expiredList = results.filter(r => r.status === 'expired');
    const errorList = results.filter(r => r.status === 'error');

    // Gửi thông báo cho Admin qua Discord DM nếu có tài khoản hết hạn Cookie hoặc khi chạy định kỳ/thủ công
    if (discordClient && adminId && (manual || expiredList.length > 0 || errorList.length > 0 || okCount > 0)) {
      try {
        const adminUser = await discordClient.users.fetch(adminId);
        if (adminUser) {
          let report = `🛰️ **[Wispbyte Auto-KeepAlive 14 Ngày] Báo cáo truy cập Client Panel**\n`;
          report += `• **Tổng số tài khoản:** \`${activeAccounts.length}\` (Thành công: **${okCount}** ✅ | Hết hạn/Lỗi: **${expiredList.length + errorList.length}** ⚠️)\n\n`;
          results.forEach((r, idx) => {
            const icon = r.success ? '🟢' : (r.status === 'expired' ? '🔴' : '🟡');
            report += `**${idx + 1}. ${icon} ${r.name}** (\`${r.accountId}\`)\n`;
            report += `   └ Trạng thái: ${r.message} *(Tổng lần giữ hạn: ${r.renewCount})*\n`;
          });
          if (expiredList.length > 0) {
            report += `\n⚠️ **CẢNH BÁO:** Có **${expiredList.length}** tài khoản Wispbyte đã hết hạn Cookie! Vui lòng cập nhật lại bằng lệnh \`!wispbyte add <id> <cookie>\` để không bị khóa sau 14 ngày.`;
          }
          await adminUser.send(report);
        }
      } catch (dmErr) {
        console.warn('[WispbyteKeepAlive] Không thể gửi DM báo cáo cho Admin:', dmErr.message);
      }
    }

    return {
      success: true,
      total: activeAccounts.length,
      okCount,
      expiredCount: expiredList.length,
      errorCount: errorList.length,
      results
    };
  } finally {
    isCheckingAll = false;
  }
}

/**
 * Khởi chạy bộ lập lịch tự động truy cập Wispbyte Client Panel mỗi 24 giờ trên Master / Standalone
 */
function startWispbyteKeepAliveScheduler({ discordClient = null, adminId = '' } = {}) {
  if (schedulerTimer) return;

  const intervalMs = parseInt(process.env.WISPBYTE_KEEPALIVE_INTERVAL_MS) || TWENTY_FOUR_HOURS_MS;
  console.log(`[WispbyteKeepAlive] ⏰ Đã kích hoạt bộ lập lịch tự động truy cập Wispbyte Client Panel (Chu kỳ: ${Math.round(intervalMs / 3600000)}h/lần).`);

  // Chạy kiểm tra lần đầu sau khi khởi động 60 giây
  setTimeout(() => {
    checkAllWispbyteAccounts({ discordClient, adminId, manual: false }).catch(err => {
      console.warn('[WispbyteKeepAlive] Lỗi chu kỳ đầu tiên:', err.message);
    });
  }, 60 * 1000);

  schedulerTimer = setInterval(() => {
    checkAllWispbyteAccounts({ discordClient, adminId, manual: false }).catch(err => {
      console.warn('[WispbyteKeepAlive] Lỗi chu kỳ định kỳ:', err.message);
    });
  }, intervalMs);
}

module.exports = {
  pingSingleWispbyteAccount,
  checkAllWispbyteAccounts,
  startWispbyteKeepAliveScheduler,
  getAllWispbyteAccounts,
  saveWispbyteAccount,
  deleteWispbyteAccount
};
