export interface HttpTarget { id:string; name:string; publicUrl:string; probeUrl:string; expectedStatus:number; bodyToken?:string }
export interface UnitTarget {id:string; unit:string; group:string; oneShot?:boolean; maxAgeMinutes?:number}
export interface ProjectTarget {id:string; repo:string; url:string|null; path:string}
export const httpTargets:HttpTarget[] = [
 ['dunamismax-com','dunamismax.com','/healthz'],['graceandfootnotes-com','graceandfootnotes.com','/'],['status-dunamismax-com','status.dunamismax.com','/healthz'],['xrayservice-net','xrayservice.net','/'],['imagingservices-demo','demo.xrayservice.net','/']
].map(([id,name,path])=>({id:id!,name:name!,publicUrl:'https://'+name,probeUrl:'https://'+name+path,expectedStatus:200}));
export const units:UnitTarget[] = [
 {id:'mtg-card-bot',unit:'mtg-card-bot.service',group:'Application services'},
 {id:'status-dunamismax-collector',unit:'astro-status-dunamismax-collector.timer',group:'Application services'},
 {id:'status-dunamismax-web',unit:'astro-status-dunamismax.service',group:'Application services'},
 ...['dunamismax','graceandfootnotes','imagingservices'].map(id=>({id:'astro-'+id,unit:'astro-'+id+'.service',group:'Application services'})),
 {id:'collector-run',unit:'astro-status-dunamismax-collector.service',group:'Application services',oneShot:true,maxAgeMinutes:15},
 {id:'ddns-timer',unit:'astro-cloudflare-ddns.timer',group:'Network & access'},
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
