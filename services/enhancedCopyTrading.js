// services/enhancedCopyTrading.js - Enhanced Copy Trading with Advanced Features
const userService = require('../users/userService');
const tokenDataService = require('./tokenDataService');
const { getAdvancedEngine } = require('./advancedTradingEngine');

class EnhancedCopyTradingService {
  constructor() {
    this.tradeMonitors = new Map();
    this.rugDetectionCache = new Map();
    this.frontrunQueue = new Map();
    
    // Default copy trading settings
    this.defaultSettings = {
      blindFollow: false,
      frontrun: false,
      smartSlippage: true,
      trackOnly: false,
      multiBuy: true,
      gasPrice: null,
      gasDelta: null,
      slippage: 5,
      autoBuyChecks: {
        minMC: 10000,
        maxMC: 100000000,
        minLiquidity: 5000,
        buyTaxLimit: 10,
        sellTaxLimit: 10
      },
      maxBuyAmount: 1000,
      buyPercentage: 100, // Can go up to 1000%
      enabled: true
    };
  }

  // Get copy trading settings for a specific wallet
  async getWalletCopySettings(userId, walletAddress) {
    try {
      const userData = await userService.getUserSettings(userId);
      const trackingSettings = userData.trackingSettings || {};
      const walletSettings = trackingSettings[walletAddress] || {};
      
      return {
        ...this.defaultSettings,
        ...walletSettings
      };
    } catch (err) {
      console.error('Error getting wallet copy settings:', err);
      return this.defaultSettings;
    }
  }

  // Update copy trading settings for a specific wallet
  async updateWalletCopySettings(userId, walletAddress, newSettings) {
    try {
      const userData = await userService.getUserSettings(userId);
      if (!userData.trackingSettings) {
        userData.trackingSettings = {};
      }
      
      userData.trackingSettings[walletAddress] = {
        ...(userData.trackingSettings[walletAddress] || {}),
        ...newSettings
      };
      
      await userService.saveUserData(userId, userData);
      return userData.trackingSettings[walletAddress];
    } catch (err) {
      console.error('Error updating wallet copy settings:', err);
      throw err;
    }
  }

  // Process copy trade with enhanced features
  async processCopyTrade(userId, tradeData, sourceWallet) {
    try {
      const walletSettings = await this.getWalletCopySettings(userId, sourceWallet);
      
      // Check if trading is enabled for this wallet
      if (!walletSettings.enabled || walletSettings.trackOnly) {
        if (walletSettings.trackOnly) {
          await this.sendTokenReport(userId, tradeData);
        }
        return { success: false, reason: 'Trading disabled or track-only mode' };
      }

      // Multi-buy check
      if (!walletSettings.multiBuy) {
        return { success: false, reason: 'Multi-buy disabled for this wallet' };
      }

      // Blind follow vs safety checks
      if (!walletSettings.blindFollow) {
        const safetyCheck = await this.performSafetyChecks(tradeData);
        if (!safetyCheck.passed) {
          return { success: false, reason: 'Safety checks failed', details: safetyCheck.issues };
        }
      }

      // Auto-buy eligibility checks
      const autoBuyCheck = await this.performAutoBuyChecks(tradeData, walletSettings.autoBuyChecks);
      if (!autoBuyCheck.passed) {
        return { success: false, reason: 'Auto-buy checks failed', details: autoBuyCheck.issues };
      }

      // Calculate buy amount
      const buyAmount = await this.calculateBuyAmount(userId, tradeData, walletSettings);
      if (buyAmount <= 0) {
        return { success: false, reason: 'Invalid buy amount calculated' };
      }

      // Frontrun logic (ETH/BSC only)
      if (walletSettings.frontrun && ['ethereum', 'bsc'].includes(tradeData.chain)) {
        return await this.processFrontrunTrade(userId, tradeData, sourceWallet, buyAmount, walletSettings);
      }

      // Regular copy trade
      return await this.executeRegularCopyTrade(userId, tradeData, sourceWallet, buyAmount, walletSettings);

    } catch (err) {
      console.error('Enhanced copy trade error:', err);
      return { success: false, reason: 'Processing error', error: err.message };
    }
  }

  // Perform safety checks for non-blind follow
  async performSafetyChecks(tradeData) {
    const checks = {
      passed: true,
      issues: []
    };

    try {
      // Mempool origin check
      if (tradeData.mempoolOrigin && tradeData.mempoolOrigin === 'suspicious') {
        checks.passed = false;
        checks.issues.push('Suspicious mempool origin detected');
      }

      // Fake transaction detection
      if (tradeData.txVerified === false) {
        checks.passed = false;
        checks.issues.push('Transaction verification failed');
      }

      // MEV protection
      if (tradeData.mevRisk && tradeData.mevRisk > 70) {
        checks.passed = false;
        checks.issues.push('High MEV risk detected');
      }

      return checks;
    } catch (err) {
      checks.passed = false;
      checks.issues.push('Safety check error: ' + err.message);
      return checks;
    }
  }

