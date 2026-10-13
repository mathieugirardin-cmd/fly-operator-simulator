import {LOCKER_CONFIG,lockerId} from '../config/operations.js';
import {queuedIds} from './FlowSystem.js';

export function refreshLocker(locker) {
  locker.status=locker.fault?'FAULT':({FREE:'FREE',RESERVED:'RESERVED',DEPOSIT:'OPEN',STORED:'OCCUPIED',RETRIEVAL:'OPEN'})[locker.phase];
  locker.doorOpen=!locker.fault&&['DEPOSIT','RETRIEVAL'].includes(locker.phase);
  locker.indicatorState=locker.fault||locker.phase==='STORED'?'red':locker.phase==='FREE'?'green':'amber';
  return locker;
}
export const createLockerState=()=>({mode:'auto',intakeOpen:true,items:Array.from({length:LOCKER_CONFIG.count},(_,i)=>refreshLocker({id:lockerId(i),phase:'FREE',assignedVisitor:null,elapsed:0,fault:null}))});
export const queueFront=state=>state.visitors.totalArrived-state.visitors.queue+1;
export function lockerSummary(state) {
  const result={free:0,reserved:0,depositing:0,occupied:0,retrieving:0,faults:0,ready:0};
  const waiting=queuedIds(state);
  for(const l of state.lockers.items) {
    if(l.fault){result.faults++;continue;}
    if(l.phase==='FREE')result.free++;
    else if(l.phase==='RESERVED')result.reserved++;
    else if(l.phase==='DEPOSIT')result.depositing++;
    else if(l.phase==='RETRIEVAL')result.retrieving++;
    else {result.occupied++;if(waiting.has(l.assignedVisitor))result.ready++;}
  }
  return result;
}
export class LockerSystem {
  constructor(engine){this.engine=engine;}
  refresh(locker){return refreshLocker(locker);}
  get(id){return this.engine.state.lockers.items.find(l=>l.id===id);}
  forVisitor(id){return this.engine.state.lockers.items.find(l=>l.assignedVisitor===id);}
  nextVisitor() {
    const state=this.engine.state,waiting=queuedIds(state),assigned=new Set(state.lockers.items.map(l=>l.assignedVisitor));
    if(state.lockers.items.filter(l=>waiting.has(l.assignedVisitor)).length>=LOCKER_CONFIG.preparationCapacity)return null;
    if(state.lockers.items.filter(l=>['RESERVED','DEPOSIT'].includes(l.phase)).length>=LOCKER_CONFIG.depositCapacity)return null;
    for(const id of state.flow.order)if(this.engine.flow.person(id)?.stage==='lockers'&&!assigned.has(id))return id;
    return null;
  }
  assign(locker) {
    const state=this.engine.state;
    if(!state.initialized||!state.open||state.emergency||!locker||locker.phase!=='FREE'||locker.fault)return false;
    const visitor=this.nextVisitor();if(visitor===null)return false;
    Object.assign(locker,{phase:'RESERVED',assignedVisitor:visitor,elapsed:0});refreshLocker(locker);return true;
  }
  readyIds(limit=20) {
    const state=this.engine.state,ready=new Set(state.lockers.items.filter(l=>l.phase==='STORED'&&!l.fault).map(l=>l.assignedVisitor)),ids=[];
    for(const id of state.flow.order) {
      if(ids.length>=limit||!ready.has(id)||this.engine.flow.person(id)?.stage!=='ready')break;ids.push(id);
    }
    return ids;
  }
  retrieve(ids) {
    for(const id of ids) {
      const locker=this.forVisitor(id);
      if(!locker)throw new Error(`Casier manquant pour le visiteur ${id}.`);
      locker.phase='RETRIEVAL';locker.elapsed=0;refreshLocker(locker);
    }
  }
  update(dt) {
    const state=this.engine.state;if(!state.initialized||state.emergency)return;
    for(const l of state.lockers.items) {
      if(l.fault||['FREE','STORED'].includes(l.phase))continue;
      l.elapsed+=dt;
      const duration=l.phase==='RESERVED'?LOCKER_CONFIG.reservationDuration:l.phase==='DEPOSIT'?LOCKER_CONFIG.depositDuration:LOCKER_CONFIG.retrievalDuration;
      if(l.elapsed+1e-9<duration)continue;
      if(l.phase==='RESERVED')l.phase='DEPOSIT';
      else if(l.phase==='DEPOSIT') {l.phase='STORED';const person=this.engine.flow.person(l.assignedVisitor);if(person?.recheck)person.recheck=false;state.flow.metrics.deposits.push({time:state.time,count:1});}
      else {l.phase='FREE';l.assignedVisitor=null;}
      l.elapsed=0;refreshLocker(l);
    }
    for(const person of state.flow.people.filter(p=>p.recheck)) {
      if(state.lockers.items.filter(l=>['RESERVED','DEPOSIT'].includes(l.phase)).length>=LOCKER_CONFIG.depositCapacity)break;
      const l=this.forVisitor(person.id);if(l?.phase==='STORED'&&!l.fault){l.phase='DEPOSIT';l.elapsed=0;refreshLocker(l);}
    }
    if(!state.open||!state.lockers.intakeOpen)return;
    while(this.nextVisitor()!==null) {
      const free=state.lockers.items.filter(l=>l.phase==='FREE'&&!l.fault);if(!free.length)break;
      const index=state.lockers.mode==='auto'?0:(this.nextVisitor()*17)%free.length;
      if(!this.assign(free[index]))break;
    }
  }
}

