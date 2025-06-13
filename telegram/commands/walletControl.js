// telegram/commands/walletControl.js - Wallet Control Commands
const userService = require('../../users/userService');
const { getEngine } = require('../../services/copyTradingEngine');

module.exports = function(bot) {
  // Name a wallet
  bot.command('namewallet', async (ctx) => {
    const userId = String(ctx.from.id);
    const userData = await userService.getUserSettings(userId);
    
    if (!userData.wallets || userData.wallets.length === 0) {
      return ctx.reply('❌ You have no tracked wallets. Add one with /addwallet first.');
    }
    
    ctx.session = ctx.session || {};
    ctx.session.awaitingWalletName = true;
    ctx.session.walletToName = null;
    
    // Build wallet list with current names
    let walletList = '📝 **Select a wallet to name:**\n\n';
    userData.wallets.forEach((wallet, index) => {
      const currentName = userData.walletNames?.[wallet] || '';
      const displayName = currentName ? `"${currentName}"` : 'No name';
      walletList += `${index + 1}. \`${wallet.substring(0, 8)}...${wallet.substring(wallet.length - 8)}\`\n   Current: ${displayName}\n\n`;
    });
    
    walletList += 'Send the number of the wallet you want to name, or /cancel to exit.';
    
    return ctx.reply(walletList, { parse_mode: 'Markdown' });
  });
  
  // Begin trading for a wallet
  bot.command('begin', async (ctx) => {
    const userId = String(ctx.from.id);
    const userData = await userService.getUserSettings(userId);
    
    if (!userData.wallets || userData.wallets.length === 0) {
      return ctx.reply('❌ You have no tracked wallets. Add one with /addwallet first.');
    }
    
    const engine = getEngine();
    if (!engine) {
      return ctx.reply('❌ Trading engine not initialized. Please try again.');
    }
    
    // Build wallet list with status
    let walletList = '▶️ **Select wallet to BEGIN trading:**\n\n';
    
    for (let i = 0; i < userData.wallets.length; i++) {
      const wallet = userData.wallets[i];
      const name = engine.getWalletDisplayName(userId, wallet);
      const status = userData.walletStatus?.[wallet] || 'active';
      const statusEmoji = status === 'active' || status === 'begin' ? '🟢' : status === 'paused' ? '⏸️' : '🔴';
      
      walletList += `${i + 1}. ${statusEmoji} **${name}**\n`;
      walletList += `   \`${wallet}\`\n`;
      walletList += `   Status: ${status.toUpperCase()}\n\n`;
    }
    
    walletList += 'Send the number of the wallet to begin trading, or /cancel to exit.';
    
    ctx.session = ctx.session || {};
    ctx.session.awaitingBeginWallet = true;
    ctx.session.userWallets = userData.wallets;
    
    return ctx.reply(walletList, { parse_mode: 'Markdown' });
  });
  
  // Pause trading for a wallet
  bot.command('pause', async (ctx) => {
    const userId = String(ctx.from.id);
    const userData = await userService.getUserSettings(userId);
    
    if (!userData.wallets || userData.wallets.length === 0) {
      return ctx.reply('❌ You have no tracked wallets. Add one with /addwallet first.');
    }
    
    const engine = getEngine();
    if (!engine) {
      return ctx.reply('❌ Trading engine not initialized. Please try again.');
    }
    
    // Build wallet list with status
    let walletList = '⏸️ **Select wallet to PAUSE trading:**\n\n';
    
    for (let i = 0; i < userData.wallets.length; i++) {
      const wallet = userData.wallets[i];
      const name = engine.getWalletDisplayName(userId, wallet);
      const status = userData.walletStatus?.[wallet] || 'active';
      const statusEmoji = status === 'active' || status === 'begin' ? '🟢' : status === 'paused' ? '⏸️' : '🔴';
      
      walletList += `${i + 1}. ${statusEmoji} **${name}**\n`;
      walletList += `   \`${wallet}\`\n`;
      walletList += `   Status: ${status.toUpperCase()}\n\n`;
    }
    
    walletList += 'Send the number of the wallet to pause, or /cancel to exit.\n\n';
    walletList += '💡 Tip: Paused wallets will not copy trades until resumed.';
    
    ctx.session = ctx.session || {};
    ctx.session.awaitingPauseWallet = true;
    ctx.session.userWallets = userData.wallets;
    
    return ctx.reply(walletList, { parse_mode: 'Markdown' });
  });
  
  // Stop trading for a wallet
  bot.command('stop', async (ctx) => {
    const userId = String(ctx.from.id);
    const userData = await userService.getUserSettings(userId);
    
    if (!userData.wallets || userData.wallets.length === 0) {
      return ctx.reply('❌ You have no tracked wallets. Add one with /addwallet first.');
    }
    
    const engine = getEngine();
    if (!engine) {
      return ctx.reply('❌ Trading engine not initialized. Please try again.');
    }
    
    // Build wallet list with status
    let walletList = '🛑 **Select wallet to STOP trading:**\n\n';
    
    for (let i = 0; i < userData.wallets.length; i++) {
      const wallet = userData.wallets[i];
      const name = engine.getWalletDisplayName(userId, wallet);
      const status = userData.walletStatus?.[wallet] || 'active';
      const statusEmoji = status === 'active' || status === 'begin' ? '🟢' : status === 'paused' ? '⏸️' : '🔴';
      
      walletList += `${i + 1}. ${statusEmoji} **${name}**\n`;
      walletList += `   \`${wallet}\`\n`;
      walletList += `   Status: ${status.toUpperCase()}\n\n`;
    }
    
    walletList += 'Send the number of the wallet to stop trading, or /cancel to exit.\n\n';
    walletList += '⚠️ Warning: Stopped wallets will not copy any trades.';
    
    ctx.session = ctx.session || {};
    ctx.session.awaitingStopWallet = true;
    ctx.session.userWallets = userData.wallets;
    
    return ctx.reply(walletList, { parse_mode: 'Markdown' });
  });
  
  // View wallet status
  bot.command('walletstatus', async (ctx) => {
    const userId = String(ctx.from.id);
    const userData = await userService.getUserSettings(userId);
    
    if (!userData.wallets || userData.wallets.length === 0) {
      return ctx.reply('❌ You have no tracked wallets. Add one with /addwallet first.');
    }
    
    const engine = getEngine();
    if (!engine) {
      return ctx.reply('❌ Trading engine not initialized. Please try again.');
    }
    
    let message = '📊 **Your Tracked Wallets Status**\n\n';
    
    for (const wallet of userData.wallets) {
      const name = engine.getWalletDisplayName(userId, wallet);
      const status = userData.walletStatus?.[wallet] || 'active';
      const statusEmoji = status === 'active' || status === 'begin' ? '🟢' : status === 'paused' ? '⏸️' : '🔴';
      
      message += `${statusEmoji} **${name}**\n`;
      message += `\`${wallet}\`\n`;
      message += `Status: ${status.toUpperCase()}\n`;
      
      // Add position info if available
      if (userData.positions && userData.positions[wallet]) {
        const positions = Object.keys(userData.positions[wallet]).length;
        message += `Positions: ${positions}\n`;
      }
      
      message += '\n';
    }
    
    message += '**Commands:**\n';
    message += '• /begin - Start copying trades\n';
    message += '• /pause - Pause trading temporarily\n';
    message += '• /stop - Stop trading completely\n';
    message += '• /namewallet - Set custom names';
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
  });
}; 