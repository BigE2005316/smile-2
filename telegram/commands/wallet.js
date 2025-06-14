const { Composer } = require('telegraf');
const walletService = require('../../services/walletService');
const userService = require('../../users/userService');

const walletHandler = new Composer();

// Enhanced wallet creation command with auto-initialization
walletHandler.command('wallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    const chain = userSettings.chain;
    
    // Show loading message
    const loadingMsg = await ctx.reply('🔄 Loading your wallet...');
    
    try {
      // Create or get wallet
      const result = await walletService.getOrCreateWallet(userId, chain);
      
      if (!result) {
        await ctx.editMessageText('❌ Failed to create or retrieve wallet. Please try again.');
        return;
      }
      
      // Get real-time balance
      const balanceInfo = await walletService.getWalletBalance(result.address, chain);
      
      let message = `💼 **Your ${chain.toUpperCase()} Wallet**\n\n`;
      message += `📍 **Address:**\n\`${result.address}\`\n\n`;
      message += `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
      message += `💵 **USD Value:** $${balanceInfo.usdValue}\n`;
      
      if (balanceInfo.tokenPrice) {
        message += `📈 **${balanceInfo.symbol} Price:** $${balanceInfo.tokenPrice.toFixed(2)}\n`;
      }
      
      message += `\n🔄 **Status:** ${result.exists ? 'Existing wallet loaded' : 'New wallet created'}\n`;
      
      if (balanceInfo.error) {
        message += `⚠️ **Note:** ${balanceInfo.error}\n`;
      }
      
      message += `\n💡 **Quick Actions:**\n`;
      message += `• \`/exportwallet\` - Export private key (SECURE!)\n`;
      message += `• \`/balance\` - Check current balance\n`;
      message += `• \`/buy <amount> <token>\` - Buy tokens\n`;
      message += `• \`/sell <token>\` - Sell tokens\n`;
      message += `• \`/sendtokens <address> <amount>\` - Send tokens\n\n`;
      
      message += `🔥 **To add funds:** Send ${balanceInfo.symbol} to your wallet address above\n`;
      message += `⚡ **Ready for trading:** Your wallet is connected and ready for manual trades\n\n`;
      
      message += `🚨 **Security Notice:**\n`;
      message += `• Your private key is encrypted with AES-256-GCM\n`;
      message += `• Only export private key in secure environments\n`;
      message += `• Never share your private key with anyone`;
      
      // Add quick action buttons
      const keyboard = {
        inline_keyboard: [
          [
            { text: '💰 Check Balance', callback_data: `balance_${chain}` },
            { text: '📤 Export Wallet', callback_data: `exportwallet_${chain}` }
          ],
          [
            { text: '🔄 Refresh', callback_data: `wallet_refresh_${chain}` },
            { text: '⚙️ Settings', callback_data: 'wallet_settings' }
          ],
          [
            { text: '🔄 Switch Chain', callback_data: 'switch_chain_menu' },
            { text: '💸 Start Trading', callback_data: 'start_trading' }
          ]
        ]
      };
      
      await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Wallet command error:', error);
      await ctx.editMessageText('❌ Error retrieving wallet information. Please try again or contact support.');
    }
    
  } catch (error) {
    console.error('Wallet command error:', error);
    await ctx.reply('❌ Error retrieving wallet information. Please try again or contact support.');
  }
});

