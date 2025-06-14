// users/userService.js - Enhanced User Service with Position Tracking
const fs = require('fs');
const path = require('path');
const redis = require('redis');

const DATA_FILE = path.join(__dirname, 'userData.json');

// Redis client setup
let redisClient = null;

async function initRedis() {
  if (!redisClient) {
    try {
      redisClient = redis.createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });
      
      redisClient.on('error', (err) => {
        console.log('Redis Client Error:', err);
        redisClient = null; // Fall back to file storage
      });
      
      await redisClient.connect();
      console.log('✅ Connected to Redis');
    } catch (err) {
      console.log('❌ Redis connection failed, using file storage:', err.message);
      redisClient = null;
    }
  }
  return redisClient;
}

// Load all users from file (fallback)
function loadUserData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return {};
  } catch (err) {
    console.error('Error loading user data from file:', err);
    return {};
  }
}

// Persist to disk (fallback)
function saveUserData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving user data to file:', err);
  }
}

// Get user data from Redis or file
async function getUserData(userId) {
  const client = await initRedis();
  
  if (client) {
    try {
      const userData = await client.get(`user:${userId}`);
      return userData ? JSON.parse(userData) : null;
    } catch (err) {
      console.error('Redis get error:', err);
    }
  }
  
  // Fallback to file storage
  const allData = loadUserData();
  return allData[userId] || null;
}

// Save user data to Redis or file
async function saveUserData(userId, userData) {
  const client = await initRedis();
  
  if (client) {
    try {
      await client.set(`user:${userId}`, JSON.stringify(userData));
      return;
    } catch (err) {
      console.error('Redis set error:', err);
    }
  }
  
  // Fallback to file storage
  const allData = loadUserData();
  allData[userId] = userData;
  saveUserData(allData);
}

// Helpers
function createDefaultUser() {
  return {
      wallets: [],
      chain: null,
      amount: null,
      slippage: 5,
      sellTargets: [],
      dailyLimit: null,
    stopLoss: false,
    copySettings: {
      copySells: true,        // Copy sells from tracked wallets
      customTPSL: false,      // Use custom TP/SL instead of copying sells
      takeProfit: [],         // Custom take profit levels
      stopLossPercent: 0,     // Trailing stop loss percentage
      sellMode: 'proportional' // 'proportional' or 'manual'
    },
    positions: {},            // Track positions bought via copy trading
    stats: {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      dailySpent: 0,
      lastResetDate: new Date().toDateString(),
      lastActive: new Date().toISOString()
    },
    walletNames: {},
    smartSlippage: false
  };
}

async function ensureUser(userId) {
  let userData = await getUserData(userId);
  if (!userData) {
    userData = createDefaultUser();
    await saveUserData(userId, userData);
  }
  
  // Ensure all new fields exist (for backward compatibility)
  if (!userData.copySettings) {
    userData.copySettings = {
      copySells: true,
      customTPSL: false,
      takeProfit: [],
      stopLossPercent: 0,
      sellMode: 'proportional'
    };
  }
  
  if (!userData.positions) {
    userData.positions = {};
  }
  
  if (!userData.stats) {
    userData.stats = {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      dailySpent: 0,
      lastResetDate: new Date().toDateString(),
      lastActive: new Date().toISOString()
    };
  } else if (!userData.stats.lastActive) {
    userData.stats.lastActive = new Date().toISOString();
  }
  
  if (!userData.walletNames) {
    userData.walletNames = {};
  }
  
  if (userData.slippage === undefined) {
    userData.slippage = 5;
  }
  
  if (userData.smartSlippage === undefined) {
    userData.smartSlippage = false;
  }
  
  return userData;
}

// Add a wallet
async function addWallet(userId, wallet) {
  const userData = await ensureUser(userId);
  if (!userData.wallets.includes(wallet)) {
    userData.wallets.push(wallet);
    await saveUserData(userId, userData);
  }
}

// Remove a wallet
async function removeWallet(userId, wallet) {
  const userData = await ensureUser(userId);
  userData.wallets = userData.wallets.filter(w => w !== wallet);
  await saveUserData(userId, userData);
}

// Set chain
async function setChain(userId, chain) {
  const userData = await ensureUser(userId);
  userData.chain = chain;
  await saveUserData(userId, userData);
}

// Set trade amount
async function setAmount(userId, amount) {
  const userData = await ensureUser(userId);
  userData.amount = amount;
  await saveUserData(userId, userData);
}

