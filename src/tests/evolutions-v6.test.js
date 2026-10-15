import {describe,it,expect,vi} from 'vitest';
import {SimulationEngine,validateSnapshot} from '../core/SimulationEngine.js';
import {showPresentation} from '../core/PresentationState.js';
import {roomPopulation} from '../rendering/OccupancyRenderer.js';
import {KeyboardController} from '../ui/KeyboardController.js';
import {AudioDirector} from '../services/AudioDirector.js';
const until=(e,p,max=600)=>{for(let i=0;i<max*10;i++){if(p())return;e.update(.1);}throw new Error('Scénario bloqué');};
const base=()=>{const e=new SimulationEngine();e.command('INITIALIZE');e.command('SET_FAILURE_LEVEL',{level:'off'});e.command('SET_HARNESS_CONFIG',{field:'harnessIncidents',value:false});e.command('SET_ARRIVAL_RATE',{rate:0});return e;};
const open=()=>{const e=base();e.command('SET_SERVICE_PHASE',{phase:'TESTS'});until(e,()=>e.state.trains[0].testValid);e.command('OPEN');return e;};
function identities(e){const {zones,transits}=roomPopulation(e.state),ids=[...Object.values(zones).flat().map(p=>p.id),...transits.map(p=>p.id)];expect(new Set(ids).size).toBe(ids.length);expect(validateSnapshot(e.snapshot())).toBe(true);}

describe('préshow progressif, Fast Pass et plan vivant',()=>{
  it('vide un groupe entièrement, à débit borné, puis attend les derniers trajets',()=>{
    const e=open();e.command('SET_MODE',{mode:'manual'});e.command('PRESHOW_AUTO');e.command('PRESHOW_OPEN');
    until(e,()=>e.state.flow.preshow.batch.length===20);e.command('PRESHOW_CLOSE');until(e,()=>e.state.flow.preshow.state==='READY');e.command('PRESHOW_START');
    e.update(3);const show=e.state.flow.preshow;expect(showPresentation(e.state).label).toContain('00:05');expect(showPresentation(e.state).light).toBeLessThan(.3);
    const elapsed=show.elapsed;e.command('SET_RUNTIME',{field:'paused',value:true});e.update(10);expect(show.elapsed).toBe(elapsed);e.command('SET_RUNTIME',{field:'paused',value:false});
    until(e,()=>show.state==='FINISHED');expect(showPresentation(e.state).light).toBe(1);e.command('PRESHOW_EXIT');const total=e.state.visitors.totalArrived;
    let previous=20;for(let i=0;i<140;i++){e.update(.1);expect(previous-show.batch.length).toBeLessThanOrEqual(1);previous=show.batch.length;identities(e);}
    expect(show.state).toBe('CLOSED');expect(e.state.flow.people.filter(p=>p.transit?.from==='preshow')).toHaveLength(0);expect(e.state.visitors.totalArrived).toBe(total);
  });
  it('suspend devant un aval saturé, reprend sans nouvelle séance et termine sans doublon',()=>{
    const e=open();e.command('SET_MODE',{mode:'manual'});e.command('SET_FLOW_CONFIG',{field:'lockerCapacity',value:40});e.command('TOGGLE_LOCKER_INTAKE');e.command('ADD_VISITORS',{amount:40});
    until(e,()=>e.flow.occupancy('lockers')===38&&e.state.flow.preshow.state==='EXITING'&&e.state.flow.preshow.batch.length>0);
    const show=e.state.flow.preshow,cycle=show.cycles,count=show.batch.length;e.update(15);expect(show.batch.length).toBe(count);expect(showPresentation(e.state).blocked).toBe(true);identities(e);
    e.command('PRESHOW_AUTO');e.command('TOGGLE_LOCKER_INTAKE');until(e,()=>show.state==='CLOSED');expect(show.cycles).toBe(cycle);identities(e);
  });
  it('partage exactement 60 arrivées : 45 standard et 15 Fast Pass, avec des identités uniques',()=>{
    const e=open();e.command('PRESHOW_AUTO');e.command('SET_ARRIVALS',{field:'totalRate',value:60});e.command('SET_ARRIVALS',{field:'fastPercent',value:25});
    const initial=e.state.visitors.totalArrived;e.update(60);expect(e.state.visitors.totalArrived-initial).toBe(60);expect(e.state.flow.lanes.fast.arrived).toBe(15);expect(e.state.flow.lanes.standard.arrived).toBe(93);identities(e);
    e.command('SET_ARRIVALS',{field:'totalRate',value:0});e.command('PRESHOW_AUTO');until(e,()=>e.state.flow.lanes.fast.admitted>0);until(e,()=>e.state.score.visitors>0);expect(e.state.flow.metrics.boarded).toBeGreaterThan(0);identities(e);
  });
  it('garantit une place aux deux files dans le ratio configuré, sans inverser leur FIFO',()=>{
    const e=open();e.command('PRESHOW_AUTO');e.command('ADD_VISITORS',{amount:20,lane:'fast'});e.command('SET_FLOW_CONFIG',{field:'ratio',value:1});
    const selected=[];for(let i=0;i<10;i++){const p=e.flow.selectNext();selected.push(p);p.stage='preshow';e.state.flow.preshow.batch.push(p.id);}
    expect(selected.map(p=>p.lane)).toEqual(Array.from({length:10},(_,i)=>i%2?'fast':'standard'));expect(selected.filter(p=>p.lane==='fast').map(p=>p.id)).toEqual([49,50,51,52,53]);
  });
});

