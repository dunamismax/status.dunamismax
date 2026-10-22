import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tables, importHistory } from '../scripts/history.js';
import { database } from '../src/lib/db.js';
import { config } from '../src/lib/config.js';
import { snapshot } from '../src/lib/model.js';
import { recordSnapshot,recordDeployment,sendAlerts,prune } from '../src/collector/writer.js';
import { PostgresSource } from '../src/lib/source.js';
import { service } from './fixtures.js';
test('isolated PostgreSQL: schema, privileges, transactions, history, alert suppression and retention',{skip:!process.env.STATUS_TEST_PG},async()=>{
 assert.match(process.env.PGHOST??'',/status-pg-test\./);
 const admin=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT),database:'postgres',user:process.env.USER});
 await admin.query("CREATE ROLE status_dunamismax_owner NOLOGIN; CREATE ROLE status_dunamismax_migration LOGIN NOINHERIT; GRANT status_dunamismax_owner TO status_dunamismax_migration; CREATE ROLE status_dunamismax_web LOGIN; CREATE ROLE status_dunamismax_collector LOGIN; CREATE SCHEMA app AUTHORIZATION status_dunamismax_owner; GRANT USAGE ON SCHEMA app TO status_dunamismax_web,status_dunamismax_collector; ALTER DEFAULT PRIVILEGES FOR ROLE status_dunamismax_owner IN SCHEMA app GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO status_dunamismax_collector; ALTER DEFAULT PRIVILEGES FOR ROLE status_dunamismax_owner IN SCHEMA app GRANT USAGE ON SEQUENCES TO status_dunamismax_collector; ALTER ROLE status_dunamismax_web SET default_transaction_read_only=on;");
 const migration=new pg.Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT),database:'postgres',user:'status_dunamismax_migration'});
 await migration.query(await readFile('database/schema.sql','utf8'));
 const writer=database({...process.env,PGDATABASE:'postgres',PGUSER:'status_dunamismax_collector'}),web=database({...process.env,PGDATABASE:'postgres',PGUSER:'status_dunamismax_web'}),db=await writer.connect();
 try{
  const s=snapshot([service('down')]);await recordSnapshot(db,s);const read=new PostgresSource(web);assert.deepEqual(await read.latest(),s);
  const w=await web.connect();try{await w.query('SET default_transaction_read_only=off');for(const sql of ['SELECT * FROM app.check_runs','SELECT * FROM app.alert_notifications','SELECT * FROM app.targets','CREATE TABLE app.nope(id int)','INSERT INTO app.rollups(overall_state) VALUES(\'down\')','DELETE FROM app.deployment_events','TRUNCATE app.rollups','SET ROLE status_dunamismax_owner'])await assert.rejects(w.query(sql));}finally{w.release();}
  const c=config({STATUS_ALERT_WEBHOOK_URL:'http://127.0.0.1/never-called',STATUS_ALERT_MAX_NOTIFICATIONS_PER_RUN:'1'});let sent=0;const sink=async()=>{sent++;};assert.equal(await sendAlerts(db,s,c,sink),1);assert.equal(await sendAlerts(db,s,c,sink),0);assert.equal(sent,1);
  assert.equal(await sendAlerts(db,s,{...c,maxAlerts:0},sink),0);
  const failed=snapshot([service('down','failure')]);await assert.rejects(sendAlerts(db,failed,c,async()=>{throw new Error('delivery failed');}));assert.equal((await db.query("SELECT count(*) FROM app.alert_notifications WHERE target_id='failure'")).rows[0].count,'0');
  await recordDeployment(db,{service_id:'test',repo_name:'test',commit_sha:'abcdef0',environment:'test',deployed_at:'2026-01-01T00:00:00.123456Z',public_summary:'Unicode é'});assert.equal((await read.deployments())[0]?.deployed_at,'2026-01-01T00:00:00.123456Z');
  const invalid=snapshot([service('operational','atomic')]);invalid.services[0]!.check.state='bad' as never;await assert.rejects(recordSnapshot(db,invalid));assert.equal((await db.query("SELECT count(*) FROM app.targets WHERE id='atomic'")).rows[0].count,'0');
  await db.query("UPDATE app.check_runs SET checked_at=now()-interval '60 days'");assert.ok((await prune(db,30))!>0);assert.equal((await db.query('SELECT count(*) FROM app.rollups')).rows[0].count,'1');
  await admin.query(`INSERT INTO app.incidents(title,state,started_at,public_notes) VALUES('Incident é','investigating','2026-01-01T00:00:00.123456Z','line 1'||chr(10)||'line 2'); INSERT INTO app.maintenance_windows(title,state,starts_at,ends_at,affected_targets) VALUES('Window','scheduled',now(),now()+interval '1 day','["test"]');`);
  const directory=await mkdtemp('/tmp/status-history-test.');
  try { for(const table of tables){const {rows}=await admin.query('SELECT * FROM app.'+table+' ORDER BY id');await writeFile(directory+'/'+table+'.jsonl',rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).map(([k,v])=>[k,v instanceof Date?v.toISOString().replace('T',' ').replace('Z',''):typeof v==='string'&&k.endsWith('_at')?v.replace('T',' ').replace('Z',''):v])))).join('\n')+(rows.length?'\n':''));}
    const owner=await admin.connect();try{await assert.rejects(importHistory(owner,directory,false));const counts=await importHistory(owner,directory,true);assert.equal(counts.incidents?.count,1);assert.equal(counts.maintenance_windows?.count,1);assert.equal((await read.incidents())[0]?.public_notes,'line 1\nline 2');}finally{owner.release();}
  } finally{await rm(directory,{recursive:true,force:true});}
  await migration.query(await readFile('database/schema.sql','utf8')); // idempotent migration
 }finally{db.release();await writer.end();await web.end();await migration.end();await admin.end();}
});
