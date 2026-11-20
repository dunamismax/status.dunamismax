import { azerothStatus, installerRange, lorehallowHealth, type HttpEvidence } from './http-evidence.js';

export interface HttpTarget { id:string; name:string; publicUrl:string; probeUrl:string; expectedStatus:number; bodyToken?:string; evidence?:HttpEvidence; range?:string }
export interface UnitTarget {id:string; unit:string; group:string; oneShot?:boolean; maxAgeMinutes?:number}
export interface ProjectTarget {id:string; repo:string; url:string|null; path:string}
const existingSites = [
 ['dunamismax-com','dunamismax.com','/healthz'],['graceandfootnotes-com','graceandfootnotes.com','/'],['status-dunamismax-com','status.dunamismax.com','/healthz'],['xrayservice-net','xrayservice.net','/'],['imagingservices-demo','demo.xrayservice.net','/']
].map(([id,name,path])=>({id:id!,name:name!,publicUrl:'https://'+name,probeUrl:'https://'+name+path,expectedStatus:200}));
export const httpTargets:HttpTarget[] = [
 ...existingSites,
 {id:'azerothtrail-com',name:'Azeroth Trail',publicUrl:'https://azerothtrail.com/',probeUrl:'https://azerothtrail.com/',expectedStatus:200,bodyToken:'<title>Azeroth Trail</title>'},
 {id:'azerothtrail-status-api',name:'Azeroth Trail tracker',publicUrl:'https://azerothtrail.com/status/',probeUrl:'https://azerothtrail.com/api/status',expectedStatus:200,evidence:azerothStatus},
 {id:'lorehallow-com',name:'Lorehallow',publicUrl:'https://lorehallow.com/',probeUrl:'https://lorehallow.com/',expectedStatus:200,bodyToken:'<link rel="canonical" href="https://lorehallow.com/">'},
 {id:'lorehallow-game',name:'Lorehallow game server',publicUrl:'https://lorehallow.com/play/',probeUrl:'https://play.lorehallow.com/healthz',expectedStatus:200,evidence:lorehallowHealth},
 {id:'xrayservice-installer',name:'XrayService Windows installer',publicUrl:'https://xrayservice.net/download',probeUrl:'https://xrayservice.net/download',expectedStatus:206,evidence:installerRange,range:'bytes=0-1'}
];
export const units:UnitTarget[] = [
 {id:'mtg-card-bot',unit:'mtg-card-bot.service',group:'Application services'},
 {id:'status-dunamismax-collector',unit:'status-dunamismax-collector.timer',group:'Application services'},
 {id:'status-dunamismax-web',unit:'status-dunamismax.service',group:'Application services'},
 ...['dunamismax','graceandfootnotes','imagingservices','xrayservice-web','vincentsawyer-web','azerothtrail','cfromthegroundup','rivermind-poker'].map(id=>({id,unit:id+'.service',group:'Application services'})),
 {id:'collector-run',unit:'status-dunamismax-collector.service',group:'Application services',oneShot:true,maxAgeMinutes:15},
 {id:'ddns-timer',unit:'cloudflare-ddns.timer',group:'Network & access'},
 {id:'postgresql',unit:'postgresql@18-main.service',group:'Databases'},
 ...['caddy','docker','containerd'].map(id=>({id,unit:id+'.service',group:'Host infrastructure'})),
 {id:'ssh',unit:'ssh.socket',group:'Network & access'},
 ...['tailscaled','fail2ban'].map(id=>({id,unit:id+'.service',group:'Network & access'})),
 {id:'ufw',unit:'ufw.service',group:'Network & access',oneShot:true},
 ...['server-disk-cleanup','rustdesk-preconfig-build','status-dunamismax-backup','dunamismax-backup','graceandfootnotes-backup','rustdesk-backup','ubuntu-vm-backup'].flatMap(id=>[{id,unit:id+'.service',group:'Maintenance',oneShot:true,maxAgeMinutes:id==='rustdesk-preconfig-build'?8*24*60:26*60},{id:id+'-timer',unit:id+'.timer',group:'Maintenance'}])
];
export const projects=(root:string):ProjectTarget[] => [
 {id:'dunamismax-com',repo:'dunamismax.com',url:'https://dunamismax.com'}, {id:'mtg-card-bot',repo:'mtg-card-bot',url:null}, {id:'status-dunamismax',repo:'status.dunamismax',url:'https://status.dunamismax.com'},{id:'xrayservice',repo:'xrayservice',url:'https://xrayservice.net'}
,{id:'graceandfootnotes-com',repo:'graceandfootnotes.com',url:'https://graceandfootnotes.com'},{id:'imagingservices',repo:'imagingservices',url:'https://demo.xrayservice.net'}
].map(p=>({...p,path:root+'/'+p.repo}));
