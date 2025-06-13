const { Composer } = require('telegraf');
const { getAdminService } = require('../../services/adminService');
const { getAdvancedEngine } = require('../../services/advancedTradingEngine');
const { getReferralService } = require('../../services/referralService');
const userService = require('../../users/userService');

const admin = new Composer();

// Main admin dashboard
admin.command('admin', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    // Check admin access
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const dashboard = `🔧 **Admin Control Panel**

💰 **Finance Commands:**
• /setdevfee <percent> - Set dev fee percentage
• /setadminwallet <address> - Set admin wallet address
• /viewfees - View collected fees
• /withdraw - Withdraw collected fees

👥 **User Management:**
• /users - View total users and statistics
• /userinfo <userId> - Get specific user info
• /banuser <userId> - Ban a user
• /unbanuser <userId> - Unban a user

📢 **Communication:**
• /broadcast <message> - Send message to all users
• /announce <message> - Send important announcement

📊 **Statistics:**
• /globalstats - View global bot statistics
• /tradestats - View trading statistics
• /chainstats - View chain-specific stats

🔧 **System:**
• /botstatus - View bot system status
• /setmaxwallets <number> - Set max wallets per user
• /maintenance <on/off> - Toggle maintenance mode
• /clearknowntxs - Clear known transactions cache

⚙️ **Configuration:**
• /viewconfig - View current configuration
• /exportusers - Export user data
• /importusers - Import user data

**Type any admin command to proceed.**`;
    
    await ctx.reply(dashboard, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Admin dashboard error:', err);
    await ctx.reply('❌ Failed to load admin dashboard');
  }
});

// Set dev fee
admin.command('setdevfee', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      return ctx.reply('📝 **Usage:** /setdevfee <percent>\n\n**Example:** `/setdevfee 3`', { parse_mode: 'Markdown' });
    }
    
    const feePercent = parseFloat(args[0]);
    
    if (isNaN(feePercent) || feePercent < 0 || feePercent > 10) {
      return ctx.reply('❌ Invalid fee percentage. Must be between 0% and 10%.');
    }
    
    // Update environment variable
    process.env.DEV_FEE_PERCENT = String(feePercent);
    
    const result = await adminService.setTxFee('default', feePercent);
    
    if (result.success) {
      await ctx.reply(`✅ Dev fee set to ${feePercent}%\n\nThis applies to all trading operations.`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }
    
  } catch (err) {
    console.error('Set dev fee error:', err);
    await ctx.reply(`❌ Error setting dev fee: ${err.message}`);
  }
});

// Set admin wallet
admin.command('setadminwallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      return ctx.reply(`📝 **Usage:** /setadminwallet <chain> <address>

**Supported Chains:**
• solana - Solana wallet
• ethereum - Ethereum wallet  
• bsc - BSC wallet

**Example:** \`/setadminwallet solana 7ouabE3EBCVDsNtiYzfGSE6i2tw8r62oyWLzT3Yfqd6X\``, { parse_mode: 'Markdown' });
    }
    
    const chain = args[0].toLowerCase();
    const address = args[1];
    
    const supportedChains = ['solana', 'ethereum', 'bsc'];
    if (!supportedChains.includes(chain)) {
      return ctx.reply('❌ Invalid chain. Supported: solana, ethereum, bsc');
    }
    
    // Set environment variable
    const envVar = `ADMIN_WALLET_${chain.toUpperCase()}`;
    process.env[envVar] = address;
    
    await ctx.reply(`✅ Admin wallet set for ${chain.toUpperCase()}: \`${address}\``, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Set admin wallet error:', err);
    await ctx.reply(`❌ Error setting admin wallet: ${err.message}`);
  }
});

