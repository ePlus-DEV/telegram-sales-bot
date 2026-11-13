// Offline configuration preflight: diagnostics contain variable NAMES, never values.
import { pathToFileURL } from 'node:url';
import { botRegistry, botEnvironment } from '../../src/multi-bot.js';

const required = (env,name,errors) => {
  const value=typeof env[name]==='string'?env[name].trim():'';
  if (!value || /^(?:replace|change[-_ ]?me|your[-_ ]|example|\.\.\.)/i.test(value))
    errors.push(name+': missing or placeholder');
  return value;
};

export function checkConfiguration(env,{provider='cloudflare',physical=false}={}) {
  if (env.MULTI_BOTS !== undefined && env.MULTI_BOTS !== '') {
    let registry;
    try { registry = botRegistry(env); }
    catch { return {ok:false,provider,physical,errors:['MULTI_BOTS: invalid registry']}; }
    const errors=[],tokens=new Set(),secrets=new Set(),databases=new Set(),urls=new Set();
    for (const bot of registry) {
      const scoped = botEnvironment(env,bot);
      const check = checkConfiguration(scoped,{provider,physical});
      errors.push(...check.errors.map(error=>bot.id+': '+error));
      for (const [value,set,label] of [
        [scoped.BOT_TOKEN,tokens,'BOT_TOKEN'],
        [scoped.TELEGRAM_WEBHOOK_SECRET,secrets,'TELEGRAM_WEBHOOK_SECRET'],
        [scoped.DB,databases,'DB'],
        [scoped.TURSO_DATABASE_URL,urls,'TURSO_DATABASE_URL']
      ]) {
        if (value && set.has(value)) errors.push(bot.id+': duplicate '+label+' across bots');
        if (value) set.add(value);
      }
    }
    return {ok:errors.length===0,provider,physical,errors};
  }
  const errors=[];
  if(!['cloudflare','turso'].includes(provider)) errors.push('provider: expected cloudflare or turso');
  const bot=required(env,'BOT_TOKEN',errors);
  if(bot && !/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(bot))errors.push('BOT_TOKEN: invalid bot-token format');
  const secret=required(env,'TELEGRAM_WEBHOOK_SECRET',errors);
  if(secret && !/^[A-Za-z0-9_-]{1,256}$/.test(secret))errors.push('TELEGRAM_WEBHOOK_SECRET: invalid secret-token format');
  const admin=required(env,'ADMIN_TELEGRAM_ID',errors);
  if(admin && !/^[1-9]\d{0,15}$/.test(admin))errors.push('ADMIN_TELEGRAM_ID: expected numeric Telegram ID');
  const password=required(env,'ADMIN_DASHBOARD_PASSWORD',errors);
  if(password && password.length<16)errors.push('ADMIN_DASHBOARD_PASSWORD: minimum 16 characters');

  if(provider==='turso'){
    const url=required(env,'TURSO_DATABASE_URL',errors);
    if(url){
      try {
        const parsed=new URL(url);
        if(!['libsql:','https:'].includes(parsed.protocol)||!parsed.hostname||parsed.username||parsed.password||parsed.hash)
          throw new Error('invalid');
      } catch { errors.push('TURSO_DATABASE_URL: expected remote HTTPS/libSQL URL'); }
    }
    required(env,'TURSO_AUTH_TOKEN',errors);
  }
  const names=['BANK_BIN','BANK_ACCOUNT_NO','BANK_ACCOUNT_NAME','SEPAY_WEBHOOK_API_KEY'];
  if(physical||names.some(n=>Boolean(env[n]))){
    names.forEach(n=>required(env,n,errors));
    if(env.BANK_BIN&&!/^\d{6}$/.test(env.BANK_BIN))errors.push('BANK_BIN: expected 6 digits');
    if(env.BANK_ACCOUNT_NO&&!/^\d{4,22}$/.test(env.BANK_ACCOUNT_NO))errors.push('BANK_ACCOUNT_NO: expected 4–22 digits');
  }
  return {ok:errors.length===0,provider,physical:physical||names.some(n=>Boolean(env[n])),errors};
}

function cli(){
  const provider=process.argv.find(v=>v.startsWith('--provider='))?.slice('--provider='.length)||'cloudflare';
  const physical=process.argv.includes('--physical');
  const result=checkConfiguration(process.env,{provider,physical});
  if(!result.ok){
    console.error('Preflight failed:\n'+result.errors.map(x=>' - '+x).join('\n'));
    process.exitCode=1;
  } else console.log('Configuration preflight OK ('+result.provider+'). No credentials printed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)cli();
