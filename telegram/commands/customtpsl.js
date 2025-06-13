module.exports = function(bot) {
  bot.command('customtpsl', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingTPSLChoice = true;
    return ctx.reply(`🎯 **Custom TP/SL Configuration**

Choose what you want to configure:

1️⃣ **Enable/Disable Custom TP/SL** - Toggle custom levels
2️⃣ **Set Take Profit Levels** - Set your profit targets
3️⃣ **View Current Settings** - See your TP/SL configuration

Reply with 1, 2, or 3 to proceed:`);
  });
  
  // Handle TP/SL configuration steps
  bot.hears(/^[123]$/, async (ctx) => {
    if (!ctx.session?.awaitingTPSLChoice) return;
    
    const choice = ctx.message.text;
    ctx.session.awaitingTPSLChoice = false;
    
    switch (choice) {
      case '1':
        ctx.session.awaitingCustomTPSL = true;
        return ctx.reply(`🎯 **Enable/Disable Custom TP/SL**

When enabled, the bot will use YOUR take profit levels instead of copying sells from tracked wallets.

Send "enable" to use custom TP/SL or "disable" to follow tracked wallets:`);
        
      case '2':
        ctx.session.awaitingTPLevels = true;
        return ctx.reply(`📈 **Set Take Profit Levels**

Enter your take profit levels as percentages separated by commas.

**Example:** 50,100,200,500
This means:
• 50% = Sell when profit reaches 50%
• 100% = Sell when profit doubles (2x)
• 200% = Sell at 3x
• 500% = Sell at 6x

**Partial Selling:** You can also specify how much to sell at each level.
**Format:** percentage:amount,...
**Example:** 50:25,100:25,200:50
This means:
• At 50% profit: sell 25% of position
• At 100% profit: sell 25% of position
• At 200% profit: sell remaining 50%

Enter your TP levels:`);
        
      case '3':
        const userService = require('../../users/userService');
        const userId = String(ctx.from.id);
        const settings = await userService.getUserSettings(userId);
        const copySettings = settings?.copySettings || {};
        
        let tpDisplay = 'Not set';
        if (copySettings.takeProfit && copySettings.takeProfit.length > 0) {
          tpDisplay = copySettings.takeProfit.map(tp => {
            if (typeof tp === 'object') {
              return `${tp.percent}%: sell ${tp.amount}%`;
            }
            return `${tp}%`;
          }).join('\n• ');
        }
        
        return ctx.reply(`⚙️ **Your Current TP/SL Settings**

**Custom TP/SL:** ${copySettings.customTPSL ? '✅ Enabled' : '❌ Disabled'}
**Trailing Stop Loss:** ${copySettings.stopLossPercent || 0}%

**Take Profit Levels:**
${tpDisplay === 'Not set' ? tpDisplay : `• ${tpDisplay}`}

**How it works:**
${copySettings.customTPSL ? 
  '✅ Bot uses your custom levels and ignores tracked wallet sells' : 
  '❌ Bot copies sells from tracked wallets'}

Use /customtpsl to modify these settings.`);
        
      default:
        return ctx.reply('❌ Invalid choice. Please use /customtpsl again.');
    }
  });
}; 