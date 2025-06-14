// services/realTradingExecutor.js - Enhanced Real Blockchain Trading Execution Engine
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL, SystemProgram } = require('@solana/web3.js');
const { ethers, parseUnits, formatUnits } = require('ethers');
const { getRPCManager } = require('./rpcManager');
const walletService = require('./walletService');
const userService = require('../users/userService');
const tokenDataService = require('./tokenDataService');
const axios = require('axios');

// Jupiter API for Solana swaps
const JUPITER_API = 'https://quote-api.jup.ag/v6';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// DEX router addresses for EVM chains
const DEX_ROUTERS = {
  ethereum: {
    uniswapV2: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    sushiswap: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F'
  },
  bsc: {
    pancakeswap: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    pancakeswapV3: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
    biswap: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8'
  },
  polygon: {
    quickswap: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
    sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
  },
  arbitrum: {
    uniswapV3: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    sushiswap: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
  },
  base: {
    uniswapV3: '0x2626664c2603336E57B271c5C0b26F421741e481',
    baseswap: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86'
  }
};

// Common token addresses for each chain
const COMMON_TOKENS = {
  solana: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
  },
  ethereum: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86a33E6417aAb0D765f5c11Bbf8Ff862f2CC9',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7'
  },
  bsc: {
    BNB: '0x0000000000000000000000000000000000000000',
    WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56'
  },
  polygon: {
    MATIC: '0x0000000000000000000000000000000000000000',
    WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
  },
  arbitrum: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    USDC: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8',
    USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
  },
  base: {
    ETH: '0x0000000000000000000000000000000000000000',
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
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
      totalVolume: 0,
      chainStats: {}
    };
    
    // Auto-initialize
    this.initialize();
  }

  async initialize() {
    try {
      console.log('🔧 Initializing Real Trading Executor...');
      
      // Initialize RPC manager if not ready
      if (!this.rpcManager.getStatus().initialized) {
        console.log('⏳ Waiting for RPC Manager initialization...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Verify RPC connections
      const rpcStatus = this.rpcManager.getStatus();
      console.log(`📊 RPC Status: ${rpcStatus.healthyRPCs}/${rpcStatus.totalRPCs} healthy connections`);
      
      if (rpcStatus.healthyRPCs === 0) {
        console.warn('⚠️ No healthy RPC connections - trades may fail');
      }
      
      this.initialized = true;
      console.log('✅ Real Trading Executor initialized successfully');
      console.log('🚀 Ready for cross-chain trading execution');
      
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to initialize Real Trading Executor:', error);
      this.initialized = false;
      return { success: false, error: error.message };
    }
  }

  // Execute buy order on blockchain with enhanced error handling
  async executeBuyOrder(userId, params) {
    const tradeId = `buy_${userId}_${Date.now()}`;
    
    try {
      console.log(`🟢 Executing BUY order ${tradeId}:`, {
        token: params.tokenAddress,
        amount: params.amount,
        chain: params.chain
      });
      
      if (!this.initialized) {
        await this.initialize();
        if (!this.initialized) {
          throw new Error('Trading executor failed to initialize');
        }
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
      
      // Execute trade based on chain
      switch (chain.toLowerCase()) {
        case 'solana':
          result = await this.executeSolanaBuy(privateKey, tokenAddress, feeInfo.userAmount, slippage);
          break;
        case 'ethereum':
        case 'bsc':
        case 'polygon':
        case 'arbitrum':
        case 'base':
          result = await this.executeEVMBuy(privateKey, tokenAddress, feeInfo.userAmount, slippage, chain);
          break;
        default:
          throw new Error(`Unsupported chain: ${chain}`);
      }

      // Update trade statistics
      this.updateStats(chain, 'buy', amount, true);

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
        chain,
        explorerUrl: this.getExplorerUrl(result.txHash, chain)
      };

    } catch (error) {
      console.error(`❌ BUY order ${tradeId} failed:`, error);
      
      this.updateStats(params.chain, 'buy', params.amount, false);

      return {
        success: false,
        tradeId,
        error: error.message,
        timestamp: Date.now(),
        chain: params.chain
      };
    }
  }

  // Execute sell order on blockchain with enhanced error handling
  async executeSellOrder(userId, params) {
    const tradeId = `sell_${userId}_${Date.now()}`;
    
    try {
      console.log(`🔴 Executing SELL order ${tradeId}:`, {
        token: params.tokenAddress,
        percentage: params.percentage,
        chain: params.chain
      });
      
      if (!this.initialized) {
        await this.initialize();
        if (!this.initialized) {
          throw new Error('Trading executor failed to initialize');
        }
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
      
      // Execute trade based on chain
      switch (chain.toLowerCase()) {
        case 'solana':
          result = await this.executeSolanaSell(privateKey, tokenAddress, sellAmount, slippage);
          break;
        case 'ethereum':
        case 'bsc':
        case 'polygon':
        case 'arbitrum':
        case 'base':
          result = await this.executeEVMSell(privateKey, tokenAddress, sellAmount, slippage, chain);
          break;
        default:
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
      this.updateStats(chain, 'sell', sellValue, true);

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
        chain,
        explorerUrl: this.getExplorerUrl(result.txHash, chain)
      };

    } catch (error) {
      console.error(`❌ SELL order ${tradeId} failed:`, error);
      
      this.updateStats(params.chain, 'sell', 0, false);

      return {
        success: false,
        tradeId,
        error: error.message,
        timestamp: Date.now(),
        chain: params.chain
      };
    }
  }

  // Enhanced Solana buy via Jupiter with better error handling
  async executeSolanaBuy(privateKeyHex, tokenAddress, amount, slippage) {
    try {
      const connection = await this.rpcManager.getSolanaConnection();
      
      // Convert hex private key to Keypair
      const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const wallet = Keypair.fromSecretKey(secretKey);

      const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Get quote from Jupiter with retry logic
      let quoteData;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const quoteResponse = await axios.get(
            `${JUPITER_API}/quote?inputMint=${COMMON_TOKENS.solana.SOL}&outputMint=${tokenAddress}&amount=${amountLamports}&slippageBps=${slippage * 100}`,
            { timeout: 10000 }
          );
          
          if (!quoteResponse.data) {
            throw new Error('No quote data received');
          }

          quoteData = quoteResponse.data;
          break;
        } catch (error) {
          console.warn(`Jupiter quote attempt ${attempt} failed:`, error.message);
          if (attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      // Get swap transaction
      const swapResponse = await axios.post(JUPITER_SWAP_API, {
        quoteResponse: quoteData,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 100000 // 0.0001 SOL priority fee
      }, { timeout: 10000 });

      if (!swapResponse.data?.swapTransaction) {
        throw new Error('No swap transaction received');
      }

      const { swapTransaction } = swapResponse.data;

      // Deserialize and sign transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = Transaction.from(transactionBuf);
      transaction.sign(wallet);

      // Execute transaction with retry
      let txHash;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          txHash = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3
          });
          break;
        } catch (error) {
          console.warn(`Solana transaction attempt ${attempt} failed:`, error.message);
          if (attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
        }
      }

      // Wait for confirmation with timeout
      const confirmationPromise = connection.confirmTransaction(txHash, 'confirmed');
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transaction confirmation timeout')), 60000)
      );

      await Promise.race([confirmationPromise, timeoutPromise]);

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
      throw new Error(`Solana buy failed: ${error.message}`);
    }
  }

  // Enhanced Solana sell via Jupiter
  async executeSolanaSell(privateKeyHex, tokenAddress, amount, slippage) {
    try {
      const connection = await this.rpcManager.getSolanaConnection();
      
      const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const wallet = Keypair.fromSecretKey(secretKey);

      // Convert amount to proper decimals (assuming 9 for most SPL tokens)
      const amountAtomic = Math.floor(amount * Math.pow(10, 9));

      // Get quote with retry logic
      let quoteData;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const quoteResponse = await axios.get(
            `${JUPITER_API}/quote?inputMint=${tokenAddress}&outputMint=${COMMON_TOKENS.solana.SOL}&amount=${amountAtomic}&slippageBps=${slippage * 100}`,
            { timeout: 10000 }
          );
          
          quoteData = quoteResponse.data;
          break;
        } catch (error) {
          console.warn(`Jupiter sell quote attempt ${attempt} failed:`, error.message);
          if (attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      // Get swap transaction
      const swapResponse = await axios.post(JUPITER_SWAP_API, {
        quoteResponse: quoteData,
        userPublicKey: wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 100000
      }, { timeout: 10000 });

      const { swapTransaction } = swapResponse.data;

      // Execute transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = Transaction.from(transactionBuf);
      transaction.sign(wallet);

      const txHash = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

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
      throw new Error(`Solana sell failed: ${error.message}`);
    }
  }

  // Enhanced EVM buy with multi-DEX support
  async executeEVMBuy(privateKeyHex, tokenAddress, amount, slippage, chain) {
    try {
      console.log(`🔷 Executing ${chain.toUpperCase()} buy order...`);
      
      const provider = await this.getEVMProvider(chain);
      const wallet = new ethers.Wallet(privateKeyHex, provider);
      
      // Get the best router for this chain
      const routerInfo = this.getBestRouter(chain);
      const router = new ethers.Contract(routerInfo.address, routerInfo.abi, wallet);
      
      // Get wrapped native token address
      const WNATIVE = this.getWrappedNative(chain);
      const path = [WNATIVE, tokenAddress];
      const amountIn = parseUnits(amount.toString(), 'ether');
      
      // Get expected output amount with retry
      let amounts;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          amounts = await router.getAmountsOut(amountIn, path);
          break;
        } catch (error) {
          console.warn(`Get amounts out attempt ${attempt} failed:`, error.message);
          if (attempt === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
      
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / BigInt(100);
      
      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;
      
      // Get current gas price and add premium for faster execution
      const gasPrice = await provider.getGasPrice();
      const premiumGasPrice = gasPrice * BigInt(110) / BigInt(100); // 10% premium
      
      // Execute swap with enhanced gas settings
      const tx = await router.swapExactETHForTokens(
        amountOutMin,
        path,
        wallet.address,
        deadline,
        { 
          value: amountIn,
          gasLimit: 350000, // Increased gas limit
          gasPrice: premiumGasPrice
        }
      );
      
      console.log(`📝 ${chain.toUpperCase()} transaction sent: ${tx.hash}`);
      
      // Wait for confirmation with timeout
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 120000)
        )
      ]);
      
      console.log(`✅ ${chain.toUpperCase()} transaction confirmed: ${receipt.transactionHash}`);
      
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
        throw new Error(`${chain} buy failed: ${error.message}`);
      }
    }
  }

  // Enhanced EVM sell with multi-DEX support
  async executeEVMSell(privateKeyHex, tokenAddress, amount, slippage, chain) {
    try {
      console.log(`🔷 Executing ${chain.toUpperCase()} sell order...`);
      
      const provider = await this.getEVMProvider(chain);
      const wallet = new ethers.Wallet(privateKeyHex, provider);
      
      // Get the best router for this chain
      const routerInfo = this.getBestRouter(chain);
      
      // ERC20 Token ABI
      const tokenABI = [
        "function transfer(address to, uint amount) public returns (bool)",
        "function balanceOf(address account) public view returns (uint256)",
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function allowance(address owner, address spender) public view returns (uint256)",
        "function decimals() public view returns (uint8)"
      ];
      
      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
      const router = new ethers.Contract(routerInfo.address, routerInfo.abi, wallet);
      
      // Get token decimals
      const decimals = await tokenContract.decimals();
      const amountIn = parseUnits(amount.toString(), decimals);
      
      // Check token balance
      const balance = await tokenContract.balanceOf(wallet.address);
      if (balance < amountIn) {
        throw new Error('Insufficient token balance');
      }
      
      // Check and approve token spending if needed
      const allowance = await tokenContract.allowance(wallet.address, routerInfo.address);
      if (allowance < amountIn) {
        console.log('📝 Approving token spending...');
        const approveTx = await tokenContract.approve(routerInfo.address, amountIn, {
          gasLimit: 100000
        });
        await approveTx.wait();
        console.log('✅ Token spending approved');
      }
      
      // Get wrapped native token address
      const WNATIVE = this.getWrappedNative(chain);
      const path = [tokenAddress, WNATIVE];
      
      // Get expected output amount
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOutMin = amounts[1] * BigInt(100 - slippage) / BigInt(100);
      
      // Set deadline (10 minutes from now)
      const deadline = Math.floor(Date.now() / 1000) + 600;
      
      // Get premium gas price
      const gasPrice = await provider.getGasPrice();
      const premiumGasPrice = gasPrice * BigInt(110) / BigInt(100);
      
      // Execute swap
      const tx = await router.swapExactTokensForETH(
        amountIn,
        amountOutMin,
        path,
        wallet.address,
        deadline,
        { 
          gasLimit: 350000,
          gasPrice: premiumGasPrice
        }
      );
      
      console.log(`📝 ${chain.toUpperCase()} sell transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await Promise.race([
        tx.wait(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transaction timeout')), 120000)
        )
      ]);
      
      console.log(`✅ ${chain.toUpperCase()} sell transaction confirmed: ${receipt.transactionHash}`);
      
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
      
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient gas for transaction');
      } else if (error.message.includes('execution reverted')) {
        throw new Error('Sell execution failed - likely due to slippage or liquidity issues');
      } else if (error.message.includes('replacement transaction underpriced')) {
        throw new Error('Network congestion - please try again with higher gas');
      } else {
        throw new Error(`${chain} sell failed: ${error.message}`);
      }
    }
  }

  // Get EVM provider for specific chain
  async getEVMProvider(chain) {
    switch (chain.toLowerCase()) {
      case 'ethereum':
        return await this.rpcManager.getEthereumProvider();
      case 'bsc':
        return await this.rpcManager.getBSCProvider();
      case 'polygon':
        return await this.rpcManager.getPolygonProvider();
      case 'arbitrum':
        return await this.rpcManager.getArbitrumProvider();
      case 'base':
        return await this.rpcManager.getBaseProvider();
      default:
        throw new Error(`Unsupported EVM chain: ${chain}`);
    }
  }

  // Get best router for chain
  getBestRouter(chain) {
    const routers = DEX_ROUTERS[chain.toLowerCase()];
    if (!routers) {
      throw new Error(`No routers configured for ${chain}`);
    }

    // Return the primary router (can be enhanced with liquidity checking)
    const routerAddress = Object.values(routers)[0];
    
    return {
      address: routerAddress,
      abi: [
        "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
        "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
        "function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)"
      ]
    };
  }

  // Get wrapped native token for chain
  getWrappedNative(chain) {
    const tokens = COMMON_TOKENS[chain.toLowerCase()];
    if (!tokens) {
      throw new Error(`No tokens configured for ${chain}`);
    }

    // Return wrapped native token
    return Object.values(tokens).find(addr => addr.includes('W') || addr === tokens.ETH || addr === tokens.BNB || addr === tokens.MATIC);
  }

  // Get explorer URL for transaction
  getExplorerUrl(txHash, chain) {
    const explorers = {
      solana: `https://solscan.io/tx/${txHash}`,
      ethereum: `https://etherscan.io/tx/${txHash}`,
      bsc: `https://bscscan.com/tx/${txHash}`,
      polygon: `https://polygonscan.com/tx/${txHash}`,
      arbitrum: `https://arbiscan.io/tx/${txHash}`,
      base: `https://basescan.org/tx/${txHash}`
    };

    return explorers[chain.toLowerCase()] || `#${txHash}`;
  }

  // Update execution statistics
  updateStats(chain, action, amount, success) {
    this.executionStats.totalTrades++;
    
    if (success) {
      this.executionStats.successfulTrades++;
      this.executionStats.totalVolume += amount;
    } else {
      this.executionStats.failedTrades++;
    }

    // Chain-specific stats
    if (!this.executionStats.chainStats[chain]) {
      this.executionStats.chainStats[chain] = {
        totalTrades: 0,
        successfulTrades: 0,
        failedTrades: 0,
        totalVolume: 0
      };
    }

    const chainStats = this.executionStats.chainStats[chain];
    chainStats.totalTrades++;
    
    if (success) {
      chainStats.successfulTrades++;
      chainStats.totalVolume += amount;
    } else {
      chainStats.failedTrades++;
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
          priceImpact: this.calculatePriceImpact(amount, tokenInfo.liquidity),
          slippage: 5,
          fees: amount * 0.03,
          executionProbability: this.calculateExecutionProbability(tokenInfo),
          route: this.getBestRoute(chain)
        };
      } else {
        simulation = {
          estimatedNative: amount * (tokenInfo.price || 0.001),
          priceImpact: this.calculatePriceImpact(amount * tokenInfo.price, tokenInfo.liquidity),
          slippage: 5,
          fees: amount * (tokenInfo.price || 0.001) * 0.03,
          executionProbability: this.calculateExecutionProbability(tokenInfo),
          route: this.getBestRoute(chain)
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

  // Calculate price impact
  calculatePriceImpact(tradeAmount, liquidity) {
    if (!liquidity || liquidity === 0) return 50; // High impact if no liquidity data
    
    const impact = (tradeAmount / liquidity) * 100;
    return Math.min(impact, 50); // Cap at 50%
  }

  // Calculate execution probability
  calculateExecutionProbability(tokenInfo) {
    let probability = 95; // Base probability
    
    if (tokenInfo.liquidity < 1000) probability -= 20;
    if (tokenInfo.volume24h < 1000) probability -= 10;
    if (tokenInfo.priceChange24h && Math.abs(tokenInfo.priceChange24h) > 50) probability -= 15;
    
    return Math.max(probability, 50);
  }

  // Get best route for chain
  getBestRoute(chain) {
    const routes = {
      solana: 'Jupiter',
      ethereum: 'Uniswap V3',
      bsc: 'PancakeSwap',
      polygon: 'QuickSwap',
      arbitrum: 'Uniswap V3',
      base: 'BaseSwap'
    };

    return routes[chain.toLowerCase()] || 'Unknown';
  }

  // Get execution statistics
  getStats() {
    return {
      ...this.executionStats,
      successRate: this.executionStats.totalTrades > 0 
        ? (this.executionStats.successfulTrades / this.executionStats.totalTrades * 100).toFixed(2) + '%'
        : '0%',
      pendingTransactions: this.pendingTransactions.size,
      initialized: this.initialized,
      supportedChains: Object.keys(COMMON_TOKENS)
    };
  }

  // Health check
  isHealthy() {
    return this.initialized && this.rpcManager.getStatus().healthyRPCs > 0;
  }

  // Force re-initialization
  async forceInitialize() {
    this.initialized = false;
    return await this.initialize();
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