// Set slippage
async function setSlippage(userId, slippage, smartSlippage = false) {
  const userData = await ensureUser(userId);
  userData.slippage = slippage;
  userData.smartSlippage = smartSlippage;
  await saveUserData(userId, userData);
}

// Set sell targets
async function setSellTargets(userId, targets) {
  const userData = await ensureUser(userId);
  userData.sellTargets = targets;
  await saveUserData(userId, userData);
}

// Set daily limit
async function setDailyLimit(userId, limit) {
  const userData = await ensureUser(userId);
  userData.dailyLimit = limit;
  await saveUserData(userId, userData);
}

// Enable/disable stop-loss
async function setStopLoss(userId, enabled) {
  const userData = await ensureUser(userId);
  userData.stopLoss = Boolean(enabled);
  await saveUserData(userId, userData);
}

// Update trading stats (only count ACTUAL trades)
async function updateStats(userId, trade) {
  const userData = await ensureUser(userId);
  
  // Reset daily spent if it's a new day
  const today = new Date().toDateString();
  if (userData.stats.lastResetDate !== today) {
    userData.stats.dailySpent = 0;
    userData.stats.lastResetDate = today;
  }
  
  // Only update stats if it's an actual executed trade
  if (trade.executed || trade.amount > 0) {
    userData.stats.totalTrades++;
    userData.stats.dailySpent += trade.amount || 0;
    
    if (trade.pnl > 0) {
      userData.stats.wins++;
    } else if (trade.pnl < 0) {
      userData.stats.losses++;
    }
    
    userData.stats.totalPnL += trade.pnl || 0;
  }
  
  // Update last active timestamp
  userData.stats.lastActive = new Date().toISOString();
  
  await saveUserData(userId, userData);
}

// Get full settings
async function getUserSettings(userId) {
  return await getUserData(userId);
}

// Get all users with wallets (for monitoring)
async function getAllUsersWithWallets() {
  const client = await initRedis();
  
  if (client) {
    try {
      const keys = await client.keys('user:*');
      const users = {};
      
      for (const key of keys) {
        const userData = await client.get(key);
        if (userData) {
          const parsed = JSON.parse(userData);
          if (parsed.wallets && parsed.wallets.length > 0) {
            const userId = key.replace('user:', '');
            users[userId] = parsed;
          }
        }
      }
      
      return users;
    } catch (err) {
      console.error('Redis getAllUsers error:', err);
    }
  }
  
  // Fallback to file storage
  const allData = loadUserData();
  const usersWithWallets = {};
  
  for (const [userId, userData] of Object.entries(allData)) {
    if (userData.wallets && userData.wallets.length > 0) {
      usersWithWallets[userId] = userData;
    }
  }
  
  return usersWithWallets;
}

// Copy selling settings
async function setCopySells(userId, enabled) {
  const userData = await ensureUser(userId);
  if (!userData.copySettings) {
    userData.copySettings = {
      copySells: true,
      customTPSL: false,
      takeProfit: [],
      stopLossPercent: 0,
      sellMode: 'proportional'
    };
  }
  userData.copySettings.copySells = Boolean(enabled);
  await saveUserData(userId, userData);
}

async function setCustomTPSL(userId, enabled) {
  const userData = await ensureUser(userId);
  if (!userData.copySettings) {
    userData.copySettings = {
      copySells: true,
      customTPSL: false,
      takeProfit: [],
      stopLossPercent: 0,
      sellMode: 'proportional'
    };
  }
  userData.copySettings.customTPSL = Boolean(enabled);
  await saveUserData(userId, userData);
}

async function setTakeProfit(userId, tpLevels) {
  const userData = await ensureUser(userId);
  if (!userData.copySettings) {
    userData.copySettings = {
      copySells: true,
      customTPSL: false,
      takeProfit: [],
      stopLossPercent: 0,
      sellMode: 'proportional'
    };
  }
  userData.copySettings.takeProfit = tpLevels;
  await saveUserData(userId, userData);
}

async function setStopLossPercent(userId, percent) {
  const userData = await ensureUser(userId);
  if (!userData.copySettings) {
    userData.copySettings = {
      copySells: true,
      customTPSL: false,
      takeProfit: [],
      stopLossPercent: 0,
      sellMode: 'proportional'
    };
  }
  userData.copySettings.stopLossPercent = percent;
  await saveUserData(userId, userData);
}

