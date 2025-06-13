// services/tokenAnalysisService.js - Advanced Token Analysis & Reports
const axios = require('axios');
const tokenDataService = require('./tokenDataService');
const { getAdvancedEngine } = require('./advancedTradingEngine');

class TokenAnalysisService {
  constructor() {
    this.analysisCache = new Map();
    this.reportSettings = {
      brief: {
        includePrice: true,
        includeBasicMetrics: true,
        includeRisk: true,
        includeLinks: false,
        maxLength: 500
      },
      detailed: {
        includePrice: true,
        includeBasicMetrics: true,
        includeAdvancedMetrics: true,
        includeRisk: true,
        includeHolderAnalysis: true,
        includeSocial: true,
        includeLinks: true,
        includeHistory: true,
        maxLength: 2000
      }
    };
    
    // External platform URLs
    this.platformUrls = {
      dexscreener: (chain, address) => {
        const chainId = this.getChainId(chain);
        return `https://dexscreener.com/${chainId}/${address}`;
      },
      birdeye: (chain, address) => {
        const network = chain === 'solana' ? 'solana' : chain;
        return `https://birdeye.so/token/${address}?chain=${network}`;
      },
      axiom: (chain, address) => {
        return `https://axiom.xyz/token/${address}`;
      },
      geckoterminal: (chain, address) => {
        const network = this.getGeckoNetwork(chain);
        return `https://www.geckoterminal.com/${network}/tokens/${address}`;
      },
      // Platform-specific analyzers
      gt: (chain, address) => `https://gt.io/token/${address}`,
      df: (chain, address) => `https://df.finance/token/${address}`,
      dt: (chain, address) => `https://dt.tools/token/${address}`,
      ds: (chain, address) => `https://ds.app/token/${address}`,
      dv: (chain, address) => `https://dv.live/token/${address}`,
      be: (chain, address) => `https://be.tools/token/${address}`,
      pf: (chain, address) => `https://pf.app/token/${address}`,
      pirb: (chain, address) => `https://pirb.io/token/${address}`,
      pirb_pro: (chain, address) => `https://pro.pirb.io/token/${address}`,
      sect: (chain, address) => `https://sect.tools/token/${address}`
    };
  }

  // Get chain ID for platform URLs
  getChainId(chain) {
    const chainIds = {
      'solana': 'solana',
      'ethereum': 'ethereum',
      'bsc': 'bsc',
      'arbitrum': 'arbitrum',
      'polygon': 'polygon',
      'base': 'base'
    };
    return chainIds[chain] || chain;
  }

  // Get Gecko Terminal network identifier
  getGeckoNetwork(chain) {
    const networks = {
      'solana': 'solana',
      'ethereum': 'eth',
      'bsc': 'bsc',
      'arbitrum': 'arbitrum',
      'polygon': 'polygon_pos',
      'base': 'base'
    };
    return networks[chain] || chain;
  }

