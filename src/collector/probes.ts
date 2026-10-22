import { createConnection } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { command, type CommandResult } from './command.js';
import { snapshot, type State, type Service, type Project, type GitStatus, type BuildProgress } from '../lib/model.js';
import { httpTargets, units, projects, type HttpTarget, type UnitTarget, type ProjectTarget } from './inventory.js';
export type Evaluation = [State,string];
const result=(id:string,name:string,group:string,kind:string,e:Evaluation,at:string,ms:number|null,version:string):Service=>({target:{id,name,group,public_url:'',probe_url:'',expected_status:0},check:{target_id:id,check_kind:kind,state:e[0],checked_at:at,latency_ms:ms,reason:e[1],probe_version:version}});
export function failureReason(error:unknown):string {
 const msg=(error instanceof Error ? error.message+' '+String(error.cause):String(error)).toLowerCase();
 return /getaddrinfo|enotfound|eai_again|name resolution/.test(msg)?'DNS lookup failed':/ssl|tls|certificate|cert_|crypto/.test(msg)?'TLS handshake failed':/timeout|timed out|aborted/.test(msg)?'request timed out':/refused|econnrefused/.test(msg)?'connection refused':/redirect/.test(msg)?'too many redirects':'HTTP probe request failed';
}
export function evaluateHttp(t:HttpTarget,status:number,body:string|null):Evaluation {
 if(status!==t.expectedStatus)return [status>=500?'down':'degraded',`expected HTTP ${t.expectedStatus}, got HTTP ${status}`];
 if(t.bodyToken && !(body??'').includes(t.bodyToken))return ['degraded','expected response token was missing'];
 return ['operational',`HTTP ${status}`];
}
export async function httpProbe(t:HttpTarget,timeoutMs=5000):Promise<Service> {
 const at=new Date().toISOString(),start=performance.now();let e:Evaluation;
 try{
  let url=t.probeUrl;const signal=AbortSignal.timeout(timeoutMs);
  for(let hop=0;;hop++){
   const response=await fetch(url,{redirect:'manual',signal,headers:{'User-Agent':'status.dunamismax/2 public-http-probe','Accept':'*/*'}});
   if([301,302,303,307,308].includes(response.status)&&response.headers.get('location')){
    await response.body?.cancel();if(hop>=4)throw new Error('redirect limit');const next=new URL(response.headers.get('location')!,url);if(!['http:','https:'].includes(next.protocol))throw new Error('redirect protocol');url=next.href;continue;
   }
   let body:string|null=null;
   if(t.bodyToken && response.status===t.expectedStatus && response.body){const reader=response.body.getReader();const chunks:Buffer[]=[];let size=0;try{while(size<262144){const v=await reader.read();if(v.done)break;const chunk=Buffer.from(v.value).subarray(0,262144-size);size+=chunk.length;chunks.push(chunk);}}finally{await reader.cancel();}body=Buffer.concat(chunks).toString('utf8');}
   else await response.body?.cancel();
   e=evaluateHttp(t,response.status,body);break;
  }
 }catch(error){e=['down',failureReason(error)];}
 const s=result(t.id,t.name,'Public websites','http',e,at,e[1]==='request timed out'?null:Math.round(performance.now()-start),'public-http-v2');
 s.target.public_url=t.publicUrl;s.target.probe_url=t.probeUrl;s.target.expected_status=t.expectedStatus;return s;
}
export type Facts=Record<string,string>;
export function parseFacts(s:string):Facts {return Object.fromEntries(s.split(/\r?\n/).filter(l=>l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).trim()]));}
export function systemTime(s:string|undefined):number|null {if(!s||['n/a','0'].includes(s))return null;const t=/^@\d+$/.test(s)?Number(s.slice(1))*1000:Date.parse(s);return Number.isFinite(t)?t:null;}
export function execFailed(s:string|undefined):boolean {const m=s?.match(/code=([^ ;}]+)\s*;\s*status=(\d+)/);return !!m&&(['killed','dumped'].includes(m[1]!)||(m[1]==='exited'&&Number(m[2])!==0));}
export function evaluateUnit(t:UnitTarget,f:Facts):Evaluation {
 if(f.LoadState!=='loaded')return ['unknown','unit is not loaded'];
 const active=f.ActiveState,res=f.Result||'success',code=Number(f.ExecMainStatus||0);
 if(!t.oneShot){if(active==='active')return res==='success'&&Number(f.NRestarts||0)<5?['operational','unit is active']:['degraded','unit is active but restart or result evidence needs attention'];if(['reloading','activating','deactivating'].includes(active??''))return ['degraded','unit is transitioning'];return active==='failed'?['down','unit failed']:active==='inactive'?['down','unit is inactive']:['unknown','unit state is unknown'];}
 if(['active','activating'].includes(active??''))return ['operational','one-shot is running'];
 if(res==='success'&&code===0)return ['operational','latest one-shot run succeeded'];
 return active==='failed'||code>0||['exit-code','signal','timeout'].includes(res)?['down','latest one-shot run failed']:['unknown','latest one-shot result is unknown'];
}
export async function show(unit:string,props:string[],home:string):Promise<[Facts|null,CommandResult]> {const r=await command('/usr/bin/systemctl',['show',unit,'--timestamp=unix',...props.map(p=>'--property='+p)],{home});return [r.exitCode===0?parseFacts(r.stdout):null,r];}
export async function unitProbe(t:UnitTarget,home:string):Promise<Service>{const at=new Date().toISOString();const [f,r]=await show(t.unit,['LoadState','ActiveState','SubState','Result','ExecMainStatus','NRestarts'],home);return result(t.id,t.unit,t.group,'systemd',f?evaluateUnit(t,f):['unknown','systemd state unavailable'],at,r.durationMs,'systemd-v1');}
export function evaluateCaddy(r:CommandResult,f:Facts|null):Evaluation {
 if(r.exitCode===null)return ['unknown','Caddyfile check unavailable'];
 if(r.exitCode!==0)return /permission denied/i.test(r.stderr)?['unknown','Caddyfile could not be read']:['degraded','Caddyfile failed to parse; the running config is unchanged until reload'];
 if(!f)return ['unknown','caddy reload evidence unavailable'];
 if(f.ActiveState==='failed')return ['down','caddy service failed'];
 if(f.ActiveState==='active'&&execFailed(f.ExecReload))return ['degraded','latest caddy reload failed; the previous config is still serving'];
 if(f.ActiveState==='active'&&(f.Result||'success')==='success')return systemTime(f.ActiveEnterTimestamp)!==null?['operational','Caddyfile parses and caddy is active']:['degraded','Caddyfile parses but reload recency is unavailable'];
 return ['unknown','caddy service state is unknown'];
}
export function evaluateDdns(f:Facts,now=Date.now()):Evaluation {
 if(f.LoadState!=='loaded')return ['unknown','Cloudflare DDNS unit is not loaded'];
 if(['active','activating'].includes(f.ActiveState??''))return ['operational','Cloudflare DDNS update is running'];
 const res=f.Result||'success',code=Number(f.ExecMainStatus||0),last=systemTime(f.InactiveEnterTimestamp);
 if(res==='success'&&code===0){if(last===null)return ['degraded','Cloudflare DDNS success time is unavailable'];const minutes=Math.floor(Math.max(0,now-last)/60000);return minutes>30?['degraded',`latest Cloudflare DDNS run succeeded ${minutes} minutes ago`]:['operational','latest Cloudflare DDNS run succeeded'];}
 return f.ActiveState==='failed'||code>0||['exit-code','signal','timeout'].includes(res)?['down','latest Cloudflare DDNS run failed']:['unknown','latest Cloudflare DDNS result is unknown'];
}
export function tcpProbe(port:number,timeoutMs=3000):Promise<Service>{const at=new Date().toISOString(),start=performance.now();return new Promise(resolve=>{let done=false;const s=createConnection({host:'127.0.0.1',port});const finish=(e:Evaluation)=>{if(done)return;done=true;s.destroy();resolve(result('rustdesk-tcp-'+port,port===21115?'RustDesk hbbs NAT test (TCP 21115)':port===21116?'RustDesk hbbs rendezvous (TCP 21116)':'RustDesk hbbr relay (TCP 21117)','Remote access','tcp',e,at,Math.round(performance.now()-start),'tcp-v1'));};s.setTimeout(timeoutMs,()=>finish(['down',`TCP ${port} connection timed out`]));s.on('connect',()=>finish(['operational',`TCP ${port} accepts connections`]));s.on('error',(e:NodeJS.ErrnoException)=>finish(['down',`TCP ${port} ${e.code==='ECONNREFUSED'?'refused the connection':'connection failed'}`]));});}
export function evaluateDisk(s:string):Evaluation {const m=s.trim().split(/\r?\n/)[1]?.match(/^\s*(\d{1,3})%\s+(\d+)\s*$/);if(!m)return ['unknown','root filesystem usage could not be parsed'];const usage=Number(m[1]),k=Number(m[2]);const space=k>=1048576?Math.round(k/1048576)+'G':k>=1024?Math.round(k/1024)+'M':k+'K';return [usage>=90?'down':usage>=80?'degraded':'operational',`root filesystem is ${usage}% full; ${space} available`];}
export function buildProgress(s:string):BuildProgress|null {let checked=0,total=0,phase:string|null=null,next:string|null=null,open=false;for(const raw of s.split(/\r?\n/)){const l=raw.trim();if(l.startsWith('### ')){if(open&&next===null)next=phase;phase=l.slice(4);open=false;}else if(/^- \[[xX]\]/.test(l)){checked++;total++;}else if(l.startsWith('- [ ]')){total++;open=true;}}if(open&&next===null)next=phase;return total?{checked,total,next_phase:next}:null;}
export function evaluateGit(g:GitStatus,b:BuildProgress|null):Evaluation {
 if(g.branch===null)return ['unknown','git branch could not be read'];const reasons:string[]=[];
 if(g.dirty)reasons.push('working tree has uncommitted changes');const ahead=g.ahead??0,behind=g.behind??0;
 if(ahead&&behind)reasons.push(`branch is ${ahead} ahead and ${behind} behind upstream`);else if(ahead)reasons.push(`branch is ${ahead} ahead of upstream`);else if(behind)reasons.push(`branch is ${behind} behind upstream`);
 if(g.upstream===null)reasons.push('upstream branch is not configured');const notes=(g.latest_commit_age_days??0)>30?[`latest commit is ${g.latest_commit_age_days} days old`]:[];
 return reasons.length?['degraded',[...reasons,...notes].join('; ')]:['operational',['repository is current',b?`BUILD progress ${b.checked}/${b.total}`:'BUILD progress unavailable',...notes].join('; ')];
}
async function gitProbe(t:ProjectTarget,home:string):Promise<Project> {
 const at=new Date().toISOString();const g:GitStatus={branch:null,upstream:null,ahead:null,behind:null,dirty:null,latest_commit_age_days:null,remote_reachable:null};let b:BuildProgress|null=null,e:Evaluation=['unknown','repository checkout was not found'];
 const git=async(args:string[])=>{const r=await command('/usr/bin/git',['-c','safe.directory='+t.path,'-C',t.path,...args],{home});return r.exitCode===0?r.stdout.trim():null;};
 try{await stat(t.path+'/.git');g.branch=await git(['rev-parse','--abbrev-ref','HEAD']);g.upstream=await git(['rev-parse','--abbrev-ref','--symbolic-full-name','@{u}']);if(g.upstream){const counts=(await git(['rev-list','--left-right','--count','@{u}...HEAD']))?.match(/^(\d+)\s+(\d+)$/);if(counts){g.ahead=Number(counts[2]);g.behind=Number(counts[1]);}}const dirty=await git(['status','--porcelain=v1']);g.dirty=dirty===null?null:dirty!=='';const age=Date.parse((await git(['log','-1','--format=%cI']))??'');g.latest_commit_age_days=Number.isFinite(age)?Math.floor(Math.max(0,Date.now()-age)/86400000):null;try{const file=await stat(t.path+'/BUILD.md');if(file.size<=1048576)b=buildProgress(await readFile(t.path+'/BUILD.md','utf8'));}catch{}e=evaluateGit(g,b);}catch{}
 return {target:{id:t.id,name:t.repo,repo_name:t.repo,public_url:t.url},state:e[0],checked_at:at,reason:e[1],git:g,build:b,probe_version:'git-project-v1'};
}
export async function collect(repoRoot:string,home:string) {
 const services:Service[]=[];for(const t of httpTargets)services.push(await httpProbe(t));for(const t of units)services.push(await unitProbe(t,home));for(const port of [21115,21116,21117])services.push(await tcpProbe(port));
 let at=new Date().toISOString();const adapt=await command('/usr/local/lib/caddy/caddy',['adapt','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'],{home,discardStdout:true});const [caddy,showResult]=adapt.exitCode===0?await show('caddy.service',['ActiveState','Result','ActiveEnterTimestamp','ExecReload'],home):[null,null];services.push(result('caddy-config','Caddy configuration','Host infrastructure','caddy',evaluateCaddy(adapt,caddy),at,adapt.durationMs+(showResult?.durationMs??0),'caddy-v2'));
 at=new Date().toISOString();const [ddns,d]=await show('cloudflare-ddns.service',['LoadState','ActiveState','Result','ExecMainStatus','InactiveEnterTimestamp'],home);services.push(result('cloudflare-ddns-update','Cloudflare DDNS','Host infrastructure','cloudflare-ddns',ddns?evaluateDdns(ddns):['unknown','Cloudflare DDNS status unavailable'],at,d.durationMs,'cloudflare-ddns-v2'));
 at=new Date().toISOString();const disk=await command('/usr/bin/df',['--output=pcent,avail','/'],{home});services.push(result('root-disk','Root filesystem','Host capacity','disk',disk.exitCode===0?evaluateDisk(disk.stdout):['unknown','root filesystem usage unavailable'],at,disk.durationMs,'disk-v1'));
 const projectResults:Project[]=[];for(const t of projects(repoRoot))projectResults.push(await gitProbe(t,home));return snapshot(services,projectResults);
}
