import { cfromthegroundupHealth, contractHealth, imagingHealth, installerRange, rivermindHealth, type HttpEvidence } from './http-evidence.js';

export interface HttpTarget { id:string; name:string; publicUrl:string; probeUrl:string; expectedStatus:number; bodyToken?:string; evidence?:HttpEvidence; range?:string }
export interface UnitTarget {id:string; unit:string; group:string; oneShot?:boolean; maxAgeMinutes?:number}
/** `release` is the directory whose REVISION file names the commit a site is serving. */
export interface ProjectTarget {id:string; repo:string; url:string|null; path:string; release?:string}
const existingSites = [
 ['dunamismax-com','dunamismax.com','/healthz'],['graceandfootnotes-com','graceandfootnotes.com','/'],['status-dunamismax-com','status.dunamismax.com','/healthz'],['xrayservice-net','xrayservice.net','/']
].map(([id,name,path])=>({id:id!,name:name!,publicUrl:'https://'+name,probeUrl:'https://'+name+path,expectedStatus:200}));
export const httpTargets:HttpTarget[] = [
 ...existingSites,
 {id:'imagingservices-demo',name:'demo.xrayservice.net',publicUrl:'https://demo.xrayservice.net',probeUrl:'https://demo.xrayservice.net/healthz',expectedStatus:200,evidence:imagingHealth},
 {id:'fieldcadence-app',name:'Field Cadence',publicUrl:'https://fieldcadence.app/',probeUrl:'https://fieldcadence.app/healthz',expectedStatus:200,evidence:contractHealth},
 {id:'xrayservice-installer',name:'XrayService Windows installer',publicUrl:'https://xrayservice.net/download',probeUrl:'https://xrayservice.net/download',expectedStatus:206,evidence:installerRange,range:'bytes=0-1'},
 {id:'xrayservice-data',name:'XrayService email assets',publicUrl:'https://data.xrayservice.net/robots.txt',probeUrl:'https://data.xrayservice.net/robots.txt',expectedStatus:200,bodyToken:'User-agent:'},
 {id:'cfromthegroundup-com',name:'C From The Ground Up',publicUrl:'https://cfromthegroundup.com/',probeUrl:'https://cfromthegroundup.com/healthz',expectedStatus:200,evidence:cfromthegroundupHealth},
 {id:'cfromthegroundup-analytics',name:'C From The Ground Up analytics',publicUrl:'https://cfromthegroundup.com/',probeUrl:'https://cfromthegroundup.com/stats/script.js',expectedStatus:200,bodyToken:'/api/send'},
 {id:'daybyword-com',name:'Day by Word',publicUrl:'https://daybyword.com/',probeUrl:'https://daybyword.com/healthz',expectedStatus:200,evidence:contractHealth},
 {id:'rivermindpoker-com',name:'RiverMind Poker',publicUrl:'https://rivermindpoker.com/',probeUrl:'https://rivermindpoker.com/healthz',expectedStatus:200,evidence:rivermindHealth},
 {id:'rivermindpoker-api',name:'RiverMind Poker table server',publicUrl:'https://rivermindpoker.com/',probeUrl:'https://rivermindpoker.com/api/config',expectedStatus:200,bodyToken:'"seat_counts":'},
 {id:'vincentsawyer-org',name:'vincentsawyer.org',publicUrl:'https://vincentsawyer.org/',probeUrl:'https://vincentsawyer.org/',expectedStatus:200,bodyToken:'<link rel="canonical" href="https://vincentsawyer.org/"'}
];
// Hosts that only redirect to their site. Caddy holds a separate certificate for
// each, so each gets its own certificate check.
export const redirectHosts:string[] = ['cfromthegroundup.com','daybyword.com','dunamismax.com','fieldcadence.app','graceandfootnotes.com','rivermindpoker.com','vincentsawyer.org','xrayservice.net'].map(host=>'www.'+host);
/** Every public host name served here: the probed ones first, then the redirect-only ones. */
export const certificateHosts=():string[] => [...new Set([...httpTargets.flatMap(t=>[new URL(t.publicUrl).hostname,new URL(t.probeUrl).hostname]),...redirectHosts])];
// Daily jobs must have succeeded within 26 hours; the weekly installer build
// within eight days and the monthly Day by Word restore drill within 32 days.
const maxAge:Record<string,number> = {'rustdesk-preconfig-build':8*24*60,'daybyword-restore-check':32*24*60,'media-backup-verify':37*24*60};
export const units:UnitTarget[] = [
 {id:'mtg-card-bot',unit:'mtg-card-bot.service',group:'Application services'},
 {id:'status-dunamismax-collector',unit:'status-dunamismax-collector.timer',group:'Application services'},
 {id:'status-dunamismax-web',unit:'status-dunamismax.service',group:'Application services'},
 // RiverMind Poker is two units: rivermind-poker-web has served the pages, the API and the
 // tables since its 2026-11-21 cutover, and rivermind-poker-voice relays table voice (it has
 // no public HTTP health route, so its unit is its evidence). Day by Word and Field Cadence
 // left Docker Compose for host units on 2026-11-21.
 ...['dunamismax','graceandfootnotes','imagingservices','xrayservice-web','vincentsawyer-web','cfromthegroundup','daybyword-web','fieldcadence','rivermind-poker-web','rivermind-poker-voice','umami'].map(id=>({id,unit:id+'.service',group:'Application services'})),
 {id:'collector-run',unit:'status-dunamismax-collector.service',group:'Application services',oneShot:true,maxAgeMinutes:15},
 {id:'ddns-timer',unit:'cloudflare-ddns.timer',group:'Network & access'},
 {id:'postgresql',unit:'postgresql@18-main.service',group:'Databases'},
 ...['caddy','docker','containerd'].map(id=>({id,unit:id+'.service',group:'Host infrastructure'})),
 {id:'ssh',unit:'ssh.socket',group:'Network & access'},
 ...['tailscaled','fail2ban'].map(id=>({id,unit:id+'.service',group:'Network & access'})),
 {id:'ufw',unit:'ufw.service',group:'Network & access',oneShot:true},
 ...['server-disk-cleanup','rustdesk-preconfig-build','status-dunamismax-backup','dunamismax-backup','graceandfootnotes-backup','rustdesk-backup','ubuntu-vm-backup','cfromthegroundup-backup','vincentsawyer-backup','daybyword-backup','daybyword-restore-check','media-backup','media-backup-verify'].flatMap(id=>[{id,unit:id+'.service',group:'Maintenance',oneShot:true,maxAgeMinutes:maxAge[id]??26*60},{id:id+'-timer',unit:id+'.timer',group:'Maintenance'}]),
 // The daily comparison of the custom Caddy build with upstream writes no completion record, so only its timer is a check.
 {id:'caddy-release-check-timer',unit:'caddy-release-check.timer',group:'Maintenance'}
];
// Where each deployed site keeps its serving release. The git probe reads only its
// REVISION file, to say what is deployed beside what the working checkout holds.
const releases:Record<string,string> = {'dunamismax-com':'/srv/www/dunamismax.com','status-dunamismax':'/srv/www/status.dunamismax.com','xrayservice':'/srv/www/xrayservice.net','graceandfootnotes-com':'/srv/www/graceandfootnotes.com','imagingservices':'/srv/www/demo.xrayservice.net','c-from-the-ground-up':'/srv/www/cfromthegroundup.com','daybyword':'/srv/www/daybyword.com','rivermind-poker':'/srv/rivermindpoker.com','vincentsawyer-org':'/srv/www/vincentsawyer.org','fieldcadence':'/srv/www/fieldcadence.app'};
export const projects=(root:string):ProjectTarget[] => [
 {id:'dunamismax-com',repo:'dunamismax.com',url:'https://dunamismax.com'}, {id:'mtg-card-bot',repo:'mtg-card-bot',url:null}, {id:'status-dunamismax',repo:'status.dunamismax',url:'https://status.dunamismax.com'},{id:'xrayservice',repo:'xrayservice',url:'https://xrayservice.net'}
,{id:'graceandfootnotes-com',repo:'graceandfootnotes.com',url:'https://graceandfootnotes.com'},{id:'imagingservices',repo:'imagingservices',url:'https://demo.xrayservice.net'}
,{id:'c-from-the-ground-up',repo:'c-from-the-ground-up',url:'https://cfromthegroundup.com'}
,{id:'daybyword',repo:'daybyword',url:'https://daybyword.com'},{id:'rivermind-poker',repo:'rivermind-poker',url:'https://rivermindpoker.com'},{id:'vincentsawyer-org',repo:'vincentsawyer.org',url:'https://vincentsawyer.org'}
,{id:'ubuntu-vm-backup',repo:'ubuntu-vm-backup',url:null},{id:'fieldcadence',repo:'fieldcadence',url:'https://fieldcadence.app'}
].map(p=>({...p,path:root+'/'+p.repo,...(releases[p.id]?{release:releases[p.id]+'/current'}:{})}));
