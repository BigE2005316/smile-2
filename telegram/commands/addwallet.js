// File: telegram/commands/addwallet.js
const userService = require('../../users/userService');

// Basic wallet validation
function isValidWallet(address) {
  // Solana wallet (base58, typically 32-44 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return true;
  
  // Ethereum/BSC wallet (hex, 42 chars starting with 0x)
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;
  
  return false;
}

module.exports = function (bot) {
  // Command handler: /addwallet
  bot.command('addwallet', (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.awaitingWallet = true;
    return ctx.reply('📝 Please send the wallet address you want to track:');
  });
};
