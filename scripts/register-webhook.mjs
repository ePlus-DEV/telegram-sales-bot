import { botRegistry, botEnvironment } from '../src/multi-bot.js';

let botToken = process.env.BOT_TOKEN;
let secret = process.env.TELEGRAM_WEBHOOK_SECRET;
let publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.WORKER_URL;
let botId = null;
try {
  const registry = botRegistry(process.env);
  if (registry) {
    botId = process.env.BOT_ID;
    const bot = registry.find(item => item.id === botId);
    if (!bot) throw new Error('Set BOT_ID to a configured MULTI_BOTS id');
    const scoped = botEnvironment(process.env,bot);
    botToken = scoped.BOT_TOKEN;
    secret = scoped.TELEGRAM_WEBHOOK_SECRET;
    publicBaseUrl = 'https://' + bot.host;
    // An explicitly provided URL must not silently register a bot to another tenant.
    if (process.env.PUBLIC_BASE_URL || process.env.WORKER_URL) {
      const override = new URL(process.env.PUBLIC_BASE_URL || process.env.WORKER_URL);
      if (override.origin !== publicBaseUrl || override.pathname !== '/' ||
          override.search || override.hash || override.username || override.password)
        throw new Error('PUBLIC_BASE_URL must match the selected bot host');
    }
  } else if (process.env.BOT_ID) {
    throw new Error('BOT_ID requires MULTI_BOTS');
  }
} catch (error) {
  console.error('Webhook configuration invalid:',error.message);
  process.exit(1);
}

if (!botToken || !secret || !publicBaseUrl) {
  console.error('Missing bot token, webhook secret or PUBLIC_BASE_URL');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET must contain only A-Z, a-z, 0-9, _ or -');
  process.exit(1);
}
let url;
try {
  url = new URL(publicBaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/' && url.pathname !== '')) throw new Error('Invalid URL');
} catch {
  console.error('PUBLIC_BASE_URL must be an HTTPS origin without path, query or credentials');
  process.exit(1);
}
const response = await fetch('https://api.telegram.org/bot' + botToken + '/setWebhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: url.origin + '/telegram/webhook',
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query']
  })
});
const payload = await response.json();
if (!response.ok || !payload.ok) {
  console.error('Telegram rejected setWebhook:', payload.description || response.status);
  process.exit(1);
}
console.log('Telegram webhook registered successfully'+(botId?' for '+botId:'')+'.');
