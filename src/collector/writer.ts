import type pg from 'pg';
import type { Snapshot, Deployment } from '../lib/model.js';
import type { Config } from '../lib/config.js';
import { alerts, notify } from './alerts.js';
export async function recordSnapshot(db:pg.PoolClient,s:Snapshot){
 await db.query('BEGIN');try{
  for(const item of [...s.services.map(v=>({id:v.target.id,name:v.target.name,kind:v.check.check_kind==='http'?'public-http':'host',group:v.target.group,url:v.target.public_url,probe:v.target.probe_url,repo:null,at:v.check.checked_at,check:v.check.check_kind,state:v.check.state,latency:v.check.latency_ms,reason:v.check.reason,version:v.check.probe_version,payload:v})),...s.projects.map(v=>({id:v.target.id,name:v.target.name,kind:'project',group:null,url:v.target.public_url,probe:null,repo:v.target.repo_name,at:v.checked_at,check:'git',state:v.state,latency:null,reason:v.reason,version:v.probe_version,payload:{git:v.git,build:v.build}}))]){
   await db.query('INSERT INTO app.targets(id,name,target_kind,group_name,public_url,probe_url,repo_name,first_seen_at,last_seen_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) ON CONFLICT(id) DO UPDATE SET name=excluded.name,target_kind=excluded.target_kind,group_name=excluded.group_name,public_url=excluded.public_url,probe_url=excluded.probe_url,repo_name=excluded.repo_name,last_seen_at=excluded.last_seen_at',[item.id,item.name,item.kind,item.group,item.url,item.probe,item.repo,item.at]);
   await db.query('INSERT INTO app.check_runs(target_id,check_kind,state,checked_at,latency_ms,reason,probe_version,public_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[item.id,item.check,item.state,item.at,item.latency,item.reason,item.version,JSON.stringify(item.payload)]);
  }
  await db.query('INSERT INTO app.rollups(overall_state,checked_at,operational_count,degraded_count,down_count,maintenance_count,unknown_count,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[s.overall_state,s.checked_at,s.summary.operational,s.summary.degraded,s.summary.down,s.summary.maintenance,s.summary.unknown,JSON.stringify(s)]);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e;}
}
/** Caller holds the collector's advisory session lock across selection, delivery and recording. */
export async function sendAlerts(db:pg.PoolClient,s:Snapshot,c:Config,send=notify):Promise<number>{
 if(!c.webhook)return 0;let sent=0;
 for(const a of alerts(s)){
  if(sent>=c.maxAlerts)break;
  const {rows}=await db.query<{recent:boolean}>("SELECT EXISTS(SELECT 1 FROM app.alert_notifications WHERE dedup_key=$1 AND sent_at >= now()-$2*interval '1 minute') AS recent",[a.dedup_key,c.repeat]);
  if(rows[0]?.recent)continue;
  await send(c.webhook,a);
  await db.query('INSERT INTO app.alert_notifications(dedup_key,target_id,severity,observed_state,title,public_summary,observed_at,notification_target,public_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[a.dedup_key,a.target_id,a.severity,a.state,a.title,a.public_summary,a.observed_at,'webhook',JSON.stringify(a)]);sent++;
 }
 return sent;
}
export async function prune(db:pg.PoolClient,days:number){return (await db.query("DELETE FROM app.check_runs WHERE checked_at < now()-$1*interval '1 day'",[days])).rowCount;}
export async function recordDeployment(db:pg.PoolClient,d:Deployment){await db.query('INSERT INTO app.deployment_events(service_id,repo_name,commit_sha,environment,deployed_at,public_summary) VALUES($1,$2,$3,$4,$5,$6)',[d.service_id,d.repo_name,d.commit_sha,d.environment,d.deployed_at,d.public_summary]);}
