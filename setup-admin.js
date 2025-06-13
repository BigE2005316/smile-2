// setup-admin.js - Setup script for admin configuration
const fs = require('fs');
const path = require('path');

async function setupAdmin() {
  console.log('🔧 Setting up Smile Snipper Bot Admin Configuration...\n');
  
  // Check if .env exists
  const envPath = path.join(__dirname, '.env');
  let envContent = '';
  
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('✅ Found existing .env file');
  } else {
    console.log('📝 Creating new .env file');
  }
  
  console.log('\n📋 To use /admin commands, you need to set your Telegram ID as admin.');
  console.log('To find your Telegram ID:');
  console.log('1. Start the bot and send any message');
  console.log('2. Check the bot logs - your ID will be shown');
  console.log('3. Or use @userinfobot in Telegram to get your ID');
  
  console.log('\n🔧 Required Environment Variables:');
  console.log('ADMIN_TELEGRAM_ID=YOUR_TELEGRAM_ID_HERE');
  console.log('BOT_TOKEN=your_bot_token');
  console.log('HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=d892a442-624b-44dc-af78-bf757b510d66');
  console.log('DEV_FEE_PERCENT=3');
  console.log('REDIS_URL=redis://localhost:6379');
  
  // Create a sample .env if it doesn't exist
  if (!fs.existsSync(envPath)) {
    const sampleEnv = `# Smile Snipper Bot Configuration
BOT_TOKEN=your_bot_token_here
ADMIN_TELEGRAM_ID=YOUR_TELEGRAM_ID_HERE
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=d892a442-624b-44dc-af78-bf757b510d66
DEV_FEE_PERCENT=3
REDIS_URL=redis://localhost:6379
BOT_USERNAME=Emmanuel_sniper_bot
NODE_ENV=production

# Optional configurations
WEBHOOK_URL=
PORT=3000
`;
    
    fs.writeFileSync(envPath, sampleEnv);
    console.log('\n✅ Created .env file with sample configuration');
    console.log('📝 Please edit .env file and set your actual values');
  }
  
  console.log('\n🚀 Next steps:');
  console.log('1. Edit .env file with your actual values');
  console.log('2. Set ADMIN_TELEGRAM_ID to your Telegram user ID');
  console.log('3. Restart the bot: npm start');
  console.log('4. Test admin access with /admin command');
  
  console.log('\n💡 Your current user ID will be logged when you send any message to the bot');
}

if (require.main === module) {
  setupAdmin().catch(console.error);
}

module.exports = { setupAdmin }; 