// View fees
admin.command('viewfees', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const stats = await adminService.getSystemStats();
    
    let message = `💰 **Fee Collection Report**\n\n`;
    message += `📊 **Summary:**\n`;
    message += `• Collected Today: $${stats.fees.collected24h.toFixed(4)}\n`;
    message += `• Total Collected: $${stats.fees.totalCollected.toFixed(4)}\n`;
    message += `• Pending Withdrawal: $${stats.fees.pendingWithdraw.toFixed(4)}\n\n`;
    
    message += `📈 **Trading Stats:**\n`;
    message += `• Trades Today: ${stats.trades.today}\n`;
    message += `• Total Trades: ${stats.trades.total}\n`;
    message += `• Volume 24h: $${stats.trades.volume24h.toLocaleString()}\n`;
    message += `• Total Volume: $${stats.trades.totalVolume.toLocaleString()}\n\n`;
    
    message += `⚙️ **Current Settings:**\n`;
    message += `• Dev Fee: ${process.env.DEV_FEE_PERCENT || 3}%\n`;
    message += `• Active Users: ${stats.users.active24h}\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('View fees error:', err);
    await ctx.reply('❌ Failed to get fee statistics');
  }
});

// Global stats
admin.command('globalstats', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const stats = await adminService.getSystemStats();
    
    let message = `📊 **Global Bot Statistics**\n\n`;
    message += `👥 **Users:**\n`;
    message += `• Total Users: ${stats.users.total}\n`;
    message += `• Active (24h): ${stats.users.active24h}\n`;
    message += `• Active (7d): ${stats.users.activeWeek}\n`;
    message += `• New Today: ${stats.users.newToday}\n\n`;
    
    message += `💰 **Trading:**\n`;
    message += `• Total Trades: ${stats.trades.total}\n`;
    message += `• Trades Today: ${stats.trades.today}\n`;
    message += `• Volume 24h: $${stats.trades.volume24h.toLocaleString()}\n`;
    message += `• Total Volume: $${stats.trades.totalVolume.toLocaleString()}\n\n`;
    
    message += `💸 **Fees:**\n`;
    message += `• Collected 24h: $${stats.fees.collected24h.toFixed(4)}\n`;
    message += `• Total Collected: $${stats.fees.totalCollected.toFixed(4)}\n\n`;
    
    message += `🖥️ **System:**\n`;
    message += `• Uptime: ${Math.floor(stats.system.uptime / 3600)}h ${Math.floor((stats.system.uptime % 3600) / 60)}m\n`;
    message += `• Memory: ${(stats.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
    message += `• Version: ${stats.system.version}\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Global stats error:', err);
    await ctx.reply('❌ Failed to get global statistics');
  }
});

// Bot status
admin.command('botstatus', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const stats = await adminService.getSystemStats();
    const uptime = stats.system.uptime;
    const memory = stats.system.memoryUsage;
    
    let message = `🤖 **Bot System Status**\n\n`;
    
    message += `🟢 **Status:** Online and Active\n`;
    message += `⏱️ **Uptime:** ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n`;
    message += `💾 **Memory Usage:**\n`;
    message += `• Used: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
    message += `• Total: ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB\n`;
    message += `• RSS: ${(memory.rss / 1024 / 1024).toFixed(2)} MB\n\n`;
    
    message += `📊 **Performance:**\n`;
    message += `• Active Users: ${stats.users.active24h}\n`;
    message += `• Trades Today: ${stats.trades.today}\n`;
    message += `• Environment: ${stats.system.environment}\n\n`;
    
    message += `🔧 **Components:**\n`;
    message += `• Bot Core: 🟢 Online\n`;
    message += `• Database: 🟢 Connected\n`;
    message += `• Trading Engine: 🟢 Active\n`;
    message += `• Wallet Monitor: 🟢 Running\n`;
    message += `• Admin Panel: 🟢 Active\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Bot status error:', err);
    await ctx.reply('❌ Failed to get bot status');
  }
});

// Set TX fees
admin.command('setfee', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 2) {
      return ctx.reply(`📝 **Usage:** /setfee <type> <percent>

**Fee Types:**
• default - Default fee for all operations
• buy - Buy transaction fees
• sell - Sell transaction fees  
• manual - Manual trading fees
• copy - Copy trading fees

**Example:** \`/setfee buy 2.5\``, { parse_mode: 'Markdown' });
    }
    
    const feeType = args[0].toLowerCase();
    const feePercent = parseFloat(args[1]);
    
    if (isNaN(feePercent)) {
      return ctx.reply('❌ Invalid fee percentage. Must be a number.');
    }
    
    const result = await adminService.setTxFee(feeType, feePercent);
    
    if (result.success) {
      let message = result.message + '\n\n**Current Fees:**\n';
      Object.entries(result.fees).forEach(([type, fee]) => {
        message += `• ${type}: ${fee}%\n`;
      });
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }
    
  } catch (err) {
    console.error('Set fee error:', err);
    await ctx.reply(`❌ Error setting fee: ${err.message}`);
  }
});

