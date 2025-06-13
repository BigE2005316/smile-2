// health.js - Simple health check server for deployment platforms
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'smile-snipper-bot'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Smile Snipper Bot is running',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

// Start health check server only if this file is run directly
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🏥 Health check server running on port ${port}`);
  });
}

module.exports = app; 