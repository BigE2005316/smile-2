// services/enhancedReferralService.js - Enhanced Referral System with Fee Wallets
const userService = require('../users/userService');
const { getAdminService } = require('./adminService');

class EnhancedReferralService {
  constructor() {
    this.defaultSettings = {
      enabled: true,
      stickyCommission: 25, // 25%
      quickBuyCommission: 25, // 25%
      minReferrals: 1,
      cookieDuration: 7776000000, // 90 days in milliseconds
      trackingPeriod: 1209600000, // 14 days for active user tracking
      minWithdrawal: 10 // $10 minimum withdrawal
    };
    
    this.referralCache = new Map();
    this.volumeCache = new Map();
    this.botUsername = process.env.BOT_USERNAME || 'E_sniper_bot';
  }

  // Generate unique referral code for user
  generateReferralCode(userId) {
    const timestamp = Date.now().toString(36);
    const userHash = Buffer.from(String(userId)).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
    return `${userHash}${timestamp}`.toLowerCase();
  }

  // Get or create referral data for user
  async getUserReferralData(userId) {
    try {
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.referral) {
        userData.referral = {
          code: this.generateReferralCode(userId),
          referred: [],
          totalEarned: 0,
          totalCommission: 0,
          unpaidEarnings: 0,
          totalVolume: 0,
          stickyVolume: 0,
          quickBuyVolume: 0,
          paidEarnings: 0,
          lastWithdrawal: null,
          feeWallets: {}, // Chain-specific payout wallets
          stats: {
            totalReferrals: 0,
            activeReferrals: 0,
            referralsByChain: {},
            earningsByChain: {},
            volumeByChain: {},
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

  // Set fee wallet for specific chain
  async setFeeWallet(userId, chain, walletAddress) {
    try {
      const userData = await userService.getUserSettings(userId);
      if (!userData.referral) {
        await this.getUserReferralData(userId);
      }
      
      if (!userData.referral.feeWallets) {
        userData.referral.feeWallets = {};
      }
      
      // Validate wallet address format
      if (!this.isValidWalletAddress(walletAddress, chain)) {
        throw new Error('Invalid wallet address format for ' + chain);
      }
      
      userData.referral.feeWallets[chain] = {
        address: walletAddress,
        addedAt: new Date().toISOString(),
        verified: false
      };
      
      await userService.saveUserData(userId, userData);
      
      return {
        success: true,
        message: `✅ Fee wallet set for ${chain.toUpperCase()}: ${walletAddress}`,
        wallet: userData.referral.feeWallets[chain]
      };
    } catch (err) {
      return {
        success: false,
        message: `❌ Error setting fee wallet: ${err.message}`
      };
    }
  }

  // Get fee wallets for user
  async getFeeWallets(userId) {
    try {
      const referralData = await this.getUserReferralData(userId);
      return referralData.feeWallets || {};
    } catch (err) {
      console.error('Error getting fee wallets:', err);
      return {};
    }
  }

  // Record trading volume from referral
  async recordReferralVolume(traderId, tradeVolume, tradeType, chain) {
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
      
      // Update volume tracking
      referrerData.referral.totalVolume += tradeVolume;
      
      if (tradeType === 'sticky') {
        referrerData.referral.stickyVolume += tradeVolume;
      } else if (tradeType === 'quickbuy') {
        referrerData.referral.quickBuyVolume += tradeVolume;
      }
      
      // Update chain-specific volume
      if (!referrerData.referral.stats.volumeByChain[chain]) {
        referrerData.referral.stats.volumeByChain[chain] = 0;
      }
      referrerData.referral.stats.volumeByChain[chain] += tradeVolume;
      
      // Update referred user stats
      const referredUser = referrerData.referral.referred.find(r => r.userId === traderId);
      if (referredUser) {
        if (!referredUser.totalVolume) referredUser.totalVolume = 0;
        referredUser.totalVolume += tradeVolume;
        referredUser.lastActive = new Date().toISOString();
      }
      
      await userService.saveUserData(referrerId, referrerData);
      
      return {
        success: true,
        volumeRecorded: tradeVolume,
        totalVolume: referrerData.referral.totalVolume,
        message: `Volume recorded: $${tradeVolume.toFixed(2)}`
      };
      
    } catch (err) {
      console.error('Failed to record referral volume:', err);
      return { success: false, message: 'Failed to record volume' };
    }
  }

  // Record commission with unpaid earnings tracking
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
      
      // Update earnings tracking
      referrerData.referral.totalEarned += commission;
      referrerData.referral.totalCommission += commission;
      referrerData.referral.unpaidEarnings += commission;
      
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
        unpaidEarnings: referrerData.referral.unpaidEarnings,
        referrerId,
        message: `Commission recorded: $${commission.toFixed(4)}`
      };
      
    } catch (err) {
      console.error('Failed to record commission:', err);
      return { success: false, message: 'Failed to record commission' };
    }
  }

