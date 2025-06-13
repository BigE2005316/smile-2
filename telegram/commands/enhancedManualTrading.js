// telegram/commands/enhancedManualTrading.js - Advanced Manual Trading Commands
const { Composer, Markup } = require('telegraf');
const { getManualTradingService } = require('../../services/manualTrading');
const { getEnhancedCopyService } = require('../../services/enhancedCopyTrading');
const userService = require('../../users/userService');
const tokenDataService = require('../../services/tokenDataService');

const enhancedManualTradingHandler = new Composer();

// Enhanced buy command with real execution
enhancedManualTradingHandler.command(['buy', 'buyeth', 'buybnb', 'buysol'], async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const command = ctx.message.text.toLowerCase();
    const args = ctx.message.text.split(' ').slice(1);
    
    // Get user settings
    const userSettings = await userService.getUserSettings(userId);
    if (!userSettings) {
      return ctx.reply('❌ Please set up your account first with /start');
    }
    
    // Determine chain from command
    let chain = userSettings.chain;
    if (command.includes('eth')) chain = 'ethereum';
    else if (command.includes('bnb')) chain = 'bsc';
    else if (command.includes('sol')) chain = 'solana';
    
    if (!chain) {
      return ctx.reply('⚠️ Please set your chain first. Use /setchain command.');
    }
    
    // Show usage if no arguments
    if (args.length === 0) {
      return ctx.reply(`📝 **Enhanced Buy Command Usage:**

**Quick Buy:**
• \`/buy <token_address>\` - Buy with default amount
• \`/buy <amount> <token_address>\` - Buy specific amount

**Chain-Specific:**
• \`/buyeth <amount> <token>\` - Buy with ETH
• \`/buybnb <amount> <token>\` - Buy with BNB  
• \`/buysol <amount> <token>\` - Buy with SOL

**Advanced Features:**
• \`/buy max <token>\` - Buy with maximum available balance
• \`/buy <amount> <token> <slippage>\` - Custom slippage

**Examples:**
• \`/buy So11111111111111111111111111111111111111112\`
• \`/buy 0.1 BONK\`
• \`/buysol 0.5 So11111111111111111111111111111111111111112 10\`

✅ **Real blockchain execution enabled**
🎯 **Trade simulation & confirmation dialogs**
⚡ **Professional error handling**`, { parse_mode: 'Markdown' });
    }
    
    // Parse arguments
    let amount, tokenAddress, slippage;
    
    if (args.length === 1) {
      // Just token address
      if (args[0].toLowerCase() === 'max') {
        return ctx.reply('❌ Please specify token address for max buy: `/buy max <token_address>`', { parse_mode: 'Markdown' });
      }
      tokenAddress = args[0];
      amount = userSettings.amount || 0.1;
    } else if (args.length === 2) {
      if (args[0].toLowerCase() === 'max') {
        // Max buy
        tokenAddress = args[1];
        
        // Get wallet balance for max calculation
        if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
          return ctx.reply('❌ No wallet found. Please create one with /wallet');
        }
        
        const walletService = require('../../services/walletService');
        const balanceInfo = await walletService.getWalletBalance(userSettings.custodialWallets[chain].address, chain);
        const availableBalance = parseFloat(balanceInfo.balance);
        
        // Reserve some for gas fees
        const gasReserve = chain === 'solana' ? 0.01 : chain === 'ethereum' ? 0.01 : 0.001;
        amount = Math.max(0, availableBalance - gasReserve);
        
        if (amount <= 0) {
          return ctx.reply(`❌ Insufficient balance for max buy. Current balance: ${balanceInfo.balance} ${balanceInfo.symbol}`);
        }
      } else {
        // Amount and token
        amount = parseFloat(args[0]);
        tokenAddress = args[1];
        
        if (isNaN(amount) || amount <= 0) {
          return ctx.reply('❌ Invalid amount. Please enter a positive number.');
        }
      }
    } else if (args.length === 3) {
      // Amount, token, and slippage
      amount = parseFloat(args[0]);
      tokenAddress = args[1];
      slippage = parseFloat(args[2]);
      
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ Invalid amount. Please enter a positive number.');
      }
      
      if (isNaN(slippage) || slippage < 0 || slippage > 50) {
        return ctx.reply('❌ Invalid slippage. Please enter a value between 0 and 50.');
      }
    } else {
      return ctx.reply('❌ Invalid format. Use: `/buy [amount] <token_address> [slippage]`', { parse_mode: 'Markdown' });
    }
    
    // Validate token address
    if (!tokenAddress || tokenAddress.length < 10) {
      return ctx.reply('❌ Invalid token address provided.');
    }
    
    // Check if wallet exists
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[chain]) {
      return ctx.reply('⚠️ Please create a wallet first with /wallet');
    }
    
    await ctx.reply('🔍 Analyzing token and preparing trade...');
    
    try {
      // Get token information
      const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
      if (!tokenInfo) {
        return ctx.reply('❌ Failed to get token information. Please check the token address.');
      }
      
      // Get trading service
      const manualTradingService = getManualTradingService();
      if (!manualTradingService.isInitialized()) {
        return ctx.reply('❌ Trading service not available. Please try again.');
      }
      
      // Create trade confirmation
      const tradeParams = {
        tokenAddress: tokenInfo.address,
        amount,
        chain,
        slippage: slippage || userSettings.slippage || 5,
        tradeType: 'buy'
      };
      
      const confirmation = await manualTradingService.createTradeConfirmation(userId, tradeParams);
      
      if (!confirmation.success) {
        return ctx.reply(`❌ Failed to prepare trade: ${confirmation.message}`);
      }
      
      // Calculate fees (using new format)
      const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
      const devFee = amount * (devFeePercent / 100);
      const netAmount = amount - devFee;
      const feeCode = String(devFeePercent).padStart(4, '0');
      
      // Format confirmation message
      const chainEmoji = chain === 'solana' ? '🟣' : chain === 'ethereum' ? '🔷' : '🟡';
      const chainSymbol = chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB';
      
      let message = `🟢 **Confirm BUY Order** ${chainEmoji}\n\n`;
      message += `🎯 **${tokenInfo.name}** (${tokenInfo.symbol})\n`;
      message += `**Amount:** ${amount} ${chainSymbol}\n\n`;
      
      message += `📊 **Token Analysis:**\n`;
      message += `• **Price:** $${tokenInfo.price?.toFixed(8) || 'Unknown'}\n`;
      
      if (tokenInfo.marketCap) {
        message += `• **Market Cap:** $${tokenInfo.marketCap.toLocaleString()}\n`;
      }
      
      if (tokenInfo.priceChange24h !== undefined) {
        const changeEmoji = tokenInfo.priceChange24h >= 0 ? '📈' : '📉';
        message += `• **24h Change:** ${changeEmoji} ${tokenInfo.priceChange24h.toFixed(2)}%\n`;
      }
      
      if (tokenInfo.liquidity) {
        message += `• **Liquidity:** $${tokenInfo.liquidity.toLocaleString()}\n`;
      }
      
      message += `\n📍 **Contract:** \`${tokenInfo.address}\`\n\n`;
      
      message += `💰 **Order Summary:**\n`;
      message += `• **Total Cost:** ${amount} ${chainSymbol}\n`;
      message += `• **TX fee - ${feeCode}:** ${devFee.toFixed(6)}\n`;
      message += `• **Net Amount:** ${netAmount.toFixed(6)}\n`;
      message += `• **Slippage:** ${tradeParams.slippage}%\n\n`;
      
      if (tokenInfo.warnings && tokenInfo.warnings.length > 0) {
        message += `⚠️ **Warnings:**\n`;
        tokenInfo.warnings.forEach(warning => {
          message += `• ${warning}\n`;
        });
        message += `\n`;
      }
      
      message += `✅ **Ready for execution on ${chain.toUpperCase()} blockchain**\n`;
      message += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
      message += `⏰ Expires in 60 seconds`;
      
      // Store trade ID in session
      ctx.session = ctx.session || {};
      ctx.session.pendingTradeId = confirmation.tradeId;
      ctx.session.awaitingTradeConfirmation = true;
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Enhanced buy command error:', error);
      await ctx.reply('❌ Error preparing buy order. Please try again.');
    }
    
  } catch (error) {
    console.error('Enhanced buy command error:', error);
    await ctx.reply('❌ Error processing buy command. Please try again.');
  }
});

