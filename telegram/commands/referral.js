const { Composer } = require('telegraf');
const { getReferralService } = require('../../services/referralService');
const userService = require('../../users/userService');

const referral = new Composer();

// Main referral dashboard
referral.command('referral', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const referralService = getReferralService();
    const dashboard = await referralService.generateReferralDashboard(userId);
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔗 Copy Sticky Link', callback_data: `copy_referral_${userId}` },
          { text: '⚡ Generate Quick-Buy', callback_data: `quickbuy_gen_${userId}` }
        ],
        [
          { text: '📊 View Stats', callback_data: `referral_stats_${userId}` },
          { text: '🏆 Leaderboard', callback_data: `referral_leaderboard` }
        ],
        [
          { text: '🔄 Refresh', callback_data: `referral_refresh_${userId}` }
        ]
      ]
    };
    
    await ctx.reply(dashboard, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (err) {
    console.error('Referral dashboard error:', err);
    await ctx.reply('❌ Failed to load referral dashboard');
  }
});

// Generate quick-buy link
referral.command('quickbuy', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      return ctx.reply(`⚡ **Quick-Buy Link Generator**

**Usage:**
• \`/quickbuy <token_address>\` - Generate instant buy link
• \`/quickbuy <token_address> <amount>\` - With specific amount

**Examples:**
• \`/quickbuy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
• \`/quickbuy EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v 0.5\`

Users clicking your link will instantly buy the token with your referral code attached!`, { parse_mode: 'Markdown' });
    }
    
    const tokenAddress = args[0];
    const amount = args[1] ? parseFloat(args[1]) : null;
    const userData = await userService.getUserSettings(userId);
    const chain = userData.chain || 'solana';
    
    // Validate token address
    if (!isValidTokenAddress(tokenAddress, chain)) {
      return ctx.reply('❌ Invalid token address format for ' + chain.toUpperCase());
    }
    
    const referralService = getReferralService();
    const quickBuyLink = await referralService.generateQuickBuyLink(userId, tokenAddress, chain, amount);
    
    let message = `⚡ **Quick-Buy Link Generated**\n\n`;
    message += `🎯 **Token:** \`${tokenAddress}\`\n`;
    if (amount) {
      message += `💰 **Amount:** ${amount} ${chain === 'solana' ? 'SOL' : 'ETH'}\n`;
    }
    message += `⛓️ **Chain:** ${chain.toUpperCase()}\n\n`;
    
    message += `🔗 **Your Quick-Buy Link:**\n`;
    message += `\`${quickBuyLink}\`\n\n`;
    
    message += `📈 **How it works:**\n`;
    message += `• Share this link anywhere\n`;
    message += `• Users click and instantly buy the token\n`;
    message += `• You earn 25% commission on all trades\n`;
    message += `• Link never expires!`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 Copy Link', callback_data: `copy_quickbuy_${userId}` },
          { text: '📤 Share', url: `https://t.me/share/url?url=${encodeURIComponent(quickBuyLink)}` }
        ]
      ]
    };
    
    // Store the link for copying
    ctx.session.quickBuyLink = quickBuyLink;
    
    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (err) {
    console.error('Quick-buy generation error:', err);
    await ctx.reply('❌ Error generating quick-buy link');
  }
});

// Referral statistics
referral.command('mystats', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const referralService = getReferralService();
    const stats = await referralService.getReferralStats(userId);
    
    let message = `📊 **Your Referral Statistics**\n\n`;
    
    message += `🔢 **Overview:**\n`;
    message += `• Total Referrals: ${stats.totalReferrals}\n`;
    message += `• Active (2 weeks): ${stats.activeReferrals}\n`;
    message += `• Referral Code: \`${stats.code}\`\n\n`;
    
    message += `💰 **Earnings:**\n`;
    message += `• Total Earned: $${stats.totalEarned.toFixed(4)}\n`;
    message += `• Total Commission: $${stats.totalCommission.toFixed(4)}\n\n`;
    
    // Chain breakdown
    if (Object.keys(stats.referralsByChain).length > 0) {
      message += `⛓️ **Referrals by Chain:**\n`;
      Object.entries(stats.referralsByChain).forEach(([chain, count]) => {
        message += `• ${chain.toUpperCase()}: ${count}\n`;
      });
      message += `\n`;
    }
    
    // Earnings breakdown
    if (Object.keys(stats.earningsByChain).length > 0) {
      message += `💸 **Earnings by Chain:**\n`;
      Object.entries(stats.earningsByChain).forEach(([chain, amount]) => {
        message += `• ${chain.toUpperCase()}: $${amount.toFixed(4)}\n`;
      });
      message += `\n`;
    }
    
    message += `🔗 **Your Links:**\n`;
    message += `• Sticky: \`${stats.stickyLink}\`\n\n`;
    
    message += `🕐 Last updated: ${new Date(stats.lastUpdate).toLocaleString()}`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Referral stats error:', err);
    await ctx.reply('❌ Failed to get referral statistics');
  }
});

