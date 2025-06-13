// telegram/commands/setchain.js
module.exports = function (bot) {
  bot.command('setchain', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingChain = true;
    return ctx.reply('🔗 Which blockchain do you want to use?\n\nSend: "solana", "ethereum", or "bsc"');
  });
};