// services/advancedTradingEngine.js - Advanced Trading Engine
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { ethers } = require('ethers');
const axios = require('axios');
const userService = require('../users/userService');
const tokenDataService = require('./tokenDataService');

class AdvancedTradingEngine {
  constructor() {
    this.defaultSettings = {
      slippage: 5, // 5%
      priceImpactThreshold: 25, // 25%
      maxGasPrice: 50, // GWEI for ETH
      maxEnergyLimit: 1000000, // TRON
      autoBuyEnabled: true,
      degenMode: false,
      autoApprove: false,
      duplicateBuyProtection: true,
      minMarketCap: 10000, // $10k
      maxMarketCap: 100000000, // $100M
      minLiquidity: 5000, // $5k
      maxBuyTax: 10, // 10%
      maxSellTax: 10, // 10%
      rugDetection: true,
      autoTrack: true
    };
    
    this.tradingPairs = new Map();
    this.priceCache = new Map();
    this.rugChecks = new Map();
  }

  // Get user trading settings with defaults
  async getUserTradingSettings(userId) {
    const userData = await userService.getUserSettings(userId);
    const settings = userData.tradingSettings || {};
    
    return {
      ...this.defaultSettings,
      ...settings
    };
  }

  // Update user trading settings
  async updateUserTradingSettings(userId, newSettings) {
    const userData = await userService.getUserSettings(userId);
    userData.tradingSettings = {
      ...(userData.tradingSettings || {}),
      ...newSettings
    };
    await userService.saveUserData(userId, userData);
    return userData.tradingSettings;
  }

  // Simulate trade before execution
  async simulateTrade(tokenAddress, amount, action, chain, slippage = 5) {
    try {
      let simulation = {
        success: false,
        priceImpact: 0,
        expectedOutput: 0,
        minOutput: 0,
        route: null,
        fees: 0,
        warnings: [],
        errors: []
      };

      // Get token data
      const tokenData = await tokenDataService.getTokenData(tokenAddress, chain);
      
      if (!tokenData) {
        simulation.errors.push('Token data not found');
        return simulation;
      }

      // Check liquidity
      if (tokenData.liquidity < 1000) {
        simulation.warnings.push('⚠️ Very low liquidity - high slippage risk');
      }

      // Calculate price impact
      const liquidityUSD = tokenData.liquidity || 0;
      const tradeUSD = amount * (chain === 'solana' ? tokenData.priceUsd : 
                                chain === 'ethereum' ? 3000 : 400); // Rough price estimates
      
      simulation.priceImpact = liquidityUSD > 0 ? (tradeUSD / liquidityUSD) * 100 : 100;
      
      if (simulation.priceImpact > 25) {
        simulation.warnings.push(`⚠️ High price impact: ${simulation.priceImpact.toFixed(2)}%`);
      }

      // Estimate output based on AMM formula
      const slippageMultiplier = 1 - (slippage / 100);
      
      if (action === 'buy') {
        simulation.expectedOutput = amount / tokenData.priceUsd;
        simulation.minOutput = simulation.expectedOutput * slippageMultiplier;
      } else {
        simulation.expectedOutput = amount * tokenData.priceUsd;
        simulation.minOutput = simulation.expectedOutput * slippageMultiplier;
      }

      // Check for trading route (simplified)
      if (chain === 'solana' && tokenData.marketCap > 1000) {
        simulation.route = 'Jupiter';
      } else if ((chain === 'ethereum' || chain === 'bsc') && tokenData.liquidity > 1000) {
        simulation.route = 'Uniswap V3';
      } else {
        simulation.errors.push('Could not find trading route');
        return simulation;
      }

      // Calculate fees
      const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
      simulation.fees = simulation.expectedOutput * (devFeePercent / 100);

      simulation.success = simulation.errors.length === 0;
      return simulation;

    } catch (err) {
      return {
        success: false,
        errors: [`Simulation failed: ${err.message}`],
        warnings: [],
        priceImpact: 0,
        expectedOutput: 0,
        minOutput: 0,
        route: null,
        fees: 0
      };
    }
  }

