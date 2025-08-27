# Ranked Bedwars Utility Bot

A comprehensive Discord bot designed to enhance the Ranked Bedwars community with powerful moderation, ticketing, and utility features.

## 🔧 Features

### 🎟️ Ticket System
- Create and manage support tickets with different categories
- Staff claim system for ticket handling
- Automatic ticket archiving and logging
- Customizable ticket categories and permissions

### 🎉 Giveaways
- Create and manage giveaways with custom requirements
- Enter giveaways with a single click
- Automatic winner selection and announcement
- Role requirement support

### 🏷️ Reaction Roles
- Self-assignable roles through reactions
- Role categories and role limits
- Easy setup and management

### 🛠️ Staff Utilities
- User information lookup
- Moderation actions (kick, ban, mute)
- Server statistics and logging
- Activity tracking

### 🏓 PUGS/PUPS System
- Player ranking and statistics
- Matchmaking and team management
- Voting system for player promotions
- Leaderboard tracking

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/ranked-bedwars-bot.git
   cd ranked-bedwars-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure the bot**
   - Copy `config.example.json` to `config.json`
   - Fill in your bot token and other configuration options

4. **Deploy commands**
   ```bash
   node deploy-commands.js
   ```

5. **Start the bot**
   ```bash
   node index.js
   ```

## ⚙️ Configuration

Create a `config.json` file in the root directory with the following structure:

```json
{
  "token": "YOUR_DISCORD_BOT_TOKEN",
  "clientId": "YOUR_BOT_CLIENT_ID",
  "guildId": "YOUR_SERVER_ID",
  "ticket": {
    "categories": [
      {
        "id": "general",
        "label": "General",
        "description": "General inquiries and questions",
        "emoji": "❓",
        "staffRoles": ["ROLE_ID_1", "ROLE_ID_2"]
      }
    ],
    "ticketCategoryId": "TICKET_CATEGORY_ID",
    "logChannel": "ticket-logs",
    "archiveCategory": "ticket-archive",
    "inactiveTimeout": 172800000,
    "maxTickets": 3,
    "globalStaffRoles": ["ROLE_ID_1", "ROLE_ID_2"]
  }
}
```

## 📜 Commands

### Ticket Commands
- `/ticket setup` - Set up the ticket system
- `/ticket add @user` - Add a user to the current ticket
- `/ticket remove @user` - Remove a user from the current ticket
- `/ticket close [reason]` - Close the current ticket
- `/ticket claim` - Claim the current ticket as staff

### Staff Commands
- `/staff stats` - View staff statistics
- `/staff info @user` - Get information about a user

### Utility Commands
- `/info` - Get bot information
- `/say [message]` - Make the bot say something
- `/rules` - Display server rules

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📝 Credits

- Developed by [Your Name]
- Special thanks to the Ranked Bedwars community

## 🔗 Links

- [Invite the Bot](https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands)
- [Support Server](https://discord.gg/YOUR_INVITE_LINK)
- [GitHub Repository](https://github.com/yourusername/ranked-bedwars-bot)
