const userService = require('../../users/userService');

module.exports = function(bot) {
  // Step 1: user issues /stoploss
  bot.command('stoploss', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingStopLoss = true;
    return ctx.reply('🛑 Enable or disable stop-loss protection?\n\nSend "enable" or "disable" (or type /cancel to exit):');
  });
}; 