/**
 * index.js - Main entrypoint for Discord Bot Check Stats
 * @description Quản lý Discord Client, Slash Command và khởi chạy bot Minecraft
 */

require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder 
} = require('discord.js');
const PersistentBot = require('./mc-bot');

// Đọc cấu hình từ .env
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const MC_USERNAME = process.env.MC_USERNAME || 'StatsChecker';
const MC_AUTH_TYPE = process.env.MC_AUTH_TYPE || 'offline';
const MC_PASSWORD = process.env.MC_PASSWORD || '';
const MC_SERVER_PORT = parseInt(process.env.MC_SERVER_PORT) || 25565;
const BOT_CHECK_TIMEOUT = parseInt(process.env.BOT_CHECK_TIMEOUT) || 15000;

// Parse danh sách hosts từ cấu hình
const MC_SERVER_HOSTS = (process.env.MC_SERVER_HOSTS || 'sgp.kingmc.vn,kingmc.vn')
  .split(',')
  .map(h => h.trim())
  .filter(h => h.length > 0);

// Khởi tạo Discord Client
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ] 
});

// Tạo một HTTP Server đơn giản để bypass Render Health Check
const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bot check stats is running! OK');
  } else {
    res.writeHead(404);
    res.end();
  }
});
server.listen(PORT, () => {
  console.log(`[HTTP-Server] Đang chạy trên cổng ${PORT} để phục vụ Render Health Check.`);
});

// Khởi tạo Bot Minecraft cắm liên tục
const credentials = {
  username: MC_USERNAME,
  authType: MC_AUTH_TYPE,
  password: MC_PASSWORD
};
const mcBot = new PersistentBot(credentials, MC_SERVER_HOSTS, MC_SERVER_PORT);
// Gọi hàm connect ngay khi khởi động
mcBot.connect();

// Biến trạng thái toàn cục để chống nghẽn lệnh (phòng ngừa, mcBot cũng đã check)
let isBusy = false;
let currentCheckingPlayer = '';

// Từ điển Custom Emojis Discord để hiển thị icon Minecraft in-game
const CUSTOM_EMOJIS = {
  'emerald': '<:emerald:1526222843585757405>',
  'sunflower': '<:gold_ingot:1526222925349388298>', // Dùng gold ingot đỡ cho xu
  'nether_star': '<:amethyst_shard:1526223433715810444>', // Dùng shard đỡ cho nether_star
  'diamond_sword': '<:netherite_sword:1526222996941967621>',
  'sword': '<:netherite_sword:1526222996941967621>',
  'skeleton_skull': '<:skeleton_skull:1526223042873655357>',
  'zombie_head': '<:zombie_head:1526223269437374464>',
  'clock': '<:clockss:1526227967422890225>',
  'chest': '<:chest:1526222711079174346>',
  'pickaxe': '<:diamond_pickaxe:1526222779287081040>',
  'gold': '<:gold_ingot:1526222925349388298>',
  'amethyst': '<:amethyst_shard:1526223433715810444>',
  'wheat': '<:wheat:1526223092974751766>',
  'brick': '<:brickss:1526227925865599130>'
};

// Hàm lấy Emoji dựa theo tên vật phẩm Minecraft
function getCustomEmoji(itemName) {
  if (!itemName) return '🔹';
  const nameLower = itemName.toLowerCase();
  
  // 1. Khớp chính xác
  if (CUSTOM_EMOJIS[nameLower]) return CUSTOM_EMOJIS[nameLower];
  
  // 2. Khớp từ khóa
  for (const [key, emoji] of Object.entries(CUSTOM_EMOJIS)) {
    if (nameLower.includes(key)) {
      return emoji;
    }
  }
  
  return '🔹'; // Icon mặc định nếu không có hình khối
}

