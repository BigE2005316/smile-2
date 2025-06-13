module.exports = function(bot) {
  bot.command('trailingstop', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingTrailingStop = true;
    return ctx.reply(`🎯 **Trailing Stop Loss Setup**

Trailing stop loss automatically adjusts your stop loss as the price increases, locking in profits while protecting against downturns.

**Example:**
• Buy at $100, set 15% trailing stop
• Price rises to $140 → Stop loss moves to $119 (15% below peak)
• If price drops to $119, position is closed with profit

Enter your trailing stop percentage (e.g., 15 for 15%):`);
  });
}; 