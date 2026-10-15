import {describe,it,expect} from 'vitest';
import {SimulationEngine} from './test-engine.js';
import {SIMULATION_CONFIG,TRACK} from '../config/track.js';
import {queuePeople,queuePathPoint,QUEUE_PATH_LENGTH} from '../rendering/Queue2DRenderer.js';

function open() {
  const engine=new SimulationEngine();
  engine.command('INITIALIZE');engine.command('OPEN');
  return engine;
}
function conserved(engine) {
  const v=engine.state.visitors,people=queuePeople(engine.state);
  expect(people.waiting).toHaveLength(v.queue);
  expect(people.boarding).toHaveLength(v.boarding);
  expect(new Set([...people.waiting,...people.boarding].map(p=>p.id)).size).toBe(v.queue+v.boarding);
  expect(v.queue+v.boarding+v.transported+engine.state.trains.reduce((n,t)=>n+t.passengers,0)).toBe(v.totalArrived);
}
describe('file 2D reliée aux visiteurs réels de la simulation',()=>{
  it.each([0,30,60,120])('accueille exactement %i personnes en une minute au débit choisi',rate=>{
    const e=open();expect(e.command('SET_ARRIVAL_RATE',{rate}).status).toBe('accepted');
    e.update(60);expect(e.state.visitors.queue).toBe(SIMULATION_CONFIG.initialQueue+rate);conserved(e);
  });
  it('suspend les entrées sans supprimer la file, puis reprend sans rattrapage',()=>{
    const e=open();e.update(.5);e.command('TOGGLE_QUEUE');e.update(30);
    expect(e.state.visitors.queue).toBe(48);
    expect(e.command('ADD_VISITORS',{amount:20}).status).toBe('rejected');
    e.command('TOGGLE_QUEUE');e.update(.5);expect(e.state.visitors.queue).toBe(49);
    e.command('CLOSE');e.update(60);expect(e.state.visitors.queue).toBe(49);conserved(e);
  });
  it('borne les groupes à la capacité sans créer de visiteurs fantômes',()=>{
    const e=open();e.command('SET_ARRIVAL_RATE',{rate:0});
    e.command('PRESHOW_AUTO');e.command('SET_LANE',{lane:'standard',field:'capacity',value:240});
    for(let i=0;i<5;i++)expect(e.command('ADD_VISITORS',{amount:40}).status).toBe('accepted');
    expect(e.state.visitors.queue).toBe(240);expect(e.state.visitors.totalArrived).toBe(240);
    expect(e.command('ADD_VISITORS',{amount:20}).status).toBe('pending');
    const people=queuePeople(e.state);
    expect(Math.min(...people.waiting.map(p=>p.distance))).toBeGreaterThan(0);
    for(const p of people.waiting)expect(queuePathPoint(p.distance).every(Number.isFinite)).toBe(true);
    expect(queuePathPoint(-1)).toEqual(queuePathPoint(0));
    expect(queuePathPoint(QUEUE_PATH_LENGTH+10)).toEqual(queuePathPoint(QUEUE_PATH_LENGTH));conserved(e);
  });
  it.each([-1,121,NaN,Infinity,1.5,'60'])('rejette un débit invalide : %s',rate=>{
    const e=open();expect(e.command('SET_ARRIVAL_RATE',{rate}).status).toBe('rejected');
    expect(e.state.visitors.arrivalRate).toBe(60);
  });
  it('conserve les identités FIFO et chaque personne pendant embarquement, parcours et sortie',()=>{
    const e=open();e.command('SET_ARRIVAL_RATE',{rate:0});
    const initial=queuePeople(e.state).waiting.map(p=>p.id);
    e.command('SET_MODE',{mode:'auto'});e.command('TOGGLE_DISPATCH');
    let boardingSeen=false,arrivalAfterBoarding=false;
    for(let i=0;i<4200;i++) {
      e.update(.1);conserved(e);
      if(!boardingSeen&&e.state.visitors.boarding>0) {
        boardingSeen=true;
        const p=queuePeople(e.state);
        const loaded=e.state.trains[0].loadingTarget;
        expect(p.waiting.map(v=>v.id)).toEqual(initial.slice(loaded));
        expect(p.boarding.every(v=>initial.slice(0,loaded).includes(v.id))).toBe(true);
      }
      if(boardingSeen&&!arrivalAfterBoarding) {
        const existing=queuePeople(e.state).waiting.map(p=>p.id);
        e.command('ADD_VISITORS',{amount:20});
        expect(queuePeople(e.state).waiting.slice(0,existing.length).map(p=>p.id)).toEqual(existing);
        arrivalAfterBoarding=true;
      }
    }
    expect(boardingSeen).toBe(true);expect(e.state.visitors.transported).toBeGreaterThanOrEqual(40);
  });
  it('restaure les réglages, les personnes et la fraction d’arrivée',()=>{
    const e=open();e.command('SET_ARRIVAL_RATE',{rate:30});e.update(.7);e.command('TOGGLE_QUEUE');
    const copy=new SimulationEngine();copy.restore(e.snapshot());
    expect(copy.snapshot()).toEqual(e.snapshot());expect(queuePeople(copy.state)).toEqual(queuePeople(e.state));
    copy.update(20);expect(copy.state.visitors.queue).toBe(e.state.visitors.queue);
  });
  it('migre une sauvegarde de la première scène et refuse ses compteurs corrompus',()=>{
    const data=open().snapshot();data.version=1;data.trains=data.trains.slice(0,4);delete data.lockers;
    const dimensions={UNLOAD:[29,8],TRANSFER:[22,8],LOAD:[29,8],DEPART:[26,8],LAUNCH1:[48,19],COURSE1:[205,15],LAUNCH2:[49,22],COURSE2:[225,17],BRAKES:[43,7],RETURN:[25,7]};
    data.blocks.forEach(b=>{[b.length,b.maxSpeed]=dimensions[b.id];});
    delete data.visitors.queueOpen;delete data.visitors.arrivalRate;
    const e=new SimulationEngine();e.restore(data);
    expect(e.state.version).toBe(6);expect(e.state.trains).toHaveLength(6);expect(e.state.visitors.queueOpen).toBe(true);
    expect(e.state.blocks.map(b=>b.length)).toEqual(TRACK.map(b=>b.length));conserved(e);
    const before=e.snapshot();data.visitors.queue++;
    expect(()=>e.restore(data)).toThrow(/conservation/);expect(e.snapshot()).toEqual(before);
  });
});
