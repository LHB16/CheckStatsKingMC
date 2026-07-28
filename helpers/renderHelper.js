/**
 * helpers/renderHelper.js - Helper chuyển đổi bảng HTML thành ảnh PNG bằng Puppeteer
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

let browserInstance = null;

const TEMPLATE_PATH = path.join(__dirname, '../templates/itemsTable.html');
const CDN_PRE_RENDER_3D = "https://raw.githubusercontent.com/Owen1212055/mc-assets/main/item-assets/";
const RAW_CDN_PREFIX = "https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.20.1/assets/minecraft/textures/";
const FALLBACK_ICON = RAW_CDN_PREFIX + "block/chest_front.png";

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
  }
  return browserInstance;
}

/**
 * Format tên item từ id (ví dụ: 'blaze_rod' -> 'Blaze Rod')
 */
function formatItemDisplayName(id) {
  if (!id) return 'Item';
  return id
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Lấy URL Icon 3D Pre-rendered với fallback 2D
 */
function getItemIconUrl(id) {
  if (!id) return FALLBACK_ICON;
  return `${CDN_PRE_RENDER_3D}${id.toUpperCase()}.png`;
}

/**
 * Render bảng danh sách vật phẩm ra Buffer ảnh PNG
 * @param {string} title - Tiêu đề bảng (ví dụ: "DANH SÁCH ĐƠN HÀNG: ELYTRA")
 * @param {string} itemQuery - Tên item tra cứu
 * @param {Array} items - Danh sách đơn hàng/vật phẩm
 * @param {string} type - Loại lệnh ('order' hoặc 'ah')
 * @returns {Promise<Buffer>}
 */
async function renderTableImage(title, itemQuery, items, type = 'order') {
  let templateContent = '';
  try {
    templateContent = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } catch (err) {
    console.error('[RenderHelper] Không thể đọc file templates/itemsTable.html:', err.message);
    throw err;
  }

  const iconUrl = getItemIconUrl(itemQuery);
  const displayName = formatItemDisplayName(itemQuery);

  const rowsHtml = items.map((item, index) => {
    const price = item.price || 'N/A';
    const itemName = item.displayName || item.name ? formatItemDisplayName(item.name) : displayName;

    return `
      <tr>
        <td class="stt">#${index + 1}</td>
        <td class="icon-td">
          <img class="item-icon" src="${iconUrl}" onerror="this.onerror=null; this.src='${RAW_CDN_PREFIX}item/${itemQuery.toLowerCase()}.png';" alt="${itemName}" />
        </td>
        <td class="item-name">${itemName}</td>
        <td class="price">${price}</td>
      </tr>
    `;
  }).join('\n');

  const compiledHtml = templateContent
    .replace('{{TITLE}}', title)
    .replace('{{HEADER_ICON}}', iconUrl)
    .replace('{{ROWS}}', rowsHtml);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 2 });
    await page.setContent(compiledHtml, { waitUntil: 'domcontentloaded', timeout: 5000 });

    // Đợi tối đa 1.5s cho các icon tải xong hoặc trigger fallback onerror
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 1500);
        });
      }));
    });

    const elementHandle = await page.$('.table-container');
    if (!elementHandle) {
      throw new Error('Không tìm thấy container .table-container trong HTML');
    }

    const imageBuffer = await elementHandle.screenshot({
      type: 'png',
      omitBackground: true
    });

    return imageBuffer;
  } finally {
    await page.close();
  }
}

module.exports = {
  renderTableImage,
  formatItemDisplayName,
  getItemIconUrl
};
