const { Connection, PublicKey } = require('@solana/web3.js');
const { JsonRpcProvider } = require("ethers");
const userService = require('../users/userService');
const tokenDataService = require('./tokenDataService');
const { getEngine } = require('./copyTradingEngine');
require('dotenv').config();

// Improved rate limiter with conservative settings
class RateLimiter {
  constructor(maxRequests = 3, timeWindow = 30000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
    this.backoffMultiplier = 1;
    this.maxBackoff = 4; // Limit maximum backoff
    this.lastLogTime = 0; // Track when we last logged rate limiting
  }

  async throttle() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = Math.min(
        (this.timeWindow - (now - oldestRequest) + 1000) * this.backoffMultiplier,
        30000 // Maximum 30 second wait
      );
      
      // Only log rate limiting every 30 seconds to reduce spam
      if (now - this.lastLogTime > 30000) {
        console.log(`Rate limiting: waiting ${Math.round(waitTime/1000)}s (backoff: ${this.backoffMultiplier}x)`);
        this.lastLogTime = now;
      }
      
      // Increase backoff but cap it
      if (this.backoffMultiplier < this.maxBackoff) {
        this.backoffMultiplier += 0.5;
      }
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
      // Gradually reduce backoff when under limit
      if (this.backoffMultiplier > 1) {
        this.backoffMultiplier = Math.max(1, this.backoffMultiplier - 0.1);
      }
    }
    
    this.requests.push(now);
  }
}

// Create rate limiters with conservative limits
const solanaRateLimiter = new RateLimiter(2, 15000); // 2 requests per 15 seconds
const evmRateLimiter = new RateLimiter(1, 20000); // 1 request per 20 seconds

// RPC connections with better error handling
let solanaConnection;
let ethProvider;
let bscProvider;

function initializeConnections() {
  try {
    const solanaRpcUrl = process.env.SOLANA_RPC || process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
    
    solanaConnection = new Connection(
      solanaRpcUrl,
      {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 30000,
        disableRetryOnRateLimit: true, // Don't auto-retry on rate limits
        httpHeaders: {
          'User-Agent': 'SmileSniper/1.0'
        }
      }
    );

    if (process.env.ETH_RPC) {
      ethProvider = new JsonRpcProvider(process.env.ETH_RPC);
    }

    if (process.env.BSC_RPC) {
      bscProvider = new JsonRpcProvider(process.env.BSC_RPC);
    }
    
    console.log('🔗 RPC connections initialized');
  } catch (err) {
    console.error('Error initializing RPC connections:', err.message);
  }
}

// Track known transactions to avoid duplicates with TTL
const knownTxs = new Map();
const TX_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (reduced from 1 hour)

