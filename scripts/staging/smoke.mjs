// Safe staging-only HTTP smoke probes. No Telegram/SePay credentials are sent.
// No invoices, paid events, inventory changes or refund operations are attempted.
import {pathToFileURL} from 'node:url';

export function validateStagingUrl(value) {
  if(!value)throw new Error('STAGING_BASE_URL is required');
  let url;
  try{url=new URL(value);}catch{throw new Error('STAGING_BASE_URL must be a valid HTTPS origin');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)
    throw new Error('STAGING_BASE_URL must be a plain HTTPS origin without path, query, hash or port');
  const host=url.hostname.toLowerCase();
  if(!host.includes('.')||!/(^|[.-])(staging|stage|preview|test)([.-]|$)/.test(host)
    ||/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(host)
    ||/\.((?:local)|(?:internal)|(?:localhost))$/.test(host))
    throw new Error('STAGING_BASE_URL must use an explicitly staging-named public host');
  return url.origin;
}

async function check(fetchImpl,base,path,{method='GET',headers={},body}={}){
  const response=await fetchImpl(base+path,{
    method,headers:{'cache-control':'no-store',...headers},body,
    redirect:'manual',signal:AbortSignal.timeout(10000)
  });
  if(response.status>=300&&response.status<400)
    throw new Error(path+': unexpected redirect (probe never follows redirects)');
  return response;
}
function assertStatus(resp,expected,label){
  if(resp.status!==expected)throw new Error(label+': expected HTTP '+expected+', got '+resp.status);
}

export async function smokeStaging({baseUrl,fetchImpl=fetch,adminPassword}={}){
  const base=validateStagingUrl(baseUrl);
  const checks=[];
  const health=await check(fetchImpl,base,'/healthz');
  assertStatus(health,200,'health');
  const healthBody=await health.json();
  if(healthBody?.ok!==true||healthBody?.service!=='telegram-sales-bot')
    throw new Error('/healthz: invalid application response');
  checks.push('HTTP health');

  const admin=await check(fetchImpl,base,'/admin?lang=en');
  assertStatus(admin,200,'admin login');
  const loginPage=await admin.text();
  if(!loginPage.includes('name="password"') || !admin.headers.get('content-security-policy')?.includes('frame-ancestors'))
    throw new Error('/admin: expected secure login page and content security policy');
  checks.push('Admin unauthenticated login view and security headers');

  for(const [path,label] of [
    ['/telegram/webhook','Telegram webhook without authentication'],
    ['/sepay/webhook','SePay webhook without authentication']
  ]){
    const res=await check(fetchImpl,base,path,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({probe:true})
    });
    assertStatus(res,401,label);
    checks.push(label+' rejected (401)');
  }
  const csrfProbe=await check(fetchImpl,base,'/admin/products/create',{
    method:'POST',
    headers:{origin:'https://attacker.invalid','content-type':'application/x-www-form-urlencoded'},
    body:'csrf=invalid'
  });
  assertStatus(csrfProbe,403,'Admin cross-origin mutation');
  checks.push('Admin cross-origin mutation rejected (403)');

  const guestWrite=await check(fetchImpl,base,'/admin/products/create',{
    method:'POST',
    headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},
    body:'csrf=invalid'
  });
  assertStatus(guestWrite,401,'Admin unauthenticated mutation');
  checks.push('Admin unauthenticated mutation rejected (401)');

  if(adminPassword){
    const login=await check(fetchImpl,base,'/admin/login',{
      method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({password:adminPassword}).toString()
    });
    if(login.status!==303||login.headers.get('location')?.split('?')[0]!=='/admin')
      throw new Error('Admin staging login failed');
    const cookie=login.headers.get('set-cookie')?.split(';')[0];
    if(!/^eplus_sales_admin=[a-f0-9]{64}$/.test(cookie||''))
      throw new Error('Admin staging login did not return a valid session cookie');
    const dashboard=await check(fetchImpl,base,'/admin',{
      headers:{cookie}
    });
    assertStatus(dashboard,200,'authenticated admin');
    const dashboardHtml=await dashboard.text();
    const csrf=dashboardHtml.match(/name="csrf" value="([a-f0-9]{48})"/)?.[1];
    if(!csrf)throw new Error('Authenticated admin dashboard missing CSRF');
    checks.push('Authenticated admin dashboard and database session');
    // Only session revocation; never touch product, payment or customer data.
    const logout=await check(fetchImpl,base,'/admin/logout',{
      method:'POST',headers:{origin:base,cookie,'content-type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({csrf}).toString()
    });
    if(logout.status!==303||logout.headers.get('location')!=='/admin')
      throw new Error('Admin staging logout failed');
    checks.push('Admin session revocation');
  }else checks.push('Authenticated admin: SKIPPED (no staging-only password provided)');
  return {checks};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=await smokeStaging({
      baseUrl:process.env.STAGING_BASE_URL,
      adminPassword:process.env.STAGING_ADMIN_DASHBOARD_PASSWORD||undefined
    });
    for(const name of result.checks)console.log('PASS: '+name);
    console.log('Staging smoke finished. NO real payments, Telegram messages or webhooks issued.');
  }catch(error){
    console.error('Staging smoke failed: '+error.message);
    process.exitCode=1;
  }
}
