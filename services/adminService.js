// services/adminService.js - Advanced Admin Management
const userService = require('../users/userService');
const { getAdvancedEngine } = require('./advancedTradingEngine');

class AdminService {
  constructor() {
    this.adminSettings = {
      txFees: {
        default: 3, // 3%
        buy: 3,
        sell: 3,
        manual: 3,
        copy: 3
      },
      features: {
        autoApprove: false,
        autoBuy: true,
        degenMode: false,
        duplicateBuyProtection: true,
        rugDetection: true,
        priceImpactAlerts: true,
        tradeSimulation: true,
        smartSlippage: true,
        autoTrack: true
      },
      limits: {
        dailyTradeLimit: 1000, // $1000
        maxTradeSize: 100, // $100 per trade
        minTradeSize: 1, // $1 per trade
        maxSlippage: 50, // 50%
        maxPriceImpact: 75 // 75%
      },
      referral: {
        enabled: true,
        commission: 25, // 25%
        stickyEnabled: true,
        quickBuyEnabled: true,
        minReferrals: 1
      },
      security: {
        maxFailedAttempts: 5,
        lockoutDuration: 900000, // 15 minutes
        requireConfirmation: true,
        adminOnlyCommands: [
          'setdevfee', 'setadminwallet', 'viewfees', 'users', 
          'broadcast', 'globalstats', 'botstatus', 'userinfo',
          'emergencystop', 'updatefeatures', 'systemhealth'
        ]
      }
    };
  }

  // Check if user is admin
  isAdmin(userId) {
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    return adminId && String(userId) === String(adminId);
  }

  // Get admin settings
  async getAdminSettings() {
    try {
      const adminData = await userService.getAdminData();
      return {
        ...this.adminSettings,
        ...(adminData.settings || {})
      };
    } catch (err) {
      return this.adminSettings;
    }
  }

  // Update admin settings
  async updateAdminSettings(newSettings) {
    try {
      const adminData = await userService.getAdminData();
      adminData.settings = {
        ...(adminData.settings || {}),
        ...newSettings
      };
      await userService.saveAdminData(adminData);
      
      // Update environment variables for TX fees
      if (newSettings.txFees) {
        process.env.DEV_FEE_PERCENT = String(newSettings.txFees.default || 3);
      }
      
      return adminData.settings;
    } catch (err) {
      console.error('Failed to update admin settings:', err);
      throw err;
    }
  }

  // Set TX fee for specific operation type
  async setTxFee(type, feePercent) {
    const settings = await this.getAdminSettings();
    
    if (!settings.txFees) settings.txFees = { ...this.adminSettings.txFees };
    
    const validTypes = ['default', 'buy', 'sell', 'manual', 'copy'];
    if (!validTypes.includes(type)) {
      throw new Error(`Invalid fee type. Valid types: ${validTypes.join(', ')}`);
    }
    
    if (feePercent < 0 || feePercent > 10) {
      throw new Error('Fee must be between 0% and 10%');
    }
    
    settings.txFees[type] = feePercent;
    
    await this.updateAdminSettings({ txFees: settings.txFees });
    
    return {
      success: true,
      message: `✅ ${type} TX fee set to ${feePercent}%`,
      fees: settings.txFees
    };
  }

  // Toggle feature on/off
  async toggleFeature(featureName, enabled) {
    const settings = await this.getAdminSettings();
    
    if (!settings.features) settings.features = { ...this.adminSettings.features };
    
    const validFeatures = Object.keys(this.adminSettings.features);
    if (!validFeatures.includes(featureName)) {
      throw new Error(`Invalid feature. Valid features: ${validFeatures.join(', ')}`);
    }
    
    settings.features[featureName] = Boolean(enabled);
    
    await this.updateAdminSettings({ features: settings.features });
    
    return {
      success: true,
      message: `✅ ${featureName} ${enabled ? 'enabled' : 'disabled'}`,
      features: settings.features
    };
  }

