const { Composer } = require('telegraf');
const walletService = require('../../services/walletService');
const userService = require('../../users/userService');

const walletHandler = new Composer();

// Enhanced wallet creation command
walletHandler.command('wallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    const chain = userSettings.chain;
    
    // Create or get wallet
    const result = await walletService.getOrCreateWallet(userId, chain);
    
    if (!result) {
      return ctx.reply('❌ Failed to create or retrieve wallet. Please try again.');
    }
    
    // Get real-time balance
    const balanceInfo = await walletService.getWalletBalance(result.address, chain);
    
    let message = `🔐 **Your ${chain.toUpperCase()} Wallet**\n\n`;
    message += `📍 **Address:**\n\`${result.address}\`\n\n`;
    message += `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
    message += `💵 **USD Value:** $${balanceInfo.usdValue}\n`;
    
    if (balanceInfo.tokenPrice) {
      message += `📈 **${balanceInfo.symbol} Price:** $${balanceInfo.tokenPrice.toFixed(2)}\n`;
    }
    
    message += `\n🔄 **Status:** ${result.exists ? 'Existing wallet loaded' : 'New wallet created'}\n`;
    
    if (balanceInfo.error) {
      message += `⚠️ **Note:** ${balanceInfo.error}\n`;
    }
    
    message += `\n💡 **Commands:**\n`;
    message += `• \`/exportwallet\` - Export private key (SECURE!)\n`;
    message += `• \`/balance\` - Check current balance\n`;
    message += `• \`/buy <amount> <token>\` - Buy tokens\n`;
    message += `• \`/sell <token>\` - Sell tokens\n\n`;
    
    message += `🔥 **To add funds:** Send ${balanceInfo.symbol} to your wallet address above\n`;
    message += `⚡ **Ready for trading:** Your wallet is connected and ready for manual trades\n\n`;
    
    message += `🚨 **Security Notice:**\n`;
    message += `• Your private key is encrypted with AES-256-GCM\n`;
    message += `• Only export private key in secure environments\n`;
    message += `• Never share your private key with anyone`;
    
    // Add quick action buttons
    const keyboard = {
      inline_keyboard: [
        [
          { text: '💰 Check Balance', callback_data: `balance_${chain}` },
          { text: '📤 Export Wallet', callback_data: `exportwallet_${chain}` }
        ],
        [
          { text: '🔄 Refresh', callback_data: `wallet_refresh_${chain}` },
          { text: '⚙️ Settings', callback_data: 'wallet_settings' }
        ]
      ]
    };
    
    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Wallet command error:', error);
    await ctx.reply('❌ Error retrieving wallet information. Please try again or contact support.');
  }
});

