// telegram/commands/selltargets.js
const userService = require('../../users/userService');

module.exports = function(bot) {
  // Step 1: user issues /selltargets
  bot.command('selltargets', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingSellTargets = true;
    return ctx.reply('🎯 Enter your profit targets separated by commas (e.g., 2x,5x,10x):');
  });
};
