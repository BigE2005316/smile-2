const { Telegraf, session } = require('telegraf');
const dotenv = require('dotenv');
const express = require('express');
const { registerBotCommands } = require('./commands');
const walletMonitor = require('../services/walletMonitor');
const userService = require('../users/userService');
const { initializeEngine } = require('../services/copyTradingEngine');
const { initializeManualTrading } = require('../services/manualTrading');
const { getRPCManager } = require('../services/rpcManager');
const { getRealTradingExecutor } = require('../services/realTradingExecutor');

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

// Health check endpoint
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    uptime,
    memory: {
      rss: Math.round(memory.rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB'
    },
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
    awaitingWalletRegeneration: false,
    awaitingRegenerationChain: null,
    awaitingTokenAnalysis: false,
    pendingTradeId: null,
    quickBuyAmount: null,
    userWallets: null,
    walletToName: null,
    justAddedWallet: null,
    sellAllPositions: false
  })
}));

// Enhanced bot error handling
bot.catch(async (err, ctx) => {
  console.error('❌ Bot error:', err);
  
  // Get more context about the error
  const errorInfo = {
    updateType: ctx?.updateType,
    userId: ctx?.from?.id,
    username: ctx?.from?.username,
    chatId: ctx?.chat?.id,
    timestamp: new Date().toISOString(),
    errorMessage: err.message,
    errorStack: err.stack
  };
  
  console.error('📊 Error Details:', errorInfo);
  
  try {
    if (ctx && ctx.reply) {
      let errorMsg = '❌ An error occurred while processing your request.\n\n';
      
      // Provide specific error guidance
      if (err.message?.includes('rate limit') || err.message?.includes('429')) {
        errorMsg += '🔄 **Issue:** Network congestion detected\n';
        errorMsg += '💡 **Solution:** Please wait 30 seconds and try again\n';
        errorMsg += '⚡ **Status:** Our advanced RPC system is switching to backup providers';
      } else if (err.message?.includes('insufficient')) {
        errorMsg += '💰 **Issue:** Insufficient balance detected\n';
        errorMsg += '💡 **Solution:** Please check your wallet balance and try with a smaller amount';
      } else if (err.message?.includes('private key') || err.message?.includes('decrypt')) {
        errorMsg += '🔐 **Issue:** Wallet access error\n';
        errorMsg += '💡 **Solution:** Please regenerate your wallet with /regeneratewallet or contact support';
      } else if (err.message?.includes('not initialized') || err.message?.includes('trading executor')) {
        errorMsg += '🔧 **Issue:** Trading system initializing\n';
        errorMsg += '💡 **Solution:** Please try again in a few moments\n';
        errorMsg += '⚡ **Status:** System is preparing trading capabilities';
        
        // Try to initialize trading services
        try {
          const tradingExecutor = getRealTradingExecutor();
          await tradingExecutor.forceInitialize();
          
          const manualTrading = require('../services/manualTrading').getManualTradingService();
          await manualTrading.forceInitialize();
          
          errorMsg += '\n\n✅ **Update:** Trading services have been initialized. Please try again.';
        } catch (initError) {
          console.error('Failed to initialize trading services:', initError);
        }
      } else {
        errorMsg += '🔧 **Issue:** Temporary system error\n';
        errorMsg += '💡 **Solution:** Please try again in a few moments\n';
        errorMsg += '📞 **Support:** Use /support if the issue persists';
      }
      
      await ctx.reply(errorMsg, { parse_mode: 'Markdown' });
    }
  } catch (replyErr) {
    console.error('❌ Failed to send error message to user:', replyErr);
  }
  
  // Log to admin if configured
  try {
    if (process.env.ADMIN_TELEGRAM_ID && errorInfo.userId !== process.env.ADMIN_TELEGRAM_ID) {
      const adminMsg = `🚨 **Bot Error Report**\n\n` +
                      `👤 **User:** ${errorInfo.userId} (@${errorInfo.username || 'unknown'})\n` +
                      `🔧 **Type:** ${errorInfo.updateType}\n` +
                      `❌ **Error:** \`${errorInfo.errorMessage}\`\n` +
                      `⏰ **Time:** ${errorInfo.timestamp}`;
      
      await bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID, adminMsg, { parse_mode: 'Markdown' });
    }
  } catch (adminErr) {
    console.error('❌ Failed to notify admin:', adminErr.message);
  }
});

