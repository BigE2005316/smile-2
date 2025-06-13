# 📁 Project Structure - Smile Snipper Bot

## 🏗️ Directory Layout

```
multichain-copytrader/
│
├── 📄 index.js                 # Main bot entry point
├── 📄 health.js               # Health check endpoint
├── 📄 test-bot.js            # Bot testing utility
├── 📄 .env                   # Environment configuration (YOUR SECRETS)
├── 📄 env.example            # Example env file (for reference)
├── 📄 package.json           # Node.js dependencies
├── 📄 README.md              # Project documentation
│
├── 📁 telegram/              # Telegram bot commands
│   └── 📁 commands/
│       ├── 📄 index.js      # Command registration
│       ├── 📄 start.js      # /start command
│       ├── 📄 help.js       # /help command
│       ├── 📄 settings.js   # /settings command
│       ├── 📄 admin.js      # Admin commands (ONLY FOR YOU)
│       └── ... (other commands)
│
├── 📁 services/              # Core services
│   ├── 📄 walletMonitor.js  # Blockchain monitoring
│   ├── 📄 advancedTrading.js # Trading features
│   └── 📄 transactionHandler.js
│
├── 📁 users/                 # User data management
│   ├── 📄 userService.js    # User data service
│   └── 📄 userData.json     # User database (auto-created)
│
└── 📁 node_modules/          # Dependencies (auto-installed)
```

## 🎯 Key Files You Should Know

### 1. **`.env`** - Your Configuration
- Contains YOUR admin ID and wallet addresses
- Bot token
- Dev fee percentage
- **⚠️ NEVER SHARE THIS FILE!**

### 2. **`telegram/commands/admin.js`** - Your Admin Panel
- Only accessible by YOU (ID: 5290841278)
- Contains all admin commands
- Fee management, user stats, broadcasts

### 3. **`services/walletMonitor.js`** - Fee Collection
- Monitors all trades
- Calculates and tracks your 3% dev fee
- Sends fees to your chain-specific wallets

### 4. **`index.js`** - Main Bot
- Starts all services
- Initializes Telegram bot
- Handles graceful shutdown

## 💰 Your Admin Features

1. **Fee Collection**
   - Automatic 3% on all trades
   - Tracked per chain
   - View with `/viewfees`

2. **User Management**
   - View all users: `/users`
   - User details: `/userinfo <id>`
   - Broadcast: `/broadcast <message>`

3. **Statistics**
   - Global stats: `/globalstats`
   - Bot status: `/botstatus`
   - Chain stats: `/chainstats`

## 🚀 Quick Commands

```bash
# Start the bot
npm start

# Test the bot
node test-bot.js

# View logs
npm start 2>&1 | tee bot.log

# Stop the bot
Ctrl+C (or pkill -f "node index.js")
```

## 📱 Your Admin Wallets

- **Solana**: `4mow4nhmJ1CjmtAN5k51LNojGRNkxzFo8faqT8u9oLuW`
- **Ethereum/Base**: `0xe04204B36Bd4B47EBCE3408F8009Ea6A40036f69`
- **BSC**: `0xe04204B36Bd4B47EBCE3408F8009Ea6A40036f69`

Remember: Only YOU can see admin commands! Other users have no idea they exist. 🔒 