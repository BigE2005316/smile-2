// Quick test of manual trading service
console.log('🧪 TESTING MANUAL TRADING SERVICE...');

try {
  const { getManualTradingService } = require('./services/manualTrading');
  console.log('✅ Manual trading module loaded');
  
  const service = getManualTradingService();
  console.log('✅ Service instance created:', !!service);
  
  if (service) {
    console.log('✅ Service initialized:', service.isInitialized());
    
    // Check if key methods exist
    const methods = {
      'processBuyCommand': typeof service.processBuyCommand,
      'processSellCommand': typeof service.processSellCommand,
      'getUserPositions': typeof service.getUserPositions,
      'createTradeConfirmation': typeof service.createTradeConfirmation,
      'executeConfirmedTrade': typeof service.executeConfirmedTrade,
      'cancelPendingTrade': typeof service.cancelPendingTrade
    };
    
    console.log('📋 Method availability:');
    Object.entries(methods).forEach(([method, type]) => {
      const status = type === 'function' ? '✅' : '❌';
      console.log(`  ${status} ${method}: ${type}`);
    });
    
    // Test buy command
    console.log('\n🛒 Testing buy command...');
    service.processBuyCommand('5290841278', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
      .then(result => {
        console.log('✅ Buy command result:', JSON.stringify(result, null, 2));
      })
      .catch(error => {
        console.log('❌ Buy command error:', error.message);
      });
      
    // Test sell command
    console.log('\n💰 Testing sell command...');
    service.processSellCommand('5290841278', '')
      .then(result => {
        console.log('✅ Sell command result:', JSON.stringify(result, null, 2));
      })
      .catch(error => {
        console.log('❌ Sell command error:', error.message);
      });
  }
  
} catch (error) {
  console.log('❌ Failed to load manual trading service:', error.message);
  console.log(error.stack);
} 