// Enhanced export wallet command with decryption failure handling
walletHandler.command('exportwallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    const chain = userSettings.chain;
    
    try {
      // Attempt to export wallet information
      const exportResult = await walletService.exportWalletInfo(userId, chain);
      
      if (!exportResult) {
        return ctx.reply('❌ No wallet found for export. Please create a wallet first with /wallet');
      }
      
      // Check if decryption failed
      if (exportResult.privateKey === 'undefined' || exportResult.error?.includes('decrypt')) {
        // Handle decryption failure
        const failureInfo = await walletService.handleDecryptionFailure(userId, chain);
        
        let message = `🔧 **Wallet Decryption Issue Detected**\n\n`;
        message += `❌ **Issue:** Cannot decrypt your existing wallet\n`;
        message += `📍 **Old Wallet:** \`${exportResult.address}\`\n`;
        message += `📅 **Created:** ${new Date(exportResult.createdAt).toLocaleString()}\n\n`;
        
        message += `💡 **Solution Options:**\n`;
        message += `1️⃣ **Create Fresh Wallet** - Use \`/regeneratewallet\` (RECOMMENDED)\n`;
        message += `2️⃣ **Transfer Tokens** - Use \`/sendtokens <address> <amount>\` to move funds\n`;
        message += `3️⃣ **Import External** - Use your own wallet instead\n\n`;
        
        message += `🚨 **Important:**\n`;
        message += `• Your old wallet address still exists on the blockchain\n`;
        message += `• Any funds in the old wallet are still there\n`;
        message += `• You can still send tokens from it using /sendtokens\n`;
        message += `• Creating a fresh wallet gives you a new address\n\n`;
        
        message += `🔄 **Quick Action:** Reply with "REGENERATE" to create a fresh wallet`;
        
        // Set session flag for regeneration
        ctx.session = ctx.session || {};
        ctx.session.awaitingWalletRegeneration = true;
        ctx.session.awaitingRegenerationChain = chain;
        
        return ctx.reply(message, { parse_mode: 'Markdown' });
      }
      
      // Normal export flow (decryption successful)
      let message = `🔐 **${chain.toUpperCase()} WALLET EXPORT**\n\n`;
      message += `📍 **Address:**\n\`${exportResult.address}\`\n\n`;
      message += `🔑 **Private Key:**\n\`${exportResult.privateKey}\`\n\n`;
      
      if (exportResult.mnemonic && exportResult.mnemonic !== 'Failed to decrypt mnemonic') {
        message += `📝 **Seed Phrase:**\n\`${exportResult.mnemonic}\`\n\n`;
      }
      
      message += `✅ **Export Successful**\n`;
      message += `📅 **Created:** ${new Date(exportResult.createdAt).toLocaleString()}\n\n`;
      
      message += `🚨 **CRITICAL SECURITY WARNINGS:**\n`;
      message += `• ${exportResult.warning}\n`;
      message += `• Your private key gives FULL ACCESS to your wallet\n`;
      message += `• Never share this information publicly\n`;
      message += `• Store in a secure password manager\n`;
      message += `• Consider this message compromised after viewing\n\n`;
      
      message += `🛡️ **Wallet Import Instructions:**\n`;
      if (chain === 'solana') {
        message += `• **Phantom:** Settings > Import Private Key\n`;
        message += `• **Solflare:** Add Wallet > Import Private Key\n`;
        message += `• **Backpack:** Import Wallet > Private Key\n`;
      } else {
        message += `• **MetaMask:** Import Account > Private Key\n`;
        message += `• **Trust Wallet:** Settings > Wallets > Import\n`;
        message += `• **WalletConnect:** Use private key option\n`;
      }
      
      message += `\n⚡ **Quick Actions:**\n`;
      message += `• Copy address/key by tapping on the code blocks\n`;
      message += `• Use /wallet to return to wallet overview\n`;
      message += `• Use /sendtokens if you prefer direct transfers\n`;
      message += `• Use /support if you need assistance`;
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
      // Log the export for admin monitoring
      console.log(`🔐 Wallet exported for user ${userId}, chain: ${chain}, address: ${exportResult.address}`);
      
      // Send follow-up security reminder
      setTimeout(async () => {
        try {
          await ctx.reply(
            '🔥 **SECURITY REMINDER:** Please delete the wallet export message above after saving your private key securely.',
            { parse_mode: 'Markdown' }
          );
        } catch (err) {
          console.warn('Failed to send security reminder:', err.message);
        }
      }, 5000);
      
    } catch (decryptionError) {
      // Handle any other decryption errors
      console.error('Export wallet decryption error:', decryptionError);
      
      const failureInfo = await walletService.handleDecryptionFailure(userId, chain);
      
      let errorMessage = `🔧 **Wallet Access Issue**\n\n`;
      errorMessage += `❌ **Problem:** Cannot access your wallet private key\n`;
      errorMessage += `🔧 **Cause:** Encryption key changed or wallet corruption\n\n`;
      
      errorMessage += `💡 **Solutions:**\n`;
      errorMessage += `1️⃣ **Create Fresh Wallet:** Use \`/regeneratewallet\` (RECOMMENDED)\n`;
      errorMessage += `2️⃣ **Transfer Funds:** Use \`/sendtokens <address> <amount>\`\n`;
      errorMessage += `3️⃣ **Contact Support:** Use /support for assistance\n\n`;
      
      errorMessage += `⚠️ **Your Options:**\n`;
      errorMessage += `• Your wallet address and funds are safe on the blockchain\n`;
      errorMessage += `• You can still send tokens using /sendtokens\n`;
      errorMessage += `• A fresh wallet gives you full access again\n\n`;
      
      errorMessage += `🔄 **Quick Action:** Reply "REGENERATE" to create a fresh wallet`;
      
      // Set session flag for regeneration
      ctx.session = ctx.session || {};
      ctx.session.awaitingWalletRegeneration = true;
      ctx.session.awaitingRegenerationChain = chain;
      
      await ctx.reply(errorMessage, { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    console.error('Export wallet command error:', error);
    await ctx.reply('❌ Error with wallet export. Please try /wallet or contact /support');
  }
});

// Regenerate wallet command for users with decryption issues
walletHandler.command('regeneratewallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    const chain = userSettings.chain;
    
    await ctx.reply('🔄 Creating fresh wallet...');
    
    try {
      // Regenerate wallet
      const result = await walletService.regenerateWallet(userId, chain);
      
      if (!result.success) {
        return ctx.reply('❌ Failed to create fresh wallet. Please try again.');
      }
      
      // Get balance of new wallet
      const balanceInfo = await walletService.getWalletBalance(result.address, chain);
      
      let message = `✅ **Fresh ${chain.toUpperCase()} Wallet Created!**\n\n`;
      message += `🆕 **New Address:**\n\`${result.address}\`\n\n`;
      
      if (result.mnemonic) {
        message += `📝 **Seed Phrase:**\n\`${result.mnemonic}\`\n\n`;
      }
      
      message += `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
      message += `💵 **USD Value:** $${balanceInfo.usdValue}\n\n`;
      
      message += `🎉 **Success!**\n`;
      message += `• Fresh wallet with full encryption\n`;
      message += `• Private key accessible via /exportwallet\n`;
      message += `• Ready for trading and transfers\n\n`;
      
      message += `💡 **Next Steps:**\n`;
      message += `• Send funds to your new address above\n`;
      message += `• Use /balance to check your balance\n`;
      message += `• Use /exportwallet to get private key\n`;
      message += `• Use /buy to start trading\n\n`;
      
      message += `🔒 **Important:**\n`;
      message += `• This is a completely new wallet\n`;
      message += `• Your old wallet address still exists\n`;
      message += `• Transfer funds from old to new if needed`;
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
      console.log(`✅ User ${userId} regenerated ${chain} wallet: ${result.address}`);
      
    } catch (regenerationError) {
      console.error('Wallet regeneration error:', regenerationError);
      await ctx.reply('❌ Failed to create fresh wallet. Please contact support.');
    }
    
  } catch (error) {
    console.error('Regenerate wallet command error:', error);
    await ctx.reply('❌ Error with wallet regeneration. Please try again.');
  }
});

// Handle wallet regeneration confirmations
walletHandler.hears(/^(REGENERATE|regenerate|Regenerate)$/i, async (ctx) => {
  try {
    if (!ctx.session?.awaitingWalletRegeneration) {
      return; // Not awaiting regeneration
    }
    
    const userId = ctx.from.id;
    const chain = ctx.session.awaitingRegenerationChain;
    
    // Clear session state
    ctx.session.awaitingWalletRegeneration = false;
    ctx.session.awaitingRegenerationChain = null;
    
    await ctx.reply('🔄 Creating your fresh wallet...');
    
    try {
      // Regenerate wallet
      const result = await walletService.regenerateWallet(userId, chain);
      
      if (!result.success) {
        return ctx.reply('❌ Failed to create fresh wallet. Use /regeneratewallet to try again.');
      }
      
      // Get balance of new wallet
      const balanceInfo = await walletService.getWalletBalance(result.address, chain);
      
      let message = `🎉 **Fresh Wallet Successfully Created!**\n\n`;
      message += `🆕 **New ${chain.toUpperCase()} Address:**\n\`${result.address}\`\n\n`;
      
      message += `💰 **Current Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
      message += `💵 **USD Value:** $${balanceInfo.usdValue}\n\n`;
      
      message += `✅ **What's Fixed:**\n`;
      message += `• Fresh encryption - no more decryption errors\n`;
      message += `• Private key export now works\n`;
      message += `• Trading functionality restored\n`;
      message += `• All bot features available\n\n`;
      
      message += `🚀 **Ready to Use:**\n`;
      message += `• /exportwallet - Get your private key\n`;
      message += `• /balance - Check balance anytime\n`;
      message += `• /buy <amount> <token> - Start trading\n`;
      message += `• /sendtokens - Transfer funds\n\n`;
      
      message += `💡 **Pro Tip:** Save your wallet info with /exportwallet before adding funds!`;
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
      console.log(`✅ User ${userId} confirmed regeneration of ${chain} wallet: ${result.address}`);
      
    } catch (regenerationError) {
      console.error('Wallet regeneration confirmation error:', regenerationError);
      await ctx.reply('❌ Failed to create fresh wallet. Please use /regeneratewallet command directly.');
    }
    
  } catch (error) {
    console.error('Wallet regeneration confirmation error:', error);
    await ctx.reply('❌ Error processing wallet regeneration.');
  }
});

