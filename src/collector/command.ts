import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
export interface CommandResult { exitCode:number|null; stdout:string; stderr:string; durationMs:number; timedOut:boolean; truncated:boolean }
/** No shell; no inherited secrets; bounded output and a wall-clock process-group deadline. */
export function command(program:string,args:string[],options:{timeoutMs?:number;maxBytes?:number;discardStdout?:boolean;home?:string}={}):Promise<CommandResult> {
 if(!isAbsolute(program))throw new Error('Command must use an absolute path');
 const start=performance.now(), max=options.maxBytes??1048576;
 return new Promise(resolve=>{
  let stdout=Buffer.alloc(0),stderr=Buffer.alloc(0),timedOut=false,truncated=false,done=false;
  const child=spawn(program,args,{shell:false,detached:true,cwd:'/',env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',TZ:'UTC',HOME:options.home??'/tmp',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0'},stdio:['ignore',options.discardStdout?'ignore':'pipe','pipe']});
  const finish=(exitCode:number|null)=>{if(done)return;done=true;clearTimeout(timer);resolve({exitCode:timedOut||truncated?null:exitCode,stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8'),durationMs:Math.round(performance.now()-start),timedOut,truncated});};
  const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
  const timer=setTimeout(()=>{timedOut=true;kill();},options.timeoutMs??5000);
  const append=(part:Buffer,channel:'out'|'err')=>{const previous=channel==='out'?stdout:stderr;const room=Math.max(0,max-previous.length);if(part.length>room)truncated=true;const next=Buffer.concat([previous,part.subarray(0,room)]);if(channel==='out')stdout=next;else stderr=next;};
  child.stdout?.on('data',(v:Buffer)=>append(v,'out')); child.stderr?.on('data',(v:Buffer)=>append(v,'err'));
  child.on('error',()=>finish(null));child.on('close',code=>finish(code));
 });
}
