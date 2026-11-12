// Read-only inspection of a dedicated staging Turso database.
// Uses no schema changes, payment queries, inserts or updates.
import {createClient} from '@libsql/client/web';
import {pathToFileURL} from 'node:url';
import {REQUIRED_TABLES} from './check-migrations.mjs';

export async function checkTursoStaging({url,authToken,clientFactory=createClient}={}){
  if(!url||!authToken)throw new Error('Staging Turso URL and token are required');
  let parsed;
  try{
    parsed=new URL(url);
    if(!['libsql:','https:'].includes(parsed.protocol)||!parsed.hostname||
      parsed.username||parsed.password||parsed.search||parsed.hash)
      throw new Error('invalid');
  }catch{throw new Error('Staging Turso URL is not a valid remote TLS address');}
  const client=clientFactory({url,authToken});
  try{
    const result=await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    const names=new Set(result.rows.map(row=>row.name));
    const missing=REQUIRED_TABLES.filter(name=>!names.has(name));
    if(missing.length)throw new Error('Staging database missing tables: '+missing.join(', '));
    return {verifiedTables:REQUIRED_TABLES.length};
  } finally {client.close?.();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try {
    const result=await checkTursoStaging({
      url:process.env.STAGING_TURSO_DATABASE_URL,
      authToken:process.env.STAGING_TURSO_AUTH_TOKEN
    });
    console.log('Read-only Turso schema probe OK: '+result.verifiedTables+' expected tables.');
  }catch(error){
    // The libSQL client can include host or credentials in transport exceptions.
    const known=/^Staging database missing tables:|^Staging Turso URL |^Staging Turso URL is/.test(error.message);
    console.error(known?error.message:'Staging Turso read failed; verify staging-only credentials, network and schema.');
    process.exitCode=1;
  }
}
