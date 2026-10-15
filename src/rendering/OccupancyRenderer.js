import {showPresentation,mmss} from '../core/PresentationState.js';
import {singleRecommendation} from '../systems/AdmissionSystem.js';
import {VisitorVisualPool,individualBoardingProgress} from './VisitorVisualPool.js';
const NS='http://www.w3.org/2000/svg';
const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
export const ROOMS={standard:{label:'STANDARD',x:12,y:18,w:326,h:94},fast:{label:'FAST PASS',x:12,y:118,w:326,h:94},single:{label:'SINGLE RIDER',x:12,y:218,w:326,h:94},preshow:{label:'PRÉSHOW',x:360,y:18,w:288,h:294},lockers:{label:'CASIERS',x:666,y:18,w:222,h:294},'SEC-01':{label:'SÉCURITÉ A',x:906,y:18,w:130,h:294},'SEC-02':{label:'SÉCURITÉ B',x:1054,y:18,w:134,h:294},ready:{label:'ATTENTE',x:12,y:334,w:540,h:84},singleReady:{label:'SINGLE RIDER',x:12,y:428,w:540,h:60},boarding:{label:'EMBARQUEMENT',x:570,y:334,w:618,h:154},unloading:{label:'DÉBARQUEMENT',x:12,y:510,w:390,h:78},retrieval:{label:'RÉCUPÉRATION',x:420,y:510,w:390,h:78},exit:{label:'SORTIE',x:828,y:510,w:360,h:78}};
const center=k=>{const r=ROOMS[k];return [r.x+r.w/2,r.y+r.h/2];};
const doors={standard:[338,84],fast:[338,184],single:[338,284],preshow:[648,280],lockers:[888,280],'SEC-01':[971,312],'SEC-02':[1121,312],ready:[552,390],singleReady:[552,456],boarding:[570,390],unloading:[402,554],retrieval:[810,554],exit:[1188,554]};
const entries={preshow:[360,280],lockers:[666,280],'SEC-01':[906,280],'SEC-02':[1054,280],ready:[12,374],singleReady:[12,456],boarding:[570,390],retrieval:[420,554],exit:[828,554]};
const links=[['standard','preshow'],['fast','preshow'],['single','preshow'],['preshow','lockers'],['lockers','SEC-01'],['lockers','SEC-02'],['SEC-01','ready'],['SEC-02','singleReady'],['ready','boarding'],['singleReady','boarding'],['unloading','retrieval'],['retrieval','exit']];
const visualCaps={standard:32,fast:32,single:32,preshow:42,lockers:15,'SEC-01':12,'SEC-02':12,ready:52,singleReady:30,boarding:20,unloading:24,retrieval:24,exit:24};
function route(from,to){
 const a=doors[from]||center(from),b=entries[to]||center(to);
 if(['standard','fast','single'].includes(from))return [a,[349,a[1]],[349,b[1]],b];
 if(from.startsWith('SEC-'))return [a,[a[0],324],[5,324],[5,b[1]],b];
 if(from==='lockers'&&to==='SEC-02')return [a,[897,280],[897,324],[1045,324],[1045,280],b];
 if(from==='singleReady'&&to==='boarding')return [a,[570,456]];
 return [a,[b[0],a[1]],b];
}
function along(points,t){const lens=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));let d=Math.max(0,Math.min(1,t))*lens.reduce((a,b)=>a+b,0);for(let i=0;i<lens.length;i++){if(d<=lens[i]||i===lens.length-1){const f=lens[i]?d/lens[i]:1;return points[i].map((v,j)=>v+(points[i+1][j]-v)*f);}d-=lens[i];}return points.at(-1);}
export function roomPopulation(s){
 const prepared=new Map((s.station.prepared||[]).map(p=>[p.id,p.slot]));
 const zones=Object.fromEntries(Object.keys(ROOMS).map(k=>[k,[]])),transits=[],posts=new Map(s.flow.security.stations.map(p=>[p.visitorId,p.id]));
 const zoneFor=(stage,p)=>stage==='queue'?p.lane:stage==='security'?(posts.get(p.id)||`SEC-0${p.id%2+1}`):stage==='ready'&&p.lane==='single'?'singleReady':stage;
 for(const p of s.flow.people){if(p.transit){transits.push({id:p.id,lane:p.lane,from:zoneFor(p.transit.from,p),to:zoneFor(p.transit.to,p),t:1-p.transit.remaining/p.transit.duration});}else if(prepared.has(p.id))zones.boarding.push({...p,prepared:true,seat:prepared.get(p.id)});else zones[zoneFor(p.stage,p)]?.push(p);}
 const train=s.trains.find(t=>t.blockId==='LOAD'&&t.progress>=1&&t.state!=='GARAGING');
 for(const [seat,id]of (train?.passengerIds||[]).entries())zones.boarding.push({id,seat});
 for(const id of train?.boardingIds||[])transits.push({id,lane:s.score.journeys[id]?.lane,from:'boarding',to:'boarding',seat:train.passengers+train.boardingIds.indexOf(id),t:individualBoardingProgress(train,id)});
 for(const t of s.trains)if(t.blockId==='UNLOAD'&&t.progress>=1)for(const id of t.passengerIds)zones.unloading.push({id});
 for(const p of s.flow.egress)if(p.stage==='retrieval')zones.retrieval.push(p);else transits.push({id:p.id,from:p.stage==='unloading'?'unloading':'retrieval',to:p.stage==='unloading'?'retrieval':'exit',t:1-p.remaining/s.flow.room.travelDuration});
 return {zones,transits};
}
const preparedPoint=i=>[620+Math.floor(i/2)*55,464+i%2*17];
const seatPoint=i=>[620+Math.floor(i/2)*55,400+i%2*28];
// Local reusable scenery; no image assets, simulation state or per-person filters.
function sceneryDefs(){return `
 <pattern id="floor-brick" width="36" height="20" patternUnits="userSpaceOnUse"><rect width="36" height="20" fill="#63412f"/><path d="M0 1H36M0 11H36M18 1V11M0 11V20M36 11V20" stroke="#2d241f" stroke-width="2"/><path d="M2 3H16M20 13H34" stroke="#ad7751" opacity=".3"/></pattern>
 <pattern id="floor-grain" width="30" height="24" patternUnits="userSpaceOnUse"><rect width="30" height="24" fill="#4a4841"/><path d="M0 0H30V24H0ZM0 4H30M3 0V24" fill="none" stroke="#211f1b" stroke-width="1"/><path d="M7 8L12 6M20 17L26 16" stroke="#a28a63" opacity=".22"/></pattern>
 <pattern id="platform-hatch" width="18" height="14" patternUnits="userSpaceOnUse"><path d="M-6 14L8 0M12 14L26 0" stroke="#d4aa55" stroke-width="5"/></pattern>
 <linearGradient id="wall-face" x2="0" y2="1"><stop stop-color="#8b6042"/><stop offset=".35" stop-color="#493326"/><stop offset="1" stop-color="#201c18"/></linearGradient>
 <linearGradient id="locker-metal" x2="1" y2=".6"><stop stop-color="#9b8c70"/><stop offset=".4" stop-color="#6c6657"/><stop offset="1" stop-color="#373e3b"/></linearGradient>
 <linearGradient id="screen-sky" x2="0" y2="1"><stop stop-color="#172d43"/><stop offset=".55" stop-color="#bf7750"/><stop offset="1" stop-color="#e2af67"/></linearGradient>
 <radialGradient id="room-warm"><stop stop-color="#ffc46f" stop-opacity=".36"/><stop offset="1" stop-color="#ed922e" stop-opacity="0"/></radialGradient>
 <symbol id="wall-lamp" viewBox="-22 -25 44 70"><ellipse cy="15" rx="22" ry="30" fill="url(#room-warm)"/><path d="M0-12V-20H8" fill="none" stroke="#282c29" stroke-width="4"/><rect x="-5" y="-10" width="10" height="20" rx="4" fill="#ffce79" stroke="#946139" stroke-width="2"/><path d="M-7-10H7M-7 10H7M0-10V10" stroke="#473323" stroke-width="2"/></symbol>
 <symbol id="locker-front" viewBox="0 0 34 44"><rect x="2" y="3" width="32" height="41" fill="#171e1c"/><rect x="1" y="1" width="30" height="40" rx="2" fill="url(#locker-metal)" stroke="#b3a184"/><path d="M5 7H14M5 10H14M5 13H14" stroke="#343d37"/><path d="M25 22V30" stroke="#dfc598" stroke-width="2"/><circle cx="25" cy="19" r="1.2" fill="#75bba6"/><circle cx="5" cy="36" r="1" fill="#d9c39c"/></symbol>
 <symbol id="flow-person" viewBox="-6 -16 12 21"><ellipse cy="3" rx="5" ry="2" fill="#080d0d" opacity=".55"/><path d="M-2-3L-3 3M2-3L3 3" stroke="#222a2d" stroke-width="2.3"/><path d="M-4-9Q0-12 4-9L3-2H-3Z" stroke="#172325" stroke-width=".6"/><path d="M-4-8L-5-3M4-8L5-3" stroke="#dfb78d" stroke-width="1.5"/><circle cy="-13" r="2.8" fill="#dfb78d"/><path d="M-2-15Q0-18 3-14" stroke="#302821" stroke-width="2" fill="none"/></symbol>`;}
