// telegram/commands/start.js
const { setChain, setAmount, setDailyLimit, setSellTargets, addWallet } = require('../../users/userService');
const referralService = require('../../services/referralService');

module.exports = function(bot) {
  bot.command('start', async (ctx) => {
    const userId = String(ctx.from.id);
    const username = ctx.from.username || 'User';
    
    // Check for referral code
    const startPayload = ctx.message.text.split(' ')[1];
    if (startPayload && startPayload.startsWith('REF')) {
      const referralResult = await referralService.registerReferral(userId, startPayload);
      
      if (referralResult) {
        // Send notification to referrer
        try {
          await bot.telegram.sendMessage(referralResult.referrerId, 
            `🎉 New referral joined!\n\nYou'll earn ${referralResult.commission}% commission from their trading fees.\n\nKeep sharing your referral link!`
          );
        } catch (err) {
          console.error('Failed to notify referrer:', err);
        }
      }
    }
    
    const welcomeMessage = `🚀 **Welcome to Smile Sniper Bot!** @${username}

Your ultimate multi-chain copy trading companion with advanced features that outperform gmgn.ai!

🔥 **Key Features:**
• 🔄 Advanced copy trading from any wallet
• 🎯 Per-wallet controls (start/pause/stop)
• 📝 Custom wallet naming
• 💼 Built-in custodial wallets
• 📊 Real-time trade notifications
• 🎯 Trailing stop-loss protection
• 💰 Custom TP/SL levels
• 🛡️ Anti-MEV protection
• 💸 Referral program

📌 **Quick Start:**
1. Set your chain: /setchain
2. Get your wallet: /wallet
3. Add wallets to track: /addwallet
4. Configure settings: /settings

🆕 **New Commands:**
• /namewallet - Name your wallets
• /begin - Start copying from a wallet
• /pause - Pause a wallet temporarily
• /stop - Stop tracking a wallet
• /walletstatus - View all wallet status

Type /help to see all commands and start your trading journey!

${startPayload && startPayload.startsWith('REF') ? '\n✅ You joined through a referral link!' : ''}`;

    return ctx.reply(welcomeMessage, { parse_mode: 'Markdown' });
  });
};