  // Get system statistics
  async getSystemStats() {
    try {
      const adminData = await userService.getAdminData();
      const allUsers = await userService.getAllUsers();
      
      const stats = {
        users: {
          total: allUsers.length,
          active24h: 0,
          activeWeek: 0,
          newToday: 0
        },
        trades: {
          total: adminData.totalTrades || 0,
          today: adminData.tradesToday || 0,
          volume24h: adminData.volume24h || 0,
          totalVolume: adminData.totalVolume || 0
        },
        fees: {
          collected24h: adminData.feesCollected24h || 0,
          totalCollected: adminData.totalFeesCollected || 0,
          pendingWithdraw: adminData.pendingWithdraw || 0
        },
        system: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development'
        }
      };
      
      // Calculate active users
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      const oneDayAgoDate = new Date(oneDayAgo).toDateString();
      
      for (const user of allUsers) {
        const lastActive = new Date(user.lastActive || 0).getTime();
        const createdAt = new Date(user.createdAt || 0).getTime();
        
        if (lastActive > oneDayAgo) stats.users.active24h++;
        if (lastActive > oneWeekAgo) stats.users.activeWeek++;
        if (createdAt > oneDayAgo) stats.users.newToday++;
      }
      
      return stats;
    } catch (err) {
      console.error('Failed to get system stats:', err);
      throw err;
    }
  }

  // Get user information (admin only)
  async getUserInfo(userId) {
    try {
      const userData = await userService.getUserSettings(userId);
      if (!userData) {
        throw new Error('User not found');
      }
      
      const stats = userData.stats || {};
      const wallets = userData.custodialWallets || {};
      const positions = userData.positions || {};
      
      return {
        userId: userData.id || userId,
        username: userData.username || 'Unknown',
        createdAt: userData.createdAt || 'Unknown',
        lastActive: userData.lastActive || 'Never',
        chain: userData.chain || 'Not set',
        wallets: Object.keys(wallets),
        stats: {
          totalTrades: stats.totalTrades || 0,
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          totalPnL: stats.totalPnL || 0,
          totalVolume: stats.totalVolume || 0
        },
        positions: Object.keys(positions).length,
        trackedWallets: (userData.trackedWallets || []).length,
        settings: {
          amount: userData.amount || 0,
          slippage: userData.slippage || 5,
          sellTargets: userData.sellTargets || [],
          autoApprove: userData.autoApprove || false
        }
      };
    } catch (err) {
      console.error('Failed to get user info:', err);
      throw err;
    }
  }

  // Broadcast message to all users
  async broadcastMessage(message, targetType = 'all') {
    try {
      const allUsers = await userService.getAllUsers();
      let sentCount = 0;
      let errorCount = 0;
      
      for (const user of allUsers) {
        try {
          // Filter based on target type
          if (targetType === 'active') {
            const lastActive = new Date(user.lastActive || 0).getTime();
            const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
            if (lastActive < oneDayAgo) continue;
          } else if (targetType === 'traders') {
            const stats = user.stats || {};
            if ((stats.totalTrades || 0) === 0) continue;
          }
          
          // Note: Actual message sending would be implemented in bot service
          // This just tracks the eligible users
          sentCount++;
        } catch (err) {
          errorCount++;
        }
      }
      
      return {
        success: true,
        sentCount,
        errorCount,
        totalUsers: allUsers.length,
        message: `📢 Broadcast prepared for ${sentCount} users`
      };
    } catch (err) {
      console.error('Failed to prepare broadcast:', err);
      throw err;
    }
  }

  // Emergency stop - disable all trading
  async emergencyStop(reason = 'Emergency maintenance') {
    try {
      await this.updateAdminSettings({
        emergencyMode: {
          enabled: true,
          reason,
          timestamp: new Date().toISOString()
        },
        features: {
          ...this.adminSettings.features,
          autoBuy: false,
          autoApprove: false,
          autoTrack: false
        }
      });
      
      return {
        success: true,
        message: `🚨 Emergency stop activated: ${reason}`
      };
    } catch (err) {
      console.error('Failed to activate emergency stop:', err);
      throw err;
    }
  }

  // Disable emergency mode
  async disableEmergencyMode() {
    try {
      const settings = await this.getAdminSettings();
      delete settings.emergencyMode;
      
      await this.updateAdminSettings(settings);
      
      return {
        success: true,
        message: '✅ Emergency mode disabled'
      };
    } catch (err) {
      console.error('Failed to disable emergency mode:', err);
      throw err;
    }
  }

  // Get formatted admin dashboard
  async getAdminDashboard() {
    try {
      const settings = await this.getAdminSettings();
      const stats = await this.getSystemStats();
      
      let dashboard = `🔧 **My Bot Admin Dashboard**\n\n`;
      
      // System Status
      dashboard += `📊 **System Status**\n`;
      dashboard += `• Uptime: ${Math.floor(stats.system.uptime / 3600)}h ${Math.floor((stats.system.uptime % 3600) / 60)}m\n`;
      dashboard += `• Users: ${stats.users.total} (${stats.users.active24h} active)\n`;
      dashboard += `• Trades Today: ${stats.trades.today}\n`;
      dashboard += `• Volume 24h: $${stats.trades.volume24h.toLocaleString()}\n\n`;
      
      // TX Fees
      dashboard += `💰 **TX Fees**\n`;
      dashboard += `• Default: ${settings.txFees?.default || 3}%\n`;
      dashboard += `• Buy: ${settings.txFees?.buy || 3}%\n`;
      dashboard += `• Sell: ${settings.txFees?.sell || 3}%\n`;
      dashboard += `• Manual: ${settings.txFees?.manual || 3}%\n\n`;
      
      // Features Status
      dashboard += `⚙️ **Features**\n`;
      const features = settings.features || {};
      Object.entries(features).forEach(([name, enabled]) => {
        dashboard += `• ${name}: ${enabled ? '✅' : '❌'}\n`;
      });
      
      dashboard += `\n🔧 **Admin Commands:**\n`;
      dashboard += `• /setfee <type> <percent> - Set TX fees\n`;
      dashboard += `• /toggle <feature> - Toggle features\n`;
      dashboard += `• /users - View user stats\n`;
      dashboard += `• /broadcast <message> - Send to all users\n`;
      dashboard += `• /emergency - Emergency stop\n`;
      dashboard += `• /userinfo <id> - Get user details\n`;
      
      return dashboard;
    } catch (err) {
      console.error('Failed to generate admin dashboard:', err);
      return '❌ Failed to load admin dashboard';
    }
  }

  // Format TX fee display (e.g., "TX fee - 0003" for 3%)
  formatTxFee(feePercent) {
    const feeString = String(Math.round(feePercent * 100)).padStart(4, '0');
    return `TX fee - ${feeString}`;
  }

  // Validate admin command access
  validateAdminAccess(userId, command) {
    if (!this.isAdmin(userId)) {
      throw new Error('❌ Unauthorized: Admin access required');
    }
    
    const settings = this.adminSettings;
    if (settings.security.adminOnlyCommands.includes(command.toLowerCase())) {
      return true;
    }
    
    return false;
  }
}

// Export singleton
let adminInstance = null;

module.exports = {
  getAdminService: () => {
    if (!adminInstance) {
      adminInstance = new AdminService();
    }
    return adminInstance;
  },
  AdminService
}; 