async function setSellMode(userId, mode) {
  const userData = await ensureUser(userId);
  if (!userData.copySettings) {
    userData.copySettings = {
      copySells: true,
      customTPSL: false,
      takeProfit: [],
      stopLossPercent: 0,
      sellMode: 'proportional'
    };
  }
  userData.copySettings.sellMode = mode; // 'proportional' or 'manual'
  await saveUserData(userId, userData);
}

// Position tracking for copy trades
async function addPosition(userId, tokenAddress, amount, price, sourceWallet) {
  const userData = await ensureUser(userId);
  
  if (!userData.positions) {
    userData.positions = {};
  }
  
  if (!userData.positions[tokenAddress]) {
    userData.positions[tokenAddress] = {
      totalAmount: 0,
      avgPrice: 0,
      tokenSymbol: 'Unknown',
      tokenName: 'Unknown Token',
      chain: userData.chain || 'solana',
      copyTrades: []
    };
  }
  
  const position = userData.positions[tokenAddress];
  
  // Add new copy trade
  position.copyTrades.push({
    amount,
    price,
    sourceWallet,
    timestamp: new Date().toISOString()
  });
  
  // Update total position
  const totalValue = position.totalAmount * position.avgPrice + amount * price;
  position.totalAmount += amount;
  position.avgPrice = totalValue / position.totalAmount;
  
  await saveUserData(userId, userData);
  
  return position;
}

async function sellPosition(userId, tokenAddress, sellPercentage, currentPrice) {
  const userData = await ensureUser(userId);
  
  if (!userData.positions || !userData.positions[tokenAddress]) {
    return { success: false, message: 'No position found for this token' };
  }
  
  const position = userData.positions[tokenAddress];
  const sellAmount = position.totalAmount * (sellPercentage / 100);
  
  if (sellAmount <= 0) {
    return { success: false, message: 'Invalid sell amount' };
  }
  
  // Calculate PnL
  const pnl = sellAmount * (currentPrice - position.avgPrice);
  
  // Update position
  position.totalAmount -= sellAmount;
  
  // Add sell trade record
  if (!position.copyTrades) position.copyTrades = [];
  position.copyTrades.push({
    type: 'sell',
    amount: sellAmount,
    price: currentPrice,
    pnl,
    timestamp: new Date().toISOString()
  });
  
  // Remove position if fully sold
  if (position.totalAmount <= 0.001) {
    delete userData.positions[tokenAddress];
  }
  
  await saveUserData(userId, userData);
  
  return {
    success: true,
    sellAmount,
    pnl,
    remainingAmount: position.totalAmount
  };
}

// Get user positions
async function getUserPositions(userId) {
  const userData = await ensureUser(userId);
  const positions = [];
  
  if (!userData.positions) {
    return positions;
  }
  
  for (const [tokenAddress, position] of Object.entries(userData.positions)) {
    positions.push({
      tokenAddress,
      tokenSymbol: position.tokenSymbol || 'Unknown',
      tokenName: position.tokenName || 'Unknown Token',
      amount: position.totalAmount,
      avgBuyPrice: position.avgPrice,
      chain: position.chain || userData.chain || 'solana',
      trades: position.copyTrades || []
    });
  }
  
  return positions;
}

// Admin Statistics Functions - ONLY COUNT REAL FEES
async function updateAdminStats(feeData) {
  const client = await initRedis();
  const today = new Date().toDateString();
  
  // Only count fees from actual trades, not monitoring alerts
  if (!feeData.type || feeData.type !== 'actual_collection') {
    console.log('Skipping non-actual fee collection stats update');
    return;
  }
  
  if (client) {
    try {
      // Update total fees
      await client.hIncrByFloat('admin:realStats', 'totalFees', feeData.feeCollected);
      await client.hIncrByFloat('admin:realStats', `${feeData.chain}Fees`, feeData.feeCollected);
      await client.hIncrByFloat('admin:realStats', `${feeData.action}Fees`, feeData.feeCollected);
      
      // Update daily fees
      await client.hIncrByFloat(`admin:realDaily:${today}`, 'fees', feeData.feeCollected);
      
      // Log fee collection with user info
      await client.lPush('admin:realFeeLogs', JSON.stringify({
        ...feeData,
        timestamp: new Date().toISOString()
      }));
      
      // Keep only last 1000 logs
      await client.lTrim('admin:realFeeLogs', 0, 999);
      
    } catch (err) {
      console.error('Error updating admin stats:', err);
    }
  }
}

