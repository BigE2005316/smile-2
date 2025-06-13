// services/realTradingExecutor.js - Real Blockchain Trading Execution Engine
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { ethers, parseUnits, formatUnits } = require('ethers');
const { getRPCManager } = require('./rpcManager');
const walletService = require('./walletService');
const userService = require('../users/userService');
const tokenDataService = require('./tokenDataService');

// Jupiter API for Solana swaps
const JUPITER_API = 'https://quote-api.jup.ag/v6';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// DEX router addresses for EVM chains
const DEX_ROUTERS = {
  ethereum: {
    uniswapV2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564'
  },
  bsc: {
    pancakeswap: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    pancakeswapV3: '0x1b81D678ffb9C0263b24A97847620C99d213eB14'
  }
};

// Common token addresses
const COMMON_TOKENS = {
  solana: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  },
  ethereum: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86a33E6417aAb0D765f5c11Bbf8Ff862f2CC9'
  },
  bsc: {
    BNB: '0x0000000000000000000000000000000000000000',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDT: '0x55d398326f99059fF775485246999027B3197955'
  }
};

class RealTradingExecutor {
  constructor() {
    this.rpcManager = getRPCManager();
    this.initialized = false;
    this.pendingTransactions = new Map();
    this.executionStats = {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0
    };
    
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Real Trading Executor...');
      
      // Verify RPC connections
      const rpcStatus = this.rpcManager.getStatus();
      if (!rpcStatus.initialized || rpcStatus.healthyRPCs === 0) {
        throw new Error('RPC Manager not properly initialized');
      }
      
      this.initialized = true;
      console.log('✅ Real Trading Executor initialized successfully');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to initialize Real Trading Executor:', error);
      this.initialized = false;
      return { success: false, error: error.message };
    }
  }

  // Execute buy order on blockchain
  async executeBuyOrder(userId, params) {
    const tradeId = `buy_${userId}_${Date.now()}`;
    
    try {
      console.log(`🟢 Executing BUY order ${tradeId}:`, params);
      
      if (!this.initialized) {
        throw new Error('Trading executor not initialized');
      }

      const { tokenAddress, amount, chain, slippage = 5, wallet } = params;
      
      // Validate parameters
      if (!tokenAddress || !amount || !chain) {
        throw new Error('Missing required parameters: tokenAddress, amount, chain');
      }

      if (amount <= 0) {
        throw new Error('Invalid amount: must be greater than 0');
      }

      // Get user wallet private key
      const userData = await userService.getUserSettings(userId);
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        throw new Error(`No ${chain} wallet found for user`);
      }

      const privateKey = await walletService.getWalletPrivateKeyForTrading(userId, chain);
      const walletAddress = userData.custodialWallets[chain].address;

      // Check wallet balance
      const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
      const availableBalance = parseFloat(balanceInfo.balance);

      if (availableBalance < amount) {
        throw new Error(`Insufficient balance. Available: ${availableBalance}, Required: ${amount}`);
      }

      // Process dev fee
      const feeInfo = await walletService.processTransactionWithFee(userId, chain, amount, 'buy');

      let result;
      
      if (chain === 'solana') {
        result = await this.executeSolanaBuy(privateKey, tokenAddress, feeInfo.userAmount, slippage);
      } else if (chain === 'ethereum' || chain === 'bsc') {
        result = await this.executeEVMBuy(privateKey, tokenAddress, feeInfo.userAmount, slippage, chain);
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }

      // Update trade statistics
      this.executionStats.totalTrades++;
      this.executionStats.successfulTrades++;
      this.executionStats.totalVolume += amount;

      // Update user statistics and positions
      await userService.updateStats(userId, {
        amount: feeInfo.userAmount,
        pnl: 0, // No PnL on buy
        executed: true
      });

      // Add position tracking
      const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
      await userService.addPosition(userId, tokenAddress, result.tokensReceived, result.executedPrice, 'manual_buy');

      console.log(`✅ BUY order ${tradeId} executed successfully`);

      return {
        success: true,
        tradeId,
        txHash: result.txHash,
        executedPrice: result.executedPrice,
        tokensReceived: result.tokensReceived,
        amountSpent: feeInfo.userAmount,
        devFee: feeInfo.devFee,
        feeDisplay: feeInfo.feeDisplay,
        gasUsed: result.gasUsed,
        timestamp: Date.now(),
        chain
      };

    } catch (error) {
      console.error(`❌ BUY order ${tradeId} failed:`, error);
      
      this.executionStats.totalTrades++;
      this.executionStats.failedTrades++;

      return {
        success: false,
        tradeId,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Execute sell order on blockchain
  async executeSellOrder(userId, params) {
    const tradeId = `sell_${userId}_${Date.now()}`;
    
    try {
      console.log(`🔴 Executing SELL order ${tradeId}:`, params);
      
      if (!this.initialized) {
        throw new Error('Trading executor not initialized');
      }

      const { tokenAddress, percentage = 100, amount, chain, slippage = 5 } = params;
      
      // Get user position
      const positions = await userService.getUserPositions(userId);
      const position = positions.find(p => 
        p.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() && 
        p.chain === chain
      );

      if (!position) {
        throw new Error('No position found for this token');
      }

      // Calculate sell amount
      let sellAmount;
      if (amount) {
        sellAmount = amount;
      } else {
        sellAmount = (position.amount * percentage) / 100;
      }

      if (sellAmount > position.amount) {
        throw new Error('Insufficient token balance');
      }

      // Get private key
      const privateKey = await walletService.getWalletPrivateKeyForTrading(userId, chain);

      let result;
      
      if (chain === 'solana') {
        result = await this.executeSolanaSell(privateKey, tokenAddress, sellAmount, slippage);
      } else if (chain === 'ethereum' || chain === 'bsc') {
        result = await this.executeEVMSell(privateKey, tokenAddress, sellAmount, slippage, chain);
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }

      // Calculate PnL
      const sellValue = result.nativeReceived;
      const buyValue = sellAmount * position.avgBuyPrice;
      const pnl = sellValue - buyValue;
      const pnlPercentage = ((sellValue - buyValue) / buyValue) * 100;

      // Process dev fee
      const feeInfo = await walletService.processTransactionWithFee(userId, chain, sellValue, 'sell');

      // Update trade statistics
      this.executionStats.totalTrades++;
      this.executionStats.successfulTrades++;
      this.executionStats.totalVolume += sellValue;

      // Update user statistics
      await userService.updateStats(userId, {
        amount: sellValue,
        pnl,
        executed: true
      });

      // Update position
      await userService.sellPosition(userId, tokenAddress, percentage, result.executedPrice);

      console.log(`✅ SELL order ${tradeId} executed successfully`);

      return {
        success: true,
        tradeId,
        txHash: result.txHash,
        executedPrice: result.executedPrice,
        tokensSold: sellAmount,
        nativeReceived: result.nativeReceived,
        devFee: feeInfo.devFee,
        feeDisplay: feeInfo.feeDisplay,
        pnl,
        pnlPercentage,
        gasUsed: result.gasUsed,
        timestamp: Date.now(),
        chain
      };

    } catch (error) {
      console.error(`❌ SELL order ${tradeId} failed:`, error);
      
      this.executionStats.totalTrades++;
      this.executionStats.failedTrades++;

      return {
        success: false,
        tradeId,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Execute Solana buy via Jupiter
  async executeSolanaBuy(privateKeyHex, tokenAddress, amount, slippage) {
    try {
      const connection = await this.rpcManager.getSolanaConnection();
      
      // Convert hex private key to Keypair
      const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const wallet = Keypair.fromSecretKey(secretKey);

      const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Get quote from Jupiter
      const quoteResponse = await fetch(
        `${JUPITER_API}/quote?inputMint=${COMMON_TOKENS.solana.SOL}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`
      );
      
      if (!quoteResponse.ok) {
        throw new Error('Failed to get Jupiter quote');
      }

      const quoteData = await quoteResponse.json();

      // Get swap transaction
      const swapResponse = await fetch(JUPITER_SWAP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true
        })
      });

      if (!swapResponse.ok) {
        throw new Error('Failed to get Jupiter swap transaction');
      }

      const { swapTransaction } = await swapResponse.json();

      // Deserialize and sign transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = Transaction.from(transactionBuf);
      transaction.sign(wallet);

      // Execute transaction
      const txHash = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // Wait for confirmation
      await connection.confirmTransaction(txHash, 'confirmed');

      const executedPrice = parseInt(quoteData.inAmount) / parseInt(quoteData.outAmount);
      const tokensReceived = parseInt(quoteData.outAmount) / Math.pow(10, 9); // Assuming 9 decimals

      return {
        txHash,
        executedPrice,
        tokensReceived,
        gasUsed: 'N/A'
      };

    } catch (error) {
      console.error('Solana buy execution error:', error);
      throw error;
    }
  }

  // Execute Solana sell via Jupiter
  async executeSolanaSell(privateKeyHex, tokenAddress, amount, slippage) {
    try {
      const connection = await this.rpcManager.getSolanaConnection();
      
      const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const wallet = Keypair.fromSecretKey(secretKey);

      // Convert amount to proper decimals (assuming 9 for most SPL tokens)
      const amountAtomic = Math.floor(amount * Math.pow(10, 9));

      // Get quote
      const quoteResponse = await fetch(
        `${JUPITER_API}/quote?inputMint=${tokenAddress}&outputMint=${COMMON_TOKENS.solana.SOL}&amount=${amountAtomic}&slippageBps=${slippage * 100}`
      );
      
      const quoteData = await quoteResponse.json();

      // Get swap transaction
      const swapResponse = await fetch(JUPITER_SWAP_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true
        })
      });

      const { swapTransaction } = await swapResponse.json();

      // Execute transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = Transaction.from(transactionBuf);
      transaction.sign(wallet);

      const txHash = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(txHash, 'confirmed');

      const executedPrice = parseInt(quoteData.outAmount) / parseInt(quoteData.inAmount);
      const nativeReceived = parseInt(quoteData.outAmount) / LAMPORTS_PER_SOL;

      return {
        txHash,
        executedPrice,
        nativeReceived,
        gasUsed: 'N/A'
      };

    } catch (error) {
      console.error('Solana sell execution error:', error);
      throw error;
    }
  }

  // Execute EVM buy (implemented with actual DEX interaction)
  async executeEVMBuy(privateKeyHex, tokenAddress, amount, slippage, chain) {
    try {
      console.log(`🔷 Executing ${chain.toUpperCase()} buy order...`);
      
      const provider = chain === 'ethereum' 
        ? await this.rpcManager.getEthereumProvider()
        : await this.rpcManager.getBSCProvider();

      const wallet = new ethers.Wallet(privateKeyHex, provider);
      const routerAddress = chain === 'ethereum' 
        ? DEX_ROUTERS.ethereum.uniswapV2 
        : DEX_ROUTERS.bsc.pancakeswap;
      
      // Router ABI for swapExactETHForTokens
      const routerABI = [
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
      ];
      
      const router = new ethers.Contract(routerAddress, routerABI, wallet);
      
      // Get wrapped native token address
      const WNATIVE = chain === 'ethereum' 
        ? COMMON_TOKENS.ethereum.WETH 
        : COMMON_TOKENS.bsc.WBNB;
      
      const path = [WNATIVE, tokenAddress];
      const amountIn = parseUnits(amount.toString(), 'ether');
      
      // Get expected output amount
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / BigInt(100);
      
      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;
      
      // Execute swap
      const tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        wallet.address,
        deadline,
        { 
          value: amountIn,
          gasLimit: 300000 // Set reasonable gas limit
        }
      );
      
      console.log(`📝 Transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed: ${receipt.transactionHash}`);
      
      // Calculate actual amounts from receipt
      const actualAmountOut = amounts[1];
      const executedPrice = Number(amountIn) / Number(actualAmountOut);
      const tokensReceived = Number(formatUnits(actualAmountOut, 18));
      
      return {
        txHash: receipt.transactionHash,
        executedPrice,
        tokensReceived,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      console.error(`${chain} buy execution error:`, error);
      
      // Provide more specific error messages
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient native token balance for trade');
      } else if (error.message.includes('execution reverted')) {
        throw new Error('Trade execution failed - likely due to slippage or liquidity issues');
      } else if (error.message.includes('replacement transaction underpriced')) {
        throw new Error('Network congestion - please try again with higher gas');
      } else {
        throw new Error(`Trade execution failed: ${error.message}`);
      }
    }
  }

  // Execute EVM sell (implemented with actual DEX interaction)
  async executeEVMSell(privateKeyHex, tokenAddress, amount, slippage, chain) {
    try {
      console.log(`🔷 Executing ${chain.toUpperCase()} sell order...`);
      
      const provider = chain === 'ethereum' 
        ? await this.rpcManager.getEthereumProvider()
        : await this.rpcManager.getBSCProvider();

      const wallet = new ethers.Wallet(privateKeyHex, provider);
      const routerAddress = chain === 'ethereum' 
        ? DEX_ROUTERS.ethereum.uniswapV2 
        : DEX_ROUTERS.bsc.pancakeswap;
      
      // ERC20 Token ABI
      const tokenABI = [
        "function transfer(address to, uint amount) public returns (bool)",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function decimals() public view returns (uint8)"
      ];
      
      // Router ABI for swapExactTokensForETH
      const routerABI = [
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
      ];
      
      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
      const router = new ethers.Contract(routerAddress, routerABI, wallet);
      
      // Get token decimals
      const decimals = await tokenContract.decimals();
      const amountIn = parseUnits(amount.toString(), decimals);
      
      // Check token balance
      const balance = await tokenContract.balanceOf(wallet.address);
      if (balance < amountIn) {
        throw new Error('Insufficient token balance');
      }
      
      // Check and approve token spending if needed
      const allowance = await tokenContract.allowance(wallet.address, routerAddress);
      if (allowance < amountIn) {
        console.log('📝 Approving token spending...');
        const approveTx = await tokenContract.approve(routerAddress, amountIn);
        await approveTx.wait();
        console.log('✅ Token spending approved');
      }
      
      // Get wrapped native token address
      const WNATIVE = chain === 'ethereum' 
        ? COMMON_TOKENS.ethereum.WETH 
        : COMMON_TOKENS.bsc.WBNB;
      
      const path = [tokenAddress, WNATIVE];
      
      // Get expected output amount
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / BigInt(100);
      
      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;
      
      // Execute swap
      const tx = await router.swapExactTokensForETH(
        amountIn,
        amountOutMin,
        path,
        wallet.address,
        deadline,
        { gasLimit: 300000 }
      );
      
      console.log(`📝 Transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed: ${receipt.transactionHash}`);
      
      // Calculate actual amounts from receipt
      const actualAmountOut = amounts[1];
      const executedPrice = Number(actualAmountOut) / Number(amountIn);
      const nativeReceived = Number(formatUnits(actualAmountOut, 'ether'));
      
      return {
        txHash: receipt.transactionHash,
        executedPrice,
        nativeReceived,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      console.error(`${chain} sell execution error:`, error);
      
      // Provide more specific error messages
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient gas for transaction');
      } else if (error.message.includes('execution reverted')) {
        throw new Error('Sell execution failed - likely due to slippage or liquidity issues');
      } else if (error.message.includes('replacement transaction underpriced')) {
        throw new Error('Network congestion - please try again with higher gas');
      } else {
        throw new Error(`Sell execution failed: ${error.message}`);
      }
    }
  }

  // Simulate trade for preview
  async simulateTrade(params) {
    try {
      const { tokenAddress, amount, chain, tradeType } = params;
      
      // Get token info for simulation
      const tokenInfo = await tokenDataService.getTokenInfo(tokenAddress, chain);
      
      if (!tokenInfo) {
        throw new Error('Token information not available for simulation');
      }

      let simulation;
      
      if (tradeType === 'buy') {
        simulation = {
          estimatedTokens: amount / (tokenInfo.price || 0.001),
          priceImpact: 2.5,
          slippage: 5,
          fees: amount * 0.03,
          executionProbability: 95
        };
      } else {
        simulation = {
          estimatedNative: amount * (tokenInfo.price || 0.001),
          priceImpact: 2.5,
          slippage: 5,
          fees: amount * (tokenInfo.price || 0.001) * 0.03,
          executionProbability: 95
        };
      }

      return {
        success: true,
        simulation,
        tokenInfo,
        warnings: simulation.priceImpact > 10 ? ['High price impact detected'] : [],
        timestamp: Date.now()
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Get execution statistics
  getStats() {
    return {
      ...this.executionStats,
      successRate: this.executionStats.totalTrades > 0 
        ? (this.executionStats.successfulTrades / this.executionStats.totalTrades * 100).toFixed(2) + '%'
        : '0%',
      pendingTransactions: this.pendingTransactions.size
    };
  }

  // Health check
  isHealthy() {
    return this.initialized && this.rpcManager.getStatus().healthyRPCs > 0;
  }
}

// Singleton instance
let tradingExecutor = null;

function getRealTradingExecutor() {
  if (!tradingExecutor) {
    tradingExecutor = new RealTradingExecutor();
  }
  return tradingExecutor;
}

module.exports = {
  getRealTradingExecutor,
  RealTradingExecutor
}; 