// Clean up old transactions periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, timestamp] of knownTxs.entries()) {
    if (now - timestamp > TX_CACHE_TTL) {
      knownTxs.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} old transaction records`);
  }
}, 15 * 60 * 1000); // Clean every 15 minutes

// Bot instance for sending notifications
let botInstance = null;
let copyTradingEngine = null;
let isMonitoring = false;
let monitoringEnabled = true;

function setBotInstance(bot) {
  botInstance = bot;
  copyTradingEngine = getEngine();
}

// Enhanced error handling
function handleMonitoringError(error, context) {
  const now = Date.now();
  const errorKey = `${context}_last_error`;
  const lastErrorTime = handleMonitoringError.lastErrors?.[errorKey] || 0;
  
  // Only log errors every 60 seconds to reduce spam
  if (now - lastErrorTime > 60000) {
    if (!handleMonitoringError.lastErrors) {
      handleMonitoringError.lastErrors = {};
    }
    handleMonitoringError.lastErrors[errorKey] = now;
    
    if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
      console.warn(`⚠️ Rate limit hit for ${context} - backing off`);
    } else if (error.message?.includes('Failed to query long-term storage')) {
      console.warn(`⚠️ RPC storage issue for ${context} - retrying later`);
    } else {
      console.error(`❌ Error in ${context}:`, error.message);
    }
  }
  
  // Return appropriate delay based on error type
  if (error.message?.includes('429')) {
    return 30000; // 30 second delay for rate limits
  } else if (error.message?.includes('storage')) {
    return 60000; // 1 minute delay for storage issues
  }
  return 15000; // 15 second delay for other errors
}

// Parse Solana transaction for token swaps (simplified)
async function parseSolanaTransaction(tx, walletAddress) {
  try {
    if (!tx || !tx.meta || tx.meta.err) return null;
    
    const preBalances = tx.meta.preBalances || [];
    const postBalances = tx.meta.postBalances || [];
    const accountKeys = tx.transaction?.message?.accountKeys || 
                       tx.transaction?.message?.staticAccountKeys || 
                       [];
    
    if (!accountKeys || accountKeys.length === 0) return null;
    
    let tokenAddress = null;
    let action = 'unknown';
    let amount = 0;
    
    // Find wallet index
    const walletIndex = accountKeys.findIndex(key => {
      const keyStr = typeof key === 'string' ? key : key.toBase58?.() || key.toString();
      return keyStr === walletAddress;
    });
    
    if (walletIndex !== -1 && walletIndex < preBalances.length && walletIndex < postBalances.length) {
      const solChange = (postBalances[walletIndex] - preBalances[walletIndex]) / 1e9;
      if (solChange < -0.01) { // Spent SOL (likely a buy) - increased threshold
        action = 'buy';
        amount = Math.abs(solChange);
      } else if (solChange > 0.01) { // Received SOL (likely a sell)
        action = 'sell';
        amount = solChange;
      }
    }
    
    // Extract token address from balances
    if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
      for (const balance of tx.meta.postTokenBalances) {
        if (balance.owner === walletAddress && balance.mint) {
          tokenAddress = balance.mint;
          break;
        }
      }
    }
    
    if (!tokenAddress && tx.meta.preTokenBalances && tx.meta.preTokenBalances.length > 0) {
      for (const balance of tx.meta.preTokenBalances) {
        if (balance.owner === walletAddress && balance.mint) {
          tokenAddress = balance.mint;
          break;
        }
      }
    }
    
    const signatures = tx.transaction?.signatures || [];
    const txHash = signatures[0] || 'unknown';
    
    return {
      action,
      amount,
      tokenAddress: tokenAddress || 'Unknown',
      timestamp: new Date(),
      txHash
    };
  } catch (err) {
    console.warn('Transaction parsing error:', err.message);
    return null;
  }
}

// Process trade through copy trading engine
async function processTradeForUsers(trade, walletAddress, chain) {
  if (!copyTradingEngine || !trade || trade.action === 'unknown') {
    return;
  }
  
  try {
    const users = await userService.getAllUsersWithWallets();
    
    for (const [userId, userData] of Object.entries(users)) {
      if (userData.chain?.toLowerCase() !== chain.toLowerCase()) continue;
      if (!userData.wallets?.includes(walletAddress)) continue;
      
      await copyTradingEngine.processTrackedWalletTrade(userId, walletAddress, trade, chain);
    }
  } catch (error) {
    console.warn('Error processing trade for users:', error.message);
  }
}

// Monitor Solana wallets with improved error handling
async function monitorSolanaWallets() {
  if (!monitoringEnabled || !solanaConnection) {
    return;
  }
  
  try {
    const users = await userService.getAllUsersWithWallets();
    const walletsToMonitor = new Set();
    
    for (const [userId, userData] of Object.entries(users)) {
      if (userData.chain?.toLowerCase() !== 'solana') continue;
      
      for (const wallet of userData.wallets || []) {
        walletsToMonitor.add(wallet);
      }
    }
    
    if (walletsToMonitor.size === 0) return;
    
    // Monitor wallets in small batches
    const walletsArray = Array.from(walletsToMonitor);
    const batchSize = 2; // Very small batches
    
    for (let i = 0; i < walletsArray.length; i += batchSize) {
      const batch = walletsArray.slice(i, i + batchSize);
      
      for (const wallet of batch) {
        try {
          await solanaRateLimiter.throttle();
          
          const publicKey = new PublicKey(wallet);
          const signatures = await solanaConnection.getSignaturesForAddress(publicKey, { 
            limit: 1, // Only check 1 most recent transaction
            commitment: 'confirmed'
          });
          
          if (signatures && signatures.length > 0) {
            const sig = signatures[0];
            const txKey = `solana:${sig.signature}`;
            
            if (!knownTxs.has(txKey)) {
              knownTxs.set(txKey, Date.now());
              
              await solanaRateLimiter.throttle();
              
              const tx = await solanaConnection.getTransaction(sig.signature, { 
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
              });
              
              if (tx) {
                const trade = await parseSolanaTransaction(tx, wallet);
                if (trade && trade.action !== 'unknown') {
                  await processTradeForUsers(trade, wallet, 'solana');
                }
              }
            }
          }
        } catch (err) {
          const delay = handleMonitoringError(err, `Solana wallet ${wallet}`);
          if (delay > 15000) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      // Small delay between batches
      if (i + batchSize < walletsArray.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (err) {
    handleMonitoringError(err, 'Solana monitoring');
  }
}

// Start monitoring with much longer intervals
function startMonitoring() {
  if (isMonitoring) {
    console.log('⚠️ Monitoring already started');
    return;
  }
  
  isMonitoring = true;
  console.log('🔍 Starting wallet monitoring with conservative rate limiting...');
  
  initializeConnections();
  
  // Much longer intervals to reduce load
  const solanaInterval = setInterval(monitorSolanaWallets, 45000); // 45 seconds
  
  // Start with initial delay
  setTimeout(monitorSolanaWallets, 5000);
  
  console.log('✅ Wallet monitoring started with conservative rate limiting');
  
  // Store intervals for cleanup
  startMonitoring.intervals = [solanaInterval];
}

// Stop monitoring function
function stopMonitoring() {
  isMonitoring = false;
  monitoringEnabled = false;
  
  if (startMonitoring.intervals) {
    startMonitoring.intervals.forEach(interval => clearInterval(interval));
    startMonitoring.intervals = [];
  }
  
  console.log('🛑 Wallet monitoring stopped');
}

// Toggle monitoring
function toggleMonitoring(enabled) {
  monitoringEnabled = enabled;
  console.log(`📡 Monitoring ${enabled ? 'enabled' : 'disabled'}`);
}

module.exports = {
  setBotInstance,
  startMonitoring,
  stopMonitoring,
  toggleMonitoring,
  monitorSolanaWallets
}; 