import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tables, importHistory, digest } from '../scripts/history.js';
import { database } from '../src/lib/db.js';
import { config } from '../src/lib/config.js';
import { snapshot } from '../src/lib/model.js';
import { recordSnapshot,recordDeployment,sendAlerts,prune } from '../src/collector/writer.js';
import { PostgresSource } from '../src/lib/source.js';
import { service as fixtureService } from './fixtures.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc } from 'drizzle-orm';
import { migrate } from '../src/db/migrate.js';
import { catalog, accessViolations } from '../src/db/catalog.js';
import { checkRuns } from '../src/db/schema.js';
const service=(...args:Parameters<typeof fixtureService>)=>{const item=fixtureService(...args);item.check.checked_at=new Date().toISOString();return item;};
test('isolated PostgreSQL: schema, privileges, transactions, history, alert suppression and retention',{skip:!process.env.STATUS_TEST_PG},async()=>{
 assert.match(process.env.PGHOST??'',/status-pg-test\./);
 const admin=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT),database:'postgres',user:process.env.USER});
 await admin.query("CREATE ROLE status_dunamismax_owner NOLOGIN; CREATE ROLE status_dunamismax_migration LOGIN NOINHERIT; GRANT status_dunamismax_owner TO status_dunamismax_migration; CREATE ROLE status_dunamismax_web LOGIN; CREATE ROLE status_dunamismax_collector LOGIN; CREATE SCHEMA app AUTHORIZATION status_dunamismax_owner; GRANT USAGE ON SCHEMA app TO status_dunamismax_web,status_dunamismax_collector; ALTER DEFAULT PRIVILEGES FOR ROLE status_dunamismax_owner IN SCHEMA app GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO status_dunamismax_collector; ALTER DEFAULT PRIVILEGES FOR ROLE status_dunamismax_owner IN SCHEMA app GRANT USAGE ON SEQUENCES TO status_dunamismax_collector; ALTER ROLE status_dunamismax_web SET default_transaction_read_only=on;");
 const migration=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT),database:'postgres',user:'status_dunamismax_migration'});
 await migration.query(await readFile('database/schema.sql','utf8'));
 const writer=database({...process.env,PGDATABASE:'postgres',PGUSER:'status_dunamismax_collector'}),web=database({...process.env,PGDATABASE:'postgres',PGUSER:'status_dunamismax_web'}),db=await writer.connect();
 try{
  let s=snapshot([service('down')]);await recordSnapshot(db,s);const read=new PostgresSource(web);assert.deepEqual(await read.latest(),s);
  const w=await web.connect();try{await w.query('SET default_transaction_read_only=off');for(const sql of ['SELECT * FROM app.check_runs','SELECT * FROM app.alert_notifications','SELECT * FROM app.targets','CREATE TABLE app.nope(id int)','INSERT INTO app.rollups(overall_state) VALUES(\'down\')','DELETE FROM app.deployment_events','TRUNCATE app.rollups','SET ROLE status_dunamismax_owner'])await assert.rejects(w.query(sql));}finally{w.release();}
  const c=config({STATUS_ALERT_WEBHOOK_URL:'http://127.0.0.1/never-called',STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN:'1',STATUS_ALERT_CONFIRMATIONS:'1'});let sent=0;const sink=async()=>{sent++;};assert.equal(await sendAlerts(db,s,c,sink),1);assert.equal(await sendAlerts(db,s,c,sink),0);assert.equal(sent,1);
  assert.equal(await sendAlerts(db,s,{...c,maxAlerts:0},sink),0);
  const recovered=snapshot([service('operational')]);await recordSnapshot(db,recovered);assert.equal(await sendAlerts(db,recovered,c,sink),1);assert.equal(await sendAlerts(db,recovered,c,sink),0);s=snapshot([service('down')]);await recordSnapshot(db,s);assert.equal(await sendAlerts(db,s,c,sink),1);
  const failed=snapshot([service('down','failure')]);await recordSnapshot(db,failed);await assert.rejects(sendAlerts(db,failed,c,async()=>{throw new Error('delivery failed');}));assert.equal((await db.query("SELECT count(*) FROM app.alert_notifications WHERE target_id='failure'")).rows[0].count,'0');
  await recordDeployment(db,{service_id:'test',repo_name:'test',commit_sha:'abcdef0',environment:'test',deployed_at:'2026-01-01T00:00:00.123456Z',public_summary:'Unicode é'});assert.equal((await read.deployments())[0]?.deployed_at,'2026-01-01T00:00:00.123456Z');
  const invalid=snapshot([service('operational','atomic')]);invalid.services[0]!.check.state='bad' as never;await assert.rejects(recordSnapshot(db,invalid));assert.equal((await db.query("SELECT count(*) FROM app.targets WHERE id='atomic'")).rows[0].count,'0');
  const confirming=config({STATUS_ALERT_WEBHOOK_URL:'http://127.0.0.1/never-called'});
  let pending=snapshot([service('down','hysteresis')]);await recordSnapshot(db,pending);assert.equal(await sendAlerts(db,pending,confirming,sink),0);
  pending=snapshot([service('down','hysteresis')]);await recordSnapshot(db,pending);assert.equal(await sendAlerts(db,pending,confirming,sink),1);
  pending=snapshot([service('operational','hysteresis')]);await recordSnapshot(db,pending);assert.equal(await sendAlerts(db,pending,confirming,sink),0);
  pending=snapshot([service('operational','hysteresis')]);await recordSnapshot(db,pending);assert.equal(await sendAlerts(db,pending,confirming,sink),1);
  const rollupsBefore=(await db.query('SELECT count(*) FROM app.rollups')).rows[0].count;
  await db.query("UPDATE app.check_runs SET checked_at=now()-interval '60 days'");assert.ok((await prune(db,30))!>0);assert.equal((await db.query('SELECT count(*) FROM app.rollups')).rows[0].count,rollupsBefore);
  await admin.query(`INSERT INTO app.incidents(title,state,started_at,public_notes) VALUES('Incident é','investigating','2026-01-01T00:00:00.123456Z','line 1'||chr(10)||'line 2'); INSERT INTO app.maintenance_windows(title,state,starts_at,ends_at,affected_targets) VALUES('Window','scheduled',now(),now()+interval '1 day','["test"]');`);
  const directory=await mkdtemp('/tmp/status-history-test.');
  try { for(const table of tables){const {rows}=await admin.query('SELECT * FROM app.'+table+' ORDER BY id');await writeFile(directory+'/'+table+'.jsonl',rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString().replace('T',' ').replace('Z',''):typeof v==='string'&&k.endsWith('_at')?v.replace('T',' ').replace('Z',''):v])))).join('\n')+(rows.length?'\n':''));}
    const owner=await admin.connect();try{await assert.rejects(importHistory(owner,directory,false));const counts=await importHistory(owner,directory,true);assert.equal(counts.incidents?.count,1);assert.equal(counts.maintenance_windows?.count,1);assert.equal((await read.incidents())[0]?.public_notes,'line 1\nline 2');}finally{owner.release();}
  } finally{await rm(directory,{recursive:true,force:true});}
  await migration.query(await readFile('database/schema.sql','utf8')); // idempotent migration
 }finally{db.release();await writer.end();await web.end();await migration.end();await admin.end();}
});

