import type pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { Snapshot, Deployment } from '../lib/model.js';
import type { Config } from '../lib/config.js';
import { targets, checkRuns, rollups, alertNotifications, deploymentEvents } from '../db/schema.js';
import { alerts, notify } from './alerts.js';
// Bound to the caller's single client: transactions and the advisory session
// lock can never move to a different pool connection.
const orm=(db:pg.PoolClient)=>drizzle({client:db});
export async function recordSnapshot(db:pg.PoolClient,s:Snapshot){
 await orm(db).transaction(async tx=>{
  for(const item of [...s.services.map(v=>({id:v.target.id,name:v.target.name,kind:v.check.check_kind==='http'?'public-http':'host',group:v.target.group,url:v.target.public_url,probe:v.target.probe_url,repo:null,at:v.check.checked_at,check:v.check.check_kind,state:v.check.state,latency:v.check.latency_ms,reason:v.check.reason,version:v.check.probe_version,payload:v as unknown})),...s.projects.map(v=>({id:v.target.id,name:v.target.name,kind:'project',group:null,url:v.target.public_url,probe:null,repo:v.target.repo_name,at:v.checked_at,check:'git',state:v.state,latency:null,reason:v.reason,version:v.probe_version,payload:{git:v.git,build:v.build} as unknown}))]){
   await tx.insert(targets).values({id:item.id,name:item.name,target_kind:item.kind,group_name:item.group,public_url:item.url,probe_url:item.probe,repo_name:item.repo,first_seen_at:item.at,last_seen_at:item.at})
    .onConflictDoUpdate({target:targets.id,set:{name:sql`excluded.name`,target_kind:sql`excluded.target_kind`,group_name:sql`excluded.group_name`,public_url:sql`excluded.public_url`,probe_url:sql`excluded.probe_url`,repo_name:sql`excluded.repo_name`,last_seen_at:sql`excluded.last_seen_at`}});
   await tx.insert(checkRuns).values({target_id:item.id,check_kind:item.check,state:item.state,checked_at:item.at,latency_ms:item.latency,reason:item.reason,probe_version:item.version,public_payload:item.payload});
  }
  await tx.insert(rollups).values({overall_state:s.overall_state,checked_at:s.checked_at,operational_count:s.summary.operational,degraded_count:s.summary.degraded,down_count:s.summary.down,maintenance_count:s.summary.maintenance,unknown_count:s.summary.unknown,snapshot:s});
 });
}
/** Caller holds the collector's advisory session lock across selection, delivery and recording. */
export async function sendAlerts(db:pg.PoolClient,s:Snapshot,c:Config,send=notify):Promise<number>{
 if(!c.webhook)return 0;let sent=0;const q=orm(db),a_=alertNotifications;
 const candidates=alerts(s);
 // Recovery is sent only for a target with an actually delivered failure.
 for(const v of [...s.services.map(v=>({id:v.target.id,name:v.target.name,state:v.check.state,at:v.check.checked_at})),...s.projects.map(v=>({id:v.target.id,name:v.target.name,state:v.state,at:v.checked_at}))]){
  if(v.state!=='operational')continue;
  const rows=await q.select({observed_state:a_.observed_state}).from(a_).where(eq(a_.target_id,v.id)).orderBy(desc(a_.id)).limit(1);
  if(rows[0]&&rows[0].observed_state!=='operational')candidates.push({dedup_key:`recovery:${v.id}:operational`,target_id:v.id,target_name:v.name,severity:'warning',state:'operational',observed_at:v.at,title:`${v.name} recovered`,public_summary:`${v.name} recovered: checks are operational`});
 }
 for(const a of candidates){
  if(sent>=c.maxAlerts)break;
  // Require consecutive observations in a recent window; old failures cannot
  // confirm a new incident after downtime. Selection happens under advisory lock.
  const checks=await q.select({state:checkRuns.state}).from(checkRuns).where(and(eq(checkRuns.target_id,a.target_id),gte(checkRuns.checked_at,sql`now()-interval '20 minutes'`))).orderBy(desc(checkRuns.checked_at),desc(checkRuns.id)).limit(c.confirmations);
  if(checks.length<c.confirmations||checks.some(v=>v.state!==a.state))continue;
  const latest=await q.select({observed_state:a_.observed_state,recent:sql<boolean>`${a_.sent_at} >= now()-${c.repeat}*interval '1 minute'`}).from(a_).where(eq(a_.target_id,a.target_id)).orderBy(desc(a_.id)).limit(1);
  // A new failure after recovery is a new event, even inside the repeat window.
  if(latest[0]?.observed_state===a.state&&(a.state==='operational'||latest[0].recent))continue;
  await send(c.webhook,a);
  await q.insert(a_).values({dedup_key:a.dedup_key,target_id:a.target_id,severity:a.severity,observed_state:a.state,title:a.title,public_summary:a.public_summary,observed_at:a.observed_at,notification_target:'webhook',public_payload:a});sent++;
 }

 return sent;
}
export async function prune(db:pg.PoolClient,days:number){return (await orm(db).delete(checkRuns).where(lt(checkRuns.checked_at,sql`now()-${days}*interval '1 day'`))).rowCount;}
export async function recordDeployment(db:pg.PoolClient,d:Deployment){await orm(db).insert(deploymentEvents).values({service_id:d.service_id,repo_name:d.repo_name,commit_sha:d.commit_sha,environment:d.environment,deployed_at:d.deployed_at,public_summary:d.public_summary});}
