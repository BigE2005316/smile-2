// telegram/commands/enhancedTrading.js - Enhanced Trading Commands
const { Composer } = require('telegraf');
const { getAdvancedEngine } = require('../../services/advancedTradingEngine');
const { getTokenAnalysisService } = require('../../services/tokenAnalysisService');
const { getManualTradingService } = require('../../services/manualTrading');
const userService = require('../../users/userService');
const tokenDataService = require('../../services/tokenDataService');

const trading = new Composer();

// Enhanced buy command with simulation and confirmation
trading.command('buy', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply(`💰 **Enhanced Buy Command**

**Usage:**
• \`/buy <token_address>\` - Buy with default amount
• \`/buy <amount> <token_address>\` - Buy specific amount
• \`/buy <amount> <token_address> <slippage>\` - Buy with custom slippage

**Examples:**
• \`/buy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
• \`/buy 0.5 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
• \`/buy 0.5 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 10\`

🔮 Includes: Trade simulation, price impact alerts, rug detection`, { parse_mode: 'Markdown' });
    }
    
    const userData = await userService.getUserSettings(userId);
    
    if (!userData.chain) {
      return ctx.reply('⚠️ Please set your chain first with /setchain');
    }
    
    // Parse arguments
    let amount, tokenAddress, customSlippage;
    
    if (args.length === 1) {
      tokenAddress = args[0];
      amount = userData.amount || 0.1;
    } else if (args.length === 2) {
      amount = parseFloat(args[0]);
      tokenAddress = args[1];
      
      if (isNaN(amount)) {
        return ctx.reply('❌ Invalid amount. Must be a number.');
      }
    } else if (args.length === 3) {
      amount = parseFloat(args[0]);
      tokenAddress = args[1];
      customSlippage = parseFloat(args[2]);
      
      if (isNaN(amount) || isNaN(customSlippage)) {
        return ctx.reply('❌ Invalid amount or slippage. Must be numbers.');
      }
    }
    
    // Validate token address
    const engine = getAdvancedEngine();
    if (!isValidTokenAddress(tokenAddress, userData.chain)) {
      return ctx.reply('❌ Invalid token address format for ' + userData.chain.toUpperCase());
    }
    
    // Show initial message
    const processingMsg = await ctx.reply('🔮 Analyzing token and simulating trade...');
    
    try {
      // Get token data
      const tokenData = await tokenDataService.getTokenData(tokenAddress, userData.chain);
      if (!tokenData) {
        return ctx.editMessageText('❌ Token data not available. Please try again.');
      }
      
      // Get user trading settings
      const tradingSettings = await engine.getUserTradingSettings(userId);
      
      // Determine slippage
      const slippage = customSlippage || 
                      (tradingSettings.smartSlippage ? 
                       await engine.getDynamicSlippage(tokenAddress, userData.chain, amount) : 
                       tradingSettings.slippage);
      
      // Simulate trade
      const simulation = await engine.simulateTrade(tokenAddress, amount, 'buy', userData.chain, slippage);
      
      // Check auto-buy eligibility
      const autoBuyCheck = await engine.checkAutoBuyEligibility(tokenAddress, userData.chain, tradingSettings);
      
      // Format results
      let message = `🔮 **Trade Analysis Complete**\n\n`;
      message += `🎯 **${tokenData.name}** (${tokenData.symbol})\n`;
      message += `💰 **Amount:** ${amount} ${userData.chain === 'solana' ? 'SOL' : userData.chain === 'ethereum' ? 'ETH' : 'BNB'}\n`;
      message += `📊 **Price:** $${tokenData.priceUsd.toFixed(6)}\n`;
      message += `🔄 **Slippage:** ${slippage}%\n\n`;
      
      // Simulation results
      if (simulation.success) {
        message += `✅ **Simulation:** SUCCESS\n`;
        message += `📈 **Price Impact:** ${simulation.priceImpact.toFixed(2)}%\n`;
        message += `💱 **Expected Tokens:** ${simulation.expectedOutput.toFixed(4)}\n`;
        message += `🛣️ **Route:** ${simulation.route}\n`;
      } else {
        message += `❌ **Simulation:** FAILED\n`;
        simulation.errors.forEach(error => {
          message += `• ${error}\n`;
        });
      }
      
      // Auto-buy check results
      message += `\n🤖 **Auto-Buy Check:** ${autoBuyCheck.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
      message += `📊 **Safety Score:** ${autoBuyCheck.score}/100\n`;
      
      // Warnings
      const allWarnings = [...simulation.warnings, ...autoBuyCheck.warnings];
      if (allWarnings.length > 0) {
        message += `\n⚠️ **Warnings:**\n`;
        allWarnings.forEach(warning => {
          message += `• ${warning}\n`;
        });
      }
      
      await ctx.editMessageText(message, { parse_mode: 'Markdown' });
      
      // Only proceed if simulation was successful
      if (simulation.success) {
        // Create inline keyboard for confirmation
        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Confirm Buy', callback_data: `confirm_buy_${userId}_${Date.now()}` },
              { text: '❌ Cancel', callback_data: `cancel_buy_${userId}` }
            ],
            [
              { text: '🔧 Custom Slippage', callback_data: `slippage_buy_${userId}` },
              { text: '🎯 Set Stop Loss', callback_data: `stoploss_buy_${userId}` }
            ]
          ]
        };
        
        // Store trade data for confirmation
        ctx.session.pendingBuy = {
          tokenAddress,
          amount,
          slippage,
          simulation,
          tokenData,
          timestamp: Date.now()
        };
        
        await ctx.reply('⚠️ **Confirm your trade:**', { reply_markup: keyboard });
      }
      
    } catch (err) {
      console.error('Enhanced buy error:', err);
      await ctx.editMessageText(`❌ Error analyzing trade: ${err.message}`);
    }
    
  } catch (err) {
    console.error('Buy command error:', err);
    await ctx.reply('❌ Error processing buy command. Please try again.');
  }
});

// Enhanced sell command with position analysis
trading.command('sell', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const args = ctx.message.text.split(' ').slice(1);
    const userData = await userService.getUserSettings(userId);
    
    if (!userData.positions || Object.keys(userData.positions).length === 0) {
      return ctx.reply('❌ You have no positions to sell. Buy tokens first!');
    }
    
    if (args.length === 0) {
      // Show positions with sell buttons
      return showSellablePositions(ctx, userData);
    }
    
    // Parse sell command
    let sellPercent = 100;
    let tokenAddress;
    
    if (args.length === 1) {
      // Just token address or percentage
      if (args[0].includes('%')) {
        sellPercent = parseFloat(args[0].replace('%', ''));
        return showSellablePositions(ctx, userData, sellPercent);
      } else {
        tokenAddress = args[0];
      }
    } else if (args.length === 2) {
      sellPercent = parseFloat(args[0].replace('%', ''));
      tokenAddress = args[1];
    }
    
    if (!tokenAddress || !userData.positions[tokenAddress]) {
      return ctx.reply('❌ Position not found. Use /sell to see your positions.');
    }
    
    if (isNaN(sellPercent) || sellPercent <= 0 || sellPercent > 100) {
      return ctx.reply('❌ Invalid sell percentage. Must be between 1-100.');
    }
    
    // Analyze position and simulate sell
    await analyzeSellPosition(ctx, userId, tokenAddress, sellPercent);
    
  } catch (err) {
    console.error('Sell command error:', err);
    await ctx.reply('❌ Error processing sell command. Please try again.');
  }
});

// Custom slippage selector
trading.command('slippage', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const args = ctx.message.text.split(' ').slice(1);
    const userData = await userService.getUserSettings(userId);
    
    if (args.length === 0) {
      // Show current slippage and options
      const engine = getAdvancedEngine();
      const settings = await engine.getUserTradingSettings(userId);
      
      let message = `🔄 **Slippage Settings**\n\n`;
      message += `**Current Slippage:** ${settings.slippage}%\n`;
      message += `**Smart Slippage:** ${settings.smartSlippage ? '✅ Enabled' : '❌ Disabled'}\n\n`;
      
      message += `**Quick Set:**\n`;
      message += `• /slippage 1 - Ultra low (1%)\n`;
      message += `• /slippage 5 - Normal (5%)\n`;
      message += `• /slippage 10 - High (10%)\n`;
      message += `• /slippage 20 - Very high (20%)\n`;
      message += `• /slippage smart - Enable dynamic slippage\n\n`;
      
      message += `**Custom:** /slippage <percent>\n`;
      message += `**Example:** \`/slippage 7.5\``;
      
      return ctx.reply(message, { parse_mode: 'Markdown' });
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
    const engine = getAdvancedEngine();
    await engine.updateUserTradingSettings(userId, {
      slippage: newSlippage,
      smartSlippage
    });
    
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

// Enhanced custom TP/SL command
trading.command('customtpsl', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const args = ctx.message.text.split(' ').slice(1);
    const userData = await userService.getUserSettings(userId);
    
    if (args.length === 0) {
      // Show current TP/SL settings
      let message = `🎯 **Take Profit / Stop Loss Settings**\n\n`;
      
      if (userData.customTPSL && userData.customTPSL.enabled) {
        message += `✅ **Status:** Enabled\n`;
        message += `📈 **Take Profit Levels:**\n`;
        userData.customTPSL.takeProfits.forEach((tp, index) => {
          message += `• Level ${index + 1}: ${tp.percent}% (sell ${tp.sellPercent}%)\n`;
        });
        
        if (userData.customTPSL.stopLoss) {
          message += `📉 **Stop Loss:** ${userData.customTPSL.stopLoss.percent}%\n`;
          message += `🔄 **Trailing:** ${userData.customTPSL.stopLoss.trailing ? '✅' : '❌'}\n`;
        }
      } else {
        message += `❌ **Status:** Disabled\n`;
      }
      
      message += `\n**Commands:**\n`;
      message += `• /customtpsl enable - Enable custom TP/SL\n`;
      message += `• /customtpsl disable - Disable custom TP/SL\n`;
      message += `• /customtpsl tp <percent> <sell%> - Add take profit\n`;
      message += `• /customtpsl sl <percent> - Set stop loss\n`;
      message += `• /customtpsl trailing <percent> - Set trailing SL\n`;
      message += `• /customtpsl clear - Clear all levels\n\n`;
      
      message += `**Examples:**\n`;
      message += `• \`/customtpsl tp 50 25\` - 50% profit, sell 25%\n`;
      message += `• \`/customtpsl sl -20\` - Stop loss at -20%\n`;
      message += `• \`/customtpsl trailing -15\` - Trailing SL at -15%`;
      
      return ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    const command = args[0].toLowerCase();
    
    // Initialize TP/SL settings if not exists
    if (!userData.customTPSL) {
      userData.customTPSL = {
        enabled: false,
        takeProfits: [],
        stopLoss: null
      };
    }
    
    switch (command) {
      case 'enable':
        userData.customTPSL.enabled = true;
        await userService.saveUserData(userId, userData);
        await ctx.reply('✅ Custom TP/SL enabled. Tracked wallet sells will be ignored.');
        break;
        
      case 'disable':
        userData.customTPSL.enabled = false;
        await userService.saveUserData(userId, userData);
        await ctx.reply('❌ Custom TP/SL disabled. Will follow tracked wallet sells.');
        break;
        
      case 'tp':
      case 'takeprofit':
        if (args.length < 3) {
          return ctx.reply('❌ Usage: /customtpsl tp <profit_percent> <sell_percent>');
        }
        
        const profitPercent = parseFloat(args[1]);
        const sellPercent = parseFloat(args[2]);
        
        if (isNaN(profitPercent) || isNaN(sellPercent) || profitPercent <= 0 || sellPercent <= 0 || sellPercent > 100) {
          return ctx.reply('❌ Invalid percentages. Profit > 0, Sell 1-100%.');
        }
        
        userData.customTPSL.takeProfits.push({
          percent: profitPercent,
          sellPercent,
          triggered: false
        });
        
        // Sort by profit percent
        userData.customTPSL.takeProfits.sort((a, b) => a.percent - b.percent);
        
        await userService.saveUserData(userId, userData);
        await ctx.reply(`✅ Take profit added: ${profitPercent}% profit → sell ${sellPercent}%`);
        break;
        
      case 'sl':
      case 'stoploss':
        if (args.length < 2) {
          return ctx.reply('❌ Usage: /customtpsl sl <loss_percent>');
        }
        
        const lossPercent = parseFloat(args[1]);
        
        if (isNaN(lossPercent) || lossPercent >= 0) {
          return ctx.reply('❌ Stop loss must be negative (e.g., -20 for 20% loss).');
        }
        
        userData.customTPSL.stopLoss = {
          percent: lossPercent,
          trailing: false,
          triggered: false
        };
        
        await userService.saveUserData(userId, userData);
        await ctx.reply(`✅ Stop loss set at ${lossPercent}%`);
        break;
        
      case 'trailing':
        if (args.length < 2) {
          return ctx.reply('❌ Usage: /customtpsl trailing <loss_percent>');
        }
        
        const trailingPercent = parseFloat(args[1]);
        
        if (isNaN(trailingPercent) || trailingPercent >= 0) {
          return ctx.reply('❌ Trailing stop loss must be negative (e.g., -15 for 15% trailing).');
        }
        
        userData.customTPSL.stopLoss = {
          percent: trailingPercent,
          trailing: true,
          triggered: false,
          highWaterMark: 0
        };
        
        await userService.saveUserData(userId, userData);
        await ctx.reply(`✅ Trailing stop loss set at ${trailingPercent}%`);
        break;
        
      case 'clear':
        userData.customTPSL.takeProfits = [];
        userData.customTPSL.stopLoss = null;
        await userService.saveUserData(userId, userData);
        await ctx.reply('✅ All TP/SL levels cleared.');
        break;
        
      default:
        await ctx.reply('❌ Invalid command. Use /customtpsl for help.');
    }
    
  } catch (err) {
    console.error('Custom TP/SL error:', err);
    await ctx.reply('❌ Error updating TP/SL settings.');
  }
});

