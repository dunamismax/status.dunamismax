export interface HttpTarget { id:string; name:string; publicUrl:string; probeUrl:string; expectedStatus:number; bodyToken?:string }
export interface UnitTarget {id:string; unit:string; group:string; oneShot?:boolean}
export interface ProjectTarget {id:string; repo:string; url:string|null; path:string}
export const httpTargets:HttpTarget[] = [
 ['dunamismax-com','dunamismax.com','/healthz'],['graceandfootnotes-com','graceandfootnotes.com','/'],['status-dunamismax-com','status.dunamismax.com','/healthz'],['xrayservice-net','xrayservice.net','/']
].map(([id,name,path])=>({id:id!,name:name!,publicUrl:'https://'+name,probeUrl:'https://'+name+path,expectedStatus:200}));
export const units:UnitTarget[] = [
 {id:'mtg-card-bot',unit:'mtg-card-bot.service',group:'Application services'},
 {id:'status-dunamismax-collector',unit:'astro-status-dunamismax-collector.timer',group:'Application services'},
 {id:'status-dunamismax-web',unit:'astro-status-dunamismax.service',group:'Application services'},
 {id:'postgresql',unit:'postgresql@18-main.service',group:'Databases'},
 ...['caddy','docker','containerd'].map(id=>({id,unit:id+'.service',group:'Host infrastructure'})),
 {id:'ssh',unit:'ssh.socket',group:'Network & access'},
 ...['tailscaled','fail2ban'].map(id=>({id,unit:id+'.service',group:'Network & access'})),
 ...['ufw','cloudflare-ddns'].map(id=>({id,unit:id+'.service',group:'Network & access',oneShot:true})),
 ...['server-disk-cleanup','rustdesk-preconfig-build','status-dunamismax-backup'].flatMap(id=>[{id,unit:id+'.service',group:'Maintenance',oneShot:true},{id:id+'-timer',unit:id+'.timer',group:'Maintenance'}])
];
export const projects=(root:string):ProjectTarget[] => [
 {id:'dunamismax-com',repo:'dunamismax.com',url:'https://dunamismax.com'}, {id:'mtg-card-bot',repo:'mtg-card-bot',url:null}, {id:'status-dunamismax',repo:'status.dunamismax',url:'https://status.dunamismax.com'},{id:'xrayservice',repo:'xrayservice',url:'https://xrayservice.net'}
].map(p=>({...p,path:root+'/'+p.repo}));