  // Perform auto-buy checks
  async performAutoBuyChecks(tradeData, checkSettings) {
    const checks = {
      passed: true,
      issues: []
    };

    try {
      const tokenData = await tokenDataService.getTokenData(tradeData.tokenAddress, tradeData.chain);
      
      if (!tokenData) {
        checks.passed = false;
        checks.issues.push('Token data not available');
        return checks;
      }

      // Market cap checks
      if (tokenData.marketCap < checkSettings.minMC) {
        checks.passed = false;
        checks.issues.push(`Market cap too low: $${tokenData.marketCap}`);
      }

      if (tokenData.marketCap > checkSettings.maxMC) {
        checks.passed = false;
        checks.issues.push(`Market cap too high: $${tokenData.marketCap}`);
      }

      // Liquidity check
      if (tokenData.liquidity < checkSettings.minLiquidity) {
        checks.passed = false;
        checks.issues.push(`Liquidity too low: $${tokenData.liquidity}`);
      }

      // Tax checks
      if (tokenData.buyTax && tokenData.buyTax > checkSettings.buyTaxLimit) {
        checks.passed = false;
        checks.issues.push(`Buy tax too high: ${tokenData.buyTax}%`);
      }

      if (tokenData.sellTax && tokenData.sellTax > checkSettings.sellTaxLimit) {
        checks.passed = false;
        checks.issues.push(`Sell tax too high: ${tokenData.sellTax}%`);
      }

      return checks;
    } catch (err) {
      checks.passed = false;
      checks.issues.push('Auto-buy check error: ' + err.message);
      return checks;
    }
  }

  // Calculate buy amount based on settings
  async calculateBuyAmount(userId, tradeData, walletSettings) {
    try {
      const userData = await userService.getUserSettings(userId);
      let baseAmount = userData.amount || 0.1;

      // Apply buy percentage (can be up to 1000% of copied trade)
      const copiedAmount = tradeData.amount || baseAmount;
      let calculatedAmount = copiedAmount * (walletSettings.buyPercentage / 100);

      // Cap by max buy amount
      if (calculatedAmount > walletSettings.maxBuyAmount) {
        calculatedAmount = walletSettings.maxBuyAmount;
      }

      // Ensure minimum amount
      if (calculatedAmount < 0.001) {
        calculatedAmount = 0.001;
      }

      return calculatedAmount;
    } catch (err) {
      console.error('Error calculating buy amount:', err);
      return 0;
    }
  }

  // Process frontrun trade for ETH/BSC
  async processFrontrunTrade(userId, tradeData, sourceWallet, buyAmount, walletSettings) {
    try {
      // Calculate gas delta for frontrunning
      const originalGasPrice = tradeData.gasPrice || 20; // gwei
      const gasDelta = walletSettings.gasDelta || 5; // additional gwei
      const frontrunGasPrice = originalGasPrice + gasDelta;

      // Add to frontrun queue with higher gas
      const frontrunTrade = {
        userId,
        tradeData: {
          ...tradeData,
          gasPrice: frontrunGasPrice,
          frontrun: true
        },
        sourceWallet,
        buyAmount,
        timestamp: Date.now(),
        priority: frontrunGasPrice
      };

      const queueKey = `${tradeData.chain}_${tradeData.tokenAddress}`;
      if (!this.frontrunQueue.has(queueKey)) {
        this.frontrunQueue.set(queueKey, []);
      }
      
      this.frontrunQueue.get(queueKey).push(frontrunTrade);
      
      // Process frontrun queue (sort by priority)
      await this.processFrontrunQueue(queueKey);

      return { success: true, type: 'frontrun', gasPrice: frontrunGasPrice };
    } catch (err) {
      console.error('Frontrun processing error:', err);
      return { success: false, reason: 'Frontrun failed', error: err.message };
    }
  }

