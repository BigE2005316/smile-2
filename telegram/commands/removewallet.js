const userService = require('../../users/userService');

module.exports = function(bot) {
  // Step 1: user issues /removewallet
  bot.command('removewallet', async (ctx) => {
      const userId = String(ctx.from.id);

      try {
      const settings = await userService.getUserSettings(userId);
      
      if (!settings || !settings.wallets || settings.wallets.length === 0) {
        return ctx.reply('❌ No wallets found to remove. Add a wallet first with /addwallet');
      }
      
      const walletsList = settings.wallets
        .map((w, i) => `${i + 1}. ${w.substring(0, 8)}...${w.substring(w.length - 8)}`)
        .join('\n');
      
      ctx.session = ctx.session || {};
      ctx.session.awaitingRemoveWallet = true;
      ctx.session.userWallets = settings.wallets;
      
      return ctx.reply(`🗑️ Select a wallet to remove by sending its number:\n\n${walletsList}\n\nOr type /cancel to exit.`);
      
      } catch (err) {
      console.error("❌ Error fetching wallets:", err);
      return ctx.reply("❌ Failed to fetch wallets. Please try again.");
    }
  });
};
