import { constantTimeEqual } from '../domain.js';

export const SESSION_COOKIE = 'eplus_sales_admin';

const textBytes = value => new TextEncoder().encode(value);
async function sha256(data) {
  const digest = await crypto.subtle.digest('SHA-256',textBytes(data));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

function secureRandom(bytes) {
  const array=new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array,b=>b.toString(16).padStart(2,'0')).join('');
}

export function dashboardConfigured(env) {
  return typeof env.ADMIN_DASHBOARD_PASSWORD==='string' && env.ADMIN_DASHBOARD_PASSWORD.length>=16;
}

export async function passwordMatches(env,value) {
  if (!dashboardConfigured(env) || typeof value!=='string' || value.length>1024) return false;
  // Compare fixed-length digests to avoid variable-time comparisons on the original password.
  return constantTimeEqual(await sha256(value),await sha256(env.ADMIN_DASHBOARD_PASSWORD));
}

function clientKey(request) {
  // Prefer edge-provided headers; never use user-supplied X-Forwarded-For.
  // A shared fallback still applies to environments with no trustworthy IP header.
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || 'unknown';
}

async function failureKey(request,env) {
  return 'ip:'+await sha256(String(env.ADMIN_DASHBOARD_PASSWORD)+':'+clientKey(request));
}

export async function loginBlocked(env,request) {
  const key=await failureKey(request,env);
  const {results}=await env.DB.prepare(
    "SELECT id,failures FROM admin_login_limits WHERE id IN (?, 'global') AND reset_at>CURRENT_TIMESTAMP"
  ).bind(key).all();
  return results.some(row=>row.failures >= (row.id==='global'?80:5));
}

export async function noteFailedLogin(env,request) {
  const key=await failureKey(request,env);
  const query="INSERT INTO admin_login_limits(id,failures,reset_at) VALUES(?,1,datetime('now','+15 minutes')) "
    + "ON CONFLICT(id) DO UPDATE SET failures=CASE WHEN reset_at<=CURRENT_TIMESTAMP THEN 1 ELSE failures+1 END,"
    + "reset_at=CASE WHEN reset_at<=CURRENT_TIMESTAMP THEN datetime('now','+15 minutes') ELSE reset_at END";
  await env.DB.batch([
    env.DB.prepare(query).bind(key),
    env.DB.prepare(query).bind('global')
  ]);
}

export async function createSession(env,request) {
  await env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=CURRENT_TIMESTAMP').run();
  await env.DB.prepare('DELETE FROM admin_login_limits WHERE reset_at<=CURRENT_TIMESTAMP').run();
  await env.DB.prepare('DELETE FROM admin_login_limits WHERE id=?').bind(await failureKey(request,env)).run();
  const token=secureRandom(32),csrf=secureRandom(24);
  await env.DB.prepare(
    "INSERT INTO admin_sessions(token_hash,csrf_token,expires_at) VALUES(?,?,datetime('now','+8 hours'))"
  ).bind(await sha256(token),csrf).run();
  return {token,csrf};
}

function getSessionToken(request) {
  const cookies=String(request.headers.get('cookie')||'').split(';');
  for(const chunk of cookies) {
    const pos=chunk.indexOf('=');
    if(pos<0)continue;
    if(chunk.slice(0,pos).trim()!==SESSION_COOKIE)continue;
    const value=chunk.slice(pos+1).trim();
    return /^[a-f0-9]{64}$/.test(value)?value:null;
  }
  return null;
}

export async function readSession(env,request) {
  const token=getSessionToken(request);
  if(!token)return null;
  return env.DB.prepare(
    'SELECT token_hash,csrf_token FROM admin_sessions WHERE token_hash=? AND expires_at>CURRENT_TIMESTAMP'
  ).bind(await sha256(token)).first();
}

export async function revokeSession(env,session) {
  return env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(session.token_hash).run();
}

export function setSessionCookie(token) {
  return SESSION_COOKIE+'='+token+'; Path=/admin; Max-Age=28800; HttpOnly; Secure; SameSite=Strict';
}

export function clearSessionCookie() {
  return SESSION_COOKIE+'=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict';
}

export function validCsrf(session,form) {
  return !!session && constantTimeEqual(String(form.get('csrf')||''),session.csrf_token);
}

export function validOrigin(request) {
  const actual=request.headers.get('origin');
  const url=new URL(request.url);
  // Origin check works with browsers on all hosts. CSRF token is independently required.
  return !!actual && actual===url.origin;
}

export async function parseAdminForm(request) {
  const type=request.headers.get('content-type')||'';
  const declared=Number(request.headers.get('content-length')||0);
  if (!type.toLowerCase().startsWith('application/x-www-form-urlencoded')
      || declared>16384) throw new Error('Unsupported or oversized form');
  const raw=await request.text();
  if (raw.length>16384) throw new Error('Oversized form');
  return new URLSearchParams(raw);
}
