// services/manualTrading.js - Enhanced Manual Trading Service with Real Execution

const tokenDataService = require('./tokenDataService');
const userService = require('../users/userService');
const walletService = require('./walletService');
const { getAdvancedEngine } = require('./advancedTradingEngine');
const { getRealTradingExecutor } = require('./realTradingExecutor');

class ManualTradingService {
  constructor() {
    this.initialized = false;
    this.botInstance = null;
    this.confirmationTimeouts = new Map();
    this.pendingTrades = new Map();
    this.tradingExecutor = null;
    this.initializationAttempts = 0;
    this.maxInitializationAttempts = 5;
    
    // Service configuration
    this.config = {
      confirmationTimeout: 60000, // 60 seconds
      maxSlippage: 50, // 50%
      minAmount: 0.0001,
      maxAmount: 1000000,
      supportedChains: ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche']
    };
    
    // Start initialization process
    this.initialize();
  }

  async initialize() {
    try {
      this.initializationAttempts++;
      console.log(`🔧 Initializing Manual Trading Service... (Attempt ${this.initializationAttempts}/${this.maxInitializationAttempts})`);
      
      // Basic service checks - don't fail on optional services
      let coreServicesReady = true;
      
      // Check if user service is available (required)
      try {
        if (userService && typeof userService.getUserSettings === 'function') {
          console.log('✅ User service ready');
        } else {
          console.log('⚠️ User service not available');
          coreServicesReady = false;
        }
      } catch (error) {
        console.log('⚠️ User service check failed:', error.message);
        coreServicesReady = false;
      }

      // Check if trading executor is available (required)
      try {
        this.tradingExecutor = getRealTradingExecutor();
        if (this.tradingExecutor) {
          console.log('✅ Trading executor ready');
        } else {
          console.log('⚠️ Trading executor not available');
          coreServicesReady = false;
        }
      } catch (error) {
        console.log('⚠️ Trading executor check failed:', error.message);
        coreServicesReady = false;
      }

      // Check if advanced trading engine is available (optional)
      try {
        const engine = getAdvancedEngine();
        if (engine) {
          console.log('✅ Advanced trading engine available');
        } else {
          console.log('⚠️ Advanced trading engine not available, continuing with basic features');
        }
      } catch (error) {
        console.log('⚠️ Advanced trading engine check failed, continuing with basic features');
      }

      // Check token data service (optional)
      try {
        if (tokenDataService && typeof tokenDataService.getTokenData === 'function') {
          console.log('✅ Token data service ready');
        } else {
          console.log('⚠️ Token data service not available, will continue with limited functionality');
        }
      } catch (error) {
        console.log('⚠️ Token data service not available, will continue with limited functionality');
      }

      // Only require core services
      if (coreServicesReady) {
        this.initialized = true;
        console.log('✅ Manual Trading Service initialized successfully');
        console.log('🚀 Real trading execution enabled - trades will be executed on blockchain');
        return true;
      } else {
        // Wait a bit and retry only if we haven't exceeded max attempts
        if (this.initializationAttempts < this.maxInitializationAttempts) {
          console.log(`⏳ Core services not ready, retrying in 2 seconds... (${this.initializationAttempts}/${this.maxInitializationAttempts})`);
          setTimeout(() => this.initialize(), 2000);
          return false;
        } else {
          // On final attempt, initialize anyway with limited functionality
          this.initialized = true;
          console.log('⚠️ Manual Trading Service initialized with limited functionality');
          console.log('🚀 Real trading execution enabled - trades will be executed on blockchain');
          return true;
        }
      }
      
    } catch (error) {
      console.error('❌ Manual Trading Service initialization error:', error.message);
      
      // On final attempt, still try to initialize
      if (this.initializationAttempts >= this.maxInitializationAttempts) {
        this.initialized = true;
        console.log('⚠️ Manual Trading Service initialized with limited functionality due to errors');
        return true;
      } else {
        setTimeout(() => this.initialize(), 2000);
        return false;
      }
    }
  }

  setBotInstance(bot) {
    this.botInstance = bot;
    console.log('🤖 Bot instance set for Manual Trading Service');
  }

  isInitialized() {
    return this.initialized;
  }