  // Perform comprehensive token analysis
  async analyzeToken(tokenAddress, chain) {
    try {
      const cacheKey = `${chain}_${tokenAddress}`;
      
      // Check cache first (5 minute expiry)
      if (this.analysisCache.has(cacheKey)) {
        const cached = this.analysisCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 300000) {
          return cached.analysis;
        }
      }

      // Get basic token data
      const tokenData = await tokenDataService.getTokenData(tokenAddress, chain);
      if (!tokenData) {
        throw new Error('Token data not available');
      }

      // Perform advanced analysis
      const analysis = await this.performAdvancedAnalysis(tokenData, chain);
      
      // Cache result
      this.analysisCache.set(cacheKey, {
        analysis,
        timestamp: Date.now()
      });

      return analysis;
    } catch (err) {
      console.error('Token analysis error:', err);
      throw err;
    }
  }

  // Perform advanced token analysis
  async performAdvancedAnalysis(tokenData, chain) {
    const analysis = {
      basic: {
        symbol: tokenData.symbol,
        name: tokenData.name,
        address: tokenData.address,
        price: tokenData.priceUsd,
        marketCap: tokenData.marketCap,
        liquidity: tokenData.liquidity,
        volume24h: tokenData.volume24h,
        priceChange24h: tokenData.priceChange24h,
        age: tokenData.age,
        ageHours: tokenData.ageHours || 0
      },
      risk: {},
      technical: {},
      social: {},
      holders: {},
      links: {}
    };

    // Risk Analysis
    const engine = getAdvancedEngine();
    const rugScore = await engine.performRugCheck(tokenData.address, chain);
    
    analysis.risk = {
      rugScore,
      riskLevel: rugScore > 70 ? 'HIGH' : rugScore > 40 ? 'MEDIUM' : 'LOW',
      liquidityRisk: tokenData.liquidity < 5000 ? 'HIGH' : tokenData.liquidity < 50000 ? 'MEDIUM' : 'LOW',
      volatilityRisk: Math.abs(tokenData.priceChange24h) > 50 ? 'HIGH' : 
                      Math.abs(tokenData.priceChange24h) > 20 ? 'MEDIUM' : 'LOW',
      ageRisk: analysis.basic.ageHours < 24 ? 'HIGH' : analysis.basic.ageHours < 168 ? 'MEDIUM' : 'LOW'
    };

    // Technical Analysis
    analysis.technical = {
      fdv: tokenData.fullyDilutedValue || tokenData.marketCap,
      liquidityToMcap: tokenData.liquidity / tokenData.marketCap,
      volumeToLiquidity: tokenData.volume24h / tokenData.liquidity,
      priceSupport: this.calculatePriceSupport(tokenData),
      momentum: this.calculateMomentum(tokenData),
      volatility: Math.abs(tokenData.priceChange24h)
    };

    // Social & Community Analysis
    analysis.social = {
      hasTwitter: !!tokenData.twitter,
      hasTelegram: !!tokenData.telegram,
      hasWebsite: !!tokenData.website,
      hasDiscord: !!tokenData.discord,
      socialScore: this.calculateSocialScore(tokenData),
      verified: tokenData.verified || false
    };

    // Holder Analysis (if available)
    analysis.holders = {
      topHolderPercent: tokenData.topHolderPercent || 0,
      holderCount: tokenData.holderCount || 0,
      distribution: this.analyzeHolderDistribution(tokenData),
      concentration: tokenData.topHolderPercent > 30 ? 'HIGH' : 
                    tokenData.topHolderPercent > 10 ? 'MEDIUM' : 'LOW'
    };

    // External Links
    analysis.links = this.generateExternalLinks(tokenData.address, chain);

    return analysis;
  }

  // Calculate price support levels
  calculatePriceSupport(tokenData) {
    const currentPrice = tokenData.priceUsd;
    return {
      strong: currentPrice * 0.8,  // 20% down
      medium: currentPrice * 0.9,  // 10% down
      weak: currentPrice * 0.95    // 5% down
    };
  }

  // Calculate momentum indicators
  calculateMomentum(tokenData) {
    const change = tokenData.priceChange24h;
    const volume = tokenData.volume24h;
    const liquidity = tokenData.liquidity;
    
    let momentum = 'NEUTRAL';
    if (change > 20 && volume > liquidity * 0.5) momentum = 'STRONG_BULLISH';
    else if (change > 10 && volume > liquidity * 0.3) momentum = 'BULLISH';
    else if (change < -20 && volume > liquidity * 0.5) momentum = 'STRONG_BEARISH';
    else if (change < -10 && volume > liquidity * 0.3) momentum = 'BEARISH';
    
    return momentum;
  }

  // Calculate social presence score
  calculateSocialScore(tokenData) {
    let score = 0;
    if (tokenData.twitter) score += 25;
    if (tokenData.telegram) score += 25;
    if (tokenData.website) score += 20;
    if (tokenData.discord) score += 15;
    if (tokenData.verified) score += 15;
    return score;
  }

  // Analyze holder distribution
  analyzeHolderDistribution(tokenData) {
    const topPercent = tokenData.topHolderPercent || 0;
    if (topPercent > 50) return 'VERY_CONCENTRATED';
    if (topPercent > 30) return 'CONCENTRATED';
    if (topPercent > 15) return 'MODERATE';
    return 'DISTRIBUTED';
  }

  // Generate external platform links
  generateExternalLinks(address, chain) {
    const links = {};
    
    Object.entries(this.platformUrls).forEach(([platform, urlGenerator]) => {
      try {
        links[platform] = urlGenerator(chain, address);
      } catch (err) {
        // Skip invalid links
      }
    });

    return links;
  }

  // Generate brief token report
  async generateBriefReport(tokenAddress, chain) {
    try {
      const analysis = await this.analyzeToken(tokenAddress, chain);
      
      let report = `📊 **${analysis.basic.name}** (${analysis.basic.symbol})\n\n`;
      
      // Price & Basic Metrics
      report += `💰 **Price:** $${analysis.basic.price.toFixed(6)}\n`;
      report += `📈 **24h Change:** ${analysis.basic.priceChange24h >= 0 ? '+' : ''}${analysis.basic.priceChange24h.toFixed(2)}%\n`;
      report += `💎 **Market Cap:** $${this.formatNumber(analysis.basic.marketCap)}\n`;
      report += `🌊 **Liquidity:** $${this.formatNumber(analysis.basic.liquidity)}\n`;
      
      // Risk Assessment
      const riskEmoji = analysis.risk.riskLevel === 'LOW' ? '🟢' : 
                       analysis.risk.riskLevel === 'MEDIUM' ? '🟡' : '🔴';
      report += `\n${riskEmoji} **Risk Level:** ${analysis.risk.riskLevel}\n`;
      report += `⏰ **Age:** ${analysis.basic.age}\n`;
      
      // Quick Links
      report += `\n🔗 [DexScreener](${analysis.links.dexscreener}) | [Birdeye](${analysis.links.birdeye})\n`;
      
      return report;
    } catch (err) {
      return `❌ **Error generating report:** ${err.message}`;
    }
  }

  // Generate detailed token report
  async generateDetailedReport(tokenAddress, chain) {
    try {
      const analysis = await this.analyzeToken(tokenAddress, chain);
      
      let report = `📊 **${analysis.basic.name}** (${analysis.basic.symbol})\n`;
      report += `📍 \`${analysis.basic.address}\`\n\n`;
      
      // Price & Market Data
      report += `💰 **Market Data**\n`;
      report += `• Price: $${analysis.basic.price.toFixed(8)}\n`;
      report += `• 24h Change: ${analysis.basic.priceChange24h >= 0 ? '+' : ''}${analysis.basic.priceChange24h.toFixed(2)}%\n`;
      report += `• Market Cap: $${this.formatNumber(analysis.basic.marketCap)}\n`;
      report += `• FDV: $${this.formatNumber(analysis.technical.fdv)}\n`;
      report += `• Liquidity: $${this.formatNumber(analysis.basic.liquidity)}\n`;
      report += `• Volume 24h: $${this.formatNumber(analysis.basic.volume24h)}\n`;
      report += `• Age: ${analysis.basic.age}\n\n`;
      
      // Technical Analysis
      report += `📈 **Technical Analysis**\n`;
      report += `• Momentum: ${analysis.technical.momentum}\n`;
      report += `• Volatility: ${analysis.technical.volatility.toFixed(2)}%\n`;
      report += `• Liq/MC Ratio: ${(analysis.technical.liquidityToMcap * 100).toFixed(2)}%\n`;
      report += `• Vol/Liq Ratio: ${(analysis.technical.volumeToLiquidity * 100).toFixed(2)}%\n\n`;
      
      // Risk Assessment
      const riskEmoji = analysis.risk.riskLevel === 'LOW' ? '🟢' : 
                       analysis.risk.riskLevel === 'MEDIUM' ? '🟡' : '🔴';
      report += `⚠️ **Risk Analysis**\n`;
      report += `• Overall Risk: ${riskEmoji} ${analysis.risk.riskLevel}\n`;
      report += `• Rug Score: ${analysis.risk.rugScore}/100\n`;
      report += `• Liquidity Risk: ${analysis.risk.liquidityRisk}\n`;
      report += `• Age Risk: ${analysis.risk.ageRisk}\n\n`;
      
      // Holder Analysis
      if (analysis.holders.holderCount > 0) {
        report += `👥 **Holder Analysis**\n`;
        report += `• Holders: ${this.formatNumber(analysis.holders.holderCount)}\n`;
        report += `• Top Holder: ${analysis.holders.topHolderPercent.toFixed(1)}%\n`;
        report += `• Distribution: ${analysis.holders.distribution}\n\n`;
      }
      
      // Social & Community
      report += `🌐 **Community**\n`;
      report += `• Social Score: ${analysis.social.socialScore}/100\n`;
      report += `• Twitter: ${analysis.social.hasTwitter ? '✅' : '❌'}\n`;
      report += `• Telegram: ${analysis.social.hasTelegram ? '✅' : '❌'}\n`;
      report += `• Website: ${analysis.social.hasWebsite ? '✅' : '❌'}\n`;
      report += `• Verified: ${analysis.social.verified ? '✅' : '❌'}\n\n`;
      
      // External Links
      report += `🔗 **Analysis Links**\n`;
      report += `• [DexScreener](${analysis.links.dexscreener})\n`;
      report += `• [Birdeye](${analysis.links.birdeye})\n`;
      report += `• [GeckoTerminal](${analysis.links.geckoterminal})\n`;
      report += `• [GT](${analysis.links.gt}) • [DF](${analysis.links.df}) • [DT](${analysis.links.dt})\n`;
      report += `• [DS](${analysis.links.ds}) • [DV](${analysis.links.dv}) • [BE](${analysis.links.be})\n`;
      report += `• [PF](${analysis.links.pf}) • [PIRB](${analysis.links.pirb}) • [SECT](${analysis.links.sect})\n`;
      
      return report;
    } catch (err) {
      return `❌ **Error generating detailed report:** ${err.message}`;
    }
  }

  // Handle direct token paste (returns appropriate report)
  async handleTokenPaste(tokenAddress, chain, reportType = 'brief') {
    try {
      // Validate token address format
      if (!this.isValidTokenAddress(tokenAddress, chain)) {
        return '❌ Invalid token address format';
      }
      
      if (reportType === 'detailed') {
        return await this.generateDetailedReport(tokenAddress, chain);
      } else {
        return await this.generateBriefReport(tokenAddress, chain);
      }
    } catch (err) {
      return `❌ Error analyzing token: ${err.message}`;
    }
  }

  // Validate token address format
  isValidTokenAddress(address, chain) {
    if (chain === 'solana') {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    } else if (['ethereum', 'bsc', 'arbitrum', 'polygon', 'base'].includes(chain)) {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    return false;
  }

  // Format large numbers
  formatNumber(num) {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
  }

  // Clean up expired cache entries
  cleanupCache() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    
    for (const [key, data] of this.analysisCache.entries()) {
      if (now - data.timestamp > maxAge) {
        this.analysisCache.delete(key);
      }
    }
  }
}

// Export singleton
let analysisInstance = null;

module.exports = {
  getTokenAnalysisService: () => {
    if (!analysisInstance) {
      analysisInstance = new TokenAnalysisService();
      // Start cache cleanup interval
      setInterval(() => analysisInstance.cleanupCache(), 300000); // Every 5 minutes
    }
    return analysisInstance;
  },
  TokenAnalysisService
}; 