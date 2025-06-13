# 🔐 Admin Guide - For Emmanuel Only

## ✅ Your Bot is LIVE!
- **Bot**: [@Emmanuel_sniper_bot](https://t.me/Emmanuel_sniper_bot)
- **Status**: 🟢 Running (PID: 40765)
- **Admin ID**: 5290841278 (YOUR Telegram ID)

## 💰 Your Dev Fee System
**Current Fee**: 3% (changeable with `/setdevfee`)

**Your Wallets**:
- **Solana**: `4mow4nhmJ1CjmtAN5k51LNojGRNkxzFo8faqT8u9oLuW`
- **ETH/Base**: `0xe04204B36Bd4B47EBCE3408F8009Ea6A40036f69`
- **BSC**: `0xe04204B36Bd4B47EBCE3408F8009Ea6A40036f69`

## 🎯 Quick Admin Commands

### In Telegram, send these to your bot:

1. **`/admin`** - Opens your secret admin panel
2. **`/viewfees`** - Check collected fees
3. **`/users`** - See all users and stats
4. **`/globalstats`** - Trading volume and profits
5. **`/broadcast <message>`** - Message all users
6. **`/setdevfee 5`** - Change fee to 5% (example)

## 🚀 Managing Your Bot

### Start the bot:
```bash
npm start
```

### Stop the bot:
```bash
# Press Ctrl+C in the terminal
# OR
pkill -f "node index.js"
```

### View live logs:
```bash
npm start 2>&1 | tee bot.log
```

### Check if running:
```bash
ps aux | grep "node index.js"
```

## 🔒 Security Notes

1. **NEVER share your `.env` file** - it has your admin credentials
2. **Only YOU can see admin commands** - they're invisible to other users
3. **Dev fees are automatically tracked** - check anytime with `/viewfees`
4. **Your admin wallet addresses are hardcoded** for each chain

## 📊 What Happens with Each Trade

When users trade through your bot:
1. Bot monitors the transaction
2. Calculates 3% dev fee
3. Tracks it in your admin stats
4. Shows user their amount (after fee)
5. You can view all fees with `/viewfees`

## 💡 Pro Tips

- Change dev fee anytime: `/setdevfee 2.5` (for 2.5%)
- Ban problematic users: `/banuser <userId>`
- Check specific user: `/userinfo <userId>`
- Emergency broadcast: `/broadcast ⚠️ Important message`

---

**Remember**: You're the only one who can access these admin features. Regular users don't even know they exist!

Bot is running perfectly! Head to [@Emmanuel_sniper_bot](https://t.me/Emmanuel_sniper_bot) and type `/admin` to see your control panel. 🎉 