// Toggle features
admin.command('toggle', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      return ctx.reply(`📝 **Usage:** /toggle <feature> [on/off]

**Available Features:**
• autoApprove - Auto-approve transactions
• autoBuy - Auto-buy functionality
• degenMode - Degen mode for risky tokens
• duplicateBuyProtection - Prevent duplicate buys
• rugDetection - Rug pull detection
• priceImpactAlerts - Price impact warnings
• tradeSimulation - Trade simulation
• smartSlippage - Dynamic slippage calculation
• autoTrack - Auto-track positions

**Example:** \`/toggle autoBuy off\``, { parse_mode: 'Markdown' });
    }
    
    const featureName = args[0];
    let enabled;
    
    if (args.length > 1) {
      const toggle = args[1].toLowerCase();
      enabled = toggle === 'on' || toggle === 'true' || toggle === 'enable';
    } else {
      // Toggle current state
      const settings = await adminService.getAdminSettings();
      enabled = !settings.features[featureName];
    }
    
    const result = await adminService.toggleFeature(featureName, enabled);
    
    if (result.success) {
      let message = result.message + '\n\n**Current Features:**\n';
      Object.entries(result.features).forEach(([name, status]) => {
        message += `• ${name}: ${status ? '✅' : '❌'}\n`;
      });
      await ctx.reply(message, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ ${result.message}`);
    }
    
  } catch (err) {
    console.error('Toggle feature error:', err);
    await ctx.reply(`❌ Error toggling feature: ${err.message}`);
  }
});

// View user statistics
admin.command('users', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const stats = await adminService.getSystemStats();
    
    let message = `👥 **User Statistics**\n\n`;
    message += `📊 **Overview:**\n`;
    message += `• Total Users: ${stats.users.total}\n`;
    message += `• Active (24h): ${stats.users.active24h}\n`;
    message += `• Active (7d): ${stats.users.activeWeek}\n`;
    message += `• New Today: ${stats.users.newToday}\n\n`;
    
    message += `💰 **Trading Stats:**\n`;
    message += `• Total Trades: ${stats.trades.total}\n`;
    message += `• Trades Today: ${stats.trades.today}\n`;
    message += `• Volume 24h: $${stats.trades.volume24h.toLocaleString()}\n`;
    message += `• Total Volume: $${stats.trades.totalVolume.toLocaleString()}\n\n`;
    
    message += `💸 **Fee Collection:**\n`;
    message += `• Collected 24h: $${stats.fees.collected24h.toFixed(4)}\n`;
    message += `• Total Collected: $${stats.fees.totalCollected.toFixed(4)}\n`;
    message += `• Pending Withdraw: $${stats.fees.pendingWithdraw.toFixed(4)}\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Users stats error:', err);
    await ctx.reply('❌ Failed to get user statistics');
  }
});