// Enhanced export wallet command with better error handling
walletHandler.command('exportwallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    const chain = userSettings.chain;
    
    // Show loading message
    const loadingMsg = await ctx.reply('🔐 Exporting wallet information...');
    
    try {
      // Attempt to export wallet information
      const exportResult = await walletService.exportWalletInfo(userId, chain);
      
      if (!exportResult) {
        await ctx.editMessageText('❌ No wallet found for export. Please create a wallet first with /wallet');
        return;
      }
      
      // Check if decryption failed
      if (exportResult.privateKey === 'undefined' || exportResult.error?.includes('decrypt')) {
        // Handle decryption failure
        const failureInfo = await walletService.handleDecryptionFailure(userId, chain);
        
        let message = `🔧 **Wallet Decryption Issue Detected**\n\n`;
        message += `❌ **Issue:** Cannot decrypt your existing wallet\n`;
        message += `📍 **Old Wallet:** \`${exportResult.address}\`\n`;
        message += `📅 **Created:** ${new Date(exportResult.createdAt).toLocaleString()}\n\n`;
        
        message += `💡 **Solution Options:**\n`;
        message += `1️⃣ **Create Fresh Wallet** - Use \`/regeneratewallet\` (RECOMMENDED)\n`;
        message += `2️⃣ **Transfer Tokens** - Use \`/sendtokens <address> <amount>\` to move funds\n`;
        message += `3️⃣ **Import External** - Use your own wallet instead\n\n`;
        
        message += `🚨 **Important:**\n`;
        message += `• Your old wallet address still exists on the blockchain\n`;
        message += `• Any funds in the old wallet are still there\n`;
        message += `• You can still send tokens from it using /sendtokens\n`;
        message += `• Creating a fresh wallet gives you a new address\n\n`;
        
        message += `🔄 **Quick Action:** Reply with "REGENERATE" to create a fresh wallet`;
        
        // Set session flag for regeneration
        ctx.session = ctx.session || {};
        ctx.session.awaitingWalletRegeneration = true;
        ctx.session.awaitingRegenerationChain = chain;
        
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        return;
      }
      
      // Normal export flow (decryption successful)
      let message = `🔐 **${chain.toUpperCase()} WALLET EXPORT**\n\n`;
      message += `📍 **Address:**\n\`${exportResult.address}\`\n\n`;
      message += `🔑 **Private Key:**\n\`${exportResult.privateKey}\`\n\n`;
      
      if (exportResult.mnemonic && exportResult.mnemonic !== 'Failed to decrypt mnemonic') {
        message += `📝 **Seed Phrase:**\n\`${exportResult.mnemonic}\`\n\n`;
      }
      
      message += `✅ **Export Successful**\n`;
      message += `📅 **Created:** ${new Date(exportResult.createdAt).toLocaleString()}\n\n`;
      
      message += `🚨 **CRITICAL SECURITY WARNINGS:**\n`;
      message += `• ${exportResult.warning}\n`;
      message += `• Your private key gives FULL ACCESS to your wallet\n`;
      message += `• Never share this information publicly\n`;
      message += `• Store in a secure password manager\n`;
      message += `• Consider this message compromised after viewing\n\n`;
      
      message += `🛡️ **Wallet Import Instructions:**\n`;
      if (chain === 'solana') {
        message += `• **Phantom:** Settings > Import Private Key\n`;
        message += `• **Solflare:** Add Wallet > Import Private Key\n`;
        message += `• **Backpack:** Import Wallet > Private Key\n`;
      } else {
        message += `• **MetaMask:** Import Account > Private Key\n`;
        message += `• **Trust Wallet:** Settings > Wallets > Import\n`;
        message += `• **WalletConnect:** Use private key option\n`;
      }
      
      message += `\n⚡ **Quick Actions:**\n`;
      message += `• Copy address/key by tapping on the code blocks\n`;
      message += `• Use /wallet to return to wallet overview\n`;
      message += `• Use /sendtokens if you prefer direct transfers\n`;
      message += `• Use /support if you need assistance`;
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
      // Log the export for admin monitoring
      console.log(`🔐 Wallet exported for user ${userId}, chain: ${chain}, address: ${exportResult.address}`);
      
      // Send follow-up security reminder
      setTimeout(async () => {
        try {
          await ctx.reply(
            '🔥 **SECURITY REMINDER:** Please delete the wallet export message above after saving your private key securely.',
            { parse_mode: 'Markdown' }
          );
        } catch (err) {
          console.warn('Failed to send security reminder:', err.message);
        }
      }, 5000);
      
    } catch (decryptionError) {
      // Handle any other decryption errors
      console.error('Export wallet decryption error:', decryptionError);
      
      const failureInfo = await walletService.handleDecryptionFailure(userId, chain);
      
      let errorMessage = `🔧 **Wallet Access Issue**\n\n`;
      errorMessage += `❌ **Problem:** Cannot access your wallet private key\n`;
      errorMessage += `🔧 **Cause:** Encryption key changed or wallet corruption\n\n`;
      
      errorMessage += `💡 **Solutions:**\n`;
      errorMessage += `1️⃣ **Create Fresh Wallet:** Use \`/regeneratewallet\` (RECOMMENDED)\n`;
      errorMessage += `2️⃣ **Transfer Funds:** Use \`/sendtokens <address> <amount>\`\n`;
      errorMessage += `3️⃣ **Contact Support:** Use /support for assistance\n\n`;
      
      errorMessage += `⚠️ **Your Options:**\n`;
      errorMessage += `• Your wallet address and funds are safe on the blockchain\n`;
      errorMessage += `• You can still send tokens using /sendtokens\n`;
      errorMessage += `• A fresh wallet gives you full access again\n\n`;
      
      errorMessage += `🔄 **Quick Action:** Reply "REGENERATE" to create a fresh wallet`;
      
      // Set session flag for regeneration
      ctx.session = ctx.session || {};
      ctx.session.awaitingWalletRegeneration = true;
      ctx.session.awaitingRegenerationChain = chain;
      
      await ctx.editMessageText(errorMessage, { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    console.error('Export wallet command error:', error);
    await ctx.reply('❌ Error with wallet export. Please try /wallet or contact /support');
  }
});

// Enhanced balance check command
walletHandler.command('balance', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[userSettings.chain]) {
      return ctx.reply('❌ No wallet found. Please create one first with /wallet');
    }
    
    const chain = userSettings.chain;
    const walletAddress = userSettings.custodialWallets[chain].address;
    
    const loadingMsg = await ctx.reply('🔄 Checking balance...');
    
    try {
      // Get fresh balance from blockchain
      const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
      
      let message = `💰 **${chain.toUpperCase()} Balance**\n\n`;
      message += `📍 **Wallet:** \`${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 8)}\`\n\n`;
      message += `💎 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
      message += `💵 **USD Value:** $${balanceInfo.usdValue}\n`;
      
      if (balanceInfo.tokenPrice) {
        message += `📈 **${balanceInfo.symbol} Price:** $${balanceInfo.tokenPrice.toFixed(2)}\n`;
      }
      
      message += `\n🕒 **Last Updated:** ${new Date(balanceInfo.lastUpdated).toLocaleString()}\n`;
      
      if (balanceInfo.error) {
        message += `\n⚠️ **Note:** ${balanceInfo.error}`;
      }
      
      // Add action buttons
      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔄 Refresh', callback_data: `balance_refresh_${chain}` },
            { text: '💸 Buy Tokens', callback_data: 'start_buy' }
          ],
          [
            { text: '📊 Portfolio', callback_data: 'view_positions' },
            { text: '⚙️ Wallet Settings', callback_data: 'wallet_settings' }
          ]
        ]
      };
      
      await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      await ctx.editMessageText('❌ Error checking balance. Please try again.');
    }
    
  } catch (error) {
    console.error('Balance check error:', error);
    await ctx.reply('❌ Error checking balance. Please try again.');
  }
});

// Handle callback queries for wallet actions
walletHandler.action(/^(balance|exportwallet|settings|refresh|wallet_refresh|balance_refresh)_?(.*)$/, async (ctx) => {
  try {
    const action = ctx.match[1];
    const chain = ctx.match[2] || null;
    const userId = ctx.from.id;
    
    await userService.updateLastActive(userId);
    
    switch (action) {
      case 'balance':
      case 'balance_refresh':
        return handleBalanceRefresh(ctx, userId, chain);
        
      case 'exportwallet':
        return handleExportWallet(ctx, userId, chain);
        
      case 'settings':
        return handleWalletSettings(ctx, userId, chain);
        
      case 'refresh':
      case 'wallet_refresh':
        return handleWalletRefresh(ctx, userId, chain);
        
      default:
        await ctx.answerCbQuery('❌ Unknown action');
        return ctx.reply('❌ Unknown wallet action. Please try again.');
    }
    
  } catch (error) {
    console.error('Wallet callback error:', error);
    await ctx.answerCbQuery('❌ Error processing request');
    return ctx.reply('❌ An error occurred. Please try again.');
  }
});

// Helper function for balance refresh
async function handleBalanceRefresh(ctx, userId, chain) {
  try {
    await ctx.answerCbQuery('🔄 Refreshing balance...');
    
    const userSettings = await userService.getUserSettings(userId);
    const targetChain = chain || userSettings.chain;
    
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[targetChain]) {
      return ctx.editMessageText('❌ No wallet found for this chain.');
    }
    
    const walletAddress = userSettings.custodialWallets[targetChain].address;
    const balanceInfo = await walletService.getWalletBalance(walletAddress, targetChain);
    
    let message = `💰 **${targetChain.toUpperCase()} Balance**\n\n`;
    message += `📍 **Address:** \`${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 8)}\`\n\n`;
    message += `💵 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
    message += `💲 **USD Value:** $${balanceInfo.usdValue}\n`;
    
    if (balanceInfo.tokenPrice) {
      message += `📊 **Price:** $${balanceInfo.tokenPrice.toFixed(2)}\n`;
    }
    
    message += `\n🕒 **Updated:** ${new Date().toLocaleString()}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh Again', callback_data: `balance_refresh_${targetChain}` },
          { text: '💸 Start Trading', callback_data: 'start_trading' }
        ]
      ]
    };
    
    return ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Refresh failed');
    return ctx.editMessageText('❌ Failed to refresh balance. Please try again.');
  }
}

