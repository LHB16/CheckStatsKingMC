/**
 * helpers/renderHelper.js - Helper chuyển đổi bảng HTML thành ảnh PNG bằng Puppeteer
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

let browserInstance = null;

const TEMPLATE_PATH = path.join(__dirname, '../templates/itemsTable.html');
const CDN_PRE_RENDER_3D = "https://raw.githubusercontent.com/Owen1212055/mc-assets/main/item-assets/";
const SVG_QUESTION_MARK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><line x1='12' y1='17' x2='12.01' y2='17'/></svg>";

async function getBrowser() {
  if (!browserInstance || !browserInstance.connected) {
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process'
      ]
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browserInstance = await puppeteer.launch(launchOptions);
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
 * Lấy URL Icon 3D Pre-rendered với fallback dấu hỏi (?)
 */
function getItemIconUrl(id) {
  if (!id) return SVG_QUESTION_MARK;
  const cleanId = id.toLowerCase().trim();
  if (cleanId === 'player_head' || cleanId === 'skull' || cleanId === 'air' || cleanId === 'barrier') {
    return SVG_QUESTION_MARK;
  }
  return `${CDN_PRE_RENDER_3D}${cleanId.toUpperCase()}.png`;
}

function cleanMinecraftText(text) {
  if (!text) return '';
  return text.replace(/§[0-9a-fk-or]/gi, '').trim();
}

/**
 * Render bảng danh sách vật phẩm ra Buffer ảnh PNG
 * @param {string} title - Tiêu đề bảng (ví dụ: "DANH SÁCH ORDER: ELYTRA")
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

  const rowsHtml = items.map((item, index) => {
    const price = item.price || 'N/A';
    const rawName = item.itemName || item.name;
    const cleanDisplay = cleanMinecraftText(item.displayName);

    let itemName = 'Vật phẩm';
    let iconItemQuery = '';

    if (cleanDisplay && cleanDisplay !== 'Item' && !cleanDisplay.toLowerCase().includes('đơn hàng')) {
      itemName = cleanDisplay;
    } else if (rawName && rawName !== 'player_head' && rawName !== 'skull' && rawName !== 'air') {
      itemName = formatItemDisplayName(rawName);
    } else if (itemQuery) {
      itemName = formatItemDisplayName(itemQuery);
    }

    if (rawName && rawName !== 'player_head' && rawName !== 'skull' && rawName !== 'air') {
      iconItemQuery = rawName;
    }

    const iconUrl = getItemIconUrl(iconItemQuery);

    return `
      <tr>
        <td class="stt">#${index + 1}</td>
        <td class="icon-td">
          <img class="item-icon" src="${iconUrl}" onerror="this.onerror=null;this.src='${SVG_QUESTION_MARK}';" alt="${itemName}" />
        </td>
        <td class="item-name">${itemName}</td>
        <td class="price">${price}</td>
      </tr>
    `;
  }).join('\n');

  const compiledHtml = templateContent
    .replace('{{TITLE}}', title)
    .replace('{{ROWS}}', rowsHtml);

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 2 });
    await page.setContent(compiledHtml, { waitUntil: 'load', timeout: 30000 });

    // Đợi tất cả các icon tải xong hoàn toàn hoặc chuyển sang fallback
    await page.evaluate(async () => {
      const images = Array.from(document.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        return new Promise(resolve => {
          let attempts = 0;
          const check = () => {
            attempts++;
            if ((img.complete && img.naturalWidth !== 0) || attempts > 25) {
              resolve();
            } else {
              setTimeout(check, 100);
            }
          };
          img.onload = check;
          img.onerror = () => setTimeout(check, 150);
          check();
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