  // Check if token passes auto-buy criteria
  async checkAutoBuyEligibility(tokenAddress, chain, settings = null) {
    try {
      if (!settings) {
        settings = this.defaultSettings;
      }

      const checks = {
        passed: true,
        results: [],
        warnings: [],
        score: 0
      };

      // Get token data
      const tokenData = await tokenDataService.getTokenData(tokenAddress, chain);
      
      if (!tokenData) {
        checks.passed = false;
        checks.results.push('❌ Token data not available');
        return checks;
      }

      // Market cap check
      if (tokenData.marketCap < settings.minMarketCap) {
        checks.passed = false;
        checks.results.push(`❌ Market cap too low: $${tokenData.marketCap.toLocaleString()}`);
      } else if (tokenData.marketCap > settings.maxMarketCap) {
        checks.passed = false;
        checks.results.push(`❌ Market cap too high: $${tokenData.marketCap.toLocaleString()}`);
      } else {
        checks.results.push(`✅ Market cap: $${tokenData.marketCap.toLocaleString()}`);
        checks.score += 20;
      }

      // Liquidity check
      if (tokenData.liquidity < settings.minLiquidity) {
        checks.passed = false;
        checks.results.push(`❌ Liquidity too low: $${tokenData.liquidity.toLocaleString()}`);
      } else {
        checks.results.push(`✅ Liquidity: $${tokenData.liquidity.toLocaleString()}`);
        checks.score += 20;
      }

      // Tax checks (if available)
      if (tokenData.buyTax && tokenData.buyTax > settings.maxBuyTax) {
        checks.passed = false;
        checks.results.push(`❌ Buy tax too high: ${tokenData.buyTax}%`);
      } else if (tokenData.buyTax) {
        checks.results.push(`✅ Buy tax: ${tokenData.buyTax}%`);
        checks.score += 15;
      }

      if (tokenData.sellTax && tokenData.sellTax > settings.maxSellTax) {
        checks.passed = false;
        checks.results.push(`❌ Sell tax too high: ${tokenData.sellTax}%`);
      } else if (tokenData.sellTax) {
        checks.results.push(`✅ Sell tax: ${tokenData.sellTax}%`);
        checks.score += 15;
      }

      // Rug detection
      if (settings.rugDetection) {
        const rugScore = await this.performRugCheck(tokenAddress, chain);
        if (rugScore > 70) {
          checks.passed = false;
          checks.results.push(`❌ High rug risk: ${rugScore}%`);
        } else if (rugScore > 40) {
          checks.warnings.push(`⚠️ Medium rug risk: ${rugScore}%`);
          checks.score += 10;
        } else {
          checks.results.push(`✅ Low rug risk: ${rugScore}%`);
          checks.score += 30;
        }
      }

      return checks;

    } catch (err) {
      return {
        passed: false,
        results: [`❌ Auto-buy check failed: ${err.message}`],
        warnings: [],
        score: 0
      };
    }
  }

