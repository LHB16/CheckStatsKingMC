/**
 * helpers/configHelper.js - Quản lý cấu hình động cho Discord Bot (displayMode, allowedGuildId, discordInviteUrl)
 * Hỗ trợ lưu trữ bền vững trên MongoDB Atlas và đồng bộ cục bộ fallback qua config.json
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getSystemConfig, setSystemConfig, isMongoAvailable } = require('./mongoHelper');

const CONFIG_PATH = path.join(__dirname, '../config.json');

const defaultConfig = {
  displayMode: 'text', // Mặc định là 'text' (có thể chuyển sang 'image')
  allowedGuildId: process.env.ALLOWED_GUILD_ID || '1515285801091731517',
  discordInviteUrl: process.env.DISCORD_INVITE_URL || 'https://discord.gg/apMrvJAPy',
  serverRestrictionName: process.env.RESTRICTED_SERVER_NAME || 'KZ Sì to'
};

function loadLocalConfig() {
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

function saveLocalConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[ConfigHelper] Lỗi khi ghi config.json:', err.message);
  }
}

let currentConfig = loadLocalConfig();

// Tự động đồng bộ từ MongoDB khi khởi động hoặc sau khi kết nối MongoDB
async function syncFromMongo() {
  try {
    if (isMongoAvailable()) {
      const dbConfig = await getSystemConfig('app_config', null);
      if (dbConfig && typeof dbConfig === 'object') {
        currentConfig = { ...currentConfig, ...dbConfig };
        saveLocalConfig(currentConfig);
      } else {
        // Lưu cấu hình hiện tại lên DB nếu DB chưa có
        await setSystemConfig('app_config', currentConfig, 'Cấu hình chung của ứng dụng');
      }
    }
  } catch (err) {
    console.warn('[ConfigHelper] Lỗi đồng bộ cấu hình từ MongoDB:', err.message);
  }
}

async function persistConfig() {
  saveLocalConfig(currentConfig);
  if (isMongoAvailable()) {
    await setSystemConfig('app_config', currentConfig, 'Cấu hình chung của ứng dụng').catch(() => {});
  }
}

function createRestrictionPayload() {
  const serverName = currentConfig.serverRestrictionName || 'KZ Sì to';
  const inviteUrl = currentConfig.discordInviteUrl || 'https://discord.gg/apMrvJAPy';

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setDescription(`⚠️ **Bot CheckStatsKingMC hiện tại chỉ hoạt động tại ${serverName}.**`)
    .setFooter({ text: 'CheckStatsKingMC • Thiết kế bởi BinhLH' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Tham Gia Server Discord Ngay')
      .setStyle(ButtonStyle.Link)
      .setURL(inviteUrl)
      .setEmoji('🔗')
  );

  return {
    embeds: [embed],
    components: [row]
  };
}

module.exports = {
  syncFromMongo,
  getDisplayMode() {
    return currentConfig.displayMode || 'text';
  },
  setDisplayMode(mode) {
    if (mode === 'text' || mode === 'image') {
      currentConfig.displayMode = mode;
      persistConfig();
    }
    return currentConfig.displayMode;
  },
  toggleDisplayMode() {
    currentConfig.displayMode = currentConfig.displayMode === 'image' ? 'text' : 'image';
    persistConfig();
    return currentConfig.displayMode;
  },
  getAllowedGuildId() {
    return currentConfig.allowedGuildId || '1515285801091731517';
  },
  getDiscordInviteUrl() {
    return currentConfig.discordInviteUrl || 'https://discord.gg/apMrvJAPy';
  },
  getServerRestrictionName() {
    return currentConfig.serverRestrictionName || 'KZ Sì to';
  },
  getGuildRestrictionConfig() {
    return {
      allowedGuildId: currentConfig.allowedGuildId || '1515285801091731517',
      discordInviteUrl: currentConfig.discordInviteUrl || 'https://discord.gg/apMrvJAPy',
      serverRestrictionName: currentConfig.serverRestrictionName || 'KZ Sì to'
    };
  },
  updateGuildRestrictionConfig({ allowedGuildId, discordInviteUrl, serverRestrictionName }) {
    if (allowedGuildId !== undefined) {
      currentConfig.allowedGuildId = String(allowedGuildId).trim();
    }
    if (discordInviteUrl !== undefined) {
      currentConfig.discordInviteUrl = String(discordInviteUrl).trim();
    }
    if (serverRestrictionName !== undefined) {
      currentConfig.serverRestrictionName = String(serverRestrictionName).trim();
    }
    persistConfig();
    return {
      allowedGuildId: currentConfig.allowedGuildId,
      discordInviteUrl: currentConfig.discordInviteUrl,
      serverRestrictionName: currentConfig.serverRestrictionName
    };
  },
  createRestrictionPayload
};