// Helper function for wallet refresh
async function handleWalletRefresh(ctx, userId, chain) {
  try {
    await ctx.answerCbQuery('🔄 Refreshing wallet...');
    
    const userSettings = await userService.getUserSettings(userId);
    const targetChain = chain || userSettings.chain;
    
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[targetChain]) {
      return ctx.editMessageText('❌ No wallet found for this chain.');
    }
    
    const walletAddress = userSettings.custodialWallets[targetChain].address;
    
    // Clear cache and get fresh data
    walletService.clearCache('balance', `balance_${targetChain}_${walletAddress}`);
    const balanceInfo = await walletService.getWalletBalance(walletAddress, targetChain);
    
    let message = `🔄 **Wallet Refreshed Successfully**\n\n`;
    message += `📍 **Address:** \`${walletAddress}\`\n`;
    message += `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
    message += `💲 **USD Value:** $${balanceInfo.usdValue}\n`;
    message += `🕒 **Updated:** ${new Date().toLocaleString()}`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '💰 Check Balance', callback_data: `balance_${targetChain}` },
          { text: '🔄 Refresh Again', callback_data: `wallet_refresh_${targetChain}` }
        ],
        [
          { text: '⚙️ Settings', callback_data: `settings_${targetChain}` },
          { text: '💸 Start Trading', callback_data: 'start_trading' }
        ]
      ]
    };
    
    return ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Refresh failed');
    return ctx.editMessageText('❌ Failed to refresh wallet. Please try again.');
  }
}

// Handle start trading callback
walletHandler.action('start_trading', async (ctx) => {
  try {
    await ctx.answerCbQuery('💸 Starting trading interface...');
    
    const message = `💸 **Trading Interface**\n\n` +
                   `🎯 **Quick Commands:**\n` +
                   `• \`/buy <amount> <token>\` - Buy tokens\n` +
                   `• \`/sell <token>\` - Sell positions\n` +
                   `• \`/positions\` - View your holdings\n` +
                   `• \`/balance\` - Check wallet balance\n\n` +
                   `📊 **Advanced Trading:**\n` +
                   `• \`/quickbuy\` - Quick buy interface\n` +
                   `• \`/slippage\` - Set slippage tolerance\n` +
                   `• \`/analyze <token>\` - Token analysis\n\n` +
                   `💡 **Example:** \`/buy 0.1 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\``;
    
    return ctx.editMessageText(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error starting trading');
    return ctx.reply('❌ Error starting trading interface. Please try again.');
  }
});

