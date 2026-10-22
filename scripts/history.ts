import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import type pg from 'pg';
import { database } from '../src/lib/db.js';
export const tables=['targets','check_runs','rollups','incidents','maintenance_windows','deployment_events','alert_notifications'] as const;
const jsonFields=new Set(['public_payload','snapshot','affected_targets','metadata']);
const dates=new Set(['first_seen_at','last_seen_at','checked_at','inserted_at','started_at','resolved_at','created_at','updated_at','starts_at','ends_at','deployed_at','observed_at','sent_at']);
export function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';return JSON.stringify(value);}
export function normalize(row:Record<string,unknown>):Record<string,unknown>{return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v===null?null:dates.has(k)?String(v).replace(' ','T').replace(/(?:Z|\+00(?::00)?)$/,'').replace(/(\.\d{6})\d+$/,'$1').replace(/(?<=:\d{2})$/ ,'.000000').replace(/\.(\d{1,5})$/,(_,d:string)=>'.'+d.padEnd(6,'0'))+'Z':['id','latency_ms'].includes(k)?String(v):v]));}
export async function fingerprint(db:pg.PoolClient,table:typeof tables[number]) {
 const hash=createHash('sha256');let count=0;
 await db.query(`DECLARE history_cursor NO SCROLL CURSOR FOR SELECT * FROM app.${table} ORDER BY id`);
 try{for(;;){const {rows}=await db.query<Record<string,unknown>>('FETCH 500 FROM history_cursor');if(!rows.length)break;for(const row of rows){hash.update(canonical(normalize(row))+'\n');count++;}}}
 finally{await db.query('CLOSE history_cursor');}
 return {count,sha256:hash.digest('hex')};
}
export async function importHistory(db:pg.PoolClient,directory:string,replace:boolean) {
 const counts:Record<string,{count:number;sha256:string}>={};
 await db.query('BEGIN');try{
  await db.query('SET LOCAL ROLE status_dunamismax_owner');
  if(replace)await db.query('TRUNCATE '+tables.map(t=>'app.'+t).join(',')+' RESTART IDENTITY');
  else {for(const t of tables){const n=await db.query<{count:string}>(`SELECT count(*) FROM app.${t}`);if(n.rows[0]?.count!=='0')throw new Error('Destination must be empty unless replacement explicitly requested');}}
  for(const table of tables){
   const lines=createInterface({input:createReadStream(directory+'/'+table+'.jsonl'),crlfDelay:Infinity});
   let batch:Record<string,unknown>[]=[],count=0;const hash=createHash('sha256');
   const flush=async()=>{if(!batch.length)return;const columns=Object.keys(batch[0]!);if(columns.some(k=>!/^\w+$/.test(k)))throw new Error('Invalid column');const values:unknown[]=[];
    const placeholders=batch.map(row=>'('+columns.map(k=>{const value=row[k];values.push(jsonFields.has(k)?JSON.stringify(value):dates.has(k)&&typeof value==='string'?value.replace(' ','T')+'Z':value);return '$'+values.length;}).join(',')+')');
    await db.query(`INSERT INTO app.${table}(${columns.join(',')}) VALUES ${placeholders.join(',')}`,values);batch=[];};
   for await(const line of lines){const row=JSON.parse(line) as Record<string,unknown>;hash.update(canonical(normalize(row))+'\n');count++;batch.push(row);if(batch.length===500)await flush();}
   await flush();counts[table]={count,sha256:hash.digest('hex')};
   const actual=await fingerprint(db,table);if(canonical(actual)!==canonical(counts[table]))throw new Error('Historical row reconciliation failed for '+table);
   if(table!=='targets')await db.query(`SELECT setval(pg_get_serial_sequence('app.${table}','id'),COALESCE((SELECT max(id) FROM app.${table}),1),(SELECT count(*)>0 FROM app.${table}))`);
  }
  await db.query('COMMIT');return counts;
 }catch(e){await db.query('ROLLBACK');throw e;}
}
async function main(){const [mode,directory]=process.argv.slice(2);if(!directory||!['import','verify'].includes(mode??''))throw new Error('Usage: history import|verify DIRECTORY [--replace]');if(process.env.STATUS_ENV_FILE)process.loadEnvFile(process.env.STATUS_ENV_FILE);const pool=database(),db=await pool.connect();try{if(mode==='import'){const result=await importHistory(db,directory,process.argv.includes('--replace'));console.log(JSON.stringify(result));}else{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ');await db.query('SET LOCAL ROLE status_dunamismax_owner');for(const t of tables){const hash=createHash('sha256');let count=0;for await(const line of createInterface({input:createReadStream(directory+'/'+t+'.jsonl'),crlfDelay:Infinity})){hash.update(canonical(normalize(JSON.parse(line) as Record<string,unknown>))+'\n');count++;}const expected={count,sha256:hash.digest('hex')},actual=await fingerprint(db,t);if(canonical(actual)!==canonical(expected))throw new Error('Reconciliation mismatch: '+t);console.log(t,JSON.stringify(actual));}await db.query('ROLLBACK');}}finally{db.release();await pool.end();}}
if(import.meta.url===`file://${process.argv[1]}`)main().catch(()=>{console.error('History operation failed; source files and destination transaction retained safely.');process.exitCode=1;});
