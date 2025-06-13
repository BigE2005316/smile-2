const { advancedTradingService } = require('../../services/advancedTrading');

module.exports = function(bot) {
  bot.command('positions', async (ctx) => {
    const userId = String(ctx.from.id);
    
    try {
      const positions = advancedTradingService.copyEngine.getUserPositions(userId);
      
      if (!positions || positions.size === 0) {
        return ctx.reply(`📊 **No Active Positions**

You don't have any copy trading positions yet.

Start copy trading by:
1. /addwallet - Add wallets to track
2. /setchain - Select blockchain
3. /amount - Set trade amount
4. /copysells - Enable copy selling`);
      }
      
      let positionsText = '📊 **Your Copy Trading Positions:**\n\n';
      
      for (const [key, position] of positions) {
        const tokenShort = position.tokenAddress.substring(0, 8) + '...' + 
                          position.tokenAddress.substring(position.tokenAddress.length - 6);
        const sourceShort = position.sourceWallet.substring(0, 6) + '...' + 
                           position.sourceWallet.substring(position.sourceWallet.length - 4);
        
        positionsText += `🪙 **Token:** \`${tokenShort}\`\n`;
        positionsText += `📍 **Source:** \`${sourceShort}\`\n`;
        positionsText += `💰 **Amount:** ${position.totalAmount.toFixed(6)}\n`;
        positionsText += `📈 **Trades:** ${position.trades.length}\n`;
        positionsText += `⛓️ **Chain:** ${position.chain}\n\n`;
      }
      
      // Add trailing stop status
      const trailingSL = advancedTradingService.trailingStopLoss.positions;
      if (trailingSL.size > 0) {
        positionsText += '\n🎯 **Active Trailing Stops:**\n';
        for (const [key, sl] of trailingSL) {
          if (key.startsWith(userId)) {
            positionsText += `• ${sl.stopLossPercent}% trailing stop active\n`;
          }
        }
      }
      
      return ctx.reply(positionsText, { parse_mode: 'Markdown' });
      
    } catch (err) {
      console.error("❌ Error fetching positions:", err);
      return ctx.reply("❌ Failed to fetch positions. Please try again.");
    }
  });
}; 