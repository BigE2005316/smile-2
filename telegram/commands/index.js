// telegram/commands/index.js

// Non-scene command handlers (functions that take 'bot')
const start = require('./start');
const help = require('./help');
const addWallet = require('./addwallet');
const sellTargets = require('./selltargets');
const setLimit = require('./setlimit');
const removeWallet = require('./removewallet');
const settings = require('./settings');
const stopLoss = require('./stoploss');

// Advanced trading commands
const trailingStop = require('./trailingstop');
const copySells = require('./copysells');
const customTPSL = require('./customtpsl');
const positions = require('./positions');

// New user commands
const wallet = require('./wallet');
const support = require('./support');
const referral = require('./referral');

// Wallet control commands
const walletControl = require('./walletControl');

// Manual trading commands
const trading = require('./trading');

// Recovery commands for lost/old wallets
const recovery = require('./recovery');

// Enhanced trading commands (Composer-style)
const enhancedTrading = require('./enhancedTrading');

// Enhanced manual trading commands (Composer-style)
const enhancedManualTrading = require('./enhancedManualTrading');

// Admin commands (Composer-style)
const admin = require('./admin');

// Command flow modules (session-based)
const amountHandler = require('./amount');
const setChainHandler = require('./setchain');

// Centralized message handler
const { handleTextMessage, messageHandler } = require('./messageHandler');

function registerBotCommands(bot) {
  console.log('🔧 Registering bot commands...');
  
  // 1. Register interactive flows
  amountHandler(bot);
  setChainHandler(bot);

  // 2. Register basic command functions
  start(bot);
  help(bot);
  addWallet(bot);
  sellTargets(bot);
  setLimit(bot);
  removeWallet(bot);
  settings(bot);
  stopLoss(bot);

  // 3. Register advanced trading commands
  trailingStop(bot);
  copySells(bot);
  customTPSL(bot);
  positions(bot);

  // 4. Register new user commands
  bot.use(wallet);
  support(bot);

  // 5. Register Composer-style commands
  if (typeof referral === 'function') {
    referral(bot);
  } else {
    bot.use(referral);
  }

  // 6. Register wallet control commands
  walletControl(bot);

  // 7. Register manual trading commands
  trading(bot);

  // 8. Register recovery commands for wallet recovery
  recovery(bot);

  // 9. Register enhanced trading commands (Composer-style)
  bot.use(enhancedTrading);

  // 10. Register enhanced manual trading commands (Composer-style)
  bot.use(enhancedManualTrading);

  // 11. Register admin commands (Composer-style)
  bot.use(admin);

  // 12. Global cancel command to exit any pending prompt
  bot.command('cancel', (ctx) => {
    const session = ctx.session || {};
    
    // Clear ALL possible session flags
    const sessionKeys = Object.keys(session);
    sessionKeys.forEach(key => {
      if (key.startsWith('awaiting')) {
        session[key] = false;
      }
    });
    
    // Explicitly clear known session flags
    session.awaitingWallet = false;
    session.awaitingChain = false;
    session.awaitingAmount = false;
    session.awaitingSellTargets = false;
    session.awaitingRemoveWallet = false;
    session.awaitingDailyLimit = false;
    session.awaitingStopLoss = false;
    session.awaitingTrailingStop = false;
    session.awaitingCopySells = false;
    session.awaitingCustomTPSL = false;
    session.awaitingTPSLChoice = false;
    session.awaitingTPLevels = false;
    session.awaitingSwitchChain = false;
    session.awaitingSupportLinks = false;
    
    // Clear new wallet control sessions
    session.awaitingWalletName = false;
    session.awaitingBeginWallet = false;
    session.awaitingPauseWallet = false;
    session.awaitingStopWallet = false;
    session.awaitingWalletNameOption = false;
    
    // Clear trading sessions
    session.awaitingTradeConfirmation = false;
    session.awaitingQuickBuy = false;
    session.awaitingQuickBuyToken = false;
    session.pendingTradeId = null;
    session.quickBuyAmount = null;
    
    // Clear any stored data
    session.userWallets = null;
    session.walletToName = null;
    session.justAddedWallet = null;
    
    // Update session
    ctx.session = session;
    
    return ctx.reply('🚫 Operation cancelled. All pending actions have been cleared.\n\nUse /help to see available commands.');
  });

  // 13. Register centralized text message handler (only once!)
  bot.on('text', handleTextMessage);
  
  // 14. Register message handler for buy/sell commands
  bot.use(messageHandler);
  
  console.log('✅ Bot commands registered successfully');
}

module.exports = { registerBotCommands };
