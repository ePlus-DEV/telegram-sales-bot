const { BOT_TOKEN: botToken, TELEGRAM_WEBHOOK_SECRET: secret } = process.env;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || process.env.WORKER_URL;
if (!botToken || !secret || !publicBaseUrl) {
  console.error('Missing BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET or PUBLIC_BASE_URL');
  process.exit(1);
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET must contain only A-Z, a-z, 0-9, _ or -');
  process.exit(1);
}
let url;
try {
  url = new URL(publicBaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid URL');
} catch {
  console.error('PUBLIC_BASE_URL must be an HTTPS base URL without query/hash or credentials');
  process.exit(1);
}
const response = await fetch('https://api.telegram.org/bot' + botToken + '/setWebhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: url.href.replace(/\/$/, '') + '/telegram/webhook',
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'pre_checkout_query']
  })
});
const payload = await response.json();
if (!response.ok || !payload.ok) {
  console.error('Telegram rejected setWebhook:', payload.description || response.status);
  process.exit(1);
}
console.log('Telegram webhook registered successfully.');
