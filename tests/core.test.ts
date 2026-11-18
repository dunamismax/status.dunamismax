import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,symlink,rm } from 'node:fs/promises';
import { snapshot, freshness, timestamp, worst, type Snapshot } from '../src/lib/model.js';
import { config } from '../src/lib/config.js';
import { handle, readiness } from '../src/lib/web.js';
import type { Source } from '../src/lib/source.js';
import { command } from '../src/collector/command.js';
import { evaluateMemory,evaluateCertificate,evaluateHttp,evaluateUnit,evaluateCaddy,evaluateDdns,evaluateDisk,evaluateGit,buildProgress,httpProbe,parseFacts,evaluateBackupSize } from '../src/collector/probes.js';
import { httpTargets } from '../src/collector/inventory.js';
import { alerts, notify, heartbeat, testAlert } from '../src/collector/alerts.js';
import { deployment } from '../src/collector/cli.js';
import { canonical,normalize } from '../scripts/history.js';
import { createServer } from 'node:http';
const now=Date.parse('2026-10-22T10:00:00Z');
import { service } from './fixtures.js';
const stored=snapshot([service()]);
const source:Source={latest:async()=>stored,ping:async()=>{},incidents:async()=>[],maintenance:async()=>[],deployments:async()=>[]};
const c=config({});
const request=(path:string,options:RequestInit={})=>new Request('https://status.test'+path,options);
test('legacy Rust snapshot canonical public shape',async()=>{const fixture=JSON.parse(await readFile('tests/fixtures/rust-status.json','utf8')) as Snapshot;const canonicalSnapshot=snapshot(fixture.services,fixture.projects,fixture.checked_at);const r=await handle(request('/api/status.json'),{...source,latest:async()=>canonicalSnapshot},c,now);assert.deepEqual(await r.json(),JSON.parse(await readFile('tests/fixtures/legacy-api-status.json','utf8')));assert.equal(Object.keys(canonicalSnapshot).join(','),'overall_state,checked_at,summary,services,projects');});
test('rollup severity, services-only counts and freshness boundary',()=>{assert.equal(worst([]),'unknown');assert.equal(worst(['maintenance','unknown','degraded','down']),'down');assert.equal(freshness(stored,15,now+899999).stale,false);assert.equal(freshness(stored,15,now+900000).stale,true);assert.equal(freshness(null,15,now).dependency,'collector-snapshot-missing');assert.equal(timestamp('2026-10-22 10:00:00.123456+00'),'2026-10-22T10:00:00.123456Z');assert.throws(()=>timestamp('tomorrow'));});
test('all routes, methods, HEAD, missing and stale snapshots',async()=>{for(const path of ['/','/services','/projects','/incidents','/deployments','/healthz','/readyz','/api/status.json','/api/incidents.json']){assert.equal((await handle(request(path),source,c,now)).status,200);const head=await handle(request(path,{method:'HEAD'}),source,c,now);assert.equal(await head.text(),'');assert.equal((await handle(request(path,{method:'POST'}),source,c,now)).status,405);}assert.equal((await handle(request('/secret'),source,c,now)).status,404);for(const path of ['/','/services','/projects'])assert.match(await (await handle(request(path),source,c,now+900000)).text(),/Stale data/);assert.equal((await readiness({...source,latest:async()=>null},c,now)).status,'degraded');});
test('database failure is redacted, health does not query; operator denies before data access',async()=>{const bad:Source={...source,latest:async()=>{throw new Error('/private/path password=SECRET');},ping:async()=>{throw new Error('secret');}};assert.equal(await (await handle(request('/healthz'),bad,c,now)).text(),'ok\n');for(const path of ['/','/services','/api/status.json']){const r=await handle(request(path),bad,c,now);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SECRET|private\/path|password/);}assert.equal((await readiness(bad,c,now)).database,'unavailable');assert.equal((await handle(request('/operator'),bad,c,now)).status,404);const enabled=config({STATUS_OPERATOR_TOKEN:'a'.repeat(32)});assert.equal((await handle(request('/operator'),bad,enabled,now)).status,401);assert.equal((await handle(request('/operator',{headers:{Authorization:'Bearer '+'a'.repeat(32)}}),source,enabled,now)).status,200);});
test('XSS notes and names are escaped, no browser scripts',async()=>{const injected=snapshot([{...service(),target:{...service().target,name:'<script>alert(1)</script>',public_url:'javascript:alert(1)'}}]);const text=await (await handle(request('/'),{...source,latest:async()=>injected},c,now)).text();assert.doesNotMatch(text,/<script|javascript:/);assert.match(text,/&lt;script&gt;/);});
test('shell-free runner bounds time/output and excludes inherited secrets',async()=>{process.env.STATUS_TEST_SECRET='MUST_NOT_ESCAPE';const secret=await command(process.execPath,['-e','process.stdout.write(process.env.STATUS_TEST_SECRET || "absent")']);assert.equal(secret.stdout,'absent');const literal=await command('/usr/bin/printf',['%s','$(touch /tmp/status-should-not-exist); `false`']);assert.equal(literal.stdout,'$(touch /tmp/status-should-not-exist); `false`');const timed=await command(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:40});assert.equal(timed.timedOut,true);assert.ok(timed.durationMs<2000);const bounded=await command(process.execPath,['-e','process.stdout.write("a".repeat(30000))'],{maxBytes:100});assert.equal(bounded.stdout.length,100);assert.equal(bounded.truncated,true);assert.equal(bounded.exitCode,null);assert.equal((await command('/does/not/exist',[])).exitCode,null);});
test('systemd one-shots, restart loops, permission errors, DDNS staleness and disk thresholds',()=>{const t={id:'test',unit:'test.service',group:'test'},f={LoadState:'loaded',ActiveState:'inactive',Result:'success',ExecMainStatus:'0'};assert.equal(evaluateUnit({...t,oneShot:true},f)[0],'operational');assert.equal(evaluateUnit(t,f)[0],'down');assert.equal(evaluateUnit(t,{...f,ActiveState:'active',NRestarts:'5'})[0],'degraded');assert.equal(evaluateCaddy({exitCode:1,stderr:'permission denied',stdout:'',durationMs:1,timedOut:false,truncated:false},null)[0],'unknown');assert.equal(evaluateDdns({...f,InactiveEnterTimestamp:'@'+((now-31*60000)/1000)},now)[0],'degraded');assert.equal(evaluateDisk('Use% Avail\n80% 1048576')[0],'degraded');assert.equal(evaluateDisk('Use% Avail\n90% 1048576')[0],'down');assert.equal(evaluateDisk('nonsense')[0],'unknown');assert.deepEqual(parseFacts('Result=success\nBad\nNRestarts=5'),{Result:'success',NRestarts:'5'});});
test('git old commits remain healthy; BUILD progress survives',()=>{const b=buildProgress('### First\n- [x] yes\n### Second\n- [ ] no');assert.deepEqual(b,{checked:1,total:2,next_phase:'Second'});assert.equal(evaluateGit({branch:'main',upstream:'origin/main',ahead:0,behind:0,dirty:false,latest_commit_age_days:100,remote_reachable:null},b)[0],'operational');});
test('HTTP and webhook failure tests use a loopback sink only',async()=>{let posts=0;const server=createServer((req,res)=>{if(req.method==='POST')posts++;if(req.url==='/slow'){setTimeout(()=>res.end('ok'),100),res.on('error',()=>{});return;}if(req.url==='/redirect'){res.writeHead(302,{Location:'/ok'});res.end();return;}res.writeHead(req.url==='/bad'?500:200);res.end('token');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const url='http://127.0.0.1:'+address.port;const t={id:'http',name:'test',publicUrl:'',probeUrl:url+'/redirect',expectedStatus:200,bodyToken:'token'};try{assert.equal((await httpProbe(t)).check.state,'operational');assert.equal((await httpProbe({...t,probeUrl:url+'/bad'})).check.state,'down');assert.equal((await httpProbe({...t,probeUrl:url+'/slow'},20)).check.reason,'request timed out');assert.equal(evaluateHttp(t,200,'wrong')[0],'degraded');const a=alerts(snapshot([service('down')]))[0]!;await notify(url+'/ok',a);await assert.rejects(notify(url+'/bad',a),/delivery failed/);assert.equal(posts,2);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}});
test('alert keys, critical ordering and maintenance silence',()=>{const a=alerts(snapshot([service('degraded','a'),service('down','z'),service('maintenance','m'),service('operational','o')]));assert.equal(a.length,2);assert.equal(a[0]?.dedup_key,'service:z:down');});
test('deployment CLI validates flags, timestamps, UTF8, legacy env fallback',()=>{assert.equal(deployment([],{STATUS_DEPLOYMENT_SERVICE_ID:'test'}).public_summary,'test deployed to production');assert.equal(deployment(['--summary','é'.repeat(500)]).public_summary.length,500);assert.throws(()=>deployment(['--summary','bad\nline']));assert.throws(()=>deployment(['--commit-sha','bad']));assert.throws(()=>deployment(['--unknown','x']));});
test('history fingerprints preserve microseconds, IDs, JSON types and Unicode',()=>{assert.equal(canonical(normalize({id:10,checked_at:'2026-01-01 00:00:00.123456',snapshot:{b:'é',a:[true,null,1]}})),canonical(normalize({snapshot:{a:[true,null,1],b:'é'},checked_at:'2026-01-01T00:00:00.123456Z',id:'10'})));});

test('public import graph has no probe, repository or subprocess access',async()=>{for(const path of ['src/lib/web.ts','src/lib/source.ts','src/lib/config.ts','src/lib/model.ts','src/lib/db.ts','src/db/schema.ts','src/pages/[...path].ts'])assert.doesNotMatch(await readFile(path,'utf8'),/node:child_process|from ['"]node:fs|collector\/|db\/(?:migrate|catalog)|fetch\s*\(/);});

test('collector entry point executes through release symlinks',async()=>{const directory=await mkdtemp('/tmp/status-entry-test.');try{await symlink(process.cwd()+'/build/src/collector/cli.js',directory+'/cli.js');const result=await command(process.execPath,[directory+'/cli.js','--help']);assert.equal(result.exitCode,0);assert.match(result.stdout,/Usage: status collect/);}finally{await rm(directory,{recursive:true,force:true});}});

test('successful completion freshness survives an enabled timer; memory uses available and pressure, certificates warn early',()=>{
 const t={id:'backup',unit:'backup.service',group:'Maintenance',oneShot:true,maxAgeMinutes:1560};
 const f={LoadState:'loaded',ActiveState:'inactive',Result:'success',ExecMainStatus:'0',ExecMainExitTimestamp:'@'+((now-25*3600000)/1000)};
 assert.equal(evaluateUnit(t,f,now)[0],'operational');assert.equal(evaluateUnit(t,f,now+2*3600000)[0],'degraded');
 assert.equal(evaluateUnit(t,{...f,Result:'exit-code',ExecMainStatus:'1'},now)[0],'down');
 assert.equal(evaluateUnit(t,{...f,ExecMainExitTimestamp:''},now)[0],'unknown');
 assert.equal(evaluateMemory('MemTotal: 10000 kB\nMemAvailable: 8000 kB','full avg10=0.00 avg60=0.00 avg300=0.00 total=0')[0],'operational');
 assert.equal(evaluateMemory('MemTotal: 10000 kB\nMemAvailable: 400 kB','full avg10=0.00 avg60=0.00')[0],'down');
 assert.equal(evaluateMemory('MemTotal: 10000 kB\nMemAvailable: 8000 kB','full avg10=0.00 avg60=3.00')[0],'degraded');
 assert.equal(evaluateCertificate(new Date(now+20*86400000).toISOString(),now)[0],'degraded');assert.equal(evaluateCertificate(new Date(now+6*86400000).toISOString(),now)[0],'down');
});

test('simulated backup failure leaves public availability operational and keeps the legacy API rollup', async () => {
 const site = service('operational', 'public-site');
 site.target.group = 'Public websites';
 const backup = service('down', 'ubuntu-vm-backup');
 backup.target.group = 'Maintenance';
 backup.check.reason = 'latest one-shot run failed';
 const measured = service('operational', 'backup-repository-growth');
 measured.target.group = 'Host capacity';
 const evidence = snapshot([site, backup, measured]);
 const provider = {...source, latest: async () => evidence};
 const html = await (await handle(request('/'), provider, c, now)).text();
 assert.match(html, /<h1>All monitored public endpoints are operational<\/h1>/);
 assert.match(html, /Backups and maintenance<\/dt><dd><span class="state state-down">down/);
 assert.match(html, /ubuntu-vm-backup<\/strong><span>latest one-shot run failed/);
 assert.deepEqual(await (await handle(request('/api/status.json'), provider, c, now)).json(), evidence);
 assert.equal(evidence.overall_state, 'down');
 assert.equal(alerts(evidence)[0]?.dedup_key, 'service:ubuntu-vm-backup:down');

 const stale = await (await handle(request('/'), provider, c, now + 900000)).text();
 assert.match(stale, /<h1>Public availability is unknown<\/h1>/);
 assert.match(stale, /Backups and maintenance<\/dt><dd><span class="state state-unknown">unknown/);
 const absent = await (await handle(request('/'), {...source, latest: async () => null}, c, now)).text();
 assert.match(absent, /No status data yet/);
 assert.match(absent, /<h1>Public availability is unknown<\/h1>/);

 site.check.state = 'down';
 const outage = await (await handle(request('/'), {...source, latest: async () => snapshot([site, backup])}, c, now)).text();
 assert.match(outage, /<h1>One or more public endpoints are down<\/h1>/);
});

test('backup size is a current bounded measurement, with invalid and unavailable evidence', () => {
 const output = {exitCode:0, stdout:'938056\t/private/path\n', stderr:'', durationMs:1, timedOut:false, truncated:false};
 assert.deepEqual(evaluateBackupSize(output), ['operational', 'backup Git storage is 916 MiB']);
 assert.equal(evaluateBackupSize({...output, stdout:`${5*1024*1024}\t/private/path\n`})[0], 'degraded');
 assert.equal(evaluateBackupSize({...output, stdout:`${10*1024*1024}\t/private/path\n`})[0], 'down');
 assert.deepEqual(evaluateBackupSize({...output, exitCode:1}), ['unknown', 'current backup storage measurement is unavailable']);
 assert.deepEqual(evaluateBackupSize({...output, stdout:'bad'}), ['unknown', 'current backup storage measurement is invalid']);
});

test('public probes check tracker freshness, game health and the two-byte installer download', async () => {
 const regions = ['us','eu','kr','tw'];
 const server = createServer((req, res) => {
  if (req.url?.startsWith('/tracker')) {
   const time = new Date().toISOString();
   const old = new Date(Date.now() - 6*60000).toISOString();
   res.end(JSON.stringify({version:1, generatedAt:req.url === '/tracker-old' ? old : time,
    regions:regions.map(key => ({key, checkedAt:req.url === '/tracker-missing' ? null : req.url === '/tracker-stale' ? old : time, rulesets:[{online:false}]}))}));
  } else if (req.url === '/game') res.end('ok\n');
  else if (req.url === '/game-fallback') res.end('<html>ok</html>');
  else if (req.headers.range === 'bytes=0-1') {
   res.writeHead(206, {'Content-Range':'bytes 0-1/123456', 'Content-Disposition':'attachment; filename="setup.exe"'});
   res.end(req.url === '/bad-installer' ? 'XX' : req.url === '/large-installer' ? 'MZextra' : 'MZ');
  } else res.end('unexpected request');
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 assert.ok(address && typeof address !== 'string');
 const probe = async (id:string, path:string) => {
  const target = httpTargets.find(t => t.id === id);
  assert.ok(target);
  return (await httpProbe({...target, probeUrl:`http://127.0.0.1:${address.port}${path}`})).check;
 };
 try {
  assert.equal((await probe('azerothtrail-status-api', '/tracker')).state, 'operational');
  assert.match((await probe('azerothtrail-status-api', '/tracker-old')).reason, /snapshot is more than five minutes old/);
  assert.match((await probe('azerothtrail-status-api', '/tracker-stale')).reason, /region readings are more than five minutes old/);
  assert.match((await probe('azerothtrail-status-api', '/tracker-missing')).reason, /missing usable readings/);
  assert.equal((await probe('lorehallow-game', '/game')).state, 'operational');
  assert.equal((await probe('lorehallow-game', '/game-fallback')).state, 'degraded');
  assert.equal((await probe('xrayservice-installer', '/installer')).state, 'operational');
  assert.equal((await probe('xrayservice-installer', '/bad-installer')).state, 'degraded');
  assert.match((await probe('xrayservice-installer', '/large-installer')).reason, /size limit/);
 } finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
 }
});

test('alerts and heartbeat use separate requests, with test labeling and redacted redirect failures', async () => {
 const seen: [string|undefined, string|undefined, string][] = [];
 const server = createServer(async (req, res) => {
  const chunks:Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk);
  seen.push([req.method, req.url, Buffer.concat(chunks).toString('utf8')]);
  if (req.url === '/redirect-secret') res.writeHead(302, {Location:'/unexpected'});
  else res.writeHead(204);
  res.end();
 });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address();
 assert.ok(address && typeof address !== 'string');
 const url = `http://127.0.0.1:${address.port}`;
 try {
  assert.equal(config({}).heartbeat, null);
  assert.throws(() => config({STATUS_HEARTBEAT_URL:'http://example.test/secret'}), {message:'Invalid STATUS_HEARTBEAT_URL'});
  await testAlert(url+'/alerts');
  await heartbeat(url+'/ping');
  await assert.rejects(heartbeat(url+'/redirect-secret'), {message:'Collector heartbeat delivery failed'});
  await assert.rejects(testAlert(url+'/redirect-secret'), {message:'Alert webhook delivery failed'});
  assert.deepEqual(seen.map(([method, path]) => [method, path]), [['POST','/alerts'], ['GET','/ping'], ['GET','/redirect-secret'], ['POST','/redirect-secret']]);
  assert.equal(JSON.parse(seen[0]![2]).target_id, 'status-delivery-test');
  assert.match(JSON.parse(seen[0]![2]).title, /^TEST:/);
  assert.equal(seen[1]![2], '');
 } finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
 }
});
