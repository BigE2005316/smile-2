const userService = require('../../users/userService');

module.exports = function(bot) {
  // Step 1: user issues /setlimit
  bot.command('setlimit', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingDailyLimit = true;
    return ctx.reply('🛡️ Enter your daily spending limit (e.g., 1.0 for 1 SOL/ETH/BNB per day):');
  });
};