function interior(group,key,r){
 const rect=(x,y,w,h,cl,extra={})=>group.append(el('rect',{x:r.x+x,y:r.y+y,width:w,height:h,class:cl,...extra}));
 const path=(d,cl,extra={})=>group.append(el('path',{d,class:cl,...extra}));
 const lamp=(x,y)=>group.append(el('use',{href:'#wall-lamp',x:r.x+x-20,y:r.y+y-22,width:40,height:64,class:'room-lamp'}));
 rect(5,10,r.w,r.h,'room-shadow',{rx:3});rect(5,9,r.w-10,r.h-12,'room-floor');
 const mask=el('mask',{id:`room-cut-${key}`,maskUnits:'userSpaceOnUse',x:r.x-15,y:r.y-15,width:r.w+30,height:r.h+40});mask.append(el('rect',{x:r.x-15,y:r.y-15,width:r.w+30,height:r.h+40,fill:'white'}));
 const ports=[doors[key],entries[key],...(key==='boarding'?[[570,456]]:[])].filter(Boolean);
 for(const [x,y]of ports)mask.append(el('rect',{x:x-16,y:y-17,width:32,height:34,fill:'black'}));
 group.append(mask);const walls=el('g',{mask:`url(#room-cut-${key})`,class:'cutaway-walls'});
 walls.append(el('rect',{x:r.x,y:r.y,width:r.w,height:37,fill:'url(#floor-brick)'}),el('path',{d:`M${r.x} ${r.y}V${r.y+r.h}H${r.x+r.w}V${r.y}M${r.x+8} ${r.y+36}V${r.y+r.h-8}H${r.x+r.w-8}V${r.y+36}`,fill:'none',stroke:'#312821','stroke-width':13}),el('path',{d:`M${r.x} ${r.y}H${r.x+r.w}M${r.x+3} ${r.y+3}V${r.y+r.h-3}H${r.x+r.w-3}`,fill:'none',stroke:'#b19b75','stroke-width':3}),el('path',{d:`M${r.x} ${r.y+r.h}v8h${r.w}v-8`,fill:'url(#wall-face)',stroke:'#171b18','stroke-width':2}));group.append(walls);
 for(const [x,y]of ports)group.append(el('rect',{x:x-10,y:y-12,width:20,height:24,fill:'url(#floor-grain)',class:'door-opening'}));
 if(['standard','fast','single'].includes(key)){
  path(`M${r.x+21} ${r.y+65}H${r.x+216}Q${r.x+231} ${r.y+65} ${r.x+231} ${r.y+75}Q${r.x+231} ${r.y+85} ${r.x+216} ${r.y+85}H${r.x+21}`,'queue-rail-shadow');
  path(`M${r.x+21} ${r.y+61}H${r.x+216}Q${r.x+231} ${r.y+61} ${r.x+231} ${r.y+71}Q${r.x+231} ${r.y+81} ${r.x+216} ${r.y+81}H${r.x+21}`,'queue-rail');
  for(let i=0;i<7;i++)for(const y of [61,81]){const x=r.x+22+i*32;path(`M${x} ${r.y+y}v8`,'rail-post');}
  rect(239,41,9,25,'entry-reader',{rx:2});rect(240,44,7,6,'reader-light',{rx:1});lamp(310,27);
 }
 if(key==='preshow'){
  rect(22,76,r.w-44,61,'screen-frame',{rx:3});rect(28,81,r.w-56,48,'show-screen',{fill:'url(#screen-sky)',rx:1});
  path(`M${r.x+28} ${r.y+124}l28-17 22 8 35-22 31 26 27-11 35 16 26-19 28 19v5H${r.x+28}Z`,'screen-silhouette');
  path(`M${r.x+123} ${r.y+102}l-28-13 15 23 13-5 13 5 16-23-29 13v18`,'screen-wing');
  group.append(el('text',{x:r.x+r.w/2,y:r.y+186,'text-anchor':'middle',class:'floor-emblem'},'F.L.Y.'));lamp(12,96);lamp(r.w-12,96);
 }
 if(key==='lockers'){
  for(let row=0;row<3;row++){rect(15,75+row*52,r.w-30,46,'locker-backing');for(let col=0;col<5;col++)group.append(el('use',{href:'#locker-front',x:r.x+19+col*37,y:r.y+74+row*52,width:34,height:44}));}
  lamp(r.w-17,49);rect(26,237,r.w-52,10,'room-bench',{rx:2});
 }
 if(key.startsWith('SEC-')){
  const x=r.x+27,y=r.y+82,w=r.w-54;
  path(`M${x+7} ${y+135}V${y+7}H${x+w+7}V${y+135}`,'scanner-depth');path(`M${x} ${y+132}V${y}H${x+w}V${y+132}`,'scanner-arch');
  rect(29,84,r.w-58,12,'scanner-header');for(let i=0;i<3;i++)group.append(el('circle',{cx:x+14+i*17,cy:y+5,r:3,class:'reader-light'}));
  rect(18,225,r.w-36,19,'security-desk',{rx:2});rect(24,218,20,12,'desk-monitor',{rx:2});path(`M${x+18} ${y+104}l24 9m-12-5v18`,'turnstile');lamp(r.w-13,48);
 }
 if(['ready','singleReady'].includes(key)){const yy=r.y+r.h-12;path(`M${r.x+20} ${yy}H${r.x+r.w-130}`,'queue-rail');for(let i=0;i<10;i++)path(`M${r.x+22+i*38} ${yy}v6`,'rail-post');lamp(r.w-20,30);}
 if(key==='boarding'){
  rect(25,112,r.w-50,26,'station-platform');rect(30,111,r.w-60,6,'platform-warning',{fill:'url(#platform-hatch)'});
  rect(29,48,r.w-57,65,'train-chassis',{rx:11});
  for(const y of [58,104])path(`M${r.x+15} ${r.y+y}H${r.x+r.w-14}`,'train-rail');
  for(let car=0;car<10;car++){const x=r.x+50+car*55;group.append(el('rect',{x:x-23,y:r.y+50,width:47,height:61,rx:6,class:'train-car'}));for(const y of [r.y+53,r.y+106])group.append(el('circle',{cx:x,cy:y,r:4,class:'train-wheel'}));}
  for(let i=0;i<20;i++){const [x,y]=seatPoint(i);group.append(el('rect',{x:x-14,y:y-12,width:28,height:23,rx:6,class:'plan-seat','data-plan-seat':i}),el('path',{d:`M${x-9} ${y-7}v12h18V${y-7}M${x-3} ${y-9}v13m6-13v13`,class:'seat-restraint'}));}
  for(let i=0;i<6;i++){const x=r.x+65+i*92;path(`M${x} ${r.y+128}h20m-5-5 5 5-5 5`,'platform-arrow');}lamp(22,31);lamp(r.w-20,31);
 }
 if(['unloading','retrieval','exit'].includes(key)){
  path(`M${r.x+20} ${r.y+64}H${r.x+r.w-25}`,'return-route');for(let i=0;i<3;i++){const x=r.x+100+i*95;path(`M${x} ${r.y+64}l-6-4m6 4-6 4`,'platform-arrow');}
  if(key==='retrieval')for(let i=0;i<8;i++)group.append(el('use',{href:'#locker-front',x:r.x+25+i*43,y:r.y+37,width:24,height:30}));
  if(key==='unloading'){rect(26,46,r.w-70,6,'train-rail');rect(26,67,r.w-70,3,'platform-warning',{fill:'url(#platform-hatch)'});}
  if(key==='exit'){rect(r.w-52,33,22,28,'exit-portal');path(`M${r.x+r.w-47} ${r.y+43}h12m-4-4 4 4-4 4`,'exit-arrow');}lamp(r.w-20,22);
 }
}
// Recompute scenery coordinates in CSS pixels; text, people and controls keep
// their own dimensions. No SVG/group transform or non-uniform SVG viewport.
function projectPath(path,x,y,sx,sy){
 const tokens=path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
 const counts={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7,Z:0};let command='M',index=0;
 return tokens.map(token=>{if(/^[a-zA-Z]$/.test(token)){command=token;index=0;return token;}const upper=command.toUpperCase(),relative=command!==upper,slot=index++%(counts[upper]||1),value=Number(token);let axis=upper==='H'?'x':upper==='V'?'y':slot%2?'y':'x';if(upper==='A'){if(slot===0)return value*sx;if(slot===1)return value*sy;if(slot<5)return value;axis=slot===5?'x':'y';}return Math.round((relative?value*(axis==='x'?sx:sy):(axis==='x'?x(value):y(value)))*100)/100;}).join(' ');
}
export class OccupancyRenderer {
 constructor(container,onSelect,onCommand){
  this.nodes=new Map();this.onCommand=onCommand;this.lastTime=null;
  this.svg=el('svg',{viewBox:'0 0 1200 600',preserveAspectRatio:'xMidYMid meet',role:'group','aria-label':'Plan industriel interactif des visiteurs'});container.append(this.svg);
  const defs=el('defs');defs.innerHTML=sceneryDefs();this.svg.append(defs);
  const halls=el('g',{class:'floor-halls','aria-hidden':true});for(const [a,b]of links)halls.append(el('polyline',{points:route(a,b).map(p=>p.join(',')).join(' ')}));this.svg.append(halls);
  for(const [key,r]of Object.entries(ROOMS)){
   const group=el('g',{'data-room':key,role:'group',class:`floor-room ${key}`,'aria-label':r.label});interior(group,key,r);
   const plate=el('rect',{x:r.x+12,y:r.y+8,width:r.w-24,height:27,rx:2,class:'room-plate'}),label=el('text',{x:r.x+21,y:r.y+27,class:'floor-name'},r.label),count=el('text',{x:r.x+r.w-21,y:r.y+27,'text-anchor':'end',class:'floor-count'}),title=el('title');
   group.append(plate,label,count,title);const choose=()=>onSelect(key);if(key==='boarding')group.addEventListener('click',choose);plate.setAttribute('role','button');plate.setAttribute('tabindex','0');plate.setAttribute('aria-label',key==='boarding'?'Agrandir embarquement':`Commandes ${r.label}`);plate.addEventListener('click',choose);plate.addEventListener('keydown',e=>{if(e.key==='Enter'){e.stopPropagation();choose();}});label.style.pointerEvents='none';count.style.pointerEvents='none';
   const incoming=el('text',{x:r.x+22,y:r.y+70,class:'room-transit'});
   const [dx,dy]=doors[key],horizontal=key.startsWith('SEC-');const door=el('line',{x1:dx-(horizontal?12:0),y1:dy-(horizontal?0:12),x2:dx+(horizontal?12:0),y2:dy+(horizontal?0:12),class:'threshold-door'});group.append(door);this.svg.append(group);this.nodes.set(key,{group,count,title,door,incoming,controls:[]});
  }
  this.layer=el('g',{'aria-hidden':true,class:'floor-people'});this.svg.append(this.layer);
  this.pool=new VisitorVisualPool(()=>el('use',{href:'#flow-person',width:12,height:21}),node=>node.remove());
  const button=(zone,x,y,width,label,action,enabled=()=>true)=>{
   const r=ROOMS[zone],g=el('g',{role:'button',tabindex:0,class:'floor-command'}),rect=el('rect',{x:r.x+x,y:r.y+y,width,height:27,rx:5}),text=el('text',{x:r.x+x+width/2,y:r.y+y+18,'text-anchor':'middle'});g.append(rect,text);this.svg.append(g);
   const run=e=>{e.stopPropagation();if(g.getAttribute('aria-disabled')!=='true')action(this.state);};g.addEventListener('click',run);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run(e);}});this.nodes.get(zone).controls.push({g,text,label,enabled});return g;
  };
  const cmd=(type,payload={})=>onCommand(type,payload);
  for(const lane of ['standard','fast','single'])button(lane,252,51,63,s=>s.flow.lanes[lane].open?'Fermer':'Ouvrir',s=>cmd('SET_LANE',{lane,field:'open',value:!s.flow.lanes[lane].open}));
  button('preshow',14,264,122,s=>s.flow.preshow.entranceOpen?'Fermer entrée':'Ouvrir entrée',s=>cmd(s.flow.preshow.entranceOpen?'PRESHOW_CLOSE':'PRESHOW_OPEN'),s=>s.open&&['CLOSED','FILLING','FULL'].includes(s.flow.preshow.state));
  button('preshow',148,264,126,s=>s.flow.preshow.exitOpen?'Fermer sortie':'Ouvrir sortie',s=>cmd(s.flow.preshow.state==='EXITING'?(s.flow.preshow.exitOpen?'PRESHOW_EXIT_CLOSE':'PRESHOW_EXIT_RESUME'):'PRESHOW_EXIT'),s=>['FINISHED','EXITING'].includes(s.flow.preshow.state));
  button('preshow',14,218,122,()=> '▶ Lancer',()=>cmd('PRESHOW_START'),s=>s.flow.preshow.state==='READY');
  button('preshow',148,218,126,s=>`Ajouter ${singleRecommendation(s).count}`,()=>cmd('ADD_SINGLE_COMPLEMENT'),s=>s.flow.preshow.state==='FILLING'&&singleRecommendation(s).count>0);
  this.platformReadout=el('text',{x:596,y:380,class:'platform-readout'});this.svg.append(this.platformReadout);
  const slots=el('g',{'aria-hidden':true});for(let i=0;i<20;i++){const [x,y]=preparedPoint(i);slots.append(el('rect',{x:x-9,y:y-14,width:18,height:16,rx:2,class:'prepared-slot'}));if(i%2===0)slots.append(el('text',{x:x+14,y:476,class:'prepared-row-label'},String(i/2+1)));}this.layer.before(slots);
  this.showTimer=el('text',{x:382,y:73,class:'preshow-timer'});const track=el('rect',{x:382,y:80,width:244,height:12,rx:3,class:'show-progress-track'});this.svg.append(track);this.showBar=el('rect',{x:382,y:80,width:0,height:12,rx:3,class:'show-progress'});this.advice=el('text',{x:382,y:228,class:'single-advice'});this.showPercent=el('text',{x:504,y:90,'text-anchor':'middle',class:'show-percent'});this.svg.append(this.showTimer,this.showBar,this.showPercent,this.advice);
  this.adviceText=document.createTextNode('');this.adviceTitle=el('title');this.advice.append(this.adviceText,this.adviceTitle);
  button('lockers',14,264,194,s=>s.flow.room.lockerDoorOpen?'Fermer':'Ouvrir',()=>cmd('TOGGLE_LOCKER_DOOR'));
  for(const key of ['SEC-01','SEC-02'])button(key,10,264,ROOMS[key].w-20,s=>s.flow.security.stations[key==='SEC-01'?0:1].open?'Fermer':'Ouvrir',()=>cmd('SECURITY_TOGGLE',{id:key}));
  button('ready',434,43,94,s=>s.station.gatesOpen?'Fermer':'Ouvrir',()=>cmd('TOGGLE_GATES'),s=>!s.station.gateMotion);
  button('boarding',484,8,120,()=> 'Agrandir ↗',()=>onSelect('boarding'));
  const indicator=(x,y)=>{const lamp=el('circle',{cx:x,cy:y,r:4,class:'door-state',role:'img',tabindex:0});lamp.append(el('title'));this.svg.append(lamp);return lamp;};
  this.doorLabels=new Map();for(const [zone,[dx,dy]]of Object.entries(doors)){if(zone==='preshow')continue;this.doorLabels.set(zone,indicator(dx-7,dy-9));}
  this.showEntry=indicator(360,280);this.showExit=indicator(648,280);
  this.scanner=el('title');this.nodes.get('fast').group.querySelector('.entry-reader').append(this.scanner);
  this.caption=document.createElement('p');this.caption.className='occupancy-caption';for(const [name,lane]of [['Standard','standard'],['Fast Pass','fast'],['Single Rider','single']]){if(this.caption.childNodes.length)this.caption.append(' • ');const item=document.createElement('span');item.className=`legend-${lane}`;item.textContent=name;this.caption.append(item);}container.append(this.caption);
  this.scaleX=1;this.scaleY=1;this.mapX=x=>x;this.mapY=y=>y;
  this.geometry=[...this.svg.querySelectorAll('*')].filter(n=>!n.closest('defs')&&!n.closest('.floor-people')).map(node=>({node,attrs:Object.fromEntries([...node.attributes].filter(a=>['x','y','x1','x2','y1','y2','cx','cy','width','height','points','d'].includes(a.name)).map(a=>[a.name,a.value]))}));
  this.resizeObserver=new ResizeObserver(([entry])=>this.layout(entry.contentRect.width,entry.contentRect.height));this.resizeObserver.observe(this.svg);

 }
 layout(width,height){
  width=Math.round(width);height=Math.round(height);if(width<100||height<100||this.layoutSize===`${width}:${height}`)return;this.layoutSize=`${width}:${height}`;
  const sx=(width-20)/1176,sy=(height-20)/570,x=v=>10+(v-12)*sx,y=v=>10+(v-18)*sy;this.scaleX=sx;this.scaleY=sy;this.mapX=x;this.mapY=y;
  this.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  for(const {node,attrs}of this.geometry){
   for(const [key,raw]of Object.entries(attrs)){
    if(key==='d'){node.setAttribute(key,projectPath(raw,x,y,sx,sy));continue;}
    if(key==='points'){const values=raw.trim().split(/[ ,]+/).map(Number);node.setAttribute(key,values.map((v,i)=>i%2?y(v):x(v)).join(' '));continue;}
    const value=Number(raw);if(!Number.isFinite(value))continue;
    node.setAttribute(key,key==='width'?value*sx:key==='height'?value*sy:['x','x1','x2','cx'].includes(key)?x(value):y(value));
   }
  }
  // Header and command bands use CSS-pixel offsets, independent of scenery height.
  for(const [key,node]of this.nodes){const r=ROOMS[key],left=x(r.x),top=y(r.y),roomWidth=r.w*sx,baseline=top+(r.h<100?15:18),plate=node.group.querySelector('.room-plate'),label=node.group.querySelector('.floor-name');plate.setAttribute('height',r.h<100?18:20);plate.setAttribute('y',top+1);label.setAttribute('x',left+16);label.setAttribute('y',baseline);label.textContent=key.startsWith('SEC-')&&roomWidth<155?`SÉC. ${key==='SEC-01'?'A':'B'}`:r.label;node.count.setAttribute('x',left+roomWidth-16);node.count.setAttribute('y',baseline);
   for(const control of node.controls){const rect=control.g.querySelector('rect'),text=control.text;let yy=Number(rect.getAttribute('y'));if(key==='preshow')yy=top+r.h*sy-(control===node.controls[0]||control===node.controls[1]?24:50);else if(r.h>200)yy=top+r.h*sy-24;else if(key==='boarding')yy=top+2;else yy=Math.max(top+25,yy);rect.setAttribute('y',yy);rect.setAttribute('height',22);text.setAttribute('y',yy+15);if(key==='boarding')node.count.setAttribute('x',Number(rect.getAttribute('x'))-12);}
  }
  const showRoom=ROOMS.preshow,showLeft=x(showRoom.x+22),showTop=y(showRoom.y),showWidth=244*sx;
  this.progressWidth=Math.max(45,showWidth-119);this.showTimer.setAttribute('x',showLeft);this.showTimer.setAttribute('y',showTop+30);this.showBar.setAttribute('x',showLeft);this.showBar.setAttribute('y',showTop+35);this.showBar.setAttribute('height',8);const track=this.svg.querySelector('.show-progress-track');track.setAttribute('x',showLeft);track.setAttribute('y',showTop+35);track.setAttribute('height',8);track.setAttribute('width',this.progressWidth);this.showPercent.setAttribute('x',showLeft+this.progressWidth/2);this.showPercent.setAttribute('y',showTop+42);this.advice.setAttribute('x',showLeft+this.progressWidth+9);this.advice.setAttribute('y',showTop+43);
  this.platformReadout.setAttribute('x',x(ROOMS.boarding.x)+165);this.platformReadout.setAttribute('y',y(ROOMS.boarding.y)+18);
  this.showBar.setAttribute('width',this.progressWidth*(this.lastShowProgress||0));
  for(const record of this.pool.records.values())if(record.point){record.value.setAttribute('x',x(record.point[0])-6);record.value.setAttribute('y',y(record.point[1])-17);}
 }
 dispose(){this.resizeObserver.disconnect();this.pool.reset();}
 reset(){this.pool.reset();this.lastTime=null;}
 point(zone,record,person){
  if(zone==='boarding')return (person.prepared?preparedPoint:seatPoint)(person.seat??record.slot);
  const r=ROOMS[zone],slot=record.slot;
  if(zone==='preshow')return [r.x+28+slot%14*18,r.y+160+Math.floor(slot/14)%3*18];
  if(zone.startsWith('SEC-'))return [r.x+48+slot%2*30,r.y+107+Math.floor(slot/2)%6*20];
  if(zone==='lockers')return [r.x+34+slot%5*37,r.y+125+Math.floor(slot/5)%3*52];
  if(zone==='ready')return [r.x+24+slot%26*15,r.y+54+Math.floor(slot/26)%2*20];
  if(zone==='singleReady')return [r.x+24+slot%30*15,r.y+49];
  if(['standard','fast','single'].includes(zone))return [r.x+24+slot%16*13,r.y+58+Math.floor(slot/16)%2*23];
  return [r.x+25+slot%24*13,r.y+61];
 }
 update(s,selected){
  if(this.lastTime!==null&&s.time<this.lastTime)this.reset();const dt=this.lastTime===null?0:Math.max(0,Math.min(.3,s.time-this.lastTime));this.lastTime=s.time;this.state=s;
  const f=s.flow,{zones,transits}=roomPopulation(s),show=showPresentation(s),active=new Set(),caps={standard:f.lanes.standard.capacity,fast:f.lanes.fast.capacity,single:f.lanes.single.capacity,preshow:f.preshow.capacity,lockers:f.room.lockerCapacity,'SEC-01':24,'SEC-02':24,ready:40,singleReady:40,boarding:20,unloading:20,retrieval:120,exit:120};
  const open={standard:f.lanes.standard.open,fast:f.lanes.fast.open,single:f.lanes.single.open,preshow:f.preshow.entranceOpen||f.preshow.exitOpen,lockers:f.room.lockerDoorOpen,'SEC-01':f.security.stations[0].open,'SEC-02':f.security.stations[1].open,ready:s.station.gatesOpen,singleReady:s.station.gatesOpen,boarding:s.station.gatesOpen,unloading:true,retrieval:true,exit:true};
  const draw=(record,p,point,zone)=>{const node=record.value;if(!node.isConnected)this.layer.append(node);node.setAttribute('x',this.mapX(point[0])-6);node.setAttribute('y',this.mapY(point[1])-17);node.style.display=zone!=='transit'&&zone!=='boarding'&&!p.prepared&&record.slot>=(visualCaps[zone]||120)?'none':'';node.setAttribute('fill',p.lane==='single'?'#d39af1':p.lane==='fast'?'#ecc36f':'#94cfdb');node.setAttribute('data-person',p.id);node.setAttribute('data-zone',zone);};
  for(const [zone,node]of this.nodes){const ids=zones[zone],incoming=transits.filter(p=>p.to===zone).length;node.count.textContent=`${zone==='boarding'?ids.filter(p=>!p.prepared).length:ids.length}/${caps[zone]}`;node.incoming.textContent=incoming?`+${incoming} en transit`:'';if(zone.startsWith('SEC-'))node.count.textContent=String(ids.length);if(zone==='exit')node.count.textContent=`Sortis : ${f.metrics.departed} · En route : ${incoming}`;
   node.title.textContent=`${ROOMS[zone].label} : ${ids.length} personnes, ${incoming} en transit. ${zone.startsWith('SEC-')?'Capacité commune sécurité : 24':`Capacité : ${caps[zone]}`}.`;if(zone==='boarding')node.title.textContent=`${ids.filter(p=>!p.prepared).length} passagers · ${s.station.prepared.length} visiteurs préparés derrière les portiques.`;node.group.classList.toggle('selected',zone===selected);node.group.classList.toggle('full',ids.length+incoming>=caps[zone]);node.group.classList.toggle('show-playing',zone==='preshow'&&show.phase==='PLAYING');node.door.classList.toggle('open',!!open[zone]);
   const label=this.doorLabels.get(zone);if(label)this.setDoorState(label,open[zone],ROOMS[zone].label);
   node.controls.forEach(c=>{c.text.textContent=c.label(s);c.g.setAttribute('aria-disabled',String(!s.initialized||s.emergency||!c.enabled(s)));c.g.setAttribute('aria-label',`${c.text.textContent} · ${ROOMS[zone].label}`);});
   for(const p of ids){active.add(p.id);const record=this.pool.acquire(p.id,zone),target=this.point(zone,record,p);record.transit=null;if(!record.point)record.point=target;else record.point=record.point.map((v,i)=>v+(target[i]-v)*Math.min(1,dt*5));draw(record,p,record.point,zone);}
  }
  for(const p of transits){active.add(p.id);const record=this.pool.records.get(p.id)||this.pool.acquire(p.id,p.from);const key=`${p.from}>${p.to}`;
   if(!record.transit||record.transit.key!==key)record.transit={key,start:record.point||center(p.from)};
   const destination=p.to==='boarding'?seatPoint(p.seat):entries[p.to]||center(p.to),way=route(p.from,p.to);const points=p.from==='boarding'?[record.transit.start,destination]:[record.transit.start,...way.slice(0,-1),destination];record.point=along(points,p.t);draw(record,p,record.point,'transit');
  }
  this.pool.retain(active);this.setDoorState(this.showEntry,f.preshow.entranceOpen,'Entrée préshow');this.setDoorState(this.showExit,f.preshow.exitOpen,'Sortie préshow');this.platformReadout.textContent=`Quai : ${s.station.prepared.length}/20`;const completed=['FINISHED','EXITING'].includes(show.phase),progress=show.phase==='PLAYING'?Math.min(1,f.preshow.elapsed/f.preshow.duration):completed?1:0;this.showTimer.textContent=show.phase==='PLAYING'?`Temps restant : ${mmss(f.preshow.duration-f.preshow.elapsed)}`:show.phase==='FINISHED'?'Séance terminée — ouvrir la sortie':show.phase==='EXITING'?`Sortie : ${Math.max(0,f.preshow.exitTotal-f.preshow.batch.length-f.people.filter(p=>p.transit?.from==='preshow').length)}/${f.preshow.exitTotal}${show.blocked?' · aval plein':''}`:show.label.split(' · ')[0];this.showTimer.setAttribute('aria-label',show.label);this.lastShowProgress=progress;this.showBar.setAttribute('width',String(progress*(this.progressWidth||0)));this.showBar.setAttribute('data-phase',show.phase);this.showPercent.textContent=show.phase==='PLAYING'||show.phase==='FINISHED'?`${Math.round(progress*100)} %`:'';const advice=singleRecommendation(s);this.adviceText.nodeValue=`Complément SR : ${advice.limited?advice.count:advice.need}`;this.advice.setAttribute('aria-label',`Complément Single Rider : ${advice.count}, besoin : ${advice.need}${advice.limited?', limité par la capacité':''}`);this.adviceTitle.textContent=this.advice.getAttribute('aria-label');
  const scan=f.fastScanner;this.scanner.textContent=`Scan : ${scan.visitorId?'#'+scan.visitorId:'attente'} · ${scan.result==='valid'?'valide':scan.result==='used'?'déjà utilisé':scan.result==='invalid'?'invalide':scan.visitorId?'en cours':'libre'}`;
  const at=s.trains.find(t=>t.blockId==='LOAD'&&t.progress>=1);for(const seat of this.svg.querySelectorAll('[data-plan-seat]')){const r=at?.restraints[Number(seat.getAttribute('data-plan-seat'))];seat.setAttribute('data-state',r?.state||'EMPTY');}
  this.caption.title=`${transits.length} personnes en déplacement. Effectifs complets dans les en-têtes.`;
 }
 setDoorState(lamp,open,name){const label=`${name} : ${open?'Ouverte':'Fermée'}`;lamp.classList.toggle('open',!!open);lamp.setAttribute('aria-label',label);lamp.querySelector('title').textContent=label;}
}
