module.exports = function (bot) {
  const ADMIN_ID = process.env.ADMIN_TELEGRAM_ID;

  bot.command("help", (ctx) => {
    const helpMessage = `📚 **Smile Sniper Bot Commands**

**💼 Wallet Management:**
• /wallet - View/create your trading wallet
• /balance - Check wallet balance
• /exportwallet - Export private key
• /switchwallet - Switch between chains

**🔍 Copy Trading Setup:**
• /setchain - Choose blockchain (Solana/ETH/BSC)
• /amount - Set trade amount
• /addwallet - Track a wallet
• /removewallet - Remove tracked wallet
• /namewallet - Give wallets custom names

**🎮 Wallet Controls:**
• /begin - Start copying from a wallet
• /pause - Pause trading for a wallet
• /stop - Stop trading for a wallet
• /walletstatus - View all wallet status

**💰 Manual Trading:**
• /buy - Buy tokens directly
• /sell - Sell your positions
• /quickbuy - Quick buy with presets
• /market - View market overview

**📈 Trading Features:**
• /settings - View your configuration
• /selltargets - Set profit targets
• /setlimit - Set daily spending limit
• /stoploss - Enable/disable stop-loss
• /trailingstop - Set trailing stop percentage
• /copysells - Copy sell behavior
• /customtpsl - Custom take profit levels
• /positions - View open positions

**💎 Premium Features:**
• /referral - Your referral program
• /earnings - View referral earnings
• /support - Get help from support

**🔧 Utility:**
• /cancel - Cancel any operation
• /help - Show this message

**💰 How Copy Trading Works:**
1. Add wallets to track with /addwallet
2. Name them with /namewallet (optional)
3. Use /begin to start copying trades
4. Bot executes trades on your behalf

**🎯 Trading Controls:**
• Each wallet can be controlled individually
• Pause temporarily or stop completely
• Custom names for easy management
• Real-time notifications with full token data

Need help? Use /support`;

    return ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  });
};
