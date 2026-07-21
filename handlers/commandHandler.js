/**
 * handlers/commandHandler.js - Quản lý tự động nạp & đăng ký Slash Commands
 */

const fs = require('fs');
const path = require('path');
const { REST, Routes, Collection } = require('discord.js');

class CommandHandler {
  constructor(client, queueDispatcher) {
    this.client = client;
    this.queueDispatcher = queueDispatcher;
    this.client.commands = new Collection();
  }

  // Khởi tạo và nạp tất cả các file lệnh trong thư mục commands/
  loadCommands() {
    const commandsPath = path.join(__dirname, '../commands');
    if (!fs.existsSync(commandsPath)) {
      console.warn('[CommandHandler] Thư mục commands/ không tồn tại.');
      return;
    }

    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    this.commandsData = [];

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
          this.client.commands.set(command.data.name, command);
          this.commandsData.push(command.data.toJSON());
          console.log(`[CommandHandler] Đã nạp thành công lệnh: /${command.data.name}`);
        } else {
          console.warn(`[CommandHandler] File lệnh tại ${filePath} thiếu thuộc tính "data" hoặc "execute".`);
        }
      } catch (err) {
        console.error(`[CommandHandler] Lỗi khi nạp file lệnh ${filePath}:`, err);
      }
    }
  }

  // Đăng ký Slash Commands với Discord REST API
  async registerSlashCommands(token, clientId, guildId) {
    if (!this.commandsData || this.commandsData.length === 0) return;

    const rest = new REST({ version: '10' }).setToken(token);

    try {
      console.log('[CommandHandler] Đang đăng ký Slash Commands với Discord...');
      if (guildId) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: this.commandsData });
        console.log(`[CommandHandler] Cập nhật thành công ${this.commandsData.length} lệnh cho Guild: ${guildId}`);
      } else {
        await rest.put(Routes.applicationCommands(clientId), { body: this.commandsData });
        console.log(`[CommandHandler] Cập nhật thành công ${this.commandsData.length} lệnh Global.`);
      }
    } catch (error) {
      console.error('[CommandHandler] Lỗi khi đăng ký Slash Commands:', error);
    }
  }

  // Xử lý sự kiện Interaction
  async handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = this.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[CommandHandler] Không tìm thấy handler xử lý cho lệnh /${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction, this.queueDispatcher);
    } catch (error) {
      console.error(`[CommandHandler] Lỗi khi thực thi lệnh /${interaction.commandName}:`, error);
      const replyPayload = {
        content: `❌ Đã xảy ra lỗi hệ thống khi thực hiện lệnh: \`${error.message}\``,
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(replyPayload);
      } else {
        await interaction.reply(replyPayload);
      }
    }
  }
}

module.exports = CommandHandler;