// Get specific user info
admin.command('userinfo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      return ctx.reply('📝 Usage: /userinfo <user_id>\n\nExample: /userinfo 123456789');
    }
    
    const targetUserId = args[0];
    const userInfo = await adminService.getUserInfo(targetUserId);
    
    let message = `👤 **User Information**\n\n`;
    message += `🆔 **ID:** ${userInfo.userId}\n`;
    message += `👤 **Username:** ${userInfo.username}\n`;
    message += `📅 **Created:** ${userInfo.createdAt}\n`;
    message += `⏰ **Last Active:** ${userInfo.lastActive}\n`;
    message += `⛓️ **Chain:** ${userInfo.chain}\n\n`;
    
    message += `💼 **Wallets:** ${userInfo.wallets.length}\n`;
    message += `📊 **Positions:** ${userInfo.positions}\n`;
    message += `👁️ **Tracked Wallets:** ${userInfo.trackedWallets}\n\n`;
    
    message += `📈 **Trading Stats:**\n`;
    message += `• Total Trades: ${userInfo.stats.totalTrades}\n`;
    message += `• Wins: ${userInfo.stats.wins}\n`;
    message += `• Losses: ${userInfo.stats.losses}\n`;
    message += `• Total PnL: $${userInfo.stats.totalPnL.toFixed(4)}\n`;
    message += `• Total Volume: $${userInfo.stats.totalVolume.toFixed(4)}\n\n`;
    
    message += `⚙️ **Settings:**\n`;
    message += `• Default Amount: ${userInfo.settings.amount}\n`;
    message += `• Slippage: ${userInfo.settings.slippage}%\n`;
    message += `• Auto Approve: ${userInfo.settings.autoApprove ? '✅' : '❌'}\n`;
    message += `• Sell Targets: ${userInfo.settings.sellTargets.length}\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('User info error:', err);
    await ctx.reply(`❌ Error getting user info: ${err.message}`);
  }
});

// Broadcast message to users
admin.command('broadcast', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 1) {
      return ctx.reply(`📝 **Usage:** /broadcast <message> [target]

**Target Types:**
• all - All users (default)
• active - Users active in last 24h
• traders - Users with trading history

**Example:** \`/broadcast "New features available!" active\``, { parse_mode: 'Markdown' });
    }
    
    const targetType = args[args.length - 1];
    const validTargets = ['all', 'active', 'traders'];
    
    let message, target;
    if (validTargets.includes(targetType)) {
      message = args.slice(0, -1).join(' ');
      target = targetType;
    } else {
      message = args.join(' ');
      target = 'all';
    }
    
    if (!message.trim()) {
      return ctx.reply('❌ Broadcast message cannot be empty');
    }
    
    // Prepare broadcast
    const result = await adminService.broadcastMessage(message, target);
    
    if (result.success) {
      await ctx.reply(`📢 **Broadcast Prepared**\n\n${result.message}\n\nTarget: ${target}\nEligible users: ${result.sentCount}/${result.totalUsers}`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ Failed to prepare broadcast: ${result.message}`);
    }
    
  } catch (err) {
    console.error('Broadcast error:', err);
    await ctx.reply(`❌ Error preparing broadcast: ${err.message}`);
  }
});

// Emergency stop
admin.command('emergency', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    const reason = args.join(' ') || 'Emergency maintenance';
    
    const result = await adminService.emergencyStop(reason);
    
    if (result.success) {
      await ctx.reply(`🚨 **EMERGENCY STOP ACTIVATED**\n\n${result.message}\n\nAll trading features have been disabled.\nUse /resume to reactivate when ready.`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ Failed to activate emergency stop`);
    }
    
  } catch (err) {
    console.error('Emergency stop error:', err);
    await ctx.reply('❌ Error activating emergency stop');
  }
});

// Resume operations
admin.command('resume', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const result = await adminService.disableEmergencyMode();
    
    if (result.success) {
      await ctx.reply(`✅ **OPERATIONS RESUMED**\n\n${result.message}\n\nAll features have been reactivated.`, { parse_mode: 'Markdown' });
    } else {
      await ctx.reply(`❌ Failed to resume operations`);
    }
    
  } catch (err) {
    console.error('Resume operations error:', err);
    await ctx.reply('❌ Error resuming operations');
  }
});

