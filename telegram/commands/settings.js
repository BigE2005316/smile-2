const userService = require('../../users/userService');

module.exports = function (bot) {
  bot.command('settings', async (ctx) => {
    const userId = String(ctx.from.id);
    
    try {
    const settings = await userService.getUserSettings(userId);

      if (!settings) {
        return ctx.reply('⚙️ No settings found. Start by adding a wallet with /addwallet');
      }
      
      const walletsList = settings.wallets && settings.wallets.length > 0 
        ? settings.wallets.map(w => `• ${w.substring(0, 8)}...${w.substring(w.length - 8)}`).join('\n')
        : 'None';
      
      const sellTargetsList = settings.sellTargets && settings.sellTargets.length > 0
        ? settings.sellTargets.join(', ')
        : 'Not set';

      const stats = settings.stats || {};
      const winRate = stats.totalTrades > 0 ? ((stats.wins / stats.totalTrades) * 100).toFixed(1) : '0.0';
      
      const settingsText = `⚙️ **Your Settings:**

📝 **Tracked Wallets:**
${walletsList}

🔗 **Chain:** ${settings.chain || 'Not set'}
💰 **Trade Amount:** ${settings.amount || 'Not set'} tokens
🎯 **Sell Targets:** ${sellTargetsList}
🛡️ **Daily Limit:** ${settings.dailyLimit || 'Not set'} tokens
🛑 **Stop Loss:** ${settings.stopLoss ? 'Enabled' : 'Disabled'}

📊 **Trading Stats:**
• Total Trades: ${stats.totalTrades || 0}
• Wins: ${stats.wins || 0} | Losses: ${stats.losses || 0}
• Win Rate: ${winRate}%
• Total PnL: $${(stats.totalPnL || 0).toFixed(2)}
• Today's Spent: ${(stats.dailySpent || 0).toFixed(3)} tokens

Use /help to see available commands.`;

      return ctx.reply(settingsText, { parse_mode: 'Markdown' });
      
    } catch (err) {
      console.error("❌ Error fetching settings:", err);
      return ctx.reply("❌ Failed to fetch settings. Please try again.");
    }
  });
};
