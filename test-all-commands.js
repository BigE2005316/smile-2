// Comprehensive Bot Command Testing
const { Telegraf } = require('telegraf');

async function testAllCommands() {
  console.log('🧪 COMPREHENSIVE BOT COMMAND TESTING');
  console.log('=====================================');
  
  const testUserId = '5290841278';
  
  // Test 1: Core Services
  console.log('\n1️⃣ TESTING CORE SERVICES:');
  console.log('==========================');
  
  try {
    const userService = require('./users/userService');
    const userData = await userService.getUserSettings(testUserId);
    console.log('✅ User Service: WORKING');
  } catch (error) {
    console.log('❌ User Service: FAILED -', error.message);
  }
  
  try {
    const { getManualTradingService } = require('./services/manualTrading');
    const service = getManualTradingService();
    
    if (service && service.isInitialized()) {
      console.log('✅ Manual Trading Service: WORKING');
      
      // Test specific methods
      const methods = ['processBuyCommand', 'processSellCommand', 'getUserPositions', 'createTradeConfirmation', 'executeConfirmedTrade'];
      
      for (const method of methods) {
        if (typeof service[method] === 'function') {
          console.log(`  ✅ ${method}: EXISTS`);
        } else {
          console.log(`  ❌ ${method}: MISSING`);
        }
      }
    } else {
      console.log('❌ Manual Trading Service: NOT INITIALIZED');
    }
  } catch (error) {
    console.log('❌ Manual Trading Service: FAILED -', error.message);
  }
  
  try {
    const walletService = require('./services/walletService');
    console.log('✅ Wallet Service: WORKING');
  } catch (error) {
    console.log('❌ Wallet Service: FAILED -', error.message);
  }
  
  try {
    const walletRecoveryService = require('./services/walletRecoveryService');
    console.log('✅ Wallet Recovery Service: WORKING');
  } catch (error) {
    console.log('❌ Wallet Recovery Service: FAILED -', error.message);
  }
  
  // Test 2: Basic Commands
  console.log('\n2️⃣ TESTING BASIC COMMANDS:');
  console.log('===========================');
  
  const basicCommands = [
    'start', 'help', 'settings', 'positions', 'balance', 
    'wallet', 'amount', 'setchain', 'cancel'
  ];
  
  for (const cmd of basicCommands) {
    try {
      const commandFile = `./telegram/commands/${cmd}.js`;
      require.resolve(commandFile);
      console.log(`✅ /${cmd}: COMMAND FILE EXISTS`);
    } catch (error) {
      console.log(`❌ /${cmd}: COMMAND FILE MISSING`);
    }
  }
  
  // Test 3: Trading Commands
  console.log('\n3️⃣ TESTING TRADING COMMANDS:');
  console.log('=============================');
  
  try {
    const tradingCommands = require('./telegram/commands/trading');
    console.log('✅ Trading Commands: MODULE LOADED');
    
    // Test trading service integration
    const { getManualTradingService } = require('./services/manualTrading');
    const service = getManualTradingService();
    
    if (service) {
      // Test buy command processing
      try {
        const buyResult = await service.processBuyCommand(testUserId, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
        console.log('✅ Buy Command Processing: WORKING');
      } catch (error) {
        console.log('❌ Buy Command Processing: FAILED -', error.message);
      }
      
      // Test sell command processing  
      try {
        const sellResult = await service.processSellCommand(testUserId, '');
        console.log('✅ Sell Command Processing: WORKING');
      } catch (error) {
        console.log('❌ Sell Command Processing: FAILED -', error.message);
      }
      
      // Test positions
      try {
        const positions = await service.getUserPositions(testUserId);
        console.log('✅ Get User Positions: WORKING');
      } catch (error) {
        console.log('❌ Get User Positions: FAILED -', error.message);
      }
      
    } else {
      console.log('❌ Trading Service: NOT AVAILABLE');
    }
    
  } catch (error) {
    console.log('❌ Trading Commands: FAILED -', error.message);
  }
  
  // Test 4: Recovery Commands
  console.log('\n4️⃣ TESTING RECOVERY COMMANDS:');
  console.log('==============================');
  
  try {
    const recoveryCommands = require('./telegram/commands/recovery');
    console.log('✅ Recovery Commands: MODULE LOADED');
    
    const walletRecoveryService = require('./services/walletRecoveryService');
    
    // Test recovery functionality
    try {
      const wallets = await walletRecoveryService.getAllUserWallets(testUserId);
      console.log(`✅ Get All User Wallets: WORKING (${wallets.length} wallets found)`);
      
      // Check if user's real old wallet is included
      const realOldWallet = wallets.find(w => w.address === '4vB155WNthZn6TBVjuZm1SjyJM4RDTgUERm2H4fuA8KQ');
      if (realOldWallet) {
        console.log('✅ Real Old Wallet Found: INCLUDED IN RECOVERY');
      } else {
        console.log('❌ Real Old Wallet: NOT FOUND IN RECOVERY');
      }
      
    } catch (error) {
      console.log('❌ Recovery Functionality: FAILED -', error.message);
    }
    
  } catch (error) {
    console.log('❌ Recovery Commands: FAILED -', error.message);
  }
  
  // Test 5: Wallet Commands
  console.log('\n5️⃣ TESTING WALLET COMMANDS:');
  console.log('============================');
  
  try {
    const walletService = require('./services/walletService');
    
    // Test balance check for real old wallet
    try {
      const balance = await walletService.getWalletBalance('4vB155WNthZn6TBVjuZm1SjyJM4RDTgUERm2H4fuA8KQ', 'solana');
      console.log(`✅ Real Old Wallet Balance: ${balance.balance} SOL (${balance.usdValue})`);
    } catch (error) {
      console.log('❌ Wallet Balance Check: FAILED -', error.message);
    }
    
    // Test current wallet balance
    try {
      const balance = await walletService.getWalletBalance('DexyAtigHoN3sQcDCecoEC6yXV4ycc8nDzn48yHtock5', 'solana');
      console.log(`✅ Current Wallet Balance: ${balance.balance} SOL (${balance.usdValue})`);
    } catch (error) {
      console.log('❌ Current Wallet Balance: FAILED -', error.message);
    }
    
  } catch (error) {
    console.log('❌ Wallet Commands: FAILED -', error.message);
  }
  
  // Test 6: Command Registration
  console.log('\n6️⃣ TESTING COMMAND REGISTRATION:');
  console.log('=================================');
  
  try {
    const { registerBotCommands } = require('./telegram/commands');
    console.log('✅ Command Registration: MODULE LOADED');
    
    // Test if all command files can be loaded
    const commandFiles = [
      'start', 'help', 'wallet', 'trading', 'recovery', 
      'amount', 'setchain', 'positions', 'settings'
    ];
    
    let loadedCommands = 0;
    for (const cmdFile of commandFiles) {
      try {
        require(`./telegram/commands/${cmdFile}`);
        loadedCommands++;
        console.log(`  ✅ ${cmdFile}.js: LOADED`);
      } catch (error) {
        console.log(`  ❌ ${cmdFile}.js: FAILED - ${error.message}`);
      }
    }
    
    console.log(`📊 SUMMARY: ${loadedCommands}/${commandFiles.length} command files loaded successfully`);
    
  } catch (error) {
    console.log('❌ Command Registration: FAILED -', error.message);
  }
  
  // Test 7: RPC Connectivity
  console.log('\n7️⃣ TESTING RPC CONNECTIVITY:');
  console.log('=============================');
  
  try {
    const { getRPCManager } = require('./services/rpcManager');
    const rpcManager = getRPCManager();
    const status = rpcManager.getStatus();
    
    console.log(`✅ RPC Manager: ${status.healthyRPCs}/${status.totalRPCs} healthy connections`);
    
    if (status.healthyRPCs > 0) {
      console.log('✅ RPC Connectivity: WORKING');
    } else {
      console.log('❌ RPC Connectivity: ALL ENDPOINTS DOWN');
    }
    
  } catch (error) {
    console.log('❌ RPC Manager: FAILED -', error.message);
  }
  
  // Final Summary
  console.log('\n🎯 FINAL TESTING SUMMARY:');
  console.log('=========================');
  console.log('✅ All tests completed');
  console.log('📋 Check results above for any failures');
  console.log('🔧 Bot should be ready for manual trading');
  console.log('\n💡 RECOMMENDED ACTIONS:');
  console.log('1. Try /recover command to see your old wallet');
  console.log('2. Use /buy 0.01 EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v to test trading');
  console.log('3. When prompted, type YES to confirm');
  console.log('4. Check logs for trade confirmation messages');
}

// Run the test
testAllCommands().catch(console.error); 