// Send tokens command - alternative to private key export
walletHandler.command('sendtokens', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[userSettings.chain]) {
      return ctx.reply('❌ No wallet found. Please create one first with /wallet');
    }
    
    const args = ctx.message.text.split(' ').slice(1);
    
    if (args.length === 0) {
      let message = `📤 **Send Tokens Command**\n\n`;
      message += `**Usage:**\n`;
      message += `• \`/sendtokens <destination_address> <amount>\`\n`;
      message += `• Send native tokens (${userSettings.chain.toUpperCase()}) to any address\n\n`;
      
      message += `**Examples:**\n`;
      if (userSettings.chain === 'solana') {
        message += `• \`/sendtokens 7ouabE3EBCVDsNtiYzfGSE6i2tw8r62oyWLzT3Yfqd6X 0.5\`\n`;
        message += `• \`/sendtokens GKY1anuDZsqjNURU4k2RCsh2jazAHozx659BB8r5pump 1.0\`\n`;
      } else {
        message += `• \`/sendtokens 0x742d35Cc6634C0532925a3b8D746402AA4d6aa02 0.1\`\n`;
        message += `• \`/sendtokens 0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE 0.05\`\n`;
      }
      
      message += `\n**Features:**\n`;
      message += `✅ Real-time balance check\n`;
      message += `✅ Address validation\n`;
      message += `✅ Confirmation prompt\n`;
      message += `✅ Transaction tracking\n`;
      message += `✅ No private key exposure\n\n`;
      
      message += `**Security:**\n`;
      message += `• All transfers are confirmed before execution\n`;
      message += `• Your private key stays encrypted and secure\n`;
      message += `• Transaction history is maintained\n\n`;
      
      message += `💡 **Need your wallet address?** Use /wallet to see it`;
      
      return ctx.reply(message, { parse_mode: 'Markdown' });
    }
    
    if (args.length !== 2) {
      return ctx.reply('❌ Invalid format. Use: `/sendtokens <destination_address> <amount>`', { parse_mode: 'Markdown' });
    }
    
    const [destinationAddress, amountStr] = args;
    const amount = parseFloat(amountStr);
    
    // Validate amount
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ Invalid amount. Please enter a positive number.');
    }
    
    // Basic address validation
    const isValidAddress = userSettings.chain === 'solana' 
      ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destinationAddress)
      : /^0x[a-fA-F0-9]{40}$/.test(destinationAddress);
    
    if (!isValidAddress) {
      return ctx.reply('❌ Invalid destination address format.');
    }
    
    // Check wallet balance
    const walletAddress = userSettings.custodialWallets[userSettings.chain].address;
    const balanceInfo = await walletService.getWalletBalance(walletAddress, userSettings.chain);
    const availableBalance = parseFloat(balanceInfo.balance);
    
    // Reserve some for gas fees
    const gasReserve = userSettings.chain === 'solana' ? 0.01 : 0.005;
    const maxSendable = Math.max(0, availableBalance - gasReserve);
    
    if (amount > maxSendable) {
      return ctx.reply(
        `❌ Insufficient balance.\n\n` +
        `💰 **Available:** ${availableBalance} ${balanceInfo.symbol}\n` +
        `⛽ **Gas Reserve:** ${gasReserve} ${balanceInfo.symbol}\n` +
        `📤 **Max Sendable:** ${maxSendable.toFixed(6)} ${balanceInfo.symbol}\n\n` +
        `💡 Try a smaller amount or add more funds to your wallet.`
      );
    }
    
    // Create confirmation message
    const chainEmoji = userSettings.chain === 'solana' ? '🟣' : userSettings.chain === 'ethereum' ? '🔷' : '🟡';
    let confirmMessage = `📤 **Confirm Token Transfer** ${chainEmoji}\n\n`;
    confirmMessage += `**From:** \`${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 8)}\`\n`;
    confirmMessage += `**To:** \`${destinationAddress.substring(0, 8)}...${destinationAddress.substring(destinationAddress.length - 8)}\`\n\n`;
    confirmMessage += `💰 **Amount:** ${amount} ${balanceInfo.symbol}\n`;
    confirmMessage += `💵 **USD Value:** ~$${(amount * (balanceInfo.tokenPrice || 0)).toFixed(2)}\n`;
    confirmMessage += `⛽ **Est. Gas:** ${gasReserve} ${balanceInfo.symbol}\n`;
    confirmMessage += `💎 **Remaining Balance:** ${(availableBalance - amount).toFixed(6)} ${balanceInfo.symbol}\n\n`;
    confirmMessage += `🌐 **Network:** ${userSettings.chain.toUpperCase()}\n`;
    confirmMessage += `⏰ **Estimated Time:** ${userSettings.chain === 'solana' ? '~30 seconds' : '~2-5 minutes'}\n\n`;
    confirmMessage += `⚠️ **Reply YES to confirm or NO to cancel**\n`;
    confirmMessage += `⏰ Expires in 60 seconds`;
    
    // Store transfer details in session
    ctx.session = ctx.session || {};
    ctx.session.pendingTransfer = {
      destination: destinationAddress,
      amount,
      symbol: balanceInfo.symbol,
      chain: userSettings.chain,
      from: walletAddress,
      expiresAt: Date.now() + 60000
    };
    ctx.session.awaitingTransferConfirmation = true;
    
    await ctx.reply(confirmMessage, { parse_mode: 'Markdown' });
    
  } catch (error) {
    console.error('Send tokens command error:', error);
    await ctx.reply('❌ Error processing send tokens command. Please try again.');
  }
});

