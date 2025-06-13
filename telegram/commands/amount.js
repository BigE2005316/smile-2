// telegram/commands/amount.js
module.exports = function (bot) {
  // /amount command – start the flow
  bot.command('amount', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingAmount = true;
    return ctx.reply('💰 Enter the amount to trade per transaction (e.g., 0.1 for 0.1 SOL/ETH/BNB):');
  });
};