describe('score au franchissement de la sortie',()=>{
  it.each([[599,20],[600,10],[600.0000001,10]])('attente %s secondes : %s points, une seule fois', (wait,points)=>{
    const e=base();e.state.time=10;e.score.commit(1,10);e.state.time=10+wait;e.score.boarded(1);expect(e.state.score.total).toBe(0);e.score.returned(1);expect(e.state.score.total).toBe(0);e.state.time+=30;
    expect(e.score.exit(1)).toBe(points);expect(e.score.exit(1)).toBe(0);expect(e.state.score.total).toBe(points);
  });
  it('ne récompense ni test vide ni sortie sans tour',()=>{const e=base();e.score.commit(1,0);e.score.boarded(1);expect(e.score.exit(1)).toBe(0);expect(e.score.exit(2)).toBe(0);expect(e.state.score.total).toBe(0);});
  it.each([[30,100],[60,50],[120,25],[121,0]])('résolution en %s s : bonus %s unique, acquittement sans gain',(delay,points)=>{
    const e=base();e.command('INJECT_INCIDENT',{equipment:'SEC-01'});const i=e.state.maintenance.incidents[0];e.command('ACKNOWLEDGE');expect(e.state.score.total).toBe(0);
    i.status='READY';i.startedAt=0;e.state.time=delay;expect(e.command('RESTORE_EQUIPMENT',{id:i.id}).status).toBe('accepted');expect(e.state.score.total).toBe(points);e.command('RESTORE_EQUIPMENT',{id:i.id});e.score.incident(i);expect(e.state.score.total).toBe(points);
  });
  it('sauvegarde score et attentes en cours puis migre V5 sans récompense rétroactive',()=>{
    const e=open();until(e,()=>e.state.visitors.transported>=20);until(e,()=>e.state.score.visitors>=20);expect(e.state.score.total).toBe(e.state.score.visitors*20);const copy=new SimulationEngine();copy.restore(e.snapshot());expect(copy.state.score).toEqual(e.state.score);
    const old=e.snapshot();old.version=5;delete old.score;delete old.runtime;delete old.audio;delete old.flow.arrivals;delete old.flow.preshow.exitTotal;delete old.flow.room.lockerDoorOpen;delete old.station.gateMotion;delete old.station.harnessMotion;
    copy.restore(old);expect(copy.state.version).toBe(6);expect(copy.state.score.total).toBe(0);expect(validateSnapshot(copy.snapshot())).toBe(true);
    const bad=copy.snapshot();bad.score.total=-1;expect(()=>copy.restore(bad)).toThrow(/score/);expect(copy.state.score.total).toBe(0);
  });
});

