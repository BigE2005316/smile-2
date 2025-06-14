// services/walletService.js - Enhanced Custodial Wallet Management
const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js');
const { ethers, JsonRpcProvider } = require('ethers');
const crypto = require('crypto');
const userService = require('../users/userService');
const { getRPCManager } = require('./rpcManager');
const axios = require('axios');

// Enhanced encryption using AES-256-GCM for better security
const ENCRYPTION_KEY = process.env.WALLET_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

console.log('🔐 Wallet encryption key length:', ENCRYPTION_KEY.length);

class WalletService {
  constructor() {
    this.rpcManager = getRPCManager();
    this.priceCache = new Map();
    this.priceCacheTimeout = 30000; // 30 seconds
    this.balanceCache = new Map();
    this.balanceCacheTimeout = 15000; // 15 seconds
  }

  // Enhanced encryption with authentication
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(text, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const tag = cipher.getAuthTag();
      
      // Format: iv:tag:encrypted
      return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
      console.error('Encryption error:', error.message);
      throw new Error('Failed to encrypt data');
    }
  }

  // Enhanced decryption with authentication
  decrypt(text) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Invalid encrypted text format');
      }

      const parts = text.split(':');
      if (parts.length !== 3) {
        // Handle legacy format (fallback)
        return this.decryptLegacy(text);
      }

      const iv = Buffer.from(parts[0], 'hex');
      const tag = Buffer.from(parts[1], 'hex');
      const encrypted = Buffer.from(parts[2], 'hex');
      
      const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption error:', error.message);
      throw new Error('Failed to decrypt data - may be corrupted or key changed');
    }
  }

  // Legacy decryption for backward compatibility
  decryptLegacy(text) {
    try {
      const textParts = text.split(':');
      if (textParts.length !== 2) {
        throw new Error('Invalid legacy encrypted text format');
      }
      
      const iv = Buffer.from(textParts[0], 'hex');
      const encryptedText = Buffer.from(textParts[1], 'hex');
      const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Failed to decrypt legacy format');
    }
  }

  // Generate Solana wallet with enhanced entropy
  generateSolanaWallet() {
    try {
      const keypair = Keypair.generate();
      return {
        address: keypair.publicKey.toString(),
        privateKey: Buffer.from(keypair.secretKey).toString('hex'),
        mnemonic: null,
        chain: 'solana'
      };
    } catch (error) {
      console.error('Error generating Solana wallet:', error);
      throw new Error('Failed to generate Solana wallet');
    }
  }

  // Generate EVM wallet with enhanced entropy
  generateEVMWallet() {
    try {
      const wallet = ethers.Wallet.createRandom();
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: wallet.mnemonic.phrase,
        chain: 'evm'
      };
    } catch (error) {
      console.error('Error generating EVM wallet:', error);
      throw new Error('Failed to generate EVM wallet');
    }
  }

  // Get cached price or fetch new one
  async getTokenPrice(chain) {
    const cacheKey = `price_${chain}`;
    const cached = this.priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.priceCacheTimeout) {
      return cached.price;
    }

    try {
      const priceApis = {
        solana: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        ethereum: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
        bsc: 'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd',
        polygon: 'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=usd',
        arbitrum: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', // Uses ETH price
        base: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd' // Uses ETH price
      };

      const coinIds = {
        solana: 'solana',
        ethereum: 'ethereum',
        bsc: 'binancecoin',
        polygon: 'matic-network',
        arbitrum: 'ethereum',
        base: 'ethereum'
      };

      const response = await axios.get(priceApis[chain], { timeout: 5000 });
      const coinId = coinIds[chain];
      const price = response.data[coinId]?.usd || 0;

      // Cache the price
      this.priceCache.set(cacheKey, { price, timestamp: Date.now() });
      
      return price;
    } catch (error) {
      console.warn('Error fetching price for', chain, ':', error.message);
      
      // Return cached price if available, even if expired
      if (cached) {
        return cached.price;
      }
      
      // Fallback prices if API fails
      const fallbackPrices = {
        solana: 150,
        ethereum: 3000,
        bsc: 300,
        polygon: 0.5,
        arbitrum: 3000,
        base: 3000
      };
      
      return fallbackPrices[chain] || 0;
    }
  }

  // Create or get user wallet
  async getOrCreateWallet(userId, chain) {
    try {
      const userData = await userService.getUserSettings(userId);
      
      // Check if user already has a custodial wallet for this chain
      if (userData.custodialWallets && userData.custodialWallets[chain]) {
        // Get balance to verify wallet is accessible
        try {
          const address = userData.custodialWallets[chain].address;
          const balance = await this.getWalletBalance(address, chain);
          
          return {
            address,
            exists: true,
            balance: balance.balance,
            symbol: balance.symbol,
            usdValue: balance.usdValue
          };
        } catch (balanceError) {
          console.warn(`Error getting balance for existing wallet: ${balanceError.message}`);
          // Continue to regenerate wallet if balance check fails
        }
      }
      
      // Generate new wallet based on chain
      let wallet;
      if (chain === 'solana') {
        wallet = this.generateSolanaWallet();
      } else if (['ethereum', 'bsc', 'polygon', 'arbitrum', 'base'].includes(chain)) {
        wallet = this.generateEVMWallet();
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      // Encrypt and store the private key
      const encryptedPrivateKey = this.encrypt(wallet.privateKey);
      const encryptedMnemonic = wallet.mnemonic ? this.encrypt(wallet.mnemonic) : null;
      
      // Save wallet info to user data
      if (!userData.custodialWallets) {
        userData.custodialWallets = {};
      }
      
      userData.custodialWallets[chain] = {
        address: wallet.address,
        privateKey: encryptedPrivateKey,
        mnemonic: encryptedMnemonic,
        createdAt: new Date().toISOString(),
        balance: 0,
        totalReceived: 0,
        totalSent: 0,
        txCount: 0,
        lastUpdated: new Date().toISOString()
      };
      
      await userService.saveUserData(userId, userData);
      
      console.log(`✅ Created new ${chain} wallet for user ${userId}:`, wallet.address);
      
      // Get initial balance
      const balanceInfo = await this.getWalletBalance(wallet.address, chain);
      
      return {
        address: wallet.address,
        mnemonic: wallet.mnemonic,
        exists: false,
        balance: balanceInfo.balance,
        symbol: balanceInfo.symbol,
        usdValue: balanceInfo.usdValue
      };
    } catch (error) {
      console.error('Error creating wallet:', error);
      throw error;
    }
  }

  // Get real wallet balance from blockchain with caching
  async getWalletBalance(address, chain, retries = 3) {
    const cacheKey = `balance_${chain}_${address}`;
    const cached = this.balanceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.balanceCacheTimeout) {
      return cached.data;
    }

    try {
      let balance = 0;
      let nativeSymbol = '';

      if (chain === 'solana') {
        const result = await this.rpcManager.executeWithRetry('solana', async (connection) => {
          const publicKey = new PublicKey(address);
          const lamports = await connection.getBalance(publicKey, 'confirmed');
          return lamports;
        }, retries);

        balance = result / LAMPORTS_PER_SOL;
        nativeSymbol = 'SOL';
        
      } else if (['ethereum', 'bsc', 'polygon', 'arbitrum', 'base'].includes(chain)) {
        const result = await this.rpcManager.executeWithRetry(chain, async (provider) => {
          const wei = await provider.getBalance(address);
          return wei;
        }, retries);

        balance = parseFloat(ethers.formatEther(result));
        nativeSymbol = chain === 'ethereum' || chain === 'arbitrum' || chain === 'base' ? 'ETH' : 
                      chain === 'bsc' ? 'BNB' : 'MATIC';
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }

      // Get USD value
      const tokenPrice = await this.getTokenPrice(chain);
      const usdValue = balance * tokenPrice;

      const balanceData = {
        balance: balance.toFixed(6),
        usdValue: usdValue.toFixed(2),
        tokenPrice,
        symbol: nativeSymbol,
        lastUpdated: Date.now()
      };

      // Cache the balance
      this.balanceCache.set(cacheKey, { 
        data: balanceData, 
        timestamp: Date.now() 
      });

      return balanceData;
      
    } catch (error) {
      console.error(`Error getting wallet balance for ${chain}:${address}:`, error.message);

      // Return cached balance if available
      if (cached) {
        return { ...cached.data, error: 'Using cached data due to RPC error' };
      }

      return {
        balance: '0.000000',
        usdValue: '0.00',
        tokenPrice: 0,
        symbol: chain === 'solana' ? 'SOL' : 
               chain === 'ethereum' || chain === 'arbitrum' || chain === 'base' ? 'ETH' : 
               chain === 'bsc' ? 'BNB' : 'MATIC',
        error: error.message,
        lastUpdated: Date.now()
      };
    }
  }

  // Get wallet private key for internal trading operations (no admin check)
  async getWalletPrivateKeyForTrading(userId, chain) {
    try {
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        throw new Error(`No ${chain} wallet found for user ${userId}`);
      }
      
      const wallet = userData.custodialWallets[chain];
      
      if (!wallet.privateKey) {
        throw new Error('Private key not found in wallet data');
      }

      try {
        const privateKey = this.decrypt(wallet.privateKey);
        
        // Validate the decrypted key format
        if (chain === 'solana') {
          if (!/^[0-9a-fA-F]{128}$/.test(privateKey)) {
            throw new Error('Invalid Solana private key format');
          }
        } else {
          if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey) && !/^[0-9a-fA-F]{64}$/.test(privateKey)) {
            throw new Error('Invalid EVM private key format');
          }
        }

        return privateKey;
        
      } catch (decryptError) {
        console.error('Decryption failed for wallet:', decryptError.message);
        throw new Error('Failed to decrypt private key - wallet may be corrupted');
      }
      
    } catch (error) {
      console.error('Get private key for trading error:', error);
      throw error;
    }
  }

  // Export wallet info (for user backup) with enhanced security
  async exportWalletInfo(userId, chain) {
    try {
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        throw new Error(`No ${chain} wallet found for this user`);
      }
      
      const wallet = userData.custodialWallets[chain];
      
      // Always return basic wallet info
      const exportData = {
        address: wallet.address,
        chain: chain,
        createdAt: wallet.createdAt,
        warning: '🔥 DELETE THIS MESSAGE AFTER SAVING! Anyone with your private key can access your funds.'
      };

      // Try to decrypt private key
      try {
        if (wallet.privateKey) {
          exportData.privateKey = this.decrypt(wallet.privateKey);
        } else {
          exportData.privateKey = 'undefined';
          exportData.error = 'Private key not found in wallet data';
        }

        // Try to decrypt mnemonic if available
        if (wallet.mnemonic) {
          try {
            exportData.mnemonic = this.decrypt(wallet.mnemonic);
          } catch (mnemonicError) {
            console.warn('Failed to decrypt mnemonic:', mnemonicError.message);
            exportData.mnemonic = 'Failed to decrypt mnemonic';
          }
        }
        
      } catch (decryptError) {
        console.error('Export decryption error:', decryptError.message);
        exportData.privateKey = 'undefined';
        exportData.error = 'Cannot decrypt private key - encryption key may have changed. Please regenerate wallet.';
        exportData.supportNote = 'Contact support if you need to recover funds from this wallet.';
      }
      
      return exportData;
      
    } catch (error) {
      console.error('Export wallet error:', error);
      throw error;
    }
  }

  // Process transaction with dev fee (enhanced fee display)
  async processTransactionWithFee(userId, chain, amount, type) {
    try {
      const devFeePercent = parseFloat(process.env.DEV_FEE_PERCENT || '3');
      const devFee = amount * (devFeePercent / 100);
      const userAmount = amount - devFee;
      
      // Update user wallet stats
      const userData = await userService.getUserSettings(userId);
      if (userData.custodialWallets && userData.custodialWallets[chain]) {
        userData.custodialWallets[chain].txCount++;
        userData.custodialWallets[chain].lastUpdated = new Date().toISOString();
        
        if (type === 'send' || type === 'buy') {
          userData.custodialWallets[chain].totalSent += amount;
        } else if (type === 'receive' || type === 'sell') {
          userData.custodialWallets[chain].totalReceived += amount;
        }
        
        await userService.saveUserData(userId, userData);
      }
      
      // Track REAL dev fee collection (not simulation)
      await userService.updateAdminStats({
        feeCollected: devFee,
        chain,
        action: type,
        timestamp: new Date(),
        type: 'actual_collection',
        userId
      });
      
      return {
        userAmount,
        devFee,
        total: amount,
        // Enhanced fee display format as requested
        feeDisplay: `TX fee - ${String(devFeePercent).padStart(4, '0')}`,
        feeCode: String(devFeePercent).padStart(4, '0')
      };
      
    } catch (error) {
      console.error('Process transaction fee error:', error);
      throw error;
    }
  }

  // Clear cache for specific items
  clearCache(type, key) {
    if (type === 'balance') {
      this.balanceCache.delete(key);
    } else if (type === 'price') {
      this.priceCache.delete(key);
    } else if (type === 'all') {
      this.balanceCache.clear();
      this.priceCache.clear();
    }
  }

  // Get service status
  getStatus() {
    return {
      rpcManager: this.rpcManager.getStatus(),
      cacheStats: {
        priceCache: this.priceCache.size,
        balanceCache: this.balanceCache.size
      },
      encryptionAlgorithm: ALGORITHM,
      initialized: true
    };
  }

  // Send native tokens (SOL, ETH, BNB) to another address
  async sendNativeTokens(userId, chain, destinationAddress, amount) {
    try {
      console.log(`📤 Sending ${amount} ${chain.toUpperCase()} from user ${userId} to ${destinationAddress}`);
      
      // Get user wallet
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        throw new Error(`No ${chain} wallet found for user`);
      }
      
      const wallet = userData.custodialWallets[chain];
      const fromAddress = wallet.address;
      
      // Check balance
      const balanceInfo = await this.getWalletBalance(fromAddress, chain);
      const availableBalance = parseFloat(balanceInfo.balance);
      
      if (availableBalance < amount) {
        throw new Error(`Insufficient balance. Available: ${availableBalance}, Required: ${amount}`);
      }
      
      // Get private key (internally within service)
      const privateKey = this.decrypt(wallet.privateKey);
      
      let result;
      
      if (chain === 'solana') {
        result = await this.sendSolanaTokens(privateKey, destinationAddress, amount);
      } else if (['ethereum', 'bsc', 'polygon', 'arbitrum', 'base'].includes(chain)) {
        result = await this.sendEVMTokens(privateKey, destinationAddress, amount, chain);
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      // Update wallet stats
      wallet.totalSent = (wallet.totalSent || 0) + amount;
      wallet.txCount = (wallet.txCount || 0) + 1;
      wallet.lastUpdated = new Date().toISOString();
      
      await userService.saveUserData(userId, userData);
      
      // Clear balance cache
      this.clearCache('balance', `balance_${chain}_${fromAddress}`);
      
      console.log(`✅ Successfully sent ${amount} ${chain.toUpperCase()} - TX: ${result.txHash}`);
      
      return {
        success: true,
        txHash: result.txHash,
        gasUsed: result.gasUsed,
        amount,
        chain,
        from: fromAddress,
        to: destinationAddress,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Send native tokens error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send Solana (SOL) tokens
  async sendSolanaTokens(privateKeyHex, destinationAddress, amount) {
    try {
      const connection = await this.rpcManager.executeWithRetry('solana', async (conn) => conn);
      
      // Convert hex private key to Keypair
      const secretKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
      const fromKeypair = Keypair.fromSecretKey(secretKey);
      
      // Convert SOL to lamports
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      
      // Create and send transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: new PublicKey(destinationAddress),
          lamports
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromKeypair.publicKey;
      
      // Sign and send transaction
      transaction.sign(fromKeypair);
      
      const txHash = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      // Wait for confirmation
      await connection.confirmTransaction(txHash, 'confirmed');
      
      return {
        txHash,
        gasUsed: 'N/A'
      };
      
    } catch (error) {
      console.error('Solana send error:', error);
      throw new Error(`Solana transfer failed: ${error.message}`);
    }
  }

  // Send EVM tokens (ETH, BNB)
  async sendEVMTokens(privateKey, destinationAddress, amount, chain) {
    try {
      const provider = await this.rpcManager.executeWithRetry(chain, async (p) => p);
      
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Convert amount to wei
      const amountWei = ethers.parseEther(amount.toString());
      
      // Estimate gas
      const gasEstimate = await provider.estimateGas({
        to: destinationAddress,
        value: amountWei
      });
      
      // Get current gas price
      const gasPrice = await provider.getGasPrice();
      
      // Create transaction
      const tx = await wallet.sendTransaction({
        to: destinationAddress,
        value: amountWei,
        gasLimit: gasEstimate,
        gasPrice: gasPrice
      });
      
      console.log(`📝 ${chain.toUpperCase()} transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`✅ ${chain.toUpperCase()} transaction confirmed: ${receipt.transactionHash}`);
      
      return {
        txHash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      console.error(`${chain} send error:`, error);
      
      if (error.message.includes('insufficient funds')) {
        throw new Error('Insufficient funds for transaction (including gas fees)');
      } else if (error.message.includes('nonce too low')) {
        throw new Error('Transaction nonce error - please try again');
      } else if (error.message.includes('replacement transaction underpriced')) {
        throw new Error('Network congestion - please try again with higher gas');
      } else {
        throw new Error(`${chain} transfer failed: ${error.message}`);
      }
    }
  }

  // Handle wallet decryption failure and offer regeneration
  async handleDecryptionFailure(userId, chain) {
    try {
      console.log(`🔧 Handling decryption failure for user ${userId}, chain: ${chain}`);
      
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        // No wallet exists, this is fine - they can create a new one
        return { canRegenerate: true, reason: 'no_wallet' };
      }
      
      const wallet = userData.custodialWallets[chain];
      
      // Mark the old wallet as corrupted but keep the address for reference
      const corruptedWallet = {
        ...wallet,
        status: 'corrupted',
        corruptedAt: new Date().toISOString(),
        originalCreatedAt: wallet.createdAt,
        canRegenerate: true
      };
      
      // Store corrupted wallet info
      if (!userData.corruptedWallets) {
        userData.corruptedWallets = {};
      }
      userData.corruptedWallets[chain] = corruptedWallet;
      
      await userService.saveUserData(userId, userData);
      
      return {
        canRegenerate: true,
        reason: 'decryption_failed',
        oldAddress: wallet.address,
        createdAt: wallet.createdAt,
        message: 'Your wallet encryption is corrupted. You can create a fresh wallet.'
      };
      
    } catch (error) {
      console.error('Handle decryption failure error:', error);
      return {
        canRegenerate: true,
        reason: 'error',
        message: 'Error handling wallet issue. You can create a fresh wallet.'
      };
    }
  }

  // Generate fresh wallet for users with decryption issues
  async regenerateWallet(userId, chain) {
    try {
      console.log(`🔄 Regenerating wallet for user ${userId}, chain: ${chain}`);
      
      const userData = await userService.getUserSettings(userId);
      
      // Generate new wallet
      let newWallet;
      if (chain === 'solana') {
        newWallet = this.generateSolanaWallet();
      } else if (['ethereum', 'bsc', 'polygon', 'arbitrum', 'base'].includes(chain)) {
        newWallet = this.generateEVMWallet();
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
      
      // Encrypt and store the new wallet
      const encryptedPrivateKey = this.encrypt(newWallet.privateKey);
      const encryptedMnemonic = newWallet.mnemonic ? this.encrypt(newWallet.mnemonic) : null;
      
      // Save new wallet info
      if (!userData.custodialWallets) {
        userData.custodialWallets = {};
      }
      
      userData.custodialWallets[chain] = {
        address: newWallet.address,
        privateKey: encryptedPrivateKey,
        mnemonic: encryptedMnemonic,
        createdAt: new Date().toISOString(),
        regenerated: true,
        regeneratedAt: new Date().toISOString(),
        balance: 0,
        totalReceived: 0,
        totalSent: 0,
        txCount: 0,
        lastUpdated: new Date().toISOString()
      };
      
      await userService.saveUserData(userId, userData);
      
      console.log(`✅ Regenerated ${chain} wallet for user ${userId}:`, newWallet.address);
      
      // Get initial balance
      const balanceInfo = await this.getWalletBalance(newWallet.address, chain);
      
      return {
        success: true,
        address: newWallet.address,
        mnemonic: newWallet.mnemonic,
        regenerated: true,
        balance: balanceInfo.balance,
        symbol: balanceInfo.symbol,
        usdValue: balanceInfo.usdValue,
        message: 'Fresh wallet created successfully!'
      };
      
    } catch (error) {
      console.error('Regenerate wallet error:', error);
      throw error;
    }
  }

  // Get wallet info for UI display
  async getWalletInfo(userId, chain) {
    try {
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        throw new Error(`No ${chain} wallet found for user ${userId}`);
      }
      
      const wallet = userData.custodialWallets[chain];
      const address = wallet.address;
      
      // Get balance
      const balanceInfo = await this.getWalletBalance(address, chain);
      
      return {
        address,
        balance: balanceInfo.balance,
        usdValue: balanceInfo.usdValue,
        symbol: balanceInfo.symbol,
        createdAt: wallet.createdAt,
        lastUpdated: new Date().toISOString(),
        txCount: wallet.txCount || 0,
        totalSent: wallet.totalSent || 0,
        totalReceived: wallet.totalReceived || 0
      };
      
    } catch (error) {
      console.error('Get wallet info error:', error);
      throw error;
    }
  }

  // Refresh wallet data
  async refreshWalletData(userId, chain) {
    try {
      const userData = await userService.getUserSettings(userId);
      
      if (!userData.custodialWallets || !userData.custodialWallets[chain]) {
        throw new Error(`No ${chain} wallet found for user ${userId}`);
      }
      
      const wallet = userData.custodialWallets[chain];
      const address = wallet.address;
      
      // Clear cache
      this.clearCache('balance', `balance_${chain}_${address}`);
      
      // Get fresh balance
      const balanceInfo = await this.getWalletBalance(address, chain);
      
      // Update wallet data
      wallet.lastUpdated = new Date().toISOString();
      await userService.saveUserData(userId, userData);
      
      return {
        success: true,
        address,
        balance: balanceInfo.balance,
        usdValue: balanceInfo.usdValue,
        symbol: balanceInfo.symbol,
        lastUpdated: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('Refresh wallet data error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const walletService = new WalletService();

module.exports = {
  getOrCreateWallet: walletService.getOrCreateWallet.bind(walletService),
  getWalletBalance: walletService.getWalletBalance.bind(walletService),
  getWalletPrivateKeyForTrading: walletService.getWalletPrivateKeyForTrading.bind(walletService),
  processTransactionWithFee: walletService.processTransactionWithFee.bind(walletService),
  exportWalletInfo: walletService.exportWalletInfo.bind(walletService),
  sendNativeTokens: walletService.sendNativeTokens.bind(walletService),
  getStatus: walletService.getStatus.bind(walletService),
  clearCache: walletService.clearCache.bind(walletService),
  handleDecryptionFailure: walletService.handleDecryptionFailure.bind(walletService),
  regenerateWallet: walletService.regenerateWallet.bind(walletService),
  getWalletInfo: walletService.getWalletInfo.bind(walletService),
  refreshWalletData: walletService.refreshWalletData.bind(walletService)
};