// services/advancedCopyTradingEngine.js - Professional Copy Trading Engine
const { getRPCManager } = require('./rpcManager');
const { getRealTradingExecutor } = require('./realTradingExecutor');
const userService = require('../users/userService');
const walletService = require('./walletService');
const tokenDataService = require('./tokenDataService');

class AdvancedCopyTradingEngine {
  constructor() {
    this.initialized = false;
    this.rpcManager = getRPCManager();
    this.tradingExecutor = getRealTradingExecutor();
    this.monitoredWallets = new Map();
    this.copyTradeSettings = new Map();
    this.botInstance = null;
    
    // Global settings
    this.globalSettings = {
      maxConcurrentTrades: 50,
      emergencyStop: false,
      maintenanceMode: false,
      minLiquidityUSD: 10000,
      maxMarketCapUSD: 100000000,
      blacklistedTokens: new Set(),
      trustedWallets: new Set()
    };

    // Performance metrics
    this.metrics = {
      totalCopies: 0,
      successfulCopies: 0,
      failedCopies: 0,
      totalVolume: 0,
      profitLoss: 0
    };

    this.initialize();
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Advanced Copy Trading Engine...');
      
      if (!this.rpcManager.getStatus().initialized) {
        throw new Error('RPC Manager not initialized');
      }

      // Load existing settings from database
      await this.loadCopyTradeSettings();
      await this.loadMonitoredWallets();
      
      this.initialized = true;
      console.log('✅ Advanced Copy Trading Engine initialized successfully');
      console.log('🎯 Features enabled: Blind Follow, Frontrun, Smart Slippage, Multi Buy, Auto Checks');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to initialize Advanced Copy Trading Engine:', error);
      this.initialized = false;
      return { success: false, error: error.message };
    }
  }

  setBotInstance(bot) {
    this.botInstance = bot;
    console.log('🤖 Bot instance set for Advanced Copy Trading Engine');
  }

  // Load copy trade settings for all users
  async loadCopyTradeSettings() {
    try {
      const allUsers = await userService.getAllUsers();
      
      for (const [userId, userData] of Object.entries(allUsers)) {
        if (userData.copyTradeSettings) {
          this.copyTradeSettings.set(userId, {
            ...this.getDefaultCopySettings(),
            ...userData.copyTradeSettings
          });
        }
      }
      
      console.log(`📊 Loaded copy trade settings for ${this.copyTradeSettings.size} users`);
    } catch (error) {
      console.warn('Failed to load copy trade settings:', error.message);
    }
  }

  // Load monitored wallets
  async loadMonitoredWallets() {
    try {
      const allUsers = await userService.getAllUsersWithWallets();
      
      for (const [userId, userData] of Object.entries(allUsers)) {
        if (userData.wallets && userData.wallets.length > 0) {
          for (const wallet of userData.wallets) {
            this.monitoredWallets.set(wallet.toLowerCase(), {
              userId,
              wallet,
              settings: this.copyTradeSettings.get(userId) || this.getDefaultCopySettings(),
              lastActivity: 0,
              stats: {
                totalTrades: 0,
                successfulTrades: 0,
                failedTrades: 0
              }
            });
          }
        }
      }
      
      console.log(`👀 Monitoring ${this.monitoredWallets.size} wallets`);
    } catch (error) {
      console.warn('Failed to load monitored wallets:', error.message);
    }
  }

  // Get default copy trade settings
  getDefaultCopySettings() {
    return {
      // Basic settings
      enabled: true,
      blindFollow: false,
      frontrun: false,
      slippage: 5,
      smartSlippage: true,
      trackOnly: false,
      
      // Multi buy settings
      multiBuy: {
        enabled: false,
        selectedWallets: []
      },
      
      // Gas settings
      gasSettings: {
        type: 'auto', // 'auto', 'delta', 'fixed'
        delta: 5,     // For ETH/BSC - add N gwei to tracked wallet's gas
        fixed: 20     // Fixed gas price in gwei
      },
      
      // Auto buy checks
      autoBuyChecks: {
        minMarketCap: 50000,
        maxMarketCap: 10000000,
        minLiquidity: 10000,
        maxBuyTax: 10,
        maxSellTax: 10,
        honeypotCheck: true,
        rugCheck: true
      },
      
      // Buy amount settings
      buyAmount: {
        type: 'fixed', // 'fixed', 'percentage'
        value: 0.1,    // SOL/ETH/BNB amount or percentage
        maxBuyAmount: 1.0,
        buyPercentage: 100 // Max 1000% but capped by maxBuyAmount
      },
      
      // Stop orders
      stopOrders: {
        enabled: false,
        stopLossPercent: 20,
        takeProfitPercent: 100
      }
    };
  }

  // Update copy trade settings for a user
  async updateCopyTradeSettings(userId, settings) {
    try {
      const currentSettings = this.copyTradeSettings.get(userId) || this.getDefaultCopySettings();
      const updatedSettings = { ...currentSettings, ...settings };
      
      this.copyTradeSettings.set(userId, updatedSettings);
      
      // Save to database
      const userData = await userService.getUserSettings(userId);
      userData.copyTradeSettings = updatedSettings;
      await userService.saveUserData(userId, userData);
      
      // Update monitored wallets
      this.updateMonitoredWalletSettings(userId, updatedSettings);
      
      console.log(`⚙️ Updated copy trade settings for user ${userId}`);
      return { success: true };
    } catch (error) {
      console.error('Failed to update copy trade settings:', error);
      return { success: false, error: error.message };
    }
  }

  // Update settings for all monitored wallets of a user
  updateMonitoredWalletSettings(userId, settings) {
    for (const [wallet, walletData] of this.monitoredWallets.entries()) {
      if (walletData.userId === userId) {
        walletData.settings = settings;
      }
    }
  }

  // Process detected trade from wallet monitor
  async processDetectedTrade(walletAddress, tradeData) {
    try {
      if (!this.initialized || this.globalSettings.emergencyStop) {
        return { success: false, reason: 'Service not available' };
      }

      const monitoredWallet = this.monitoredWallets.get(walletAddress.toLowerCase());
      if (!monitoredWallet) {
        return { success: false, reason: 'Wallet not monitored' };
      }

      const { userId, settings } = monitoredWallet;
      
      // Check if copy trading is enabled
      if (!settings.enabled) {
        return { success: false, reason: 'Copy trading disabled for this wallet' };
      }

      // Track only mode
      if (settings.trackOnly) {
        await this.sendTradeNotification(userId, walletAddress, tradeData, 'track_only');
        return { success: true, reason: 'Track only mode - notification sent' };
      }

      // Process buy trades
      if (tradeData.type === 'buy') {
        return await this.processBuyTrade(userId, walletAddress, tradeData, settings);
      }
      
      // Process sell trades
      if (tradeData.type === 'sell') {
        return await this.processSellTrade(userId, walletAddress, tradeData, settings);
      }

      return { success: false, reason: 'Unknown trade type' };
      
    } catch (error) {
      console.error('Error processing detected trade:', error);
      return { success: false, error: error.message };
    }
  }

  // Process buy trade
  async processBuyTrade(userId, walletAddress, tradeData, settings) {
    try {
      const { tokenAddress, amount, chain, gasPrice, txHash } = tradeData;
      
      // Get token information
      const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
      if (!tokenInfo) {
        return { success: false, reason: 'Failed to get token information' };
      }

      // Auto buy eligibility checks (unless blind follow is enabled)
      if (!settings.blindFollow) {
        const eligibilityCheck = await this.checkAutoBuyEligibility(tokenInfo, settings);
        if (!eligibilityCheck.eligible) {
          await this.sendTradeNotification(userId, walletAddress, tradeData, 'rejected', eligibilityCheck.reason);
          return { success: false, reason: eligibilityCheck.reason };
        }
      }

      // Calculate buy amount
      const buyAmount = this.calculateBuyAmount(settings, amount);
      if (buyAmount <= 0) {
        return { success: false, reason: 'Invalid buy amount calculated' };
      }

      // Prepare trade parameters
      const tradeParams = {
        tokenAddress,
        amount: buyAmount,
        chain,
        slippage: this.calculateSlippage(settings, tokenInfo),
        sourceWallet: walletAddress,
        sourceTxHash: txHash,
        copyTrade: true
      };

      // Handle frontrun for ETH/BSC
      if (settings.frontrun && (chain === 'ethereum' || chain === 'bsc')) {
        tradeParams.gasPrice = this.calculateFrontrunGas(gasPrice, settings);
        tradeParams.frontrun = true;
      }

      // Execute multi buy if enabled
      if (settings.multiBuy.enabled && settings.multiBuy.selectedWallets.length > 0) {
        return await this.executeMultiBuy(userId, tradeParams, settings);
      } else {
        // Single wallet buy
        const result = await this.tradingExecutor.executeBuyOrder(userId, tradeParams);
        
        if (result.success) {
          this.metrics.successfulCopies++;
          this.metrics.totalVolume += buyAmount;
          
          await this.sendTradeNotification(userId, walletAddress, tradeData, 'executed', null, result);
        } else {
          this.metrics.failedCopies++;
          await this.sendTradeNotification(userId, walletAddress, tradeData, 'failed', result.error);
        }
        
        this.metrics.totalCopies++;
        return result;
      }
      
    } catch (error) {
      console.error('Error processing buy trade:', error);
      this.metrics.failedCopies++;
      this.metrics.totalCopies++;
      return { success: false, error: error.message };
    }
  }

  // Process sell trade
  async processSellTrade(userId, walletAddress, tradeData, settings) {
    try {
      const { tokenAddress, percentage, chain } = tradeData;
      
      // Check if user has position in this token
      const positions = await userService.getUserPositions(userId);
      const position = positions.find(p => 
        p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && 
        p.chain === chain
      );

      if (!position) {
        return { success: false, reason: 'No position found to sell' };
      }

      // Execute sell
      const tradeParams = {
        tokenAddress,
        percentage: percentage || 100,
        chain,
        slippage: settings.slippage,
        sourceWallet: walletAddress,
        copyTrade: true
      };

      const result = await this.tradingExecutor.executeSellOrder(userId, tradeParams);
      
      if (result.success) {
        this.metrics.successfulCopies++;
        this.metrics.profitLoss += result.pnl || 0;
        
        await this.sendTradeNotification(userId, walletAddress, tradeData, 'executed', null, result);
      } else {
        this.metrics.failedCopies++;
        await this.sendTradeNotification(userId, walletAddress, tradeData, 'failed', result.error);
      }
      
      this.metrics.totalCopies++;
      return result;
      
    } catch (error) {
      console.error('Error processing sell trade:', error);
      this.metrics.failedCopies++;
      this.metrics.totalCopies++;
      return { success: false, error: error.message };
    }
  }

  // Check auto buy eligibility
  async checkAutoBuyEligibility(tokenInfo, settings) {
    try {
      const checks = settings.autoBuyChecks;
      
      // Market cap check
      if (tokenInfo.marketCap) {
        if (tokenInfo.marketCap < checks.minMarketCap) {
          return { eligible: false, reason: `Market cap too low: $${tokenInfo.marketCap.toLocaleString()}` };
        }
        if (tokenInfo.marketCap > checks.maxMarketCap) {
          return { eligible: false, reason: `Market cap too high: $${tokenInfo.marketCap.toLocaleString()}` };
        }
      }

      // Liquidity check
      if (tokenInfo.liquidity && tokenInfo.liquidity < checks.minLiquidity) {
        return { eligible: false, reason: `Liquidity too low: $${tokenInfo.liquidity.toLocaleString()}` };
      }

      // Tax checks
      if (tokenInfo.buyTax && tokenInfo.buyTax > checks.maxBuyTax) {
        return { eligible: false, reason: `Buy tax too high: ${tokenInfo.buyTax}%` };
      }
      
      if (tokenInfo.sellTax && tokenInfo.sellTax > checks.maxSellTax) {
        return { eligible: false, reason: `Sell tax too high: ${tokenInfo.sellTax}%` };
      }

      // Honeypot check
      if (checks.honeypotCheck && tokenInfo.isHoneypot) {
        return { eligible: false, reason: 'Token appears to be a honeypot' };
      }

      // Global blacklist check
      if (this.globalSettings.blacklistedTokens.has(tokenInfo.address.toLowerCase())) {
        return { eligible: false, reason: 'Token is blacklisted' };
      }

      return { eligible: true };
      
    } catch (error) {
      console.warn('Auto buy eligibility check failed:', error.message);
      return { eligible: false, reason: 'Failed to validate token safety' };
    }
  }

  // Calculate buy amount based on settings
  calculateBuyAmount(settings, sourceAmount) {
    try {
      const buySettings = settings.buyAmount;
      
      if (buySettings.type === 'fixed') {
        return Math.min(buySettings.value, buySettings.maxBuyAmount);
      } else if (buySettings.type === 'percentage') {
        const calculatedAmount = sourceAmount * (buySettings.buyPercentage / 100);
        return Math.min(calculatedAmount, buySettings.maxBuyAmount);
      }
      
      return buySettings.value || 0.1;
    } catch (error) {
      console.warn('Failed to calculate buy amount:', error.message);
      return 0.1;
    }
  }

  // Calculate slippage (smart or manual)
  calculateSlippage(settings, tokenInfo) {
    try {
      if (settings.smartSlippage) {
        // Auto-adjust based on token characteristics
        let baseSlippage = settings.slippage || 5;
        
        // Increase slippage for tokens with high tax
        if (tokenInfo.buyTax) {
          baseSlippage += tokenInfo.buyTax;
        }
        
        // Increase slippage for low liquidity tokens
        if (tokenInfo.liquidity && tokenInfo.liquidity < 50000) {
          baseSlippage += 5;
        }
        
        // Cap at 50%
        return Math.min(baseSlippage, 50);
      }
      
      return settings.slippage || 5;
    } catch (error) {
      return settings.slippage || 5;
    }
  }

  // Calculate frontrun gas price
  calculateFrontrunGas(sourceGasPrice, settings) {
    try {
      const gasSettings = settings.gasSettings;
      
      if (gasSettings.type === 'delta') {
        return sourceGasPrice + gasSettings.delta;
      } else if (gasSettings.type === 'fixed') {
        return gasSettings.fixed;
      } else {
        // Auto mode - add 5 gwei to source
        return sourceGasPrice + 5;
      }
    } catch (error) {
      return sourceGasPrice + 5;
    }
  }

  // Execute multi buy across selected wallets
  async executeMultiBuy(userId, tradeParams, settings) {
    try {
      const selectedWallets = settings.multiBuy.selectedWallets;
      const results = [];
      
      console.log(`🔥 Executing multi buy across ${selectedWallets.length} wallets`);
      
      // Execute trades in parallel for speed
      const promises = selectedWallets.map(async (walletId) => {
        try {
          // Modify user ID to target specific wallet if needed
          const result = await this.tradingExecutor.executeBuyOrder(userId, {
            ...tradeParams,
            targetWallet: walletId
          });
          
          return { walletId, result };
        } catch (error) {
          return { walletId, error: error.message };
        }
      });
      
      const responses = await Promise.allSettled(promises);
      
      let successCount = 0;
      let totalVolume = 0;
      
      for (const response of responses) {
        if (response.status === 'fulfilled') {
          const { walletId, result, error } = response.value;
          
          if (result && result.success) {
            successCount++;
            totalVolume += tradeParams.amount;
            results.push({ walletId, success: true, txHash: result.txHash });
          } else {
            results.push({ walletId, success: false, error: error || result?.error });
          }
        } else {
          results.push({ walletId: 'unknown', success: false, error: response.reason });
        }
      }
      
      // Update metrics
      this.metrics.successfulCopies += successCount;
      this.metrics.failedCopies += (selectedWallets.length - successCount);
      this.metrics.totalVolume += totalVolume;
      this.metrics.totalCopies += selectedWallets.length;
      
      return {
        success: successCount > 0,
        multiBuy: true,
        successCount,
        totalAttempts: selectedWallets.length,
        results,
        totalVolume
      };
      
    } catch (error) {
      console.error('Multi buy execution error:', error);
      return { success: false, error: error.message };
    }
  }

  // Send trade notification to user
  async sendTradeNotification(userId, sourceWallet, tradeData, status, reason = null, result = null) {
    try {
      if (!this.botInstance) return;
      
      const statusEmojis = {
        track_only: '👀',
        rejected: '❌',
        failed: '💥',
        executed: tradeData.type === 'buy' ? '🟢' : '🔴'
      };
      
      const emoji = statusEmojis[status] || '📊';
      const walletDisplay = `${sourceWallet.substring(0, 8)}...${sourceWallet.substring(sourceWallet.length - 6)}`;
      
      let message = `${emoji} **Copy Trade ${status.toUpperCase()}**\n\n`;
      message += `👤 **Wallet:** \`${walletDisplay}\`\n`;
      message += `🎯 **Token:** ${tradeData.tokenSymbol || 'Unknown'}\n`;
      message += `💰 **Type:** ${tradeData.type.toUpperCase()}\n`;
      message += `🌐 **Chain:** ${tradeData.chain.toUpperCase()}\n\n`;
      
      if (status === 'executed' && result) {
        if (tradeData.type === 'buy') {
          message += `🪙 **Tokens Received:** ${result.tokensReceived?.toFixed(4) || 'Unknown'}\n`;
          message += `💵 **Price:** $${result.executedPrice?.toFixed(8) || 'Unknown'}\n`;
          message += `⛽ **${result.feeDisplay || 'Fee applied'}**\n`;
          message += `📝 **TX:** \`${result.txHash}\`\n`;
        } else {
          const pnlEmoji = result.pnl >= 0 ? '🟢' : '🔴';
          message += `💰 **Received:** ${result.nativeReceived?.toFixed(6) || 'Unknown'}\n`;
          message += `${pnlEmoji} **PnL:** ${result.pnl >= 0 ? '+' : ''}${result.pnlPercentage?.toFixed(2) || 0}%\n`;
          message += `⛽ **${result.feeDisplay || 'Fee applied'}**\n`;
          message += `📝 **TX:** \`${result.txHash}\`\n`;
        }
      }
      
      if (reason) {
        message += `\n📝 **Reason:** ${reason}`;
      }
      
      message += `\n⏰ **Time:** ${new Date().toLocaleString()}`;
      
      await this.botInstance.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.warn('Failed to send trade notification:', error.message);
    }
  }

  // Add wallet to monitoring
  async addMonitoredWallet(userId, walletAddress) {
    try {
      const wallet = walletAddress.toLowerCase();
      
      if (this.monitoredWallets.has(wallet)) {
        return { success: false, reason: 'Wallet already monitored' };
      }
      
      const settings = this.copyTradeSettings.get(userId) || this.getDefaultCopySettings();
      
      this.monitoredWallets.set(wallet, {
        userId,
        wallet: walletAddress,
        settings,
        lastActivity: 0,
        stats: {
          totalTrades: 0,
          successfulTrades: 0,
          failedTrades: 0
        }
      });
      
      console.log(`👀 Added wallet ${walletAddress} to monitoring for user ${userId}`);
      return { success: true };
      
    } catch (error) {
      console.error('Failed to add monitored wallet:', error);
      return { success: false, error: error.message };
    }
  }

  // Remove wallet from monitoring
  removeMonitoredWallet(walletAddress) {
    const wallet = walletAddress.toLowerCase();
    const removed = this.monitoredWallets.delete(wallet);
    
    if (removed) {
      console.log(`🗑️ Removed wallet ${walletAddress} from monitoring`);
    }
    
    return removed;
  }

  // Get copy trade settings for user
  getCopyTradeSettings(userId) {
    return this.copyTradeSettings.get(userId) || this.getDefaultCopySettings();
  }

  // Get engine statistics
  getStats() {
    return {
      initialized: this.initialized,
      monitoredWallets: this.monitoredWallets.size,
      usersWithSettings: this.copyTradeSettings.size,
      metrics: this.metrics,
      globalSettings: this.globalSettings,
      tradingExecutorStatus: this.tradingExecutor.isHealthy() ? 'healthy' : 'unhealthy'
    };
  }

  // Emergency stop
  setEmergencyStop(enabled) {
    this.globalSettings.emergencyStop = enabled;
    console.log(`🚨 Emergency stop ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  // Health check
  isHealthy() {
    return this.initialized && 
           this.rpcManager.getStatus().initialized && 
           this.tradingExecutor.isHealthy() &&
           !this.globalSettings.emergencyStop;
  }
}

// Singleton instance
let copyTradingEngine = null;

function getAdvancedCopyTradingEngine() {
  if (!copyTradingEngine) {
    copyTradingEngine = new AdvancedCopyTradingEngine();
  }
  return copyTradingEngine;
}

module.exports = {
  getAdvancedCopyTradingEngine,
  AdvancedCopyTradingEngine
}; 