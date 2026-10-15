import {describe,it,expect} from 'vitest';
import {SimulationEngine} from './test-engine.js';
import {validateSnapshot} from '../core/SimulationEngine.js';
import {queuePeople} from '../rendering/Queue2DRenderer.js';
const until=(e,p,seconds=300)=>{for(let i=0;i<seconds*10;i++){if(p())return;e.update(.1);}throw new Error('Scénario V4 bloqué');};
const open=()=>{const e=new SimulationEngine();for(const type of ['INITIALIZE','OPEN'])e.command(type);e.command('SET_ARRIVAL_RATE',{rate:0});return e;};
const auto=e=>{e.command('SET_MODE',{mode:'auto'});e.command('TOGGLE_DISPATCH');};
const manualShow=(e,capacity=8)=>{e.command('PRESHOW_AUTO');e.command('SET_FLOW_CONFIG',{field:'capacity',value:capacity});e.command('SET_FLOW_CONFIG',{field:'groupSize',value:capacity});e.command('PRESHOW_OPEN');until(e,()=>e.state.flow.preshow.state==='FULL'&&e.state.flow.preshow.batch.length===capacity);};
const finishShow=e=>{e.command('PRESHOW_CLOSE');until(e,()=>e.state.flow.preshow.state==='READY');e.command('PRESHOW_START');until(e,()=>e.state.flow.preshow.state==='FINISHED');e.command('PRESHOW_EXIT');until(e,()=>e.state.flow.preshow.state==='CLOSED');};
const assertConserved=e=>{const s=e.state,ids=[...s.flow.people.map(p=>p.id),...s.trains.flatMap(t=>[...t.passengerIds,...t.boardingIds])];expect(new Set(ids).size).toBe(ids.length);expect(ids.length+s.visitors.transported+s.flow.metrics.exited).toBe(s.visitors.totalArrived);expect(validateSnapshot(e.snapshot())).toBe(true);};

