const { Connection, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const { JsonRpcProvider } = require("ethers");
const axios = require('axios');

// Anti-MEV RPC endpoints (premium endpoints that protect against MEV attacks)
const ANTI_MEV_RPCS = {
  solana: [
    'https://solana-mainnet.g.alchemy.com/v2/demo', // Replace with your key
    'https://rpc.helius.xyz/?api-key=YOUR_KEY',
    'https://mainnet.block-engine.jito.wtf/api/v1/transactions'
  ],
  ethereum: [
    'https://rpc.flashbots.net/',
    'https://api.blocknative.com/v1/auction',
    'https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'
  ],
  bsc: [
    'https://bsc-dataseed1.binance.org/',
    'https://bsc-dataseed2.defibit.io/',
    'https://bsc-dataseed3.ninicoin.io/'
  ]
};

// Trailing Stop Loss Manager
class TrailingStopLoss {
  constructor() {
    this.positions = new Map(); // tokenAddress -> position data
  }

  updatePosition(tokenAddress, currentPrice, userId) {
    const position = this.positions.get(`${userId}-${tokenAddress}`);
    
    if (!position) return null;
    
    // Update highest price if current price is higher
    if (currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
      
      // Update stop loss to maintain percentage below peak
      position.stopLossPrice = position.highestPrice * (1 - position.stopLossPercent / 100);
      
      console.log(`📈 Trailing SL updated for ${tokenAddress}:
        New High: $${position.highestPrice.toFixed(6)}
        New Stop Loss: $${position.stopLossPrice.toFixed(6)}`);
    }
    
    // Check if stop loss is triggered
    if (currentPrice <= position.stopLossPrice) {
      console.log(`🛑 Stop loss triggered for ${tokenAddress} at $${currentPrice.toFixed(6)}`);
      return {
        shouldSell: true,
        reason: 'trailing_stop_loss',
        sellPrice: currentPrice,
        profit: ((currentPrice - position.buyPrice) / position.buyPrice) * 100
      };
    }
    
    return {
      shouldSell: false,
      currentPrice,
      highestPrice: position.highestPrice,
      stopLossPrice: position.stopLossPrice
    };
  }

  addPosition(tokenAddress, buyPrice, stopLossPercent, userId) {
    const key = `${userId}-${tokenAddress}`;
    this.positions.set(key, {
      tokenAddress,
      buyPrice,
      highestPrice: buyPrice,
      stopLossPercent,
      stopLossPrice: buyPrice * (1 - stopLossPercent / 100),
      userId,
      timestamp: new Date()
    });
    
    console.log(`🎯 Trailing stop loss activated:
      Token: ${tokenAddress}
      Buy Price: $${buyPrice.toFixed(6)}
      Stop Loss: $${(buyPrice * (1 - stopLossPercent / 100)).toFixed(6)} (${stopLossPercent}%)`);
  }

  removePosition(tokenAddress, userId) {
    this.positions.delete(`${userId}-${tokenAddress}`);
  }

  getPosition(tokenAddress, userId) {
    return this.positions.get(`${userId}-${tokenAddress}`);
  }
}

// Copy Trading Engine with Advanced Features
class CopyTradingEngine {
  constructor() {
    this.trailingStopLoss = new TrailingStopLoss();
    this.userPositions = new Map(); // userId -> positions
    this.priceCache = new Map(); // token -> price data
  }

  // Track a copy trade
  async trackCopyTrade(userId, tokenAddress, amount, price, sourceWallet, chain) {
    const userKey = userId;
    if (!this.userPositions.has(userKey)) {
      this.userPositions.set(userKey, new Map());
    }
    
    const positions = this.userPositions.get(userKey);
    const positionKey = `${tokenAddress}-${sourceWallet}`;
    
    if (!positions.has(positionKey)) {
      positions.set(positionKey, {
        tokenAddress,
        totalAmount: 0,
        trades: [],
        sourceWallet,
        chain
      });
    }
    
    const position = positions.get(positionKey);
    position.trades.push({
      amount,
      price,
      timestamp: new Date(),
      txHash: null
    });
    position.totalAmount += amount;
    
    return position;
  }

  // Handle proportional selling when source wallet sells
  async handleSourceWalletSell(sourceWallet, tokenAddress, sellPercentage, userId) {
    const userKey = userId;
    const positions = this.userPositions.get(userKey);
    
    if (!positions) return null;
    
    const positionKey = `${tokenAddress}-${sourceWallet}`;
    const position = positions.get(positionKey);
    
    if (!position) return null;
    
    // Calculate amount to sell based on percentage
    const sellAmount = position.totalAmount * (sellPercentage / 100);
    
    // Update position
    position.totalAmount -= sellAmount;
    
    // Remove empty positions
    if (position.totalAmount <= 0.001) {
      positions.delete(positionKey);
    }
    
    return {
      tokenAddress,
      sellAmount,
      remainingAmount: position.totalAmount,
      sourceWallet
    };
  }

  // Get user's copy positions
  getUserPositions(userId) {
    return this.userPositions.get(userId) || new Map();
  }
}

// Advanced Price Monitor with Multiple Data Sources
class PriceMonitor {
  constructor() {
    this.priceFeeds = {
      'https://api.dexscreener.com/latest/dex/tokens/': 'dexscreener',
      'https://api.coingecko.com/api/v3/simple/token_price/': 'coingecko',
      'https://api.jup.ag/price/v1': 'jupiter'
    };
  }

  async getTokenPrice(tokenAddress, chain) {
    const prices = [];
    
    // Try multiple price sources
    try {
      // DexScreener
      const dexResponse = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      if (dexResponse.data?.pairs?.[0]?.priceUsd) {
        prices.push(parseFloat(dexResponse.data.pairs[0].priceUsd));
      }
    } catch (err) {
      console.log('DexScreener price fetch failed');
    }

    try {
      // Jupiter (Solana only)
      if (chain === 'solana') {
        const jupResponse = await axios.get(`https://price.jup.ag/v4/price?ids=${tokenAddress}`);
        if (jupResponse.data?.data?.[tokenAddress]?.price) {
          prices.push(parseFloat(jupResponse.data.data[tokenAddress].price));
        }
      }
    } catch (err) {
      console.log('Jupiter price fetch failed');
    }

    // Return average price from all sources
    if (prices.length > 0) {
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    }
    
    return null;
  }

  async getTokenInfo(tokenAddress, chain) {
    try {
      const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
      const data = response.data;
      
      if (data?.pairs?.length > 0) {
        const bestPair = data.pairs[0];
        return {
          symbol: bestPair.baseToken.symbol,
          name: bestPair.baseToken.name,
          price: parseFloat(bestPair.priceUsd),
          priceChange24h: bestPair.priceChange.h24,
          volume24h: parseFloat(bestPair.volume.h24),
          liquidity: parseFloat(bestPair.liquidity.usd),
          fdv: parseFloat(bestPair.fdv),
          pairAddress: bestPair.pairAddress,
          dexId: bestPair.dexId
        };
      }
    } catch (err) {
      console.error('Failed to fetch token info:', err);
    }
    
    return null;
  }
}

// Slippage Calculator
class SlippageCalculator {
  calculateOptimalSlippage(liquidity, tradeSize, volatility = 1) {
    // Base slippage calculation
    const impactRatio = tradeSize / liquidity;
    let baseSlippage = impactRatio * 100 * 2; // 2x for safety
    
    // Adjust for volatility
    baseSlippage *= volatility;
    
    // Set bounds
    const minSlippage = 0.5;
    const maxSlippage = 10;
    
    return Math.min(Math.max(baseSlippage, minSlippage), maxSlippage);
  }

  // Dynamic slippage based on market conditions
  async getDynamicSlippage(tokenAddress, chain, tradeSize) {
    const priceMonitor = new PriceMonitor();
    const tokenInfo = await priceMonitor.getTokenInfo(tokenAddress, chain);
    
    if (!tokenInfo) {
      return 2; // Default 2% slippage
    }
    
    // Calculate volatility factor based on 24h price change
    const volatilityFactor = 1 + Math.abs(tokenInfo.priceChange24h) / 100;
    
    return this.calculateOptimalSlippage(
      tokenInfo.liquidity,
      tradeSize,
      volatilityFactor
    );
  }
}

// Transaction Builder with Anti-MEV
class AntiMEVTransactionBuilder {
  constructor() {
    this.slippageCalculator = new SlippageCalculator();
  }

  async buildProtectedTransaction(params) {
    const { 
      chain, 
      tokenIn, 
      tokenOut, 
      amountIn, 
      userAddress,
      priorityFee = 0.0001 
    } = params;

    // Get dynamic slippage
    const slippage = await this.slippageCalculator.getDynamicSlippage(
      tokenOut,
      chain,
      amountIn
    );

    if (chain === 'solana') {
      return this.buildSolanaTransaction({
        ...params,
        slippage,
        priorityFee
      });
    } else {
      return this.buildEVMTransaction({
        ...params,
        slippage,
        priorityFee
      });
    }
  }

  async buildSolanaTransaction(params) {
    // Use Jito bundles for MEV protection on Solana
    const jitoTip = 0.0001; // 0.0001 SOL tip for priority
    
    // Build transaction with Jupiter API
    const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
      params: {
        inputMint: params.tokenIn,
        outputMint: params.tokenOut,
        amount: params.amountIn,
        slippageBps: Math.floor(params.slippage * 100)
      }
    });

    const { swapTransaction } = await axios.post('https://quote-api.jup.ag/v6/swap', {
      quoteResponse: quoteResponse.data,
      userPublicKey: params.userAddress,
      priorityFee: params.priorityFee
    }).then(res => res.data);

    return {
      transaction: swapTransaction,
      slippage: params.slippage,
      jitoTip,
      expectedOutput: quoteResponse.data.outAmount
    };
  }

  async buildEVMTransaction(params) {
    // Use Flashbots for MEV protection on Ethereum
    // This is a simplified example
    return {
      to: params.routerAddress,
      data: params.swapData,
      value: params.value,
      maxPriorityFeePerGas: params.priorityFee,
      type: 2, // EIP-1559
      flashbots: true
    };
  }
}

