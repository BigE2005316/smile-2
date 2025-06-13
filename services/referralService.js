// services/referralService.js - Advanced Referral System
const userService = require('../users/userService');
const { getAdminService } = require('./adminService');

class ReferralService {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      stickyCommission: 25, // 25%
      quickBuyCommission: 25, // 25%
      minReferrals: 1,
      cookieDuration: 7776000000, // 90 days in milliseconds
      trackingPeriod: 1209600000 // 14 days for active user tracking
    };
    
    this.referralCache = new Map();
    this.botUsername = process.env.BOT_USERNAME || 'E_sniper_bot';
  }

  // Generate unique referral code for user
  generateReferralCode(userId) {
    // Create a unique code based on user ID and timestamp
    const timestamp = Date.now().toString(36);
    const userHash = Buffer.from(String(userId)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
    return `${userHash}${timestamp}`.toLowerCase();
  }

  // Get or create referral data for user
  async getUserReferralData(userId) {
    try {
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.referral) {
        // Initialize referral data
        userData.referral = {
          code: this.generateReferralCode(userId),
          referred: [],
          totalEarned: 0,
          totalCommission: 0,
          stats: {
            totalReferrals: 0,
            activeReferrals: 0,
            referralsByChain: {},
            earningsByChain: {},
            lastUpdate: new Date().toISOString()
          },
          settings: {
            ...this.defaultSettings
          }
        };
        
        await userService.saveUserData(userId, userData);
      }
      
      return userData.referral;
    } catch (err) {
      console.error('Failed to get referral data:', err);
      throw err;
    }
  }

  // Generate sticky referral link
  async generateStickyLink(userId) {
    const referralData = await this.getUserReferralData(userId);
    const referralCode = referralData.code;
    
    return `https://t.me/${this.botUsername}?start=ref_${referralCode}`;
  }

  // Generate quick-buy referral link
  async generateQuickBuyLink(userId, tokenAddress, chain, amount = null) {
    const referralData = await this.getUserReferralData(userId);
    const referralCode = referralData.code;
    
    let quickBuyData = `qb_${referralCode}_${chain}_${tokenAddress}`;
    if (amount) {
      quickBuyData += `_${amount}`;
    }
    
    return `https://t.me/${this.botUsername}?start=${quickBuyData}`;
  }

  // Process referral when new user starts with referral code
  async processReferral(newUserId, referralCode, source = 'sticky') {
    try {
      // Find the referrer by code
      const allUsers = await userService.getAllUsers();
      let referrerId = null;
      
      for (const user of allUsers) {
        if (user.referral && user.referral.code === referralCode) {
          referrerId = user.id || user.userId;
          break;
        }
      }
      
      if (!referrerId || referrerId === newUserId) {
        return { success: false, message: 'Invalid referral code' };
      }
      
      // Get referrer data
      const referrerData = await userService.getUserSettings(referrerId);
      if (!referrerData.referral) {
        return { success: false, message: 'Referrer not found' };
      }
      
      // Check if user was already referred
      const existingRef = referrerData.referral.referred.find(r => r.userId === newUserId);
      if (existingRef) {
        return { success: false, message: 'User already referred' };
      }
      
      // Add referral
      const referralEntry = {
        userId: newUserId,
        timestamp: new Date().toISOString(),
        source,
        totalCommissionEarned: 0,
        tradesCount: 0,
        lastActive: new Date().toISOString()
      };
      
      referrerData.referral.referred.push(referralEntry);
      referrerData.referral.stats.totalReferrals++;
      
      await userService.saveUserData(referrerId, referrerData);
      
      // Set referrer info for new user
      const newUserData = await userService.getUserSettings(newUserId);
      newUserData.referredBy = {
        referrerId,
        code: referralCode,
        timestamp: new Date().toISOString(),
        source
      };
      
      await userService.saveUserData(newUserId, newUserData);
      
      return {
        success: true,
        message: `✅ Referral processed: ${newUserId} referred by ${referrerId}`,
        referrerId,
        source
      };
      
    } catch (err) {
      console.error('Failed to process referral:', err);
      return { success: false, message: 'Failed to process referral' };
    }
  }

  // Record commission for referrer when referred user makes a trade
  async recordCommission(traderId, tradeAmount, tradeFee, chain) {
    try {
      const traderData = await userService.getUserSettings(traderId);
      
      if (!traderData.referredBy) {
        return { success: false, message: 'User not referred' };
      }
      
      const referrerId = traderData.referredBy.referrerId;
      const referrerData = await userService.getUserSettings(referrerId);
      
      if (!referrerData.referral) {
        return { success: false, message: 'Referrer data not found' };
      }
      
      // Calculate commission
      const adminService = getAdminService();
      const adminSettings = await adminService.getAdminSettings();
      const commissionRate = adminSettings.referral?.commission || this.defaultSettings.stickyCommission;
      
      const commission = tradeFee * (commissionRate / 100);
      
      // Update referrer's earnings
      referrerData.referral.totalEarned += commission;
      referrerData.referral.totalCommission += commission;
      
      // Update chain-specific stats
      if (!referrerData.referral.stats.earningsByChain[chain]) {
        referrerData.referral.stats.earningsByChain[chain] = 0;
      }
      referrerData.referral.stats.earningsByChain[chain] += commission;
      
      // Update referred user stats
      const referredUser = referrerData.referral.referred.find(r => r.userId === traderId);
      if (referredUser) {
        referredUser.totalCommissionEarned += commission;
        referredUser.tradesCount++;
        referredUser.lastActive = new Date().toISOString();
      }
      
      await userService.saveUserData(referrerId, referrerData);
      
      return {
        success: true,
        commission,
        referrerId,
        message: `Commission recorded: $${commission.toFixed(4)}`
      };
      
    } catch (err) {
      console.error('Failed to record commission:', err);
      return { success: false, message: 'Failed to record commission' };
    }
  }

  // Get referral statistics for user
  async getReferralStats(userId) {
    try {
      const referralData = await this.getUserReferralData(userId);
      const now = Date.now();
      const twoWeeksAgo = now - this.defaultSettings.trackingPeriod;
      
      // Calculate active referrals (active in last 2 weeks)
      let activeReferrals = 0;
      let referralsByChain = {};
      
      for (const referred of referralData.referred) {
        const lastActive = new Date(referred.lastActive).getTime();
        if (lastActive > twoWeeksAgo) {
          activeReferrals++;
        }
        
        // Get referred user's chain preference
        try {
          const refUserData = await userService.getUserSettings(referred.userId);
          const chain = refUserData.chain || 'unknown';
          referralsByChain[chain] = (referralsByChain[chain] || 0) + 1;
        } catch (err) {
          // Skip if user data not found
        }
      }
      
      // Update stats
      referralData.stats.activeReferrals = activeReferrals;
      referralData.stats.referralsByChain = referralsByChain;
      referralData.stats.lastUpdate = new Date().toISOString();
      
      // Save updated stats
      const userData = await userService.getUserSettings(userId);
      userData.referral = referralData;
      await userService.saveUserData(userId, userData);
      
      return {
        code: referralData.code,
        totalReferrals: referralData.stats.totalReferrals,
        activeReferrals,
        totalEarned: referralData.totalEarned,
        totalCommission: referralData.totalCommission,
        referralsByChain,
        earningsByChain: referralData.stats.earningsByChain || {},
        stickyLink: await this.generateStickyLink(userId),
        lastUpdate: referralData.stats.lastUpdate
      };
      
    } catch (err) {
      console.error('Failed to get referral stats:', err);
      throw err;
    }
  }

  // Generate referral dashboard
  async generateReferralDashboard(userId) {
    try {
      const stats = await this.getReferralStats(userId);
      
      let dashboard = `💎 **My Bot Referral Dashboard**\n\n`;
      
      // Overview
      dashboard += `📊 **Overview**\n`;
      dashboard += `• Total Referrals: ${stats.totalReferrals}\n`;
      dashboard += `• Active (2 weeks): ${stats.activeReferrals}\n`;
      dashboard += `• Total Earned: $${stats.totalEarned.toFixed(4)}\n`;
      dashboard += `• Commission Rate: ${this.defaultSettings.stickyCommission}%\n\n`;
      
      // Referral Code & Links
      dashboard += `🔗 **Your Referral Links**\n`;
      dashboard += `• **Sticky Link:** \`${stats.stickyLink}\`\n`;
      dashboard += `• **Referral Code:** \`${stats.code}\`\n\n`;
      
      // Quick-Buy Generator
      dashboard += `⚡ **Quick-Buy Generator**\n`;
      dashboard += `Use /quickbuy <token_address> to generate instant buy links\n\n`;
      
      // Chain Breakdown
      if (Object.keys(stats.referralsByChain).length > 0) {
        dashboard += `⛓️ **Referrals by Chain**\n`;
        Object.entries(stats.referralsByChain).forEach(([chain, count]) => {
          dashboard += `• ${chain.toUpperCase()}: ${count}\n`;
        });
        dashboard += `\n`;
      }
      
      // Earnings Breakdown
      if (Object.keys(stats.earningsByChain).length > 0) {
        dashboard += `💰 **Earnings by Chain**\n`;
        Object.entries(stats.earningsByChain).forEach(([chain, amount]) => {
          dashboard += `• ${chain.toUpperCase()}: $${amount.toFixed(4)}\n`;
        });
        dashboard += `\n`;
      }
      
      // Instructions
      dashboard += `📝 **How to Earn**\n`;
      dashboard += `1. Share your sticky link with friends\n`;
      dashboard += `2. Generate quick-buy links for hot tokens\n`;
      dashboard += `3. Earn ${this.defaultSettings.stickyCommission}% commission on all trades\n`;
      dashboard += `4. Track earnings in real-time\n\n`;
      
      dashboard += `🕐 Last updated: ${new Date(stats.lastUpdate).toLocaleString()}`;
      
      return dashboard;
    } catch (err) {
      console.error('Failed to generate referral dashboard:', err);
      return '❌ Failed to load referral dashboard';
    }
  }

  // Get leaderboard of top referrers
  async getReferralLeaderboard(limit = 10) {
    try {
      const allUsers = await userService.getAllUsers();
      const referrers = [];
      
      for (const user of allUsers) {
        if (user.referral && user.referral.stats.totalReferrals > 0) {
          referrers.push({
            userId: user.id || user.userId,
            username: user.username || 'Anonymous',
            totalReferrals: user.referral.stats.totalReferrals,
            activeReferrals: user.referral.stats.activeReferrals || 0,
            totalEarned: user.referral.totalEarned || 0
          });
        }
      }
      
      // Sort by total earned, then by total referrals
      referrers.sort((a, b) => {
        if (b.totalEarned !== a.totalEarned) {
          return b.totalEarned - a.totalEarned;
        }
        return b.totalReferrals - a.totalReferrals;
      });
      
      return referrers.slice(0, limit);
    } catch (err) {
      console.error('Failed to get referral leaderboard:', err);
      return [];
    }
  }

  // Clean up expired referral cache
  cleanupCache() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [key, data] of this.referralCache.entries()) {
      if (now - data.timestamp > maxAge) {
        this.referralCache.delete(key);
      }
    }
  }
}

// Export singleton
let referralInstance = null;

module.exports = {
  getReferralService: () => {
    if (!referralInstance) {
      referralInstance = new ReferralService();
      // Start cache cleanup interval
      setInterval(() => referralInstance.cleanupCache(), 3600000); // Every hour
    }
    return referralInstance;
  },
  ReferralService
}; 