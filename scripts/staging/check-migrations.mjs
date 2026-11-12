// Offline schema and migration integrity test; NEVER touches a deployed database.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const REQUIRED_TABLES=Object.freeze([
  'products','orders','digital_inventory','payment_events',
  'notification_outbox','purchase_intents','order_expirations',
  'bank_payment_reviews','star_refunds','admin_sessions',
  'admin_login_limits','admin_audit','user_locales'
]);

export function migrationFiles(directory=resolve('migrations')){
  const files=readdirSync(directory).filter(x=>x.endsWith('.sql')).sort();
  if(!files.length)throw new Error('No migration SQL files found');
  for(let i=0;i<files.length;i++) {
    const match=files[i].match(/^(\d{4})_[a-z0-9_]+\.sql$/);
    if(!match||Number(match[1])!==i+1)
      throw new Error('Migration names must have sequential 0001_*.sql numbering: '+files[i]);
  }
  return files;
}

export function validateMigrations(directory=resolve('migrations')){
  const db=new DatabaseSync(':memory:');
  try{
    db.exec('PRAGMA foreign_keys=ON;');
    const files=migrationFiles(directory);
    for(const file of files)db.exec(readFileSync(resolve(directory,file),'utf8'));
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
    const missing=REQUIRED_TABLES.filter(name=>!tables.has(name));
    if(missing.length)throw new Error('Required DB tables missing: '+missing.join(', '));
    const broken=db.prepare('PRAGMA foreign_key_check').all();
    if(broken.length)throw new Error('Database foreign key checks failed');
    // Migrations are written with IF NOT EXISTS and must not fail on a repeat;
    // the Turso migration helper currently executes all SQL files on each run.
    for(const file of files)db.exec(readFileSync(resolve(directory,file),'utf8'));
    return {files,tableCount:REQUIRED_TABLES.length};
  }finally{db.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const result=validateMigrations();
    console.log('Migration schema check OK: '+result.files.length+' sequential files, '
      +result.tableCount+' required tables, repeat application verified (local SQLite only).');
  }catch(error){console.error('Migration check failed: '+error.message);process.exitCode=1;}
}