// Handle transfer confirmations
walletHandler.hears(/^(YES|yes|Yes|NO|no|No)$/i, async (ctx) => {
  try {
    if (!ctx.session?.awaitingTransferConfirmation || !ctx.session?.pendingTransfer) {
      return; // Not awaiting transfer confirmation
    }
    
    const userId = ctx.from.id;
    const confirmed = /^(YES|yes|Yes)$/i.test(ctx.message.text);
    const transferData = ctx.session.pendingTransfer;
    
    // Clear session state
    ctx.session.awaitingTransferConfirmation = false;
    ctx.session.pendingTransfer = null;
    
    // Check if expired
    if (Date.now() > transferData.expiresAt) {
      return ctx.reply('❌ Transfer confirmation expired. Please try again.');
    }
    
    if (!confirmed) {
      return ctx.reply('❌ Transfer cancelled.');
    }
    
    await ctx.reply('🔄 Processing transfer...');
    
    try {
      // Execute the transfer using wallet service
      const result = await walletService.sendNativeTokens(
        userId,
        transferData.chain,
        transferData.destination,
        transferData.amount
      );
      
      if (result.success) {
        let successMessage = `✅ **Transfer Successful!**\n\n`;
        successMessage += `📤 **Sent:** ${transferData.amount} ${transferData.symbol}\n`;
        successMessage += `📍 **To:** \`${transferData.destination}\`\n`;
        successMessage += `📝 **TX Hash:** \`${result.txHash}\`\n`;
        successMessage += `⛽ **Gas Used:** ${result.gasUsed || 'N/A'}\n`;
        successMessage += `🕒 **Time:** ${new Date().toLocaleString()}\n\n`;
        
        // Add explorer link
        let explorerUrl = '';
        if (transferData.chain === 'solana') {
          explorerUrl = `https://solscan.io/tx/${result.txHash}`;
        } else if (transferData.chain === 'ethereum') {
          explorerUrl = `https://etherscan.io/tx/${result.txHash}`;
        } else if (transferData.chain === 'bsc') {
          explorerUrl = `https://bscscan.com/tx/${result.txHash}`;
        }
        
        if (explorerUrl) {
          successMessage += `🔍 **View on Explorer:** [Click here](${explorerUrl})\n\n`;
        }
        
        successMessage += `💡 **Next Steps:**\n`;
        successMessage += `• Use /balance to check your updated balance\n`;
        successMessage += `• The transaction should appear in the destination wallet shortly`;
        
        await ctx.reply(successMessage, { parse_mode: 'Markdown' });
      } else {
        await ctx.reply(`❌ Transfer failed: ${result.error || 'Unknown error'}`);
      }
      
    } catch (transferError) {
      console.error('Transfer execution error:', transferError);
      await ctx.reply(`❌ Transfer failed: ${transferError.message || 'System error'}`);
    }
    
  } catch (error) {
    console.error('Transfer confirmation error:', error);
    await ctx.reply('❌ Error processing transfer confirmation.');
  }
});

