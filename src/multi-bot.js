// Multi-bot configuration is non-secret metadata. Each bot is isolated by
// hostname, credentials and its own durable D1/Turso database.
const PER_BOT_FIELDS = [
  'BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'SEPAY_WEBHOOK_API_KEY',
  'ADMIN_TELEGRAM_ID', 'ADMIN_DASHBOARD_PASSWORD',
  'BANK_BIN', 'BANK_ACCOUNT_NO', 'BANK_ACCOUNT_NAME', 'SUPPORT_USERNAME',
  'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'
];

export function botRegistry(env) {
  if (env.MULTI_BOTS === undefined || env.MULTI_BOTS === '') return null;
  let entries;
  try { entries = JSON.parse(env.MULTI_BOTS); }
  catch { throw new Error('MULTI_BOTS must be valid JSON'); }
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 20)
    throw new Error('MULTI_BOTS must contain 1-20 bots');
  const ids = new Set(), hosts = new Set();
  return entries.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
        || !/^[a-z][a-z0-9_]{0,30}$/.test(entry.id || ''))
      throw new Error('MULTI_BOTS has an invalid bot id');
    const host = entry.host;
    if (typeof host !== 'string' || host.length > 253 ||
        !/^[a-z0-9.-]+$/i.test(host) || host.includes('..'))
      throw new Error('MULTI_BOTS has an invalid host');
    let parsed;
    try { parsed = new URL('https://' + host); }
    catch { throw new Error('MULTI_BOTS has an invalid host'); }
    // Exact DNS hostnames only; no URLs, ports, wildcards, paths or credentials.
    const hostname = parsed.hostname;
    if (parsed.host !== hostname || parsed.pathname !== '/' || hostname !== host.toLowerCase()
        || hostname.startsWith('.') || hostname.endsWith('.') || !hostname.includes('.'))
      throw new Error('MULTI_BOTS requires a unique fully-qualified hostname');
    if (ids.has(entry.id) || hosts.has(hostname))
      throw new Error('MULTI_BOTS contains duplicate ids or hosts');
    ids.add(entry.id); hosts.add(hostname);
    return { id: entry.id, host: hostname };
  });
}

export function botEnvironment(env, bot) {
  const prefix = bot.id.toUpperCase();
  const scoped = {
    DB: env[prefix + '_DB'],
    PHYSICAL_ORDER_TTL_MINUTES: env.PHYSICAL_ORDER_TTL_MINUTES,
    STARS_ORDER_TTL_MINUTES: env.STARS_ORDER_TTL_MINUTES
  };
  for (const name of PER_BOT_FIELDS) scoped[name] = env[prefix + '_' + name];
  // No fallback to global BOT_TOKEN, bank secrets, admin password or DB:
  // missing per-bot settings must fail closed rather than mix customers.
  return scoped;
}

export function selectBotEnvironment(env, hostname) {
  const entries = botRegistry(env);
  if (entries === null) return env; // Existing single-bot deployments unchanged.
  const bot = entries.find(item => item.host === String(hostname).toLowerCase());
  if (!bot) return null;
  return botEnvironment(env, bot);
}

export function allBotEnvironments(env) {
  const entries = botRegistry(env);
  if (entries === null) return [env];
  const environments = entries.map(bot => botEnvironment(env, bot));
  const databases = new Set(), urls = new Set();
  for (const scoped of environments) {
    if (!scoped.BOT_TOKEN || !scoped.TELEGRAM_WEBHOOK_SECRET)
      throw new Error('Missing per-bot Telegram credentials');
    if (scoped.DB) {
      if (databases.has(scoped.DB)) throw new Error('Multi-bot D1 bindings must be different');
      databases.add(scoped.DB);
    } else if (scoped.TURSO_DATABASE_URL && scoped.TURSO_AUTH_TOKEN) {
      if (urls.has(scoped.TURSO_DATABASE_URL)) throw new Error('Multi-bot Turso databases must be different');
      urls.add(scoped.TURSO_DATABASE_URL);
    } else throw new Error('Each bot requires its own database');
  }
  return environments;
}