  // Process withdrawal request
  async processWithdrawal(userId, chain, amount) {
    try {
      const referralData = await this.getUserReferralData(userId);
      
      // Check if user has fee wallet for this chain
      if (!referralData.feeWallets || !referralData.feeWallets[chain]) {
        return {
          success: false,
          message: `❌ No fee wallet set for ${chain.toUpperCase()}. Use /feewallet to set one.`
        };
      }
      
      // Check minimum withdrawal
      if (amount < this.defaultSettings.minWithdrawal) {
        return {
          success: false,
          message: `❌ Minimum withdrawal is $${this.defaultSettings.minWithdrawal}`
        };
      }
      
      // Check if user has enough unpaid earnings
      if (amount > referralData.unpaidEarnings) {
        return {
          success: false,
          message: `❌ Insufficient unpaid earnings. Available: $${referralData.unpaidEarnings.toFixed(4)}`
        };
      }
      
      // Process withdrawal (in production, this would trigger actual payment)
      const withdrawalId = 'WD_' + Date.now();
      
      // Update earnings
      referralData.unpaidEarnings -= amount;
      referralData.paidEarnings += amount;
      referralData.lastWithdrawal = {
        id: withdrawalId,
        amount,
        chain,
        wallet: referralData.feeWallets[chain].address,
        timestamp: new Date().toISOString(),
        status: 'pending'
      };
      
      // Save updated data
      const userData = await userService.getUserSettings(userId);
      userData.referral = referralData;
      await userService.saveUserData(userId, userData);
      
      return {
        success: true,
        withdrawalId,
        amount,
        chain,
        wallet: referralData.feeWallets[chain].address,
        message: `✅ Withdrawal request submitted: $${amount.toFixed(4)} to ${chain.toUpperCase()}`
      };
      
    } catch (err) {
      console.error('Withdrawal processing error:', err);
      return {
        success: false,
        message: `❌ Withdrawal failed: ${err.message}`
      };
    }
  }

