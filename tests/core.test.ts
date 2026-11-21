import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,readdir,mkdtemp,symlink,rm } from 'node:fs/promises';
import { snapshot, freshness, timestamp, worst, type Snapshot } from '../src/lib/model.js';
import { config } from '../src/lib/config.js';
import { readiness } from '../src/lib/web.js';
import { handle } from './web.js';
import type { Source } from '../src/lib/source.js';
import { command } from '../src/collector/command.js';
import { evaluateMemory,evaluateCertificate,evaluateHttp,evaluateUnit,evaluateCaddy,evaluateDdns,evaluateDisk,evaluateGit,buildProgress,httpProbe,parseFacts,evaluateBackupSize } from '../src/collector/probes.js';
import { httpTargets, units, projects, redirectHosts, certificateHosts } from '../src/collector/inventory.js';
import { cfromthegroundupHealth, plainOk } from '../src/collector/http-evidence.js';
import { properties } from '../src/lib/catalog.js';
import { indexHistory, track, percent, sites, segments, anchor, buildNext, categories, attentionLimit } from '../src/lib/view.js';
import { estDay, addDays, type DailyCount } from '../src/lib/model.js';
import { alerts, notify, heartbeat, testAlert } from '../src/collector/alerts.js';
import { deployment } from '../src/collector/cli.js';
import { canonical,normalize } from '../scripts/history.js';
import { createServer } from 'node:http';
const now=Date.parse('2026-10-22T10:00:00Z');
import { service } from './fixtures.js';
const stored=snapshot([service()]);
const source:Source={latest:async()=>stored,ping:async()=>{},incidents:async()=>[],maintenance:async()=>[],deployments:async()=>[],history:async()=>[]};
const c=config({});
const request=(path:string,options:RequestInit={})=>new Request('https://status.test'+path,options);
test('legacy Rust snapshot canonical public shape',async()=>{const fixture=JSON.parse(await readFile('tests/fixtures/rust-status.json','utf8')) as Snapshot;const canonicalSnapshot=snapshot(fixture.services,fixture.projects,fixture.checked_at);const r=await handle(request('/api/status.json'),{...source,latest:async()=>canonicalSnapshot},c,now);assert.deepEqual(await r.json(),JSON.parse(await readFile('tests/fixtures/legacy-api-status.json','utf8')));assert.equal(Object.keys(canonicalSnapshot).join(','),'overall_state,checked_at,summary,services,projects');});
test('rollup severity, services-only counts and freshness boundary',()=>{assert.equal(worst([]),'unknown');assert.equal(worst(['maintenance','unknown','degraded','down']),'down');assert.equal(freshness(stored,15,now+899999).stale,false);assert.equal(freshness(stored,15,now+900000).stale,true);assert.equal(freshness(null,15,now).dependency,'collector-snapshot-missing');assert.equal(timestamp('2026-10-22 10:00:00.123456+00'),'2026-10-22T10:00:00.123456Z');assert.throws(()=>timestamp('tomorrow'));});
test('all routes, methods, HEAD, missing and stale snapshots',async()=>{for(const path of ['/','/services','/projects','/incidents','/deployments','/healthz','/readyz','/api/status.json','/api/incidents.json']){assert.equal((await handle(request(path),source,c,now)).status,200);const head=await handle(request(path,{method:'HEAD'}),source,c,now);assert.equal(await head.text(),'');assert.equal((await handle(request(path,{method:'POST'}),source,c,now)).status,405);}assert.equal((await handle(request('/secret'),source,c,now)).status,404);for(const path of ['/','/services','/projects'])assert.match(await (await handle(request(path),source,c,now+900000)).text(),/Stale data/);assert.equal((await readiness({...source,latest:async()=>null},c,now)).status,'degraded');});
test('database failure is redacted, health reports the database; operator denies before data access',async()=>{const bad:Source={...source,latest:async()=>{throw new Error('/private/path password=SECRET');},ping:async()=>{throw new Error('secret');}};{const r=await handle(request('/healthz'),bad,c,now);assert.equal(r.status,503);assert.deepEqual(await r.json(),{status:'unavailable',revision:'unrecorded',database:'unavailable'});}{const r=await handle(request('/healthz'),source,c,now);assert.equal(r.status,200);assert.deepEqual(await r.json(),{status:'ok',revision:'unrecorded',database:'ok'});}for(const path of ['/','/services','/api/status.json']){const r=await handle(request(path),bad,c,now);assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SECRET|private\/path|password/);}assert.equal((await readiness(bad,c,now)).database,'unavailable');assert.equal((await handle(request('/operator'),bad,c,now)).status,404);const enabled=config({STATUS_OPERATOR_TOKEN:'a'.repeat(32)});assert.equal((await handle(request('/operator'),bad,enabled,now)).status,401);assert.equal((await handle(request('/operator',{headers:{Authorization:'Bearer '+'a'.repeat(32)}}),source,enabled,now)).status,200);});
test('XSS notes and names are escaped, no browser scripts',async()=>{const injected=snapshot([{...service(),target:{...service().target,name:'<script>alert(1)</script>',group:'<b>group</b>',public_url:'javascript:alert(1)'}}]);for(const path of ['/','/services']){const text=await (await handle(request(path),{...source,latest:async()=>injected},c,now)).text();assert.doesNotMatch(text,/<script|<b>|javascript:/);assert.match(text,/&lt;b>group&lt;\/b>/);if(path==='/services')assert.match(text,/&lt;script>alert\(1\)&lt;\/script>/);}});
test('shell-free runner bounds time/output and excludes inherited secrets',async()=>{process.env.STATUS_TEST_SECRET='MUST_NOT_ESCAPE';const secret=await command(process.execPath,['-e','process.stdout.write(process.env.STATUS_TEST_SECRET || "absent")']);assert.equal(secret.stdout,'absent');const literal=await command('/usr/bin/printf',['%s','$(touch /tmp/status-should-not-exist); `false`']);assert.equal(literal.stdout,'$(touch /tmp/status-should-not-exist); `false`');const timed=await command(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:40});assert.equal(timed.timedOut,true);assert.ok(timed.durationMs<2000);const bounded=await command(process.execPath,['-e','process.stdout.write("a".repeat(30000))'],{maxBytes:100});assert.equal(bounded.stdout.length,100);assert.equal(bounded.truncated,true);assert.equal(bounded.exitCode,null);assert.equal((await command('/does/not/exist',[])).exitCode,null);});
test('systemd one-shots, restart loops, permission errors, DDNS staleness and disk thresholds',()=>{const t={id:'test',unit:'test.service',group:'test'},f={LoadState:'loaded',ActiveState:'inactive',Result:'success',ExecMainStatus:'0'};assert.equal(evaluateUnit({...t,oneShot:true},f)[0],'operational');assert.equal(evaluateUnit(t,f)[0],'down');assert.equal(evaluateUnit(t,{...f,ActiveState:'active',NRestarts:'5'})[0],'degraded');assert.equal(evaluateCaddy({exitCode:1,stderr:'permission denied',stdout:'',durationMs:1,timedOut:false,truncated:false},null)[0],'unknown');assert.equal(evaluateDdns({...f,InactiveEnterTimestamp:'@'+((now-31*60000)/1000)},now)[0],'degraded');assert.equal(evaluateDisk('Use% Avail\n80% 1048576')[0],'degraded');assert.equal(evaluateDisk('Use% Avail\n90% 1048576')[0],'down');assert.equal(evaluateDisk('nonsense')[0],'unknown');assert.deepEqual(parseFacts('Result=success\nBad\nNRestarts=5'),{Result:'success',NRestarts:'5'});});
test('git old commits remain healthy; BUILD progress survives',()=>{const b=buildProgress('### First\n- [x] yes\n### Second\n- [ ] no');assert.deepEqual(b,{checked:1,total:2,next_phase:'Second'});assert.equal(evaluateGit({branch:'main',upstream:'origin/main',ahead:0,behind:0,dirty:false,latest_commit_age_days:100,remote_reachable:null},b)[0],'operational');});
test('HTTP and webhook failure tests use a loopback sink only',async()=>{let posts=0;const server=createServer((req,res)=>{if(req.method==='POST')posts++;if(req.url==='/slow'){setTimeout(()=>res.end('ok'),100),res.on('error',()=>{});return;}if(req.url==='/redirect'){res.writeHead(302,{Location:'/ok'});res.end();return;}res.writeHead(req.url==='/bad'?500:200);res.end('token');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');const url='http://127.0.0.1:'+address.port;const t={id:'http',name:'test',publicUrl:'',probeUrl:url+'/redirect',expectedStatus:200,bodyToken:'token'};try{assert.equal((await httpProbe(t)).check.state,'operational');assert.equal((await httpProbe({...t,probeUrl:url+'/bad'})).check.state,'down');assert.equal((await httpProbe({...t,probeUrl:url+'/slow'},20)).check.reason,'request timed out');assert.equal(evaluateHttp(t,200,'wrong')[0],'degraded');const a=alerts(snapshot([service('down')]))[0]!;await notify(url+'/ok',a);await assert.rejects(notify(url+'/bad',a),/delivery failed/);assert.equal(posts,2);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}});
test('alert keys, critical ordering and maintenance silence',()=>{const a=alerts(snapshot([service('degraded','a'),service('down','z'),service('maintenance','m'),service('operational','o')]));assert.equal(a.length,2);assert.equal(a[0]?.dedup_key,'service:z:down');});
test('deployment CLI validates flags, timestamps, UTF8, legacy env fallback',()=>{assert.equal(deployment([],{STATUS_DEPLOYMENT_SERVICE_ID:'test'}).public_summary,'test deployed to production');assert.equal(deployment(['--summary','é'.repeat(500)]).public_summary.length,500);assert.throws(()=>deployment(['--summary','bad\nline']));assert.throws(()=>deployment(['--commit-sha','bad']));assert.throws(()=>deployment(['--unknown','x']));});
test('history fingerprints preserve microseconds, IDs, JSON types and Unicode',()=>{assert.equal(canonical(normalize({id:10,checked_at:'2026-01-01 00:00:00.123456',snapshot:{b:'é',a:[true,null,1]}})),canonical(normalize({snapshot:{a:[true,null,1],b:'é'},checked_at:'2026-01-01T00:00:00.123456Z',id:'10'})));});

test('public import graph has no probe, repository or subprocess access',async()=>{const routes=(await readdir('src/routes',{recursive:true})).filter(f=>/\.(?:ts|svelte)$/.test(f)).map(f=>'src/routes/'+f);const components=(await readdir('src/lib/components')).map(f=>'src/lib/components/'+f);assert.ok(routes.length>=15);for(const path of ['src/hooks.server.ts','src/lib/web.ts','src/lib/view.ts','src/lib/source.ts','src/lib/config.ts','src/lib/model.ts','src/lib/db.ts','src/db/schema.ts',...routes,...components])assert.doesNotMatch(await readFile(path,'utf8'),/node:child_process|from ['"]node:fs|collector\/|db\/(?:migrate|catalog)|fetch\s*\(/);});

test('pages ship no browser JavaScript, inline styles or hydration markers',async()=>{const client=await readdir('dist/client',{recursive:true});assert.deepEqual(client.filter(f=>/\.m?js$/.test(f)),[]);for(const path of ['/','/services','/projects','/incidents','/deployments','/nope']){const text=await (await handle(request(path),source,c,now)).text();assert.doesNotMatch(text,/<script|<style|style=|<!--|modulepreload/);assert.match(text,/<link href="\/_app\/immutable\/assets\/[^"]+\.css" rel="stylesheet">/);}const r=await handle(request('/services'),source,c,now);assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('x-sveltekit-page'),null);assert.match(await r.text(),/<a class="nav-link active" href="\/services" aria-current="page">Services<\/a>/);});

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

test('public probes check tracker freshness, game and demo health and the two-byte installer download', async () => {
 const regions = ['us','eu','kr','tw'];
 const server = createServer((req, res) => {
  if (req.url?.startsWith('/tracker')) {
   const time = new Date().toISOString();
   const old = new Date(Date.now() - 6*60000).toISOString();
   res.end(JSON.stringify({version:1, generatedAt:req.url === '/tracker-old' ? old : time,
    regions:regions.map(key => ({key, checkedAt:req.url === '/tracker-missing' ? null : req.url === '/tracker-stale' ? old : time, rulesets:[{online:false}]}))}));
  } else if (req.url === '/demo-health') res.end(JSON.stringify({status:'ok', storage:'postgres', revision:'abc'}));
  else if (req.url === '/demo-health-failing') res.end(JSON.stringify({status:'error', storage:'postgres'}));
  else if (req.url === '/demo-health-page') res.end('<html>ok</html>');
  else if (req.url === '/game') res.end('ok\n');
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
  assert.equal((await probe('imagingservices-demo', '/demo-health')).state, 'operational');
  assert.match((await probe('imagingservices-demo', '/demo-health-failing')).reason, /did not report ok/);
  assert.equal((await probe('imagingservices-demo', '/demo-health-page')).state, 'degraded');
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

test('response policy headers: 405 Allow, 503 Retry-After, operator noindex and bearer challenge', async () => {
 const post = await handle(request('/api/status.json', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}), source, c, now);
 assert.equal(post.status, 405);
 assert.equal(post.headers.get('allow'), 'GET, HEAD');
 assert.equal(await post.text(), '');
 const bad: Source = {...source, latest: async () => { throw new Error('down'); }};
 for (const path of ['/', '/api/status.json']) assert.equal((await handle(request(path), bad, c, now)).headers.get('retry-after'), '60');
 assert.match(await (await handle(request('/'), bad, c, now)).text(), /<h1>Status history is unavailable<\/h1>/);
 const enabled = config({STATUS_OPERATOR_TOKEN: 'b'.repeat(32)});
 const denied = await handle(request('/operator', {headers: {Authorization: 'Bearer ' + 'c'.repeat(32)}}), source, enabled, now);
 assert.equal(denied.status, 401);
 assert.equal(denied.headers.get('www-authenticate'), 'Bearer realm="status-operator"');
 assert.equal(denied.headers.get('x-robots-tag'), 'noindex');
 const granted = await handle(request('/operator', {headers: {Authorization: 'Bearer ' + 'b'.repeat(32)}}), source, enabled, now);
 assert.equal(granted.headers.get('x-robots-tag'), 'noindex');
 assert.match(await granted.text(), /<h1>Private status detail<\/h1>/);
 const missing = await handle(request('/nope'), source, c, now);
 assert.equal(missing.status, 404);
 assert.match(await missing.text(), /<title>Not found · Dunamis Status<\/title>/);
});

test('every catalogued site check and repository exists in the collector inventory', () => {
 const hosts = new Set(certificateHosts());
 const ids = new Set([...httpTargets.map(t => t.id), ...units.map(t => t.id), ...[21115, 21116, 21117].map(p => 'rustdesk-tcp-' + p),
  ...[...hosts].map(h => 'certificate-' + h), 'caddy-config', 'cloudflare-ddns-update', 'root-disk', 'memory-pressure', 'backup-repository-growth']);
 const repos = new Set(projects('/repos').map(p => p.id));
 assert.equal(new Set(properties.map(p => p.id)).size, properties.length);
 for (const p of properties) {
  for (const id of [p.primary, ...p.checks]) assert.ok(ids.has(id), `${p.id} names unknown check ${id}`);
  for (const id of p.projects) assert.ok(repos.has(id), `${p.id} names unknown project ${id}`);
 }
 // Target IDs are history keys: they must be unique within services and within projects.
 const serviceIds = [...httpTargets.map(t => t.id), ...units.map(t => t.id)];
 assert.equal(new Set(serviceIds).size, serviceIds.length);
 assert.equal(repos.size, projects('/repos').length);
 for (const host of ['cfromthegroundup.com', 'daybyword.com', 'rivermindpoker.com', 'vincentsawyer.org', 'data.xrayservice.net']) assert.ok(hosts.has(host));
 for (const unit of ['lorehallow-server', 'lorehallow-web', 'rivermind-poker-web', 'umami', 'daybyword-backup', 'daybyword-restore-check-timer']) assert.ok(units.some(t => t.id === unit));
 // The retired Python table server is stopped on purpose (rollback only), so it is not a check.
 assert.ok(!units.some(t => t.unit === 'rivermind-poker.service'));
 assert.equal(units.find(t => t.id === 'daybyword-restore-check')?.maxAgeMinutes, 32*24*60);
 assert.equal(units.find(t => t.id === 'vincentsawyer-backup')?.maxAgeMinutes, 26*60);
 // Field Cadence runs in Docker like Day by Word: its page, both certificates and its repository are its evidence.
 for (const host of ['fieldcadence.app', 'www.fieldcadence.app']) assert.ok(hosts.has(host));
 assert.ok(repos.has('fieldcadence'));
 assert.equal(httpTargets.find(t => t.id === 'imagingservices-demo')?.probeUrl, 'https://demo.xrayservice.net/healthz');
});

test('every redirect host belongs to a probed site and every certificate check to a catalogued one', () => {
 const probed = new Set(httpTargets.map(t => new URL(t.publicUrl).hostname));
 assert.equal(new Set(redirectHosts).size, redirectHosts.length);
 for (const host of redirectHosts) {
  assert.match(host, /^www\./);
  assert.ok(probed.has(host.slice(4)), `${host} redirects to a site that is not probed`);
 }
 const hosts = certificateHosts();
 assert.equal(new Set(hosts).size, hosts.length);
 const catalogued = new Set(properties.flatMap(p => [p.primary, ...p.checks]));
 for (const host of hosts) assert.ok(catalogued.has('certificate-' + host), `certificate-${host} is on no site card`);
});

test('new site health evidence: database-aware health JSON and plain ok bodies', () => {
 const json = (v: unknown) => Buffer.from(JSON.stringify(v));
 assert.equal(cfromthegroundupHealth(json({status:'ok',database:'ok'}), new Headers(), now)[0], 'operational');
 assert.match(cfromthegroundupHealth(json({status:'ok',database:'down'}), new Headers(), now)[1], /database/);
 assert.equal(cfromthegroundupHealth(Buffer.from('<html>'), new Headers(), now)[0], 'degraded');
 assert.equal(plainOk('web')(Buffer.from('ok\n'), new Headers(), now)[0], 'operational');
 assert.equal(plainOk('web')(Buffer.from('nope'), new Headers(), now)[0], 'degraded');
});

test('daily history: EST days, worst state per day, empty days and rounded-down uptime', () => {
 assert.equal(estDay(Date.parse('2026-11-21T04:59:59Z')), '2026-11-20');
 assert.equal(estDay(Date.parse('2026-11-21T05:00:00Z')), '2026-11-21');
 assert.equal(addDays('2026-03-01', -1), '2026-02-28');
 assert.equal(percent(1), '100%');
 assert.equal(percent(9999/10000), '99.99%');
 assert.equal(percent(287/288), '99.65%');
 const rows: DailyCount[] = [
  {day:'2026-11-20', target_id:'a', state:'operational', samples:287}, {day:'2026-11-20', target_id:'a', state:'degraded', samples:1},
  {day:'2026-11-19', target_id:'a', state:'operational', samples:288}, {day:'2026-11-20', target_id:'b', state:'down', samples:2}
 ];
 const h = indexHistory(rows, '2026-11-20', 3)!;
 const a = track(h, ['a']);
 assert.deepEqual(a.days.map(d => d.state), ['none', 'operational', 'degraded']);
 assert.equal(a.days[2]?.label, 'Nov 20, 2026: 287 of 288 checks operational (1 degraded)');
 assert.equal(a.days[0]?.label, 'Nov 18, 2026: no checks recorded');
 assert.equal(a.uptime, '99.82%');
 assert.match(a.summary, /over 2 recorded days$/);
 assert.equal(track(h, ['a', 'b']).days[2]?.state, 'down');
 assert.equal(track(h, ['missing']).uptime, 'No data');
 assert.equal(indexHistory(null, '2026-11-20'), null);
 assert.deepEqual(segments(1, 3).filter(Boolean).length, 3);
 assert.deepEqual(segments(0, 0).filter(Boolean).length, 0);
 assert.equal(anchor('Network & access'), 'network-access');
 assert.equal(buildNext({checked:0, total:1, next_phase:null}), 'Open steps outside a numbered phase');
 assert.equal(buildNext({checked:2, total:2, next_phase:null}), 'Every step is checked');
 assert.equal(buildNext({checked:1, total:2, next_phase:'2.1 Next'}), 'Next: 2.1 Next');
});

test('overview shows sites with history bars; a history failure never fails the page', async () => {
 const site = service('operational', 'lorehallow-com'); site.target.name = 'Lorehallow'; site.target.group = 'Public websites';
 const game = service('down', 'lorehallow-game'); game.target.name = 'Lorehallow game server'; game.target.group = 'Public websites'; game.check.reason = 'connection refused';
 const evidence = snapshot([site, game]);
 const today = estDay(now);
 const rows: DailyCount[] = [{day: today, target_id: 'lorehallow-com', state: 'operational', samples: 12}];
 const provider: Source = {...source, latest: async () => evidence, history: async () => rows};
 const html = await (await handle(request('/'), provider, c, now)).text();
 const card = html.match(/<article class="site-card is-down" id="lorehallow">[\s\S]*?<\/article>/)?.[0] ?? '';
 assert.match(card, /Lorehallow game server<span class="sr-only">: down, connection refused/);
 assert.match(card, /<li class="day day-operational" title="[A-Z][a-z]{2} \d+, \d{4}: 12 of 12 checks operational"><\/li>/);
 assert.equal((card.match(/class="day /g) ?? []).length, 90);
 assert.match(html, /<meta http-equiv="refresh" content="300"\/?>/);
 const sitesView = sites(evidence);
 assert.equal(sitesView.find(p => p.id === 'daybyword')?.state, 'unknown');
 const broken = await handle(request('/'), {...provider, history: async () => { throw new Error('/private/path'); }}, c, now);
 assert.equal(broken.status, 200);
 const text = await broken.text();
 assert.match(text, /Daily history is unavailable right now/);
 assert.doesNotMatch(text, /private\/path/);
 const services = await (await handle(request('/services'), provider, c, now)).text();
 assert.match(services, /<section class="section service-group" id="public-websites"/);
 assert.match(services, /<td class="numeric">100%<\/td>/);
 assert.doesNotMatch(await (await handle(request('/incidents'), provider, c, now)).text(), /http-equiv="refresh"/);
});

test('overview counts the attention items it does not list, and certificates follow public websites', async () => {
 const failing = Array.from({length: attentionLimit + 2}, (_, i) => service(i === attentionLimit + 1 ? 'down' : 'degraded', 'check-' + i));
 const html = await (await handle(request('/'), {...source, latest: async () => snapshot(failing)}, c, now)).text();
 const panel = html.match(/<section class="overview-panel attention-panel"[\s\S]*?<\/section>/)?.[0] ?? '';
 assert.equal((panel.match(/<li>/g) ?? []).length, attentionLimit);
 // The most severe state is listed first, so truncation never hides an outage behind warnings.
 assert.match(panel, /<li><span class="state state-down">down<\/span><strong>check-7<\/strong>/);
 assert.match(panel, /Plus 2 more checks not shown here; every check is listed under <a href="\/services">all services<\/a>\./);
 const one = await (await handle(request('/'), {...source, latest: async () => snapshot(failing.slice(0, attentionLimit + 1))}, c, now)).text();
 assert.match(one, /Plus 1 more check not shown here/);
 const exact = await (await handle(request('/'), {...source, latest: async () => snapshot(failing.slice(0, attentionLimit))}, c, now)).text();
 assert.doesNotMatch(exact, /not shown here/);
 const grouped = (group: string, id: string) => { const s = service('operational', id); s.target.group = group; return s; };
 const names = categories(snapshot([grouped('Host capacity', 'a'), grouped('Public certificates', 'b'), grouped('Maintenance', 'c'), grouped('Public websites', 'd'), grouped('Unlisted', 'e')])).map(g => g.name);
 assert.deepEqual(names, ['Public websites', 'Public certificates', 'Maintenance', 'Host capacity', 'Unlisted']);
});

test('the external probe covers every catalogued public site', async () => {
 const script = await readFile('scripts/external-probe.py', 'utf8');
 const probed = [...(script.match(/^SITES = \(([\s\S]*?)^\)/m)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(m => m[1]);
 const catalogued = properties.flatMap(p => p.url ? [new URL(p.url).hostname] : []);
 assert.deepEqual([...probed].sort(), [...catalogued].sort());
});
