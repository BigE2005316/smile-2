const { Composer } = require('telegraf');
const userService = require('../../users/userService');
const { advancedTradingService } = require('../../services/advancedTrading');
const { saveSupportInfo } = require('./support');
const { getEngine } = require('../../services/copyTradingEngine');
const { getManualTradingService } = require('../../services/manualTrading');
const walletService = require('../../services/walletService');
const tokenDataService = require('../../services/tokenDataService');

const messageHandler = new Composer();

// Basic wallet validation
function isValidWallet(address) {
  // Solana wallet (base58, typically 32-44 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return true;
  
  // Ethereum/BSC wallet (hex, 42 chars starting with 0x)
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;
  
  return false;
}

// Centralized message handler to prevent conflicts
async function handleTextMessage(ctx, next) {
  const session = ctx.session || {};
  const userId = String(ctx.from.id);
  const input = ctx.message.text.trim();
  
  // Check if it's a command - if so, let command handlers handle it
  if (input.startsWith('/')) {
    return next();
  }

  try {
    // Handle trade confirmation (YES/NO)
    if (session.awaitingTradeConfirmation && session.pendingTradeId) {
      const response = input.toLowerCase();
      const service = getManualTradingService();
      
      if (!service) {
        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.pendingTradeId = null;
        return ctx.reply('❌ Trading service not available. Please try again.');
      }
      
      // Check if service is initialized
      if (!service.isInitialized()) {
        // Try to force initialize
        await service.forceInitialize();
        if (!service.isInitialized()) {
          ctx.session.awaitingTradeConfirmation = false;
          ctx.session.pendingTradeId = null;
          return ctx.reply('❌ Trading service not initialized. Please try again.');
        }
      }
      
      if (response === 'yes' || response === 'y' || input.toUpperCase() === 'YES') {
        try {
          const loadingMsg = await ctx.reply('🔄 Executing trade on blockchain...');
          
          const result = await service.executeConfirmedTrade(session.pendingTradeId, userId);
          ctx.session.awaitingTradeConfirmation = false;
          ctx.session.pendingTradeId = null;
          
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              loadingMsg.message_id,
              undefined,
              result.message,
              { parse_mode: 'Markdown', disable_web_page_preview: true }
            );
          } catch (editError) {
            // If edit fails, send as new message
            await ctx.reply(result.message, { parse_mode: 'Markdown', disable_web_page_preview: true });
          }
          
          return;
        } catch (error) {
          ctx.session.awaitingTradeConfirmation = false;
          ctx.session.pendingTradeId = null;
          console.error('Trade execution error:', error);
          return ctx.reply('❌ Failed to execute trade. Please try again.');
        }
      } else if (response === 'no' || response === 'n' || input.toUpperCase() === 'NO') {
        const result = service.cancelPendingTrade(session.pendingTradeId);
        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.pendingTradeId = null;
        return ctx.reply(result.message || '❌ Trade cancelled.');
      } else {
        return ctx.reply('⚠️ Please reply YES to confirm or NO to cancel');
      }
    }
    
    // Handle quick buy flow
    if (session.awaitingQuickBuy) {
      const amount = parseFloat(input);
      
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Invalid amount. Please enter a valid number or /cancel to exit.');
      }
      
      ctx.session.quickBuyAmount = amount;
      ctx.session.awaitingQuickBuy = false;
      ctx.session.awaitingQuickBuyToken = true;
      
      return ctx.reply(`💰 Amount set to ${amount}\n\n📍 Now paste the token contract address:`);
    }
    
    // Handle quick buy token address
    if (session.awaitingQuickBuyToken && session.quickBuyAmount) {
      const service = getManualTradingService();
      
      if (!service) {
        ctx.session.awaitingQuickBuyToken = false;
        ctx.session.quickBuyAmount = null;
        return ctx.reply('❌ Trading service not available. Please try again.');
      }
      
      // Check if service is initialized
      if (!service.isInitialized()) {
        // Try to force initialize
        await service.forceInitialize();
        if (!service.isInitialized()) {
          ctx.session.awaitingQuickBuyToken = false;
          ctx.session.quickBuyAmount = null;
          return ctx.reply('❌ Trading service not initialized. Please try again.');
        }
      }
      
      const loadingMsg = await ctx.reply('🔍 Analyzing token and preparing trade...');
      
      try {
        const result = await service.processBuyCommand(userId, `${session.quickBuyAmount} ${input}`);
        
        if (result.needsConfirmation) {
          ctx.session.pendingTradeId = result.tradeId;
          ctx.session.awaitingTradeConfirmation = true;
          ctx.session.awaitingQuickBuyToken = false;
          ctx.session.quickBuyAmount = null;
        } else {
          ctx.session.awaitingQuickBuyToken = false;
          ctx.session.quickBuyAmount = null;
        }
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          result.message,
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        ctx.session.awaitingQuickBuyToken = false;
        ctx.session.quickBuyAmount = null;
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          `❌ Error preparing trade: ${error.message}`
        );
      }
      
      return;
    }

    // Handle wallet naming - step 1: select wallet
    if (session.awaitingWalletName && !session.walletToName) {
      const walletIndex = parseInt(input) - 1;
      const userData = await userService.getUserSettings(userId);
      
      if (isNaN(walletIndex) || walletIndex < 0 || walletIndex >= userData.wallets.length) {
        return ctx.reply('❌ Invalid selection. Please enter a valid number or type /cancel to exit.');
      }
      
      ctx.session.walletToName = userData.wallets[walletIndex];
      return ctx.reply('📝 Enter a name for this wallet (max 30 characters):');
    }
    
    // Handle wallet naming - step 2: enter name
    if (session.awaitingWalletName && session.walletToName) {
      if (input.length > 30) {
        return ctx.reply('❌ Name too long. Please enter a name with 30 characters or less:');
      }
      
      const engine = getEngine();
      if (engine) {
        await engine.setWalletName(userId, session.walletToName, input);
        ctx.session.awaitingWalletName = false;
        ctx.session.walletToName = null;
        
        return ctx.reply(`✅ Wallet named successfully!\n\n**Name:** ${input}\n**Wallet:** \`${session.walletToName.substring(0, 6)}...${session.walletToName.substring(session.walletToName.length - 4)}\``, 
          { parse_mode: 'Markdown' });
      }
    }
    
    // Handle begin wallet
    if (session.awaitingBeginWallet) {
      const walletIndex = parseInt(input) - 1;
      
      if (isNaN(walletIndex) || !session.userWallets || 
          walletIndex < 0 || walletIndex >= session.userWallets.length) {
        return ctx.reply('❌ Invalid selection. Please enter a valid number or type /cancel to exit.');
      }
      
      const wallet = session.userWallets[walletIndex];
      const engine = getEngine();
      
      if (engine) {
        await engine.setWalletTradingStatus(userId, wallet, 'active');
        ctx.session.awaitingBeginWallet = false;
        ctx.session.userWallets = null;
        
        const displayName = engine.getWalletDisplayName(userId, wallet);
        return ctx.reply(`✅ Trading started for wallet **${displayName}**\n\nThe bot will now copy all trades from this wallet.`, 
          { parse_mode: 'Markdown' });
      }
    }
    
    // Handle pause wallet
    if (session.awaitingPauseWallet) {
      const walletIndex = parseInt(input) - 1;
      
      if (isNaN(walletIndex) || !session.userWallets || 
          walletIndex < 0 || walletIndex >= session.userWallets.length) {
        return ctx.reply('❌ Invalid selection. Please enter a valid number or type /cancel to exit.');
      }
      
      const wallet = session.userWallets[walletIndex];
      const engine = getEngine();
      
      if (engine) {
        await engine.setWalletTradingStatus(userId, wallet, 'pause');
        ctx.session.awaitingPauseWallet = false;
        ctx.session.userWallets = null;
        
        const displayName = engine.getWalletDisplayName(userId, wallet);
        return ctx.reply(`⏸️ Trading paused for wallet **${displayName}**\n\nNo trades will be copied until you resume with /begin.`, 
          { parse_mode: 'Markdown' });
      }
    }
    
    // Handle stop wallet
    if (session.awaitingStopWallet) {
      const walletIndex = parseInt(input) - 1;
      
      if (isNaN(walletIndex) || !session.userWallets || 
          walletIndex < 0 || walletIndex >= session.userWallets.length) {
        return ctx.reply('❌ Invalid selection. Please enter a valid number or type /cancel to exit.');
      }
      
      const wallet = session.userWallets[walletIndex];
      const engine = getEngine();
      
      if (engine) {
        await engine.setWalletTradingStatus(userId, wallet, 'stopped');
        ctx.session.awaitingStopWallet = false;
        ctx.session.userWallets = null;
        
        const displayName = engine.getWalletDisplayName(userId, wallet);
        return ctx.reply(`🛑 Trading stopped for wallet **${displayName}**\n\nThis wallet will not copy any trades. Use /begin to restart.`, 
          { parse_mode: 'Markdown' });
      }
    }

    // Handle wallet addition
    if (session.awaitingWallet) {
      if (!isValidWallet(input)) {
        return ctx.reply('❌ Invalid wallet address format. Please enter a valid Solana or Ethereum/BSC wallet address or type /cancel to exit.');
      }
      
      await userService.addWallet(userId, input);
      ctx.session.awaitingWallet = false;
      
      // Ask if they want to name this wallet
      ctx.session.justAddedWallet = input;
      ctx.session.awaitingWalletNameOption = true;
      
      return ctx.reply(`✅ Wallet has been added successfully!\n\n📝 Would you like to give this wallet a custom name?\n\nReply "yes" to name it or "no" to skip.`);
    }
    
    // Handle wallet name option
    if (session.awaitingWalletNameOption && session.justAddedWallet) {
      const response = input.toLowerCase();
      
      if (response === 'yes') {
        ctx.session.awaitingWalletNameOption = false;
        ctx.session.walletToName = session.justAddedWallet;
        ctx.session.awaitingWalletName = true;
        return ctx.reply('📝 Enter a name for this wallet (max 30 characters):');
      } else {
        ctx.session.awaitingWalletNameOption = false;
        ctx.session.justAddedWallet = null;
        return ctx.reply(`✅ Wallet added without custom name.\n\nUse /walletstatus to view all your wallets.`);
      }
    }

    // Handle chain selection
    if (session.awaitingChain) {
      const validChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
      const chain = input.toLowerCase();
      
      if (!validChains.includes(chain)) {
        return ctx.reply(`❌ Invalid chain. Please enter one of: ${validChains.join(', ')} or type /cancel to exit.`);
      }
      
      await userService.setChain(userId, chain);
      ctx.session.awaitingChain = false;
      
      // Check if user has a wallet for this chain
      const userData = await userService.getUserSettings(userId);
      const hasWallet = userData.custodialWallets && userData.custodialWallets[chain];
      
      if (hasWallet) {
        return ctx.reply(`✅ Blockchain has been set to ${chain.toUpperCase()}\n\n💼 You already have a ${chain.toUpperCase()} wallet. Use /wallet to view it.`);
      } else {
        return ctx.reply(`✅ Blockchain has been set to ${chain.toUpperCase()}\n\n⚠️ You don't have a ${chain.toUpperCase()} wallet yet. Use /wallet to create one.`);
      }
    }

    // Handle amount setting
    if (session.awaitingAmount) {
      const amount = parseFloat(input);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Invalid amount. Please enter a number greater than 0 or type /cancel to exit.');
      }
      
      await userService.setAmount(userId, amount);
      ctx.session.awaitingAmount = false;
      return ctx.reply(`✅ Trade amount has been set successfully.\n💰 Amount per trade: ${amount} tokens`);
    }

    // Handle sell targets
    if (session.awaitingSellTargets) {
      if (!input.includes('x') && !input.includes('%')) {
        return ctx.reply('❌ Invalid format. Please use multipliers like "2x,5x,10x" or percentages like "200%,500%,1000%" or type /cancel to exit.');
      }
      
      const targets = input.split(',').map(t => t.trim().toLowerCase());
      await userService.setSellTargets(userId, targets);
      ctx.session.awaitingSellTargets = false;
      return ctx.reply(`✅ Profit targets have been set successfully.\n📈 Auto-sell targets: ${targets.join(', ')}`);
    }

    // Handle daily limit
    if (session.awaitingDailyLimit) {
      const limit = parseFloat(input);
      if (isNaN(limit) || limit <= 0) {
        return ctx.reply('❌ Invalid limit. Please enter a number greater than 0 or type /cancel to exit.');
      }
      
      await userService.setDailyLimit(userId, limit);
      ctx.session.awaitingDailyLimit = false;
      return ctx.reply(`✅ Daily spending limit has been set successfully.\n🛡️ Daily limit: ${limit} tokens`);
    }

    // Handle stop-loss
    if (session.awaitingStopLoss) {
      const lowerInput = input.toLowerCase();
      if (lowerInput !== 'enable' && lowerInput !== 'disable') {
        return ctx.reply('❌ Invalid option. Please send "enable" or "disable" or type /cancel to exit.');
      }
      
      const enabled = lowerInput === 'enable';
      await userService.setStopLoss(userId, enabled);
      ctx.session.awaitingStopLoss = false;
      
      const status = enabled ? 'enabled' : 'disabled';
      const emoji = enabled ? '✅' : '❌';
      return ctx.reply(`${emoji} Stop-loss protection has been ${status} successfully.\n🛑 Status: ${status.toUpperCase()}`);
    }

    // Handle wallet removal
    if (session.awaitingRemoveWallet) {
      const walletIndex = parseInt(input) - 1;
      
      if (isNaN(walletIndex) || !session.userWallets || 
          walletIndex < 0 || walletIndex >= session.userWallets.length) {
        return ctx.reply('❌ Invalid selection. Please enter a valid number or type /cancel to exit.');
      }
      
      const walletToRemove = session.userWallets[walletIndex];
      await userService.removeWallet(userId, walletToRemove);
      ctx.session.awaitingRemoveWallet = false;
      ctx.session.userWallets = null;
      
      return ctx.reply(`✅ Wallet has been removed successfully.\n🗑️ Removed: ${walletToRemove.substring(0, 8)}...${walletToRemove.substring(walletToRemove.length - 8)}`);
    }

    // Handle trailing stop loss
    if (session.awaitingTrailingStop) {
      const percentage = parseFloat(input);
      if (isNaN(percentage) || percentage <= 0 || percentage >= 100) {
        return ctx.reply('❌ Invalid percentage. Please enter a number between 1 and 99 (e.g., 15 for 15%) or type /cancel to exit.');
      }
      
      await userService.setStopLossPercent(userId, percentage);
      ctx.session.awaitingTrailingStop = false;
      return ctx.reply(`✅ Trailing stop loss has been set successfully.\n🎯 Stop loss will trail ${percentage}% below the highest price.`);
    }

    // Handle copy sells setting
    if (session.awaitingCopySells) {
      const lowerInput = input.toLowerCase();
      if (lowerInput !== 'enable' && lowerInput !== 'disable') {
        return ctx.reply('❌ Invalid option. Please send "enable" or "disable" or type /cancel to exit.');
      }
      
      const enabled = lowerInput === 'enable';
      await userService.setCopySells(userId, enabled);
      ctx.session.awaitingCopySells = false;
      
      const status = enabled ? 'enabled' : 'disabled';
      const emoji = enabled ? '✅' : '❌';
      return ctx.reply(`${emoji} Copy sells has been ${status} successfully.\n🔄 When tracked wallets sell, you will ${enabled ? 'automatically sell proportionally' : 'NOT automatically sell'}.`);
    }

    // Handle custom TP/SL setting
    if (session.awaitingCustomTPSL) {
      const lowerInput = input.toLowerCase();
      if (lowerInput !== 'enable' && lowerInput !== 'disable') {
        return ctx.reply('❌ Invalid option. Please send "enable" or "disable" or type /cancel to exit.');
      }
      
      const enabled = lowerInput === 'enable';
      await userService.setCustomTPSL(userId, enabled);
      ctx.session.awaitingCustomTPSL = false;
      
      const status = enabled ? 'enabled' : 'disabled';
      const emoji = enabled ? '✅' : '❌';
      return ctx.reply(`${emoji} Custom TP/SL has been ${status} successfully.\n🎯 ${enabled ? 'Bot will use your custom levels instead of copying sells' : 'Bot will copy sells from tracked wallets'}.`);
    }

    // Handle TP levels setting
    if (session.awaitingTPLevels) {
      const tpLevels = [];
      const parts = input.split(',');
      
      for (const part of parts) {
        const trimmed = part.trim();
        
        // Check if it's in format "percent:amount"
        if (trimmed.includes(':')) {
          const [percent, amount] = trimmed.split(':').map(p => parseFloat(p.trim()));
          if (isNaN(percent) || isNaN(amount) || percent <= 0 || amount <= 0 || amount > 100) {
            return ctx.reply('❌ Invalid format. Each level should be "percentage:amount" where amount is 1-100.\nExample: 50:25,100:50,200:25\nOr type /cancel to exit.');
          }
          tpLevels.push({ percent, amount });
        } else {
          // Simple percentage
          const percent = parseFloat(trimmed);
          if (isNaN(percent) || percent <= 0) {
            return ctx.reply('❌ Invalid percentage. All values must be positive numbers.\nExample: 50,100,200,500\nOr type /cancel to exit.');
          }
          tpLevels.push(percent);
        }
      }
      
      // Validate total sell amounts if using partial selling
      if (tpLevels.some(tp => typeof tp === 'object')) {
        const totalAmount = tpLevels
          .filter(tp => typeof tp === 'object')
          .reduce((sum, tp) => sum + tp.amount, 0);
        
        if (totalAmount > 100) {
          return ctx.reply('❌ Total sell amounts exceed 100%. Please adjust your levels so the total is 100% or less.');
        }
      }
      
      await userService.setTakeProfit(userId, tpLevels);
      ctx.session.awaitingTPLevels = false;
      
      const displayLevels = tpLevels.map(tp => {
        if (typeof tp === 'object') {
          return `${tp.percent}% (sell ${tp.amount}%)`;
        }
        return `${tp}%`;
      }).join(', ');
      
      return ctx.reply(`✅ Take profit levels have been set successfully.\n📈 TP levels: ${displayLevels}\n\n💡 Don't forget to enable Custom TP/SL with /customtpsl to use these levels.`);
    }

    // Handle switch wallet chain
    if (session.awaitingSwitchChain) {
      const validChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
      const chain = input.toLowerCase();
      
      if (!validChains.includes(chain)) {
        return ctx.reply(`❌ Invalid chain. Please enter one of: ${validChains.join(', ')} or type /cancel to exit.`);
      }
      
      // Update user's preferred chain
      await userService.setChain(userId, chain);
      ctx.session.awaitingSwitchChain = false;
      
      // Show wallet for new chain
      const wallet = await walletService.getOrCreateWallet(userId, chain);
      
      const message = `✅ Switched to ${chain.toUpperCase()}

💼 **Your ${chain.toUpperCase()} Wallet:**
\`${wallet.address}\`

Use /wallet to see full details or /balance to check funds.`;
      
      return ctx.reply(message, { parse_mode: 'Markdown' });
    }

    // Handle wallet regeneration confirmation
    if (session.awaitingWalletRegeneration && session.awaitingRegenerationChain) {
      const lowerInput = input.toLowerCase();
      if (lowerInput === 'regenerate') {
        const chain = session.awaitingRegenerationChain;
        ctx.session.awaitingWalletRegeneration = false;
        ctx.session.awaitingRegenerationChain = null;
        
        const loadingMsg = await ctx.reply('🔄 Creating fresh wallet...');
        
        try {
          const result = await walletService.regenerateWallet(userId, chain);
          
          if (!result.success) {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              loadingMsg.message_id,
              undefined,
              '❌ Failed to create fresh wallet. Please try again.'
            );
            return;
          }
          
          let message = `✅ **Fresh ${chain.toUpperCase()} Wallet Created!**\n\n`;
          message += `📍 **New Address:**\n\`${result.address}\`\n\n`;
          
          if (result.mnemonic) {
            message += `📝 **Seed Phrase:**\n\`${result.mnemonic}\`\n\n`;
          }
          
          message += `🎉 **Success!**\n`;
          message += `• Fresh wallet with full encryption\n`;
          message += `• Private key accessible via /exportwallet\n`;
          message += `• Ready for trading and transfers\n\n`;
          
          message += `💡 **Next Steps:**\n`;
          message += `• Send funds to your new address above\n`;
          message += `• Use /balance to check your balance\n`;
          message += `• Use /buy to start trading\n\n`;
          
          message += `🔒 **Important:**\n`;
          message += `• This is a completely new wallet\n`;
          message += `• Your old wallet address still exists\n`;
          message += `• Transfer funds from old to new if needed`;
          
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            undefined,
            message,
            { parse_mode: 'Markdown' }
          );
          
        } catch (error) {
          console.error('Wallet regeneration error:', error);
          
          await ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            undefined,
            '❌ Failed to create fresh wallet. Please try again.'
          );
        }
        
        return;
      }
    }

    // Handle support links setting (admin only)
    if (session.awaitingSupportLinks) {
      const adminId = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_ID;
      if (String(userId) !== String(adminId)) {
        ctx.session.awaitingSupportLinks = false;
        return;
      }
      
      if (input.toLowerCase() === 'skip') {
        ctx.session.awaitingSupportLinks = false;
        return ctx.reply('✅ Support links unchanged.');
      }
      
      // Parse support info
      const supportInfo = {};
      const lines = input.split('\n');
      
      for (const line of lines) {
        const [key, value] = line.split(':').map(s => s.trim());
        if (key && value) {
          supportInfo[key.toLowerCase()] = value;
        }
      }
      
      if (Object.keys(supportInfo).length > 0) {
        await saveSupportInfo(supportInfo);
        ctx.session.awaitingSupportLinks = false;
        
        return ctx.reply(`✅ Support links updated successfully!

${supportInfo.twitter ? `🐦 Twitter: ${supportInfo.twitter}` : ''}
${supportInfo.whatsapp ? `📱 WhatsApp: ${supportInfo.whatsapp}` : ''}
${supportInfo.telegram ? `💬 Telegram: ${supportInfo.telegram}` : ''}
${supportInfo.email ? `📧 Email: ${supportInfo.email}` : ''}

Users can now access these via /support`);
      } else {
        return ctx.reply('❌ Invalid format. Please follow the example format or send "skip".');
      }
    }

    // If no session is waiting, pass to next handler
    return next();

  } catch (err) {
    console.error('❌ Error handling message:', err);
    return ctx.reply('❌ An error occurred. Please try again or type /cancel to exit.');
  }
}

module.exports = { handleTextMessage, messageHandler };