// Định dạng tên vật phẩm Minecraft (vd: iron_chestplate -> Iron Chestplate)
function formatItemName(name) {
  if (!name) return 'Unknown';
  return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// Hàm phân loại tên để lấy tiêu đề nhãn (không còn lấy icon emoji nữa)
function getStatsLabel(item) {
  const nameLower = item.name.toLowerCase();
  const displayNameLower = item.displayName.toLowerCase();

  if (displayNameLower.includes('tiền') || displayNameLower.includes('xu') || displayNameLower.includes('money') || displayNameLower.includes('coin')) return 'Tài chính';
  if (displayNameLower.includes('shard') || displayNameLower.includes('ngôi sao') || displayNameLower.includes('sao') || displayNameLower.includes('★')) return 'Shards';
  if (displayNameLower.includes('kill') || displayNameLower.includes('giết') || displayNameLower.includes('hạ gục')) return 'Kills';
  if (displayNameLower.includes('death') || displayNameLower.includes('chết') || displayNameLower.includes('bị giết')) return 'Deaths';
  if (displayNameLower.includes('thời gian') || displayNameLower.includes('time') || displayNameLower.includes('giờ') || displayNameLower.includes('playtime')) return 'Thời gian chơi';
  if (displayNameLower.includes('rank') || displayNameLower.includes('danh hiệu') || displayNameLower.includes('cấp') || displayNameLower.includes('level')) return 'Rank/Cấp độ';

  return item.displayName || 'Thông tin';
}

// Lọc các item trang trí
function isDecorationItem(item) {
  const nameLower = item.name.toLowerCase();
  const displayName = item.displayName.trim();
  
  if (nameLower.includes('glass_pane') || nameLower === 'air' || nameLower === 'barrier') {
    return true;
  }
  if (!displayName || displayName === ' ' || displayName === '§f') {
    return true;
  }
  if ((!item.lore || item.lore.length === 0) && (nameLower.includes('pane') || nameLower.includes('stained'))) {
    return true;
  }
  
  return false;
}

client.once('clientReady', () => {
  console.log(`[Discord-Bot] Bot đã trực tuyến với tên: ${client.user.tag}`);
  registerSlashCommands();
});

async function registerSlashCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('stats')
      .setDescription('Kiểm tra stats (chỉ số) của một người chơi trên KingMC')
      .addStringOption(option => 
        option.setName('player')
          .setDescription('Tên người chơi Minecraft cần kiểm tra')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('bal')
      .setDescription('Kiểm tra số dư (balance) của một người chơi trên KingMC')
      .addStringOption(option => 
        option.setName('player')
          .setDescription('Tên người chơi cần kiểm tra')
          .setRequired(true)
      )
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    console.log('[Discord-Bot] Đang cập nhật slash commands...');
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log(`[Discord-Bot] Cập nhật thành công cho Guild: ${GUILD_ID}`);
    } else {
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('[Discord-Bot] Cập nhật thành công Global.');
    }
  } catch (error) {
    console.error('[Discord-Bot] Lỗi đăng ký slash commands:', error);
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'stats') {
    const targetPlayer = interaction.options.getString('player').trim();

    if (isBusy) {
      return interaction.reply({ 
        content: `❌ Bot hiện đang bận kiểm tra stats của người chơi **${currentCheckingPlayer}**. Vui lòng đợi trong giây lát và thử lại sau!`, 
        ephemeral: true 
      });
    }

    isBusy = true;
    currentCheckingPlayer = targetPlayer;

    await interaction.deferReply();

    try {
      // Dùng mcBot (PersistentBot) để lấy stats
      const result = await mcBot.getStats(targetPlayer, BOT_CHECK_TIMEOUT);

      // 3. Trang trí giao diện hiển thị Embed
      const embed = new EmbedBuilder()
        .setTitle(`✨ Thống kê người chơi: **${targetPlayer}** ✨`)
        .setDescription(`>>> 📡 *Dữ liệu được trích xuất từ server \`${result.serverUsed}\`*\n\nDưới đây là chi tiết các chỉ số hiện tại của người chơi:`)
        .setColor('#2b2d31') // Màu tối hiện đại chuẩn Discord
        .setThumbnail(`https://minotar.net/helm/${targetPlayer}/128.png`)
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      const validItems = result.items.filter(item => !isDecorationItem(item));

      if (validItems.length === 0) {
        embed.addFields({ name: '⚠️ Lưu ý', value: 'Không tìm thấy stats nào hữu ích hoặc người chơi này chưa từng đăng nhập.' });
        embed.setColor('#ef4444');
      } else {
        validItems.forEach(item => {
          const itemBlockName = formatItemName(item.name);
          const label = getStatsLabel(item);
          const emoji = getCustomEmoji(item.name);
          
          // Định dạng theo kiểu: <Emoji> Tên_Hiển_Thị
          const nameDisplay = `${emoji} **${item.displayName || label}**`;
          
          let valText = '';
          if (item.lore && item.lore.length > 0) {
            valText = item.lore.join('\n');
          } else {
            valText = '_Không có dữ liệu chi tiết_';
          }

          if (valText.length > 1024) {
            valText = valText.substring(0, 1010) + '...';
          }

          embed.addFields({
            name: nameDisplay,
            value: `>>> ${valText}`, // Dùng trích dẫn của Discord để làm nổi khối text
            inline: true
          });
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh stats cho ${targetPlayer}:`, error.message);
      
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Lỗi kiểm tra stats')
        .setDescription(`Không thể lấy stats của người chơi **${targetPlayer}**.\n\n**Chi tiết lỗi:**\n\`${error.message}\``)
        .setColor('#ef4444')
        .setTimestamp();
        
      await interaction.editReply({ embeds: [errorEmbed] });
    } finally {
      isBusy = false;
      currentCheckingPlayer = '';
    }
  }

  if (interaction.commandName === 'bal') {
    const targetPlayer = interaction.options.getString('player').trim();

    if (isBusy) {
      return interaction.reply({ 
        content: `⏳ Bot hiện đang bận xử lý yêu cầu cho **${currentCheckingPlayer}**. Vui lòng đợi trong giây lát!`, 
        ephemeral: true 
      });
    }

    isBusy = true;
    currentCheckingPlayer = targetPlayer;

    await interaction.deferReply();

    try {
      const balanceText = await mcBot.getBalance(targetPlayer, 15000);
      
      const embed = new EmbedBuilder()
        .setColor('#10b981')
        .setTitle(`💰 Số dư của ${targetPlayer}`)
        .setDescription(`>>> ${balanceText}`)
        .setTimestamp()
        .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error(`[Discord-Bot] Lỗi khi xử lý lệnh bal cho ${targetPlayer}:`, error.message);
      await interaction.editReply({ 
        content: `❌ **Lỗi:** ${error.message}\nCó thể bot chưa vào được máy chủ hoặc người chơi không tồn tại.` 
      });
    } finally {
      isBusy = false;
      currentCheckingPlayer = '';
    }
  }
});

process.on('uncaughtException', err => {
  console.error('[Process] Lỗi uncaughtException:', err);
  isBusy = false;
});

process.on('unhandledRejection', reason => {
  console.error('[Process] Lỗi unhandledRejection:', reason);
  isBusy = false;
});

if (DISCORD_TOKEN && DISCORD_TOKEN !== 'your_discord_bot_token_here') {
  client.login(DISCORD_TOKEN);
} else {
  console.error('[Discord-Bot] Chưa cấu hình DISCORD_TOKEN trong file .env!');
}
