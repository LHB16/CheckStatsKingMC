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
const FALLBACK_ICON = RAW_CDN_PREFIX + "item/paper.png";
const SVG_FALLBACK = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='16' y1='13' x2='8' y2='13'/><line x1='16' y1='17' x2='8' y2='17'/></svg>";

const ITEM_ALIASES = {
  'shulker': 'SHULKER_BOX',
  'red': 'REDSTONE',
  'gold': 'GOLD_INGOT',
  'diamond': 'DIAMOND',
  'emerald': 'EMERALD',
  'iron': 'IRON_INGOT',
  'netherite': 'NETHERITE_INGOT',
  'coal': 'COAL',
  'lapis': 'LAPIS_LAZULI',
  'quartz': 'QUARTZ',
  'copper': 'COPPER_INGOT'
};

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
 * Lấy URL Icon 3D Pre-rendered với fallback 2D
 */
function getItemIconUrl(id) {
  if (!id) return FALLBACK_ICON;
  const cleanId = id.toLowerCase().trim();
  if (cleanId === 'player_head' || cleanId === 'skull') return FALLBACK_ICON;
  const target = ITEM_ALIASES[cleanId] || cleanId.toUpperCase();
  return `${CDN_PRE_RENDER_3D}${target}.png`;
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

  const displayName = formatItemDisplayName(itemQuery);

  const rowsHtml = items.map((item, index) => {
    const price = item.price || 'N/A';
    const rawName = item.itemName || item.name;
    const cleanDisplay = cleanMinecraftText(item.displayName);

    let itemName = displayName;
    let iconItemQuery = itemQuery;

    if (type === 'order') {
      // Đối với lệnh /order, VẬT PHẨM hiển thị tên item tra cứu, tuyệt đối không lấy tên slot người mua
      itemName = displayName;
      iconItemQuery = itemQuery;
    } else {
      if (cleanDisplay && cleanDisplay !== 'Item' && !cleanDisplay.toLowerCase().includes('đơn hàng')) {
        itemName = cleanDisplay;
      } else if (rawName && rawName !== 'player_head' && rawName !== 'skull') {
        itemName = formatItemDisplayName(rawName);
      }
      if (rawName && rawName !== 'player_head' && rawName !== 'skull') {
        iconItemQuery = rawName;
      }
    }

    const iconUrl = getItemIconUrl(iconItemQuery);

    return `
      <tr>
        <td class="stt">#${index + 1}</td>
        <td class="icon-td">
          <img class="item-icon" src="${iconUrl}" onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='${RAW_CDN_PREFIX}item/${iconItemQuery.toLowerCase()}.png';}else if(this.dataset.fb==='1'){this.dataset.fb='2';this.src='${FALLBACK_ICON}';}else{this.dataset.fb='3';this.src='${SVG_FALLBACK}';}" alt="${itemName}" />
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
