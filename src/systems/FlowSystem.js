// Fictional visitor operations. Each waiting visitor has exactly one physical stage.
export const INVENTORY=['Pièces de monnaie','Téléphone','Clés','Objet libre','Écharpe','Accessoire flottant','Sac'];
export const PRESHOW_STATES=['CLOSED','OPENING','FILLING','FULL','READY','PLAYING','FINISHED','EXITING','INCIDENT'];
export const FLOW_STAGES=['queue','preshow','lockers','security','ready','transit'];
export const flowVisitor=(id,time=0,lane='standard')=>({id,lane,stage:'queue',arrivedAt:time,inventory:[],recheck:false,transit:null});
export function createFlow(count=48) {
  return {
    arrivals:{totalRate:60,fastPercent:20,timer:0,cursor:0},people:Array.from({length:count},(_,i)=>flowVisitor(i+1)),order:[],mergeCursor:0,egress:[],room:{lockerDoorOpen:true,lockerCapacity:120,securityCapacity:24,readyCapacity:40,lockerBatch:20,travelDuration:2,queueCapacity:1000},
    lanes:{standard:{open:true,capacity:600,rate:60,timer:0,arrived:count,admitted:0,wait:null,history:[]},fast:{open:true,capacity:160,rate:0,timer:0,arrived:0,admitted:0,wait:null,history:[]}},
    ratio:3,preshow:{state:'CLOSED',auto:true,capacity:80,groupSize:20,entryRate:2,exitRate:2,exitTotal:0,duration:8,entranceOpen:false,exitOpen:false,elapsed:0,admissionTimer:0,batch:[],resume:null,cycles:0},
    security:{controlled:null,stations:['SEC-01','SEC-02'].map(id=>({id,open:true,visitorId:null,elapsed:0,inspected:false,extra:false})),duration:2,rules:INVENTORY.map(()=>true)},
    metrics:{checks:0,returns:0,penalties:0,waitSum:0,boarded:0,exited:0,departed:0,dispatches:[],deposits:[],checksHistory:[],admissions:[],historyTimer:0},
  };
}
export const queuedIds=state=>new Set(state.flow?.people.map(p=>p.id)||Array.from({length:state.visitors.queue},(_,i)=>state.visitors.totalArrived-state.visitors.queue+1+i));
export class FlowSystem {
  constructor(engine){this.engine=engine;}
  person(id){return this.engine.state.flow.people.find(p=>p.id===id);}
  blocked(equipment){return this.engine.maintenance?.has(equipment)||false;}
  occupancy(stage){return this.engine.state.flow.people.filter(p=>p.stage===stage||p.stage==='transit'&&p.transit?.to===stage).length;}
  move(person,to){person.transit={from:person.stage,to,remaining:this.engine.state.flow.room.travelDuration,duration:this.engine.state.flow.room.travelDuration};person.stage='transit';}
  selectNext() {
    const f=this.engine.state.flow,standard=f.people.find(p=>p.stage==='queue'&&p.lane==='standard'),fast=f.people.find(p=>p.stage==='queue'&&p.lane==='fast');
    if(!standard)return fast;if(!fast)return standard;
    const person=f.mergeCursor<f.ratio?standard:fast;f.mergeCursor=(f.mergeCursor+1)%(f.ratio+1);return person;
  }
  command(type,p={}) {
    const s=this.engine.state,f=s.flow,show=f.preshow;
    const ok=message=>({status:'accepted',message}),no=message=>({status:'rejected',message});
    if(type==='SET_ARRIVALS'){
      const a=f.arrivals;
      if(!['totalRate','fastPercent'].includes(p.field)||!Number.isInteger(p.value)||p.value<0||p.value>(p.field==='totalRate'?240:100))return no('Débit total ou proportion Fast Pass invalide.');
      a[p.field]=p.value;return ok('Arrivées totales partagées entre les deux files.');
    }
    if(type==='SET_FLOW_CONFIG') {
      const limits={capacity:[1,120],groupSize:[1,120],entryRate:[1,10],exitRate:[1,10],duration:[5,180],ratio:[1,10],securityDuration:[1,15],lockerCapacity:[40,120],lockerBatch:[1,40]};
      if(!limits[p.field]||!Number.isInteger(p.value)||p.value<limits[p.field][0]||p.value>limits[p.field][1])return no('Réglage hors limites.');
      if(['capacity','groupSize','duration'].includes(p.field)&&show.state!=='CLOSED')return no('Attendez une salle vide et fermée avant de modifier ce réglage.');
      if(p.field==='groupSize'&&p.value>show.capacity)return no('Le groupe ne peut pas dépasser la capacité de la salle.');
      if(p.field==='lockerCapacity'&&p.value<this.occupancy('lockers'))return no('La capacité ne peut pas être inférieure à l’occupation et aux places réservées.');
      if(p.field==='ratio'){f.ratio=p.value;f.mergeCursor=0;}else if(['lockerCapacity','lockerBatch'].includes(p.field))f.room[p.field]=p.value;else if(p.field==='securityDuration'){f.security.duration=p.value;for(const station of f.security.stations)station.elapsed=Math.min(station.elapsed,p.value*(station.extra?2:1));}else{show[p.field]=p.value;if(p.field==='capacity')show.groupSize=Math.min(show.groupSize,p.value);}
      return ok('Réglage des flux appliqué.');
    }
    if(type==='SET_LANE') {
      const lane=f.lanes[p.lane];if(!lane)return no('File inconnue.');
      if(p.field==='open'&&typeof p.value==='boolean')lane.open=p.value;
      else if(p.field==='rate'&&Number.isInteger(p.value)&&p.value>=0&&p.value<=120)lane.rate=p.value;
      else if(p.field==='capacity'&&Number.isInteger(p.value)&&p.value>=1&&p.value<=800&&p.value>=f.people.filter(v=>v.stage==='queue'&&v.lane===p.lane).length)lane.capacity=p.value;
      else return no('Réglage de file invalide ou capacité inférieure à son occupation.');
      if(p.field==='rate'){const total=f.lanes.standard.rate+f.lanes.fast.rate;f.arrivals.totalRate=total;f.arrivals.fastPercent=total?f.lanes.fast.rate/total*100:0;}
      if(p.lane==='standard'){s.visitors.queueOpen=lane.open;s.visitors.arrivalRate=lane.rate;}return ok('File mise à jour.');
    }
    if(type==='PRESHOW_AUTO'){show.auto=!show.auto;return ok(show.auto?'Préshow automatique.':'Préshow sous contrôle manuel.');}
    if(type==='TOGGLE_LOCKER_DOOR'){f.room.lockerDoorOpen=!f.room.lockerDoorOpen;return ok(f.room.lockerDoorOpen?'Passage vers les casiers ouvert.':'Passage fermé ; les trajets engagés se terminent.');}
    if(type==='PRESHOW_OPEN') {
      if(!s.open||show.state!=='CLOSED'||this.blocked('preshow'))return no('Ouvrez l’attraction ; la salle doit être vide et disponible.');
      show.state='OPENING';show.entranceOpen=true;show.exitOpen=false;show.elapsed=0;return ok('Ouverture des portes d’entrée.');
    }
    if(type==='PRESHOW_CLOSE') {
      if(!['FILLING','FULL'].includes(show.state))return no('La salle ne reçoit pas de visiteurs.');
      show.entranceOpen=false;show.elapsed=0;
      if(!f.people.some(p=>p.transit?.to==='preshow'))show.state=show.batch.length?'READY':'CLOSED';
      return ok('Portes d’entrée fermées ; les passages déjà engagés se terminent.');
    }
    if(type==='PRESHOW_START') {
      if(show.state!=='READY'||show.entranceOpen||show.exitOpen||f.people.some(p=>p.transit?.to==='preshow')||this.blocked('preshow'))return no('Fermez les portes et attendez la fin des entrées avant la séance.');
      show.state='PLAYING';show.elapsed=0;return ok('Présentation lancée.');
    }
    if(type==='PRESHOW_EXIT') {
      if(show.state!=='FINISHED'||this.blocked('preshow'))return no('La présentation doit être terminée.');
      show.exitTotal=show.batch.length;show.state='EXITING';show.exitOpen=true;show.elapsed=0;show.admissionTimer=0;return ok('Sortie ouverte vers les casiers.');
    }
    if(type==='PRESHOW_EXIT_CLOSE'){if(show.state!=='EXITING')return no('La sortie n’est pas ouverte.');show.exitOpen=false;return ok('Sortie fermée ; les passages engagés se terminent.');}
    if(type==='PRESHOW_EXIT_RESUME'){if(show.state!=='EXITING')return no('La salle n’est pas en vidage.');show.exitOpen=true;return ok('Sortie rouverte.');}
    if(type==='SECURITY_CONTROL') {
      if(p.id!==null&&!f.security.stations.some(x=>x.id===p.id))return no('Poste inconnu.');
      f.security.controlled=p.id;return ok(p.id?`${p.id} sous votre contrôle ; l’autre poste reste automatique.`:'Les deux postes sont automatiques.');
    }
    if(type==='SECURITY_RULE') {
      if(!Number.isInteger(p.index)||p.index<0||p.index>=INVENTORY.length||typeof p.enabled!=='boolean')return no('Règle invalide.');
      f.security.rules[p.index]=p.enabled;for(const person of f.people)if(person.stage==='ready'&&this.prohibited(person))person.stage='security';return ok('Règle fictive de contrôle modifiée.');
    }
    const station=f.security.stations.find(x=>x.id===p.id);
    if(type==='SECURITY_TOGGLE') {if(!station)return no('Poste inconnu.');station.open=!station.open;return ok(station.open?'Poste ouvert.':'Poste fermé temporairement ; son visiteur reste présent.');}
    if(type.startsWith('SECURITY_')) {
      if(!station||f.security.controlled!==station.id||!station.open||this.blocked(station.id))return no('Prenez le contrôle d’un poste ouvert et disponible.');
      const person=this.person(station.visitorId);if(!person)return no('Aucun visiteur au scanner.');
      if(type==='SECURITY_INSPECT'){station.inspected=true;return ok('Inspection effectuée : consultez le résultat du scanner fictif.');}
      if(type==='SECURITY_EXTRA'){station.extra=true;station.elapsed=0;station.inspected=false;return ok('Contrôle supplémentaire en cours.');}
      if(station.extra||!station.inspected||station.elapsed<f.security.duration)return no('Inspectez le visiteur et attendez la fin du contrôle.');
      if(type==='SECURITY_RETURN'){if(!this.returnToLocker(station,person))return no('Couloir de retour saturé ; le visiteur reste au poste.');return ok('Retour au même casier pour déposer les objets.');}
      if(type==='SECURITY_ALLOW') {
        if(this.prohibited(person)){f.metrics.penalties++;station.extra=true;station.elapsed=0;station.inspected=false;return no('Objet non autorisé : pénalité de sécurité, contrôle supplémentaire imposé.');}
        if(!this.clear(station,person))return no('Attente d’embarquement saturée ; le visiteur reste au poste.');return ok('Contrôle validé ; passage vers l’embarquement.');
      }
    }
    return null;
  }
  prohibited(person){return person.inventory.some(i=>this.engine.state.flow.security.rules[i]);}
  clear(station,person){if(this.occupancy('ready')>=this.engine.state.flow.room.readyCapacity)return false;this.move(person,'ready');this.recordCheck();Object.assign(station,{visitorId:null,elapsed:0,inspected:false,extra:false});return true;}
  recordCheck(){const s=this.engine.state;s.flow.metrics.checks++;s.flow.metrics.checksHistory.push({time:s.time,count:1});}
  returnToLocker(station,person) {
    const l=this.engine.lockers.forVisitor(person.id);if(!l||this.occupancy('lockers')>=this.engine.state.flow.room.lockerCapacity)return false;
    this.move(person,'lockers');person.recheck=true;person.inventory=[];
    // Reopening is scheduled by LockerSystem, respecting the six simultaneous deposits.
    this.engine.state.flow.metrics.returns++;this.recordCheck();
    Object.assign(station,{visitorId:null,elapsed:0,inspected:false,extra:false});
    return true;
  }
  update(dt) {
    const s=this.engine.state,f=s.flow,show=f.preshow;if(!s.initialized)return;
    if(s.emergency)return;
    for(const person of f.people)if(person.stage==='transit') {
      person.transit.remaining=Math.max(0,person.transit.remaining-dt);
      if(person.transit.remaining<=1e-9){person.stage=person.transit.to;person.transit=null;if(person.stage==='preshow')show.batch.push(person.id);}
    }
    for(const person of [...f.egress]) {
      if(person.stage==='retrieval'){
        if(!this.engine.lockers.forVisitor(person.id)){person.stage='exiting';person.remaining=f.room.travelDuration;}
      } else {
        person.remaining=Math.max(0,person.remaining-dt);
        if(person.remaining<=1e-9){if(person.stage==='unloading'){this.engine.lockers.retrieve([person.id]);person.stage='retrieval';}else{this.engine.score.exit(person.id);f.egress.splice(f.egress.indexOf(person),1);f.metrics.departed++;}}
      }
    }
    if(this.blocked('preshow')){if(show.state!=='INCIDENT'){show.resume=show.state;show.state='INCIDENT';}}
    else if(show.state==='INCIDENT'){show.state=show.resume||'CLOSED';show.resume=null;}
    if(show.state!=='INCIDENT') {
      const wasOpening=show.state==='OPENING';
      show.elapsed+=dt;
      if(show.auto&&s.open&&show.state==='CLOSED'&&f.people.some(p=>p.stage==='queue'))this.command('PRESHOW_OPEN');
      if(show.state==='OPENING'&&show.elapsed>=1-1e-9){show.state='FILLING';show.elapsed=0;show.admissionTimer=0;}
      if(show.state==='FILLING'&&!wasOpening&&s.open&&show.entranceOpen) {
        show.admissionTimer+=dt;
        while(show.admissionTimer>=1/show.entryRate-1e-9&&this.occupancy('preshow')<Math.min(show.capacity,show.groupSize)){show.admissionTimer=Math.max(0,show.admissionTimer-1/show.entryRate);const p=this.selectNext();if(!p){show.admissionTimer=0;break;}this.move(p,'preshow');f.lanes[p.lane].admitted++;}
        show.admissionTimer=Math.min(show.admissionTimer,1/show.entryRate);
        if(this.occupancy('preshow')>=Math.min(show.capacity,show.groupSize))show.state='FULL';
      }
      if(show.auto&&s.open&&((show.state==='FILLING'&&show.elapsed>=5&&show.batch.length&&!f.people.some(p=>p.stage==='queue'))||show.state==='FULL')&&show.entranceOpen)this.command('PRESHOW_CLOSE');
      if(['FILLING','FULL'].includes(show.state)&&!show.entranceOpen&&!f.people.some(p=>p.transit?.to==='preshow')){show.state=show.batch.length?'READY':'CLOSED';show.elapsed=0;}
      if(show.auto&&s.open&&show.state==='READY')this.command('PRESHOW_START');
      if(show.state==='PLAYING'&&show.elapsed+1e-9>=show.duration){show.state='FINISHED';show.elapsed=0;show.cycles++;}
      if(show.auto&&show.state==='FINISHED')this.command('PRESHOW_EXIT');
      if(show.state==='EXITING'&&show.exitOpen) {
        show.admissionTimer=Math.min(1/show.exitRate,show.admissionTimer+dt);
        if(show.admissionTimer>=1/show.exitRate-1e-9&&f.room.lockerDoorOpen&&this.occupancy('lockers')<f.room.lockerCapacity-2&&f.people.filter(p=>p.transit?.to==='lockers').length<f.room.lockerBatch) {
          show.admissionTimer=0;const id=show.batch.shift();if(id!==undefined){const person=this.person(id);if(!person||person.stage!=='preshow')throw new Error('Sortie préshow incohérente');this.move(person,'lockers');f.order.push(id);f.metrics.admissions.push({time:s.time,count:1});}
        }
        if(!show.batch.length&&!f.people.some(p=>p.transit?.from==='preshow')){show.state='CLOSED';show.elapsed=0;show.exitOpen=false;}
      }
      if(show.state==='EXITING'&&!show.batch.length&&!f.people.some(p=>p.transit?.from==='preshow')){show.state='CLOSED';show.elapsed=0;show.exitOpen=false;}
    }
    for(const person of f.people) {
      const l=this.engine.lockers.forVisitor(person.id);
      if(person.stage==='lockers'&&!person.recheck&&l?.phase==='STORED'&&!l.fault&&this.occupancy('security')<f.room.securityCapacity)this.move(person,'security');
    }
    const occupied=new Set(f.security.stations.map(x=>x.visitorId));
    for(const station of f.security.stations) {
      if(!station.open||this.blocked(station.id))continue;
      if(station.visitorId===null) {
        const p=f.order.map(id=>this.person(id)).find(p=>p?.stage==='security'&&!occupied.has(p.id));
        if(p){station.visitorId=p.id;station.elapsed=0;station.inspected=false;station.extra=false;occupied.add(p.id);}
      }
      const person=this.person(station.visitorId);if(!person)continue;
      station.elapsed=Math.min(f.security.duration*(station.extra?2:1),station.elapsed+dt);
      if(station.extra&&station.elapsed>=f.security.duration*2){station.extra=false;station.inspected=true;}
      if(f.security.controlled===station.id)continue;
      if(station.elapsed>=f.security.duration){station.inspected=true;if(this.prohibited(person))this.returnToLocker(station,person);else this.clear(station,person);}
    }
  }
  board(ids) {
    const s=this.engine.state,f=s.flow,set=new Set(ids);
    for(const p of f.people)if(set.has(p.id)){this.engine.score.commit(p.id,p.arrivedAt);}
    f.people=f.people.filter(p=>!set.has(p.id));f.order=f.order.filter(id=>!set.has(id));
  }
}

