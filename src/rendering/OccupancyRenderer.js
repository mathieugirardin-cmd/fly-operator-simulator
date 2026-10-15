import {showPresentation} from '../core/PresentationState.js';
const NS='http://www.w3.org/2000/svg';
const make=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
export const ROOMS={standard:{label:'FILE STANDARD',x:10,y:10,w:145,h:116},fast:{label:'FAST PASS',x:10,y:165,w:145,h:116},preshow:{label:'PRÉSHOW',x:192,y:10,w:173,h:186},lockers:{label:'CASIERS',x:407,y:10,w:170,h:186},security:{label:'SÉCURITÉ A / B',x:619,y:10,w:160,h:186},ready:{label:'ATTENTE TRAIN',x:821,y:10,w:169,h:116},boarding:{label:'EMBARQUEMENT',x:821,y:210,w:169,h:76},unloading:{label:'DÉBARQUEMENT',x:619,y:210,w:160,h:76},retrieval:{label:'RÉCUPÉRATION',x:407,y:210,w:170,h:76},exit:{label:'SORTIE',x:192,y:228,w:173,h:58}};
const links=[['standard','preshow'],['fast','preshow'],['preshow','lockers'],['lockers','security'],['security','ready'],['ready','boarding'],['boarding','unloading'],['unloading','retrieval'],['retrieval','exit']];
const center=key=>{const r=ROOMS[key];return [r.x+r.w/2,r.y+r.h/2];};
function route(from,to){const a=center(from),b=center(to);return from==='fast'?[[155,205],[174,205],[174,104],[192,104]]:[a,[b[0],a[1]],b];}
function along(points,t){const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])),total=lengths.reduce((a,b)=>a+b,0);let d=t*total;for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const f=lengths[i]?d/lengths[i]:1;return points[i].map((v,j)=>v+(points[i+1][j]-v)*f);}d-=lengths[i];}return points.at(-1);}
export function roomPopulation(s){
 const zones=Object.fromEntries(Object.keys(ROOMS).map(k=>[k,[]])),transits=[];
 for(const p of s.flow.people){if(p.transit){transits.push({id:p.id,lane:p.lane,from:p.transit.from==='queue'?p.lane:p.transit.from,to:p.transit.to,t:1-p.transit.remaining/p.transit.duration});continue;}zones[p.stage==='queue'?p.lane:p.stage]?.push(p);}
 const train=s.trains.find(t=>t.blockId==='LOAD'&&t.progress>=1&&t.state!=='GARAGING');
 for(const id of train?.passengerIds||[])zones.boarding.push({id});
 for(const t of s.trains)if(t.blockId==='UNLOAD'&&t.progress>=1)for(const id of t.passengerIds)zones.unloading.push({id});
 for(const id of train?.boardingIds||[])transits.push({id,from:'ready',to:'boarding',t:s.station.loadingProgress});
 for(const p of s.flow.egress){if(p.stage==='unloading')transits.push({id:p.id,from:'unloading',to:'retrieval',t:1-p.remaining/s.flow.room.travelDuration});else if(p.stage==='exiting')transits.push({id:p.id,from:'retrieval',to:'exit',t:1-p.remaining/s.flow.room.travelDuration});else zones.retrieval.push(p);}
 return {zones,transits};
}
export class OccupancyRenderer {
 constructor(container,onSelect,onCommand){
  this.nodes=new Map();this.dots=new Map();this.pool=[];
  this.svg=make('svg',{viewBox:'0 0 1000 300',preserveAspectRatio:'none',role:'group','aria-label':'Plan vivant des pièces et passages'});container.append(this.svg);
  const defs=make('defs');defs.innerHTML='<symbol id="flow-person" viewBox="-3 -5 6 10"><circle cy="-3" r="1.7"/><path d="M-2 0Q0-2 2 0L2 3H1V5H-1V3H-2Z"/></symbol>';this.svg.append(defs);
  const halls=make('g',{class:'floor-halls','aria-hidden':true});this.svg.append(halls);for(const [from,to]of links)halls.append(make('polyline',{points:route(from,to).map(p=>p.join(',')).join(' ')}));
  for(const [key,r]of Object.entries(ROOMS)){
   const g=make('g',{class:`floor-room ${key}`,role:'group','data-room':key,'aria-label':r.label});g.append(make('rect',{x:r.x,y:r.y,width:r.w,height:r.h,rx:8,class:'floor-wall'}));
   const label=make('text',{x:r.x+10,y:r.y+19,class:'floor-name'},r.label),count=make('text',{x:r.x+10,y:r.y+38,class:'floor-count'}),title=make('title'),status=make('text',{x:r.x+10,y:r.y+r.h-(key==='preshow'?2:9),class:'floor-status'});const cap=make('text',{x:r.x+10,y:r.y+53,class:'floor-cap'});g.append(label,count,title,status,cap);label.addEventListener('click',()=>onSelect(key));this.svg.append(g);this.nodes.set(key,{g,count,title,status,cap,buttons:[]});
  }
  this.layer=make('g',{'aria-hidden':true,class:'floor-people'});this.svg.append(this.layer);
  const add=(zone,x,y,label,action)=>{
   const g=make('g',{role:'button',tabindex:0,class:'floor-command'}),r=ROOMS[zone],text=make('text',{x:r.x+x+4,y:r.y+y+13});g.append(make('rect',{x:r.x+x,y:r.y+y,width:ROOMS[zone].w-16,height:21,rx:3}),text);this.svg.append(g);
   const run=e=>{if(g.getAttribute('aria-disabled')==='true')return;e.stopPropagation();action(this.state);};g.addEventListener('click',run);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();run(e);}});this.nodes.get(zone).buttons.push({g,text,label});
  };
  const cmd=(type,payload={})=>onCommand?.(type,payload);
  for(const zone of ['standard','fast'])add(zone,8,87,s=>`${s.flow.lanes[zone].open?'● Fermer':'⊣ Ouvrir'} entrée`,s=>cmd('SET_LANE',{lane:zone,field:'open',value:!s.flow.lanes[zone].open}));
  add('preshow',8,126,s=>`${s.flow.preshow.entranceOpen?'● Fermer':'⊣ Ouvrir'} entrée`,s=>cmd(s.flow.preshow.entranceOpen?'PRESHOW_CLOSE':'PRESHOW_OPEN'));
  add('preshow',8,150,s=>`${s.flow.preshow.exitOpen?'● Fermer':'⊣ Ouvrir'} sortie`,s=>cmd(s.flow.preshow.state==='EXITING'?(s.flow.preshow.exitOpen?'PRESHOW_EXIT_CLOSE':'PRESHOW_EXIT_RESUME'):'PRESHOW_EXIT'));
  add('preshow',8,102,()=> '▶ Séance',()=>cmd('PRESHOW_START'));
  add('lockers',8,141,s=>`${s.flow.room.lockerDoorOpen?'● Fermer':'⊣ Ouvrir'} passage`,()=>cmd('TOGGLE_LOCKER_DOOR'));
  for(const [i,y]of [[0,114],[1,141]])add('security',8,y,s=>`${s.flow.security.stations[i].open?'● Fermer':'⊣ Ouvrir'} poste ${i?'B':'A'}`,()=>cmd('SECURITY_TOGGLE',{id:`SEC-0${i+1}`}));
  add('ready',8,87,s=>s.station.gateMotion?'↔ En mouvement':`${s.station.gatesOpen?'● Fermer':'⊣ Ouvrir'} portiques`,()=>cmd('TOGGLE_GATES'));
  this.caption=document.createElement('p');this.caption.className='occupancy-caption';container.append(this.caption);
 }
 dot(id,lane,x,y,zone){let dot=this.dots.get(id);if(!dot){dot=this.pool.pop()||make('use',{href:'#flow-person',width:6,height:10});this.layer.append(dot);this.dots.set(id,dot);}dot.setAttribute('x',x-3);dot.setAttribute('y',y-5);dot.setAttribute('fill',lane==='fast'?'#f6c775':'#abc9d4');dot.setAttribute('data-person',id);dot.setAttribute('data-zone',zone);}
 update(s,selected){
  this.state=s;const f=s.flow,{zones,transits}=roomPopulation(s),alive=new Set(),show=showPresentation(s);
  const caps={standard:f.lanes.standard.capacity,fast:f.lanes.fast.capacity,preshow:f.preshow.capacity,lockers:f.room.lockerCapacity,security:f.room.securityCapacity,ready:40,boarding:20,unloading:20,retrieval:120,exit:120};
  const doors={standard:f.lanes.standard.open,fast:f.lanes.fast.open,preshow:f.preshow.entranceOpen||f.preshow.exitOpen,lockers:f.room.lockerDoorOpen,security:f.security.stations.some(p=>p.open),ready:s.station.gatesOpen,boarding:s.station.gatesOpen,unloading:true,retrieval:true,exit:true};
  for(const [zone,node]of this.nodes){
   const ids=zones[zone],r=ROOMS[zone],incoming=transits.filter(p=>p.to===zone).length;node.count.textContent=`${ids.length} personnes`;node.cap.textContent=r.h>100?`cap. ${caps[zone]} · ${incoming} réservées`:``;node.title.textContent=`${r.label} : ${ids.length} personnes présentes, ${incoming} places réservées, capacité ${caps[zone]}. ${doors[zone]?'Passage ouvert':'Passage fermé'}.`;
   node.g.classList.toggle('selected',selected===zone);node.g.classList.toggle('full',ids.length+incoming>=caps[zone]);node.status.textContent=zone==='preshow'?(show.phase==='EXITING'?`Vidage : ${f.preshow.batch.length}${show.blocked?' (aval plein)':''}`:show.label):zone==='security'?`A ${f.security.stations[0].visitorId?'occupé':'libre'} · B ${f.security.stations[1].visitorId?'occupé':'libre'}`:r.h>100?'':`cap. ${caps[zone]} · ${incoming} en approche`;
   if(zone==='exit'){node.status.textContent=`${f.metrics.departed} sorties · cap. ${caps.exit}`;}
   node.buttons.forEach((b,i)=>{
    const open=zone==='preshow'?(i===0?f.preshow.entranceOpen:i===1?f.preshow.exitOpen:false):zone==='security'?f.security.stations[i].open:doors[zone];
    const disabled=s.emergency||!s.initialized||zone==='preshow'&&(i===0?!s.open||!['CLOSED','FILLING','FULL'].includes(f.preshow.state):i===1?!['FINISHED','EXITING'].includes(f.preshow.state):f.preshow.state!=='READY')||zone==='ready'&&s.station.gateMotion>1e-9;
    b.text.textContent=b.label(s);b.g.classList.toggle('door-open',open);b.g.classList.toggle('door-closed',!open);b.g.classList.toggle('show-start',zone==='preshow'&&i===2);b.g.setAttribute('aria-disabled',String(!!disabled));b.g.setAttribute('aria-label',`${b.text.textContent.replace(/[●⊣▶↔]/g,'').trim()} · ${r.label}`);
   });
   ids.forEach((p,i)=>{alive.add(p.id);const cols=zone==='standard'||zone==='fast'?24:zone==='preshow'?14:12,rows=Math.ceil(ids.length/cols),height=r.h>150?55:r.h>100?17:12;const x=r.x+12+i%cols*(r.w-24)/cols,y=r.y+(r.h>100?65:49)+Math.floor(i/cols)*Math.min(8,(r.h>150?38:r.h>100?17:12)/Math.max(1,rows));this.dot(p.id,p.lane,x+(s.emergency?0:Math.sin(s.time*2+p.id)*.8),y,zone);});
  }
  for(const p of transits){alive.add(p.id);const [x,y]=along(route(p.from,p.to),p.t);this.dot(p.id,p.lane,x,y,'transit');}
  for(const [id,dot]of this.dots)if(!alive.has(id)){this.dots.delete(id);dot.remove();this.pool.push(dot);}
  this.caption.textContent=`${transits.length} personnes en déplacement · places réservées · portes : ● vert ouvert / ⊣ rouge fermé · Fast Pass doré`;
 }
}