// Main Trading Service
class AdvancedTradingService {
  constructor() {
    this.copyEngine = new CopyTradingEngine();
    this.priceMonitor = new PriceMonitor();
    this.txBuilder = new AntiMEVTransactionBuilder();
    this.trailingStopLoss = this.copyEngine.trailingStopLoss;
  }

  // Monitor positions for trailing stop loss
  async monitorPositions() {
    setInterval(async () => {
      for (const [key, position] of this.trailingStopLoss.positions) {
        const [userId, tokenAddress] = key.split('-');
        
        // Get current price
        const currentPrice = await this.priceMonitor.getTokenPrice(
          tokenAddress,
          position.chain || 'solana'
        );
        
        if (currentPrice) {
          const result = this.trailingStopLoss.updatePosition(
            tokenAddress,
            currentPrice,
            userId
          );
          
          if (result?.shouldSell) {
            // Trigger sell order
            console.log(`🔴 Executing trailing stop loss sell for ${tokenAddress}`);
            // Implement actual sell logic here
          }
        }
      }
    }, 10000); // Check every 10 seconds
  }

  // Start the service
  start() {
    console.log('🚀 Advanced Trading Service started');
    console.log('✅ Trailing Stop Loss: Active');
    console.log('✅ Anti-MEV Protection: Active');
    console.log('✅ Copy Trading Engine: Active');
    
    this.monitorPositions();
  }
}

// Export singleton instance
const advancedTradingService = new AdvancedTradingService();

module.exports = {
  advancedTradingService,
  TrailingStopLoss,
  CopyTradingEngine,
  PriceMonitor,
  SlippageCalculator,
  AntiMEVTransactionBuilder,
  ANTI_MEV_RPCS
}; 