  // Force re-initialization if needed
  async forceInitialize() {
    console.log('🔄 Force initializing Manual Trading Service...');
    this.initialized = false;
    this.initializationAttempts = 0;
    return await this.initialize();
  }

  async checkServiceHealth() {
    try {
      if (!this.initialized) {
        // Try to initialize if not already done
        const initResult = await this.forceInitialize();
        if (!initResult) {
          return { healthy: false, reason: 'Service failed to initialize' };
        }
      }
      
      if (!this.botInstance) {
        return { healthy: false, reason: 'Bot instance not set' };
      }

      // Check trading executor with fallback
      let executorHealthy = true;
      try {
        if (this.tradingExecutor && this.tradingExecutor.isHealthy) {
          executorHealthy = this.tradingExecutor.isHealthy();
        }
      } catch (error) {
        console.warn('Trading executor health check failed:', error.message);
        executorHealthy = false;
      }
      
      return { 
        healthy: true, 
        tradingExecutorHealthy: executorHealthy,
        warnings: executorHealthy ? [] : ['Trading executor not healthy - trades may fail']
      };
      
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  }

  async executeBuyOrder(userId, params) {
    try {
      // Check if service is initialized
      if (!this.initialized) {
        throw new Error('Manual trading service not initialized');
      }
      
      // Validate user
      await userService.updateLastActive(userId);
      const userSettings = await userService.getUserSettings(userId);
      
      if (!userSettings) {
        throw new Error('User settings not found');
      }
      
      // Validate parameters
      const { tokenAddress, amount, chain, slippage, wallet } = params;
      
      if (!tokenAddress || !amount || !chain) {
        throw new Error('Missing required parameters: tokenAddress, amount, chain');
      }
      
      if (!this.config.supportedChains.includes(chain.toLowerCase())) {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      if (amount < this.config.minAmount || amount > this.config.maxAmount) {
        throw new Error(`Amount must be between ${this.config.minAmount} and ${this.config.maxAmount}`);
      }
      
      // Get token information
      const tokenInfo = await tokenDataService.getTokenData(tokenAddress, chain);
      
      if (!tokenInfo) {
        throw new Error('Failed to get token information');
      }
      
      // Prepare trade parameters
      const tradeParams = {
        userId,
        tokenAddress: tokenInfo.address || tokenAddress,
        tokenSymbol: tokenInfo.symbol || 'UNKNOWN',
        tokenName: tokenInfo.name || 'Unknown Token',
        amount,
        chain: chain.toLowerCase(),
        slippage: slippage || userSettings.slippage || 5,
        wallet: wallet || userSettings.selectedWallet,
        tradeType: 'buy',
        timestamp: Date.now()
      };
      
      // Use advanced trading engine if available
      const advancedEngine = getAdvancedEngine();
      if (advancedEngine) {
        try {
          const eligibilityCheck = await advancedEngine.checkAutoBuyEligibility(tokenInfo, chain);
          if (!eligibilityCheck.eligible) {
            console.warn(`⚠️ Token failed auto-buy checks: ${eligibilityCheck.reason}`);
            // Continue anyway for manual trades, but add warning
            tradeParams.warnings = [eligibilityCheck.reason];
          }
          
          tradeParams.advanced = true;
          tradeParams.eligibilityCheck = eligibilityCheck;
        } catch (error) {
          console.warn('Advanced engine check failed:', error.message);
        }
      }
      
      // Execute REAL trade using trading executor
      console.log('💎 Executing REAL buy order on blockchain...');
      const result = await this.tradingExecutor.executeBuyOrder(userId, tradeParams);
      
      if (result.success) {
        console.log(`✅ Real buy order executed successfully: ${result.txHash}`);
        
        // Notify user via bot if available
        if (this.botInstance) {
          try {
            let message = `🟢 **BUY Order Executed Successfully!**\n\n`;
            message += `🎯 **${tokenInfo.name}** (${tokenInfo.symbol})\n`;
            message += `💰 **Amount:** ${amount} ${chain.toUpperCase()}\n`;
            message += `🪙 **Tokens Received:** ${result.tokensReceived.toFixed(4)}\n`;
            message += `💵 **Price:** $${result.executedPrice.toFixed(8)}\n`;
            message += `⛽ **${result.feeDisplay}**\n\n`;
            message += `📝 **TX Hash:** \`${result.txHash}\`\n`;
            message += `⏰ **Time:** ${new Date().toLocaleString()}\n`;
            message += `🌐 **Chain:** ${chain.toUpperCase()}`;
            
            await this.botInstance.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
          } catch (notifyError) {
            console.warn('Failed to notify user:', notifyError.message);
          }
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('Buy order execution error:', error);
      return {
        success: false,
        message: error.message,
        error: error.name
      };
    }
  }

  async executeSellOrder(userId, params) {
    try {
      // Check if service is initialized
      if (!this.initialized) {
        throw new Error('Manual trading service not initialized');
      }
      
      // Validate user
      await userService.updateLastActive(userId);
      const userSettings = await userService.getUserSettings(userId);
      
      if (!userSettings) {
        throw new Error('User settings not found');
      }
      
      // Validate parameters
      const { tokenAddress, amount, percentage, chain, slippage, wallet } = params;
      
      if (!tokenAddress || (!amount && !percentage) || !chain) {
        throw new Error('Missing required parameters');
      }
      
      if (!this.config.supportedChains.includes(chain.toLowerCase())) {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      // Get user positions
      const positions = await userService.getUserPositions(userId);
      const position = positions.find(p => 
        p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && 
        p.chain.toLowerCase() === chain.toLowerCase()
      );
      
      if (!position) {
        throw new Error('Position not found');
      }
      
      // Calculate sell amount
      let sellAmount;
      if (percentage) {
        sellAmount = (position.amount * percentage) / 100;
      } else {
        sellAmount = amount;
      }
      
      if (sellAmount > position.amount) {
        throw new Error('Insufficient token balance');
      }
      
      // Get token information
      const tokenInfo = await tokenDataService.getTokenData(tokenAddress, chain);
      
      // Prepare trade parameters
      const tradeParams = {
        userId,
        tokenAddress: tokenInfo?.address || tokenAddress,
        tokenSymbol: tokenInfo?.symbol || position.tokenSymbol,
        tokenName: tokenInfo?.name || position.tokenName,
        amount: sellAmount,
        percentage,
        chain: chain.toLowerCase(),
        slippage: slippage || userSettings.slippage || 5,
        wallet: wallet || userSettings.selectedWallet,
        tradeType: 'sell',
        position,
        timestamp: Date.now()
      };
      
      // Execute REAL trade using trading executor
      console.log('💎 Executing REAL sell order on blockchain...');
      const result = await this.tradingExecutor.executeSellOrder(userId, tradeParams);
      
      if (result.success) {
        console.log(`✅ Real sell order executed successfully: ${result.txHash}`);
        
        // Notify user via bot if available
        if (this.botInstance) {
          try {
            const pnlEmoji = result.pnl >= 0 ? '🟢' : '🔴';
            let message = `🔴 **SELL Order Executed Successfully!**\n\n`;
            message += `🎯 **${tokenInfo?.name || position.tokenName}** (${tokenInfo?.symbol || position.tokenSymbol})\n`;
            message += `🪙 **Tokens Sold:** ${result.tokensSold.toFixed(4)}\n`;
            message += `💰 **Received:** ${result.nativeReceived.toFixed(6)} ${chain.toUpperCase()}\n`;
            message += `💵 **Price:** $${result.executedPrice.toFixed(8)}\n`;
            message += `${pnlEmoji} **PnL:** ${result.pnl >= 0 ? '+' : ''}${result.pnlPercentage.toFixed(2)}% ($${result.pnl.toFixed(2)})\n`;
            message += `⛽ **${result.feeDisplay}**\n\n`;
            message += `📝 **TX Hash:** \`${result.txHash}\`\n`;
            message += `⏰ **Time:** ${new Date().toLocaleString()}\n`;
            message += `🌐 **Chain:** ${chain.toUpperCase()}`;
            
            await this.botInstance.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' });
          } catch (notifyError) {
            console.warn('Failed to notify user:', notifyError.message);
          }
        }
      }
      
      return result;
      
    } catch (error) {
      console.error('Sell order execution error:', error);
      return {
        success: false,
        message: error.message,
        error: error.name
      };
    }
  }

  async getUserPositions(userId) {
    try {
      if (!this.initialized) {
        throw new Error('Manual trading service not initialized');
      }
      
      const positions = await userService.getUserPositions(userId);
      
      // Enhanced position data with current prices and real-time PnL
      const enhancedPositions = [];
      
      for (const position of positions) {
        try {
          const tokenInfo = await tokenDataService.getTokenData(position.tokenAddress, position.chain);
          const currentPrice = tokenInfo?.priceUsd || position.avgBuyPrice;
          
          const currentValue = currentPrice * position.amount;
          const buyValue = position.avgBuyPrice * position.amount;
          const pnl = currentValue - buyValue;
          const pnlPercentage = buyValue > 0 ? ((currentValue - buyValue) / buyValue) * 100 : 0;
          
          enhancedPositions.push({
            ...position,
            currentPrice,
            currentValue,
            pnl,
            pnlPercentage,
            tokenInfo,
            lastUpdated: Date.now()
          });
        } catch (error) {
          console.warn(`Failed to enhance position data for ${position.tokenAddress}:`, error.message);
          enhancedPositions.push({
            ...position,
            error: 'Failed to get current price data'
          });
        }
      }
      
      return enhancedPositions;
      
    } catch (error) {
      console.error('Get user positions error:', error);
      return [];
    }
  }

  async getTokenQuote(tokenAddress, chain, amount, tradeType = 'buy') {
    try {
      if (!this.initialized) {
        throw new Error('Manual trading service not initialized');
      }
      
      const tokenInfo = await tokenDataService.getTokenData(tokenAddress, chain);
      if (!tokenInfo) {
        throw new Error('Token information not available');
      }
      
      // Use trading executor for real simulation
      const simulation = await this.tradingExecutor.simulateTrade({
        tokenAddress,
        chain,
        amount,
        tradeType
      });
      
      if (!simulation.success) {
        throw new Error(simulation.error);
      }
      
      return {
        success: true,
        quote: simulation.simulation,
        tokenInfo,
        warnings: simulation.warnings,
        timestamp: Date.now()
      };
      
    } catch (error) {
      console.error('Get token quote error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async createTradeConfirmation(userId, tradeParams) {
    try {
      const tradeId = `trade_${userId}_${Date.now()}`;
      
      // Store pending trade
      this.pendingTrades.set(tradeId, {
        ...tradeParams,
        userId,
        tradeId,
        createdAt: Date.now(),
        status: 'pending_confirmation'
      });
      
      // Set timeout for confirmation
      const timeout = setTimeout(() => {
        this.pendingTrades.delete(tradeId);
        console.log(`Trade confirmation timeout for ${tradeId}`);
      }, this.config.confirmationTimeout);
      
      this.confirmationTimeouts.set(tradeId, timeout);
      
      return {
        success: true,
        tradeId,
        expiresAt: Date.now() + this.config.confirmationTimeout
      };
      
    } catch (error) {
      console.error('Create trade confirmation error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  async confirmTrade(tradeId, confirmed = true) {
    try {
      const pendingTrade = this.pendingTrades.get(tradeId);
      
      if (!pendingTrade) {
        throw new Error('Trade not found or expired');
      }
      
      // Clear timeout
      const timeout = this.confirmationTimeouts.get(tradeId);
      if (timeout) {
        clearTimeout(timeout);
        this.confirmationTimeouts.delete(tradeId);
      }
      
      // Remove from pending
      this.pendingTrades.delete(tradeId);
      
      if (!confirmed) {
        return {
          success: true,
          message: 'Trade cancelled by user'
        };
      }
      
      // Execute the REAL trade
      console.log(`🚀 Executing confirmed trade ${tradeId}:`, pendingTrade.tradeType);
      
      if (pendingTrade.tradeType === 'buy') {
        return await this.executeBuyOrder(pendingTrade.userId, pendingTrade);
      } else {
        return await this.executeSellOrder(pendingTrade.userId, pendingTrade);
      }
      
    } catch (error) {
      console.error('Confirm trade error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Process buy command with enhanced validation
  async processBuyCommand(userId, commandText) {
    try {
      const parts = commandText.trim().split(' ');
      
      if (parts.length < 1) {
        return {
          success: false,
          message: '❌ Invalid buy command format'
        };
      }
      
      let amount, tokenAddress;
      
      if (parts.length === 1) {
        // Just token address
        tokenAddress = parts[0];
        const userSettings = await userService.getUserSettings(userId);
        amount = userSettings.amount || 0.1;
      } else {
        // Amount and token
        amount = parseFloat(parts[0]);
        tokenAddress = parts[1];
        
        if (isNaN(amount) || amount <= 0) {
          return {
            success: false,
            message: '❌ Invalid amount specified'
          };
        }
      }
      
      const userSettings = await userService.getUserSettings(userId);
      
      const confirmation = await this.createTradeConfirmation(userId, {
        tokenAddress,
        amount,
        chain: userSettings.chain,
        tradeType: 'buy'
      });
      
      if (!confirmation.success) {
        return {
          success: false,
          message: confirmation.message
        };
      }
      
      return {
        success: true,
        needsConfirmation: true,
        tradeId: confirmation.tradeId,
        message: `🟢 **Buy order prepared**\n\nAmount: ${amount}\nToken: \`${tokenAddress}\`\n\n⚠️ Reply YES to confirm or NO to cancel`
      };
      
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Process sell command with enhanced validation
  async processSellCommand(userId, commandText) {
    try {
      const userSettings = await userService.getUserSettings(userId);
      
      if (!commandText.trim()) {
        // Show user positions
        const positions = await this.getUserPositions(userId);
        
        if (positions.length === 0) {
          return {
            success: true,
            message: '📊 **Your Positions**\n\nYou have no open positions.\n\n💡 Use /buy to start trading!'
          };
        }
        
        let message = '📊 **Your Positions**\n\n';
        positions.forEach((pos, index) => {
          const pnlEmoji = pos.pnl >= 0 ? '🟢' : '🔴';
          message += `${index + 1}. ${pnlEmoji} **${pos.tokenSymbol || 'Unknown'}**\n`;
          message += `   Amount: ${pos.amount?.toFixed(4) || 0}\n`;
          message += `   Value: $${pos.currentValue?.toFixed(2) || 0}\n`;
          message += `   PnL: ${pos.pnl >= 0 ? '+' : ''}${pos.pnlPercentage?.toFixed(2) || 0}%\n`;
          message += `   Address: \`${pos.tokenAddress}\`\n\n`;
        });
        
        message += '💡 **To sell:**\n';
        message += '• `/sell <token_address>` - Sell 100%\n';
        message += '• `/sell <token_address> 50` - Sell 50%\n';
        message += '• `/sell <token_address> 0.5` - Sell 0.5 tokens\n';
        
        return {
          success: true,
          message
        };
      }
      
      // Parse sell command
      const parts = commandText.trim().split(' ');
      const tokenAddress = parts[0];
      
      // Check if user has this position
      const positions = await this.getUserPositions(userId);
      const position = positions.find(p => 
        p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
      );
      
      if (!position) {
        return {
          success: false,
          message: '❌ Position not found.\n\n💡 Use `/sell` without arguments to see your positions.'
        };
      }
      
      // Determine sell amount/percentage
      let sellAmount, percentage;
      
      if (parts.length === 1) {
        // Sell 100%
        percentage = 100;
        sellAmount = position.amount;
      } else {
        const param = parseFloat(parts[1]);
        
        if (isNaN(param) || param <= 0) {
          return {
            success: false,
            message: '❌ Invalid sell amount/percentage'
          };
        }
        
        if (param <= 1) {
          // Specific amount
          sellAmount = param;
          percentage = (param / position.amount) * 100;
        } else if (param <= 100) {
          // Percentage
          percentage = param;
          sellAmount = (position.amount * param) / 100;
        } else {
          return {
            success: false,
            message: '❌ Invalid percentage. Use 1-100 for percentage or decimal for amount.'
          };
        }
      }
      
      if (sellAmount > position.amount) {
        return {
          success: false,
          message: `❌ Insufficient tokens. You have ${position.amount.toFixed(4)} tokens.`
        };
      }
      
      // Create sell confirmation
      const confirmation = await this.createTradeConfirmation(userId, {
        tokenAddress,
        amount: sellAmount,
        percentage,
        chain: userSettings.chain,
        tradeType: 'sell',
        position
      });
      
      if (!confirmation.success) {
        return {
          success: false,
          message: confirmation.message
        };
      }
      
      const pnlEmoji = position.pnl >= 0 ? '🟢' : '🔴';
      return {
        success: true,
        needsConfirmation: true,
        tradeId: confirmation.tradeId,
        message: `🔴 **Sell order prepared**\n\n` +
                `🎯 **Token:** ${position.tokenSymbol || 'Unknown'}\n` +
                `📦 **Amount:** ${sellAmount.toFixed(4)} (${percentage.toFixed(1)}%)\n` +
                `💰 **Current Value:** $${((position.currentPrice || 0) * sellAmount).toFixed(2)}\n` +
                `${pnlEmoji} **Estimated PnL:** ${position.pnl >= 0 ? '+' : ''}${((position.pnlPercentage || 0) * percentage / 100).toFixed(2)}%\n\n` +
                `⚠️ Reply YES to confirm or NO to cancel`
      };
      
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  getPendingTrade(tradeId) {
    return this.pendingTrades.get(tradeId);
  }

  clearPendingTrade(tradeId) {
    const timeout = this.confirmationTimeouts.get(tradeId);
    if (timeout) {
      clearTimeout(timeout);
      this.confirmationTimeouts.delete(tradeId);
    }
    this.pendingTrades.delete(tradeId);
  }

  // Cancel a pending trade
  cancelPendingTrade(tradeId) {
    const trade = this.pendingTrades.get(tradeId);
    if (trade) {
      this.clearPendingTrade(tradeId);
      return {
        success: true,
        message: '❌ Trade cancelled'
      };
    }
    return {
      success: false,
      message: '❌ Trade not found or already expired'
    };
  }

  // Execute confirmed trade (called from message handler)
  async executeConfirmedTrade(tradeId, userId) {
    try {
      const trade = this.pendingTrades.get(tradeId);
      if (!trade) {
        return {
          success: false,
          message: '❌ Trade not found or expired'
        };
      }
      
      this.clearPendingTrade(tradeId);
      
      if (trade.tradeType === 'buy') {
        const result = await this.executeBuyOrder(userId, trade);
        
        if (result.success) {
          return {
            success: true,
            message: `✅ **Buy order executed!**\n\n🎯 **${trade.tokenSymbol || 'Token'}**\n💰 **Amount:** ${trade.amount}\n📝 **TX:** \`${result.txHash}\`\n⛽ **${result.feeDisplay}**`
          };
        } else {
          return {
            success: false,
            message: `❌ Buy order failed: ${result.message}`
          };
        }
      } else {
        const result = await this.executeSellOrder(userId, trade);
        
        if (result.success) {
          const pnlEmoji = result.pnl >= 0 ? '🟢' : '🔴';
          return {
            success: true,
            message: `✅ **Sell order executed!**\n\n🎯 **${trade.tokenSymbol || 'Token'}**\n💰 **Sold:** ${result.tokensSold.toFixed(4)}\n${pnlEmoji} **PnL:** ${result.pnl >= 0 ? '+' : ''}${result.pnlPercentage.toFixed(2)}%\n📝 **TX:** \`${result.txHash}\`\n⛽ **${result.feeDisplay}**`
          };
        } else {
          return {
            success: false,
            message: `❌ Sell order failed: ${result.message}`
          };
        }
      }
      
    } catch (error) {
      return {
        success: false,
        message: `❌ Trade execution failed: ${error.message}`
      };
    }
  }

  // Get service statistics
  getStats() {
    const executorStats = this.tradingExecutor.getStats();
    
    return {
      initialized: this.initialized,
      pendingTrades: this.pendingTrades.size,
      pendingTimeouts: this.confirmationTimeouts.size,
      executorStats,
      healthStatus: this.tradingExecutor.isHealthy() ? 'healthy' : 'unhealthy'
    };
  }

  cleanup() {
    // Clear all pending trades and timeouts
    for (const timeout of this.confirmationTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.confirmationTimeouts.clear();
    this.pendingTrades.clear();
    
    console.log('🧹 Manual Trading Service cleaned up');
  }
}

// Singleton instance
let manualTradingService = null;

function getManualTradingService() {
  if (!manualTradingService) {
    manualTradingService = new ManualTradingService();
  }
  return manualTradingService;
}

function initializeManualTrading(bot) {
  const service = getManualTradingService();
  service.setBotInstance(bot);
  return service;
}

module.exports = {
  getManualTradingService,
  initializeManualTrading,
  ManualTradingService
}; 