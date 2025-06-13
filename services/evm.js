// services/evm.js
const { JsonRpcProvider } = require("ethers");
require('dotenv').config();

const EVM_RPC = process.env.EVM_RPC || 'https://mainnet.infura.io/v3/YOUR_KEY';
const provider = new JsonRpcProvider(EVM_RPC);

// 🛠️ Replace with actual watched wallets
const trackedWallets = [
  '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
];

const knownHashes = new Set();

async function pollEVMWallets(onTrade) {
  console.log("🔍 Watching EVM wallets...");

  setInterval(async () => {
    for (const wallet of trackedWallets) {
      try {
        const txs = await provider.send("eth_getTransactionHistory", [wallet]); // Some providers may not support this
        for (const tx of txs.slice(-5)) {
          if (!knownHashes.has(tx.hash)) {
            knownHashes.add(tx.hash);
            await onTrade('evm', wallet, tx.hash, tx);
          }
        }
      } catch (err) {
        console.error(`❌ Error polling EVM wallet ${wallet}:`, err.message);
      }
    }
  }, 7000); // poll every 7s
}

module.exports = {
  pollEVMWallets
};
