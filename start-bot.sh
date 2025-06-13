#!/bin/bash

# Smile Snipper Bot Startup Script
echo "🚀 Starting Smile Snipper Bot with proper configuration..."

# Set environment variables
export SOLANA_RPC="https://mainnet.helius-rpc.com/?api-key=d892a442-624b-44dc-af78-bf757b510d66"
export NODE_ENV="production"
export PORT="3000"

# Check if .env exists, if not create basic one
if [ ! -f .env ]; then
    echo "📄 Creating basic .env file..."
    cat > .env << EOF
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
BOT_USERNAME=Emmanuel_sniper_bot

# Admin Configuration  
ADMIN_TELEGRAM_ID=YOUR_ADMIN_ID
ADMIN_WALLET_ADDRESS=your_wallet_address_for_dev_fees

# Chain-specific admin wallets
ADMIN_WALLET_SOLANA=4mow4nhmJ1CjmtAN5k51LNojGRNkxzFo8faqT8u9oLuW
ADMIN_WALLET_ETHEREUM=0xe04204B36Bd4B47EBCE3408F8009Ea6A40036f69
ADMIN_WALLET_BSC=0xe04204B36Bd4B47EBCE3408F8009Ea6A40036f69

# Dev Fee Configuration (percentage)
DEV_FEE_PERCENT=3

# Security
WALLET_ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

# Redis Configuration (optional - will fallback to file storage)
REDIS_URL=redis://localhost:6379

# Blockchain RPC Endpoints
SOLANA_RPC=https://mainnet.helius-rpc.com/?api-key=d892a442-624b-44dc-af78-bf757b510d66
ETH_RPC=https://rpc.ankr.com/eth
BSC_RPC=https://rpc.ankr.com/bsc

# Environment
NODE_ENV=production

# Port for the API
PORT=3000
EOF
    echo "✅ Basic .env file created. Please update with your actual tokens and keys."
fi

# Kill any existing bot processes
echo "🔄 Stopping any existing bot processes..."
pkill -f "node.*bot.js" || true
pkill -f "node.*index.js" || true

# Wait a moment
sleep 2

# Start the bot
echo "🎯 Starting bot..."
node telegram/bot.js 