test('isolated PostgreSQL: Drizzle fresh install, lossless legacy adoption, repeat no-op and actual grants',{skip:!process.env.STATUS_TEST_PG},async()=>{
 assert.match(process.env.PGHOST??'',/status-pg-test\./);
 const connect=(database:string,user:string)=>({host:process.env.PGHOST,port:Number(process.env.PGPORT),database,user});
 const admin=new pg.Pool(connect('postgres',process.env.USER??''));
 await admin.query(`DO $$ BEGIN
  IF to_regrole('status_dunamismax_owner') IS NULL THEN CREATE ROLE status_dunamismax_owner NOLOGIN; END IF;
  IF to_regrole('status_dunamismax_migration') IS NULL THEN CREATE ROLE status_dunamismax_migration LOGIN NOINHERIT; GRANT status_dunamismax_owner TO status_dunamismax_migration; END IF;
  IF to_regrole('status_dunamismax_web') IS NULL THEN CREATE ROLE status_dunamismax_web LOGIN; ALTER ROLE status_dunamismax_web SET default_transaction_read_only=on; END IF;
  IF to_regrole('status_dunamismax_collector') IS NULL THEN CREATE ROLE status_dunamismax_collector LOGIN; END IF; END $$`);
 const pools:pg.Pool[]=[admin],clients:pg.Client[]=[];
 // Mirrors host provisioning: owner schema, usage grants and collector defaults.
 const provision=async(name:string)=>{await admin.query(`CREATE DATABASE ${name}`);const p=new pg.Pool(connect(name,process.env.USER??''));pools.push(p);
  await p.query("CREATE SCHEMA app AUTHORIZATION status_dunamismax_owner; GRANT USAGE ON SCHEMA app TO status_dunamismax_web,status_dunamismax_collector; ALTER DEFAULT PRIVILEGES FOR ROLE status_dunamismax_owner IN SCHEMA app GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO status_dunamismax_collector; ALTER DEFAULT PRIVILEGES FOR ROLE status_dunamismax_owner IN SCHEMA app GRANT USAGE ON SEQUENCES TO status_dunamismax_collector;");
  const m=new pg.Client(connect(name,'status_dunamismax_migration'));await m.connect();clients.push(m);return {superuser:p,migration:m};};
 const denied=async(database:string,user:string,sql:string)=>{const c=new pg.Client(connect(database,user));await c.connect();try{await c.query('SET default_transaction_read_only=off');await assert.rejects(c.query(sql),(e:{code?:string})=>e.code==='42501');}finally{await c.end();}};
 const fingerprints=async(p:pg.Pool)=>{const c=await p.connect();try{return await digest(c);}finally{c.release();}};
 try{
  const fresh=await provision('status_fresh');
  assert.deepEqual(await migrate(fresh.migration),{applied:['0000_baseline'],adopted:null});
  assert.deepEqual(await migrate(fresh.migration),{applied:[],adopted:null}); // repeat is a no-op
  await assert.rejects(migrate(fresh.migration,{adopt:true}),/already recorded/);
  const freshCatalog=await catalog(fresh.migration);
  if(process.env.STATUS_UPDATE_CATALOG)await writeFile('drizzle/baseline-catalog.json',JSON.stringify(freshCatalog,null,1)+'\n');
  assert.deepEqual(freshCatalog,JSON.parse(await readFile('drizzle/baseline-catalog.json','utf8')));
  assert.deepEqual(await accessViolations(fresh.migration),[]);

  const legacy=await provision('status_legacy');
  await legacy.migration.query(await readFile('database/schema.sql','utf8'));
  await assert.rejects(migrate(legacy.migration),/--adopt-baseline/);
  assert.equal((await legacy.superuser.query("SELECT to_regclass('app.drizzle_migrations') AS t")).rows[0].t,null);
  // Synthetic nonempty history: IDs beyond 2^53, Unicode, microseconds, JSON types/order.
  await legacy.superuser.query(`
   INSERT INTO app.targets VALUES ('t-é','Target é ✓','host',NULL,'https://example.test/é',NULL,NULL,'2026-01-01T00:00:00.123456Z','2026-01-02T00:00:00.000001Z');
   INSERT INTO app.check_runs(id,target_id,check_kind,state,checked_at,latency_ms,reason,probe_version,public_payload) VALUES (9007199254740993,'t-é','http','down','2026-01-01T00:00:00.999999Z',NULL,'naïve ✓','v1','{"b":1,"a":[3,1,{"z":null,"y":1.50}],"s":"é"}');
   SELECT setval('app.check_runs_id_seq',9007199254740993);
   INSERT INTO app.rollups(id,overall_state,checked_at,operational_count,degraded_count,down_count,maintenance_count,unknown_count,snapshot) VALUES (9007199254740995,'down','2026-01-01T00:00:00.999999Z',0,0,1,0,0,'{"z":[],"a":{"x":true}}');
   SELECT setval('app.rollups_id_seq',9007199254740995);
   INSERT INTO app.incidents(title,affected_targets,state,started_at,resolved_at,public_notes) VALUES ('Incident é','["t-é"]','resolved','2026-01-01T00:00:00.123456Z','2026-01-01T01:00:00.654321Z','line 1'||chr(10)||'line 2');
   INSERT INTO app.maintenance_windows(title,state,starts_at,ends_at) VALUES ('Current','scheduled',now(),now()+interval '1 day'),('Old','complete',now()-interval '50 days',now()-interval '40 days');
   INSERT INTO app.deployment_events(service_id,repo_name,commit_sha,deployed_at,public_summary,metadata) VALUES ('svc','repo','abcdef0','2026-01-01T00:00:00.000001Z','Unicode é','{"k":[1,"2",null]}');
   INSERT INTO app.alert_notifications(dedup_key,target_id,severity,observed_state,title,public_summary,observed_at,notification_target,public_payload) VALUES ('service:t-é:down','t-é','critical','down','Target é down','summary','2026-01-01T00:00:00.999999Z','webhook','{"n":1}');
   UPDATE app.incidents SET public_notes=public_notes;`);
  // A backup restore re-parses CHECK text; it must still adopt cleanly.
  const dump=execFileSync('/usr/lib/postgresql/18/bin/pg_dump',['-d','status_legacy'],{env:{...process.env,PGUSER:process.env.USER??''},maxBuffer:64<<20});
  await admin.query('CREATE DATABASE status_restored TEMPLATE template0');
  execFileSync('/usr/lib/postgresql/18/bin/psql',['-X','-q','-v','ON_ERROR_STOP=1','-d','status_restored'],{input:dump,env:{...process.env,PGUSER:process.env.USER??''}});
  const restoredSuperuser=new pg.Pool(connect('status_restored',process.env.USER??''));pools.push(restoredSuperuser);
  const restoredMigration=new pg.Client(connect('status_restored','status_dunamismax_migration'));await restoredMigration.connect();clients.push(restoredMigration);
  const restoredBefore=await fingerprints(restoredSuperuser);
  assert.deepEqual(await migrate(restoredMigration,{adopt:true}),{applied:[],adopted:'0000_baseline'});
  assert.deepEqual(await fingerprints(restoredSuperuser),restoredBefore);
  assert.deepEqual(await catalog(restoredMigration),freshCatalog);
  const before=await fingerprints(legacy.superuser);
  assert.deepEqual(before,restoredBefore);
  assert.deepEqual(await migrate(legacy.migration,{adopt:true}),{applied:[],adopted:'0000_baseline'});
  assert.deepEqual(await fingerprints(legacy.superuser),before); // no table recreated, truncated or reimported
  assert.deepEqual(await migrate(legacy.migration),{applied:[],adopted:null});
  assert.deepEqual(await catalog(legacy.migration),freshCatalog);
  assert.deepEqual(await accessViolations(legacy.migration),[]);
  assert.equal((await legacy.superuser.query('SELECT count(*) FROM app.schema_migrations')).rows[0].count,'1');

  // Runtime paths on the adopted database: lossless IDs/times through Drizzle.
  const writer=database({...process.env,PGDATABASE:'status_legacy',PGUSER:'status_dunamismax_collector'}),web=database({...process.env,PGDATABASE:'status_legacy',PGUSER:'status_dunamismax_web'});pools.push(writer,web);
  const w=await writer.connect();try{const s=snapshot([service('operational','t-é')]);await recordSnapshot(w,s);const read=new PostgresSource(web);assert.deepEqual(await read.latest(),s);
   assert.deepEqual((await drizzle({client:w}).select({id:checkRuns.id}).from(checkRuns).orderBy(desc(checkRuns.id)).limit(1))[0],{id:9007199254740994n});
   assert.deepEqual((await read.incidents())[0],{title:'Incident é',affected_targets:['t-é'],state:'resolved',started_at:'2026-01-01T00:00:00.123456Z',resolved_at:'2026-01-01T01:00:00.654321Z',public_notes:'line 1\nline 2'});
   assert.deepEqual((await read.maintenance()).map(m=>m.title),['Current']);
   assert.equal((await read.deployments())[0]?.deployed_at,'2026-01-01T00:00:00.000001Z');
  }finally{w.release();}

  // Actual denials, not ORM conventions; future owner tables stay private to web.
  await legacy.migration.query('BEGIN; SET LOCAL ROLE status_dunamismax_owner; CREATE TABLE app.future_probe(id int); COMMIT;');
  for(const sql of ['SELECT 1 FROM app.future_probe','SELECT 1 FROM app.drizzle_migrations','SELECT 1 FROM app.schema_migrations','SELECT 1 FROM app.check_runs','INSERT INTO app.rollups(overall_state) VALUES (\'down\')',"SELECT nextval('app.drizzle_migrations_id_seq')",'SET ROLE status_dunamismax_owner'])await denied('status_legacy','status_dunamismax_web',sql);
  for(const sql of ['SELECT 1 FROM app.drizzle_migrations','DELETE FROM app.drizzle_migrations','SELECT 1 FROM app.schema_migrations','ALTER TABLE app.rollups ADD COLUMN nope int','SET ROLE status_dunamismax_owner'])await denied('status_legacy','status_dunamismax_collector',sql);
  await legacy.superuser.query('GRANT SELECT ON app.future_probe TO status_dunamismax_web');
  assert.deepEqual(await accessViolations(legacy.migration),['web may read future_probe']);
  await legacy.superuser.query('DROP TABLE app.future_probe');

  // A divergent existing schema is refused atomically.
  const drift=await provision('status_drift');
  await drift.migration.query(await readFile('database/schema.sql','utf8'));
  await drift.superuser.query('DROP INDEX app.check_runs_retention_idx');
  await assert.rejects(migrate(drift.migration,{adopt:true}),/missing indexes .*check_runs_retention_idx/);
  assert.equal((await drift.superuser.query("SELECT to_regclass('app.drizzle_migrations') AS t")).rows[0].t,null);
 }finally{for(const c of clients)await c.end();for(const p of pools.reverse())await p.end();}
});