// Referral leaderboard (public)
referral.command('leaderboard', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const referralService = getReferralService();
    const leaderboard = await referralService.getReferralLeaderboard(10);
    
    let message = `🏆 **Referral Leaderboard**\n\n`;
    
    if (leaderboard.length === 0) {
      message += 'No referral data available yet.\n\n';
      message += '🚀 Be the first to start earning commissions!\nUse /referral to get your links.';
    } else {
      leaderboard.forEach((referrer, index) => {
        const rank = index + 1;
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
        
        message += `${emoji} **#${rank} ${referrer.username}**\n`;
        message += `• Referrals: ${referrer.totalReferrals} (${referrer.activeReferrals} active)\n`;
        message += `• Earned: $${referrer.totalEarned.toFixed(4)}\n\n`;
      });
      
      message += `🔥 Think you can make it to the top?\nStart referring with /referral!`;
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Leaderboard error:', err);
    await ctx.reply('❌ Failed to load leaderboard');
  }
});

// Process start commands with referral codes
referral.action(/^start_(.+)$/, async (ctx) => {
  try {
    const startParam = ctx.match[1];
    const userId = ctx.from.id;
    
    // Check if it's a referral code
    if (startParam.startsWith('ref_')) {
      const referralCode = startParam.replace('ref_', '');
      const referralService = getReferralService();
      
      const result = await referralService.processReferral(userId, referralCode, 'sticky');
      
      if (result.success) {
        await ctx.reply(`🎉 **Welcome to My Bot!**\n\n✅ You've been referred by a friend!\n\n🎁 **Benefits:**\n• Priority support\n• Exclusive features\n• Community access\n\nLet's get you started with /help!`, { parse_mode: 'Markdown' });
      }
    } else if (startParam.startsWith('qb_')) {
      // Quick-buy referral
      const parts = startParam.split('_');
      if (parts.length >= 4) {
        const referralCode = parts[1];
        const chain = parts[2];
        const tokenAddress = parts[3];
        const amount = parts[4] ? parseFloat(parts[4]) : null;
        
        const referralService = getReferralService();
        await referralService.processReferral(userId, referralCode, 'quickbuy');
        
        // Set user chain and trigger quick buy
        const userData = await userService.getUserSettings(userId);
        userData.chain = chain;
        await userService.saveUserData(userId, userData);
        
        let message = `⚡ **Quick-Buy Ready!**\n\n`;
        message += `🎯 **Token:** \`${tokenAddress}\`\n`;
        message += `⛓️ **Chain:** ${chain.toUpperCase()}\n`;
        if (amount) {
          message += `💰 **Amount:** ${amount}\n`;
        }
        
        const keyboard = {
          inline_keyboard: [
            [
              { text: '🚀 Buy Now', callback_data: `quickbuy_${tokenAddress}_${amount || 'default'}` },
              { text: '📊 Analyze First', callback_data: `analyze_${tokenAddress}` }
            ],
            [
              { text: '❌ Cancel', callback_data: 'cancel_quickbuy' }
            ]
          ]
        };
        
        await ctx.reply(message, { 
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      }
    }
    
  } catch (err) {
    console.error('Start referral processing error:', err);
  }
});

// Helper function
function isValidTokenAddress(address, chain) {
  if (chain === 'solana') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  } else if (['ethereum', 'bsc', 'arbitrum', 'polygon', 'base'].includes(chain)) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  return false;
}

module.exports = referral; 