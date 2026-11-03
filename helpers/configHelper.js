/**
 * helpers/configHelper.js - Quản lý cấu hình động cho Discord Bot:
 * - displayMode ('text' | 'image')
 * - restrictionMode ('whitelist' | 'blacklist' | 'none')
 * - whitelistGuildIds (Danh sách máy chủ được phép)
 * - blacklistGuildIds (Danh sách máy chủ bị chặn)
 * - discordInviteUrl (Link mời tham gia Discord)
 * - serverRestrictionName (Tên hiển thị server chính)
 * Hỗ trợ lưu trữ bền vững trên MongoDB Atlas và đồng bộ cục bộ fallback qua config.json
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getSystemConfig, setSystemConfig, isMongoAvailable } = require('./mongoHelper');

const CONFIG_PATH = path.join(__dirname, '../config.json');

const defaultConfig = {
  displayMode: 'text',
  restrictionMode: 'whitelist', // 'whitelist' | 'blacklist' | 'none'
  whitelistGuildIds: ['1515285801091731517'],
  blacklistGuildIds: [],
  allowedGuildId: '1515285801091731517', // backward compatibility
  discordInviteUrl: process.env.DISCORD_INVITE_URL || 'https://discord.gg/apMrvJAPy',
  serverRestrictionName: process.env.RESTRICTED_SERVER_NAME || 'KZ Sì to'
};

function normalizeIds(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map(id => String(id).trim()).filter(Boolean)));
  }
  if (typeof input === 'string') {
    return Array.from(new Set(input.split(/[,;\s]+/).map(id => id.trim()).filter(Boolean)));
  }
  return [];
}

function loadLocalConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      const parsed = JSON.parse(data);
      const merged = { ...defaultConfig, ...parsed };

      // Đảm bảo whitelistGuildIds luôn là mảng chuẩn
      if (!merged.whitelistGuildIds || !Array.isArray(merged.whitelistGuildIds)) {
        merged.whitelistGuildIds = normalizeIds(merged.whitelistGuildIds || merged.allowedGuildId);
      }
      if (merged.whitelistGuildIds.length === 0 && merged.allowedGuildId) {
        merged.whitelistGuildIds = [String(merged.allowedGuildId).trim()];
      }
      merged.blacklistGuildIds = normalizeIds(merged.blacklistGuildIds);

      return merged;
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
        const merged = { ...currentConfig, ...dbConfig };
        merged.whitelistGuildIds = normalizeIds(merged.whitelistGuildIds || merged.allowedGuildId);
        if (merged.whitelistGuildIds.length === 0 && merged.allowedGuildId) {
          merged.whitelistGuildIds = [String(merged.allowedGuildId).trim()];
        }
        merged.blacklistGuildIds = normalizeIds(merged.blacklistGuildIds);
        currentConfig = merged;
        saveLocalConfig(currentConfig);
      } else {
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
  getRestrictionMode() {
    return currentConfig.restrictionMode || 'whitelist';
  },
  getWhitelistGuildIds() {
    return currentConfig.whitelistGuildIds || ['1515285801091731517'];
  },
  getBlacklistGuildIds() {
    return currentConfig.blacklistGuildIds || [];
  },
  getAllowedGuildId() {
    return currentConfig.whitelistGuildIds?.[0] || currentConfig.allowedGuildId || '1515285801091731517';
  },
  getDiscordInviteUrl() {
    return currentConfig.discordInviteUrl || 'https://discord.gg/apMrvJAPy';
  },
  getServerRestrictionName() {
    return currentConfig.serverRestrictionName || 'KZ Sì to';
  },
  isGuildAllowed(guildId) {
    if (!guildId) return false;
    const gId = String(guildId).trim();
    const mode = currentConfig.restrictionMode || 'whitelist';

    if (mode === 'none') {
      return true;
    }

    if (mode === 'blacklist') {
      const blacklist = currentConfig.blacklistGuildIds || [];
      return !blacklist.includes(gId);
    }

    // Default mode: 'whitelist'
    const whitelist = currentConfig.whitelistGuildIds || ['1515285801091731517'];
    return whitelist.includes(gId);
  },
  getGuildRestrictionConfig() {
    return {
      restrictionMode: currentConfig.restrictionMode || 'whitelist',
      whitelistGuildIds: currentConfig.whitelistGuildIds || ['1515285801091731517'],
      blacklistGuildIds: currentConfig.blacklistGuildIds || [],
      allowedGuildId: currentConfig.whitelistGuildIds?.[0] || currentConfig.allowedGuildId || '1515285801091731517',
      discordInviteUrl: currentConfig.discordInviteUrl || 'https://discord.gg/apMrvJAPy',
      serverRestrictionName: currentConfig.serverRestrictionName || 'KZ Sì to'
    };
  },
  updateGuildRestrictionConfig({
    restrictionMode,
    whitelistGuildIds,
    blacklistGuildIds,
    allowedGuildId,
    discordInviteUrl,
    serverRestrictionName
  }) {
    if (restrictionMode && ['whitelist', 'blacklist', 'none'].includes(restrictionMode)) {
      currentConfig.restrictionMode = restrictionMode;
    }
    if (whitelistGuildIds !== undefined) {
      currentConfig.whitelistGuildIds = normalizeIds(whitelistGuildIds);
      if (currentConfig.whitelistGuildIds.length > 0) {
        currentConfig.allowedGuildId = currentConfig.whitelistGuildIds[0];
      }
    } else if (allowedGuildId !== undefined) {
      const normalized = normalizeIds(allowedGuildId);
      currentConfig.whitelistGuildIds = normalized;
      currentConfig.allowedGuildId = normalized[0] || '';
    }

    if (blacklistGuildIds !== undefined) {
      currentConfig.blacklistGuildIds = normalizeIds(blacklistGuildIds);
    }

    if (discordInviteUrl !== undefined) {
      currentConfig.discordInviteUrl = String(discordInviteUrl).trim();
    }
    if (serverRestrictionName !== undefined) {
      currentConfig.serverRestrictionName = String(serverRestrictionName).trim();
    }

    persistConfig();
    return this.getGuildRestrictionConfig();
  },
  createRestrictionPayload
};
