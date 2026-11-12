import worker from './index.js';
import { databaseFromEnv } from './adapters/turso.js';

// Shared Fetch API entrypoint for Node HTTP, Vercel and tests.
export function handleRequest(request, { env = process.env, path, waitUntil } = {}) {
  const pathname = path || new URL(request.url).pathname;
  const url = new URL(request.url);
  url.pathname = pathname;
  const normalized = path ? new Request(url, request) : request;
  const scopedEnv = { ...env, DB: databaseFromEnv(env) };
  return worker.fetch(normalized, scopedEnv, { waitUntil: waitUntil || (() => {}) });
}
