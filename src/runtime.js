import worker from './index.js';
import { databaseFromEnv } from './adapters/turso.js';
import { selectBotEnvironment } from './multi-bot.js';

// Shared Fetch API entrypoint for Node HTTP, Vercel and tests.
export function handleRequest(request, { env = process.env, path, waitUntil } = {}) {
  const pathname = path || new URL(request.url).pathname;
  const url = new URL(request.url);
  url.pathname = pathname;
  const normalized = path ? new Request(url, request) : request;
  // Select the tenant before resolving Turso; never use the global database
  // when a per-bot binding is missing.
  let chosen;
  try { chosen = selectBotEnvironment(env,url.hostname); }
  catch { return Response.json({ error:'configuration error' },{status:503}); }
  if (!chosen) return Response.json({error:'not found'},{status:404});
  const scopedEnv = { ...chosen, DB: databaseFromEnv(chosen) };
  return worker.fetch(normalized, scopedEnv, { waitUntil: waitUntil || (() => {}) });
}
