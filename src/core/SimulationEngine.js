import {AdmissionSystem,createLane,createPass,createFastScanner} from '../systems/AdmissionSystem.js';
import {createMusicSettings,validateMusicSettings} from '../services/YouTubeMusicController.js';
import {ScoreSystem,createScore,validateScore} from '../systems/ScoreSystem.js';
import {acousticState,acousticTransitions} from './PresentationState.js';
import { TRACK, NEXT_BLOCK, SIMULATION_CONFIG } from '../config/track.js';
import { EventBus } from './EventBus.js';
import { SimulationClock } from './SimulationClock.js';
import { TRAIN_STATES } from './StateMachine.js';
import { CommandDispatcher } from './CommandDispatcher.js';
import { createBlocks, BlockSystem } from '../systems/BlockSystem.js';
import { createTrains, TrainSystem } from '../systems/TrainSystem.js';
import { StationSystem } from '../systems/StationSystem.js';
import { VisitorSystem } from '../systems/VisitorSystem.js';
import { StatisticsSystem } from '../systems/StatisticsSystem.js';
import { FLEET_SIZE } from '../config/operations.js';
import {FlowSystem,createFlow,flowVisitor,validateFlow} from '../systems/FlowSystem.js';
import {MaintenanceSystem,createMaintenance,validateMaintenance} from '../systems/MaintenanceSystem.js';
import {HarnessSystem,createOperations,createRestraints,validateHarness} from '../systems/HarnessSystem.js';
import {ServiceSystem,createService,validateService} from '../systems/ServiceSystem.js';
import { LockerSystem,createLockerState,refreshLocker,validateLockers,queueFront } from '../systems/LockerSystem.js';

export { TRAIN_STATES } from './StateMachine.js';

function initialState(seed) {
  const blocks = createBlocks();
  blocks.find((block) => block.id === 'RETURN').occupiedBy = 'T01';
  return {
    version: 8, music:createMusicSettings(), score:createScore(), runtime:{paused:false,speed:1}, audio:{volume:.6,music:.35,muted:false}, time: 0, initialized: false, open: false, mode: 'manual',
    emergency: false, emergencyAcknowledged: false, hold: false, dispatchEnabled: false,
    trains: createTrains(), blocks,
    lockers:createLockerState(),
    flow:createFlow(SIMULATION_CONFIG.initialQueue),
    maintenance:createMaintenance(),operations:createOperations(),
    service:createService(),
    station: { prepared:[], gateMotion:0, harnessMotion:0, gatesOpen: false, platformClear: false, loadingProgress: 0, autoTimer: 0 },
    visitors: { queue: SIMULATION_CONFIG.initialQueue, boarding: 0, transported: 0, totalArrived: SIMULATION_CONFIG.initialQueue, queueOpen:true, arrivalRate:60 },
    stats: {
      transported: 0, dispatches: 0, fillRate: 0, activeTrains: 1, incidents: 0,
      totalDispatchedPassengers: 0, operatingTime: 0, interruptionTime: 0,
      hourlyThroughput: 0, estimatedWait: 0,
    },
    events: [], lastResult: null, rngState: Number.isFinite(seed) ? seed >>> 0 : 42,
    arrivalTimer: 0, clockAccumulator: 0, eventCounter: 0,
  };
}

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isFinite(value) && value >= min && value <= max;
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const boolean = (value) => typeof value === 'boolean';

