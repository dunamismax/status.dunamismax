import { mkdir, lstat } from 'node:fs/promises';
import { database } from '../lib/db.js';
import { config } from '../lib/config.js';
import { timestamp, type Deployment } from '../lib/model.js';
import { collect } from './probes.js';
import { recordSnapshot, recordDeployment, sendAlerts, prune } from './writer.js';
export function deployment(args:string[],env:NodeJS.ProcessEnv=process.env):Deployment {
 const options:Record<string,string>={};const keys=['service-id','repo-name','commit-sha','environment','deployed-at','summary'];
 for(let i=0;i<args.length;i++){const arg=args[i]!;const m=arg.match(/^--([a-z-]+)(?:=(.*))?$/);if(!m||!keys.includes(m[1]!))throw new Error('Invalid deployment option');const value=m[2]??args[++i];if(value===undefined||value.startsWith('--'))throw new Error('Missing deployment option value');options[m[1]!]=value;}
 const get=(key:string,variable:string)=>options[key]?.trim()||env['STATUS_DEPLOYMENT_'+variable]?.trim()||null;
 const service_id=get('service-id','SERVICE_ID'),repo_name=get('repo-name','REPO_NAME'),commit_sha=get('commit-sha','COMMIT_SHA'),environment=get('environment','ENVIRONMENT')??'production';
 for(const v of [service_id,repo_name,environment])if(v&&!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v))throw new Error('Invalid deployment identifier');
 if(commit_sha&&!/^[a-f\d]{7,64}$/i.test(commit_sha))throw new Error('Invalid deployment commit');
 const public_summary=get('summary','PUBLIC_SUMMARY')??`${service_id??repo_name??'service'} deployed to ${environment}`;
 if([...public_summary].length>500||/[\x00-\x1f\x7f]/.test(public_summary))throw new Error('Invalid deployment summary');
 return {service_id,repo_name,commit_sha,environment,deployed_at:timestamp(get('deployed-at','DEPLOYED_AT')??new Date().toISOString()),public_summary};
}
export async function main(args:string[]) {
 if(process.env.STATUS_ENV_FILE)process.loadEnvFile(process.env.STATUS_ENV_FILE);
 const mode=args[0];if(args.includes('--help')){console.log('Usage: status collect [--dry-run|--no-notify] | record-deployment [--service-id ID --repo-name NAME --commit-sha SHA --environment NAME --deployed-at RFC3339 --summary TEXT]');return;}
 if(mode!=='collect'&&mode!=='record-deployment')throw new Error('Invalid command');
 const c=config();
 if(mode==='collect'&&args.slice(1).some(v=>!['--dry-run','--no-notify'].includes(v)))throw new Error('Invalid collect option');
 if(mode==='collect'&&args.includes('--dry-run')){console.log(JSON.stringify(await collect(c.repoRoot,await childHome())));return;}
 if(!process.env.PGDATABASE||!process.env.PGUSER)throw new Error('Database is required');
 const pool=database(),db=await pool.connect();
 try{
  if(mode==='record-deployment'){await recordDeployment(db,deployment(args.slice(1)));console.log('recorded deployment');return;}
  const {rows}=await db.query<{locked:boolean}>('SELECT pg_try_advisory_lock(193701,1) AS locked');if(!rows[0]?.locked)throw new Error('Collector already running');
  try{const s=await collect(c.repoRoot,await childHome());await recordSnapshot(db,s);const sent=args.includes('--no-notify')?0:await sendAlerts(db,s,c);const pruned=await prune(db,c.retention);console.log(`stored snapshot: overall=${s.overall_state} services=${s.services.length} projects=${s.projects.length} alerts_sent=${sent} pruned_check_runs=${pruned}`);}
  finally{await db.query('SELECT pg_advisory_unlock(193701,1)');}
 }finally{db.release();await pool.end();}
}
async function childHome(){const home=process.env.STATE_DIRECTORY||`/tmp/status-collector-${process.getuid?.()??'local'}`;await mkdir(home,{mode:0o700,recursive:true});const s=await lstat(home);if(s.isSymbolicLink()||!s.isDirectory()||s.uid!==process.getuid?.()||(s.mode&0o077)!==0)throw new Error('Collector home must be private');return home;}
if(import.meta.url===`file://${process.argv[1]}`)main(process.argv.slice(2)).catch(()=>{console.error('Status command failed; verify configuration, database access, and probe availability.');process.exitCode=1;});
