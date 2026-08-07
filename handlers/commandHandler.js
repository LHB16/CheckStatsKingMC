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
    this.cooldowns = new Collection();
    this.activeUsers = new Set();
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

  // Phương thức kiểm tra Spam (Cooldown & Overlap)
  checkSpam(userId) {
    if (this.activeUsers.has(userId)) {
      return { isSpam: true, message: '⚠️ Bạn đang có một lệnh đang được xử lý, vui lòng đợi!' };
    }

    const now = Date.now();
    const cooldownAmount = 5000; // 5 giây

    if (this.cooldowns.has(userId)) {
      const expirationTime = this.cooldowns.get(userId) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
        return { isSpam: true, message: `⏳ Vui lòng đợi **${timeLeft}s** trước khi dùng lệnh tiếp theo.` };
      }
    }

    // Đánh dấu người dùng đang active và thời điểm dùng lệnh
    this.cooldowns.set(userId, now);
    this.activeUsers.add(userId);

    // Tự động dọn dẹp cooldown sau 5 giây để tránh rò rỉ bộ nhớ
    setTimeout(() => this.cooldowns.delete(userId), cooldownAmount);

    return { isSpam: false };
  }

  // Gỡ bỏ trạng thái Active của user sau khi lệnh xong
  finishUserTask(userId) {
    this.activeUsers.delete(userId);
  }

  // Xử lý sự kiện Interaction
  async handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = this.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[CommandHandler] Không tìm thấy handler xử lý cho lệnh /${interaction.commandName}`);
      return;
    }

    const userId = interaction.user.id;
    const spamCheck = this.checkSpam(userId);
    if (spamCheck.isSpam) {
      return interaction.reply({ content: spamCheck.message, ephemeral: true });
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
    } finally {
      this.finishUserTask(userId);
    }
  }
}

module.exports = CommandHandler;