async function getAdminStats() {
  const client = await initRedis();
  const stats = {
    totalFees: 0,
    solanaFees: 0,
    ethereumFees: 0,
    bscFees: 0,
    buyFees: 0,
    sellFees: 0,
    todayFees: 0,
    weekFees: 0,
    monthFees: 0
  };
  
  if (client) {
    try {
      // Get REAL stats only
      const adminStats = await client.hGetAll('admin:realStats');
      Object.assign(stats, {
        totalFees: parseFloat(adminStats.totalFees || 0),
        solanaFees: parseFloat(adminStats.solanaFees || 0),
        ethereumFees: parseFloat(adminStats.ethereumFees || 0),
        bscFees: parseFloat(adminStats.bscFees || 0),
        buyFees: parseFloat(adminStats.buyFees || 0),
        sellFees: parseFloat(adminStats.sellFees || 0)
      });
      
      // Get time-based fees
      const today = new Date();
      const todayKey = today.toDateString();
      const todayStats = await client.hGetAll(`admin:realDaily:${todayKey}`);
      stats.todayFees = parseFloat(todayStats.fees || 0);
      
      // Calculate week fees
      let weekFees = 0;
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dayStats = await client.hGetAll(`admin:realDaily:${date.toDateString()}`);
        weekFees += parseFloat(dayStats.fees || 0);
      }
      stats.weekFees = weekFees;
      
      // Calculate month fees
      let monthFees = 0;
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dayStats = await client.hGetAll(`admin:realDaily:${date.toDateString()}`);
        monthFees += parseFloat(dayStats.fees || 0);
      }
      stats.monthFees = monthFees;
      
    } catch (err) {
      console.error('Error getting admin stats:', err);
    }
  }
  
  return stats;
}

async function updateAdminConfig(config) {
  const client = await initRedis();
  
  if (client) {
    try {
      for (const [key, value] of Object.entries(config)) {
        await client.hSet('admin:config', key, value.toString());
      }
    } catch (err) {
      console.error('Error updating admin config:', err);
    }
  }
}

async function getGlobalUserStats() {
  const client = await initRedis();
  const stats = {
    totalUsers: 0,
    activeUsers24h: 0,
    activeUsers7d: 0,
    solanaUsers: 0,
    ethereumUsers: 0,
    bscUsers: 0,
    polygonUsers: 0,
    arbitrumUsers: 0,
    baseUsers: 0,
    totalWallets: 0,
    avgWalletsPerUser: 0,
    usersWithPositions: 0,
    totalPositions: 0,
    newUsersToday: 0,
    newUsersWeek: 0
  };
  
  const users = await getAllUsersWithWallets();
  const allUsers = await getAllUsers();
  
  stats.totalUsers = Object.keys(allUsers).length;
  
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const week = 7 * day;
  
  for (const [userId, userData] of Object.entries(allUsers)) {
    // Count by chain
    if (userData.chain === 'solana') stats.solanaUsers++;
    else if (userData.chain === 'ethereum') stats.ethereumUsers++;
    else if (userData.chain === 'bsc') stats.bscUsers++;
    else if (userData.chain === 'polygon') stats.polygonUsers++;
    else if (userData.chain === 'arbitrum') stats.arbitrumUsers++;
    else if (userData.chain === 'base') stats.baseUsers++;
    
    // Count wallets
    stats.totalWallets += (userData.wallets || []).length;
    
    // Count positions
    if (userData.positions && Object.keys(userData.positions).length > 0) {
      stats.usersWithPositions++;
      stats.totalPositions += Object.keys(userData.positions).length;
    }
    
    // Activity tracking
    const lastActive = userData.stats?.lastActive;
    if (lastActive) {
      const timeSince = now - new Date(lastActive).getTime();
      if (timeSince < day) stats.activeUsers24h++;
      if (timeSince < week) stats.activeUsers7d++;
    }
  }
  
  stats.avgWalletsPerUser = stats.totalUsers > 0 ? stats.totalWallets / stats.totalUsers : 0;
  
  return stats;
}

// Get all users (admin function)
async function getAllUsers() {
  try {
    const client = await initRedis();
    
    if (client) {
      const userKeys = await client.keys('user:*');
      const users = {};
      
      for (const key of userKeys) {
        try {
          const userData = await client.get(key);
          if (userData) {
            const user = JSON.parse(userData);
            const userId = key.replace('user:', '');
            users[userId] = { ...user, id: userId, userId };
          }
        } catch (err) {
          console.error(`Error parsing user data for ${key}:`, err);
        }
      }
      
      return users;
    } else {
      // Fallback to file storage
      return loadUserData();
    }
  } catch (err) {
    console.error('Error getting all users:', err);
    return {};
  }
}