export function validateSnapshot(data, definitions=TRACK, version=8) {
  const assert = (condition, message) => { if (!condition) throw new Error(`Sauvegarde incohérente : ${message}`); };
  assert(isRecord(data) && data.version === version, 'format ou version non pris en charge.');
  assert(finite(data.time), 'horloge invalide.');
  for (const field of ['initialized', 'open', 'emergency', 'emergencyAcknowledged', 'hold', 'dispatchEnabled']) {
    assert(boolean(data[field]), `indicateur ${field} invalide.`);
  }
  assert(['manual','auto'].includes(data.mode), "mode d'exploitation invalide.");
  assert(!data.open || data.initialized, "attraction ouverte sans initialisation.");
  assert(!data.dispatchEnabled || (data.initialized && (data.open||version>=5&&data.service?.phase==='TESTS') && !data.emergency), 'autorisation de départ incohérente.');
  assert(integer(data.rngState, 0, 0xffffffff), 'générateur aléatoire invalide.');
  assert(finite(data.clockAccumulator, 0, SIMULATION_CONFIG.fixedStep - Number.EPSILON), 'accumulateur temporel invalide.');
  assert(finite(data.arrivalTimer, 0, 1 + 1e-9), 'minuterie des arrivées invalide.');
  assert(integer(data.eventCounter), 'compteur des événements invalide.');
  const fleetSize=version>=3?FLEET_SIZE:4;
  assert(Array.isArray(data.trains) && data.trains.length === fleetSize, `${fleetSize} trains sont nécessaires.`);
  const trainIds = new Set(data.trains.map((train) => train?.id));
  assert(trainIds.size === fleetSize && Array.from({length:fleetSize},(_,i)=>`T0${i+1}`).every((id) => trainIds.has(id)), 'identifiants des trains invalides.');
  assert(Array.isArray(data.blocks) && data.blocks.length === TRACK.length, 'liste des cantons incomplète.');
  const blockIds = new Set(data.blocks.map((block) => block?.id));
  assert(blockIds.size === TRACK.length && TRACK.every((block) => blockIds.has(block.id)), 'identifiants des cantons invalides.');
  const blockMap = new Map(data.blocks.map((block) => [block.id, block]));
  const trainMap = new Map(data.trains.map((train) => [train.id, train]));
  const occupants = new Set();
  const reservations = new Set();
  for (const block of data.blocks) {
    const definition = definitions.find((item) => item.id === block.id);
    assert(block.type === definition.type && block.length === definition.length && block.maxSpeed === definition.maxSpeed, `configuration du canton ${block.id} modifiée.`);
    assert(typeof block.name === 'string' && boolean(block.blocked), `canton ${block.id} invalide.`);
    assert(block.occupiedBy === null || trainIds.has(block.occupiedBy), `occupant inconnu sur ${block.id}.`);
    assert(block.reservedBy === null || trainIds.has(block.reservedBy), `réservation inconnue sur ${block.id}.`);
    if (block.occupiedBy) {
      assert(!occupants.has(block.occupiedBy), `train ${block.occupiedBy} présent dans plusieurs cantons.`);
      assert(trainMap.get(block.occupiedBy).blockId === block.id, `occupation de ${block.id} désynchronisée.`);
      occupants.add(block.occupiedBy);
    }
    if (block.reservedBy) {
      assert(!block.occupiedBy && !reservations.has(block.reservedBy), `réservation contradictoire sur ${block.id}.`);
      const train = trainMap.get(block.reservedBy);
      assert(train.blockId && NEXT_BLOCK[train.blockId] === block.id && train.progress > 0.8, `réservation hors itinéraire sur ${block.id}.`);
      reservations.add(block.reservedBy);
    }
  }
  let trainPassengers = 0;
  let boarding = 0;
  let departures = 0;
  const routeStates = {
    RETURN: ['TRANSFER','BLOCKED'], TRANSFER: ['TRANSFER','BLOCKED','INSERTING'],
    DEPART: ['DISPATCHED','BLOCKED'], LAUNCH1: ['ON_TRACK','BLOCKED'],
    COURSE1: ['ON_TRACK','BLOCKED'], LAUNCH2: ['ON_TRACK','BLOCKED'],
    COURSE2: ['ON_TRACK','BLOCKED'], BRAKES: ['BRAKING','BLOCKED'],
  };
  for (const train of data.trains) {
    assert(isRecord(train) && TRAIN_STATES.includes(train.state), `état du train ${train.id} invalide.`);
    assert(train.capacity === 20 && integer(train.passengers, 0, 20), `capacité de ${train.id} dépassée.`);
    assert(finite(train.progress, 0, 1) && finite(train.speed, 0, 22) && finite(train.rotation, 0, 1), `position ou vitesse de ${train.id} invalide.`);
    assert(train.blockId === null || blockIds.has(train.blockId), `canton de ${train.id} inconnu.`);
    assert(boolean(train.available) && boolean(train.removeRequested) && boolean(train.unloadComplete), `indicateurs de ${train.id} invalides.`);
    if(version>=3)assert(boolean(train.serviceRequested)&&(!train.serviceRequested||(train.state==='STORED'&&train.blockId===null&&train.available)),`demande de service de ${train.id} incohérente.`);
    assert(train.waitingState === null || TRAIN_STATES.includes(train.waitingState), `attente de ${train.id} invalide.`);
    assert(['open','closed'].includes(train.harness), `harnais de ${train.id} invalides.`);
    assert(Array.isArray(train.rows) && train.rows.length === 10 && train.rows.every(boolean), `rangées de ${train.id} invalides.`);
    assert(train.harness === 'closed' || train.rows.every((checked) => !checked), `contrôles actifs avec harnais ouverts sur ${train.id}.`);
    assert(integer(train.departures) && finite(train.dwell, 0, SIMULATION_CONFIG.unloadingDuration + 1e-9), `historique de ${train.id} invalide.`);
    assert(finite(train.loadingElapsed, 0, SIMULATION_CONFIG.loadingDuration + 1e-9)
      && integer(train.loadingTarget, 0, 20) && integer(train.loadingTransferred, 0, train.loadingTarget), `embarquement de ${train.id} invalide.`);
    assert(!data.emergency || train.speed === 0, `train ${train.id} en mouvement pendant l'arrêt d'urgence.`);
    if (train.blockId === null) {
      assert(['STORED','MAINTENANCE'].includes(train.state) && train.speed === 0 && train.passengers === 0 && train.progress === 0, `train ${train.id} hors voie incohérent.`);
    } else {
      assert(blockMap.get(train.blockId).occupiedBy === train.id, `occupation manquante pour ${train.id}.`);
      assert(train.state !== 'STORED' && train.state !== 'MAINTENANCE', `train ${train.id} garé sur le circuit.`);
      if (train.state !== 'FAULT') {
        if (train.blockId === 'LOAD') {
          assert(train.progress < 1 ? train.state === 'TRANSFER' : ['EMPTY','LOADING','CHECKING','READY',...(version>=5?['GARAGING']:[])].includes(train.state), `phase d'embarquement de ${train.id} invalide.`);
        } else if (train.blockId === 'UNLOAD') {
          assert(train.progress < 1 ? train.state === 'TRANSFER' : ['UNLOADING','BLOCKED',...(version>=5?['GARAGING']:[])].includes(train.state), `phase de débarquement de ${train.id} invalide.`);
        } else assert(routeStates[train.blockId]?.includes(train.state), `phase de parcours de ${train.id} invalide.`);
      }
    }
    if (['CHECKING','READY'].includes(train.state)) assert(train.harness === 'closed', `harnais non fermés sur ${train.id}.`);
    if (train.state === 'READY') assert(train.rows.every(Boolean), `rangées non vérifiées sur ${train.id}.`);
    if (train.state === 'LOADING') {
      assert(train.harness === 'open' && train.loadingTarget > 0, `embarquement non autorisé sur ${train.id}.`);
      boarding += train.loadingTarget - train.loadingTransferred;
    }
    trainPassengers += train.passengers;
    departures += train.departures;
  }
  assert(isRecord(data.station), 'gare manquante.');
  assert(boolean(data.station.gatesOpen) && boolean(data.station.platformClear)
    && finite(data.station.loadingProgress, 0, 1) && finite(data.station.autoTimer, 0, SIMULATION_CONFIG.automaticActionInterval + 1e-9), 'état de gare invalide.');
  assert(!data.station.gatesOpen || !data.station.platformClear, 'quai libre avec portillons ouverts.');
  if(version>=8){
    const prepared=data.station.prepared,people=new Map((data.flow?.people||[]).map(p=>[p.id,p]));
    assert(Array.isArray(prepared)&&prepared.length<=20,'préparation du quai invalide.');
    const ids=new Set(),slots=new Set();for(const p of prepared){assert(isRecord(p)&&integer(p.id,1,data.visitors.totalArrived)&&integer(p.slot,0,19)&&!ids.has(p.id)&&!slots.has(p.slot)&&people.get(p.id)?.stage==='ready'&&!people.get(p.id)?.transit,'visiteur préparé dupliqué ou non contrôlé.');ids.add(p.id);slots.add(p.slot);}
  }
  const atPlatform = data.trains.find((train) => train.blockId === 'LOAD' && train.progress >= 1);
  assert(!data.station.gatesOpen || (atPlatform && atPlatform.harness === 'open'), 'portillons ouverts sans train accessible.');
  assert(!boarding || ((version>=5||data.station.gatesOpen) && atPlatform?.state === 'LOADING'), 'embarquement sans accès ouvert.');
  assert(isRecord(data.visitors) && integer(data.visitors.queue, 0, SIMULATION_CONFIG.queueCapacity)
    && integer(data.visitors.boarding, 0, 20) && integer(data.visitors.transported) && integer(data.visitors.totalArrived), 'compteurs visiteurs invalides.');
  assert(data.visitors.boarding === boarding, 'visiteurs en embarquement désynchronisés.');
  if(version>=2) assert(boolean(data.visitors.queueOpen) && integer(data.visitors.arrivalRate,0,120),'réglage des entrées de visiteurs invalide.');
  assert(data.visitors.queue + boarding + trainPassengers + data.visitors.transported + (version>=4?data.flow?.metrics.exited||0:0) === data.visitors.totalArrived, 'conservation des visiteurs violée.');
  if(version>=4)validateFlow(data,assert);
  if(version>=4){validateMaintenance(data,assert);validateHarness(data,assert);}
  if(version>=5)validateService(data,assert);
  if(version>=7)validateMusicSettings(data.music,assert);
  if(version>=6){
    validateScore(data,assert);
    assert(data.runtime&&typeof data.runtime.paused==='boolean'&&[.5,1,2,4].includes(data.runtime.speed),'vitesse ou pause invalide.');
    assert(data.audio&&typeof data.audio.muted==='boolean'&&finite(data.audio.volume,0,1)&&finite(data.audio.music,0,1),'audio invalide.');
    assert(finite(data.station.gateMotion,0,.8)&&finite(data.station.harnessMotion,0,.8),'animation de gare invalide.');
    assert(typeof data.flow.room.lockerDoorOpen==='boolean','porte casiers invalide.');
    const a=data.flow.arrivals;assert(a&&integer(a.totalRate,0,240)&&finite(a.fastPercent,0,100)&&finite(a.timer,0,1)&&finite(a.cursor,version>=7?-100:0,100),'arrivées partagées invalides.');
    assert(integer(data.flow.preshow.exitTotal,0,120),'lot sortant invalide.');
  }
  if(version>=3)validateLockers(data,assert);
  assert(isRecord(data.stats), 'statistiques absentes.');
  for (const field of ['transported','dispatches','activeTrains','incidents','totalDispatchedPassengers','hourlyThroughput','estimatedWait']) assert(integer(data.stats[field]), `statistique ${field} invalide.`);
  assert(finite(data.stats.fillRate, 0, 1) && finite(data.stats.operatingTime, 0, data.time + 1e-6)
    && finite(data.stats.interruptionTime, 0, data.stats.operatingTime + 1e-6), 'durées ou remplissage invalides.');
  assert(data.stats.transported === data.visitors.transported && data.stats.dispatches === departures, 'statistiques désynchronisées.');
  assert(data.stats.activeTrains === occupants.size, 'nombre de trains actifs incohérent.');
  assert(data.stats.totalDispatchedPassengers <= departures * 20 && data.stats.transported <= data.stats.totalDispatchedPassengers, 'compteurs de transport impossibles.');
  const expectedFill = departures ? data.stats.totalDispatchedPassengers / (departures * 20) : 0;
  assert(Math.abs(data.stats.fillRate - expectedFill) < 1e-9, 'taux de remplissage incohérent.');
  assert(Array.isArray(data.events) && data.events.length <= SIMULATION_CONFIG.eventLimit, 'journal invalide.');
  const ids = new Set();
  let previousId = 0;
  for (const event of data.events) {
    assert(isRecord(event) && integer(event.id, 1, data.eventCounter) && !ids.has(event.id) && event.id > previousId
      && finite(event.time, 0, data.time + 1e-6) && ['info','success','warning','error'].includes(event.level)
      && typeof event.message === 'string', 'événement invalide.');
    ids.add(event.id);
    previousId = event.id;
  }
  assert(data.lastResult === null || (isRecord(data.lastResult)
    && ['accepted','rejected','pending','fault'].includes(data.lastResult.status)
    && typeof data.lastResult.message === 'string'), 'résultat de commande invalide.');
  return true;
}

