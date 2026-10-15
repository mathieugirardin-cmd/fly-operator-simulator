import {describe,it,expect} from 'vitest';
import {SimulationEngine,validateSnapshot} from '../core/SimulationEngine.js';
import {getTrainPose} from '../rendering/TrackGeometry.js';
const until=(e,p,max=500)=>{for(let i=0;i<max*10;i++){if(p())return;e.update(.1);}throw new Error('Cycle opérateur bloqué.');};
const create=()=>{const e=new SimulationEngine();e.command('INITIALIZE');e.command('SET_FAILURE_LEVEL',{level:'off'});e.command('SET_HARNESS_CONFIG',{field:'harnessIncidents',value:false});e.command('SET_ARRIVAL_RATE',{rate:0});return e;};
const operational=e=>{e.command('SET_SERVICE_PHASE',{phase:'TESTS'});until(e,()=>e.state.trains.filter(t=>t.blockId).every(t=>t.testValid));expect(e.command('OPEN').status).toBe('accepted');};
describe('mise en service et pupitre intégré',()=>{
  it('interdit les visiteurs avant un test à vide par train, puis réalise le parcours complet',()=>{
    const e=create();expect(e.state.service.phase).toBe('PREPARATION');expect(e.command('OPEN').status).toBe('rejected');expect(e.command('ADD_VISITORS',{amount:20}).status).toBe('rejected');
    e.command('ADD_TRAIN',{trainId:'T02'});e.command('SET_SERVICE_PHASE',{phase:'TESTS'});expect(e.command('OPEN').status).toBe('rejected');
    for(let i=0;i<1000;i++){e.update(.1);expect(e.state.trains.every(t=>t.passengers===0)).toBe(true);}
    until(e,()=>e.state.trains.filter(t=>t.blockId).every(t=>t.testValid));expect(e.command('OPEN').status).toBe('accepted');
    until(e,()=>e.state.visitors.transported>0);until(e,()=>e.state.flow.metrics.departed>0);expect(validateSnapshot(e.snapshot())).toBe(true);
    expect(e.command('ADD_TRAIN',{trainId:'T03'}).status).toBe('rejected');
  });
  it('teste six trains sans bloquer la boucle, puis les admet en exploitation',()=>{
    const e=create();e.command('ADD_ALL_TRAINS');e.command('SET_SERVICE_PHASE',{phase:'TESTS'});until(e,()=>e.state.trains.every(t=>t.testValid)&&e.state.trains.every(t=>!t.serviceRequested));
    expect(e.command('OPEN').status).toBe('accepted');expect(e.state.service.phase).toBe('OPERATION');expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('un lot de 80 à deux personnes par seconde engage les passages sur quarante secondes et réserve les places',()=>{
    const e=create();operational(e);e.command('SET_MODE',{mode:'manual'});e.command('PRESHOW_AUTO');
    e.command('SET_FLOW_CONFIG',{field:'capacity',value:80});e.command('SET_FLOW_CONFIG',{field:'groupSize',value:80});e.command('ADD_VISITORS',{amount:40});
    e.command('PRESHOW_OPEN');e.update(1);e.update(39.9);
    expect(e.flow.occupancy('preshow')).toBeLessThan(80);e.update(.2);expect(e.flow.occupancy('preshow')).toBe(80);
    expect(e.state.flow.people.some(p=>p.transit?.to==='preshow')).toBe(true);e.command('PRESHOW_CLOSE');expect(e.command('PRESHOW_START').status).toBe('rejected');e.update(2);expect(e.command('PRESHOW_START').status).toBe('accepted');expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('retient le préshow devant des casiers saturés et conserve les identités pendant une fermeture de sortie',()=>{
    const e=create();operational(e);e.command('SET_MODE',{mode:'manual'});e.command('TOGGLE_DISPATCH');e.command('SET_FLOW_CONFIG',{field:'lockerCapacity',value:40});e.command('TOGGLE_LOCKER_INTAKE');
    for(let i=0;i<3;i++)e.command('ADD_VISITORS',{amount:40});until(e,()=>e.flow.occupancy('lockers')===38&&e.state.flow.preshow.state==='EXITING'&&e.state.flow.preshow.batch.length>0);
    const total=e.state.visitors.totalArrived,remaining=e.state.flow.preshow.batch.length;e.update(20);expect(e.state.flow.preshow.batch.length).toBe(remaining);expect(e.flow.occupancy('lockers')).toBe(38); // Two places remain protected for security returns.
    e.command('PRESHOW_AUTO');e.command('PRESHOW_EXIT_CLOSE');e.command('TOGGLE_LOCKER_INTAKE');e.update(20);expect(e.state.flow.preshow.exitOpen).toBe(false);expect(e.state.visitors.totalArrived).toBe(total);expect(validateSnapshot(e.snapshot())).toBe(true);
    e.command('PRESHOW_EXIT_RESUME');e.command('PRESHOW_AUTO');e.command('SET_MODE',{mode:'auto'});e.command('TOGGLE_DISPATCH');until(e,()=>e.state.visitors.transported>20);expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('fermer les portiques termine les passages engagés et bloque le départ jusqu’à la validation',()=>{
    const e=create();operational(e);e.command('SET_MODE',{mode:'manual'});until(e,()=>e.stations.train()&&e.lockers.readyIds().length>=10);
    const t=e.stations.train();e.command('TOGGLE_GATES');e.update(.8);e.command('LOAD');const count=t.loadingTarget;e.update(1);expect(e.command('TOGGLE_GATES').status).toBe('accepted');expect(e.state.station.gatesOpen).toBe(false);expect(e.command('DISPATCH').status).toBe('rejected');e.update(5);expect(t.passengers).toBe(count);
    e.command('CLOSE_HARNESSES');e.update(.8);e.command('CHECK_ALL');e.command('OPEN_HARNESSES');expect(t.rows.every(x=>!x)).toBe(true);expect(e.command('DISPATCH').status).toBe('rejected');expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('affiche un transfert garage progressif en conservant la section jusqu’à sa fin',()=>{
    const e=create();until(e,()=>!!e.stations.train());const t=e.stations.train(),block=t.blockId,origin=getTrainPose(t).position;
    e.command('REMOVE_TRAIN',{trainId:t.id});expect(t.state).toBe('GARAGING');e.update(1.5);expect(t.blockId).toBe(block);expect(getTrainPose(t).position).not.toEqual(origin);expect(e.blocks.get(block).occupiedBy).toBe(t.id);e.update(1.5);expect(t.state).toBe('STORED');expect(t.blockId).toBeNull();expect(e.blocks.get(block).occupiedBy).toBeNull();expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('sauvegarde les réservations de destination et reprend les déplacements sans divergence',()=>{
    const e=create();operational(e);until(e,()=>e.state.flow.people.some(p=>p.transit));const copy=new SimulationEngine();copy.restore(e.snapshot());for(let i=0;i<1200;i++){e.update(.1);copy.update(.1);}expect(copy.snapshot()).toEqual(e.snapshot());expect(validateSnapshot(copy.snapshot())).toBe(true);
  });
  it('anime l’insertion et garde le transfert exclusif pendant son acquisition',()=>{
    const e=create(),t=e.state.trains[1],origin=getTrainPose(t).position;e.command('ADD_TRAIN',{trainId:t.id});expect(t.state).toBe('INSERTING');expect(e.blocks.get('TRANSFER').occupiedBy).toBe(t.id);
    expect(e.command('ADD_TRAIN',{trainId:'T03'}).status).toBe('pending');e.update(1.5);expect(getTrainPose(t).position).not.toEqual(origin);expect(t.state).toBe('INSERTING');expect(e.state.trains[2].state).toBe('STORED');expect(validateSnapshot(e.snapshot())).toBe(true);
    until(e,()=>e.state.trains[2].state==='INSERTING');expect(e.state.trains.filter(t=>t.state==='INSERTING')).toHaveLength(1);expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('préserve les retours sécurité lorsque la pièce des casiers est remplie en amont',()=>{
    const e=create();operational(e);e.command('SET_MODE',{mode:'manual'});e.command('SET_FLOW_CONFIG',{field:'lockerCapacity',value:40});e.command('SECURITY_CONTROL',{id:'SEC-01'});e.state.flow.people[0].inventory=[1];
    for(let i=0;i<4;i++)e.command('ADD_VISITORS',{amount:40});until(e,()=>e.state.flow.security.stations[0].visitorId===1);e.update(160);
    expect(e.flow.occupancy('lockers')).toBeLessThanOrEqual(38);e.command('SECURITY_INSPECT',{id:'SEC-01'});expect(e.command('SECURITY_RETURN',{id:'SEC-01'}).status).toBe('accepted');
    expect(e.flow.person(1).transit.to).toBe('lockers');const locker=e.lockers.forVisitor(1).id;e.update(10);expect(e.lockers.forVisitor(1).id).toBe(locker);expect(e.flow.occupancy('lockers')).toBeLessThanOrEqual(40);expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('acquitter ne répare pas la cause critique et le réarmement ne redonne pas de départ',()=>{
    const e=create();e.command('INJECT_INCIDENT',{equipment:'gates'});const incident=e.state.maintenance.incidents[0];e.command('EMERGENCY_STOP');e.command('ACKNOWLEDGE');expect(e.command('RESET_EMERGENCY').status).toBe('rejected');
    e.command('CALL_MAINTENANCE',{id:incident.id});until(e,()=>incident.status==='VERIFY');e.command('VERIFY_REPAIR',{id:incident.id});e.command('RESTORE_EQUIPMENT',{id:incident.id});expect(e.command('RESET_EMERGENCY').status).toBe('accepted');expect(e.state.dispatchEnabled).toBe(false);expect(validateSnapshot(e.snapshot())).toBe(true);
  });
  it('migre une sauvegarde V4 en conservant les visiteurs et les trains déjà qualifiés',()=>{
    const e=create();operational(e);const old=e.snapshot();old.version=4;delete old.service;delete old.flow.egress;delete old.flow.room;for(const t of old.trains){delete t.testValid;delete t.testInProgress;delete t.garageElapsed;}
    const copy=new SimulationEngine();copy.restore(old);expect(copy.state.version).toBe(6);expect(copy.state.service.phase).toBe('OPERATION');expect(copy.state.visitors).toEqual(e.state.visitors);expect(copy.state.trains.every(t=>t.testValid)).toBe(true);expect(validateSnapshot(copy.snapshot())).toBe(true);
  });
});
