/**
 * helpers/renderHelper.js - Helper chuyển đổi bảng HTML thành ảnh PNG bằng Puppeteer
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
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
        '--single-process',
        '--allow-file-access-from-files'
      ]
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browserInstance = await puppeteer.launch(launchOptions);
  }
  return browserInstance;
}

const RAW_CDN_PREFIX = "https://cdn.jsdelivr.net/gh/InventivetalentDev/minecraft-assets@1.20.1/assets/minecraft/textures/";

// Bộ nhớ đệm RAM chứa chuỗi base64 của texture cục bộ để tối ưu hiệu năng
const localTextureBase64Cache = new Map();

/**
 * Đọc file texture cục bộ và chuyển sang Data URI (base64)
 */
function getLocalTextureBase64(subdir, filename) {
  const cacheKey = `${subdir}/${filename}`;
  if (localTextureBase64Cache.has(cacheKey)) {
    return localTextureBase64Cache.get(cacheKey);
  }
  const localPath = subdir
    ? path.join(__dirname, '../public/textures', subdir, filename)
    : path.join(__dirname, '../public/textures', filename);

  if (fs.existsSync(localPath)) {
    try {
      const buffer = fs.readFileSync(localPath);
      const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;
      localTextureBase64Cache.set(cacheKey, dataUri);
      return dataUri;
    } catch (err) {
      console.error(`[RenderHelper] Không thể đọc texture ${localPath}:`, err.message);
    }
  }
  localTextureBase64Cache.set(cacheKey, null);
  return null;
}

/**
 * Ánh xạ khối đặc biệt (Special Block Resolver) đồng bộ theo forLongdz22
 */