// Enhanced sell command with real execution
enhancedManualTradingHandler.command(['sell', 'sellall'], async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const command = ctx.message.text.toLowerCase();
    const args = ctx.message.text.split(' ').slice(1);
    
    // Get user settings
    const userSettings = await userService.getUserSettings(userId);
    if (!userSettings) {
      return ctx.reply('❌ Please set up your account first with /start');
    }
    
    const chain = userSettings.chain;
    if (!chain) {
      return ctx.reply('⚠️ Please set your chain first. Use /setchain command.');
    }
    
    // Get trading service
    const manualTradingService = getManualTradingService();
    if (!manualTradingService.isInitialized()) {
      return ctx.reply('❌ Trading service not available. Please try again.');
    }
    
    // Show positions if no arguments
    if (args.length === 0) {
      const positions = await manualTradingService.getUserPositions(userId);
      
      if (positions.length === 0) {
        return ctx.reply('❌ You have no positions to sell. Buy tokens first!');
      }
      
      let message = `📊 **Your Active Positions**\n\n`;
      
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
        
        message += `${i + 1}. ${pnlEmoji} **${position.tokenSymbol || 'Unknown'}**\n`;
        message += `   • **Amount:** ${position.amount?.toFixed(4) || 0}\n`;
        message += `   • **Avg Price:** $${position.avgBuyPrice?.toFixed(8) || 0}\n`;
        message += `   • **Current:** $${position.currentPrice?.toFixed(8) || 0}\n`;
        message += `   • **PnL:** ${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage?.toFixed(2) || 0}%\n`;
        message += `   • **Value:** $${position.currentValue?.toFixed(2) || 0}\n`;
        message += `   \`${position.tokenAddress}\`\n\n`;
      }
      
      message += `💡 **Sell Commands:**\n`;
      message += `• \`/sell <token_address>\` - Sell all (100%)\n`;
      message += `• \`/sell 50% <token_address>\` - Sell percentage\n`;
      message += `• \`/sellall\` - Sell all positions\n\n`;
      
      message += `**Examples:**\n`;
      message += `• \`/sell 25% ${positions[0]?.tokenAddress || 'TOKEN_ADDRESS'}\`\n`;
      message += `• \`/sell ${positions[0]?.tokenAddress || 'TOKEN_ADDRESS'}\``;
      
      return ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    // Handle sellall command
    if (command === 'sellall') {
      const positions = await manualTradingService.getUserPositions(userId);
      
      if (positions.length === 0) {
        return ctx.reply('❌ No positions to sell.');
      }
      
      let message = `🔴 **Confirm SELL ALL Positions**\n\n`;
      message += `You are about to sell ${positions.length} positions:\n\n`;
      
      let totalValue = 0;
      for (const position of positions) {
        message += `• **${position.tokenSymbol}:** ${position.amount?.toFixed(4)} tokens ($${position.currentValue?.toFixed(2) || 0})\n`;
        totalValue += position.currentValue || 0;
      }
      
      message += `\n💰 **Total Portfolio Value:** $${totalValue.toFixed(2)}\n\n`;
      message += `⚠️ **Reply YES to sell all positions or NO to cancel**\n`;
      message += `⏰ Expires in 60 seconds`;
      
      // Store sellall command in session
      ctx.session = ctx.session || {};
      ctx.session.sellAllPositions = true;
      ctx.session.awaitingTradeConfirmation = true;
      
      return ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    // Parse sell arguments
    let percentage = 100;
    let tokenAddress;
    
    if (args.length === 1) {
      if (args[0].includes('%')) {
        return ctx.reply('❌ Please specify both percentage and token address.\nExample: `/sell 50% <token_address>`', { parse_mode: 'Markdown' });
      } else {
        tokenAddress = args[0];
      }
    } else if (args.length === 2) {
      percentage = parseFloat(args[0].replace('%', ''));
      tokenAddress = args[1];
      
      if (isNaN(percentage) || percentage <= 0 || percentage > 100) {
        return ctx.reply('❌ Invalid percentage. Must be between 1% and 100%.');
      }
    } else {
      return ctx.reply('❌ Invalid format. Use: `/sell [percentage%] <token_address>`', { parse_mode: 'Markdown' });
    }
    
    await ctx.reply('🔍 Analyzing position and preparing sell order...');
    
    // Get user positions
    const positions = await manualTradingService.getUserPositions(userId);
    const position = positions.find(p => 
      p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
    );
    
    if (!position) {
      return ctx.reply('❌ You don\'t have a position in this token.');
    }
    
    // Create sell confirmation
    const tradeParams = {
      tokenAddress: position.tokenAddress,
      percentage,
      chain: position.chain,
      slippage: userSettings.slippage || 5,
      tradeType: 'sell'
    };
    
    const confirmation = await manualTradingService.createTradeConfirmation(userId, tradeParams);
    
    if (!confirmation.success) {
      return ctx.reply(`❌ Failed to prepare sell order: ${confirmation.message}`);
    }
    
    // Calculate sell details
    const sellAmount = (position.amount * percentage) / 100;
    const sellValue = sellAmount * (position.currentPrice || position.avgBuyPrice);
    const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
    const devFee = sellValue * (devFeePercent / 100);
    const feeCode = String(devFeePercent).padStart(4, '0');
    
    // Format sell confirmation
    const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
    const chainEmoji = position.chain === 'solana' ? '🟣' : position.chain === 'ethereum' ? '🔷' : '🟡';
    
    let message = `🔴 **Confirm SELL Order** ${chainEmoji}\n\n`;
    message += `🎯 **${position.tokenName || position.tokenSymbol}** (${position.tokenSymbol})\n`;
    message += `**Sell Amount:** ${percentage}% of position\n\n`;
    
    message += `📊 **Position Details:**\n`;
    message += `• **Total Tokens:** ${position.amount?.toFixed(4) || 0}\n`;
    message += `• **Avg Buy Price:** $${position.avgBuyPrice?.toFixed(8) || 0}\n`;
    message += `• **Current Price:** $${position.currentPrice?.toFixed(8) || 0}\n`;
    message += `• **Selling:** ${sellAmount.toFixed(4)} tokens\n`;
    message += `• **Est. Receive:** $${sellValue.toFixed(2)}\n\n`;
    
    message += `💰 **PnL Analysis:**\n`;
    message += `• **Position PnL:** ${pnlEmoji} ${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage?.toFixed(2) || 0}%\n`;
    message += `• **Cost Basis:** $${((position.amount || 0) * (position.avgBuyPrice || 0)).toFixed(2)}\n`;
    message += `• **Current Value:** $${position.currentValue?.toFixed(2) || 0}\n\n`;
    
    message += `💸 **Transaction Summary:**\n`;
    message += `• **Gross Proceeds:** $${sellValue.toFixed(2)}\n`;
    message += `• **TX fee - ${feeCode}:** $${devFee.toFixed(4)}\n`;
    message += `• **Net Proceeds:** $${(sellValue - devFee).toFixed(2)}\n\n`;
    
    message += `✅ **Ready for execution on ${position.chain.toUpperCase()} blockchain**\n`;
    message += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
    message += `⏰ Expires in 60 seconds`;
    
    // Store trade ID in session
    ctx.session = ctx.session || {};
    ctx.session.pendingTradeId = confirmation.tradeId;
    ctx.session.awaitingTradeConfirmation = true;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Enhanced sell command error:', error);
    await ctx.reply('❌ Error processing sell command. Please try again.');
  }
});

// Quick trading commands
enhancedManualTradingHandler.command('apemax', async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length === 0) {
    return ctx.reply('💎 **Ape Max Usage:**\n\n`/apemax <token_address>` - Buy with maximum available balance\n\nExample: `/apemax So11111111111111111111111111111111111111112`', { parse_mode: 'Markdown' });
  }
  
  // Redirect to max buy
  ctx.message.text = `/buy max ${args[0]}`;
  await enhancedManualTradingHandler.match('buy').call(this, ctx);
});

enhancedManualTradingHandler.command('initials', async (ctx) => {
  await ctx.reply('🎯 **Sell Initials Feature**\n\nThis will sell tokens worth your original investment amount.\n\n💡 **Coming Soon:** This advanced feature is being implemented.\n\nFor now, use: `/sell 50% <token_address>` to sell half your position.', { parse_mode: 'Markdown' });
});

module.exports = enhancedManualTradingHandler; 