  // Generate enhanced referral dashboard with volume and earnings breakdown
  async generateEnhancedDashboard(userId) {
    try {
      const stats = await this.getReferralStats(userId);
      const feeWallets = await this.getFeeWallets(userId);
      
      let dashboard = `💎 **Enhanced Referral Dashboard**\n\n`;
      
      // Overview
      dashboard += `📊 **Overview**\n`;
      dashboard += `• Total Referrals: ${stats.totalReferrals}\n`;
      dashboard += `• Active (2 weeks): ${stats.activeReferrals}\n`;
      dashboard += `• Referral Code: \`${stats.code}\`\n\n`;
      
      // Volume Tracking
      dashboard += `📈 **Volume Metrics**\n`;
      dashboard += `• Total Volume: $${stats.totalVolume.toFixed(2)}\n`;
      dashboard += `• Sticky Link Volume: $${stats.stickyVolume.toFixed(2)}\n`;
      dashboard += `• Quick-Buy Volume: $${stats.quickBuyVolume.toFixed(2)}\n\n`;
      
      // Earnings Breakdown
      dashboard += `💰 **Earnings**\n`;
      dashboard += `• Total Earned: $${stats.totalEarned.toFixed(4)}\n`;
      dashboard += `• Unpaid Earnings: $${stats.unpaidEarnings.toFixed(4)}\n`;
      dashboard += `• Paid Earnings: $${stats.paidEarnings.toFixed(4)}\n`;
      dashboard += `• Commission Rate: ${this.defaultSettings.stickyCommission}%\n\n`;
      
      // Fee Wallets Status
      dashboard += `🏦 **Fee Wallets**\n`;
      const supportedChains = ['solana', 'ethereum', 'bsc', 'base', 'arbitrum'];
      supportedChains.forEach(chain => {
        if (feeWallets[chain]) {
          dashboard += `• ${chain.toUpperCase()}: ✅ ${feeWallets[chain].address.slice(0, 8)}...\n`;
        } else {
          dashboard += `• ${chain.toUpperCase()}: ❌ Not set\n`;
        }
      });
      dashboard += `\n`;
      
      // Chain Breakdown
      if (Object.keys(stats.volumeByChain).length > 0) {
        dashboard += `⛓️ **Volume by Chain**\n`;
        Object.entries(stats.volumeByChain).forEach(([chain, volume]) => {
          dashboard += `• ${chain.toUpperCase()}: $${volume.toFixed(2)}\n`;
        });
        dashboard += `\n`;
      }
      
      // Withdrawal Info
      if (stats.unpaidEarnings >= this.defaultSettings.minWithdrawal) {
        dashboard += `💸 **Withdrawal Available**\n`;
        dashboard += `Ready to withdraw: $${stats.unpaidEarnings.toFixed(4)}\n`;
        dashboard += `Use /withdraw <chain> <amount> to request payout\n\n`;
      } else {
        dashboard += `💸 **Withdrawal Status**\n`;
        dashboard += `Minimum for withdrawal: $${this.defaultSettings.minWithdrawal}\n`;
        dashboard += `Current unpaid: $${stats.unpaidEarnings.toFixed(4)}\n\n`;
      }
      
      // Quick Actions
      dashboard += `🔗 **Quick Actions**\n`;
      dashboard += `• /feewallet <chain> <address> - Set payout wallet\n`;
      dashboard += `• /withdraw <chain> <amount> - Request withdrawal\n`;
      dashboard += `• /quickbuy <token> - Generate quick-buy link\n`;
      dashboard += `• /mystats - Detailed statistics\n\n`;
      
      dashboard += `🕐 Last updated: ${new Date().toLocaleString()}`;
      
      return dashboard;
    } catch (err) {
      console.error('Failed to generate enhanced dashboard:', err);
      return '❌ Failed to load enhanced referral dashboard';
    }
  }

  // Enhanced stats with volume tracking
  async getReferralStats(userId) {
    try {
      const referralData = await this.getUserReferralData(userId);
      const now = Date.now();
      const twoWeeksAgo = now - this.defaultSettings.trackingPeriod;
      
      // Calculate active referrals
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
        unpaidEarnings: referralData.unpaidEarnings,
        paidEarnings: referralData.paidEarnings || 0,
        totalVolume: referralData.totalVolume || 0,
        stickyVolume: referralData.stickyVolume || 0,
        quickBuyVolume: referralData.quickBuyVolume || 0,
        referralsByChain,
        earningsByChain: referralData.stats.earningsByChain || {},
        volumeByChain: referralData.stats.volumeByChain || {},
        stickyLink: await this.generateStickyLink(userId),
        lastUpdate: referralData.stats.lastUpdate
      };
      
    } catch (err) {
      console.error('Failed to get enhanced referral stats:', err);
      throw err;
    }
  }

  // Generate sticky referral link
  async generateStickyLink(userId) {
    const referralData = await this.getUserReferralData(userId);
    const referralCode = referralData.code;
    
    return `https://t.me/${this.botUsername}?start=ref_${referralCode}`;
  }

  // Validate wallet address format
  isValidWalletAddress(address, chain) {
    if (chain === 'solana') {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    } else if (['ethereum', 'bsc', 'arbitrum', 'polygon', 'base'].includes(chain)) {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    return false;
  }

  // Clean up expired cache
  cleanupCache() {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const [key, data] of this.referralCache.entries()) {
      if (now - data.timestamp > maxAge) {
        this.referralCache.delete(key);
      }
    }
    
    for (const [key, data] of this.volumeCache.entries()) {
      if (now - data.timestamp > maxAge) {
        this.volumeCache.delete(key);
      }
    }
  }
}

// Export singleton
let enhancedReferralInstance = null;

module.exports = {
  getEnhancedReferralService: () => {
    if (!enhancedReferralInstance) {
      enhancedReferralInstance = new EnhancedReferralService();
      // Start cache cleanup interval
      setInterval(() => enhancedReferralInstance.cleanupCache(), 3600000); // Every hour
    }
    return enhancedReferralInstance;
  },
  EnhancedReferralService
}; 