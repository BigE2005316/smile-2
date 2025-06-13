// services/solana.js
const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(SOLANA_RPC, 'confirmed');

// 🛠️ Replace with your own logic for which wallets to watch
const trackedWallets = [
  'o7RY6P2vQMuGSu1TrLM81weuzgDjaCRTXYRaXJwWcvc',
  '5Dqsy7HaAfBwCmc21cBZfdQEjt39kSnthb28BnfkEN8e',
];

// Keep track of known transactions
const knownTxs = new Set();

async function pollSolanaWallets(onTrade) {
  console.log("🔍 Watching Solana wallets...");

  setInterval(async () => {
    for (const wallet of trackedWallets) {
      try {
        const publicKey = new PublicKey(wallet);
        const signatures = await connection.getSignaturesForAddress(publicKey, { limit: 5 });

        for (const sig of signatures) {
          if (!knownTxs.has(sig.signature)) {
            knownTxs.add(sig.signature);
            const tx = await connection.getTransaction(sig.signature, { commitment: 'confirmed' });
            if (tx) {
              // Notify trade
              await onTrade('solana', wallet, sig.signature, tx);
            }
          }
        }
      } catch (err) {
        console.error(`❌ Error polling Solana wallet ${wallet}:`, err);
      }
    }
  }, 5000); // poll every 5 seconds
}

module.exports = {
  pollSolanaWallets
};
