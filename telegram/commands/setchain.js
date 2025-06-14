// telegram/commands/setchain.js
const userService = require('../../users/userService');

module.exports = function (bot) {
  bot.command('setchain', async (ctx) => {
    try {
      const userId = ctx.from.id;
      await userService.updateLastActive(userId);
      
      // Create keyboard with chain options
      const keyboard = {
        inline_keyboard: [
          [
            { text: '🟣 Solana', callback_data: 'set_chain_solana' },
            { text: '🔷 Ethereum', callback_data: 'set_chain_ethereum' }
          ],
          [
            { text: '🟡 BSC', callback_data: 'set_chain_bsc' },
            { text: '🟪 Polygon', callback_data: 'set_chain_polygon' }
          ],
          [
            { text: '🔵 Arbitrum', callback_data: 'set_chain_arbitrum' },
            { text: '🔶 Base', callback_data: 'set_chain_base' }
          ]
        ]
      };
      
      ctx.session = ctx.session || {};
      ctx.session.awaitingChain = true;
      
      return ctx.reply('🔗 **Select Blockchain**\n\nChoose which blockchain you want to use:', {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } catch (error) {
      console.error('Set chain command error:', error);
      return ctx.reply('❌ Error processing command. Please try again.');
    }
  });
  
  // Handle chain selection callbacks
  bot.action(/^set_chain_(.+)$/, async (ctx) => {
    try {
      const chain = ctx.match[1];
      const userId = ctx.from.id;
      
      await ctx.answerCbQuery(`Setting chain to ${chain.toUpperCase()}...`);
      
      // Validate chain
      const validChains = ['solana', 'ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
      if (!validChains.includes(chain)) {
        return ctx.editMessageText('❌ Invalid chain selection.');
      }
      
      // Update user's chain
      await userService.setChain(userId, chain);
      
      // Check if user has a wallet for this chain
      const userData = await userService.getUserSettings(userId);
      const hasWallet = userData.custodialWallets && userData.custodialWallets[chain];
      
      let message = `✅ **Blockchain set to ${chain.toUpperCase()}**\n\n`;
      
      if (hasWallet) {
        const walletAddress = userData.custodialWallets[chain].address;
        message += `💼 **Your ${chain.toUpperCase()} Wallet:**\n`;
        message += `\`${walletAddress}\`\n\n`;
        message += `💡 Use /wallet to see full details or /balance to check funds.`;
      } else {
        message += `⚠️ You don't have a ${chain.toUpperCase()} wallet yet.\n\n`;
        message += `💡 Use /wallet to create one now.`;
      }
      
      await ctx.editMessageText(message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💼 Manage Wallet', callback_data: 'manage_wallet' },
              { text: '💰 Check Balance', callback_data: `balance_${chain}` }
            ],
            [
              { text: '💸 Start Trading', callback_data: 'start_trading' }
            ]
          ]
        }
      });
      
      // Clear session state
      if (ctx.session) {
        ctx.session.awaitingChain = false;
      }
      
    } catch (error) {
      console.error('Set chain callback error:', error);
      await ctx.answerCbQuery('❌ Error setting chain');
      await ctx.editMessageText('❌ Error setting blockchain. Please try again with /setchain');
    }
  });
};