export function validateLockers(state,assert) {
  const cfg=state.lockers;
  assert(cfg&&['auto','visitor'].includes(cfg.mode)&&typeof cfg.intakeOpen==='boolean','configuration des casiers invalide.');
  assert(Array.isArray(cfg.items)&&cfg.items.length===LOCKER_CONFIG.count,'liste des casiers incomplète.');
  const ids=new Set(),owners=new Set(),active=new Set(),waiting=queuedIds(state);
  for(const t of state.trains) {
    assert(Array.isArray(t.passengerIds)&&t.passengerIds.length===t.passengers,`identités des passagers de ${t.id} invalides.`);
    assert(Array.isArray(t.boardingIds)&&t.boardingIds.length===(t.state==='LOADING'?t.loadingTarget-t.loadingTransferred:0),`identités d’embarquement de ${t.id} invalides.`);
    for(const id of [...t.passengerIds,...t.boardingIds]) {
      assert(Number.isSafeInteger(id)&&id>=1&&id<=state.visitors.totalArrived&&!waiting.has(id)&&!active.has(id),'visiteur à bord dupliqué ou hors de la file.');active.add(id);
    }
  }
  for(const l of cfg.items) {
    assert(l&&typeof l==='object'&&!ids.has(l.id)&&/^C\d{3}$/.test(l.id)&&Number(l.id.slice(1))>=1&&Number(l.id.slice(1))<=LOCKER_CONFIG.count,'identifiant de casier invalide.');ids.add(l.id);
    assert(['FREE','RESERVED','DEPOSIT','STORED','RETRIEVAL'].includes(l.phase),'phase de casier invalide.');
    assert(l.fault===null||l.fault==='Porte bloquée (simulation)','défaut de casier inconnu.');
    const expected=refreshLocker({...l});
    assert(l.status===expected.status&&l.doorOpen===expected.doorOpen&&l.indicatorState===expected.indicatorState,'porte ou voyant de casier incohérent.');
    const limit=l.phase==='RESERVED'?LOCKER_CONFIG.reservationDuration:l.phase==='DEPOSIT'?LOCKER_CONFIG.depositDuration:l.phase==='RETRIEVAL'?LOCKER_CONFIG.retrievalDuration:0;
    assert(Number.isFinite(l.elapsed)&&l.elapsed>=0&&l.elapsed<=limit+1e-9,'temporisation de casier invalide.');
    if(l.phase==='FREE')assert(l.assignedVisitor===null,'casier libre encore attribué.');
    else {
      const owner=l.assignedVisitor;
      assert(Number.isSafeInteger(owner)&&owner>=1&&owner<=state.visitors.totalArrived&&!owners.has(owner),'attribution de casier dupliquée ou invalide.');owners.add(owner);
      if(['RESERVED','DEPOSIT'].includes(l.phase))assert(waiting.has(owner),'visiteur au casier déjà sorti de la file.');
      if(l.phase==='STORED')assert(waiting.has(owner)||active.has(owner),'casier occupé sans visiteur en attente ou à bord.');
      if(l.phase==='RETRIEVAL')assert(!waiting.has(owner)&&!active.has(owner),'récupération avant le débarquement.');
    }
  }
  for(const id of active)assert(cfg.items.some(l=>l.assignedVisitor===id&&l.phase==='STORED'),'passager sans affaires déposées dans un casier exclusif.');
  assert(cfg.items.filter(l=>['RESERVED','DEPOSIT'].includes(l.phase)).length<=LOCKER_CONFIG.depositCapacity,'zone de dépôt saturée.');
  assert(cfg.items.filter(l=>waiting.has(l.assignedVisitor)).length<=LOCKER_CONFIG.preparationCapacity,'zone de préparation saturée.');
}
