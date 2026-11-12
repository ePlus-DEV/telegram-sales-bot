import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkConfiguration} from '../scripts/staging/preflight.mjs';
import {migrationFiles,validateMigrations,REQUIRED_TABLES} from '../scripts/staging/check-migrations.mjs';
import {validateStagingUrl,smokeStaging} from '../scripts/staging/smoke.mjs';
import {checkTursoStaging} from '../scripts/staging/check-turso.mjs';
import worker from '../src/index.js';

const fakeConfig={
  BOT_TOKEN:'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
  TELEGRAM_WEBHOOK_SECRET:'staging_test_secret_123',
  ADMIN_TELEGRAM_ID:'123456789',
  ADMIN_DASHBOARD_PASSWORD:'a-strong-staging-example-password'
};

test('config preflight validates provider, admin, bot and bank fields without leaking secret values',()=>{
  assert.equal(checkConfiguration(fakeConfig).ok,true);
  assert.equal(checkConfiguration({...fakeConfig,
    TURSO_DATABASE_URL:'libsql://staging-example.turso.io',
    TURSO_AUTH_TOKEN:'staging-example-token'
  },{provider:'turso'}).ok,true);
  const invalid=checkConfiguration({
    ...fakeConfig,BOT_TOKEN:'SECRET_DO_NOT_PRINT',ADMIN_DASHBOARD_PASSWORD:'short',
    BANK_BIN:'970422'
  });
  assert.equal(invalid.ok,false);
  assert.ok(invalid.errors.some(x=>x.startsWith('BOT_TOKEN:')));
  assert.ok(invalid.errors.some(x=>x.startsWith('BANK_ACCOUNT_NO:')));
  assert.ok(invalid.errors.some(x=>x.startsWith('SEPAY_WEBHOOK_API_KEY:')));
  assert.doesNotMatch(invalid.errors.join('\n'),/SECRET_DO_NOT_PRINT|example-password/);
});

test('all sequential migrations apply and re-apply to disposable SQLite with expected schema',()=>{
  const verified=validateMigrations();
  assert.equal(verified.files.length,6);
  assert.equal(verified.tableCount,REQUIRED_TABLES.length);
  const dir=mkdtempSync(join(tmpdir(),'eplus-migration-test-'));
  try {
    writeFileSync(join(dir,'0002_wrong.sql'),'SELECT 1;');
    assert.throws(()=>migrationFiles(dir),/sequential/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('only explicitly named HTTPS staging origins are accepted',()=>{
  assert.equal(validateStagingUrl('https://staging-sales.example.org'),'https://staging-sales.example.org');
  assert.equal(validateStagingUrl('https://preview.example.workers.dev/'),'https://preview.example.workers.dev');
  for(const host of [
    'http://staging.example.org','https://example.org','https://staging.example.org/admin',
    'https://user:pass@staging.example.org','https://127.0.0.1','https://staging.example.org:8443',
    'https://staging.example.org/?token=secret','https://staging.internal'
  ]) assert.throws(()=>validateStagingUrl(host));
});

test('offline smoke checks real Worker authentication routes without webhook side effects',async()=>{
  const env={
    TELEGRAM_WEBHOOK_SECRET:'SECRET',
    SEPAY_WEBHOOK_API_KEY:'SEPAY',
    ADMIN_DASHBOARD_PASSWORD:'staging-long-test-password',
    DB:{prepare(){throw new Error('unauthenticated probes must not touch database');}}
  };
  const calls=[];
  const localFetch=async (url,init)=>{
    calls.push({path:new URL(url).pathname,method:init.method||'GET'});
    return worker.fetch(new Request(url,init),env,{waitUntil(){}});
  };
  const result=await smokeStaging({baseUrl:'https://staging.example.org',fetchImpl:localFetch});
  assert.equal(result.checks.length,7);
  assert.deepEqual(calls.map(x=>x.path),[
    '/healthz','/admin','/telegram/webhook','/sepay/webhook',
    '/admin/products/create','/admin/products/create'
  ]);
  assert.ok(result.checks.at(-1).includes('SKIPPED'));
});

test('smoke refuses unexpected redirect before contacting a different host',async()=>{
  const badFetch=async()=>new Response(null,{status:302,headers:{location:'https://production.example.org'}});
  await assert.rejects(
    smokeStaging({baseUrl:'https://staging.example.org',fetchImpl:badFetch}),
    /unexpected redirect/
  );
});

test('Turso read-only inspector accepts complete schemas and rejects missing tables',async()=>{
  const calls=[];
  const makeClient=({url,authToken})=>({
    execute:async sql=>{
      calls.push(sql);
      return {rows:REQUIRED_TABLES.map(name=>({name}))};
    },
    close(){}
  });
  const result=await checkTursoStaging({
    url:'libsql://staging-example.turso.io',authToken:'STAGING_ONLY',
    clientFactory:makeClient
  });
  assert.equal(result.verifiedTables,REQUIRED_TABLES.length);
  assert.equal(calls.length,1);
  assert.match(calls[0],/sqlite_master/);
  await assert.rejects(
    checkTursoStaging({
      url:'https://staging-example.turso.io',authToken:'STAGING_ONLY',
      clientFactory:()=>({execute:async()=>({rows:[]}),close(){}})
    }),/missing tables/
  );
});

test('authenticated smoke login uses staging-only cookie/CSRF and logs out without business writes',async()=>{
  const paths=[];
  const cookie='eplus_sales_admin='+'a'.repeat(64);
  const csrf='b'.repeat(48);
  const fakeFetch=async(url,init)=>{
    const path=new URL(url).pathname;paths.push(path);
    if(path==='/healthz')return Response.json({ok:true,service:'telegram-sales-bot'});
    if(path==='/admin'&&!(init.headers?.cookie))
      return new Response('<input name="password">',{status:200,headers:{'content-security-policy':"frame-ancestors 'none'"}});
    if(path==='/telegram/webhook'||path==='/sepay/webhook')return Response.json({error:'unauthorized'},{status:401});
    if(path==='/admin/products/create')return new Response('',{status:init.headers.origin==='https://attacker.invalid'?403:401});
    if(path==='/admin/login')return new Response(null,{status:303,headers:{
      location:'/admin?lang=en','set-cookie':cookie+'; HttpOnly; Secure; SameSite=Strict'
    }});
    if(path==='/admin')return new Response('<input type="hidden" name="csrf" value="'+csrf+'">',{status:200});
    if(path==='/admin/logout')return new Response(null,{status:303,headers:{location:'/admin'}});
    throw new Error('Unexpected route '+path);
  };
  const result=await smokeStaging({baseUrl:'https://staging.example.org',fetchImpl:fakeFetch,
    adminPassword:'STAGING_EXAMPLE_PASSWORD_ONLY'});
  assert.equal(result.checks.length,8);
  assert.ok(result.checks.includes('Authenticated admin dashboard and database session'));
  assert.ok(result.checks.includes('Admin session revocation'));
  assert.equal(paths.at(-1),'/admin/logout');
});
