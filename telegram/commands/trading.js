// telegram/commands/trading.js - Manual Trading Commands
const { getManualTradingService } = require('../../services/manualTrading');

module.exports = function(bot) {
  // Buy command
  bot.command('buy', async (ctx) => {
    const userId = String(ctx.from.id);
    const service = getManualTradingService();
    
    if (!service) {
      return ctx.reply('❌ Trading service not initialized. Please try again.');
    }
    
    // Get command arguments
    const args = ctx.message.text.split(' ').slice(1).join(' ');
    
    if (!args) {
      return ctx.reply(`📚 **How to Buy Tokens**

**Usage:** /buy [amount] <token_address>

**Examples:**
• /buy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
• /buy 0.5 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

💡 If no amount specified, uses your default amount from /amount

**Requirements:**
1. Set your chain first (/setchain)
2. Create/fund your wallet (/wallet)
3. Have sufficient balance`);
    }
    
    const result = await service.processBuyCommand(userId, args);
    
    if (result.needsConfirmation) {
      ctx.session = ctx.session || {};
      ctx.session.pendingTradeId = result.tradeId;
      ctx.session.awaitingTradeConfirmation = true;
      console.log(`🎯 Trade confirmation needed for ${result.tradeId}`);
    }
    
    return ctx.reply(result.message, { parse_mode: 'Markdown' });
  });
  
  // Sell command
  bot.command('sell', async (ctx) => {
    const userId = String(ctx.from.id);
    const service = getManualTradingService();
    
    if (!service) {
      return ctx.reply('❌ Trading service not initialized. Please try again.');
    }
    
    // Get command arguments
    const args = ctx.message.text.split(' ').slice(1).join(' ');
    
    if (!args) {
      // Show positions if no args
      const result = await service.processSellCommand(userId, '');
      return ctx.reply(result.message, { parse_mode: 'Markdown' });
    }
    
    const result = await service.processSellCommand(userId, args);
    
    if (result.needsConfirmation) {
      ctx.session = ctx.session || {};
      ctx.session.pendingTradeId = result.tradeId;
      ctx.session.awaitingTradeConfirmation = true;
      console.log(`🎯 Trade confirmation needed for ${result.tradeId}`);
    }
    
    return ctx.reply(result.message, { parse_mode: 'Markdown' });
  });
  
  // Quick buy buttons (common amounts)
  bot.command('quickbuy', async (ctx) => {
    const userId = String(ctx.from.id);
    
    ctx.session = ctx.session || {};
    ctx.session.awaitingQuickBuy = true;
    
    const message = `🚀 **Quick Buy Menu**

Select amount and then paste token address:

**Solana:**
• 0.1 SOL
• 0.5 SOL  
• 1 SOL
• 2 SOL
• 5 SOL

**Ethereum/BSC:**
• 0.01 ETH/BNB
• 0.05 ETH/BNB
• 0.1 ETH/BNB
• 0.5 ETH/BNB

Send the amount (e.g., "0.5") to continue or /cancel to exit.`;

    return ctx.reply(message, { parse_mode: 'Markdown' });
  });
  
  // Market buy - buy trending tokens
  bot.command('market', async (ctx) => {
    const message = `📈 **Market Overview**

**🔥 Trending Tokens:**
Coming soon...

**📊 Recent Trades:**
Use /positions to view your positions

**💡 Quick Actions:**
• /buy <token> - Buy a token
• /sell - Sell your positions
• /positions - View all positions

*Market data integration coming soon!*`;

    return ctx.reply(message, { parse_mode: 'Markdown' });
  });

  // FIXED: Handle trade confirmations (YES/NO) with proper error handling and immediate execution
  bot.hears(/^(YES|yes|Yes|NO|no|No)$/i, async (ctx) => {
    try {
      // Check if awaiting trade confirmation
      if (!ctx.session?.awaitingTradeConfirmation || !ctx.session?.pendingTradeId) {
        return; // Not awaiting trade confirmation, ignore
      }
      
      const userId = String(ctx.from.id);
      const confirmed = /^(YES|yes|Yes)$/i.test(ctx.message.text);
      const tradeId = ctx.session.pendingTradeId;
      
      console.log(`🎯 Processing trade confirmation: ${confirmed ? 'YES' : 'NO'} for trade ${tradeId}`);
      
      // Clear session state IMMEDIATELY to prevent hanging
      ctx.session.awaitingTradeConfirmation = false;
      ctx.session.pendingTradeId = null;
      
      const service = getManualTradingService();
      
      if (!service) {
        return ctx.reply('❌ Trading service not available. Please try again.');
      }
      
      if (!confirmed) {
        // User said NO - cancel trade immediately
        const cancelResult = service.cancelPendingTrade(tradeId);
        return ctx.reply('❌ Trade cancelled.');
      }
      
      // User said YES - execute trade IMMEDIATELY
      console.log(`🚀 User confirmed trade ${tradeId} - executing now...`);
      await ctx.reply('🔄 Executing trade...');
      
      try {
        // Execute the trade directly through the service
        const result = await service.executeConfirmedTrade(tradeId, userId);
        
        if (result.success) {
          await ctx.reply(result.message, { parse_mode: 'Markdown' });
          console.log(`✅ Trade ${tradeId} executed successfully`);
        } else {
          await ctx.reply(`❌ Trade failed: ${result.message}`);
          console.error(`❌ Trade ${tradeId} failed:`, result.message);
        }
        
      } catch (executeError) {
        console.error(`💥 Critical trade execution error for ${tradeId}:`, executeError);
        await ctx.reply(`❌ Trade execution failed: ${executeError.message}`);
        
        // Clean up the pending trade to prevent hanging
        service.clearPendingTrade(tradeId);
      }
      
    } catch (error) {
      console.error('💥 Trade confirmation handler error:', error);
      
      // Clear any hanging state
      if (ctx.session) {
        ctx.session.awaitingTradeConfirmation = false;
        ctx.session.pendingTradeId = null;
      }
      
      await ctx.reply('❌ Error processing trade confirmation. Please try again.');
    }
  });
}; 