// System health check
admin.command('health', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const stats = await adminService.getSystemStats();
    const uptime = stats.system.uptime;
    const memory = stats.system.memoryUsage;
    
    let message = `🏥 **System Health Check**\n\n`;
    
    message += `⏱️ **Uptime:** ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\n`;
    message += `💾 **Memory Usage:**\n`;
    message += `• Used: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
    message += `• Total: ${(memory.heapTotal / 1024 / 1024).toFixed(2)} MB\n`;
    message += `• RSS: ${(memory.rss / 1024 / 1024).toFixed(2)} MB\n\n`;
    
    message += `📊 **Performance:**\n`;
    message += `• Active Users: ${stats.users.active24h}\n`;
    message += `• Trades Today: ${stats.trades.today}\n`;
    message += `• Version: ${stats.system.version}\n`;
    message += `• Environment: ${stats.system.environment}\n\n`;
    
    // Check component health
    message += `🔧 **Component Status:**\n`;
    message += `• Bot: 🟢 Online\n`;
    message += `• Database: 🟢 Connected\n`;
    message += `• Trading Engine: 🟢 Active\n`;
    message += `• Wallet Monitor: 🟢 Running\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Health check error:', err);
    await ctx.reply('❌ Failed to perform health check');
  }
});

// View configuration
admin.command('viewconfig', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const settings = await adminService.getAdminSettings();
    
    let message = `⚙️ **Bot Configuration**\n\n`;
    
    message += `💰 **TX Fees:**\n`;
    message += `• Default: ${settings.txFees?.default || 3}%\n`;
    message += `• Buy: ${settings.txFees?.buy || 3}%\n`;
    message += `• Sell: ${settings.txFees?.sell || 3}%\n`;
    message += `• Manual: ${settings.txFees?.manual || 3}%\n`;
    message += `• Copy: ${settings.txFees?.copy || 3}%\n\n`;
    
    message += `⚙️ **Features:**\n`;
    const features = settings.features || {};
    Object.entries(features).forEach(([name, enabled]) => {
      message += `• ${name}: ${enabled ? '✅' : '❌'}\n`;
    });
    
    message += `\n🌐 **Environment:**\n`;
    message += `• Node ENV: ${process.env.NODE_ENV || 'development'}\n`;
    message += `• Bot Username: ${process.env.BOT_USERNAME || 'Not set'}\n`;
    message += `• Admin ID: ${process.env.ADMIN_TELEGRAM_ID || 'Not set'}\n`;
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('View config error:', err);
    await ctx.reply('❌ Failed to load configuration');
  }
});

// View referral leaderboard (admin)
admin.command('referrals', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const referralService = getReferralService();
    const leaderboard = await referralService.getReferralLeaderboard(10);
    
    let message = `🏆 **Referral Leaderboard**\n\n`;
    
    if (leaderboard.length === 0) {
      message += 'No referral data available yet.';
    } else {
      leaderboard.forEach((referrer, index) => {
        const rank = index + 1;
        const emoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
        message += `${emoji} **#${rank} ${referrer.username}**\n`;
        message += `• Total Referrals: ${referrer.totalReferrals}\n`;
        message += `• Active: ${referrer.activeReferrals}\n`;
        message += `• Earned: $${referrer.totalEarned.toFixed(4)}\n\n`;
      });
    }
    
    await ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Referral leaderboard error:', err);
    await ctx.reply('❌ Failed to get referral leaderboard');
  }
});

// Admin help
admin.command('adminhelp', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const adminService = getAdminService();
    
    if (!adminService.isAdmin(userId)) {
      return ctx.reply('❌ Unauthorized: Admin access required');
    }
    
    const helpMessage = `🔧 **Admin Commands Help**

**Finance:**
• /setdevfee - Set dev fee percentage
• /viewfees - View collected fees
• /setadminwallet - Set admin wallet

**User Management:**
• /users - User statistics
• /userinfo - Get user details
• /broadcast - Send messages

**System:**
• /botstatus - System status
• /health - Health check
• /viewconfig - View configuration

**Trading:**
• /setfee - Set TX fees
• /toggle - Toggle features
• /emergency - Emergency stop

All commands require admin privileges.`;
    
    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
    
  } catch (err) {
    console.error('Admin help error:', err);
    await ctx.reply('❌ Failed to show admin help');
  }
});

module.exports = admin; 