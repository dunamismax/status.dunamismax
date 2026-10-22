import type { Snapshot, State } from '../lib/model.js';
export interface Alert {dedup_key:string;target_id:string;target_name:string;severity:'critical'|'warning';state:State;observed_at:string;title:string;public_summary:string}
export function alerts(s:Snapshot):Alert[]{
 const candidates=[...s.services.map(v=>({kind:'service',id:v.target.id,name:v.target.name,...v.check})),...s.projects.map(v=>({kind:'project',id:v.target.id,name:v.target.name,...v}))];
 return candidates.flatMap(v=>v.state==='operational'||v.state==='maintenance'?[]:[{dedup_key:`${v.kind}:${v.id}:${v.state}`,target_id:v.id,target_name:v.name,severity:v.state==='down'?'critical' as const:'warning' as const,state:v.state,observed_at:v.checked_at,title:`${v.name} is ${v.state}`,public_summary:`${v.name} is ${v.state}: ${v.reason}`}]).sort((a,b)=>Number(b.severity==='critical')-Number(a.severity==='critical')||a.target_name.localeCompare(b.target_name));
}
export function webhookPayload(a:Alert){return {source:'status.dunamismax.com',severity:a.severity,state:a.state,target_id:a.target_id,target_name:a.target_name,title:a.title,public_summary:a.public_summary,observed_at:a.observed_at};}
export async function notify(url:string,a:Alert,timeoutMs=5000):Promise<void>{
 try{const r=await fetch(url,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json','User-Agent':'status.dunamismax/2 alert-webhook'},body:JSON.stringify(webhookPayload(a))});await r.body?.cancel();if(r.status<200||r.status>299)throw new Error('status');}
 catch{throw new Error('Alert webhook delivery failed');} // URL may contain a secret
}
