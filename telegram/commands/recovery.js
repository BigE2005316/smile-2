// Recovery commands for lost/old wallets
const walletRecoveryService = require('../../services/walletRecoveryService');

module.exports = function(bot) {
  // Main recovery command
  bot.command('recover', async (ctx) => {
    const userId = String(ctx.from.id);
    
    await ctx.reply('🔍 **WALLET RECOVERY SYSTEM**\n\nGenerating comprehensive wallet report...\n\n⏳ Please wait while I scan all your wallets...', { parse_mode: 'Markdown' });
    
    try {
      // Generate full recovery report
      const report = await walletRecoveryService.generateRecoveryReport(userId);
      const formattedReport = walletRecoveryService.formatReportForUser(report);
      
      // Split message if too long
      if (formattedReport.length > 4000) {
        const parts = formattedReport.match(/.{1,4000}/g) || [formattedReport];
        for (let i = 0; i < parts.length; i++) {
          await ctx.reply(`📄 **RECOVERY REPORT (Part ${i+1}/${parts.length})**\n\n${parts[i]}`, { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(formattedReport, { parse_mode: 'Markdown' });
      }
      
      // Follow-up options
      await ctx.reply(`🛠️ **RECOVERY OPTIONS:**\n\n` +
        `• /wallets - Quick wallet overview\n` +
        `• /balance - Check current wallet balance\n` +
        `• /export - Export current wallet private key\n` +
        `• /import - Import external wallet (if you have private key)\n` +
        `• /support - Contact support for complex recovery\n\n` +
        `💡 **If you have the private key of your old wallet:**\n` +
        `You can import it into any Solana wallet (Phantom, Solflare, etc.)`, 
        { parse_mode: 'Markdown' });
        
    } catch (error) {
      console.error('Recovery command error:', error);
      await ctx.reply(`❌ Error generating recovery report: ${error.message}\n\nPlease try again or contact support.`);
    }
  });

  // Quick wallet check
  bot.command('wallets', async (ctx) => {
    const userId = String(ctx.from.id);
    
    try {
      const quickCheck = await walletRecoveryService.quickWalletCheck(userId);
      
      if (quickCheck.error) {
        return ctx.reply(`❌ Error: ${quickCheck.error}`);
      }
      
      let message = `👛 **YOUR WALLETS**\n\n`;
      
      if (quickCheck.activeWallet) {
        message += `🟢 **ACTIVE WALLET:**\n`;
        message += `   Address: \`${quickCheck.activeWallet.address}\`\n`;
        message += `   Chain: ${quickCheck.activeWallet.chain.toUpperCase()}\n`;
        if (quickCheck.activeWallet.regenerated) {
          message += `   ⚠️ This wallet was regenerated\n`;
        }
        message += `\n`;
      }
      
      if (quickCheck.namedWallets.length > 0) {
        message += `📝 **NAMED WALLETS:**\n`;
        quickCheck.namedWallets.forEach(wallet => {
          message += `   • "${wallet.name}": \`${wallet.address}\`\n`;
          message += `     Status: ${wallet.status}\n`;
        });
        message += `\n`;
      }
      
      message += `📊 **Summary:** ${quickCheck.totalWallets} total wallet(s)\n\n`;
      
      if (quickCheck.hasMultipleWallets) {
        message += `💡 You have multiple wallets. Use /recover for detailed analysis.`;
      } else {
        message += `ℹ️ Use /recover for detailed wallet analysis.`;
      }
      
      await ctx.reply(message, { parse_mode: 'Markdown' });
      
    } catch (error) {
      console.error('Wallets command error:', error);
      await ctx.reply(`❌ Error checking wallets: ${error.message}`);
    }
  });

  // Import wallet command
  bot.command('import', async (ctx) => {
    await ctx.reply(`🔑 **IMPORT EXTERNAL WALLET**\n\n` +
      `To import a wallet using private key:\n\n` +
      `⚠️ **SECURITY WARNING:**\n` +
      `• Never share your private key\n` +
      `• Only import wallets you own\n` +
      `• Delete messages containing private keys\n\n` +
      `📱 **Recommended Apps for Import:**\n` +
      `• Phantom Wallet\n` +
      `• Solflare Wallet\n` +
      `• Sollet.io\n\n` +
      `🔧 **Import Process:**\n` +
      `1. Open your wallet app\n` +
      `2. Select "Import Wallet"\n` +
      `3. Enter your private key\n` +
      `4. Access your funds\n\n` +
      `💡 This bot currently doesn't support importing external wallets directly for security reasons.`, 
      { parse_mode: 'Markdown' });
  });

  // Support command
  bot.command('support', async (ctx) => {
    const userId = String(ctx.from.id);
    const username = ctx.from.username || 'No username';
    
    await ctx.reply(`🆘 **WALLET RECOVERY SUPPORT**\n\n` +
      `📞 **Contact Information:**\n` +
      `• Telegram: @YourSupportUsername\n` +
      `• Email: support@yourbot.com\n\n` +
      `📋 **Your Support ID:** \`${userId}\`\n` +
      `🏷️ **Username:** @${username}\n\n` +
      `📝 **What to Include:**\n` +
      `• Your user ID (shown above)\n` +
      `• Description of the issue\n` +
      `• When you last accessed your wallet\n` +
      `• Any error messages you received\n\n` +
      `⏱️ **Response Time:** Usually within 24 hours\n\n` +
      `🔐 **Security Note:** Support will NEVER ask for your private keys!`, 
      { parse_mode: 'Markdown' });
  });
}; 