function resolveSpecialTexture(id) {
  if (!id) return null;
  const cleanId = id.toLowerCase().trim();

  const directMap = {
    'crafting_table': RAW_CDN_PREFIX + 'block/crafting_table_front.png',
    'furnace': RAW_CDN_PREFIX + 'block/furnace_front.png',
    'cactus': RAW_CDN_PREFIX + 'block/cactus_side.png',
    'pumpkin': RAW_CDN_PREFIX + 'block/pumpkin_side.png',
    'grass_block': RAW_CDN_PREFIX + 'block/grass_block_side.png',
    'podzol': RAW_CDN_PREFIX + 'block/podzol_side.png',
    'ancient_debris': RAW_CDN_PREFIX + 'block/ancient_debris_side.png',
    'snow_block': RAW_CDN_PREFIX + 'block/snow.png',
    'chiseled_bookshelf': RAW_CDN_PREFIX + 'block/chiseled_bookshelf_empty.png',
    'decorated_pot': RAW_CDN_PREFIX + 'block/decorated_pot_base.png',
    'jukebox': RAW_CDN_PREFIX + 'block/jukebox_side.png',
    'mangrove_roots': RAW_CDN_PREFIX + 'block/mangrove_roots_side.png',
    'muddy_mangrove_roots': RAW_CDN_PREFIX + 'block/muddy_mangrove_roots_side.png',
    'azalea': RAW_CDN_PREFIX + 'block/azalea_side.png',
    'flowering_azalea': RAW_CDN_PREFIX + 'block/flowering_azalea_side.png',
    'small_dripleaf': RAW_CDN_PREFIX + 'block/small_dripleaf_top.png',
    'big_dripleaf': RAW_CDN_PREFIX + 'block/big_dripleaf_top.png',
    'suspicious_sand': RAW_CDN_PREFIX + 'block/suspicious_sand_0.png',
    'suspicious_gravel': RAW_CDN_PREFIX + 'block/suspicious_gravel_0.png',
    'smooth_stone_slab': RAW_CDN_PREFIX + 'block/smooth_stone.png',
    'smooth_red_sandstone': RAW_CDN_PREFIX + 'block/red_sandstone_top.png',
    'smooth_sandstone': RAW_CDN_PREFIX + 'block/sandstone_top.png',
    'smooth_quartz': RAW_CDN_PREFIX + 'block/quartz_block_bottom.png',
    'petrified_oak_slab': RAW_CDN_PREFIX + 'block/oak_planks.png',
    'moss_carpet': RAW_CDN_PREFIX + 'block/moss_block.png',
    'chest': RAW_CDN_PREFIX + 'entity/chest/normal.png',
    'ender_chest': RAW_CDN_PREFIX + 'entity/chest/ender.png',
    'trapped_chest': RAW_CDN_PREFIX + 'entity/chest/trapped.png'
  };

  if (directMap[cleanId]) return directMap[cleanId];

  if (cleanId.endsWith('_wood')) return RAW_CDN_PREFIX + `block/${cleanId.replace(/_wood$/, '')}_log.png`;
  if (cleanId.endsWith('_hyphae')) return RAW_CDN_PREFIX + `block/${cleanId.replace(/_hyphae$/, '')}_stem.png`;
  if (cleanId.endsWith('_fence')) return RAW_CDN_PREFIX + `block/${cleanId.replace(/_fence$/, '')}_planks.png`;

  if (cleanId.endsWith('_slab') || cleanId.endsWith('_stairs')) {
    let base = cleanId.replace(/_slab$/, '').replace(/_stairs$/, '');
    if (base.includes('oak') || base.includes('spruce') || base.includes('birch') || base.includes('jungle') || base.includes('acacia') || base.includes('dark_oak') || base.includes('mangrove') || base.includes('cherry') || base.includes('crimson') || base.includes('warped') || base.includes('bamboo')) {
      if (base.includes('mosaic')) return RAW_CDN_PREFIX + 'block/bamboo_mosaic.png';
      const parts = base.split('_');
      const woodType = parts.filter(p => ['oak','spruce','birch','jungle','acacia','dark','mangrove','cherry','crimson','warped','bamboo'].includes(p)).join('_');
      return RAW_CDN_PREFIX + `block/${woodType}_planks.png`;
    }
    if (base.includes('cobblestone')) return RAW_CDN_PREFIX + 'block/cobblestone.png';
    if (base.includes('stone_brick')) return RAW_CDN_PREFIX + 'block/stone_bricks.png';
    if (base.includes('stone')) return RAW_CDN_PREFIX + 'block/stone.png';
    if (base.includes('brick')) return RAW_CDN_PREFIX + 'block/bricks.png';
    if (base.includes('nether_brick')) return RAW_CDN_PREFIX + 'block/nether_bricks.png';
    if (base.includes('quartz')) return RAW_CDN_PREFIX + 'block/quartz_block_side.png';
    if (base.includes('purpur')) return RAW_CDN_PREFIX + 'block/purpur_block.png';
    if (base.includes('dark_prismarine')) return RAW_CDN_PREFIX + 'block/dark_prismarine.png';
    if (base.includes('prismarine_brick')) return RAW_CDN_PREFIX + 'block/prismarine_bricks.png';
    if (base.includes('prismarine')) return RAW_CDN_PREFIX + 'block/prismarine.png';
    if (base.includes('cut_red_sandstone')) return RAW_CDN_PREFIX + 'block/cut_red_sandstone.png';
    if (base.includes('red_sandstone')) return RAW_CDN_PREFIX + 'block/red_sandstone_top.png';
    if (base.includes('cut_sandstone')) return RAW_CDN_PREFIX + 'block/cut_sandstone.png';
    if (base.includes('sandstone')) return RAW_CDN_PREFIX + 'block/sandstone_top.png';
  }

  return null;
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
 * Lấy URL Icon 3D Pre-rendered với Pipeline Fallback đa tầng (đồng bộ forLongdz22)
 * @param {string|object} itemOrId - ID hoặc Object item { name, skullOwner, count }
 */
function getItemIconUrl(itemOrId) {
  if (!itemOrId) return SVG_QUESTION_MARK;
  let cleanId = '';
  let skullOwner = null;

  if (typeof itemOrId === 'object') {
    cleanId = (itemOrId.name || itemOrId.itemName || '').toLowerCase().trim();
    skullOwner = itemOrId.skullOwner || null;
  } else {
    cleanId = String(itemOrId).toLowerCase().trim();
  }

  if (!cleanId || cleanId === 'air' || cleanId === 'barrier') {
    return SVG_QUESTION_MARK;
  }

  // 1. Xử lý các loại đầu lâu (Player Heads / Mob Skulls)
  if (cleanId.includes('head') || cleanId.includes('skull')) {
    if (skullOwner) {
      return `https://mc-heads.net/avatar/${skullOwner}/32`;
    }
    const mhfMap = {
      'creeper_head': 'MHF_Creeper',
      'zombie_head': 'MHF_Zombie',
      'skeleton_skull': 'MHF_Skeleton',
      'wither_skeleton_skull': 'MHF_WitherSkeleton',
      'player_head': 'MHF_Steve',
      'dragon_head': 'MHF_EnderDragon',
      'piglin_head': 'MHF_Piglin'
    };
    const mhfName = mhfMap[cleanId] || 'MHF_Steve';
    return `https://mc-heads.net/avatar/${mhfName}/32`;
  }

  // 2. ƯU TIÊN SỐ 1: 3D Isometric Pre-rendered Icon Cục Bộ (/textures/3d/NAME.png)
  const local3d = getLocalTextureBase64('3d', `${cleanId.toUpperCase()}.png`)
    || getLocalTextureBase64('3d', `${cleanId}.png`);
  if (local3d) return local3d;

  // 3. Ưu tiên 2: 2D Item Cục Bộ (/textures/item/name.png)
  const localItem = getLocalTextureBase64('item', `${cleanId}.png`)
    || getLocalTextureBase64('item', `${cleanId.toUpperCase()}.png`);
  if (localItem) return localItem;

  // 4. Ưu tiên 3: 2D Block Cục Bộ (/textures/block/name.png)
  const localBlock = getLocalTextureBase64('block', `${cleanId}.png`)
    || getLocalTextureBase64('block', `${cleanId.toUpperCase()}.png`);
  if (localBlock) return localBlock;

  // 5. Ưu tiên 4: Khối đặc thù Entity Cục Bộ (vd: normal chest)
  if (cleanId === 'chest') {
    const localChest = getLocalTextureBase64('entity/chest', 'normal.png');
    if (localChest) return localChest;
  } else if (cleanId === 'ender_chest') {
    const localEnderChest = getLocalTextureBase64('entity/chest', 'ender.png');
    if (localEnderChest) return localEnderChest;
  } else if (cleanId === 'trapped_chest') {
    const localTrappedChest = getLocalTextureBase64('entity/chest', 'trapped.png');
    if (localTrappedChest) return localTrappedChest;
  }

  // 6. Fallback CDN 3D Isometric Online
  const cdn3d = `${CDN_PRE_RENDER_3D}${cleanId.toUpperCase()}.png`;

  // 7. Fallback Special Block Resolver
  const mappedSpecial = resolveSpecialTexture(cleanId);
  if (mappedSpecial) return mappedSpecial;

  return cdn3d;
}

// Chuẩn hóa phông chữ Small Caps độc lạ của Server Minecraft (ví dụ: đơɴ ʜàɴɢ ᴄủᴀ -> don hang cua)
function normalizeSmallCaps(str) {
  if (!str) return '';
  return String(str)
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/ᴀ/g, 'a')
    .replace(/ʙ/g, 'b')
    .replace(/ᴄ/g, 'c')
    .replace(/ᴅ/g, 'd')
    .replace(/ᴇ/g, 'e')
    .replace(/ғ/g, 'f')
    .replace(/ɢ/g, 'g')
    .replace(/ʜ/g, 'h')
    .replace(/ɪ/g, 'i')
    .replace(/ᴊ/g, 'j')
    .replace(/ᴋ/g, 'k')
    .replace(/ʟ/g, 'l')
    .replace(/ᴍ/g, 'm')
    .replace(/ɴ/g, 'n')
    .replace(/ᴏ/g, 'o')
    .replace(/ᴘ/g, 'p')
    .replace(/ǫ/g, 'q')
    .replace(/ʀ/g, 'r')
    .replace(/ꜱ/g, 's')
    .replace(/ᴛ/g, 't')
    .replace(/ᴜ/g, 'u')
    .replace(/ᴠ/g, 'v')
    .replace(/ᴡ/g, 'w')
    .replace(/x/g, 'x')
    .replace(/ʏ/g, 'y')
    .replace(/ᴢ/g, 'z')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanMinecraftText(text) {
  if (!text) return '';
  return String(text)
    .replace(/§x(§[0-9a-f]){6}/gi, '')
    .replace(/&x(&[0-9a-f]){6}/gi, '')
    .replace(/&#[0-9a-f]{6}/gi, '')
    .replace(/§#[0-9a-f]{6}/gi, '')
    .replace(/§[0-9a-fk-or]/gi, '')
    .replace(/&[0-9a-fk-or]/gi, '')
    .replace(/§./g, '')
    .replace(/[\u00A0\u200B\uFEFF]/g, ' ')
    .normalize('NFC')
    .trim();
}

function cleanBuyerName(str) {
  if (!str) return 'Ẩn danh';
  let cleanText = cleanMinecraftText(str);
  let normalized = normalizeSmallCaps(cleanText);

  const prefixMatch = normalized.match(/^(?:don\s*hang|order)?(?:\s*cua|\s*of|:|\s)*\s*/iu);
  if (prefixMatch && prefixMatch[0].length > 0) {
    const prefixLen = prefixMatch[0].length;
    let buyerPart = cleanText.substring(prefixLen).trim();
    buyerPart = buyerPart.replace(/^[:\-\s#]+/, '').trim();
    if (buyerPart) return buyerPart;
  }

  cleanText = cleanText.replace(/^(?:đơn\s*hàng|don\s*hang|order)?(?:\s*của|\s*cua|:|\s)*\s*/iu, '').trim();
  cleanText = cleanText.replace(/^[:\-\s#]+/, '').trim();
  return cleanText || 'Ẩn danh';
}

function getColorHex(color) {
  if (!color) return null;
  if (color.startsWith('#')) return color;
  return MC_COLOR_HEX[color.toLowerCase()] || null;
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

function parseMinecraftComponentToHtml(obj, inheritedColor = '#ffffff') {
  if (!obj) return '';

  if (typeof obj === 'string') {
    let str = obj.trim();
    if (str.startsWith('{') || str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        return parseMinecraftComponentToHtml(parsed, inheritedColor);
      } catch (e) {}
    }
    if (str.includes('§')) {
      return parseSectionCodesToHtml(str, inheritedColor);
    }
    return `<span style="color: ${inheritedColor};">${escapeHtml(str)}</span>`;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => parseMinecraftComponentToHtml(item, inheritedColor)).join('');
  }

  if (typeof obj === 'object') {
    let currentColor = getColorHex(obj.color) || inheritedColor;
    let result = '';

    if (obj.text) {
      let styles = [];
      if (currentColor) styles.push(`color: ${currentColor}`);
      if (obj.bold) styles.push('font-weight: bold');
      if (obj.italic === true) styles.push('font-style: italic');
      if (obj.italic === false) styles.push('font-style: normal');
      let decs = [];
      if (obj.underlined) decs.push('underline');
      if (obj.strikethrough) decs.push('line-through');
      if (decs.length > 0) styles.push(`text-decoration: ${decs.join(' ')}`);

      const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
      result += `<span${styleAttr}>${escapeHtml(obj.text)}</span>`;
    }

    if (obj.extra && Array.isArray(obj.extra)) {
      result += parseMinecraftComponentToHtml(obj.extra, currentColor);
    }

    return result;
  }

  return `<span style="color: ${inheritedColor};">${escapeHtml(String(obj))}</span>`;
}

function formatMinecraftTextToHtml(input, defaultColor = '#ffffff') {
  if (!input) return `<span style="color: ${defaultColor};">Vật phẩm</span>`;

  if (typeof input === 'string') {
    let str = input.trim();
    if (str.startsWith('{') || str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        return parseMinecraftComponentToHtml(parsed, defaultColor);
      } catch (e) {}
    }
  }

  if (typeof input === 'object') {
    return parseMinecraftComponentToHtml(input, defaultColor);
  }

  return parseSectionCodesToHtml(String(input), defaultColor);
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
    const normalizedDisplay = normalizeSmallCaps(cleanDisplay);

    let iconItemQuery = '';
    if (rawName && rawName !== 'air') {
      iconItemQuery = rawName;
    } else if (itemQuery) {
      iconItemQuery = itemQuery;
    }

    const itemPayload = (typeof item === 'object' && item !== null)
      ? { ...item, name: iconItemQuery }
      : iconItemQuery;

    const iconUrl = getItemIconUrl(itemPayload);

    const isOrderTitle = /^(?:don\s*hang|order)/i.test(normalizedDisplay);

    let itemNameHtml = '';
    if (rawDisplay && !isOrderTitle && cleanDisplay !== 'Item' && cleanDisplay !== 'Vật phẩm') {
      itemNameHtml = formatMinecraftTextToHtml(rawDisplay, '#ffffff');
    } else {
      const derivedName = formatItemDisplayName(iconItemQuery);
      itemNameHtml = formatMinecraftTextToHtml(derivedName, '#ffffff');
    }

    let subInfoHtml = '';
    if (type === 'order') {
      let buyerName = item.buyer;
      if (!buyerName || buyerName === 'Ẩn danh' || /^(?:don\s*hang|order)/i.test(normalizeSmallCaps(buyerName))) {
        buyerName = cleanBuyerName(rawDisplay || cleanDisplay);
      }
      if (buyerName && buyerName !== 'Ẩn danh') {
        subInfoHtml = `<div class="sub-info">Người mua: <span class="highlight-user">${escapeHtml(buyerName)}</span></div>`;
      }
    } else if (type === 'ah' && item.seller && item.seller !== 'Ẩn danh') {
      subInfoHtml = `<div class="sub-info">Người bán: <span class="highlight-user">${escapeHtml(item.seller)}</span></div>`;
    }

    const count = parseInt(item.count) || 1;
    const countBadge = count > 1 ? `<span class="slot-count">${count}</span>` : '';

    return `
      <tr>
        <td class="stt">#${index + 1}</td>
        <td class="icon-td">
          <div class="mc-slot">
            <img class="item-icon" src="${iconUrl}" onerror="this.onerror=null;this.src='${SVG_QUESTION_MARK}';" alt="${rawName || 'item'}" />
            ${countBadge}
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

