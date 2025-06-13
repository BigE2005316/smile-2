// services/tokenDataService.js - Enhanced token data fetching
const axios = require('axios');
const { Connection, PublicKey } = require('@solana/web3.js');

// Cache token data to reduce API calls
const tokenCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// DexScreener API endpoints
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

// Get token data from DexScreener
async function getTokenFromDexScreener(tokenAddress, chain) {
  try {
    const chainMap = {
      'solana': 'solana',
      'ethereum': 'ethereum',
      'bsc': 'bsc'
    };
    
    const response = await axios.get(`${DEXSCREENER_API}/tokens/${tokenAddress}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'SmileSnipperBot/1.0'
      },
      timeout: 5000
    });
    
    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      // Get the most liquid pair
      const pairs = response.data.pairs
        .filter(p => p.chainId === chainMap[chain])
        .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      
      if (pairs.length > 0) {
        const pair = pairs[0];
        return {
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          address: pair.baseToken.address,
          priceUsd: parseFloat(pair.priceUsd || 0),
          priceNative: parseFloat(pair.priceNative || 0),
          marketCap: pair.marketCap || 0,
          liquidity: pair.liquidity?.usd || 0,
          volume24h: pair.volume?.h24 || 0,
          priceChange24h: pair.priceChange?.h24 || 0,
          holders: null, // DexScreener doesn't provide holder count
          createdAt: pair.pairCreatedAt,
          dexScreenerUrl: pair.url
        };
      }
    }
  } catch (err) {
    console.error('DexScreener API error:', err.message);
  }
  
  return null;
}

// Get Solana token metadata
async function getSolanaTokenMetadata(tokenAddress) {
  try {
    const connection = new Connection(process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com');
    const mintPubkey = new PublicKey(tokenAddress);
    
    // Get token supply for market cap calculation
    const supply = await connection.getTokenSupply(mintPubkey);
    
    return {
      decimals: supply.value.decimals,
      supply: supply.value.uiAmount
    };
  } catch (err) {
    console.error('Solana metadata error:', err.message);
    return null;
  }
}

// Fetch comprehensive token data
async function getTokenData(tokenAddress, chain) {
  // Check cache first
  const cacheKey = `${chain}:${tokenAddress}`;
  const cached = tokenCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  try {
    // Primary source: DexScreener
    let tokenData = await getTokenFromDexScreener(tokenAddress, chain);
    
    // If not found on DexScreener, try chain-specific methods
    if (!tokenData) {
      if (chain === 'solana') {
        const metadata = await getSolanaTokenMetadata(tokenAddress);
        if (metadata) {
          tokenData = {
            name: 'Unknown Token',
            symbol: 'UNKNOWN',
            address: tokenAddress,
            priceUsd: 0,
            priceNative: 0,
            marketCap: 0,
            liquidity: 0,
            volume24h: 0,
            priceChange24h: 0,
            holders: null,
            createdAt: null,
            supply: metadata.supply,
            decimals: metadata.decimals
          };
        }
      }
    }
    
    // Calculate token age if createdAt is available
    if (tokenData && tokenData.createdAt) {
      const created = new Date(tokenData.createdAt);
      const now = new Date();
      const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
      const ageInHours = Math.floor((now - created) / (1000 * 60 * 60));
      
      if (ageInDays > 0) {
        tokenData.age = `${ageInDays} day${ageInDays > 1 ? 's' : ''}`;
      } else {
        tokenData.age = `${ageInHours} hour${ageInHours > 1 ? 's' : ''}`;
      }
    } else {
      tokenData = tokenData || {};
      tokenData.age = 'Unknown';
    }
    
    // Add explorer links
    if (tokenData) {
      tokenData.explorerLinks = getExplorerLinks(tokenAddress, chain);
    }
    
    // Cache the result
    if (tokenData) {
      tokenCache.set(cacheKey, {
        data: tokenData,
        timestamp: Date.now()
      });
    }
    
    return tokenData || {
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      address: tokenAddress,
      priceUsd: 0,
      priceNative: 0,
      marketCap: 0,
      liquidity: 0,
      volume24h: 0,
      priceChange24h: 0,
      holders: null,
      age: 'Unknown',
      explorerLinks: getExplorerLinks(tokenAddress, chain)
    };
    
  } catch (err) {
    console.error('Error fetching token data:', err);
    return {
      name: 'Unknown Token',
      symbol: 'UNKNOWN', 
      address: tokenAddress,
      priceUsd: 0,
      priceNative: 0,
      marketCap: 0,
      liquidity: 0,
      volume24h: 0,
      priceChange24h: 0,
      holders: null,
      age: 'Unknown',
      explorerLinks: getExplorerLinks(tokenAddress, chain)
    };
  }
}

// Get explorer links for token
function getExplorerLinks(tokenAddress, chain) {
  const links = {
    axiom: null,
    dexscreener: null,
    birdeye: null,
    explorer: null
  };
  
  switch (chain) {
    case 'solana':
      links.axiom = `https://axiom.xyz/token/${tokenAddress}`;
      links.dexscreener = `https://dexscreener.com/solana/${tokenAddress}`;
      links.birdeye = `https://birdeye.so/token/${tokenAddress}`;
      links.explorer = `https://solscan.io/token/${tokenAddress}`;
      break;
      
    case 'ethereum':
      links.axiom = `https://axiom.xyz/token/${tokenAddress}`;
      links.dexscreener = `https://dexscreener.com/ethereum/${tokenAddress}`;
      links.explorer = `https://etherscan.io/token/${tokenAddress}`;
      break;
      
    case 'bsc':
      links.dexscreener = `https://dexscreener.com/bsc/${tokenAddress}`;
      links.explorer = `https://bscscan.com/token/${tokenAddress}`;
      break;
  }
  
  return links;
}

// Format number for display
function formatNumber(num) {
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(2);
}

// Format token message
function formatTokenMessage(tokenData, action, amount, chain) {
  const priceChange = tokenData.priceChange24h || 0;
  const priceEmoji = priceChange >= 0 ? '📈' : '📉';
  
  return `🎯 **${tokenData.name}** (${tokenData.symbol})

**Action:** ${action.toUpperCase()}
**Amount:** ${amount} ${chain === 'solana' ? 'SOL' : chain === 'ethereum' ? 'ETH' : 'BNB'}

📊 **Token Info:**
• **Price:** $${tokenData.priceUsd.toFixed(6)}
• **Market Cap:** $${formatNumber(tokenData.marketCap)}
• **Liquidity:** $${formatNumber(tokenData.liquidity)}
• **Volume 24h:** $${formatNumber(tokenData.volume24h)}
• **24h Change:** ${priceEmoji} ${priceChange.toFixed(2)}%
• **Token Age:** ${tokenData.age}
${tokenData.holders ? `• **Holders:** ${formatNumber(tokenData.holders)}` : ''}

📍 **Contract:** \`${tokenData.address}\`

🔗 **Links:**
${tokenData.explorerLinks.axiom ? `[Axiom](${tokenData.explorerLinks.axiom}) | ` : ''}[DexScreener](${tokenData.explorerLinks.dexscreener})${tokenData.explorerLinks.birdeye ? ` | [Birdeye](${tokenData.explorerLinks.birdeye})` : ''} | [Explorer](${tokenData.explorerLinks.explorer})`;
}

module.exports = {
  getTokenData,
  formatTokenMessage,
  formatNumber
}; 