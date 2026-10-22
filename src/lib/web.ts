import { timingSafeEqual } from 'node:crypto';
import { displayTime, freshness, snapshot, worst, states, type State, type Snapshot, type Service } from './model.js';
import type { Config } from './config.js';
import type { Source } from './source.js';
const routes = ['/', '/services','/projects','/incidents','/deployments','/operator','/healthz','/readyz','/api/status.json','/api/incidents.json'];
const headers = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'", 'Permissions-Policy':'interest-cohort=()' };
export const escape = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));
const badge=(s:State,label:string=s)=>`<span class="state state-${s}">${escape(label)}</span>`;
const name=(s:Service)=>s.target.public_url ? `<a href="${safeUrl(s.target.public_url)}">${escape(s.target.name)}</a>` : escape(s.target.name);
const safeUrl=(u:string)=>/^https?:\/\//i.test(u) ? escape(u) : '#';
const latency=(v:number|null)=>v===null?'n/a':`${v} ms`;
const worktree=(v:boolean|null)=>v===null?'unknown':v?'dirty':'clean';
const table=(head:string[], rows:unknown[][])=>`<div class="table-wrap"><table class="status-table"><thead><tr>${head.map(h=>`<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map((v,i)=>`<${i?'td':'th scope="row"'}>${escape(v)}</${i?'td':'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const empty=(m:string)=>`<p class="empty-state">${escape(m)}</p>`;
const section=(title:string,body:string)=>`<section class="section first-section"><div class="section-heading"><h1>${escape(title)}</h1></div>${body}</section>`;
const headline:Record<State,string>={operational:'All monitored services are operational',degraded:'Some monitored services are degraded',down:'One or more monitored services are down',maintenance:'Maintenance is in progress',unknown:'Monitored service status is unknown'};
function serviceTable(services:Service[]) {
 return `<div class="table-wrap"><table class="status-table"><thead><tr>${['Service','State','Latency','Last checked','Reason'].map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${services.map(s=>`<tr><th scope="row">${name(s)}<span>${escape(s.target.group)}</span></th><td>${badge(s.check.state)}</td><td>${latency(s.check.latency_ms)}</td><td>${displayTime(s.check.checked_at)}</td><td>${escape(s.check.reason)}</td></tr>`).join('')}</tbody></table></div>`;
}
const groupsOrder=['Public websites','Application services','Remote access','Container services','Databases','Deployment automation','Backups & maintenance','Host capacity','Network & access','Host infrastructure','Host services'];
function overview(s:Snapshot,f:ReturnType<typeof freshness>) {
 const attention=s.services.filter(s=>s.check.state!=='operational');
 const groups=new Map<string,Service[]>();for(const v of s.services) groups.set(v.target.group,[...(groups.get(v.target.group)??[]),v]);
 const sorted=[...groups].sort((a,b)=>(groupsOrder.indexOf(a[0])<0?99:groupsOrder.indexOf(a[0]))-(groupsOrder.indexOf(b[0])<0?99:groupsOrder.indexOf(b[0]))||a[0].localeCompare(b[0]));
 return `<section class="status-band is-${f.stale?'unknown':s.overall_state}"><div><p class="eyebrow">Self-hosted ecosystem status</p><h1>${f.stale&&!f.missing?'Status data is stale':headline[s.overall_state]}</h1><p class="lede">${f.missing?'No collector snapshot has been recorded yet.':f.stale?`The last snapshot, ${f.age} minutes old, reported: ${headline[s.overall_state]}. Current status is unknown until the collector reports again.`:attention.length?`${attention.length} of ${s.services.length} monitored checks need attention. The list below names the affected checks and public-safe reasons.`:`All ${s.services.length} monitored checks are reporting normally.`}</p><dl class="status-meta"><div><dt>Last checked</dt><dd>${f.missing?'never':displayTime(s.checked_at)}</dd></div><div><dt>Checks</dt><dd>${s.services.length}</dd></div><div><dt>Attention</dt><dd>${attention.length}</dd></div></dl></div><dl class="summary">${states.map(k=>`<div><dt>${k[0]!.toUpperCase()+k.slice(1)}</dt><dd>${s.summary[k]}</dd></div>`).join('')}</dl></section>
 <section class="overview-grid" aria-label="Status detail"><article class="overview-panel"><div class="section-heading compact"><h2>Attention</h2><a href="/services">View all</a></div>${attention.length?`<ul class="attention-list">${attention.slice(0,6).map(s=>`<li>${badge(s.check.state)}<strong>${escape(s.target.name)}</strong><span>${escape(s.check.reason)}</span></li>`).join('')}</ul>`:'<p class="panel-note">No monitored checks currently need attention.</p>'}</article><article class="overview-panel"><div class="section-heading compact"><h2>Groups</h2><a href="/projects">Projects</a></div><ul class="group-list">${[...groups].sort().map(([g,v])=>`<li><span>${escape(g)}</span>${badge(worst(v.map(s=>s.check.state)))}</li>`).join('')}</ul></article></section>
 <section class="section"><div class="section-heading"><h2>Monitored services by category</h2><a href="/services">Service details</a></div><div class="service-section-grid">${sorted.map(([g,v])=>`<section class="service-category" aria-label="${escape(g)}"><div class="service-category-heading"><div><h3>${escape(g)}</h3><p>${v.length} checks</p></div>${badge(worst(v.map(s=>s.check.state)))}</div><div class="service-card-grid">${v.map(s=>`<article class="service-card"><div class="service-card-title"><h4>${name(s)}</h4>${badge(s.check.state)}</div><p>${escape(s.check.reason)}</p><dl><div><dt>Latency</dt><dd>${latency(s.check.latency_ms)}</dd></div><div><dt>Checked</dt><dd>${displayTime(s.check.checked_at)}</dd></div></dl></article>`).join('')}</div></section>`).join('')}</div></section>`;
}
function layout(title:string,content:string,f:ReturnType<typeof freshness>|null,s:Snapshot|null,path:string) {
 const nav=[['/','Overview'],['/services','Services'],['/projects','Projects'],['/incidents','Incidents'],['/deployments','Deployments']];
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light"><meta name="description" content="Current public status for the dunamismax self-hosted ecosystem."><link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="stylesheet" href="/assets/status.css"><title>${escape(title)}${title==='Dunamis Status'?'':' · Dunamis Status'}</title></head><body><a class="skip" href="#main">Skip to status</a><header class="site-header"><div class="site-header-inner"><a class="brand" href="/" aria-label="Dunamis Status home"><span class="brand-mark" aria-hidden="true">DS</span><span>Dunamis Status</span></a><div class="header-tools"><nav aria-label="Primary">${nav.map(([href,label])=>`<a class="nav-link${path===href?' active':''}" href="${href}"${path===href?' aria-current="page"':''}>${label}</a>`).join('')}</nav></div></div></header><main id="main">${f?.stale?`<p class="stale-notice" role="status">${f.missing?'<strong>No status data yet.</strong> The collector has not recorded a snapshot, so every state is unknown.':`<strong>Stale data.</strong> The latest collector snapshot is from ${s?displayTime(s.checked_at):'unknown'} (${f.age} minutes ago). These results may no longer be current.`}</p>`:''}${content}</main><footer class="site-footer"><div class="site-footer-inner"><span>status.dunamismax.com</span><a href="/api/status.json">JSON</a></div></footer></body></html>`;
}
export async function readiness(source:Source,c:Config,now=Date.now()) {
 try {await source.ping();const f=freshness(await source.latest(),c.stale,now);return {status:f.stale?'degraded':'ready',dependencies:'postgresql-ready,'+f.dependency,database:'ready'};}
 catch {return {status:'degraded',dependencies:'postgresql-unavailable,collector-snapshot-unknown',database:'unavailable'};}
}
export async function handle(request:Request, source:Source,c:Config,now=Date.now()):Promise<Response> {
 const path=new URL(request.url).pathname;
 const reply=(body:string,status=200,type='text/html; charset=utf-8',extra:Record<string,string>={})=>new Response(request.method==='HEAD'?null:body,{status,headers:{...headers,'Content-Type':type,...extra}});
 const json=(v:unknown,status=200)=>reply(JSON.stringify(v),status,'application/json');
 const html=(title:string,content:string,status=200,f:ReturnType<typeof freshness>|null=null,s:Snapshot|null=null,extra:Record<string,string>={})=>reply(layout(title,content,f,s,path),status,'text/html; charset=utf-8',extra);
 if(!routes.includes(path))return html('Not found',section('Not found','<p class="lede">That status page is not available.</p>'),404);
 if(!['GET','HEAD'].includes(request.method))return reply('',405,'text/plain; charset=utf-8',{'Allow':'GET, HEAD'});
 if(path==='/healthz')return reply('ok\n',200,'text/plain; charset=utf-8');
 if(path==='/operator') {
  if(!c.token)return html('Not found',section('Not found','<p>That status page is not available.</p>'),404);
  const auth=request.headers.get('authorization')?.trim()??'';
  const candidate=auth.startsWith('Bearer ')?Buffer.from(auth.slice(7)):Buffer.alloc(0), token=Buffer.from(c.token);
  if(candidate.length!==token.length||!timingSafeEqual(candidate,token))return reply('operator authorization required\n',401,'text/plain; charset=utf-8',{'WWW-Authenticate':'Bearer realm="status-operator"','X-Robots-Tag':'noindex'});
 }
 try {
  if(path==='/readyz')return json(await readiness(source,c,now));
  if(path==='/api/incidents.json')return json({incidents:await source.incidents(),maintenance:await source.maintenance()});
  if(path==='/incidents') {
   const i=await source.incidents(),m=await source.maintenance();
   return html('Incidents',section('Incidents',i.length?table(['Incident','State','Affected','Started','Resolved','Notes'],i.map(v=>[v.title,v.state,v.affected_targets.join(', '),displayTime(v.started_at),v.resolved_at?displayTime(v.resolved_at):'open',v.public_notes])):empty('No incident records are stored yet.'))+section('Maintenance',m.length?table(['Window','State','Affected','Starts','Ends','Notes'],m.map(v=>[v.title,v.state,v.affected_targets.join(', '),displayTime(v.starts_at),displayTime(v.ends_at),v.public_notes])):empty('No maintenance windows are stored yet.')));
  }
  if(path==='/deployments'){const d=await source.deployments();return html('Deployments',section('Deployments',d.length?table(['Service','Repo','Commit','Environment','Deployed','Summary'],d.map(v=>[v.service_id??'unknown',v.repo_name??'unknown',v.commit_sha?.slice(0,12)??'unknown',v.environment,displayTime(v.deployed_at),v.public_summary])):empty('No deployment records are stored yet.')));}
  const stored=await source.latest(),s=stored??snapshot([],[],new Date(now).toISOString()),f=freshness(stored,c.stale,now);
  if(path==='/api/status.json')return json(s);
  if(path==='/')return html('Dunamis Status',overview(snapshot(s.services,[],s.checked_at),f),200,f,s);
  if(path==='/services')return html('Services',section('Monitored services',serviceTable(s.services)),200,f,s);
  if(path==='/projects')return html('Projects',section('Projects',`<div class="project-grid">${s.projects.map(p=>`<article class="project-card"><div class="project-card-header"><h2>${p.target.public_url?`<a href="${safeUrl(p.target.public_url)}">${escape(p.target.name)}</a>`:escape(p.target.name)}</h2>${badge(p.state)}</div><p>${escape(p.reason)}</p><dl>${[['Branch',p.git.branch??'unknown'],['Upstream',p.git.upstream??'none'],['Ahead / behind',`${p.git.ahead??0} / ${p.git.behind??0}`],['Worktree',worktree(p.git.dirty)],['Latest commit',p.git.latest_commit_age_days===null?'unknown':`${p.git.latest_commit_age_days} days`],['Origin',p.git.remote_reachable===null?'unknown':p.git.remote_reachable?'reachable':'unreachable'],['BUILD progress',p.build?`${p.build.checked}/${p.build.total} checked · ${p.build.next_phase??'No open phase found'}`:'BUILD progress unavailable']].map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl></article>`).join('')}</div>`),200,f,s);
  const ready=await readiness(source,c,now);
  return html('Operator',section('Private status detail',table(['Overall','Readiness','Database'],[[s.overall_state,ready.status,ready.database]]))+section('Service checks',serviceTable(s.services))+section('Repository paths',table(['Project','Repo','Path','Branch','Upstream','Worktree'],s.projects.map(p=>[p.target.name,p.target.repo_name,`${c.repoRoot}/${p.target.repo_name}`,p.git.branch??'unknown',p.git.upstream??'none',worktree(p.git.dirty)]))),200,f,s,{'X-Robots-Tag':'noindex'});
 }catch{return path.startsWith('/api/')?reply(JSON.stringify({error:'status data unavailable'}),503,'application/json',{'Retry-After':'60'}):html('Unavailable',section('Status history is unavailable','<p class="lede">Stored status results cannot be read right now, so no state is shown. Please try again shortly.</p>'),503,null,null,{'Retry-After':'60'});}
}
