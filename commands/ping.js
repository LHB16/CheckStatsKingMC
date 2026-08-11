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
    if (interaction.deferReply) {
      await interaction.deferReply();
    }

    // Ping tất cả các host của KingMC song song
    const pingResults = await Promise.all(KINGMC_HOSTS.map(pingSingleHost));

    const lines = pingResults.map(res => {
      if (res.online) {
        return `${res.host} : ${res.ping}ms : ${res.players}/${res.maxPlayers}`;
      } else {
        return `${res.host} : Offline`;
      }
    }).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('ping')
      .setColor('#2b2d31')
      .setDescription(`\`\`\`text\n${lines}\n\`\`\``);

    if (interaction.editReply) {
      await interaction.editReply({ embeds: [embed] });
    } else {
      await interaction.reply({ embeds: [embed] });
    }
  }
};
