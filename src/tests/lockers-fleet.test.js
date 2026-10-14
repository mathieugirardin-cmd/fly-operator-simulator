import {describe,it,expect} from 'vitest';
import {validateSnapshot} from '../core/SimulationEngine.js';
import {SimulationEngine} from './test-engine.js';
import {LOCKER_CONFIG,FLEET_SIZE} from '../config/operations.js';
import {lockerSummary} from '../systems/LockerSystem.js';
import {getTrainPose} from '../rendering/TrackGeometry.js';

function open(auto=false) {
  const e=new SimulationEngine();e.command('INITIALIZE');e.command('OPEN');e.command('SET_ARRIVAL_RATE',{rate:0});
  // Prepare the initial cohort through the actual preshow, with locker intake paused.
  e.command('TOGGLE_LOCKER_INTAKE');e.command('SET_FLOW_CONFIG',{field:'capacity',value:48});
  e.command('SET_FLOW_CONFIG',{field:'groupSize',value:48});
  until(e,()=>e.state.flow.preshow.cycles===1&&e.state.flow.preshow.state==='CLOSED');
  e.command('TOGGLE_LOCKER_INTAKE');
  if(auto){until(e,()=>e.lockers.readyIds().length===20);e.command('SET_MODE',{mode:'auto'});e.command('TOGGLE_DISPATCH');}return e;
}
function until(e,predicate,seconds=300) {
  for(let i=0;i<seconds*10;i++){if(predicate())return;e.update(.1);}
  throw new Error('Le scénario ne progresse pas.');
}
describe('casiers exclusifs et parcours des affaires',()=>{
  it('réserve, ouvre puis referme un casier pour un seul visiteur',()=>{
    const e=open();e.command('TOGGLE_LOCKER_INTAKE');
    expect(e.command('ASSIGN_LOCKER',{lockerId:'C001'}).status).toBe('accepted');
    const l=e.lockers.get('C001');expect(l).toMatchObject({status:'RESERVED',assignedVisitor:1,doorOpen:false});
    expect(e.command('ASSIGN_LOCKER',{lockerId:'C001'}).status).toBe('rejected');
    e.update(LOCKER_CONFIG.reservationDuration);expect(l).toMatchObject({status:'OPEN',doorOpen:true,phase:'DEPOSIT'});
    e.update(LOCKER_CONFIG.depositDuration);expect(l).toMatchObject({status:'OCCUPIED',doorOpen:false,assignedVisitor:1});
    until(e,()=>e.lockers.readyIds().length===1);expect(e.lockers.readyIds()).toEqual([1]);expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('sature la préparation à 40 personnes et à six dépôts simultanés',()=>{
    const e=open();e.update(.1);
    expect(lockerSummary(e.state).reserved).toBe(6);expect(e.lockers.nextVisitor()).toBeNull();
    e.update(50);const owners=e.state.lockers.items.filter(l=>l.assignedVisitor!==null);
    expect(owners).toHaveLength(40);expect(new Set(owners.map(l=>l.assignedVisitor)).size).toBe(40);
    expect(e.state.visitors.queue).toBe(48);expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('bloque le premier visiteur en défaut et reprend son dépôt après intervention',()=>{
    const e=open();e.update(.1);const l=e.lockers.forVisitor(1);
    expect(e.command('FAULT_LOCKER',{lockerId:l.id}).status).toBe('accepted');
    e.update(40);expect(l).toMatchObject({status:'FAULT',assignedVisitor:1,elapsed:0});expect(e.lockers.readyIds()).toHaveLength(0);
    e.command('TOGGLE_GATES');expect(e.command('LOAD').status).toBe('pending');
    expect(e.command('ASSIGN_LOCKER',{lockerId:l.id}).status).toBe('rejected');
    expect(e.command('REPAIR_LOCKER',{lockerId:l.id}).status).toBe('accepted');
    until(e,()=>e.lockers.readyIds().length===20);expect(e.lockers.readyIds()).toHaveLength(20);
    expect(e.command('LOAD').status).toBe('accepted');expect(e.state.trains[0].boardingIds[0]).toBe(1);
    expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('conserve les affaires pendant le tour et un défaut de récupération, puis libère le bon casier',()=>{
    const e=open(true);until(e,()=>e.state.stats.dispatches===1);
    const train=e.state.trains[0],ids=[...train.passengerIds],l=e.lockers.forVisitor(ids[0]);
    expect(ids).toHaveLength(20);expect(l.phase).toBe('STORED');
    e.command('FAULT_LOCKER',{lockerId:l.id});e.command('TOGGLE_LOCKER_INTAKE');
    until(e,()=>e.state.visitors.transported>=20);
    expect(l).toMatchObject({phase:'RETRIEVAL',status:'FAULT',assignedVisitor:ids[0],doorOpen:false});
    e.update(10);expect(l.assignedVisitor).toBe(ids[0]);
    expect(ids.slice(1).every(id=>!e.lockers.forVisitor(id))).toBe(true);
    e.command('REPAIR_LOCKER',{lockerId:l.id});expect(l.doorOpen).toBe(true);
    e.update(LOCKER_CONFIG.retrievalDuration);expect(l).toMatchObject({phase:'FREE',assignedVisitor:null,doorOpen:false});
    expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('le mode visiteur choisit un casier disponible sans violer l’exclusivité',()=>{
    const e=open();e.command('SET_LOCKER_MODE',{mode:'visitor'});e.update(10);
    const owners=e.state.lockers.items.filter(l=>l.assignedVisitor!==null);
    expect(e.lockers.forVisitor(1).id).not.toBe('C001');
    expect(new Set(owners.map(l=>l.assignedVisitor)).size).toBe(owners.length);
    expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('une saturation complète empêche les attributions sans perdre les visiteurs',()=>{
    const e=open();for(const l of e.state.lockers.items)e.command('FAULT_LOCKER',{lockerId:l.id});
    e.update(40);expect(e.state.visitors.queue).toBe(48);expect(e.lockers.readyIds()).toHaveLength(0);
    expect(lockerSummary(e.state).faults).toBe(120);
    e.command('REPAIR_LOCKER',{lockerId:'C073'});e.update(3.5);
    until(e,()=>e.lockers.readyIds().length===1);expect(e.lockers.forVisitor(1).id).toBe('C073');expect(e.lockers.readyIds()).toEqual([1]);
  });
  it('fige le dépôt pendant une urgence et le reprend après réarmement',()=>{
    const e=open();e.update(1);e.command('EMERGENCY_STOP');const before=structuredClone(e.state.lockers);
    e.update(10);expect(e.state.lockers).toEqual(before);
    e.command('ACKNOWLEDGE');e.command('RESET_EMERGENCY');e.update(3);
    expect(lockerSummary(e.state).occupied).toBeGreaterThan(0);
  });
  it('restaure exactement une porte ouverte et un visiteur partiellement embarqué',()=>{
    const e=open(true);until(e,()=>e.state.visitors.boarding>0);e.update(.2);
    const copy=new SimulationEngine();copy.restore(JSON.parse(JSON.stringify(e.snapshot())));
    expect(copy.snapshot()).toEqual(e.snapshot());
    for(let i=0;i<1700;i++){e.update(.1);copy.update(.1);}
    expect(copy.snapshot()).toEqual(e.snapshot());
  });
  const corruptions=[
    ['casier manquant',s=>s.lockers.items.pop()],
    ['attribution dupliquée',s=>{s.lockers.items[1].assignedVisitor=s.lockers.items[0].assignedVisitor;}],
    ['porte incohérente',s=>{s.lockers.items[0].doorOpen=!s.lockers.items[0].doorOpen;}],
    ['voyant incohérent',s=>{s.lockers.items[0].indicatorState='green';}],
    ['propriétaire inconnu',s=>{s.lockers.items[0].assignedVisitor=999999;}],
    ['minuterie invalide',s=>{s.lockers.items[0].elapsed=Infinity;}],
    ['identités manquantes',s=>{s.trains[0].passengerIds=[];}],
    ['insertion incohérente',s=>{s.trains[0].serviceRequested=true;}],
  ];
  it.each(corruptions)('rejette une sauvegarde corrompue : %s',(_,corrupt)=>{
    const e=open(true);until(e,()=>e.state.stats.dispatches===1);const before=e.snapshot(),bad=structuredClone(before);corrupt(bad);
    expect(()=>e.restore(bad)).toThrow();expect(e.snapshot()).toEqual(before);
  });
  it('migre les passagers agrégés de la version 2 vers six trains et des casiers uniques',()=>{
    const e=open(true);until(e,()=>e.state.visitors.boarding>0&&e.state.trains[0].passengers>0);
    const old=e.snapshot();old.version=2;old.trains=old.trains.slice(0,4);delete old.lockers;
    old.trains.forEach(t=>{delete t.passengerIds;delete t.boardingIds;delete t.serviceRequested;});
    const copy=new SimulationEngine();copy.restore(old);
    expect(copy.state.version).toBe(5);expect(copy.state.trains).toHaveLength(6);
    expect(copy.state.visitors).toEqual(old.visitors);expect(copy.state.stats).toEqual(old.stats);
    expect(validateSnapshot(copy.snapshot())).toBe(true);copy.update(6);
    expect(copy.state.trains[0].passengerIds).toHaveLength(20);
  });
});

describe('flotte à six trains',()=>{
  it('offre six emplacements distincts au garage et peut annuler une insertion en attente',()=>{
    const e=open();expect(e.state.trains).toHaveLength(FLEET_SIZE);
    const poses=e.state.trains.map(t=>getTrainPose({...t,state:'STORED'}).position.join(','));expect(new Set(poses).size).toBe(6);
    expect(e.command('ADD_ALL_TRAINS').status).toBe('accepted');until(e,()=>e.state.trains[1].blockId==='TRANSFER');
    expect(e.state.trains[1].blockId).toBe('TRANSFER');expect(e.state.trains[5].serviceRequested).toBe(true);
    expect(e.command('CANCEL_ADD_TRAIN',{trainId:'T06'}).status).toBe('accepted');e.update(10);
    expect(e.state.trains[5]).toMatchObject({state:'STORED',serviceRequested:false});
  });
  it('insère automatiquement les six trains et les exploite vingt minutes sans collision ni attribution double',()=>{
    const e=open(true);e.command('SET_ARRIVAL_RATE',{rate:120});e.command('ADD_ALL_TRAINS');
    let maxActive=0;
    for(let i=0;i<12000;i++) {
      e.update(.1);const active=e.state.trains.filter(t=>t.blockId);maxActive=Math.max(maxActive,active.length);
      expect(new Set(active.map(t=>t.blockId)).size).toBe(active.length);
      if(i%100===0)expect(validateSnapshot(e.snapshot())).toBe(true);
    }
    expect(maxActive).toBe(6);expect(e.state.trains.every(t=>t.departures>=3)).toBe(true);
    expect(e.state.visitors.transported).toBeGreaterThan(400);
    expect(e.state.trains.every(t=>!t.serviceRequested)).toBe(true);
    e.command('REMOVE_TRAIN',{trainId:'T06'});until(e,()=>e.state.trains[5].state==='STORED');
    expect(e.state.trains[5].passengerIds).toHaveLength(0);expect(validateSnapshot(e.snapshot())).toBe(true);
  });
});
