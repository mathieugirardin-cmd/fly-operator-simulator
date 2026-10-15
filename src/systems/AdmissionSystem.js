export const LANE_NAMES=['standard','fast','single'];
export const createLane=(capacity=160)=>({open:true,capacity,rate:0,timer:0,arrived:0,admitted:0,wait:null,history:[]});
export const createFastScanner=()=>({auto:true,visitorId:null,elapsed:0,result:null});
export const createPass=()=>({status:'valid',checked:false,consumed:false});
export function singleRecommendation(s){
  const f=s.flow,show=f.preshow,capacities=s.trains.filter(t=>t.blockId&&t.available).map(t=>t.capacity);
  const planned=show.plannedRegular??Math.min(show.groupSize,f.people.filter(p=>p.lane!=='single'&&(p.stage==='queue'||p.stage==='preshow'||p.transit?.to==='preshow')).length);
  let seats=0,index=0;while(seats<planned&&capacities.length){seats+=capacities[index++%capacities.length];}
  const assigned=new Set(show.singleAssigned),need=Math.max(0,seats-planned-assigned.size);
  const available=f.people.filter(p=>p.lane==='single'&&p.stage==='queue'&&!assigned.has(p.id)).length;
  const space=Math.max(0,show.capacity-planned-assigned.size);
  return {planned,seats,need,available,space,count:Math.min(need,available,space),limited:need>space};
}
export class AdmissionSystem {
  constructor(engine){this.engine=engine;}
  command(type,p={}){
    const s=this.engine.state,f=s.flow,show=f.preshow,scan=f.fastScanner,ok=message=>({status:'accepted',message}),no=message=>({status:'rejected',message});
    if(type==='ADD_SINGLE_COMPLEMENT'){
      if(show.state!=='FILLING'||!show.entranceOpen||!s.open)return no('Complément disponible uniquement pendant le remplissage.');
      const advice=singleRecommendation(s);if(!advice.count)return no(advice.limited?'Capacité du préshow insuffisante pour ce complément.':'Aucun complément disponible ou déjà réservé.');
      const ids=f.people.filter(v=>v.stage==='queue'&&v.lane==='single'&&!show.singleAssigned.includes(v.id)).slice(0,advice.count).map(v=>v.id);
      show.singlePending.push(...ids);show.singleAssigned.push(...ids);
      show.singleExtra+=ids.length;
      return ok(`${ids.length} Single Riders réservés pour ce lot${advice.limited?' ; le reste dépasse la capacité de la salle':''}. Admission progressive.`);
    }
    if(type==='FAST_AUTO'){scan.auto=!scan.auto;return ok(scan.auto?'Scanner automatique.':'Scanner sous contrôle manuel.');}
    if(type==='FAST_SET_PASS'){
      const v=f.people.find(v=>v.id===scan.visitorId);if(!v||v.stage!=='queue'||!['valid','used','invalid'].includes(p.status))return no('Choisissez un pass au scanner.');
      v.fastPass.status=p.status;v.fastPass.checked=false;scan.elapsed=0;scan.result=null;return ok('Pass de démonstration modifié.');
    }
    if(type==='FAST_SCAN'){
      if(scan.auto)return no('Passez le scanner en manuel.');
      const v=f.people.find(v=>v.id===scan.visitorId);if(!v||scan.elapsed<1-1e-9)return no('Attendez un visiteur et la fin du scan.');
      this.inspect(v);return ok(`Pass ${scan.result==='valid'?'valide':scan.result==='used'?'déjà utilisé':'invalide'}.`);
    }
    if(type==='FAST_REROUTE'){
      const v=f.people.find(v=>v.id===scan.visitorId);if(!v||!['used','invalid'].includes(scan.result))return no('Réorientation réservée aux pass refusés.');
      if(f.people.filter(p=>p.stage==='queue'&&p.lane==='standard').length>=f.lanes.standard.capacity)return no('File Standard pleine ; le visiteur reste au scanner.');
      v.lane='standard';v.fastPass=null;this.reset();return ok('Visiteur réorienté vers Standard ; identité et attente conservées.');
    }
    return null;
  }
  reset(){const scan=this.engine.state.flow.fastScanner;Object.assign(scan,{visitorId:null,elapsed:0,result:null});}
  inspect(v){const scan=this.engine.state.flow.fastScanner;scan.result=v.fastPass.status;v.fastPass.checked=scan.result==='valid'&&!v.fastPass.consumed;}
  update(dt){
    const s=this.engine.state,f=s.flow,scan=f.fastScanner;if(!s.open||s.emergency)return;
    const first=f.people.find(p=>p.lane==='fast'&&p.stage==='queue');
    if(scan.visitorId!==first?.id){this.reset();if(first)scan.visitorId=first.id;}
    if(!first)return;scan.elapsed=Math.min(1,scan.elapsed+dt);if(scan.auto&&scan.elapsed>=1-1e-9&&scan.result===null)this.inspect(first);
  }
  admitted(person){
    const f=this.engine.state.flow,show=f.preshow;
    if(person.lane==='fast'){person.fastPass.status='used';person.fastPass.consumed=true;this.reset();}
    if(person.lane==='single'){if(!show.singleAssigned.includes(person.id))show.singleAssigned.push(person.id);show.singlePending=show.singlePending.filter(id=>id!==person.id);}
  }
}
export function validateAdmissions(s,assert){
  const f=s.flow,show=f.preshow,scanner=f.fastScanner;
  assert(f.lanes.single&&Number.isFinite(f.arrivals.singlePercent)&&f.arrivals.singlePercent>=0&&f.arrivals.singlePercent<=100&&f.arrivals.singlePercent+f.arrivals.fastPercent<=100&&Number.isFinite(f.arrivals.singleCursor)&&f.arrivals.singleCursor>=-100&&f.arrivals.singleCursor<=100,'répartition Single Rider invalide.');
  for(const p of f.people){const pass=p.fastPass;assert(p.lane!=='fast'?pass===null:pass&&['valid','used','invalid'].includes(pass.status)&&typeof pass.checked==='boolean'&&typeof pass.consumed==='boolean'&&(p.stage==='queue'?!pass.consumed&&(!pass.checked||pass.status==='valid'):pass.consumed&&pass.checked&&pass.status==='used'),'pass Fast Pass incohérent.');}
  assert(scanner&&typeof scanner.auto==='boolean'&&Number.isFinite(scanner.elapsed)&&scanner.elapsed>=0&&scanner.elapsed<=1&&[null,'valid','used','invalid'].includes(scanner.result)&&(scanner.visitorId===null||f.people.some(p=>p.id===scanner.visitorId&&p.lane==='fast'&&p.stage==='queue')),'scanner Fast Pass invalide.');
  assert(show.plannedRegular===null||Number.isInteger(show.plannedRegular)&&show.plannedRegular>=0&&show.plannedRegular<=show.groupSize,'lot Standard/Fast Pass invalide.');
  assert(Number.isInteger(show.singleExtra)&&show.singleExtra>=0&&show.singleExtra<=show.singleAssigned.length,'complément Single Rider invalide.');
  for(const key of ['singleAssigned','singlePending'])assert(Array.isArray(show[key])&&new Set(show[key]).size===show[key].length&&show[key].length<=show.capacity,'réservations Single Rider invalides.');
  assert(show.singlePending.every(id=>show.singleAssigned.includes(id)&&f.people.some(p=>p.id===id&&p.lane==='single'&&p.stage==='queue')),'réservation Single Rider orpheline.');
  assert(f.people.filter(p=>p.stage==='preshow'||p.transit?.to==='preshow').length+show.singlePending.length<=show.capacity,'préshow sur-réservé.');
}