// Balance check command
walletHandler.command('balance', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    if (!userSettings.custodialWallets || !userSettings.custodialWallets[userSettings.chain]) {
      return ctx.reply('❌ No wallet found. Please create one first with /wallet');
    }
    
    const chain = userSettings.chain;
    const walletAddress = userSettings.custodialWallets[chain].address;
    
    await ctx.reply('🔄 Checking balance...');
    
    // Get fresh balance from blockchain
    const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
    
    let message = `💰 **${chain.toUpperCase()} Balance**\n\n`;
    message += `📍 **Wallet:** \`${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 8)}\`\n\n`;
    message += `💎 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n`;
    message += `💵 **USD Value:** $${balanceInfo.usdValue}\n`;
    
    if (balanceInfo.tokenPrice) {
      message += `📈 **${balanceInfo.symbol} Price:** $${balanceInfo.tokenPrice.toFixed(2)}\n`;
    }
    
    message += `\n🕒 **Last Updated:** ${new Date(balanceInfo.lastUpdated).toLocaleString()}\n`;
    
    if (balanceInfo.error) {
      message += `\n⚠️ **Note:** ${balanceInfo.error}`;
    }
    
    // Add action buttons
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh', callback_data: `balance_refresh_${chain}` },
          { text: '💸 Buy Tokens', callback_data: 'start_buy' }
        ],
        [
          { text: '📊 Portfolio', callback_data: 'view_positions' },
          { text: '⚙️ Wallet Settings', callback_data: 'wallet_settings' }
        ]
      ]
    };
    
    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Balance check error:', error);
    await ctx.reply('❌ Error checking balance. Please try again.');
  }
});

// Switch wallet command - Create new wallet or switch chains
walletHandler.command('switchwallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    await userService.updateLastActive(userId);
    
    const userSettings = await userService.getUserSettings(userId);
    
    let message = `🔄 **Switch/Create Wallet**\n\n`;
    message += `**Current Chain:** ${userSettings.chain ? userSettings.chain.toUpperCase() : 'Not Set'}\n\n`;
    
    message += `🎯 **Available Options:**\n\n`;
    message += `**1. Switch Chain**\n`;
    message += `• Change to different blockchain\n`;
    message += `• Use /setchain solana, /setchain ethereum, or /setchain bsc\n\n`;
    
    message += `**2. Create Fresh Wallet (Same Chain)**\n`;
    message += `• Generate completely new wallet\n`;
    message += `• Use /regeneratewallet command\n\n`;
    
    message += `**3. Create Wallet for Different Chain**\n`;
    message += `• Switch chain first, then create wallet\n`;
    message += `• Example: /setchain solana then /wallet\n\n`;
    
    message += `💡 **Quick Actions:**`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🟣 Switch to Solana', callback_data: 'switch_chain_solana' },
          { text: '🔷 Switch to Ethereum', callback_data: 'switch_chain_ethereum' }
        ],
        [
          { text: '🟡 Switch to BSC', callback_data: 'switch_chain_bsc' },
          { text: '🔄 Create Fresh Wallet', callback_data: `regenerate_current_wallet` }
        ],
        [
          { text: '📋 View All Wallets', callback_data: 'view_all_wallets' },
          { text: '❌ Cancel', callback_data: 'cancel_switch' }
        ]
      ]
    };
    
    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('Switch wallet command error:', error);
    await ctx.reply('❌ Error processing switch wallet command. Please try again.');
  }
});

// Handle switch chain callbacks
walletHandler.action(/^switch_chain_(.+)$/, async (ctx) => {
  try {
    const chain = ctx.match[1];
    const userId = ctx.from.id;
    
    await ctx.answerCbQuery(`🔄 Switching to ${chain.toUpperCase()}...`);
    
    // Set the new chain
    await userService.setChain(userId, chain);
    
    // Check if wallet exists for this chain
    const userSettings = await userService.getUserSettings(userId);
    const hasWallet = userSettings.custodialWallets && userSettings.custodialWallets[chain];
    
    if (hasWallet) {
      // Wallet exists, show wallet info
      const walletAddress = userSettings.custodialWallets[chain].address;
      const balanceInfo = await walletService.getWalletBalance(walletAddress, chain);
      
      const message = `✅ **Switched to ${chain.toUpperCase()}**\n\n` +
                     `📍 **Existing Wallet:** \`${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 8)}\`\n` +
                     `💰 **Balance:** ${balanceInfo.balance} ${balanceInfo.symbol}\n` +
                     `💵 **USD Value:** $${balanceInfo.usdValue}\n\n` +
                     `🎯 **Ready for trading on ${chain.toUpperCase()}!**`;
      
      return ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Check Balance', callback_data: `balance_${chain}` }],
            [{ text: '💸 Start Trading', callback_data: 'start_trading' }],
            [{ text: '⚙️ Wallet Settings', callback_data: `settings_${chain}` }]
          ]
        }
      });
      
    } else {
      // No wallet for this chain, create one
      const result = await walletService.getOrCreateWallet(userId, chain);
      
      if (!result.success) {
        return ctx.editMessageText(`❌ Failed to create ${chain.toUpperCase()} wallet: ${result.error}`);
      }
      
      const message = `✅ **${chain.toUpperCase()} Wallet Created!**\n\n` +
                     `📍 **New Address:** \`${result.address}\`\n` +
                     `💰 **Balance:** ${result.balance} ${result.symbol}\n` +
                     `💵 **USD Value:** $${result.usdValue}\n\n` +
                     `🎯 **Next Steps:**\n` +
                     `• Fund your wallet to start trading\n` +
                     `• Use /buy to purchase tokens\n` +
                     `• Set your trading amount with /amount`;
      
      return ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 Check Balance', callback_data: `balance_${chain}` }],
            [{ text: '🔐 Export Wallet', callback_data: `exportwallet_${chain}` }],
            [{ text: '⚙️ Settings', callback_data: `settings_${chain}` }]
          ]
        }
      });
    }
    
  } catch (error) {
    console.error('Switch chain callback error:', error);
    await ctx.answerCbQuery('❌ Switch failed');
    return ctx.reply('❌ Failed to switch chain. Please try again.');
  }
});

