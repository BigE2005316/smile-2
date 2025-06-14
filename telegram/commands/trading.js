// telegram/commands/trading.js - Enhanced Manual Trading Commands with Real Execution
const { getManualTradingService } = require('../../services/manualTrading');
const userService = require('../../users/userService');
const tokenDataService = require('../../services/tokenDataService');

module.exports = function(bot) {
  // Enhanced buy command with real execution
  bot.command(['buy', 'buyeth', 'buybnb', 'buysol'], async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      const command = ctx.message.text.toLowerCase();
      const args = ctx.message.text.split(' ').slice(1);
      
      // Update user activity
      await userService.updateLastActive(userId);
      
      const service = getManualTradingService();
      
      if (!service || !service.isInitialized()) {
        // Try to force initialize
        await service.forceInitialize();
        if (!service.isInitialized()) {
          return ctx.reply('❌ Trading service not available. Please try again in a moment.');
        }
      }
      
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
• \`/buy 0.1 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
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
        } else {
          tokenAddress = args[0];
          amount = userSettings.amount || 0.1;
        }
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
      
      const loadingMsg = await ctx.reply('🔍 Analyzing token and preparing trade...');
      
      try {
        // Get token information
        const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
        if (!tokenInfo) {
          await ctx.editMessageText('❌ Failed to get token information. Please check the token address.');
          return;
        }
        
        // Create trade confirmation
        const tradeParams = {
          tokenAddress: tokenInfo.address,
          amount,
          chain,
          slippage: slippage || userSettings.slippage || 5,
          tradeType: 'buy'
        };
        
        const confirmation = await service.createTradeConfirmation(userId, tradeParams);
        
        if (!confirmation.success) {
          await ctx.editMessageText(`❌ Failed to prepare trade: ${confirmation.message}`);
          return;
        }
        
        // Calculate fees (using new format)
        const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
        const devFee = amount * (devFeePercent / 100);
        const netAmount = amount - devFee;
        const feeCode = String(devFeePercent).padStart(4, '0');
        
        // Format confirmation message
        const chainEmoji = chain ===  'solana' ? '🟣' : chain === 'ethereum' ? '🔷' : '🟡';
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
        
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Enhanced buy command error:', error);
        await ctx.editMessageText('❌ Error preparing buy order. Please try again.');
      }
      
    } catch (error) {
      console.error('Buy command error:', error);
      await ctx.reply('❌ Error processing buy command. Please try again.');
    }
  });
  
  // Enhanced sell command with real execution
  bot.command(['sell', 'sellall'], async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      const command = ctx.message.text.toLowerCase();
      const args = ctx.message.text.split(' ').slice(1);
      
      // Update user activity
      await userService.updateLastActive(userId);
      
      const service = getManualTradingService();
      
      if (!service || !service.isInitialized()) {
        // Try to force initialize
        await service.forceInitialize();
        if (!service.isInitialized()) {
          return ctx.reply('❌ Trading service not available. Please try again in a moment.');
        }
      }
      
      // Get user settings
      const userSettings = await userService.getUserSettings(userId);
      if (!userSettings) {
        return ctx.reply('❌ Please set up your account first with /start');
      }
      
      const chain = userSettings.chain;
      if (!chain) {
        return ctx.reply('⚠️ Please set your chain first. Use /setchain command.');
      }
      
      // Show positions if no arguments
      if (args.length === 0) {
        const loadingMsg = await ctx.reply('🔄 Loading your positions...');
        
        try {
          const positions = await service.getUserPositions(userId);
          
          if (positions.length === 0) {
            await ctx.editMessageText('❌ You have no positions to sell. Buy tokens first!');
            return;
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
          
          await ctx.editMessageText(message, { parse_mode: 'Markdown' });
          
        } catch (error) {
          console.error('Error loading positions:', error);
          await ctx.editMessageText('❌ Error loading positions. Please try again.');
        }
        
        return;
      }
      
      // Handle sellall command
      if (command === 'sellall') {
        const loadingMsg = await ctx.reply('🔄 Loading all positions...');
        
        try {
          const positions = await service.getUserPositions(userId);
          
          if (positions.length === 0) {
            await ctx.editMessageText('❌ No positions to sell.');
            return;
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
          
          await ctx.editMessageText(message, { parse_mode: 'Markdown' });
          
        } catch (error) {
          console.error('Error preparing sellall:', error);
          await ctx.editMessageText('❌ Error preparing sell all order. Please try again.');
        }
        
        return;
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
      
      const loadingMsg = await ctx.reply('🔍 Analyzing position and preparing sell order...');
      
      try {
        // Get user positions
        const positions = await service.getUserPositions(userId);
        const position = positions.find(p => 
          p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
        );
        
        if (!position) {
          await ctx.editMessageText('❌ You don\'t have a position in this token.');
          return;
        }
        
        // Create sell confirmation
        const tradeParams = {
          tokenAddress: position.tokenAddress,
          percentage,
          chain: position.chain,
          slippage: userSettings.slippage || 5,
          tradeType: 'sell'
        };
        
        const confirmation = await service.createTradeConfirmation(userId, tradeParams);
        
        if (!confirmation.success) {
          await ctx.editMessageText(`❌ Failed to prepare sell order: ${confirmation.message}`);
          return;
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
        
        await ctx.editMessageText(message, { parse_mode: 'Markdown' });
        
      } catch (error) {
        console.error('Error preparing sell order:', error);
        await ctx.editMessageText('❌ Error preparing sell order. Please try again.');
      }
      
    } catch (error) {
      console.error('Sell command error:', error);
      await ctx.reply('❌ Error processing sell command. Please try again.');
    }
  });
  
  // Quick buy command
  bot.command('quickbuy', async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      await userService.updateLastActive(userId);
      
      const userSettings = await userService.getUserSettings(userId);
      if (!userSettings) {
        return ctx.reply('❌ Please set up your account first with /start');
      }
      
      if (!userSettings.chain) {
        return ctx.reply('⚠️ Please set your chain first. Use /setchain command.');
      }
      
      const chain = userSettings.chain;
      const chainSymbol = chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB';
      
      // Create quick buy menu
      const keyboard = {
        inline_keyboard: [
          [
            { text: `0.01 ${chainSymbol}`, callback_data: `quickbuy_amount_0.01` },
            { text: `0.05 ${chainSymbol}`, callback_data: `quickbuy_amount_0.05` },
            { text: `0.1 ${chainSymbol}`, callback_data: `quickbuy_amount_0.1` }
          ],
          [
            { text: `0.5 ${chainSymbol}`, callback_data: `quickbuy_amount_0.5` },
            { text: `1 ${chainSymbol}`, callback_data: `quickbuy_amount_1` },
            { text: `Custom`, callback_data: `quickbuy_amount_custom` }
          ]
        ]
      };
      
      await ctx.reply(`🚀 **Quick Buy Menu**\n\nSelect amount to buy:`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Quick buy command error:', error);
      await ctx.reply('❌ Error starting quick buy. Please try again.');
    }
  });
  
  // Handle quick buy amount selection
  bot.action(/^quickbuy_amount_(.+)$/, async (ctx) => {
    try {
      const amount = ctx.match[1];
      const userId = ctx.from.id;
      
      await ctx.answerCbQuery(`Selected: ${amount}`);
      
      if (amount === 'custom') {
        ctx.session = ctx.session || {};
        ctx.session.awaitingQuickBuy = true;
        
        await ctx.reply('💰 Enter custom amount:');
        return;
      }
      
      ctx.session = ctx.session || {};
      ctx.session.quickBuyAmount = parseFloat(amount);
      ctx.session.awaitingQuickBuyToken = true;
      
      await ctx.reply(`💰 Amount set to ${amount}\n\n📍 Now paste the token contract address:`);
      
    } catch (error) {
      console.error('Quick buy amount selection error:', error);
      await ctx.reply('❌ Error processing selection. Please try again.');
    }
  });
  
  // Handle YES/NO trade confirmations
  bot.hears(/^(YES|yes|Yes|Y|y|NO|no|No|N|n)$/i, async (ctx) => {
    try {
      // Check if awaiting trade confirmation
      if (!ctx.session?.awaitingTradeConfirmation) {
        return; // Not awaiting trade confirmation
      }
      
      const userId = String(ctx.from.id);
      const confirmed = /^(YES|yes|Yes|Y|y)$/i.test(ctx.message.text);
      
      // Get service
      const service = getManualTradingService();
      if (!service || !service.isInitialized()) {
        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.pendingTradeId = null;
        return ctx.reply('❌ Trading service not available. Please try again.');
      }
      
      // Handle sell all positions
      if (ctx.session.sellAllPositions) {
        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.sellAllPositions = false;
        
        if (!confirmed) {
          return ctx.reply('❌ Sell all cancelled.');
        }
        
        await ctx.reply('🔄 Processing sell all positions...');
        
        try {
          const positions = await service.getUserPositions(userId);
          const results = [];
          
          for (const position of positions) {
            try {
              const result = await service.executeSellOrder(userId, {
                tokenAddress: position.tokenAddress,
                percentage: 100,
                chain: position.chain,
                slippage: userSettings.slippage || 5
              });
              
              results.push({
                token: position.tokenSymbol,
                success: result.success,
                message: result.success ? 'Sold successfully' : result.error
              });
              
            } catch (error) {
              results.push({
                token: position.tokenSymbol,
                success: false,
                message: error.message
              });
            }
          }
          
          // Format results
          let message = `📊 **Sell All Results**\n\n`;
          let successCount = 0;
          
          for (const result of results) {
            const emoji = result.success ? '✅' : '❌';
            message += `${emoji} **${result.token}**: ${result.success ? 'Sold' : result.message}\n`;
            if (result.success) successCount++;
          }
          
          message += `\n📈 **Summary:** ${successCount}/${results.length} positions sold successfully`;
          
          await ctx.reply(message, { parse_mode: 'Markdown' });
          
        } catch (error) {
          console.error('Sell all error:', error);
          await ctx.reply('❌ Error selling all positions. Please try again.');
        }
        
        return;
      }
      
      // Handle regular trade confirmation
      const tradeId = ctx.session.pendingTradeId;
      if (!tradeId) {
        ctx.session.awaitingTradeConfirmation = false;
        return ctx.reply('❌ No pending trade found. Please try again.');
      }
      
      // Clear session state
      ctx.session.awaitingTradeConfirmation = false;
      ctx.session.pendingTradeId = null;
      
      if (!confirmed) {
        const result = service.cancelPendingTrade(tradeId);
        return ctx.reply(result.message || '❌ Trade cancelled.');
      }
      
      // Execute the trade
      await ctx.reply('🔄 Executing trade on blockchain...');
      
      try {
        const result = await service.executeConfirmedTrade(tradeId, userId);
        
        if (result.success) {
          await ctx.reply(result.message, { parse_mode: 'Markdown' });
        } else {
          await ctx.reply(`❌ Trade failed: ${result.message}`);
        }
        
      } catch (error) {
        console.error('Trade execution error:', error);
        await ctx.reply(`❌ Trade execution failed: ${error.message}`);
      }
      
    } catch (error) {
      console.error('Trade confirmation handler error:', error);
      
      // Clear any hanging state
      if (ctx.session) {
        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.pendingTradeId = null;
      }
      
      await ctx.reply('❌ Error processing trade confirmation. Please try again.');
    }
  });
  
  // Analyze token command
  bot.command('analyze', async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      await userService.updateLastActive(userId);
      
      const args = ctx.message.text.split(' ').slice(1);
      if (args.length === 0) {
        return ctx.reply(`🔍 **Token Analysis**

**Usage:**
• \`/analyze <token_address>\` - Brief report
• \`/analyze <token_address> detailed\` - Detailed report

**Example:**
• \`/analyze EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`

Provides comprehensive token analysis with risk assessment, technical indicators, and external links.`, { parse_mode: 'Markdown' });
      }
      
      const tokenAddress = args[0];
      const reportType = args[1] === 'detailed' ? 'detailed' : 'brief';
      const userSettings = await userService.getUserSettings(userId);
      const chain = userSettings.chain || 'solana';
      
      const loadingMsg = await ctx.reply('🔍 Analyzing token...');
      
      try {
        const { getTokenAnalysisService } = require('../../services/tokenAnalysisService');
        const analysisService = getTokenAnalysisService();
        const report = await analysisService.handleTokenPaste(tokenAddress, chain, reportType);
        
        await ctx.editMessageText(report, { 
          parse_mode: 'Markdown',
          disable_web_page_preview: true 
        });
        
      } catch (err) {
        await ctx.editMessageText(`❌ Error analyzing token: ${err.message}`);
      }
      
    } catch (err) {
      console.error('Analyze command error:', err);
      await ctx.reply('❌ Error processing analysis request.');
    }
  });
  
  // Slippage command
  bot.command('slippage', async (ctx) => {
    try {
      const userId = String(ctx.from.id);
      await userService.updateLastActive(userId);
      
      const args = ctx.message.text.split(' ').slice(1);
      const userSettings = await userService.getUserSettings(userId);
      
      if (args.length === 0) {
        // Show current slippage and options
        const currentSlippage = userSettings.slippage || 5;
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '1%', callback_data: 'set_slippage_1' },
              { text: '3%', callback_data: 'set_slippage_3' },
              { text: '5%', callback_data: 'set_slippage_5' }
            ],
            [
              { text: '10%', callback_data: 'set_slippage_10' },
              { text: '15%', callback_data: 'set_slippage_15' },
              { text: '20%', callback_data: 'set_slippage_20' }
            ],
            [
              { text: 'Smart Slippage', callback_data: 'set_slippage_smart' }
            ]
          ]
        };
        
        await ctx.reply(`🔄 **Slippage Settings**\n\n**Current Slippage:** ${currentSlippage}%\n\nSelect a new slippage value or use /slippage <percent> to set a custom value.`, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
        
        return;
      }
      
      const input = args[0].toLowerCase();
      let newSlippage;
      let smartSlippage = false;
      
      if (input === 'smart' || input === 'dynamic') {
        smartSlippage = true;
        newSlippage = 5; // Default fallback
      } else {
        newSlippage = parseFloat(input);
        if (isNaN(newSlippage) || newSlippage < 0.1 || newSlippage > 50) {
          return ctx.reply('❌ Invalid slippage. Must be between 0.1% and 50%.');
        }
      }
      
      // Update settings
      userSettings.slippage = newSlippage;
      userSettings.smartSlippage = smartSlippage;
      await userService.saveUserData(userId, userSettings);
      
      let message = `✅ **Slippage Updated**\n\n`;
      if (smartSlippage) {
        message += `🧠 **Smart Slippage:** Enabled\n`;
        message += `Slippage will be calculated dynamically based on:\n`;
        message += `• Token liquidity\n`;
        message += `• Market volatility\n`;
        message += `• Trade size\n`;
        message += `• Current market conditions`;
      } else {
        message += `🔄 **Fixed Slippage:** ${newSlippage}%\n`;
        message += `This will be used for all trades unless overridden.`;
      }
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (err) {
      console.error('Slippage command error:', err);
      await ctx.reply('❌ Error updating slippage settings.');
    }
  });
  
  // Handle slippage setting callbacks
  bot.action(/^set_slippage_(.+)$/, async (ctx) => {
    try {
      const slippageValue = ctx.match[1];
      const userId = ctx.from.id;
      
      await ctx.answerCbQuery('Updating slippage...');
      
      const userSettings = await userService.getUserSettings(userId);
      
      if (slippageValue === 'smart') {
        userSettings.slippage = 5; // Default value
        userSettings.smartSlippage = true;
        await userService.saveUserData(userId, userSettings);
        
        await ctx.editMessageText(`✅ **Smart Slippage Enabled**\n\nSlippage will be calculated dynamically based on market conditions, liquidity, and volatility.\n\nDefault fallback: 5%`, {
          parse_mode: 'Markdown'
        });
      } else {
        const newSlippage = parseInt(slippageValue);
        userSettings.slippage = newSlippage;
        userSettings.smartSlippage = false;
        await userService.saveUserData(userId, userSettings);
        
        await ctx.editMessageText(`✅ **Slippage set to ${newSlippage}%**\n\nThis will be used for all your trades unless overridden.`, {
          parse_mode: 'Markdown'
        });
      }
      
    } catch (error) {
      console.error('Set slippage callback error:', error);
      await ctx.answerCbQuery('❌ Error setting slippage');
      await ctx.reply('❌ Failed to update slippage. Please try again.');
    }
  });
  
  // Start trading callback
  bot.action('start_trading', async (ctx) => {
    try {
      await ctx.answerCbQuery('Opening trading menu...');
      
      const userId = ctx.from.id;
      const userSettings = await userService.getUserSettings(userId);
      const chain = userSettings.chain || 'solana';
      const chainSymbol = chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB';
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: `Buy ${chainSymbol}`, callback_data: 'start_buy' },
            { text: 'Sell Tokens', callback_data: 'start_sell' }
          ],
          [
            { text: 'View Positions', callback_data: 'view_positions' },
            { text: 'Check Balance', callback_data: `balance_${chain}` }
          ],
          [
            { text: 'Set Slippage', callback_data: 'set_slippage_menu' },
            { text: 'Analyze Token', callback_data: 'analyze_token' }
          ]
        ]
      };
      
      await ctx.editMessageText(`💸 **Trading Interface**\n\nChain: ${chain.toUpperCase()}\nWallet: ${userSettings.custodialWallets?.[chain]?.address.substring(0, 8)}...\n\nSelect an action:`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Start trading callback error:', error);
      await ctx.answerCbQuery('❌ Error opening trading menu');
      await ctx.reply('❌ Failed to open trading menu. Please try again.');
    }
  });
  
  // Start buy callback
  bot.action('start_buy', async (ctx) => {
    try {
      await ctx.answerCbQuery('Opening buy interface...');
      
      const userId = ctx.from.id;
      const userSettings = await userService.getUserSettings(userId);
      const chain = userSettings.chain || 'solana';
      const chainSymbol = chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB';
      
      ctx.session = ctx.session || {};
      ctx.session.awaitingQuickBuy = true;
      
      await ctx.editMessageText(`🟢 **Buy Tokens**\n\nChain: ${chain.toUpperCase()}\n\nSelect amount to buy:`, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `0.01 ${chainSymbol}`, callback_data: `quickbuy_amount_0.01` },
              { text: `0.05 ${chainSymbol}`, callback_data: `quickbuy_amount_0.05` },
              { text: `0.1 ${chainSymbol}`, callback_data: `quickbuy_amount_0.1` }
            ],
            [
              { text: `0.5 ${chainSymbol}`, callback_data: `quickbuy_amount_0.5` },
              { text: `1 ${chainSymbol}`, callback_data: `quickbuy_amount_1` },
              { text: `Custom`, callback_data: `quickbuy_amount_custom` }
            ]
          ]
        }
      });
      
    } catch (error) {
      console.error('Start buy callback error:', error);
      await ctx.answerCbQuery('❌ Error opening buy interface');
      await ctx.reply('❌ Failed to open buy interface. Please try again.');
    }
  });
  
  // Start sell callback
  bot.action('start_sell', async (ctx) => {
    try {
      await ctx.answerCbQuery('Loading positions...');
      
      const userId = ctx.from.id;
      const service = getManualTradingService();
      
      if (!service || !service.isInitialized()) {
        await ctx.editMessageText('❌ Trading service not available. Please try again.');
        return;
      }
      
      const positions = await service.getUserPositions(userId);
      
      if (positions.length === 0) {
        await ctx.editMessageText('❌ You have no positions to sell. Buy tokens first!');
        return;
      }
      
      let message = `🔴 **Sell Tokens**\n\nSelect a position to sell:`;
      
      const keyboard = {
        inline_keyboard: []
      };
      
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
        const pnlText = position.pnl >= 0 ? `+${position.pnlPercentage?.toFixed(2)}%` : `${position.pnlPercentage?.toFixed(2)}%`;
        
        keyboard.inline_keyboard.push([
          { 
            text: `${pnlEmoji} ${position.tokenSymbol} (${pnlText})`, 
            callback_data: `sell_token_${position.tokenAddress}` 
          }
        ]);
      }
      
      keyboard.inline_keyboard.push([
        { text: '🔄 Refresh', callback_data: 'refresh_positions' },
        { text: '❌ Cancel', callback_data: 'cancel_sell' }
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Start sell callback error:', error);
      await ctx.answerCbQuery('❌ Error loading positions');
      await ctx.reply('❌ Failed to load positions. Please try again.');
    }
  });
  
  // Handle sell token selection
  bot.action(/^sell_token_(.+)$/, async (ctx) => {
    try {
      const tokenAddress = ctx.match[1];
      const userId = ctx.from.id;
      
      await ctx.answerCbQuery('Loading token details...');
      
      const service = getManualTradingService();
      
      if (!service || !service.isInitialized()) {
        await ctx.editMessageText('❌ Trading service not available. Please try again.');
        return;
      }
      
      const positions = await service.getUserPositions(userId);
      const position = positions.find(p => p.tokenAddress === tokenAddress);
      
      if (!position) {
        await ctx.editMessageText('❌ Position not found. It may have been sold or removed.');
        return;
      }
      
      const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
      
      let message = `🔴 **Sell ${position.tokenSymbol}**\n\n`;
      message += `📊 **Position Details:**\n`;
      message += `• Amount: ${position.amount?.toFixed(4)} tokens\n`;
      message += `• Current Price: $${position.currentPrice?.toFixed(8)}\n`;
      message += `• Value: $${position.currentValue?.toFixed(2)}\n`;
      message += `• PnL: ${pnlEmoji} ${position.pnl >= 0 ? '+' : ''}${position.pnlPercentage?.toFixed(2)}%\n\n`;
      message += `Select percentage to sell:`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '25%', callback_data: `sell_percent_${tokenAddress}_25` },
            { text: '50%', callback_data: `sell_percent_${tokenAddress}_50` },
            { text: '75%', callback_data: `sell_percent_${tokenAddress}_75` }
          ],
          [
            { text: '100% (All)', callback_data: `sell_percent_${tokenAddress}_100` }
          ],
          [
            { text: '🔄 Refresh', callback_data: `refresh_token_${tokenAddress}` },
            { text: '❌ Cancel', callback_data: 'cancel_sell' }
          ]
        ]
      };
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Sell token selection error:', error);
      await ctx.answerCbQuery('❌ Error loading token details');
      await ctx.reply('❌ Failed to load token details. Please try again.');
    }
  });
  
  // Handle sell percentage selection
  bot.action(/^sell_percent_(.+)_(\d+)$/, async (ctx) => {
    try {
      const tokenAddress = ctx.match[1];
      const percentage = parseInt(ctx.match[2]);
      const userId = ctx.from.id;
      
      await ctx.answerCbQuery(`Selected: ${percentage}%`);
      
      const service = getManualTradingService();
      
      if (!service || !service.isInitialized()) {
        await ctx.editMessageText('❌ Trading service not available. Please try again.');
        return;
      }
      
      // Create trade confirmation
      const userSettings = await userService.getUserSettings(userId);
      const positions = await service.getUserPositions(userId);
      const position = positions.find(p => p.tokenAddress === tokenAddress);
      
      if (!position) {
        await ctx.editMessageText('❌ Position not found. It may have been sold or removed.');
        return;
      }
      
      const tradeParams = {
        tokenAddress,
        percentage,
        chain: position.chain,
        slippage: userSettings.slippage || 5,
        tradeType: 'sell'
      };
      
      const confirmation = await service.createTradeConfirmation(userId, tradeParams);
      
      if (!confirmation.success) {
        await ctx.editMessageText(`❌ Failed to prepare sell order: ${confirmation.message}`);
        return;
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
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Sell percentage selection error:', error);
      await ctx.answerCbQuery('❌ Error preparing sell order');
      await ctx.reply('❌ Failed to prepare sell order. Please try again.');
    }
  });
  
  // Handle cancel sell
  bot.action('cancel_sell', async (ctx) => {
    try {
      await ctx.answerCbQuery('❌ Cancelled');
      await ctx.editMessageText('❌ Sell operation cancelled.');
    } catch (error) {
      console.error('Cancel sell error:', error);
    }
  });
  
  // Handle refresh positions
  bot.action('refresh_positions', async (ctx) => {
    try {
      await ctx.answerCbQuery('🔄 Refreshing positions...');
      
      const userId = ctx.from.id;
      const service = getManualTradingService();
      
      if (!service || !service.isInitialized()) {
        await ctx.editMessageText('❌ Trading service not available. Please try again.');
        return;
      }
      
      const positions = await service.getUserPositions(userId);
      
      if (positions.length === 0) {
        await ctx.editMessageText('❌ You have no positions to sell. Buy tokens first!');
        return;
      }
      
      let message = `🔴 **Sell Tokens**\n\nSelect a position to sell:`;
      
      const keyboard = {
        inline_keyboard: []
      };
      
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
        const pnlText = position.pnl >= 0 ? `+${position.pnlPercentage?.toFixed(2)}%` : `${position.pnlPercentage?.toFixed(2)}%`;
        
        keyboard.inline_keyboard.push([
          { 
            text: `${pnlEmoji} ${position.tokenSymbol} (${pnlText})`, 
            callback_data: `sell_token_${position.tokenAddress}` 
          }
        ]);
      }
      
      keyboard.inline_keyboard.push([
        { text: '🔄 Refresh', callback_data: 'refresh_positions' },
        { text: '❌ Cancel', callback_data: 'cancel_sell' }
      ]);
      
      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
      
    } catch (error) {
      console.error('Refresh positions error:', error);
      await ctx.answerCbQuery('❌ Error refreshing positions');
      await ctx.reply('❌ Failed to refresh positions. Please try again.');
    }
  });
  
  // Analyze token callback
  bot.action('analyze_token', async (ctx) => {
    try {
      await ctx.answerCbQuery('Opening token analyzer...');
      
      await ctx.editMessageText(`🔍 **Token Analyzer**\n\nPaste a token address to analyze:`, {
        parse_mode: 'Markdown'
      });
      
      ctx.session = ctx.session || {};
      ctx.session.awaitingTokenAnalysis = true;
      
    } catch (error) {
      console.error('Analyze token callback error:', error);
      await ctx.answerCbQuery('❌ Error opening analyzer');
      await ctx.reply('❌ Failed to open token analyzer. Please try again.');
    }
  });
  
  // Handle token analysis input
  bot.on('text', async (ctx, next) => {
    if (ctx.session?.awaitingTokenAnalysis) {
      const tokenAddress = ctx.message.text.trim();
      ctx.session.awaitingTokenAnalysis = false;
      
      const loadingMsg = await ctx.reply('🔍 Analyzing token...');
      
      try {
        const userId = ctx.from.id;
        const userSettings = await userService.getUserSettings(userId);
        const chain = userSettings.chain || 'solana';
        
        const { getTokenAnalysisService } = require('../../services/tokenAnalysisService');
        const analysisService = getTokenAnalysisService();
        const report = await analysisService.handleTokenPaste(tokenAddress, chain, 'detailed');
        
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          report,
          { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true 
          }
        );
        
      } catch (err) {
        await ctx.telegram.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          undefined,
          `❌ Error analyzing token: ${err.message}`
        );
      }
      
      return;
    }
    
    return next();
  });
};