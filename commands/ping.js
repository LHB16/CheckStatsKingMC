/**
 * commands/ping.js - Slash Command /ping & Prefix ?ping
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const pingServer = require('ping-minecraft-server');

const KINGMC_HOSTS = [
  { name: 'SGP Node (Singapore)', host: 'sgp.kingmc.vn', port: 25565 },
  { name: 'Java Node (Main)', host: 'java.kingmc.vn', port: 25565 },
  { name: 'Domain Node (Direct)', host: 'kingmc.vn', port: 25565 }
];

async function pingSingleHost(hostConfig) {
  const startTime = Date.now();
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await pingServer(hostConfig.host, hostConfig.port, { timeout: 6000 });
      const pingMs = Date.now() - startTime;
      return {
        ...hostConfig,
        online: true,
        ping: pingMs,
        players: res.players?.online || 0,
        maxPlayers: res.players?.max || 0,
        version: res.version?.name || 'Minecraft Server',
        motd: res.motd?.clean || res.description || 'N/A'
      };
    } catch (err) {
      if (attempt === 1) {
        await new Promise(r => setTimeout(r, 300));
      } else {
        return {
          ...hostConfig,
          online: false,
          ping: -1,
          players: 0,
          maxPlayers: 0,
          error: err.message
        };
      }
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Kiểm tra độ trễ (ping) của Discord Bot & trạng thái Server KingMC'),

  async execute(interaction) {
    const startTime = Date.now();

    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    // Ping tất cả các host của KingMC song song
    const pingResults = await Promise.all(KINGMC_HOSTS.map(pingSingleHost));

    const roundtripMs = Date.now() - startTime;
    const wsPing = interaction.client?.ws?.ping ?? -1;

    // Tìm node có kết quả tốt nhất (online, players cao nhất, ping thấp nhất)
    const onlineResults = pingResults.filter(r => r.online);
    let bestNodeText = '❌ Tất cả các Node KingMC đều không phản hồi';

    if (onlineResults.length > 0) {
      const bestNode = [...onlineResults].sort((a, b) => {
        if (a.players !== b.players) return b.players - a.players;
        return a.ping - b.ping;
      })[0];
      bestNodeText = `🟢 **${bestNode.name}** (\`${bestNode.host}\`) | Ping: \`${bestNode.ping}ms\` | Players: \`${bestNode.players}/${bestNode.maxPlayers}\``;
    }

    // Format danh sách Node
    const nodeLines = pingResults.map(res => {
      if (res.online) {
        return `🟢 **${res.name}** (\`${res.host}\`)\n   └ Độ trễ: \`${res.ping}ms\` • Người chơi: \`${res.players}/${res.maxPlayers}\``;
      } else {
        return `🔴 **${res.name}** (\`${res.host}\`)\n   └ Trạng thái: \`Offline / Timeout\``;
      }
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle('🏓 **Kiểm Tra Trạng Thái & Độ Trễ (Ping)** 🏓')
      .setColor('#2b2d31')
      .setThumbnail('https://mc-heads.net/head/BinhLH/3d')
      .setDescription(`Dưới đây là thông số kết nối của **Discord Bot** và các máy chủ **KingMC.vn**`)
      .addFields(
        {
          name: '🤖 **DISCORD BOT LATENCY**',
          value: `• **WebSocket Ping:** \`${wsPing >= 0 ? wsPing + 'ms' : 'N/A'}\`\n• **Phản hồi hệ thống (Roundtrip):** \`${roundtripMs}ms\``,
          inline: false
        },
        {
          name: '🌐 **TRẠNG THÁI CÁC NODE KINGMC**',
          value: nodeLines || 'Không có dữ liệu',
          inline: false
        },
        {
          name: '⚡ **NODE KHUYÊN DÙNG (TỐI ƯU NHẤT)**',
          value: bestNodeText,
          inline: false
        }
      )
      .setTimestamp()
      .setFooter({ text: 'KingMC.vn Stats Bot • Thiết kế bởi BinhLH' });

    if (interaction.editReply) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
};