export class SimulationEngine {
  constructor({ seed = 42 } = {}) {
    this.state = initialState(seed);
    this.bus = new EventBus();
    this.clock = new SimulationClock(SIMULATION_CONFIG.fixedStep);
    this.blocks = new BlockSystem(this);
    this.trains = new TrainSystem(this);
    this.stations = new StationSystem(this);
    this.visitors = new VisitorSystem(this);
    this.flow = new FlowSystem(this);
    this.admissions = new AdmissionSystem(this);
    this.score = new ScoreSystem(this);
    this.maintenance = new MaintenanceSystem(this);
    this.harness = new HarnessSystem(this);
    this.service = new ServiceSystem(this);
    this.lockers = new LockerSystem(this);
    this.statistics = new StatisticsSystem(this);
    this.dispatcher = new CommandDispatcher(this);
    this.acoustics=acousticState(this.state);
    this.log('info', "Console prête · initialisez le système pour acheminer T01 vers la gare.");
  }
  on(type, callback) { return this.bus.on(type, callback); }
  update(deltaSeconds) {
    if(this.state.runtime.paused)return 0;
    const steps = this.clock.update(deltaSeconds*this.state.runtime.speed, (dt) => this.step(dt));
    this.state.clockAccumulator = this.clock.accumulator;
    return steps;
  }
  step(dt = SIMULATION_CONFIG.fixedStep) {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('Le pas de simulation doit être un nombre positif.');
    if(this.state.runtime.paused)return;
    this.state.time += dt;
    this.maintenance.update(dt);
    this.trains.update(dt);
    this.lockers.update(dt);
    this.flow.update(dt);
    this.visitors.update(dt);
    this.harness.update(dt);
    this.stations.update(dt);
    this.statistics.update(dt);
    this.flushEffects();
    this.state.clockAccumulator = this.clock.accumulator;
  }
  command(type, payload = {}) {
    const outcome = this.dispatcher.dispatch(type, payload);
    this.flushEffects();
    for(const train of this.state.trains)if(train.harness==='open')this.harness.syncOpen(train);
    this.state.lastResult = outcome;
    this.statistics.update(0);
    this.log(type === 'EMERGENCY_STOP' && outcome.status === 'accepted' ? 'error'
      : outcome.status === 'accepted' ? 'success' : outcome.status === 'fault' ? 'error' : 'warning', outcome.message);
    this.bus.emit('command', { type, payload, result: { ...outcome } });
    return { ...outcome };
  }
  log(level, message) {
    const { state } = this;
    if (state.events.at(-1)?.message === message) return;
    const event = { id: ++state.eventCounter, time: state.time, level, message };
    state.events.push(event);
    if (state.events.length > SIMULATION_CONFIG.eventLimit) state.events.splice(0, state.events.length - SIMULATION_CONFIG.eventLimit);
    this.bus.emit('event', { ...event });
  }
  flushEffects(){const next=acousticState(this.state),effects=acousticTransitions(this.acoustics,next);this.acoustics=next;for(const effect of effects)this.bus.emit('effect',effect);}
  snapshot() {
    this.state.clockAccumulator = this.clock.accumulator;
    return structuredClone(this.state);
  }
  restore(data) {
    // Tout valider avant de remplacer l'état vivant : un fichier invalide ne détruit pas la partie.
    let candidate;
    try { candidate = structuredClone(data); }
    catch { throw new Error('Sauvegarde incohérente : données non sérialisables.'); }
    if(candidate?.version===1) {
      // Validate the old scene's complete state before migrating its configurable distances.
      const oldDimensions={UNLOAD:[29,8],TRANSFER:[22,8],LOAD:[29,8],DEPART:[26,8],LAUNCH1:[48,19],COURSE1:[205,15],LAUNCH2:[49,22],COURSE2:[225,17],BRAKES:[43,7],RETURN:[25,7]};
      const oldTrack=TRACK.map(s=>({...s,length:oldDimensions[s.id][0],maxSpeed:oldDimensions[s.id][1]}));
      validateSnapshot(candidate,oldTrack,1);
      candidate.version=2;
      candidate.blocks=candidate.blocks.map(b=>({...b,name:TRACK.find(s=>s.id===b.id).name,length:TRACK.find(s=>s.id===b.id).length,maxSpeed:TRACK.find(s=>s.id===b.id).maxSpeed}));
      candidate.visitors.queueOpen=true;candidate.visitors.arrivalRate=60;
    }
    if(candidate?.version===2) {
      validateSnapshot(candidate,TRACK,2);
      candidate.lockers=createLockerState();
      // Earlier saves had aggregate passengers. Reconstruct unique historical IDs once.
      let nextId=candidate.visitors.transported+1;
      let nextBoarding=queueFront(candidate)-candidate.visitors.boarding;
      for(const train of candidate.trains) {
        train.serviceRequested=false;
        train.passengerIds=Array.from({length:train.passengers},()=>nextId++);
        train.boardingIds=Array.from({length:train.state==='LOADING'?train.loadingTarget-train.loadingTransferred:0},()=>nextBoarding++);
      }
      let index=0;
      for(const train of candidate.trains)for(const id of [...train.passengerIds,...train.boardingIds]) {
        const locker=candidate.lockers.items[index++];
        Object.assign(locker,{assignedVisitor:id,phase:'STORED'});refreshLocker(locker);
      }
      candidate.trains.push(...createTrains().slice(4));candidate.version=3;
    }
    if(candidate?.version===3) {
      delete candidate.flow;
      validateSnapshot(candidate,TRACK,3);
      candidate.flow=createFlow(0);
      const f=candidate.flow;f.lanes.standard.open=candidate.visitors.queueOpen;f.lanes.standard.rate=candidate.visitors.arrivalRate;f.lanes.standard.timer=candidate.arrivalTimer;f.lanes.standard.arrived=candidate.visitors.totalArrived;
      for(let id=queueFront(candidate);id<=candidate.visitors.totalArrived;id++) {
        const p=flowVisitor(id,candidate.time),l=candidate.lockers.items.find(x=>x.assignedVisitor===id);
        if(l){p.stage=l.phase==='STORED'?'security':'lockers';f.order.push(id);}f.people.push(p);
      }
      candidate.version=4;
      candidate.maintenance=createMaintenance();candidate.operations=createOperations();
      for(const t of candidate.trains){t.restraints=createRestraints();t.harnessTimer=0;t.passengerIds.forEach((id,i)=>{t.restraints[i]={visitorId:id,state:t.harness==='open'?'OPEN':t.rows[Math.floor(i/2)]?'VERIFIED':'CLOSED'};});}
    }
    if(candidate?.version===4) {
      validateSnapshot(candidate,TRACK,4);
      candidate.service={phase:candidate.open?'OPERATION':candidate.initialized?'PREPARATION':'CLOSED'};
      for(const t of candidate.trains){t.testValid=true;t.testInProgress=false;t.garageElapsed=0;}
      const f=candidate.flow;f.egress=[];f.room={lockerCapacity:120,securityCapacity:24,readyCapacity:40,lockerBatch:20,travelDuration:2,queueCapacity:1000};f.metrics.departed=candidate.visitors.transported;
      Object.assign(f.preshow,{groupSize:Math.min(20,f.preshow.capacity),entryRate:2,exitRate:2,entranceOpen:['OPENING','FILLING','FULL'].includes(f.preshow.state),exitOpen:f.preshow.state==='EXITING'});
      f.lanes.standard.capacity=Math.max(400,f.lanes.standard.capacity);for(const p of f.people)p.transit=null;
      candidate.version=5;
    }
    if(candidate?.version===5){
      validateSnapshot(candidate,TRACK,5);
      candidate.score=createScore();candidate.runtime={paused:false,speed:1};candidate.audio={volume:.6,music:.35,muted:false};
      Object.assign(candidate.station,{gateMotion:0,harnessMotion:0});
      const f=candidate.flow,total=f.lanes.standard.rate+f.lanes.fast.rate;
      f.arrivals={totalRate:total,fastPercent:f.lanes.fast.rate&&total?f.lanes.fast.rate/total*100:f.lanes.fast.open?20:0,timer:0,cursor:0};
      f.preshow.exitTotal=f.preshow.batch.length+f.people.filter(p=>p.transit?.from==='preshow').length;
      f.room.lockerDoorOpen=true;
      for(const t of candidate.trains)for(const id of [...t.passengerIds,...t.boardingIds])candidate.score.journeys[id]={arrivedAt:null,boardedAt:t.passengerIds.includes(id)?candidate.time:null,rode:false};
      for(const i of candidate.maintenance.incidents)i.scoreAwarded=i.status==='RESOLVED';
      candidate.version=6;
    }
    if(candidate?.version===6){
      validateSnapshot(candidate,TRACK,6);
      const f=candidate.flow;f.lanes.single=createLane(120);f.fastScanner=createFastScanner();
      Object.assign(f.arrivals,{singlePercent:0,singleCursor:0});
      Object.assign(f.preshow,{plannedRegular:null,singlePending:[],singleAssigned:[],singleExtra:0});
      for(const p of f.people)p.fastPass=p.lane==='fast'?{...createPass(),status:p.stage==='queue'?'valid':'used',consumed:p.stage!=='queue',checked:p.stage!=='queue'}:null;
      candidate.music=createMusicSettings();candidate.version=7;
    }
    if(candidate?.version===7){validateSnapshot(candidate,TRACK,7);candidate.station.prepared=[];candidate.version=8;}
    validateSnapshot(candidate);
    this.state = candidate;
    this.acoustics=acousticState(candidate);
    this.clock.accumulator = candidate.clockAccumulator;
    this.bus.emit('restored', this.snapshot());
    return this.snapshot();
  }
}
