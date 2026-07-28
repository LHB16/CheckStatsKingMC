/**
 * helpers/configHelper.js - Quản lý cấu hình động cho Discord Bot (displayMode: 'text' | 'image')
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../config.json');

const defaultConfig = {
  displayMode: 'text' // 'text' hoặc 'image'
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('[ConfigHelper] Lỗi khi đọc config.json:', err.message);
  }
  return { ...defaultConfig };
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[ConfigHelper] Lỗi khi ghi config.json:', err.message);
  }
}

let currentConfig = loadConfig();

module.exports = {
  getDisplayMode() {
    return currentConfig.displayMode || 'text';
  },
  setDisplayMode(mode) {
    if (mode === 'text' || mode === 'image') {
      currentConfig.displayMode = mode;
      saveConfig(currentConfig);
    }
    return currentConfig.displayMode;
  },
  toggleDisplayMode() {
    currentConfig.displayMode = currentConfig.displayMode === 'image' ? 'text' : 'image';
    saveConfig(currentConfig);
    return currentConfig.displayMode;
  }
};
