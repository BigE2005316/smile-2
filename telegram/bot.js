const { Telegraf, session } = require('telegraf');
const dotenv = require('dotenv');
const express = require('express');
const { registerBotCommands } = require('./commands');
const walletMonitor = require('../services/walletMonitor');
const userService = require('../users/userService');
const { initializeEngine } = require('../services/copyTradingEngine');
const { initializeManualTrading } = require('../services/manualTrading');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Smile Snipper Bot is running',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

// Start express server
app.listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

// Session middleware with memory store
bot.use(session({
  defaultSession: () => ({
    awaitingWallet: false,
    awaitingChain: false,
    awaitingAmount: false,
    awaitingSellTargets: false,
    awaitingRemoveWallet: false,
    awaitingDailyLimit: false,
    awaitingStopLoss: false,
    awaitingTrailingStop: false,
    awaitingCopySells: false,
    awaitingCustomTPSL: false,
    awaitingTPSLChoice: false,
    awaitingTPLevels: false,
    awaitingSwitchChain: false,
    awaitingSupportLinks: false,
    awaitingWalletName: false,
    awaitingBeginWallet: false,
    awaitingPauseWallet: false,
    awaitingStopWallet: false,
    awaitingWalletNameOption: false,
    awaitingTradeConfirmation: false,
    awaitingQuickBuy: false,
    awaitingQuickBuyToken: false,
    pendingTradeId: null,
    quickBuyAmount: null,
    userWallets: null,
    walletToName: null,
    justAddedWallet: null
  })
}));

// Bot error handling
bot.catch((err, ctx) => {
  console.error('❌ Bot error:', err);
  try {
    ctx.reply('❌ An error occurred. Please try again or contact support.');
  } catch (e) {
    console.error('Failed to send error message:', e);
  }
});

// Register bot commands
registerBotCommands(bot);

// Graceful shutdown
async function gracefulShutdown() {
  console.log('🛑 Shutting down gracefully...');
  bot.stop('SIGINT');
  process.exit(0);
}

process.once('SIGINT', gracefulShutdown);
process.once('SIGTERM', gracefulShutdown);

// Start bot
async function startBot() {
  try {
    // Initialize Redis
    await userService.initRedis();
    
    // Initialize copy trading engine
    const copyTradingEngine = initializeEngine(bot);
    console.log('✅ Copy trading engine initialized');
    
    // Initialize manual trading service
    const manualTradingService = initializeManualTrading(bot);
    console.log('✅ Manual trading service initialized');
    
    // Register custom command menu so users see the "Menu" suggestions
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start 开始使用' },
      { command: 'help', description: 'Help 使用帮助' },
      { command: 'wallet', description: 'Wallet 钱包管理' },
      { command: 'balance', description: 'Balance 钱包余额' },
      { command: 'positions', description: 'Holdings 我的持仓' },
      { command: 'copytrade', description: 'Copy Trade 钱包跟单' },
      { command: 'addwallet', description: 'Add Wallet 追踪钱包' },
      { command: 'selltargets', description: 'Sell Targets 盈利目标' },
      { command: 'setlimit', description: 'Limit Orders 挂单列表' },
      { command: 'buy', description: 'Buy Command 用命令买' },
      { command: 'sell', description: 'Sell Command 用命令卖' },
      { command: 'cancel', description: 'Cancel 取消操作' }
    ]);
    console.log('✅ Telegram command menu registered');
    
    // Set bot instance for wallet monitor
    walletMonitor.setBotInstance(bot);
    
    // Start wallet monitoring
    walletMonitor.startMonitoring();
    
    // Ensure no webhook is set (we use long polling)
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('🔗 Cleared existing webhook');
    } catch (whErr) {
      console.warn('Webhook clear warning:', whErr.description || whErr.message || whErr);
    }

    // More aggressive webhook clearing
    let webhookCleared = false;
    let attempts = 0;
    while (!webhookCleared && attempts < 5) {
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log(`🔗 Webhook cleared (attempt ${attempts + 1})`);
        webhookCleared = true;
      } catch (err) {
        attempts++;
        console.warn(`Webhook clear attempt ${attempts} failed:`, err.description || err.message);
        if (attempts < 5) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        }
      }
    }

    // Wait a bit more before launching
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Launch bot (long polling)
    await bot.launch();
    console.log('🚀 Smile Sniper Bot is running!');
    console.log(`👤 Bot username: @${bot.botInfo?.username || 'E_sniper_bot'}`);
    console.log(`🆔 Bot ID: ${bot.botInfo?.id}`);
    console.log(`📊 Admin ID: ${process.env.ADMIN_TELEGRAM_ID || 'Not set'}`);
    console.log(`💰 Dev Fee: ${process.env.DEV_FEE_PERCENT || 3}%`);
    console.log('🔗 Admin Wallets:');
    console.log(`   • Solana: ${process.env.ADMIN_WALLET_SOLANA || 'Not set'}`);
    console.log(`   • Ethereum: ${process.env.ADMIN_WALLET_ETHEREUM || 'Not set'}`);
    console.log(`   • BSC: ${process.env.ADMIN_WALLET_BSC || 'Not set'}`);
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
startBot();

module.exports = bot;