describe('raccourcis et confirmations',()=>{
  const setup=()=>{const e=base();e.command('SET_SERVICE_PHASE',{phase:'TESTS'});e.command('SET_MODE',{mode:'manual'});until(e,()=>e.stations.train());return e;};
  const key=(code,repeat=false)=>({code,repeat,preventDefault:vi.fn(),target:{}});
  it('Entrée confirme, doit être relâchée, puis un nouveau appui expédie',()=>{
    const e=setup();e.command('CLOSE_HARNESSES');e.update(.8);e.command('CHECK_ALL');
    const k=new KeyboardController({state:()=>e.state,command:(...args)=>e.command(...args)}),first=key('Enter');k.down(first);expect(e.state.station.platformClear).toBe(true);expect(e.state.stats.dispatches).toBe(0);
    k.down(key('Enter',true));k.down(key('Enter'));expect(e.state.stats.dispatches).toBe(0);k.up(first);k.down(key('Enter'));expect(e.state.stats.dispatches).toBe(1);
  });
  it('bloque une inversion en mouvement et la confirmation tant que les passages ne sont pas terminés',()=>{
    const e=setup();e.command('TOGGLE_GATES');expect(e.command('LOAD').status).toBe('rejected');expect(e.command('CLEAR_PLATFORM').status).toBe('rejected');e.update(.8);expect(e.state.station.gateMotion).toBeLessThan(1e-9);
    e.command('TOGGLE_GATES');e.update(.8);e.command('CLOSE_HARNESSES');expect(e.command('OPEN_HARNESSES').status).toBe('rejected');expect(e.command('DISPATCH').status).toBe('rejected');e.update(.8);e.command('OPEN_HARNESSES');expect(e.state.station.platformClear).toBe(false);
  });
  it('ignore saisie, modal et répétitions ; ne bloque le scroll que pour une action traitée',()=>{
    const e=setup(),command=vi.fn();let blocked=true;const k=new KeyboardController({state:()=>e.state,command,blocked:()=>blocked});const event=key('Space');expect(k.down(event)).toBe(false);expect(event.preventDefault).not.toHaveBeenCalled();blocked=false;
    k.down(event);k.down(key('Space',true));k.down(key('Space'));expect(command).toHaveBeenCalledTimes(1);k.up(event);k.down(key('Space'));expect(command).toHaveBeenCalledTimes(2);
  });
});

describe('événements audio et horloge',()=>{
  it('émet une seule fois par transition réelle, y compris les commandes automatiques dans un step',()=>{
    const e=base(),effects=[];e.on('effect',x=>effects.push(x));e.command('SET_SERVICE_PHASE',{phase:'TESTS'});until(e,()=>e.state.trains[0].testValid);
    expect(effects.filter(x=>x.kind==='dispatch')).toHaveLength(e.state.stats.dispatches);const count=effects.length;e.command('PRESHOW_START');e.update(.01);expect(effects.length).toBe(count);
  });
  it('ne crée aucun contexte avant interaction, respecte sourdine, volumes, pause et notes sans doublons',async()=>{
    const gain=()=>({gain:{value:1,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()});
    const oscillators=[];const context={state:'running',currentTime:0,destination:{},createGain:gain,createOscillator:()=>{const o={frequency:{setValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn()};oscillators.push(o);return o;},resume:vi.fn(async()=>{context.state='running';}),suspend:vi.fn(async()=>{context.state='suspended';})};
    const factory=vi.fn(()=>context),a=new AudioDirector(factory),e=base();a.reset(e.state);a.effect({kind:'door',open:true},e.state);expect(factory).not.toHaveBeenCalled();await a.unlock();a.sync(e.state);a.effect({kind:'door',open:true},e.state);expect(oscillators).toHaveLength(2);
    e.state.audio.muted=true;context.currentTime=1;a.sync(e.state);a.effect({kind:'dispatch'},e.state);expect(oscillators).toHaveLength(2);expect(a.master.gain.value).toBe(0);
    e.state.audio.muted=false;e.state.runtime.paused=true;a.sync(e.state);expect(context.suspend).toHaveBeenCalledTimes(1);e.state.runtime.paused=false;e.state.audio.volume=.4;e.state.audio.music=.2;a.sync(e.state);expect(context.resume).toHaveBeenCalled();expect(a.master.gain.value).toBe(.4);expect(a.music.gain.value).toBe(.2);
    e.state.flow.preshow.state='PLAYING';a.effect({kind:'show'},e.state);a.sync(e.state);const n=oscillators.length;a.sync(e.state);expect(oscillators).toHaveLength(n);a.sync(e.state,true);expect(context.state).toBe('suspended');
  });
  it('pause et vitesse pilotent visiteurs, score, minuterie et éclairage par le même temps simulé',()=>{const e=base();e.command('SET_RUNTIME',{field:'speed',value:4});e.update(2);expect(e.state.time).toBeCloseTo(8);e.command('SET_RUNTIME',{field:'paused',value:true});const s=e.snapshot();e.update(20);expect(e.snapshot()).toEqual(s);});
});
