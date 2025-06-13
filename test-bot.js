// test-bot.js - Test script to verify bot functionality
require('dotenv').config();
const axios = require('axios');

async function testBot() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ No TELEGRAM_BOT_TOKEN found in .env');
    return;
  }
  
  try {
    // Test 1: Get bot info
    console.log('🧪 Testing bot connection...\n');
    
    const botInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getMe`);
    console.log('✅ Bot Info:');
    console.log(`   Username: @${botInfo.data.result.username}`);
    console.log(`   Name: ${botInfo.data.result.first_name}`);
    console.log(`   ID: ${botInfo.data.result.id}`);
    
    // Test 2: Check webhook status
    const webhookInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    console.log('\n📡 Webhook Status:');
    console.log(`   URL: ${webhookInfo.data.result.url || 'Not set (using polling)'}`);
    
    // Test 3: Check for updates
    const updates = await axios.get(`https://api.telegram.org/bot${botToken}/getUpdates?limit=5`);
    console.log(`\n📨 Recent updates: ${updates.data.result.length}`);
    
    // Test 4: Health check
    try {
      const health = await axios.get('http://localhost:3000/health');
      console.log('\n🏥 Health Check:');
      console.log(`   Status: ${health.data.status}`);
      console.log(`   Uptime: ${health.data.uptime.toFixed(2)} seconds`);
    } catch (err) {
      console.log('\n⚠️  Health check endpoint not responding');
    }
    
    console.log('\n✅ Bot appears to be configured correctly!');
    console.log('\n🤖 Test the bot by sending these commands in Telegram:');
    console.log('   /start - Initialize the bot');
    console.log('   /help - View all commands');
    console.log('   /settings - View your settings');
    console.log('   /addwallet - Add a wallet to track');
    console.log('   /trailingstop - Set trailing stop loss');
    console.log('   /copysells - Configure copy selling');
    
  } catch (err) {
    console.error('❌ Error testing bot:', err.response?.data || err.message);
    if (err.response?.status === 401) {
      console.error('\n⚠️  Invalid bot token! Check your TELEGRAM_BOT_TOKEN in .env');
    }
  }
}

testBot(); 