describe('flux V4, préshow et fusion des files',()=>{
  it('applique 3 standard / 1 Fast Pass, respecte la capacité et interdit tout dépôt avant la sortie',()=>{
    const e=open();e.command('ADD_VISITORS',{amount:20,lane:'fast'});manualShow(e,8);
    expect(e.state.flow.preshow.batch).toEqual([1,2,3,49,4,5,6,50]);expect(e.state.lockers.items.every(l=>l.phase==='FREE')).toBe(true);
    expect(e.command('SET_FLOW_CONFIG',{field:'capacity',value:4}).status).toBe('rejected');
    expect(e.command('PRESHOW_START').status).toBe('rejected');expect(e.command('PRESHOW_EXIT').status).toBe('rejected');
    finishShow(e);expect(e.state.flow.order).toEqual([1,2,3,49,4,5,6,50]);until(e,()=>e.lockers.readyIds().length===8);assertConserved(e);
  });
  it('sépare les arrivées, capacités, ouvertures et historiques des deux files',()=>{
    const e=open();e.command('PRESHOW_AUTO');e.command('SET_LANE',{lane:'fast',field:'capacity',value:5});e.command('SET_LANE',{lane:'fast',field:'rate',value:30});e.update(20);
    expect(e.state.flow.lanes.fast.arrived).toBe(5);expect(e.state.visitors.queue).toBe(53);expect(e.state.flow.lanes.fast.history.length).toBeGreaterThan(0);
    e.command('SET_LANE',{lane:'fast',field:'open',value:false});expect(e.command('ADD_VISITORS',{lane:'fast',amount:20}).status).toBe('rejected');
    expect(e.command('SET_LANE',{lane:'fast',field:'capacity',value:4}).status).toBe('rejected');assertConserved(e);
  });
  it('fige la présentation lors d’une urgence puis reprend sans perdre le groupe',()=>{
    const e=open();manualShow(e);e.command('PRESHOW_CLOSE');e.command('PRESHOW_START');e.update(2);e.command('EMERGENCY_STOP');const show=structuredClone(e.state.flow.preshow);e.update(20);expect(e.state.flow.preshow).toEqual(show);
    e.command('ACKNOWLEDGE');e.command('RESET_EMERGENCY');until(e,()=>e.state.flow.preshow.state==='FINISHED');assertConserved(e);
  });
  it('conserve chaque point, y compris les priorités ayant un identifiant plus récent',()=>{
    const e=open();e.command('ADD_VISITORS',{lane:'fast',amount:20});auto(e);
    for(let i=0;i<3000;i++){e.update(.1);if(i%50===0){const points=queuePeople(e.state);expect(points.waiting.length).toBe(e.state.visitors.queue);expect(points.boarding.length).toBe(e.state.visitors.boarding);assertConserved(e);}}
    expect(e.state.flow.lanes.fast.admitted).toBe(20);expect(e.state.visitors.transported).toBeGreaterThan(20);
  });
});
describe('deux postes et inventaire caché',()=>{
  it('maintient SEC-02 automatique pendant l’inspection SEC-01, pénalise une erreur et conserve le casier au retour',()=>{
    const e=open();e.command('SECURITY_CONTROL',{id:'SEC-01'});e.state.flow.people[0].inventory=[1];
    until(e,()=>e.state.flow.security.stations[0].visitorId===1);e.update(3);
    const post=e.state.flow.security.stations[0],l=e.lockers.forVisitor(1),lockerId=l.id;
    expect(e.command('SECURITY_ALLOW',{id:'SEC-01'}).status).toBe('rejected');
    e.command('SECURITY_INSPECT',{id:'SEC-01'});expect(e.command('SECURITY_ALLOW',{id:'SEC-01'}).status).toBe('rejected');expect(e.state.flow.metrics.penalties).toBe(1);
    e.update(4);expect(post.inspected).toBe(true);expect(e.state.flow.metrics.checks).toBeGreaterThan(0);
    e.command('SECURITY_RETURN',{id:'SEC-01'});expect(e.flow.person(1)).toMatchObject({stage:'transit',recheck:true,inventory:[]});
    e.command('SECURITY_CONTROL',{id:null});until(e,()=>e.flow.person(1)?.stage==='ready');expect(e.lockers.forVisitor(1).id).toBe(lockerId);expect(e.state.flow.metrics.returns).toBe(1);assertConserved(e);
  });
  it('un poste fermé retient son visiteur et le second continue avec un temps réel de contrôle',()=>{
    const e=open();e.command('SECURITY_CONTROL',{id:'SEC-01'});until(e,()=>e.state.flow.security.stations[0].visitorId!==null);
    const p=e.state.flow.security.stations[0],id=p.visitorId;e.command('SECURITY_TOGGLE',{id:p.id});const time=p.elapsed;e.update(8);expect(p.elapsed).toBe(time);expect(p.visitorId).toBe(id);expect(e.state.flow.metrics.checks).toBeGreaterThan(0);assertConserved(e);
  });
  it('changer de poste rend les autres opérateurs autonomes sans modifier l’horloge',()=>{
    const e=open(),time=e.state.time;e.command('SET_OPERATOR',{mode:'operator',post:'SEC-01'});expect(e.state.mode).toBe('auto');expect(e.state.flow.security.controlled).toBe('SEC-01');e.command('SET_OPERATOR',{mode:'operator',post:'preshow'});expect(e.state.flow.security.controlled).toBeNull();expect(e.state.flow.preshow.auto).toBe(false);expect(e.state.time).toBe(time);
  });
});
describe('retenues et maintenance',()=>{
  const loaded=()=>{const e=open();until(e,()=>e.stations.train()&&e.lockers.readyIds().length===20);e.command('TOGGLE_GATES');e.update(.8);e.command('LOAD');e.update(6);e.command('TOGGLE_GATES');e.update(.8);return e;};
  it.each([['MISPOSITION','HARNESS_RECLOSE'],['RECHECK','HARNESS_RECHECK'],['UNFIT','HARNESS_EXIT']])('traite %s sans autoriser une retenue non conforme', (cause,action)=>{
    const e=loaded();e.command('SET_HARNESS_CONFIG',{field:'harnessIncidents',value:true});for(const key of Object.keys(e.state.operations.probabilities))e.command('SET_HARNESS_CONFIG',{field:key,value:key===cause?1:0});
    e.command('CLOSE_HARNESSES');e.update(8);const t=e.stations.train(),seat=t.restraints.findIndex(r=>r.state===cause);expect(seat).toBeGreaterThanOrEqual(0);
    e.command('CHECK_ALL');e.command('CLEAR_PLATFORM');e.command('TOGGLE_DISPATCH');expect(e.command('DISPATCH').status).toBe('rejected');
    expect(e.command(action,{seat}).status).toBe('accepted');e.update(1);e.command('CHECK_ALL');e.command('CLEAR_PLATFORM');expect(e.command('DISPATCH').status).toBe('accepted');
    if(cause==='UNFIT'){expect(t.passengers).toBe(19);expect(e.state.flow.metrics.exited).toBe(1);}assertConserved(e);
  });
  it('un défaut technique reste bloquant jusqu’au technicien, à la vérification et à la remise en service',()=>{
    const e=loaded();e.command('SET_HARNESS_CONFIG',{field:'harnessIncidents',value:true});for(const key of Object.keys(e.state.operations.probabilities))e.command('SET_HARNESS_CONFIG',{field:key,value:key==='TECHNICAL'?1:0});e.command('CLOSE_HARNESSES');
    const i=e.state.maintenance.incidents[0];expect(i.equipment).toBe('harness:T01');e.command('CALL_MAINTENANCE',{id:i.id});until(e,()=>i.status==='VERIFY');expect(e.command('RESTORE_EQUIPMENT',{id:i.id}).status).toBe('rejected');e.command('VERIFY_REPAIR',{id:i.id});e.command('RESTORE_EQUIPMENT',{id:i.id});e.update(8);expect(e.harness.issue(e.stations.train())).toBeNull();assertConserved(e);
  });
  it('priorise les demandes sur deux techniciens et libère uniquement l’équipement réparé',()=>{
    const e=open();for(const equipment of ['SEC-01','doors','block:LAUNCH1'])e.command('INJECT_INCIDENT',{equipment});const [a,b,c]=e.state.maintenance.incidents;
    for(const i of [a,b,c])e.command('CALL_MAINTENANCE',{id:i.id});e.update(.1);
    expect(e.state.maintenance.technicians.map(t=>t.incidentId)).toContain(c.id);expect([a,b,c].filter(i=>i.status==='QUEUED')).toHaveLength(1);expect(e.blocks.canEnter('LAUNCH1','T01')).toBe(false);
    until(e,()=>c.status==='VERIFY');e.command('VERIFY_REPAIR',{id:c.id});e.command('RESTORE_EQUIPMENT',{id:c.id});expect(e.blocks.canEnter('LAUNCH1','T01')).toBe(true);expect(e.maintenance.has('SEC-01')).toBe(true);assertConserved(e);
  });
  it('la fermeture en incident du préshow conserve son groupe et reprend la présentation après réparation',()=>{
    const e=open();manualShow(e,5);e.command('PRESHOW_CLOSE');e.command('PRESHOW_START');e.update(2);e.command('INJECT_INCIDENT',{equipment:'audio'});e.update(.1);const batch=[...e.state.flow.preshow.batch],elapsed=e.state.flow.preshow.elapsed;
    const i=e.state.maintenance.incidents[0];e.command('CALL_MAINTENANCE',{id:i.id});until(e,()=>i.status==='VERIFY');expect(e.state.flow.preshow.elapsed).toBe(elapsed);expect(e.state.flow.preshow.batch).toEqual(batch);e.command('VERIFY_REPAIR',{id:i.id});e.command('RESTORE_EQUIPMENT',{id:i.id});until(e,()=>e.state.flow.preshow.state==='FINISHED');assertConserved(e);
  });
  it('le mode sans incidents n’en génère pas et le mode normal n’impose aucune échéance fixe',()=>{
    const e=open();e.update(600);expect(e.state.maintenance.incidents).toHaveLength(0);e.command('SET_FAILURE_LEVEL',{level:'normal'});e.state.maintenance.quietUntil=e.state.time+100;e.update(99);expect(e.state.maintenance.incidents).toHaveLength(0);
  });
});
describe('attentes, sauvegardes et endurance',()=>{
  it('mesure une attente à partir du débit puis affiche indéterminée en arrêt',()=>{
    const e=open();e.command('SET_ARRIVAL_RATE',{rate:60});e.command('SET_LANE',{lane:'fast',field:'rate',value:30});auto(e);e.command('ADD_ALL_TRAINS');e.update(240);
    expect(e.state.flow.lanes.standard.wait).not.toBeNull();expect(e.state.flow.lanes.fast.history.some(h=>h.wait!==null)).toBe(true);e.command('EMERGENCY_STOP');e.update(6);expect(e.state.flow.lanes.standard.wait).toBeNull();assertConserved(e);
  });
  it('reprend un préshow, une inspection et une intervention sans divergence',()=>{
    const e=open();e.command('SECURITY_CONTROL',{id:'SEC-01'});e.command('INJECT_INCIDENT',{equipment:'garage'});e.command('CALL_MAINTENANCE',{id:e.state.maintenance.incidents[0].id});e.update(19.3);
    const copy=new SimulationEngine();copy.restore(JSON.parse(JSON.stringify(e.snapshot())));for(let i=0;i<1000;i++){e.update(.1);copy.update(.1);}expect(copy.snapshot()).toEqual(e.snapshot());assertConserved(copy);
  });
  it.each([
    s=>{s.flow.people[1].id=s.flow.people[0].id;},s=>{s.flow.preshow.capacity=0;},s=>{s.flow.people[0].stage='ready';},s=>{s.flow.security.stations[0].visitorId=999;},s=>{s.maintenance.level='chaos';},s=>{s.operations.probabilities.UNFIT=2;},s=>{s.trains[0].restraints=[];},
  ])('refuse atomiquement une sauvegarde V4 altérée',alter=>{const e=open(),before=e.snapshot(),bad=e.snapshot();alter(bad);expect(()=>e.restore(bad)).toThrow();expect(e.snapshot()).toEqual(before);});
  it('exploite deux files et six trains pendant trente minutes sans perte ni double attribution',()=>{
    const e=open();auto(e);e.command('ADD_ALL_TRAINS');e.command('SET_ARRIVAL_RATE',{rate:60});e.command('SET_LANE',{lane:'fast',field:'rate',value:30});
    for(let i=0;i<18000;i++){e.update(.1);if(i%100===0)assertConserved(e);}expect(e.state.trains.every(t=>t.departures>=5)).toBe(true);expect(e.state.visitors.transported).toBeGreaterThan(500);expect(e.state.flow.metrics.returns).toBeGreaterThan(0);
  });
});
