# 🤖 Smile Snipper Bot

Advanced multi-chain copy trading bot with real-time notifications for Solana, Ethereum, and BSC.

## ✨ Features

- 🔄 **Real-time wallet monitoring** across multiple blockchains
- 📱 **Instant trade notifications** with detailed transaction info
- 🔗 **Clickable token links** (Axiom, Dexscreener, Birdeye, etc.)
- 📊 **PnL tracking and statistics** with win/loss ratios
- 🛡️ **Daily spending limits** and stop-loss protection
- 🎯 **Customizable profit targets** (2x, 5x, 10x, etc.)
- 💾 **Redis support** with file storage fallback
- 🌐 **Multi-chain support** (Solana, Ethereum, BSC)
- 🚀 **Easy deployment** to major cloud platforms

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ 
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Redis (optional - will fallback to file storage)

### Local Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd smile-snipper-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

4. **Start the bot**
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Your Telegram bot token | ✅ |
| `REDIS_URL` | Redis connection URL | ❌ |
| `SOLANA_RPC` | Solana RPC endpoint | ❌ |
| `ETH_RPC` | Ethereum RPC endpoint | ❌ |
| `BSC_RPC` | BSC RPC endpoint | ❌ |
| `ADMIN_ID` | Admin Telegram user ID | ❌ |

### RPC Endpoints

For better performance, consider using premium RPC providers:

- **Alchemy**: `https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY`
- **Infura**: `https://mainnet.infura.io/v3/YOUR_KEY`
- **QuickNode**: Custom endpoints available

## 🌐 Deployment

### Railway (Recommended)

1. **Connect your repository** to Railway
2. **Set environment variables** in Railway dashboard
3. **Deploy automatically** - Railway will detect the configuration

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

### Render

1. **Connect your repository** to Render
2. **Use the render.yaml** configuration
3. **Set environment variables** in Render dashboard

### DigitalOcean App Platform

1. **Create a new app** from your repository
2. **Configure environment variables**
3. **Deploy with Docker** using the provided Dockerfile

### AWS EC2

1. **Launch an EC2 instance** (t3.micro recommended)
2. **Install Node.js and Redis**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs redis-server
   ```
3. **Clone and setup the bot**
   ```bash
   git clone <repository-url>
   cd smile-snipper-bot
   npm install
   cp env.example .env
   # Edit .env with your configuration
   ```
4. **Use PM2 for process management**
   ```bash
   npm install -g pm2
   pm2 start index.js --name "smile-snipper-bot"
   pm2 startup
   pm2 save
   ```

### Fly.io

1. **Install Fly CLI** and login
2. **Initialize Fly app**
   ```bash
   fly launch
   ```
3. **Set environment variables**
   ```bash
   fly secrets set TELEGRAM_BOT_TOKEN=your_token
   ```
4. **Deploy**
   ```bash
   fly deploy
   ```

## 📱 Bot Commands

### Wallet Management
- `/addwallet` - Add a wallet to track
- `/removewallet` - Remove a tracked wallet
- `/setchain` - Set blockchain (Solana/Ethereum/BSC)

### Trading Settings
- `/amount` - Set trade amount per transaction
- `/selltargets` - Set profit targets (e.g., 2x,5x,10x)
- `/setlimit` - Set daily spending limit
- `/stoploss` - Enable/disable stop-loss protection

### Information
- `/settings` - View current settings & stats
- `/help` - Show help message

### Control
- `/cancel` - Cancel current operation
- `/start` - Restart the bot

## 🔧 Advanced Configuration

### Custom RPC Endpoints

For production use, configure custom RPC endpoints in your `.env`:

```env
# High-performance endpoints
SOLANA_RPC=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY
ETH_RPC=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
BSC_RPC=https://bsc-dataseed1.binance.org/
```

### Redis Configuration

For better performance and data persistence:

```env
# Local Redis
REDIS_URL=redis://localhost:6379

# Redis Cloud
REDIS_URL=redis://username:password@host:port

# Railway Redis
REDIS_URL=${{Railway.REDIS_URL}}
```

## 📊 Monitoring & Analytics

The bot tracks comprehensive statistics:

- **Total trades** executed
- **Win/loss ratios** and percentages
- **Total PnL** across all trades
- **Daily spending** with limits
- **Real-time notifications** with token links

## 🛡️ Security Best Practices

1. **Keep your bot token secure** - never commit it to version control
2. **Use environment variables** for all sensitive data
3. **Enable Redis AUTH** if using Redis in production
4. **Monitor your bot logs** for unusual activity
5. **Set reasonable daily limits** to prevent excessive spending

## 🐛 Troubleshooting

### Common Issues

**Bot not responding:**
- Check if `TELEGRAM_BOT_TOKEN` is correct
- Verify the bot is running with `pm2 status` or check logs

**No trade notifications:**
- Ensure wallets are added with `/addwallet`
- Check if the correct chain is set with `/setchain`
- Verify RPC endpoints are working

**Redis connection errors:**
- Bot will fallback to file storage automatically
- Check Redis URL and credentials

### Logs

Check application logs:
```bash
# PM2 logs
pm2 logs smile-snipper-bot

# Docker logs
docker logs container_name

# Railway/Render logs
Check platform dashboard
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Open a GitHub issue for bugs or feature requests
- **Community**: Join our Telegram group for support

---

**⚠️ Disclaimer**: This bot is for educational purposes. Always do your own research and never invest more than you can afford to lose. Cryptocurrency trading involves significant risk. 