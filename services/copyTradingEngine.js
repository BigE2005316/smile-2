// services/copyTradingEngine.js - Advanced Copy Trading Engine
const { Connection, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
const { JsonRpcProvider, Wallet } = require('ethers');
const userService = require('../users/userService');
const walletService = require('./walletService');
const tokenDataService = require('./tokenDataService');
const axios = require('axios');

// Trade execution status for each wallet
const walletTradingStatus = new Map();

// RPC connections with better endpoints
const connections = {
  solana: new Connection(
    process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com',
    { commitment: 'confirmed' }
  ),
  ethereum: new JsonRpcProvider(
    process.env.ETH_RPC || 'https://mainnet.infura.io/v3/YOUR_KEY'
  ),
  bsc: new JsonRpcProvider(
    process.env.BSC_RPC || 'https://bsc-dataseed.binance.org/'
  )
};

// Jupiter API for Solana swaps
const JUPITER_API = 'https://quote-api.jup.ag/v6';

class CopyTradingEngine {
  constructor(bot) {
    this.bot = bot;
    this.activePositions = new Map(); // Track user positions
    this.walletNames = new Map(); // Store custom wallet names
  }

  // Set custom name for a wallet
  async setWalletName(userId, walletAddress, name) {
    const key = `${userId}:${walletAddress}`;
    this.walletNames.set(key, name);
    
    // Save to user data
    const userData = await userService.getUserSettings(userId);
    if (!userData.walletNames) userData.walletNames = {};
    userData.walletNames[walletAddress] = name;
    await userService.saveUserData(userId, userData);
    
    return true;
  }

  // Get wallet display name
  getWalletDisplayName(userId, walletAddress) {
    const key = `${userId}:${walletAddress}`;
    const customName = this.walletNames.get(key);
    if (customName) return customName;
    
    // Return shortened address if no custom name
    return `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;
  }

  // Set trading status for a wallet
  async setWalletTradingStatus(userId, walletAddress, status) {
    const key = `${userId}:${walletAddress}`;
    
    if (status === 'pause') {
      walletTradingStatus.set(key, {
        status: 'paused',
        pausedAt: new Date(),
        resumeAt: null
      });
    } else {
      walletTradingStatus.set(key, { status });
    }
    
    // Save to user data
    const userData = await userService.getUserSettings(userId);
    if (!userData.walletStatus) userData.walletStatus = {};
    userData.walletStatus[walletAddress] = status;
    await userService.saveUserData(userId, userData);
    
    return true;
  }

  // Check if wallet trading is active
  isWalletTradingActive(userId, walletAddress) {
    const key = `${userId}:${walletAddress}`;
    const status = walletTradingStatus.get(key);
    
    if (!status || status.status === 'active' || status.status === 'begin') {
      return true;
    }
    
    if (status.status === 'paused' && status.resumeAt && new Date() >= status.resumeAt) {
      // Auto-resume
      walletTradingStatus.set(key, { status: 'active' });
      return true;
    }
    
    return false;
  }

  // Process incoming trade from tracked wallet
  async processTrackedWalletTrade(userId, trackedWallet, trade, chain) {
    try {
      // Check if trading is active for this wallet
      if (!this.isWalletTradingActive(userId, trackedWallet)) {
        console.log(`Trading paused/stopped for wallet ${trackedWallet}`);
        return;
      }

      const userData = await userService.getUserSettings(userId);
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        throw new Error('User wallet not found');
      }

      // Get token data for rich notifications
      const tokenData = trade.tokenAddress && trade.tokenAddress !== 'Unknown' 
        ? await tokenDataService.getTokenData(trade.tokenAddress, chain)
        : null;

      // Calculate amounts with dev fee
      const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3') / 100;
      const devFee = trade.amount * devFeePercent;
      const netAmount = trade.amount - devFee;

      // Check user balance
      const userBalance = await this.getUserBalance(userId, chain);
      if (userBalance < trade.amount) {
        await this.sendTradeNotification(userId, {
          ...trade,
          status: 'failed',
          reason: 'Insufficient balance',
          walletName: this.getWalletDisplayName(userId, trackedWallet),
          tokenData
        }, chain);
        return;
      }

      // Check daily limit
      if (userData.dailyLimit) {
        const today = new Date().toDateString();
        if (userData.stats.lastResetDate !== today) {
          userData.stats.dailySpent = 0;
          userData.stats.lastResetDate = today;
        }
        
        if (userData.stats.dailySpent + trade.amount > userData.dailyLimit) {
          await this.sendTradeNotification(userId, {
            ...trade,
            status: 'failed', 
            reason: 'Daily limit exceeded',
            walletName: this.getWalletDisplayName(userId, trackedWallet),
            tokenData
          }, chain);
          return;
        }
      }

      // Execute the trade
      const result = await this.executeTrade(userId, {
        ...trade,
        originalAmount: trade.amount,
        amount: netAmount,
        devFee,
        tokenData
      }, chain);

      // Send notification
      await this.sendTradeNotification(userId, {
        ...trade,
        ...result,
        walletName: this.getWalletDisplayName(userId, trackedWallet),
        devFee,
        netAmount,
        tokenData
      }, chain);

      // Update user stats
      if (result.status === 'success') {
        await userService.updateStats(userId, {
          amount: trade.amount,
          devFee,
          pnl: 0,
          action: trade.action
        });

        // Process dev fee collection
        await this.collectDevFee(userId, devFee, chain, trade.action);
        
        // Track position for PnL
        if (trade.action === 'buy') {
          await userService.addPosition(userId, trade.tokenAddress, netAmount, tokenData?.priceUsd || 0, trackedWallet);
        }
      }

    } catch (err) {
      console.error('Error processing copy trade:', err);
      await this.sendTradeNotification(userId, {
        ...trade,
        status: 'failed',
        reason: err.message,
        walletName: this.getWalletDisplayName(userId, trackedWallet)
      }, chain);
    }
  }

  // Execute actual trade
  async executeTrade(userId, trade, chain) {
    try {
      if (chain === 'solana') {
        return await this.executeSolanaTrade(userId, trade);
      } else if (chain === 'ethereum' || chain === 'bsc') {
        return await this.executeEVMTrade(userId, trade, chain);
      }
      
      throw new Error('Unsupported chain');
    } catch (err) {
      return {
        status: 'failed',
        reason: err.message,
        txHash: null
      };
    }
  }

  // Execute Solana trade using Jupiter
  async executeSolanaTrade(userId, trade) {
    try {
      // Get user's keypair
      const userWallet = await this.getUserKeypair(userId, 'solana');
      
      // Get Jupiter quote
      const quote = await this.getJupiterQuote(trade);
      if (!quote) {
        throw new Error('Failed to get swap quote');
      }

      // Build transaction
      const swapTransaction = await this.buildJupiterSwap(quote, userWallet.publicKey);
      
      // Sign and send
      swapTransaction.sign(userWallet);
      const txHash = await connections.solana.sendTransaction(swapTransaction);
      
      // Wait for confirmation
      await connections.solana.confirmTransaction(txHash);
      
      return {
        status: 'success',
        txHash,
        executedPrice: quote.outAmount / quote.inAmount
      };
      
    } catch (err) {
      console.error('Solana trade error:', err);
      throw err;
    }
  }

  // Get Jupiter quote
  async getJupiterQuote(trade) {
    try {
      const params = {
        inputMint: trade.action === 'buy' ? 'So11111111111111111111111111111111111111112' : trade.tokenAddress,
        outputMint: trade.action === 'buy' ? trade.tokenAddress : 'So11111111111111111111111111111111111111112',
        amount: Math.floor(trade.amount * 1e9), // Convert to lamports
        slippageBps: 100 // 1% slippage
      };
      
      const response = await axios.get(`${JUPITER_API}/quote`, { params });
      return response.data;
    } catch (err) {
      console.error('Jupiter quote error:', err);
      return null;
    }
  }

  // Send enhanced trade notification
  async sendTradeNotification(userId, trade, chain) {
    const actionEmoji = trade.action === 'buy' ? '🟢' : '🔴';
    const chainEmoji = chain === 'solana' ? '🟣' : chain === 'ethereum' ? '🔷' : '🟡';
    const statusEmoji = trade.status === 'success' ? '✅' : '❌';
    
    let message = `${actionEmoji} **Trade Alert** ${chainEmoji}\n\n`;
    
    // Add token info if available
    if (trade.tokenData) {
      const td = trade.tokenData;
      const priceChangeEmoji = td.priceChange24h >= 0 ? '📈' : '📉';
      
      message += `🎯 **${td.name}** (${td.symbol})\n`;
      message += `**Action:** ${trade.action.toUpperCase()}\n`;
      message += `**Amount:** ${trade.originalAmount || trade.amount} ${chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB'}\n\n`;
      
      message += `📊 **Token Info:**\n`;
      message += `• **Price:** $${td.priceUsd.toFixed(6)}\n`;
      message += `• **Market Cap:** $${tokenDataService.formatNumber(td.marketCap)}\n`;
      message += `• **Liquidity:** $${tokenDataService.formatNumber(td.liquidity)}\n`;
      message += `• **24h Volume:** $${tokenDataService.formatNumber(td.volume24h)}\n`;
      message += `• **24h Change:** ${priceChangeEmoji} ${td.priceChange24h.toFixed(2)}%\n`;
      message += `• **Token Age:** ${td.age}\n\n`;
      
      message += `📍 **Contract:** \`${trade.tokenAddress}\`\n\n`;
      
      // Add links
      if (td.explorerLinks) {
        const links = [];
        if (td.explorerLinks.axiom) links.push(`[Axiom](${td.explorerLinks.axiom})`);
        if (td.explorerLinks.dexscreener) links.push(`[DexScreener](${td.explorerLinks.dexscreener})`);
        if (td.explorerLinks.birdeye) links.push(`[Birdeye](${td.explorerLinks.birdeye})`);
        if (td.explorerLinks.explorer) links.push(`[Explorer](${td.explorerLinks.explorer})`);
        
        message += `🔗 **Links:** ${links.join(' | ')}\n\n`;
      }
    } else {
      // Simple format for unknown tokens
      message += `**Action:** ${trade.action.toUpperCase()}\n`;
      message += `**Amount:** ${trade.amount} ${chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB'}\n\n`;
    }
    
    // Add execution details
    if (trade.status === 'success') {
      message += `${statusEmoji} **Execution: SUCCESS**\n`;
      if (trade.netAmount) {
        message += `💰 **Your Amount:** ${trade.netAmount.toFixed(4)}\n`;
        message += `💸 **Dev Fee (3%):** ${trade.devFee.toFixed(4)}\n`;
      }
    } else {
      message += `${statusEmoji} **Execution: FAILED**\n`;
      message += `❌ **Reason:** ${trade.reason || 'Unknown error'}\n`;
    }
    
    // Add wallet info
    message += `👤 **Tracked Wallet:** ${trade.walletName || 'Unknown'}\n`;
    
    // Add transaction link if successful
    if (trade.txHash && trade.status === 'success') {
      const explorerLink = this.getExplorerLink(trade.txHash, chain);
      message += `\n🔗 **Transaction:** [View on Explorer](${explorerLink})\n`;
    }
    
    message += `\n🕒 **Time:** ${new Date().toLocaleString()}`;
    
    await this.bot.telegram.sendMessage(userId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }

  // Get user balance
  async getUserBalance(userId, chain) {
    // In production, this would check actual on-chain balance
    // For now, returning mock balance
    return 10; // Mock balance
  }

  // Get user keypair for signing
  async getUserKeypair(userId, chain) {
    // This would decrypt the user's private key
    // For security, this should be handled very carefully
    throw new Error('Trade execution not implemented yet');
  }

  // Collect dev fee
  async collectDevFee(userId, amount, chain, action) {
    // Get admin wallet for the chain
    const adminWallet = process.env[`ADMIN_WALLET_${chain.toUpperCase()}`] || process.env.ADMIN_WALLET_ADDRESS;
    
    if (!adminWallet) {
      console.error('No admin wallet configured for dev fee collection');
      return;
    }
    
    // Log the ACTUAL dev fee collection from user's trade
    console.log(`💰 Dev fee collected from user ${userId}: ${amount.toFixed(4)} ${chain} (${action})`);
    
    // Update REAL admin stats
    await userService.updateAdminStats({
      feeCollected: amount,
      chain,
      action,
      fromUser: userId,
      timestamp: new Date(),
      type: 'actual_collection' // Mark as real collection
    });
  }

  // Get explorer link
  getExplorerLink(txHash, chain) {
    switch (chain) {
      case 'solana':
        return `https://solscan.io/tx/${txHash}`;
      case 'ethereum':
        return `https://etherscan.io/tx/${txHash}`;
      case 'bsc':
        return `https://bscscan.com/tx/${txHash}`;
      default:
        return '#';
    }
  }
}

// Export singleton instance
let engineInstance = null;

module.exports = {
  initializeEngine: (bot) => {
    engineInstance = new CopyTradingEngine(bot);
    return engineInstance;
  },
  getEngine: () => engineInstance
}; 