  // Process frontrun queue
  async processFrontrunQueue(queueKey) {
    const queue = this.frontrunQueue.get(queueKey) || [];
    if (queue.length === 0) return;

    // Sort by gas price (highest first)
    queue.sort((a, b) => b.priority - a.priority);

    // Process highest priority trade first
    const trade = queue.shift();
    
    try {
      const result = await this.executeRegularCopyTrade(
        trade.userId,
        trade.tradeData,
        trade.sourceWallet,
        trade.buyAmount,
        { frontrun: true }
      );

      console.log(`Frontrun trade executed: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    } catch (err) {
      console.error('Frontrun execution error:', err);
    }

    // Update queue
    if (queue.length > 0) {
      this.frontrunQueue.set(queueKey, queue);
    } else {
      this.frontrunQueue.delete(queueKey);
    }
  }

  // Execute regular copy trade
  async executeRegularCopyTrade(userId, tradeData, sourceWallet, buyAmount, walletSettings) {
    try {
      // Simulate trade execution
      const result = {
        success: true,
        txHash: 'SIMULATED_' + Date.now(),
        buyAmount,
        tokenAddress: tradeData.tokenAddress,
        chain: tradeData.chain,
        gasUsed: walletSettings.frontrun ? 'HIGH_PRIORITY' : 'NORMAL',
        timestamp: new Date().toISOString()
      };

      // Spawn trade monitor
      await this.spawnTradeMonitor(userId, tradeData.tokenAddress, tradeData.chain);

      // Update user positions
      await userService.addPosition(
        userId,
        tradeData.tokenAddress,
        buyAmount * 0.97, // After fees
        tradeData.tokenPrice || 0,
        sourceWallet
      );

      return result;
    } catch (err) {
      console.error('Copy trade execution error:', err);
      return { success: false, reason: 'Execution failed', error: err.message };
    }
  }

  // Spawn trade monitor
  async spawnTradeMonitor(userId, tokenAddress, chain) {
    try {
      const monitorKey = `${userId}_${tokenAddress}`;
      
      if (this.tradeMonitors.has(monitorKey)) {
        return; // Monitor already exists
      }

      const monitor = {
        userId,
        tokenAddress,
        chain,
        startTime: Date.now(),
        lastUpdate: Date.now(),
        priceAlerts: true,
        rugDetection: true,
        pnlTracking: true
      };

      this.tradeMonitors.set(monitorKey, monitor);

      // Send initial token report
      await this.sendTokenReport(userId, { tokenAddress, chain });

      console.log(`Trade monitor spawned for ${tokenAddress} (User: ${userId})`);
    } catch (err) {
      console.error('Error spawning trade monitor:', err);
    }
  }

  // Send token report
  async sendTokenReport(userId, tradeData) {
    try {
      const tokenData = await tokenDataService.getTokenData(tradeData.tokenAddress, tradeData.chain);
      if (!tokenData) return;

      let report = `📊 **Token Report - ${tokenData.symbol}**\n\n`;
      report += `💰 **Price:** $${tokenData.priceUsd.toFixed(6)}\n`;
      report += `📈 **Market Cap:** $${tokenDataService.formatNumber(tokenData.marketCap)}\n`;
      report += `🌊 **Liquidity:** $${tokenDataService.formatNumber(tokenData.liquidity)}\n`;
      report += `📊 **24h Volume:** $${tokenDataService.formatNumber(tokenData.volume24h)}\n`;
      report += `🔄 **24h Change:** ${tokenData.priceChange24h.toFixed(2)}%\n\n`;
      report += `🔗 **Contract:** \`${tokenData.address}\`\n`;
      report += `⛓️ **Chain:** ${tradeData.chain.toUpperCase()}`;

      // This would send via the bot - implementation depends on bot instance access
      console.log(`Token report for user ${userId}: ${tokenData.symbol}`);
    } catch (err) {
      console.error('Error sending token report:', err);
    }
  }

  // Get trade monitor status
  getTradeMonitorStatus(userId, tokenAddress) {
    const monitorKey = `${userId}_${tokenAddress}`;
    return this.tradeMonitors.get(monitorKey) || null;
  }

  // Stop trade monitor
  stopTradeMonitor(userId, tokenAddress) {
    const monitorKey = `${userId}_${tokenAddress}`;
    const monitor = this.tradeMonitors.get(monitorKey);
    
    if (monitor) {
      this.tradeMonitors.delete(monitorKey);
      console.log(`Trade monitor stopped for ${tokenAddress} (User: ${userId})`);
      return true;
    }
    
    return false;
  }

  // Clean up expired monitors
  cleanupExpiredMonitors() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [key, monitor] of this.tradeMonitors.entries()) {
      if (now - monitor.lastUpdate > maxAge) {
        this.tradeMonitors.delete(key);
        console.log(`Cleaned up expired monitor: ${key}`);
      }
    }
  }
}

// Export singleton
let enhancedCopyInstance = null;

module.exports = {
  getEnhancedCopyService: () => {
    if (!enhancedCopyInstance) {
      enhancedCopyInstance = new EnhancedCopyTradingService();
      // Start cleanup interval
      setInterval(() => enhancedCopyInstance.cleanupExpiredMonitors(), 3600000); // Every hour
    }
    return enhancedCopyInstance;
  },
  EnhancedCopyTradingService
}; 