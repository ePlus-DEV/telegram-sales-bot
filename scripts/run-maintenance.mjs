// Run the same reconciliation task as the Cloudflare cron without an always-on
// worker. Invoke manually or from a trusted host cron (never via HTTP).
import worker from '../src/index.js';
import { databaseFromEnv } from '../src/adapters/turso.js';

async function main() {
  const env={...process.env,DB:databaseFromEnv(process.env)};
  if (!env.BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET)
    throw new Error('Single-bot credentials not configured');
  if (env.MULTI_BOTS)
    throw new Error('This lightweight maintenance runner is for single-bot deployments only');
  const tasks=[];
  await worker.scheduled({},env,{waitUntil(promise){tasks.push(Promise.resolve(promise));}});
  const results=await Promise.allSettled(tasks);
  if (results.some(x=>x.status==='rejected'))
    throw new Error('One or more reconciliation tasks failed (inspect bot logs)');
  console.log('Bot maintenance completed');
}

main().catch(()=>{
  // Never print provider tokens or raw request details.
  console.error('Bot maintenance failed; check database and bot configuration');
  process.exitCode=1;
});