// Handle view positions callback
walletHandler.action('view_positions', async (ctx) => {
  try {
    await ctx.answerCbQuery('📊 Loading positions...');
    
    const userId = ctx.from.id;
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.positions || Object.keys(userSettings.positions).length === 0) {
      return ctx.editMessageText('📊 **Your Portfolio**\n\nNo positions found. Start trading to build your portfolio!\n\n💡 Use `/buy <amount> <token>` to start trading.');
    }
    
    let message = '📊 **Your Portfolio**\n\n';
    let totalValue = 0;
    
    for (const [tokenAddress, position] of Object.entries(userSettings.positions)) {
      const tokenSymbol = position.tokenSymbol || 'Unknown';
      const currentValue = position.totalAmount * (position.currentPrice || position.avgPrice);
      const pnl = currentValue - (position.totalAmount * position.avgPrice);
      const pnlPercent = ((currentValue - (position.totalAmount * position.avgPrice)) / (position.totalAmount * position.avgPrice)) * 100;
      
      const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
      
      message += `${pnlEmoji} **${tokenSymbol}**\n`;
      message += `   Amount: ${position.totalAmount.toFixed(4)}\n`;
      message += `   Value: $${currentValue.toFixed(2)}\n`;
      message += `   PnL: ${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%\n\n`;
      
      totalValue += currentValue;
    }
    
    message += `💰 **Total Portfolio Value:** $${totalValue.toFixed(2)}\n\n`;
    message += `💡 Use \`/sell <token>\` to manage positions`;
    
    return ctx.editMessageText(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error loading positions');
    return ctx.editMessageText('❌ Error loading positions. Please try again.');
  }
});

module.exports = walletHandler;