// Token analysis command
trading.command('analyze', async (ctx) => {
  try {
    const userId = ctx.from.id;
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
    const userData = await userService.getUserSettings(userId);
    const chain = userData.chain || 'solana';
    
    const processingMsg = await ctx.reply('🔍 Analyzing token...');
    
    try {
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

// Helper functions
function isValidTokenAddress(address, chain) {
  if (chain === 'solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  } else if (['ethereum', 'bsc', 'arbitrum', 'polygon', 'base'].includes(chain)) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  return false;
}

async function showSellablePositions(ctx, userData, sellPercent = 100) {
  const positions = userData.positions;
  
  let message = `📊 **Your Positions**\n\n`;
  const buttons = [];
  
  for (const [tokenAddress, position] of Object.entries(positions)) {
    try {
      const tokenData = await tokenDataService.getTokenData(tokenAddress, userData.chain);
      const currentValue = position.totalAmount * tokenData.priceUsd;
      const costBasis = position.totalAmount * position.avgPrice;
      const pnl = currentValue - costBasis;
      const pnlPercent = ((currentValue - costBasis) / costBasis) * 100;
      const pnlEmoji = pnl >= 0 ? '🟢' : '🔴';
      
      message += `${pnlEmoji} **${tokenData.symbol}**\n`;
      message += `• Amount: ${position.totalAmount.toFixed(4)}\n`;
      message += `• PnL: ${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% ($${pnl.toFixed(2)})\n`;
      message += `• Current: $${tokenData.priceUsd.toFixed(6)}\n\n`;
      
      // Add sell buttons
      buttons.push([
        { text: `Sell 25% ${tokenData.symbol}`, callback_data: `sell_25_${tokenAddress}` },
        { text: `Sell 50% ${tokenData.symbol}`, callback_data: `sell_50_${tokenAddress}` },
        { text: `Sell All ${tokenData.symbol}`, callback_data: `sell_100_${tokenAddress}` }
      ]);
      
    } catch (err) {
      console.error('Error getting token data for position:', err);
    }
  }
  
  if (buttons.length === 0) {
    return ctx.reply('❌ No valid positions found.');
  }
  
  await ctx.reply(message, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

async function analyzeSellPosition(ctx, userId, tokenAddress, sellPercent) {
  const userData = await userService.getUserSettings(userId);
  const position = userData.positions[tokenAddress];
  
  const processingMsg = await ctx.reply('📊 Analyzing position and simulating sell...');
  
  try {
    // Get current token data
    const tokenData = await tokenDataService.getTokenData(tokenAddress, userData.chain);
    
    // Calculate current PnL
    const currentValue = position.totalAmount * tokenData.priceUsd;
    const costBasis = position.totalAmount * position.avgPrice;
    const pnl = currentValue - costBasis;
    const pnlPercent = ((currentValue - costBasis) / costBasis) * 100;
    
    // Simulate sell
    const engine = getAdvancedEngine();
    const sellAmount = position.totalAmount * (sellPercent / 100);
    const simulation = await engine.simulateTrade(tokenAddress, sellAmount, 'sell', userData.chain);
    
    let message = `📊 **Sell Position Analysis**\n\n`;
    message += `🎯 **${tokenData.name}** (${tokenData.symbol})\n`;
    message += `📉 **Selling:** ${sellPercent}% (${sellAmount.toFixed(4)} tokens)\n\n`;
    
    message += `💰 **Current Position:**\n`;
    message += `• Total Amount: ${position.totalAmount.toFixed(4)} tokens\n`;
    message += `• Avg Buy Price: $${position.avgPrice.toFixed(6)}\n`;
    message += `• Current Price: $${tokenData.priceUsd.toFixed(6)}\n`;
    message += `• Current PnL: ${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% ($${pnl.toFixed(2)})\n\n`;
    
    if (simulation.success) {
      message += `✅ **Sell Simulation:** SUCCESS\n`;
      message += `💸 **Estimated Proceeds:** $${simulation.expectedOutput.toFixed(2)}\n`;
      message += `📈 **Price Impact:** ${simulation.priceImpact.toFixed(2)}%\n`;
      
      // Calculate PnL for this sell
      const sellCostBasis = sellAmount * position.avgPrice;
      const sellPnL = simulation.expectedOutput - sellCostBasis;
      message += `📊 **Sell PnL:** ${sellPnL >= 0 ? '+' : ''}$${sellPnL.toFixed(2)}\n`;
    } else {
      message += `❌ **Sell Simulation:** FAILED\n`;
      simulation.errors.forEach(error => {
        message += `• ${error}\n`;
      });
    }
    
    await ctx.editMessageText(message, { parse_mode: 'Markdown' });
    
    if (simulation.success) {
      // Create confirmation keyboard
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Confirm Sell', callback_data: `confirm_sell_${userId}_${tokenAddress}_${sellPercent}` },
            { text: '❌ Cancel', callback_data: `cancel_sell_${userId}` }
          ]
        ]
      };
      
      await ctx.reply('⚠️ **Confirm your sell order:**', { reply_markup: keyboard });
    }
    
  } catch (err) {
    await ctx.editMessageText(`❌ Error analyzing sell position: ${err.message}`);
  }
}

module.exports = trading; 