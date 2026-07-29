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

const MC_COLOR_HEX = {
  '0': '#000000',
  '1': '#0000AA',
  '2': '#00AA00',
  '3': '#00AAAA',
  '4': '#AA0000',
  '5': '#AA00AA',
  '6': '#FFAA00',
  '7': '#AAAAAA',
  '8': '#555555',
  '9': '#5555FF',
  'a': '#55FF55',
  'b': '#55FFFF',
  'c': '#FF5555',
  'd': '#FF55FF',
  'e': '#FFFF55',
  'f': '#FFFFFF',
  'black': '#000000',
  'dark_blue': '#0000AA',
  'dark_green': '#00AA00',
  'dark_aqua': '#00AAAA',
  'dark_red': '#AA0000',
  'dark_purple': '#AA00AA',
  'gold': '#FFAA00',
  'gray': '#AAAAAA',
  'dark_gray': '#555555',
  'blue': '#5555FF',
  'green': '#55FF55',
  'aqua': '#55FFFF',
  'red': '#FF5555',
  'light_purple': '#FF55FF',
  'yellow': '#FFFF55',
  'white': '#FFFFFF'
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

function parseSectionCodesToHtml(text, defaultColor = '#ffffff') {
  if (!text) return '';
  if (!text.includes('§')) {
    return `<span style="color: ${defaultColor};">${escapeHtml(text)}</span>`;
  }

  let currentColor = defaultColor;
  let isBold = false;
  let isItalic = false;
  let isUnderline = false;
  let isStrikethrough = false;

  let resultHtml = '';
  let currentSegment = '';

  function flushSegment() {
    if (!currentSegment) return;
    let styles = [];
    if (currentColor) styles.push(`color: ${currentColor}`);
    if (isBold) styles.push(`font-weight: bold`);
    if (isItalic) styles.push(`font-style: italic`);
    let decorations = [];
    if (isUnderline) decorations.push('underline');
    if (isStrikethrough) decorations.push('line-through');
    if (decorations.length > 0) styles.push(`text-decoration: ${decorations.join(' ')}`);

    const styleStr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
    resultHtml += `<span${styleStr}>${escapeHtml(currentSegment)}</span>`;
    currentSegment = '';
  }

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '§' && i + 1 < text.length) {
      const code = text[i + 1].toLowerCase();
      i++;

      if (MC_COLOR_HEX[code]) {
        flushSegment();
        currentColor = MC_COLOR_HEX[code];
      } else if (code === 'l') {
        flushSegment();
        isBold = true;
      } else if (code === 'o') {
        flushSegment();
        isItalic = true;
      } else if (code === 'n') {
        flushSegment();
        isUnderline = true;
      } else if (code === 'm') {
        flushSegment();
        isStrikethrough = true;
      } else if (code === 'r') {
        flushSegment();
        currentColor = defaultColor;
        isBold = false;
        isItalic = false;
        isUnderline = false;
        isStrikethrough = false;
      }
    } else {
      currentSegment += text[i];
    }
  }

  flushSegment();
  return resultHtml || `<span style="color: ${defaultColor};">${escapeHtml(text)}</span>`;
}

function formatMinecraftTextToHtml(input, defaultColor = '#ffffff') {
  if (!input) return `<span style="color: ${defaultColor};">Vật phẩm</span>`;

  let textStr = String(input).trim();
  let overrideColor = null;

  const jsonMatch = textStr.match(/^(.*?)\s*(\{(?:[^{}]|"*")*\})\s*$/);
  if (jsonMatch) {
    const prefixText = jsonMatch[1].trim();
    const jsonBlob = jsonMatch[2];
    try {
      const parsedJson = JSON.parse(jsonBlob);
      if (parsedJson.color && MC_COLOR_HEX[parsedJson.color]) {
        overrideColor = MC_COLOR_HEX[parsedJson.color];
      }
      if (parsedJson.text && parsedJson.text.trim()) {
        textStr = parsedJson.text.trim();
      } else if (prefixText) {
        textStr = prefixText;
      }
    } catch (e) {
      if (prefixText) textStr = prefixText;
    }
  }

  textStr = textStr.replace(/\{"color".*?\}/gi, '').trim();

  if (textStr.includes('§')) {
    return parseSectionCodesToHtml(textStr, overrideColor || defaultColor);
  }

  const finalColor = overrideColor || defaultColor;
  return `<span style="color: ${finalColor};">${escapeHtml(textStr)}</span>`;
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
    const rawDisplay = item.displayName || '';
    const cleanDisplay = cleanMinecraftText(rawDisplay);

    if (rawName && rawName !== 'player_head' && rawName !== 'skull' && rawName !== 'air') {
      iconItemQuery = rawName;
    } else if (itemQuery) {
      iconItemQuery = itemQuery;
    }

    const iconUrl = getItemIconUrl(iconItemQuery);

    const lowerDisplay = cleanDisplay.toLowerCase();
    const isOrderPrefix = lowerDisplay.includes('đơn hàng') || lowerDisplay.includes('don hang') || lowerDisplay.includes('order');

    if (rawDisplay && !isOrderPrefix && cleanDisplay !== 'Item' && cleanDisplay !== 'Vật phẩm') {
      itemNameHtml = formatMinecraftTextToHtml(rawDisplay, '#ffffff');
    } else {
      // Dùng trực tiếp ID đã dùng lấy hình (iconItemQuery) để tạo tên hiển thị vật phẩm
      const derivedName = formatItemDisplayName(iconItemQuery);
      itemNameHtml = formatMinecraftTextToHtml(derivedName, '#ffffff');
    }

    let subInfoHtml = '';
    if (type === 'order') {
      const buyerName = item.buyer;
      if (buyerName && buyerName !== 'Ẩn danh') {
        subInfoHtml = `<div class="sub-info">Người mua: <span class="highlight-user">${escapeHtml(buyerName)}</span></div>`;
      }
    } else if (type === 'ah' && item.seller && item.seller !== 'Ẩn danh') {
      subInfoHtml = `<div class="sub-info">Người bán: <span class="highlight-user">${escapeHtml(item.seller)}</span></div>`;
    }

    return `
      <tr>
        <td class="stt">#${index + 1}</td>
        <td class="icon-td">
          <div class="mc-slot">
            <img class="item-icon" src="${iconUrl}" onerror="this.onerror=null;this.src='${SVG_QUESTION_MARK}';" alt="${rawName || 'item'}" />
          </div>
        </td>
        <td class="item-name">
          ${itemNameHtml}
          ${subInfoHtml}
        </td>
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
  getItemIconUrl,
  formatMinecraftTextToHtml
};