export function validateFlow(s,assert) {
  const f=s.flow,show=f?.preshow;assert(f&&show&&Array.isArray(f.people)&&f.people.length===s.visitors.queue,'flux visiteurs incohérent.');
  assert(Number.isInteger(f.ratio)&&f.ratio>=1&&f.ratio<=10&&Number.isInteger(f.mergeCursor)&&f.mergeCursor>=0&&f.mergeCursor<=f.ratio,'fusion des files invalide.');
  const ids=new Set();
  for(const p of f.people){assert(Number.isSafeInteger(p.id)&&p.id>0&&p.id<=s.visitors.totalArrived&&!ids.has(p.id),'identité de visiteur dupliquée.');ids.add(p.id);assert(['standard','fast'].includes(p.lane)&&FLOW_STAGES.includes(p.stage)&&Number.isFinite(p.arrivedAt)&&p.arrivedAt>=0&&p.arrivedAt<=s.time&&typeof p.recheck==='boolean'&&Array.isArray(p.inventory)&&p.inventory.every(i=>Number.isInteger(i)&&i>=0&&i<INVENTORY.length),'visiteur invalide.');}
  const order=f.people.filter(p=>['lockers','security','ready'].includes(p.stage)||p.transit&&p.transit.to!=='preshow');
  assert(Array.isArray(f.order)&&f.order.length===order.length&&new Set(f.order).size===f.order.length&&f.order.every(id=>order.some(p=>p.id===id)),'ordre après préshow invalide.');
  assert(PRESHOW_STATES.includes(show.state)&&typeof show.auto==='boolean'&&Number.isInteger(show.capacity)&&show.capacity>=1&&show.capacity<=120&&Number.isInteger(show.duration)&&show.duration>=5&&show.duration<=180,'configuration préshow invalide.');
  assert(Number.isFinite(show.elapsed)&&show.elapsed>=0&&Number.isFinite(show.admissionTimer)&&show.admissionTimer>=0&&show.admissionTimer<=1&&Number.isSafeInteger(show.cycles)&&show.cycles>=0,'temporisation préshow invalide.');
  assert(Array.isArray(show.batch)&&show.batch.length<=show.capacity&&new Set(show.batch).size===show.batch.length&&show.batch.length===f.people.filter(p=>p.stage==='preshow').length&&show.batch.every(id=>f.people.some(p=>p.id===id&&p.stage==='preshow')),'occupation préshow incohérente.');
  const phase=show.state==='INCIDENT'?show.resume:show.state;
  assert(PRESHOW_STATES.includes(phase)&&phase!=='INCIDENT'&&(show.state==='INCIDENT'||show.resume===null),'reprise préshow invalide.');
  assert(!['CLOSED','OPENING'].includes(phase)||!show.batch.length,'salle fermée encore occupée.');
  assert(!['READY','PLAYING','FINISHED','EXITING'].includes(phase)||show.batch.length>0||s.version>=5&&phase==='EXITING'&&f.people.some(p=>p.transit?.from==='preshow'),'préshow actif sans visiteur.');
  assert(phase!=='FULL'||show.batch.length+f.people.filter(p=>p.transit?.to==='preshow').length===Math.min(show.capacity,show.groupSize||show.capacity),'salle complète incohérente.');
  for(const key of ['standard','fast']){const l=f.lanes[key];assert(l&&typeof l.open==='boolean'&&Number.isInteger(l.capacity)&&l.capacity>=1&&l.capacity<=800&&Number.isInteger(l.rate)&&l.rate>=0&&l.rate<=120&&Number.isFinite(l.timer)&&l.timer>=0&&l.timer<=1&&Array.isArray(l.history)&&l.history.length<=120,'configuration de file invalide.');assert(f.people.filter(p=>p.lane===key&&p.stage==='queue').length<=l.capacity,'file saturée.');for(const n of ['arrived','admitted'])assert(Number.isSafeInteger(l[n])&&l[n]>=0, 'historique de file invalide.');assert(l.wait===null||Number.isFinite(l.wait)&&l.wait>=0,'attente invalide.');for(const h of l.history)assert(Number.isFinite(h.time)&&h.time>=0&&h.time<=s.time&&(h.wait===null||Number.isFinite(h.wait)&&h.wait>=0)&&Number.isInteger(h.count)&&h.count>=0,'point historique invalide.');}
  assert(s.visitors.queueOpen===f.lanes.standard.open&&s.visitors.arrivalRate===f.lanes.standard.rate,'file standard désynchronisée.');
  const sec=f.security;assert(sec&&[null,'SEC-01','SEC-02'].includes(sec.controlled)&&Number.isInteger(sec.duration)&&sec.duration>=1&&sec.duration<=15&&Array.isArray(sec.rules)&&sec.rules.length===7&&sec.rules.every(x=>typeof x==='boolean')&&Array.isArray(sec.stations)&&sec.stations.length===2,'sécurité invalide.');
  const atScanner=new Set();sec.stations.forEach((p,i)=>{assert(p.id===`SEC-0${i+1}`&&typeof p.open==='boolean'&&typeof p.inspected==='boolean'&&typeof p.extra==='boolean'&&Number.isFinite(p.elapsed)&&p.elapsed>=0&&p.elapsed<=30,'poste invalide.');if(p.visitorId!==null){assert(!atScanner.has(p.visitorId)&&f.people.some(x=>x.id===p.visitorId&&x.stage==='security'),'visiteur au scanner incohérent.');atScanner.add(p.visitorId);}});
  for(const p of f.people){const l=s.lockers.items.find(l=>l.assignedVisitor===p.id);assert(!['queue','preshow'].includes(p.stage)||!l,'casier attribué avant le préshow.');assert(!['security','ready'].includes(p.stage)||l?.phase==='STORED','sécurité avant le dépôt.');assert(p.stage!=='ready'||!p.inventory.some(i=>sec.rules[i]),'visiteur autorisé avec un objet interdit.');}
  const m=f.metrics;assert(m,'statistiques de flux absentes.');for(const key of ['checks','returns','penalties','waitSum','boarded','exited','historyTimer'])assert(Number.isFinite(m[key])&&m[key]>=0,'compteur de flux invalide.');
  if(s.version>=5) {
    const room=f.room;assert(room&&Number.isInteger(room.lockerCapacity)&&room.lockerCapacity>=40&&room.lockerCapacity<=120&&Number.isInteger(room.lockerBatch)&&room.lockerBatch>=1&&room.lockerBatch<=40&&room.securityCapacity===24&&room.readyCapacity===40&&room.travelDuration===2&&room.queueCapacity===1000,'capacités des pièces invalides.');
    assert(Number.isInteger(show.groupSize)&&show.groupSize>=1&&show.groupSize<=show.capacity&&Number.isInteger(show.entryRate)&&show.entryRate>=1&&show.entryRate<=10&&Number.isInteger(show.exitRate)&&show.exitRate>=1&&show.exitRate<=10&&typeof show.entranceOpen==='boolean'&&typeof show.exitOpen==='boolean','portes ou débits préshow invalides.');
    assert(phase!=='PLAYING'||!show.entranceOpen&&!show.exitOpen,'séance avec portes ouvertes.');
    for(const p of f.people){assert(p.stage==='transit'?p.transit&&['queue','preshow','lockers','security'].includes(p.transit.from)&&['preshow','lockers','security','ready'].includes(p.transit.to)&&Number.isFinite(p.transit.remaining)&&p.transit.remaining>=0&&p.transit.remaining<=2&&p.transit.duration===2:p.transit===null,'transit invalide.');}
    for(const [zone,cap]of [['preshow',show.capacity],['lockers',room.lockerCapacity],['security',room.securityCapacity],['ready',room.readyCapacity]])assert(f.people.filter(p=>p.stage===zone||p.transit?.to===zone).length<=cap,'destination réservée au-delà de sa capacité.');
    assert(Array.isArray(f.egress)&&f.egress.length<=140&&Number.isSafeInteger(m.departed)&&m.departed>=0&&m.departed<=s.visitors.transported+m.exited,'sorties invalides.');
    const egressIds=new Set();for(const p of f.egress){assert(Number.isSafeInteger(p.id)&&p.id>0&&p.id<=s.visitors.totalArrived&&!ids.has(p.id)&&!s.trains.some(t=>[...t.passengerIds,...t.boardingIds].includes(p.id))&&!egressIds.has(p.id)&&['unloading','retrieval','exiting'].includes(p.stage)&&Number.isFinite(p.remaining)&&p.remaining>=0&&p.remaining<=2,'visiteur sortant incohérent.');egressIds.add(p.id);}
  }
  for(const key of ['dispatches','deposits','checksHistory','admissions']){assert(Array.isArray(m[key])&&m[key].length<=2000,'fenêtre de débit invalide.');for(const e of m[key])assert(Number.isFinite(e.time)&&e.time>=0&&e.time<=s.time&&Number.isInteger(e.count)&&e.count>0,'événement de débit invalide.');}
}
