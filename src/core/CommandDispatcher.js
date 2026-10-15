import {validateMusicSettings} from '../services/YouTubeMusicController.js';
import { transition } from './StateMachine.js';
import {refreshLocker} from '../systems/LockerSystem.js';

const presentAudio=p=>p&&(['volume','music'].includes(p.field)&&Number.isFinite(p.value)&&p.value>=0&&p.value<=1||p.field==='muted'&&typeof p.value==='boolean');
const result = (status, message) => ({ status, message });
const accepted = (message) => result('accepted', message);
const rejected = (message) => result('rejected', message);
const pending = (message) => result('pending', message);
const fault = (message) => result('fault', message);

export class CommandDispatcher {
  constructor(engine) { this.engine = engine; }
  departureIssue() {
    const { state, stations, blocks } = this.engine;
    const train = stations.train();
    if (!state.initialized) return 'Initialisez le système avant toute opération.';
    if (state.emergency) return "L'arrêt d'urgence doit être acquitté puis réarmé.";
    if (!state.open&&state.service.phase!=='TESTS') return "L'attraction est fermée : sélectionnez Tests ou ouvrez l’exploitation.";
    if (state.hold) return 'Le maintien en gare est actif.';
    if (!state.dispatchEnabled) return "L'autorisation générale de départ est désactivée.";
    if (!train) return "Aucun train immobilisé au quai d'embarquement.";
    if(state.service.phase==='TESTS'&&train.passengers)return 'Un test doit être effectué à vide.';
    if(state.service.phase==='OPERATION'&&!train.testValid)return 'Ce train doit terminer un test à vide avant le service visiteurs.';
    if(['gates','sensor','supervision',`harness:${train.id}`,`train:${train.id}`].some(id=>this.engine.maintenance.has(id)))return 'Un équipement nécessaire au départ est en maintenance.';
    if(state.station.gateMotion>1e-9||state.station.harnessMotion>1e-9)return 'Attendez la fin des mouvements des portiques et harnais.';
    if(state.visitors.boarding||train.boardingIds.length)return 'Des visiteurs traversent encore la zone de sécurité.';
    if (train.state === 'LOADING') return "L'embarquement est encore en cours.";
    if (state.station.gatesOpen) return "Fermez les portillons d'accès avant le départ.";
    if (train.harness !== 'closed') return 'Fermez les harnais avant le départ.';
    if (train.rows.some((checked) => !checked)) return 'Les dix rangées doivent être vérifiées.';
    if(this.engine.harness.issue(train))return this.engine.harness.issue(train);
    if (!state.station.platformClear) return 'Le quai doit être confirmé libre.';
    if (!train.available) return `${train.id} est indisponible.`;
    if (blocks.get('LOAD').blocked) return "Le canton d'embarquement est indisponible.";
    if (!blocks.canEnter('DEPART', train.id)) return 'Le canton de départ est occupé, réservé ou indisponible.';
    return null;
  }
  dispatch(type, payload = {}) {
    const { engine } = this;
    const { state, stations, blocks, trains, visitors } = engine;
    if (typeof type !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) return rejected('Commande invalide.');
    if(type==='SET_YOUTUBE'){
      const current=structuredClone(state.music);if(Object.hasOwn(current,payload.field)){current[payload.field]=payload.value;try{validateMusicSettings(current,(ok,message)=>{if(!ok)throw new Error(message);});state.music=current;return accepted('Réglages YouTube enregistrés.');}catch{return rejected('Réglage YouTube invalide.');}}return rejected('Réglage YouTube inconnu.');
    }
    if(type==='SET_AUDIO'){
      if(presentAudio(payload)){state.audio[payload.field]=payload.value;return accepted('Réglage audio appliqué.');}return rejected('Réglage audio invalide.');
    }
    if(type==='SET_RUNTIME'){
      if(payload.field==='paused'&&typeof payload.value==='boolean'||payload.field==='speed'&&[.5,1,2,4].includes(payload.value)){state.runtime[payload.field]=payload.value;return accepted(state.runtime.paused?'Simulation en pause.':`Simulation ×${state.runtime.speed}.`);}return rejected('Réglage temporel invalide.');
    }
    if (type === 'EMERGENCY_STOP') {
      if (state.emergency) return rejected("L'arrêt d'urgence est déjà actif.");
      state.emergency = true;
      state.emergencyAcknowledged = false;
      state.dispatchEnabled = false;
      state.stats.incidents += 1;
      state.trains.forEach((train) => { train.speed = 0; });
      return accepted("Arrêt d'urgence simulé · tous les mouvements sont suspendus.");
    }
    if (type === 'ACKNOWLEDGE') {
      state.emergencyAcknowledged = true;
      return accepted(state.emergency ? 'Alarme acquittée · réarmement manuel nécessaire.' : 'Journal des alarmes acquitté.');
    }
    if (type === 'RESET_EMERGENCY') {
      if (!state.emergency) return rejected("Aucun arrêt d'urgence à réarmer.");
      if (!state.emergencyAcknowledged) return rejected("Acquittez d'abord l'alarme avant le réarmement.");
      if(state.maintenance.incidents.some(i=>i.status!=='RESOLVED'&&(i.severity==='major'||['gates','sensor','supervision'].includes(i.equipment))))return rejected('Résolvez les défauts critiques avant de réarmer. L’acquittement ne répare pas les équipements.');
      state.emergency = false;
      state.emergencyAcknowledged = false;
      state.dispatchEnabled = false;
      return accepted('Système réarmé · autorisez les départs pour reprendre le service.');
    }
    if (type === 'INITIALIZE') {
      if (state.emergency) return fault("Réarmez l'arrêt d'urgence avant l'initialisation.");
      if (state.initialized) return rejected('Le système est déjà initialisé.');
      state.initialized = true;
      state.service.phase='PREPARATION';
      return accepted('Initialisation réussie · acheminement de T01 vers la gare.');
    }
    if (!state.initialized) return rejected('Initialisez le système avant toute opération.');
    if (type === 'CLOSE') {
      if (!state.open) return rejected("L'attraction est déjà fermée.");
      state.open = false;
      state.service.phase='PREPARATION';
      state.dispatchEnabled = false;
      return accepted('Attraction fermée · les trains en parcours terminent leur cycle.');
    }
    if(type==='TOGGLE_QUEUE') {
      state.visitors.queueOpen=!state.visitors.queueOpen;
      state.flow.lanes.standard.open=state.visitors.queueOpen;
      return accepted(state.visitors.queueOpen?'Entrées dans la file autorisées lorsque l’attraction est ouverte.':'Entrées suspendues · les visiteurs déjà en attente sont conservés.');
    }
    if(type==='SET_ARRIVAL_RATE') {
      if(!Number.isInteger(payload.rate)||payload.rate<0||payload.rate>120)return rejected('Choisissez un débit entier entre 0 et 120 visiteurs par minute.');
      state.visitors.arrivalRate=payload.rate;
      state.flow.lanes.standard.rate=payload.rate;state.flow.arrivals.totalRate=payload.rate;
      return accepted(`Arrivées réglées à ${payload.rate} visiteurs par minute.`);
    }
    if(type==='ADD_VISITORS') {
      if(!state.open||!state.flow.lanes[payload.lane||'standard']?.open||state.emergency)return rejected('Ouvrez l’attraction et les entrées, puis réarmez toute urgence avant d’accueillir un groupe.');
      if(!Number.isInteger(payload.amount)||payload.amount<1||payload.amount>40)return rejected('Un groupe doit comprendre entre 1 et 40 visiteurs.');
      const count=visitors.add(payload.amount,payload.lane||'standard');
      return count?accepted(`${count} visiteurs ont rejoint la file${count<payload.amount?' · capacité atteinte':''}.`):pending('File complète · attendez des places avant un nouvel accueil.');
    }
    if(['CALL_MAINTENANCE','VERIFY_REPAIR','RESTORE_EQUIPMENT','SET_PRIORITY'].includes(type))return engine.maintenance.command(type,payload);
    if (state.emergency) return fault("Commande bloquée par l'arrêt d'urgence. Acquittez puis réarmez le système.");
    const admissionResult=engine.admissions.command(type,payload);if(admissionResult)return admissionResult;
    const flowResult=engine.flow.command(type,payload);if(flowResult)return flowResult;
    const serviceResult=engine.service.command(type,payload);if(serviceResult)return serviceResult;
    const maintenanceResult=engine.maintenance.command(type,payload);if(maintenanceResult)return maintenanceResult;
    const harnessResult=engine.harness.command(type,payload);if(harnessResult)return harnessResult;
    if(type==='SET_LOCKER_MODE') {
      if(!['auto','visitor'].includes(payload.mode))return rejected('Mode d’attribution des casiers invalide.');
      state.lockers.mode=payload.mode;return accepted(payload.mode==='auto'?'Attribution des casiers automatique.':'Choix du casier simulé pour chaque visiteur.');
    }
    if(type==='TOGGLE_LOCKER_INTAKE') {
      state.lockers.intakeOpen=!state.lockers.intakeOpen;
      return accepted(state.lockers.intakeOpen?'Nouvelles attributions de casiers autorisées.':'Attributions suspendues · dépôts en cours et récupérations maintenus.');
    }
    if(['ASSIGN_LOCKER','FAULT_LOCKER','REPAIR_LOCKER'].includes(type)) {
      const locker=engine.lockers.get(payload.lockerId);if(!locker)return rejected('Casier inconnu.');
      if(type==='ASSIGN_LOCKER')return engine.lockers.assign(locker)?accepted(`${locker.id} attribué exclusivement au visiteur ${locker.assignedVisitor}.`):rejected('Casier indisponible, zone de dépôt pleine ou aucun visiteur à préparer.');
      if(type==='FAULT_LOCKER') {
        if(locker.fault)return rejected('Ce casier est déjà en défaut.');
        locker.fault='Porte bloquée (simulation)';state.stats.incidents++;refreshLocker(locker);
        return accepted(`${locker.id} · porte bloquée simulée ; attribution conservée.`);
      }
      if(!locker.fault)return rejected('Ce casier ne nécessite aucune intervention.');
      if(engine.maintenance.has(`locker:${locker.id}`))return rejected('Ce casier attend la procédure de maintenance et sa vérification finale.');
      locker.fault=null;refreshLocker(locker);return accepted(`${locker.id} débloqué · reprise de son cycle, sans perdre les affaires.`);
    }
    if(type==='ADD_ALL_TRAINS') {
      const available=state.trains.filter(t=>t.state==='STORED'&&t.available);
      if(state.open&&available.some(t=>!t.testValid))return rejected('Fermez l’admission et testez les trains non qualifiés avant leur mise en service.');
      if(!available.length)return rejected('Tous les trains disponibles sont déjà en service.');
      available.forEach(t=>t.serviceRequested=true);
      return accepted(`${available.length} train(s) en attente d’insertion · mise en service progressive selon les cantons.`);
    }
    if(type==='CANCEL_ADD_TRAIN') {
      const train=state.trains.find(t=>t.id===payload.trainId);
      if(!train?.serviceRequested)return rejected('Aucune insertion en attente pour ce train.');
      train.serviceRequested=false;return accepted(`Insertion de ${train.id} annulée.`);
    }
    if (type === 'OPEN') {
      if (state.open) return rejected("L'attraction est déjà ouverte.");
      const issue=engine.service.openingIssue();if(issue)return rejected(issue);
      state.open = true;
      state.service.phase='OPERATION';
      return accepted('Attraction ouverte · accueil des visiteurs autorisé.');
    }
    if (type === 'SET_MODE') {
      if (!['manual', 'auto'].includes(payload.mode)) return rejected('Choisissez le mode manuel ou automatique.');
      state.mode = payload.mode;
      state.station.autoTimer = 0;
      return accepted(`Mode ${payload.mode === 'auto' ? 'automatique' : 'manuel'} sélectionné.`);
    }
    if (type === 'TOGGLE_DISPATCH') {
      if (!state.open && state.service.phase!=='TESTS' && !state.dispatchEnabled) return rejected("Sélectionnez Tests ou ouvrez l’attraction avant d’autoriser les départs.");
      state.dispatchEnabled = !state.dispatchEnabled;
      return accepted(state.dispatchEnabled ? 'Autorisation générale de départ activée.' : 'Autorisation générale de départ désactivée.');
    }
    if (type === 'TOGGLE_HOLD') {
      state.hold = !state.hold;
      return accepted(state.hold ? 'Maintien en gare activé · départs suspendus.' : 'Maintien en gare levé.');
    }
    if (type === 'ADD_TRAIN') {
      if(engine.maintenance.has('garage'))return pending('Garage indisponible ; réparez-le avant une insertion.');
      const train = state.trains.find((item) => item.id === payload.trainId);
      if (!train) return rejected('Identifiant de train inconnu.');
      if (train.state !== 'STORED') return rejected(`${train.id} est déjà en service.`);
      if (!train.available) return fault(`${train.id} est indisponible.`);
      if(state.open&&!train.testValid)return rejected('Ce train doit être testé à vide ; fermez l’admission puis passez en Préparation et Tests.');
      if (!blocks.enter(train, 'TRANSFER')) {train.serviceRequested=true;return pending(`${train.id} attend le transfert · insertion automatique dès sa libération.`);}
      transition(train, 'INSERTING');train.garageElapsed=0;
      train.removeRequested = false;
      train.serviceRequested = false;
      return accepted(`${train.id} inséré depuis le garage vers l'embarquement.`);
    }
    if (type === 'REMOVE_TRAIN') {
      if(engine.maintenance.has('garage'))return pending('Garage indisponible ; retrait impossible avant réparation.');
      const train = state.trains.find((item) => item.id === payload.trainId);
      if (!train) return rejected('Identifiant de train inconnu.');
      if (train.state === 'STORED') return rejected(`${train.id} est déjà au garage.`);
      if (train.removeRequested) return pending(`${train.id} attend son retour au débarquement pour être retiré.`);
      if (train.blockId === 'LOAD' && train.progress >= 1 && train.passengers === 0 && train.state !== 'LOADING') {
        if(!trains.store(train)){train.removeRequested=true;return pending('Un transfert garage est déjà engagé ; le retrait attend sa fin.');}
        stations.reset();
        return accepted(`${train.id} garé · emplacement d'embarquement libéré.`);
      }
      train.removeRequested = true;
      return pending(`${train.id} sera retiré après le prochain débarquement complet.`);
    }
    if (type === 'DISPATCH') {
      const issue = this.departureIssue();
      if (issue) return rejected(issue);
      const train = stations.train();
      if(state.service.phase==='TESTS')train.testInProgress=true;
      if (!blocks.enter(train, 'DEPART')) return pending('Le canton de départ vient de devenir indisponible.');
      transition(train, 'DISPATCHED');
      train.departures += 1;
      state.stats.dispatches += 1;
      state.stats.totalDispatchedPassengers += train.passengers;
      if(train.passengers)state.flow.metrics.dispatches.push({time:state.time,count:train.passengers});
      stations.reset();
      return accepted(`${train.id} · départ autorisé avec ${train.passengers}/20 passagers.`);
    }
    if(type==='PREPARE_PLATFORM'||type==='COMPLETE_SR')return stations.prepare(type==='COMPLETE_SR');
    const stationCommands = ['TOGGLE_GATES', 'LOAD', 'CLOSE_HARNESSES', 'OPEN_HARNESSES', 'CHECK_ROW', 'CHECK_ALL', 'CLEAR_PLATFORM'];
    if (!stationCommands.includes(type)) return rejected(`Commande inconnue : ${type}.`);
    const train = stations.train();
    if (!train) return rejected("Attendez l'immobilisation d'un train au quai d'embarquement.");
    if (blocks.get('LOAD').blocked || !train.available) return fault("Le train ou le canton d'embarquement est indisponible.");
    if(['TOGGLE_GATES','LOAD','CLOSE_HARNESSES','OPEN_HARNESSES','CHECK_ROW','CHECK_ALL','CLEAR_PLATFORM'].includes(type)&&(state.station.gateMotion>1e-9||state.station.harnessMotion>1e-9))return rejected('Mouvement en cours : attendez la confirmation.');
    if (type === 'TOGGLE_GATES') {
      if(engine.maintenance.has('gates'))return fault('Portillons indisponibles ; appelez la maintenance.');
      if (train.state === 'LOADING'&&!state.station.gatesOpen) return rejected('Les passages engagés terminent leur trajet ; attendez avant de rouvrir.');
      if (!state.station.gatesOpen && train.harness !== 'open') return rejected("Ouvrez les harnais avant d'ouvrir les portillons.");
      state.station.gatesOpen = !state.station.gatesOpen;state.station.gateMotion=.8;
      state.station.platformClear = false;
      if (state.station.gatesOpen) train.rows.fill(false);
      return accepted(state.station.gatesOpen ? "Portillons ouverts · accès au train autorisé." : 'Portillons fermés · contrôlez le quai.');
    }
    if (type === 'LOAD') {
      if (!state.open) return rejected("Ouvrez l'attraction avant l'embarquement.");
      if (train.state === 'LOADING') return rejected("L'embarquement est déjà en cours.");
      if (!state.station.gatesOpen || train.harness !== 'open') return rejected("Ouvrez les portillons et les harnais avant l'embarquement.");
      if (train.passengers >= train.capacity) return rejected('Le train a atteint sa capacité de vingt passagers.');
      if (state.visitors.queue === 0) return pending("Aucun visiteur disponible dans la file d'attente.");
      if(!state.station.prepared.length)return pending('Préparez le quai avec les visiteurs contrôlés avant de charger le train.');
      if(state.station.prepared.some(({id})=>{const p=engine.flow.person(id),locker=engine.lockers.forVisitor(id);return p?.stage!=='ready'||p.transit||p.inventory.some(i=>state.flow.security.rules[i])||locker?.phase!=='STORED'||locker.fault;}))return pending('Un visiteur préparé attend la remise en service de son casier ou un contrôle conforme.');
      visitors.load(train);
      return accepted(`${train.id} · embarquement de ${train.loadingTarget} visiteurs en cours.`);
    }
    if (type === 'CLOSE_HARNESSES') {
      if (train.state === 'LOADING') return rejected("Attendez la fin de l'embarquement avant de fermer les harnais.");
      if (state.station.gatesOpen) return rejected('Fermez les portillons avant de fermer les harnais.');
      if (train.harness === 'closed') return rejected('Les harnais sont déjà fermés.');
      train.harness = 'closed';state.station.harnessMotion=.8;state.station.platformClear=false;
      train.rows.fill(false);
      engine.harness.close(train);
      transition(train, 'CHECKING');
      return accepted('Harnais fermés · vérifiez les dix rangées.');
    }
    if (type === 'OPEN_HARNESSES') {
      if (train.state === 'LOADING') return rejected("L'embarquement est en cours, les harnais sont déjà ouverts.");
      if(train.harness==='open')return rejected('Les harnais sont déjà ouverts.');
      train.harness = 'open';state.station.harnessMotion=.8;
      train.rows.fill(false);
      state.station.platformClear = false;
      if (train.state !== 'EMPTY') transition(train, 'EMPTY');
      return accepted('Harnais ouverts · les contrôles des rangées sont annulés.');
    }
    if (type === 'CHECK_ROW' || type === 'CHECK_ALL') {
      if (train.harness !== 'closed' || state.station.gatesOpen) return rejected('Fermez les portillons et les harnais avant les vérifications.');
      if (type === 'CHECK_ROW') {
        if (!Number.isInteger(payload.index) || payload.index < 0 || payload.index > 9) return rejected('Numéro de rangée invalide.');
        if(!engine.harness.check(train,payload.index,train.rows[payload.index]))return rejected('Retenue non conforme : sélectionnez la place dans le panneau Harnais.');
      } else for(let i=0;i<10;i++)engine.harness.check(train,i);
      transition(train, train.rows.every(Boolean) ? 'READY' : 'CHECKING');
      return accepted(type === 'CHECK_ALL' ? `${train.rows.filter(Boolean).length}/10 rangées conformes ; les défauts restent bloquants.` : `Rangée ${payload.index + 1} ${train.rows[payload.index] ? 'vérifiée' : 'à revérifier'}.`);
    }
    if (type === 'CLEAR_PLATFORM') {
      if (train.state === 'LOADING' || state.visitors.boarding>0 || train.boardingIds.length>0 || state.station.gatesOpen) return rejected("Fermez les portillons et terminez l'embarquement avant le contrôle du quai.");
      state.station.platformClear = true;
      return accepted('Quai contrôlé et confirmé libre.');
    }
    return rejected('Commande non prise en charge.');
  }
}
