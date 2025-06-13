const userService = require('../../users/userService');

module.exports = function(bot) {
  // Support command for users
  bot.command('support', async (ctx) => {
    const supportInfo = await getSupportInfo();
    
    const message = `💬 **Need Help?**

Our support team is here to assist you!

${supportInfo.twitter ? `🐦 **Twitter/X:** ${supportInfo.twitter}` : ''}
${supportInfo.whatsapp ? `📱 **WhatsApp:** ${supportInfo.whatsapp}` : ''}
${supportInfo.telegram ? `💬 **Telegram:** ${supportInfo.telegram}` : ''}
${supportInfo.email ? `📧 **Email:** ${supportInfo.email}` : ''}

**Common Issues:**
• Wallet problems → Try /wallet or /balance
• Trading issues → Check /settings and /help
• Transaction stuck → Check blockchain explorer
• Missing funds → Verify wallet address

**Response Time:** Usually within 2-4 hours

💡 **Pro Tip:** Include your User ID (${ctx.from.id}) when contacting support for faster assistance.`;

    return ctx.reply(message, { parse_mode: 'Markdown' });
  });
  
  // Admin command to set support links
  bot.command('setsupportlinks', async (ctx) => {
    const userId = String(ctx.from.id);
    const adminId = process.env.ADMIN_TELEGRAM_ID || process.env.ADMIN_ID;
    
    if (String(userId) !== String(adminId)) {
      return; // Silent fail for non-admins
    }
    
    ctx.session = ctx.session || {};
    ctx.session.awaitingSupportLinks = true;
    
    return ctx.reply(`🔧 **Set Support Links**

Please provide support contact information in this format:

\`\`\`
twitter: @YourTwitterHandle
whatsapp: +1234567890
telegram: @YourTelegramSupport
email: support@yourdomain.com
\`\`\`

You can include any or all of these. Send "skip" to keep current settings.`);
  });
};

// Get support info from storage
async function getSupportInfo() {
  const client = await userService.initRedis();
  let supportInfo = {
    twitter: '@SmileSnipperBot',
    whatsapp: null,
    telegram: null,
    email: null
  };
  
  if (client) {
    try {
      const stored = await client.hGetAll('admin:support');
      if (stored && Object.keys(stored).length > 0) {
        supportInfo = { ...supportInfo, ...stored };
      }
    } catch (err) {
      console.error('Error getting support info:', err);
    }
  }
  
  return supportInfo;
}

// Save support info (called from message handler)
async function saveSupportInfo(info) {
  const client = await userService.initRedis();
  
  if (client) {
    try {
      for (const [key, value] of Object.entries(info)) {
        if (value) {
          await client.hSet('admin:support', key, value);
        }
      }
    } catch (err) {
      console.error('Error saving support info:', err);
    }
  }
}

// Export for message handler
module.exports.saveSupportInfo = saveSupportInfo; 