// Handle regenerate current wallet
walletHandler.action('regenerate_current_wallet', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      await ctx.answerCbQuery('❌ No chain set');
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    await ctx.answerCbQuery('🔄 Creating fresh wallet...');
    
    const result = await walletService.regenerateWallet(userId, userSettings.chain);
    
    if (!result.success) {
      return ctx.reply('❌ Failed to create fresh wallet. Please try again.');
    }
    
    const message = `✅ **Fresh ${userSettings.chain.toUpperCase()} Wallet Created!**\n\n` +
                   `📍 **New Address:** \`${result.address}\`\n` +
                   `💰 **Balance:** ${result.balance} ${result.symbol}\n` +
                   `💲 **USD Value:** $${result.usdValue}\n\n` +
                   `🎯 **Your old wallet data has been backed up**\n` +
                   `💡 **This is a completely fresh start!**`;
    
    return ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Check Balance', callback_data: `balance_${userSettings.chain}` }],
          [{ text: '🔐 Export Wallet', callback_data: `exportwallet_${userSettings.chain}` }],
          [{ text: '💸 Start Trading', callback_data: 'start_trading' }]
        ]
      }
    });
    
  } catch (error) {
    console.error('Regenerate current wallet error:', error);
    await ctx.answerCbQuery('❌ Creation failed');
    return ctx.reply('❌ Failed to create fresh wallet. Please try again.');
  }
});

// Handle view all wallets
walletHandler.action('view_all_wallets', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userSettings = await userService.getUserSettings(userId);
    
    await ctx.answerCbQuery('📋 Loading all wallets...');
    
    let message = `📋 **All Your Wallets**\n\n`;
    
    const chains = ['solana', 'ethereum', 'bsc'];
    let hasWallets = false;
    
    for (const chain of chains) {
      if (userSettings.custodialWallets && userSettings.custodialWallets[chain]) {
        hasWallets = true;
        const wallet = userSettings.custodialWallets[chain];
        const isCurrentChain = userSettings.chain === chain;
        const emoji = chain === 'solana' ? '🟣' : chain === 'ethereum' ? '🔷' : '🟡';
        const currentText = isCurrentChain ? ' **(CURRENT)**' : '';
        
        message += `${emoji} **${chain.toUpperCase()}${currentText}**\n`;
        message += `📍 \`${wallet.address.substring(0, 8)}...${wallet.address.substring(wallet.address.length - 8)}\`\n`;
        
        try {
          const balanceInfo = await walletService.getWalletBalance(wallet.address, chain);
          message += `💰 ${balanceInfo.balance} ${balanceInfo.symbol} ($${balanceInfo.usdValue})\n`;
        } catch (error) {
          message += `💰 Balance: Loading...\n`;
        }
        
        message += `\n`;
      }
    }
    
    if (!hasWallets) {
      message += `No wallets found.\n\n`;
      message += `💡 **Create your first wallet:**\n`;
      message += `• Use /setchain to choose blockchain\n`;
      message += `• Use /wallet to create wallet\n`;
    } else {
      message += `💡 **Quick Actions:**\n`;
      message += `• Switch chains with buttons below\n`;
      message += `• Create fresh wallets anytime\n`;
    }
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🟣 Use Solana', callback_data: 'switch_chain_solana' },
          { text: '🔷 Use Ethereum', callback_data: 'switch_chain_ethereum' }
        ],
        [
          { text: '🟡 Use BSC', callback_data: 'switch_chain_bsc' },
          { text: '🔄 Create Fresh', callback_data: 'regenerate_current_wallet' }
        ],
        [
          { text: '❌ Close', callback_data: 'cancel_switch' }
        ]
      ]
    };
    
    return ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error) {
    console.error('View all wallets error:', error);
    await ctx.answerCbQuery('❌ Load failed');
    return ctx.reply('❌ Failed to load wallets. Please try again.');
  }
});

// Handle cancel switch
walletHandler.action('cancel_switch', async (ctx) => {
  try {
    await ctx.answerCbQuery('❌ Cancelled');
    return ctx.editMessageText('❌ Wallet switching cancelled.');
  } catch (error) {
    return ctx.reply('❌ Cancelled.');
  }
});