  // Perform rug detection analysis
  async performRugCheck(tokenAddress, chain) {
    try {
      // Check cache first
      const cacheKey = `${chain}_${tokenAddress}`;
      if (this.rugChecks.has(cacheKey)) {
        const cached = this.rugChecks.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) { // 5 min cache
          return cached.score;
        }
      }

      let rugScore = 0;
      const tokenData = await tokenDataService.getTokenData(tokenAddress, chain);

      if (!tokenData) return 100; // Max risk if no data

      // Age factor (newer = riskier)
      const ageHours = tokenData.ageHours || 0;
      if (ageHours < 1) rugScore += 30;
      else if (ageHours < 24) rugScore += 20;
      else if (ageHours < 168) rugScore += 10; // 1 week

      // Liquidity factor
      if (tokenData.liquidity < 1000) rugScore += 25;
      else if (tokenData.liquidity < 10000) rugScore += 15;

      // Holder concentration (if available)
      if (tokenData.topHolderPercent > 50) rugScore += 20;
      else if (tokenData.topHolderPercent > 30) rugScore += 10;

      // Verified contract
      if (!tokenData.verified) rugScore += 15;

      // Social presence
      if (!tokenData.twitter && !tokenData.telegram) rugScore += 10;

      // Cap at 100
      rugScore = Math.min(100, Math.max(0, rugScore));

      // Cache result
      this.rugChecks.set(cacheKey, {
        score: rugScore,
        timestamp: Date.now()
      });

      return rugScore;

    } catch (err) {
      console.error('Rug check error:', err);
      return 50; // Medium risk if check fails
    }
  }

  // Format trade simulation results
  formatSimulationResults(simulation, action, amount, tokenData) {
    let message = `🔮 **Trade Simulation** - ${action.toUpperCase()}\n\n`;
    
    message += `🎯 **${tokenData.symbol}** - $${tokenData.priceUsd.toFixed(6)}\n`;
    message += `💰 **Amount:** ${amount} ${action === 'buy' ? 'SOL' : 'tokens'}\n\n`;

    if (simulation.success) {
      message += `✅ **Simulation Successful**\n`;
      message += `📊 **Price Impact:** ${simulation.priceImpact.toFixed(2)}%\n`;
      message += `💱 **Expected Output:** ${simulation.expectedOutput.toFixed(4)}\n`;
      message += `📉 **Min Output:** ${simulation.minOutput.toFixed(4)}\n`;
      message += `🛣️ **Route:** ${simulation.route}\n`;
      message += `💸 **TX Fee:** ${simulation.fees.toFixed(4)}\n`;
    } else {
      message += `❌ **Simulation Failed**\n`;
    }

    if (simulation.warnings.length > 0) {
      message += `\n⚠️ **Warnings:**\n`;
      simulation.warnings.forEach(warning => {
        message += `• ${warning}\n`;
      });
    }

    if (simulation.errors.length > 0) {
      message += `\n🚫 **Errors:**\n`;
      simulation.errors.forEach(error => {
        message += `• ${error}\n`;
      });
    }

    return message;
  }

  // Format auto-buy check results
  formatAutoBuyCheck(checks, tokenData) {
    let message = `🤖 **Auto-Buy Eligibility Check**\n\n`;
    
    message += `🎯 **${tokenData.symbol}** - ${checks.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
    message += `📊 **Safety Score:** ${checks.score}/100\n\n`;

    if (checks.results.length > 0) {
      message += `📋 **Check Results:**\n`;
      checks.results.forEach(result => {
        message += `${result}\n`;
      });
    }

    if (checks.warnings.length > 0) {
      message += `\n⚠️ **Warnings:**\n`;
      checks.warnings.forEach(warning => {
        message += `• ${warning}\n`;
      });
    }

    const recommendation = checks.passed && checks.score > 60 ? 
      '🟢 **RECOMMENDED FOR AUTO-BUY**' : 
      checks.passed ? '🟡 **PROCEED WITH CAUTION**' : '🔴 **NOT RECOMMENDED**';
    
    message += `\n${recommendation}`;

    return message;
  }

  // Get dynamic slippage based on market conditions
  async getDynamicSlippage(tokenAddress, chain, amount) {
    try {
      const tokenData = await tokenDataService.getTokenData(tokenAddress, chain);
      let baseSlippage = 5; // 5% default

      // Adjust based on liquidity
      if (tokenData.liquidity < 1000) baseSlippage += 10;
      else if (tokenData.liquidity < 10000) baseSlippage += 5;

      // Adjust based on volatility (24h change)
      const volatility = Math.abs(tokenData.priceChange24h || 0);
      if (volatility > 50) baseSlippage += 10;
      else if (volatility > 20) baseSlippage += 5;

      // Adjust based on trade size vs liquidity
      const tradeUSD = amount * tokenData.priceUsd;
      const liquidityRatio = tradeUSD / tokenData.liquidity;
      if (liquidityRatio > 0.1) baseSlippage += 15; // 10%+ of liquidity
      else if (liquidityRatio > 0.05) baseSlippage += 8; // 5%+ of liquidity

      return Math.min(50, Math.max(1, baseSlippage)); // Cap between 1-50%
    } catch (err) {
      return 5; // Default if calculation fails
    }
  }

  // Clean up expired cache entries
  cleanupCache() {
    const now = Date.now();
    const maxAge = 600000; // 10 minutes

    // Clean price cache
    for (const [key, data] of this.priceCache.entries()) {
      if (now - data.timestamp > maxAge) {
        this.priceCache.delete(key);
      }
    }

    // Clean rug check cache
    for (const [key, data] of this.rugChecks.entries()) {
      if (now - data.timestamp > maxAge) {
        this.rugChecks.delete(key);
      }
    }
  }
}

// Export singleton
let engineInstance = null;

module.exports = {
  getAdvancedEngine: () => {
    if (!engineInstance) {
      engineInstance = new AdvancedTradingEngine();
      // Start cache cleanup interval
      setInterval(() => engineInstance.cleanupCache(), 300000); // Every 5 minutes
    }
    return engineInstance;
  },
  AdvancedTradingEngine
}; 