// Get admin data
async function getAdminData() {
  try {
    const client = await initRedis();
    const adminKey = 'admin:data';
    
    if (client) {
      const adminData = await client.get(adminKey);
      if (adminData) {
        return JSON.parse(adminData);
      }
    } else {
      // Fallback to file storage
      const adminFile = path.join(__dirname, 'adminData.json');
      if (fs.existsSync(adminFile)) {
        const data = fs.readFileSync(adminFile, 'utf8');
        return JSON.parse(data);
      }
    }
    
    // Return default admin data
    return {
      settings: {},
      stats: {
        totalTrades: 0,
        tradesToday: 0,
        volume24h: 0,
        totalVolume: 0,
        feesCollected24h: 0,
        totalFeesCollected: 0,
        pendingWithdraw: 0
      },
      users: {},
      lastReset: new Date().toDateString()
    };
  } catch (err) {
    console.error('Error getting admin data:', err);
    return {
      settings: {},
      stats: {},
      users: {},
      lastReset: new Date().toDateString()
    };
  }
}

// Save admin data
async function saveAdminData(adminData) {
  try {
    const client = await initRedis();
    const adminKey = 'admin:data';
    
    if (client) {
      await client.set(adminKey, JSON.stringify(adminData));
    } else {
      // Fallback to file storage
      const adminFile = path.join(__dirname, 'adminData.json');
      fs.writeFileSync(adminFile, JSON.stringify(adminData, null, 2));
    }
  } catch (err) {
    console.error('Error saving admin data:', err);
    throw err;
  }
}

// Update admin statistics
async function updateAdminStats(statsUpdate) {
  try {
    const adminData = await getAdminData();
    
    if (!adminData.stats) {
      adminData.stats = {
        totalTrades: 0,
        tradesToday: 0,
        volume24h: 0,
        totalVolume: 0,
        feesCollected24h: 0,
        totalFeesCollected: 0,
        pendingWithdraw: 0
      };
    }
    
    // Check if we need to reset daily stats
    const today = new Date().toDateString();
    if (adminData.lastReset !== today) {
      adminData.stats.tradesToday = 0;
      adminData.stats.volume24h = 0;
      adminData.stats.feesCollected24h = 0;
      adminData.lastReset = today;
    }
    
    // Update stats
    if (statsUpdate.feeCollected) {
      adminData.stats.feesCollected24h += statsUpdate.feeCollected;
      adminData.stats.totalFeesCollected += statsUpdate.feeCollected;
    }
    
    if (statsUpdate.tradeVolume) {
      adminData.stats.volume24h += statsUpdate.tradeVolume;
      adminData.stats.totalVolume += statsUpdate.tradeVolume;
    }
    
    if (statsUpdate.tradeCount) {
      adminData.stats.tradesToday += statsUpdate.tradeCount;
      adminData.stats.totalTrades += statsUpdate.tradeCount;
    }
    
    await saveAdminData(adminData);
    return adminData.stats;
  } catch (err) {
    console.error('Error updating admin stats:', err);
    throw err;
  }
}

// Update user's last active timestamp
async function updateLastActive(userId) {
  try {
    const userData = await getUserSettings(userId);
    if (!userData) return;
    
    if (!userData.stats) {
      userData.stats = {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalPnL: 0,
        dailySpent: 0,
        lastResetDate: new Date().toDateString(),
        lastActive: new Date().toISOString()
      };
    } else {
      userData.stats.lastActive = new Date().toISOString();
    }
    
    await saveUserData(userId, userData);
  } catch (err) {
    console.error('Error updating last active:', err);
  }
}

module.exports = {
  addWallet,
  removeWallet,
  setChain,
  setAmount,
  setSlippage,
  setSellTargets,
  setDailyLimit,
  setStopLoss,
  getUserSettings,
  updateStats,
  getAllUsersWithWallets,
  initRedis,
  // Copy selling functions
  setCopySells,
  setCustomTPSL,
  setTakeProfit,
  setStopLossPercent,
  setSellMode,
  // Position tracking
  addPosition,
  sellPosition,
  getUserPositions,
  // Admin functions
  updateAdminStats,
  getAdminStats,
  updateAdminConfig,
  getGlobalUserStats,
  getAllUsers,
  getAdminData,
  saveAdminData,
  updateLastActive,
  // Add the missing saveUserData function
  saveUserData
};