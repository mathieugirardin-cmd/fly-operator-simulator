import {describe,it,expect} from 'vitest';
import {SimulationEngine,validateSnapshot} from '../core/SimulationEngine.js';
import {singleRecommendation} from '../systems/AdmissionSystem.js';
import {VisitorVisualPool,individualBoardingProgress} from '../rendering/VisitorVisualPool.js';
import {roomPopulation} from '../rendering/OccupancyRenderer.js';
const until=(e,p,max=800)=>{for(let i=0;i<max*10;i++){if(p())return;e.update(.1);}throw new Error('Scénario bloqué');};
const prepared=()=>{const e=new SimulationEngine();e.command('INITIALIZE');e.command('SET_FAILURE_LEVEL',{level:'off'});e.command('SET_HARNESS_CONFIG',{field:'harnessIncidents',value:false});e.command('SET_ARRIVAL_RATE',{rate:0});e.command('SET_SERVICE_PHASE',{phase:'TESTS'});until(e,()=>e.state.trains[0].testValid);e.command('OPEN');return e;};
const check=e=>{expect(validateSnapshot(e.snapshot())).toBe(true);const {zones,transits}=roomPopulation(e.state),ids=[...Object.values(zones).flat().map(p=>p.id),...transits.map(p=>p.id)];expect(new Set(ids).size).toBe(ids.length);};
const fill37=()=>{const e=prepared();e.command('PRESHOW_AUTO');e.command('SET_FLOW_CONFIG',{field:'groupSize',value:37});e.command('ADD_VISITORS',{amount:20,lane:'single'});e.command('PRESHOW_OPEN');until(e,()=>e.state.flow.preshow.state==='FILLING');return e;};
describe('troisième file, complément et gare',()=>{
  it('37 personnes prévues : conseille 3, réserve une fois puis admet progressivement',()=>{
    const e=fill37();expect(singleRecommendation(e.state)).toMatchObject({planned:37,seats:40,need:3,count:3});
    expect(e.command('ADD_SINGLE_COMPLEMENT').status).toBe('accepted');expect(e.state.flow.preshow.singlePending).toHaveLength(3);expect(e.command('ADD_SINGLE_COMPLEMENT').status).toBe('rejected');
    const total=e.state.visitors.totalArrived;until(e,()=>e.state.flow.preshow.state==='FULL');expect(e.state.flow.people.filter(p=>p.stage==='preshow'||p.transit?.to==='preshow')).toHaveLength(40);e.update(2);expect(e.state.flow.preshow.batch).toHaveLength(40);expect(e.state.flow.people.filter(p=>p.stage==='preshow'&&p.lane==='single')).toHaveLength(3);expect(e.state.visitors.totalArrived).toBe(total);check(e);
    e.command('PRESHOW_CLOSE');e.command('PRESHOW_START');until(e,()=>e.state.flow.preshow.state==='FINISHED');e.command('PRESHOW_EXIT');until(e,()=>e.state.flow.people.some(p=>p.lane==='single'&&p.stage==='ready'));check(e);
  });
  it('limite le complément à la capacité restante et aux personnes disponibles',()=>{
    const e=prepared();e.command('PRESHOW_AUTO');e.command('SET_FLOW_CONFIG',{field:'capacity',value:38});e.command('SET_FLOW_CONFIG',{field:'groupSize',value:37});e.command('ADD_VISITORS',{amount:10,lane:'single'});e.command('PRESHOW_OPEN');until(e,()=>e.state.flow.preshow.state==='FILLING');
    expect(singleRecommendation(e.state)).toMatchObject({need:3,count:1,limited:true});e.command('ADD_SINGLE_COMPLEMENT');expect(e.command('ADD_SINGLE_COMPLEMENT').status).toBe('rejected');until(e,()=>e.state.flow.preshow.state==='FULL');expect(e.flow.occupancy('preshow')).toBe(38);check(e);
  });
  it('sert d’abord les réguliers prêts puis complète avec des Single Riders contrôlés',()=>{
    const e=prepared();e.command('SET_MODE',{mode:'manual'});until(e,()=>e.lockers.readyIds().length===20);const selected=e.state.flow.people.filter(p=>p.stage==='ready').slice(0,5);selected[0].lane='single';selected[1].lane='single';
    const ids=e.lockers.readyIds(20),regular=e.state.flow.people.filter(p=>p.stage==='ready'&&p.lane!=='single').map(p=>p.id);expect(ids.slice(0,regular.length)).toEqual(regular);expect(ids.slice(-2)).toEqual(selected.slice(0,2).map(p=>p.id));
    const waiting=e.state.flow.people.find(p=>p.stage==='queue');waiting.lane='single';expect(ids).not.toContain(waiting.id);check(e);
  });
  it('répartit 100 arrivées en 70 Standard, 20 Fast et 10 Single, sans perte à 100 %',()=>{
    const e=prepared();e.command('PRESHOW_AUTO');e.command('SET_ARRIVALS',{field:'totalRate',value:60});e.update(100);expect(e.state.flow.lanes.standard.arrived).toBe(118);expect(e.state.flow.lanes.fast.arrived).toBe(20);expect(e.state.flow.lanes.single.arrived).toBe(10);check(e);
    e.command('SET_ARRIVALS',{field:'singlePercent',value:80});const before=e.state.visitors.totalArrived;e.update(100);expect(e.state.visitors.totalArrived-before).toBe(100);expect(e.state.flow.lanes.fast.arrived).toBe(40);expect(e.state.flow.lanes.single.arrived).toBe(90);check(e);
  });
});
describe('scanner Fast Pass et conservation',()=>{
  it.each(['invalid','used'])('bloque un pass %s puis réoriente la même personne sans changer son attente',status=>{
    const e=prepared();e.command('PRESHOW_AUTO');e.command('ADD_VISITORS',{amount:1,lane:'fast'});until(e,()=>e.state.flow.fastScanner.visitorId!==null);e.command('FAST_AUTO');e.command('FAST_SET_PASS',{status});e.update(1);e.command('FAST_SCAN');
    const scan=e.state.flow.fastScanner,p=e.flow.person(scan.visitorId),id=p.id,arrivedAt=p.arrivedAt,total=e.state.visitors.totalArrived;expect(p.fastPass.checked).toBe(false);e.command('PRESHOW_OPEN');e.update(3);expect(p.stage).toBe('queue');expect(p.fastPass.consumed).toBe(false);
    expect(e.command('FAST_REROUTE').status).toBe('accepted');expect(p).toMatchObject({id,arrivedAt,lane:'standard',fastPass:null});expect(e.state.visitors.totalArrived).toBe(total);expect(e.state.flow.people.filter(v=>v.id===id)).toHaveLength(1);check(e);
  });
  it('ne consomme le pass qu’au franchissement et maintient le ratio 3:1',()=>{
    const e=prepared();e.command('PRESHOW_AUTO');e.command('ADD_VISITORS',{amount:4,lane:'fast'});e.update(1.1);const p=e.flow.person(e.state.flow.fastScanner.visitorId);expect(p.fastPass).toMatchObject({checked:true,consumed:false,status:'valid'});
    e.command('SET_FLOW_CONFIG',{field:'groupSize',value:8});e.command('PRESHOW_OPEN');until(e,()=>e.state.flow.preshow.batch.length===8);expect(e.state.flow.preshow.batch).toEqual([1,2,3,49,4,5,6,50]);expect(p.fastPass).toMatchObject({consumed:true,status:'used'});check(e);
  });
  it('migre V6 sans perdre les personnes, le score ou les attributions',()=>{
    const e=prepared();until(e,()=>e.state.visitors.transported>=20);const old=e.snapshot();old.version=6;delete old.music;delete old.flow.lanes.single;delete old.flow.fastScanner;delete old.flow.arrivals.singlePercent;delete old.flow.arrivals.singleCursor;delete old.flow.preshow.singleAssigned;delete old.flow.preshow.singlePending;delete old.flow.preshow.singleExtra;delete old.flow.preshow.plannedRegular;for(const p of old.flow.people)delete p.fastPass;
    const copy=new SimulationEngine();copy.restore(old);expect(copy.state.version).toBe(8);expect(copy.state.visitors).toEqual(e.state.visitors);expect(copy.state.score).toEqual(e.state.score);expect(copy.state.lockers).toEqual(e.state.lockers);expect(copy.state.flow.lanes.single.arrived).toBe(0);check(copy);
    const invalid=copy.snapshot();invalid.flow.arrivals.singlePercent=101;expect(()=>copy.restore(invalid)).toThrow();
  });
});
describe('identités de rendu et embarquement individuel',()=>{
  it('retire un visiteur sans réattribuer les meshes ni les emplacements des autres',()=>{
    let next=0;const pool=new VisitorVisualPool(()=>({mesh:++next}));const a=pool.acquire(1,'preshow'),b=pool.acquire(2,'preshow'),c=pool.acquire(3,'preshow');b.point=[1,2];pool.retain(new Set([2,3]));expect(pool.acquire(2,'preshow')).toBe(b);expect(pool.acquire(3,'preshow')).toBe(c);expect(b.point).toEqual([1,2]);expect(pool.acquire(4,'preshow').value).toBe(a.value);expect(b.slot).toBe(1);pool.reset();expect(pool.records.size).toBe(0);
  });
  it('échelonne les passagers engagés sans modifier leur temps de transit ni leur nombre',()=>{const t={passengerIds:[],boardingIds:[1,2,3,4],loadingTransferred:0,loadingTarget:4,loadingElapsed:2};const original=structuredClone(t);expect(individualBoardingProgress(t,1)).toBe(1);expect(individualBoardingProgress(t,2)).toBeGreaterThan(0);expect(individualBoardingProgress(t,3)).toBe(0);expect(individualBoardingProgress(t,4)).toBe(0);expect(t).toEqual(original);});
});
