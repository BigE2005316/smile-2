#!/bin/bash

# Smile Snipper Bot Deployment Script
echo "🚀 Deploying Smile Snipper Bot to production..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t smile-snipper-bot:latest .

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "❌ Docker build failed. Please check the errors above."
    exit 1
fi

# Stop any existing container
echo "🛑 Stopping existing containers..."
docker stop smile-snipper-bot 2>/dev/null || true
docker rm smile-snipper-bot 2>/dev/null || true

# Run the container
echo "🚀 Starting new container..."
docker run -d \
    --name smile-snipper-bot \
    --restart always \
    -p 3000:3000 \
    -v $(pwd)/.env:/app/.env \
    -v $(pwd)/data:/app/data \
    smile-snipper-bot:latest

# Check if container started successfully
if [ $? -ne 0 ]; then
    echo "❌ Failed to start container. Please check the errors above."
    exit 1
fi

# Show container status
echo "✅ Container started successfully!"
echo "📊 Container status:"
docker ps --filter "name=smile-snipper-bot"

echo "🔍 Container logs:"
docker logs --tail 20 smile-snipper-bot

echo "🌐 Health check available at: http://localhost:3000/health"
echo "🤖 Bot is now running in production mode!"
echo "📱 Open Telegram and start chatting with your bot"