// Handle callback queries for wallet actions
walletHandler.action(/^(balance|exportwallet|settings|refresh|check_balance|copy_quickbuy)_(.+)$/, async (ctx) => {
  try {
    const action = ctx.match[1];
    const chain = ctx.match[2];
    const userId = ctx.from.id;
    
    await userService.updateLastActive(userId);
    
    switch (action) {
      case 'balance':
      case 'check_balance':
        return handleBalanceCheck(ctx, userId, chain);
        
      case 'exportwallet':
        return handleExportWallet(ctx, userId, chain);
        
      case 'settings':
        return handleWalletSettings(ctx, userId, chain);
        
      case 'refresh':
        return handleWalletRefresh(ctx, userId, chain);
        
      case 'copy_quickbuy':
        return handleCopyQuickBuy(ctx, userId, chain);
        
      default:
        await ctx.answerCbQuery('❌ Unknown action');
        return ctx.reply('❌ Unknown wallet action. Please try again.');
    }
    
  } catch (error) {
    console.error('Wallet callback error:', error);
    await ctx.answerCbQuery('❌ Error processing request');
    return ctx.reply('❌ An error occurred. Please try again.');
  }
});

// Helper function for balance check
async function handleBalanceCheck(ctx, userId, chain) {
  try {
    const result = await walletService.getWalletBalance(userId, chain);
    
    if (!result.success) {
      await ctx.answerCbQuery('❌ Balance check failed');
      return ctx.reply(`❌ ${result.error}`);
    }
    
    await ctx.answerCbQuery('✅ Balance updated');
    
    const message = `💰 **${chain.toUpperCase()} Balance**\n\n` +
                   `📍 **Address:** \`${result.address}\`\n` +
                   `💵 **Balance:** ${result.balance} ${result.symbol}\n` +
                   `💲 **USD Value:** $${result.usdValue}\n` +
                   `📊 **Price:** $${result.price}\n\n` +
                   `🕒 **Last Updated:** ${new Date().toLocaleString()}`;
    
    return ctx.editMessageText(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Error checking balance');
    return ctx.reply('❌ Failed to check balance. Please try again.');
  }
}

// Helper function for export wallet
async function handleExportWallet(ctx, userId, chain) {
  try {
    const exportResult = await walletService.exportWalletInfo(userId, chain);
    
    if (!exportResult) {
      await ctx.answerCbQuery('❌ No wallet found');
      return ctx.reply('❌ No wallet found for export. Please create a wallet first with /wallet');
    }
    
    if (exportResult.requiresRegeneration) {
      await ctx.answerCbQuery('🔧 Wallet needs regeneration');
      
      const message = `🔧 **Wallet Recovery Required**\n\n` +
                     `❌ **Issue:** Cannot decrypt your wallet - encryption key may have changed\n\n` +
                     `💡 **Solutions:**\n` +
                     `• Use /regeneratewallet to create a fresh wallet\n` +
                     `• Use /sendtokens to transfer without private key access\n\n` +
                     `🚨 **Note:** Old wallet data will be backed up`;
      
      return ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Create New Wallet', callback_data: `regenerate_wallet_${chain}` }],
            [{ text: '📞 Get Support', callback_data: 'get_support' }]
          ]
        }
      });
    }
    
    await ctx.answerCbQuery('⚠️ Sensitive data - check private message');
    
    // Send export info privately
    return ctx.reply(`🔐 **${chain.toUpperCase()} WALLET EXPORT**\n\n` +
                    `📍 **Address:**\n\`${exportResult.address}\`\n\n` +
                    `🔑 **Private Key:**\n\`${exportResult.privateKey}\`\n\n` +
                    `🚨 **SECURITY WARNING:**\n` +
                    `• ${exportResult.warning}\n` +
                    `• DELETE THIS MESSAGE after saving safely\n` +
                    `• Never share this information publicly`, 
                    { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Export failed');
    return ctx.reply('❌ Failed to export wallet. Please try again.');
  }
}

// Helper function for wallet settings
async function handleWalletSettings(ctx, userId, chain) {
  try {
    const userSettings = await userService.getUserSettings(userId);
    const walletData = await walletService.getWalletInfo(userId, chain);
    
    await ctx.answerCbQuery('⚙️ Wallet settings');
    
    const message = `⚙️ **${chain.toUpperCase()} Wallet Settings**\n\n` +
                   `📍 **Address:** \`${walletData.address}\`\n` +
                   `💰 **Default Amount:** ${userSettings.amount || 0.1}\n` +
                   `⚡ **Slippage:** ${userSettings.slippage || 5}%\n` +
                   `🎯 **Priority Fee:** ${userSettings.priorityFee || 'Auto'}\n\n` +
                   `💡 **Available Actions:**`;
    
    return ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Set Amount', callback_data: 'set_amount' }],
          [{ text: '⚡ Set Slippage', callback_data: 'set_slippage' }],
          [{ text: '🔄 Regenerate Wallet', callback_data: `regenerate_wallet_${chain}` }],
          [{ text: '🔙 Back to Wallet', callback_data: `wallet_${chain}` }]
        ]
      }
    });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Settings error');
    return ctx.reply('❌ Failed to load settings. Please try again.');
  }
}