// Start bot
async function startBot() {
  try {
    console.log('🚀 Starting Smile Sniper Bot...');
    
    // Initialize Redis
    await userService.initRedis();
    console.log('✅ Database connection initialized');
    
    // Initialize RPC Manager first (critical for all blockchain operations)
    console.log('🌐 Initializing RPC Manager...');
    const rpcManager = getRPCManager();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const rpcStatus = rpcManager.getStatus();
    console.log(`📊 RPC Status: ${rpcStatus.healthyRPCs}/${rpcStatus.totalRPCs} healthy connections`);
    
    // Initialize Real Trading Executor
    console.log('💎 Initializing Real Trading Executor...');
    const tradingExecutor = getRealTradingExecutor();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (tradingExecutor.isHealthy()) {
      console.log('✅ Real Trading Executor ready - actual blockchain execution enabled');
    } else {
      console.warn('⚠️ Trading Executor not healthy - attempting to initialize...');
      await tradingExecutor.forceInitialize();
    }
    
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
      { command: 'setchain', description: 'Set Chain 设置链' },
      { command: 'buy', description: 'Buy Command 用命令买' },
      { command: 'sell', description: 'Sell Command 用命令卖' },
      { command: 'analyze', description: 'Analyze Token 分析代币' },
      { command: 'quickbuy', description: 'Quick Buy 快速购买' },
      { command: 'slippage', description: 'Set Slippage 设置滑点' },
      { command: 'cancel', description: 'Cancel 取消操作' }
    ]);
    console.log('✅ Telegram command menu registered');
    
    // Set bot instance for wallet monitor
    walletMonitor.setBotInstance(bot);
    
    // Start wallet monitoring
    walletMonitor.startMonitoring();
    
    // Register all command handlers
    registerBotCommands(bot);
    
    // Ensure no webhook is set (we use long polling)
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      console.log('🔗 Cleared existing webhook');
    } catch (whErr) {
      console.warn('Webhook clear warning:', whErr.description || whErr.message || whErr);
    }

    // Wait a bit more before launching
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Launch bot (long polling)
    await bot.launch({
      dropPendingUpdates: true,
      polling: {
        timeout: 30,
        limit: 100
      }
    });
    
    console.log('🤖 Smile Sniper Bot is running!');
    console.log(`👤 Bot username: @${bot.botInfo?.username || 'E_sniper_bot'}`);
    console.log(`🆔 Bot ID: ${bot.botInfo?.id}`);
    console.log(`📊 Admin ID: ${process.env.ADMIN_TELEGRAM_ID || 'Not set'}`);
    console.log(`💰 Dev Fee: ${process.env.DEV_FEE_PERCENT || 3}%`);
    console.log('🔗 Admin Wallets:');
    console.log(`   • Solana: ${process.env.ADMIN_WALLET_SOLANA || 'Not set'}`);
    console.log(`   • Ethereum: ${process.env.ADMIN_WALLET_ETHEREUM || 'Not set'}`);
    console.log(`   • BSC: ${process.env.ADMIN_WALLET_BSC || 'Not set'}`);
    
    // Log supported chains
    console.log('⛓️ Supported chains:');
    const supportedChains = rpcStatus.supportedChains;
    supportedChains.forEach(chain => {
      const status = rpcStatus.chains[chain];
      console.log(`   • ${chain.toUpperCase()}: ${status.healthy}/${status.total} healthy RPCs`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  bot.stop('SIGINT');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  bot.stop('SIGTERM');
  process.exit(0);
});

// Start the bot
startBot();

module.exports = bot;