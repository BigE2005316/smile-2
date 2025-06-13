module.exports = function(bot) {
  bot.command('copysells', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingCopySells = true;
    return ctx.reply(`🔄 **Copy Sells Configuration**

When enabled, the bot will automatically sell proportionally when tracked wallets sell their positions.

**How it works:**
• Target wallet sells 10% of BONK → You sell 10% of BONK bought via copy trade
• Only affects tokens bought through copy trading
• Your manual holdings remain untouched

**Options:**
• Enable - Automatic proportional selling
• Disable - Manual selling only

Send "enable" or "disable":`);
  });
}; 