// Helper function for wallet refresh
async function handleWalletRefresh(ctx, userId, chain) {
  try {
    await ctx.answerCbQuery('🔄 Refreshing wallet...');
    
    // Refresh wallet data
    const result = await walletService.refreshWalletData(userId, chain);
    
    if (!result.success) {
      return ctx.reply(`❌ Failed to refresh: ${result.error}`);
    }
    
    const message = `🔄 **Wallet Refreshed Successfully**\n\n` +
                   `📍 **Address:** \`${result.address}\`\n` +
                   `💰 **Balance:** ${result.balance} ${result.symbol}\n` +
                   `💲 **USD Value:** $${result.usdValue}\n` +
                   `🕒 **Updated:** ${new Date().toLocaleString()}`;
    
    return ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Check Balance', callback_data: `balance_${chain}` }],
          [{ text: '🔄 Refresh Again', callback_data: `refresh_${chain}` }],
          [{ text: '⚙️ Settings', callback_data: `settings_${chain}` }]
        ]
      }
    });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Refresh failed');
    return ctx.reply('❌ Failed to refresh wallet. Please try again.');
  }
}

// Handle wallet regeneration callback
walletHandler.action(/^regenerate_wallet_(.+)$/, async (ctx) => {
  try {
    const chain = ctx.match[1];
    const userId = ctx.from.id;
    
    await ctx.answerCbQuery('🔄 Creating new wallet...');
    
    const result = await walletService.regenerateWallet(userId, chain);
    
    if (!result.success) {
      return ctx.reply('❌ Failed to create new wallet. Please try again.');
    }
    
    const message = `✅ **New ${chain.toUpperCase()} Wallet Created!**\n\n` +
                   `📍 **New Address:** \`${result.address}\`\n` +
                   `💰 **Balance:** ${result.balance} ${result.symbol}\n` +
                   `💲 **USD Value:** $${result.usdValue}\n\n` +
                   `🎯 **Next Steps:**\n` +
                   `• Fund your wallet to start trading\n` +
                   `• Use /buy to purchase tokens\n` +
                   `• Set your trading amount with /amount`;
    
    return ctx.editMessageText(message, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Check Balance', callback_data: `balance_${chain}` }],
          [{ text: '🔐 Export Wallet', callback_data: `exportwallet_${chain}` }],
          [{ text: '⚙️ Settings', callback_data: `settings_${chain}` }]
        ]
      }
    });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Creation failed');
    return ctx.reply('❌ Failed to create new wallet. Please try again.');
  }
});

// Handle specific wallet refresh patterns (wallet_refresh_chain)
walletHandler.action(/^wallet_refresh_(.+)$/, async (ctx) => {
  try {
    const chain = ctx.match[1];
    const userId = ctx.from.id;
    
    return handleWalletRefresh(ctx, userId, chain);
    
  } catch (error) {
    console.error('Wallet refresh callback error:', error);
    await ctx.answerCbQuery('❌ Error refreshing');
    return ctx.reply('❌ Failed to refresh wallet. Please try again.');
  }
});

// Handle wallet settings callback (without chain)
walletHandler.action('wallet_settings', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userSettings = await userService.getUserSettings(userId);
    
    if (!userSettings.chain) {
      await ctx.answerCbQuery('❌ No chain set');
      return ctx.reply('⚠️ Please set your chain first using /setchain command.');
    }
    
    return handleWalletSettings(ctx, userId, userSettings.chain);
    
  } catch (error) {
    console.error('Wallet settings callback error:', error);
    await ctx.answerCbQuery('❌ Settings error');
    return ctx.reply('❌ Failed to load settings. Please try again.');
  }
});

// Handle balance refresh patterns (balance_refresh_chain)
walletHandler.action(/^balance_refresh_(.+)$/, async (ctx) => {
  try {
    const chain = ctx.match[1];
    const userId = ctx.from.id;
    
    return handleBalanceCheck(ctx, userId, chain);
    
  } catch (error) {
    console.error('Balance refresh callback error:', error);
    await ctx.answerCbQuery('❌ Error refreshing balance');
    return ctx.reply('❌ Failed to refresh balance. Please try again.');
  }
});

// Handle copy quickbuy links
walletHandler.action(/^copy_quickbuy_(.+)$/, async (ctx) => {
  try {
    const chain = ctx.match[1];
    const userId = ctx.from.id;
    
    return handleCopyQuickBuy(ctx, userId, chain);
    
  } catch (error) {
    console.error('Copy quickbuy callback error:', error);
    await ctx.answerCbQuery('❌ Error copying link');
    return ctx.reply('❌ Failed to copy quickbuy link. Please try again.');
  }
});

// Helper function for copy quickbuy
async function handleCopyQuickBuy(ctx, userId, chain) {
  try {
    await ctx.answerCbQuery('📋 QuickBuy link copied!');
    
    const quickBuyLink = `https://t.me/E_sniper_bot?start=quickbuy_${chain}_${userId}`;
    
    const message = `🚀 **QuickBuy Link Generated**\n\n` +
                   `📋 **Link:** \`${quickBuyLink}\`\n\n` +
                   `💡 **How to use:**\n` +
                   `• Share this link for quick token purchases\n` +
                   `• Anyone with this link can buy tokens using your settings\n` +
                   `• Perfect for group trading signals\n\n` +
                   `⚠️ **Security Note:** Only share with trusted users`;
    
    return ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    await ctx.answerCbQuery('❌ Copy failed');
    return ctx.reply('❌ Failed to generate quickbuy link. Please try again.');
  }
}

module.exports = walletHandler;