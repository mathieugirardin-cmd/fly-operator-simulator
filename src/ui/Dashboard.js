import { icon } from './icons.js';
import { WORLD_LEVELS } from '../config/track.js';
import { FLEET_SIZE } from '../config/operations.js';

const labels = { STORED: 'Au garage', TRANSFER: 'Transfert', UNLOADING: 'Débarquement', EMPTY: 'Prêt à embarquer', LOADING: 'Embarquement', CHECKING: 'Vérification', READY: 'Prêt au départ', DISPATCHED: 'Départ', ON_TRACK: 'Sur le circuit', BRAKING: 'Freinage', BLOCKED: 'En attente', FAULT: 'Défaut', MAINTENANCE: 'Maintenance' };
export const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const timecode = seconds => new Date(Math.max(0, seconds) * 1000).toISOString().slice(11, 19);
const pill = (label, tone = '') => `<span class="pill ${tone}"><span class="led"></span>${label}</span>`;

export class Dashboard {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.selectedTrain = 'T01';
    this.selection = null;
    this.activeCamera = 'station';
    this.renderShell();
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (button) handlers.command(button.dataset.action, button.dataset.index !== undefined ? {index:Number(button.dataset.index)} : {});
      const mode = event.target.closest('[data-mode]');
      if (mode) handlers.command('SET_MODE', {mode:mode.dataset.mode});
      const camera = event.target.closest('[data-camera]');
      if (camera) this.setCamera(camera.dataset.camera);
      const train = event.target.closest('[data-train]');
      if (train) this.selectTrain(train.dataset.train);
      const garage = event.target.closest('[data-garage]');
      if (garage) handlers.command(garage.dataset.garage, {trainId:garage.dataset.id});
      const nav = event.target.closest('[data-nav]');
      if (nav) this.navigate(nav.dataset.nav);
      const ui = event.target.closest('[data-ui]');
      if (ui) this.uiAction(ui.dataset.ui);
    });
    root.querySelector('#camera-select').addEventListener('change', e => this.setCamera(e.target.value));
    root.querySelector('#quality').addEventListener('change', e => handlers.quality(e.target.value));
    for(const [value,label]of [['preshow','08 · Préshow'],['security','09 · Sécurité']]){const option=document.createElement('option');option.value=value;option.textContent=label;root.querySelector('#camera-select').append(option);}
    const operationsNav=document.createElement('button');operationsNav.className='nav-item';operationsNav.dataset.nav='operations-workbench';operationsNav.innerHTML=`${icon('dashboard')}<span>Opérations</span>`;root.querySelector('[data-nav="visitors"]').after(operationsNav);
    const operationsSettings=document.createElement('button');operationsSettings.className='button';operationsSettings.textContent='Réglages des files, du préshow et des incidents';operationsSettings.addEventListener('click',()=>{this.uiAction('close-dialog');this.navigate('operations-workbench');});root.querySelector('#settings-dialog').append(operationsSettings);
  }
  renderShell() {
    this.root.innerHTML = `
      <aside class="sidebar"><a class="monogram" href="#" aria-label="F.L.Y. accueil">F<span>↗</span></a><div class="rail-nav">
        <button class="nav-item active" data-nav="operations" title="Poste de commande">${icon('dashboard')}<span>Poste</span></button>
        <button class="nav-item" data-nav="map" title="Carte du circuit">${icon('route')}<span>Circuit</span></button>
        <button class="nav-item" data-nav="visitors" title="File d’attente 2D">${icon('people')}<span>File</span></button>
        <button class="nav-item" data-nav="lockers" title="Supervision des casiers">${icon('dashboard')}<span>Casiers</span></button>
        <button class="nav-item" data-nav="fleet" title="Gestion des trains">${icon('train')}<span>Trains</span></button>
        <button class="nav-item" data-nav="events" title="Journal d'exploitation">${icon('journal')}<span>Journal</span></button>
      </div><div class="rail-bottom"><button class="nav-item" data-ui="guide" title="Guide opérateur">${icon('help')}<span>Guide</span></button><span class="rail-version">V 0.4</span></div></aside>
      <div class="workspace"><header class="topbar"><div class="brand"><span class="brand-word">F.L.Y.</span><span class="brand-divider"></span><div>OPERATOR SIMULATOR<small>ROOKBURGH · POSTE CENTRAL</small></div></div>
        <div class="top-status" id="top-status"></div><div class="header-actions"><span class="session-time">${icon('clock')}<b id="sim-time">00:00:00</b><span>×1</span></span><button class="icon-button" data-ui="save" title="Sauvegarder la partie" aria-label="Sauvegarder la partie">${icon('save')}</button><button class="icon-button" data-ui="settings" title="Paramètres" aria-label="Paramètres">${icon('settings')}</button></div></header>
      <main><section class="page-heading"><div><div class="eyebrow">CENTRE D’EXPLOITATION <span>/</span> PUPITRE 01</div><h1>Poste de commande<span class="heading-dot">.</span></h1></div><div class="kpis"><div><span>VISITEURS TRANSPORTÉS</span><strong id="transported">0 <small>pers.</small></strong></div><div><span>TRAINS EN SERVICE</span><strong id="active-trains">01 <small>/ 06</small></strong></div><div><span>FILE D’ATTENTE</span><strong id="queue">48 <small>pers.</small></strong></div></div></section>
      <div class="operations-grid"><section class="camera-panel panel" id="operations"><div class="panel-bar"><div class="panel-title">${icon('camera')}<span>SUPERVISION VIDÉO</span></div><div class="live-indicator"><i></i>SCÈNE 3D EN DIRECT</div><button class="icon-button small" data-ui="expand-camera" title="Agrandir la scène" aria-label="Agrandir la scène">${icon('expand')}</button></div>
        <div class="viewport" id="viewport"><div class="scene-loading">Construction de la gare…</div><div class="camera-overlay"><span class="camera-number" id="camera-number">CAM 01</span><span id="camera-name">Gare d’embarquement</span></div><div class="scene-corner"><span class="record-dot"></span>ROOKBURGH <span id="scene-time">00:00:00</span></div><div class="scene-caption"><span class="crosshair">+</span><span>F.L.Y. <b>FLUGMASCHINE</b></span><span class="caption-rule"></span><span>SECTEUR 01</span></div><div class="scene-notice">Reconstitution libre · systèmes fictifs</div></div>
        <div class="camera-toolbar"><span class="toolbar-label">POINT DE VUE</span><button class="camera-tab active" data-camera="station">01 <span>Embarquement</span></button><button class="camera-tab" data-camera="unloading">02 <span>Débarquement</span></button><button class="camera-tab" data-camera="overview">${icon('route')} <span>Vue générale</span></button><select id="camera-select" aria-label="Choisir une caméra"><option value="station">01 · Embarquement</option><option value="unloading">02 · Débarquement</option><option value="launch1">03 · Lancement 1</option><option value="launch2">04 · Lancement 2</option><option value="garage">05 · Garage</option><option value="overview">06 · Vue générale</option><option value="lockers">07 · Casiers</option></select></div>
        <div class="operation-hint"><span class="hint-icon">${icon('help')}</span><div><strong id="hint-title">Bienvenue à votre poste.</strong><span id="hint-text">Initialisez les systèmes pour commencer votre service.</span></div><button data-ui="guide">Guide opérateur ${icon('arrow')}</button></div>
      </section>
      <aside class="control-panel panel"><div class="panel-bar"><div class="panel-title">PUPITRE DE DÉPART</div><span class="hardware-id">FLY / CP–01</span></div><div class="control-body"><div class="operation-switch"><div><span class="eyebrow">EXPLOITATION</span><strong id="operation-label">Systèmes à l’arrêt</strong></div><button class="power-button" data-action="INITIALIZE" id="initialize" title="Initialiser les systèmes">${icon('power')}</button></div><div class="operation-buttons"><button class="button" data-action="OPEN" id="open">Ouvrir l’attraction</button><button class="button subtle" data-action="CLOSE" id="close">Fermer</button></div>
      <div class="control-section"><div class="section-label">MODE DE DÉPART <span>01</span></div><div class="segmented"><button class="active" data-mode="manual">Manuel</button><button data-mode="auto">Automatique</button></div></div>
      <div class="control-section"><div class="section-label">TRAIN À QUAI <span id="station-train-id">—</span></div><div class="train-readout"><div><span id="station-state">En attente du train</span><strong><span id="station-passengers">00</span><small>/ 20 passagers</small></strong></div><div class="seat-matrix" id="seat-matrix">${Array.from({length:20},()=>'<i></i>').join('')}</div></div>
      <div class="checks"><button class="check-button" data-action="TOGGLE_GATES" id="gates-control"><span class="check-light"></span><span>Accès au train</span><b>FERMÉS</b></button><button class="check-button" data-action="LOAD" id="load-control"><span class="check-light"></span><span>Embarquement</span><b>CHARGER</b></button><button class="check-button" data-action="CLOSE_HARNESSES" id="harness-control"><span class="check-light"></span><span>Harnais</span><b>OUVERTS</b></button><button class="check-button" data-action="CLEAR_PLATFORM" id="platform-control"><span class="check-light"></span><span>Contrôle du quai</span><b>À VÉRIFIER</b></button></div>
      <div class="row-heading"><span>VÉRIFICATION DES RANGÉES</span><button data-action="CHECK_ALL" title="Vérifier les dix rangées">Tout vérifier</button></div><div class="row-checks">${Array.from({length:10},(_,i)=>`<button data-action="CHECK_ROW" data-index="${i}" title="Vérifier la rangée ${i+1}" aria-label="Vérifier la rangée ${i+1}">${String(i+1).padStart(2,'0')}</button>`).join('')}</div></div>
      <div class="dispatch-section"><button class="authorization" data-action="TOGGLE_DISPATCH" id="authorization"><span class="toggle"><i></i></span><span>Autorisation de départ</span><span class="auth-state">OFF</span></button><button class="dispatch-button" data-action="DISPATCH" id="dispatch"><span class="dispatch-symbol">↗</span><span>DÉPART TRAIN<small id="dispatch-reason">Initialisation requise</small></span>${icon('arrow')}</button><div class="safety-controls"><button class="hold-button" data-action="TOGGLE_HOLD" id="hold">Ⅱ <span>Maintien en gare</span></button><button class="emergency-button" data-action="EMERGENCY_STOP" id="emergency"><span class="emergency-dot"></span>ARRÊT D’URGENCE</button></div><button class="reset-emergency button" data-action="RESET_EMERGENCY" id="reset-emergency" hidden>${icon('reset')} Réarmer après arrêt</button></div></div><div class="control-footer"><i class="led"></i> AUTOMATISMES SIMULÉS <span>● ●</span></div></aside></div>
      <section class="panel queue-panel" id="visitors"><div class="panel-bar"><div class="panel-title">${icon('people')}FILE D’ATTENTE · FLUX EN DIRECT</div><span class="hardware-id">1 POINT = 1 PERSONNE</span></div><div id="queue-view"></div></section>
      <section class="panel locker-panel" id="lockers"><div class="panel-bar"><div class="panel-title">${icon('dashboard')}CASIERS · CONSIGNE DES VOYAGEURS</div><span class="hardware-id">120 CASIERS INDIVIDUELS</span></div><div id="locker-view"></div></section>
      <div class="lower-grid"><section class="panel map-panel" id="map"><div class="panel-bar"><div class="panel-title">${icon('route')}CIRCUIT & CANTONS</div><button class="icon-button small" data-ui="expand-map" title="Agrandir la carte" aria-label="Agrandir la carte">${icon('expand')}</button></div><div class="map-mode"><button class="active" data-ui="map-plan" aria-pressed="true">Couleurs du plan</button><button data-ui="map-blocks" aria-pressed="false">Occupation des cantons</button></div><div id="map-view" class="map-view"></div><div class="map-legend" id="map-legend"><span style="color:#70c6dc">● Gares</span><span style="color:#a26bdd">● Lancements</span><span style="color:#d35855">● Parcours 1</span><span style="color:#dca04b">● Parcours 2</span><span style="color:#557bd8">● Freins</span><span style="color:#75ba6e">● Montée motorisée</span><span style="color:#889187">┄ Liaisons à confirmer</span></div><div class="map-footnote">Pointillés : liaisons hypothétiques · couleurs ≠ cantons réels</div><div id="map-selection" class="map-selection" hidden></div></section>
      <section class="panel fleet-panel" id="fleet"><div class="panel-bar"><div class="panel-title">${icon('train')}FLOTTE</div><span class="hardware-id">6 × 20 PLACES</span></div><div class="fleet-actions"><button class="button" data-action="ADD_ALL_TRAINS">Mettre la flotte en service</button></div><div class="fleet-table-head"><span>TRAIN</span><span>SITUATION</span><span>CHARGE</span><span>SERVICE</span></div><div id="fleet-list"></div><div class="fleet-note"><span class="led"></span><span id="fleet-summary">1 train actif · 5 trains au garage</span></div></section>
      <section class="panel events-panel" id="events"><div class="panel-bar"><div class="panel-title">${icon('journal')}JOURNAL</div><button class="text-button" data-action="ACKNOWLEDGE" title="Acquitter les alarmes">Acquitter</button></div><div class="event-list" id="event-list"></div><div class="journal-footer"><span class="led"></span> ÉVÉNEMENTS DU MOTEUR <span id="event-count">0</span></div></section></div>
      <footer class="page-footer"><span>F.L.Y. OPERATOR SIMULATOR <b>PROTOTYPE 0.4</b></span><span>Projet non officiel · Sans affiliation à Phantasialand ou Vekoma</span><span id="save-status">Sauvegarde locale · IndexedDB</span></footer></main></div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>
      <dialog id="guide-dialog"><div class="dialog-header"><div><div class="eyebrow">VOTRE PREMIER SERVICE</div><h2>À vous les commandes.</h2></div><button class="icon-button" data-ui="close-dialog" aria-label="Fermer le guide">×</button></div><p>Cette version simule le parcours des visiteurs, les contrôles, les incidents et les départs. Les procédures sont fictives et réservées au jeu.</p><ol class="guide-steps"><li><b>Prenez votre poste</b><span>Appuyez sur le bouton d’initialisation ${icon('power')}, puis sur « Ouvrir l’attraction ». Le premier train rejoint le quai.</span></li><li><b>Préparez le train</b><span>Ouvrez les accès, lancez l’embarquement et attendez sa fin. Refermez les accès puis fermez les harnais.</span></li><li><b>Validez les contrôles</b><span>Vérifiez les 10 rangées et le quai. Activez l’autorisation de départ.</span></li><li><b>Donnez le départ</b><span>Appuyez sur « Départ train ». Suivez le train sur la carte ou changez de caméra.</span></li></ol><div class="guide-tip">${icon('help')}<span><b>Pour observer une exploitation continue</b>, initialisez, ouvrez, choisissez le mode automatique et activez l’autorisation. Ajoutez les autres trains depuis la flotte.</span></div><p class="muted">La souris permet d’explorer la scène : glisser pour tourner, molette pour zoomer. Le temps avance à vitesse réelle. Quitter l’onglet suspend la simulation. Dans Opérations, personnalisez le préshow, les files et les incidents. Les casiers et la sécurité doivent être terminés avant l’embarquement.</p><button class="button primary" data-ui="close-dialog">Prendre mon poste ${icon('arrow')}</button></dialog>
      <dialog id="settings-dialog"><div class="dialog-header"><h2>Paramètres du poste</h2><button class="icon-button" data-ui="close-dialog" aria-label="Fermer les paramètres">×</button></div><label class="settings-row">Qualité graphique<select id="quality"><option value="low">Faible</option><option value="medium" selected>Moyenne</option><option value="high">Élevée</option></select></label><div class="settings-row"><span>Partie enregistrée localement</span><button class="button" data-ui="restore">Restaurer la sauvegarde</button></div><p class="muted">Sauvegarde automatique toutes les 30 secondes après initialisation. Aucune donnée n’est envoyée à un serveur.</p><div class="settings-row"><span>Recommencer le service</span><button class="button danger-text" data-ui="new">Nouvelle partie</button></div><p class="muted">Prototype 0.4 : six trains, gares souterraines, file 2D et casiers fonctionnels. Préshow 3D, Fast Pass, deux postes de sécurité, retenues individuelles et maintenance sont disponibles dans Opérations.</p></dialog>
      <dialog id="new-dialog"><div class="dialog-header"><h2>Recommencer le service ?</h2><button class="icon-button" data-ui="close-dialog" aria-label="Annuler">×</button></div><p>La partie actuelle et sa sauvegarde seront remplacées. Les six trains seront remis dans leur configuration initiale.</p><button class="button primary" data-ui="confirm-new">Créer une nouvelle partie</button><button class="button" data-ui="close-dialog">Annuler</button></dialog>`;
  }
  setCamera(id) {
    this.activeCamera = id;
    this.handlers.camera(id);
    const names = {station:['01',`Embarquement · souterrain ${WORLD_LEVELS.stationRail} m`],unloading:['02',`Débarquement · souterrain ${WORLD_LEVELS.stationRail} m`],launch1:['03','Premier lancement'],launch2:['04','Second lancement'],garage:['05','Garage souterrain · fictif'],lockers:['07','Casiers · couloir souterrain'],overview:['06','Rookburgh · extérieur 0 m']};
    names.preshow=['08','Préshow · salle souterraine'];names.security=['09','Sécurité · deux postes'];
    const camera = names[id] || names.station;
    this.root.querySelector('#camera-number').textContent = `CAM ${camera[0]}`;
    this.root.querySelector('#camera-name').textContent = camera[1];
    this.root.querySelector('#camera-select').value=id;
    this.root.querySelectorAll('[data-camera]').forEach(el => el.classList.toggle('active',el.dataset.camera===id));
  }
  navigate(id) {
    this.handlers.navigate?.(id);
    this.root.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===id));
    this.root.querySelector(`#${id}`)?.scrollIntoView({behavior:'smooth',block:'center'});
    if(id === 'map') this.setCamera('overview');
  }
  uiAction(action) {
    if (action === 'guide' || action === 'settings') this.root.querySelector(`#${action}-dialog`).showModal();
    if(action === 'close-dialog') this.root.querySelectorAll('dialog[open]').forEach(d=>d.close());
    if(action === 'save') this.handlers.save();
    if(action === 'restore') this.handlers.restore();
    if(action === 'new') { this.root.querySelector('#settings-dialog').close(); this.root.querySelector('#new-dialog').showModal(); }
    if(action === 'confirm-new') { this.handlers.newGame(); this.uiAction('close-dialog'); }
    if(action === 'expand-camera') this.root.querySelector('.camera-panel').classList.toggle('expanded');
    if(action === 'expand-map') this.root.querySelector('.map-panel').classList.toggle('expanded');
    if(action==='map-plan'||action==='map-blocks') {
      const plan=action==='map-plan';this.handlers.mapMode(plan?'plan':'blocks');
      this.root.querySelectorAll('.map-mode button').forEach(b=>{b.classList.toggle('active',b.dataset.ui===action);b.setAttribute('aria-pressed',String(b.dataset.ui===action));});
      this.root.querySelector('#map-legend').innerHTML=plan?'<span style="color:#70c6dc">● Gares</span><span style="color:#a26bdd">● Lancements</span><span style="color:#d35855">● Parcours 1</span><span style="color:#dca04b">● Parcours 2</span><span style="color:#557bd8">● Freins</span><span style="color:#75ba6e">● Montée motorisée</span><span style="color:#889187">┄ Liaisons à confirmer</span>':'<span><i class="legend-line"></i>Libre</span><span><i class="legend-line occupied"></i>Occupé</span><span><i style="background:#e7c974" class="legend-line"></i>Réservé</span><span><i class="legend-line blocked"></i>Bloqué</span>';
    }
  }
  selectTrain(id) {
    this.selectedTrain = id;
    this.selection = {type:'train',id};
    const train = this.state?.trains.find(t=>t.id===id);
    if(!train) return;
    const block = this.state.blocks.find(b=>b.id===train.blockId);
    const selection = this.root.querySelector('#map-selection');
    selection.hidden = false;
    selection.textContent = `${id} · ${labels[train.state] || train.state} · ${train.passengers}/20 passagers · ${(train.speed*3.6).toFixed(0)} km/h`;
    this.handlers.followTrain(train,block);
    this.update(this.state,true);
  }
  selectBlock(id) {
    this.selection = {type:'block',id};
    const block = this.state?.blocks.find(b=>b.id===id);
    if(!block) return;
    const el = this.root.querySelector('#map-selection'); el.hidden=false;
    el.textContent=`${block.name} · ${block.blocked?'Bloqué':block.occupiedBy?`Occupé par ${block.occupiedBy}`:'Libre'} · ${block.length} m simulés`;
  }
  toast(message, status='accepted') {
    const el=this.root.querySelector('#toast');
    el.textContent=message; el.className=`toast visible ${status}`;
    clearTimeout(this.toastTimeout); this.toastTimeout=setTimeout(()=>el.classList.remove('visible'),4500);
  }
  saveStatus(text) {this.root.querySelector('#save-status').textContent=text;}
  update(state,force=false) {
    this.state=state;
    const $ = selector=>this.root.querySelector(selector);
    const at = state.trains.find(t=>t.blockId==='LOAD' && t.progress>=1);
    const active = state.trains.filter(t=>t.state!=='STORED' && t.state!=='MAINTENANCE').length;
    if(this.selection) {
      const el=$('#map-selection');
      const item=this.selection.type==='train'?state.trains.find(t=>t.id===this.selection.id):state.blocks.find(b=>b.id===this.selection.id);
      if(item) {
        el.hidden=false;
        el.textContent=this.selection.type==='train'
          ?`${item.id} · ${labels[item.state]||item.state} · ${item.passengers}/20 passagers · ${(item.speed*3.6).toFixed(0)} km/h`
          :`${item.name} · ${item.blocked?'Bloqué':item.occupiedBy?`Occupé par ${item.occupiedBy}`:item.reservedBy?`Réservé pour ${item.reservedBy}`:'Libre'} · ${item.length} m simulés`;
      }
    }
    $('#sim-time').textContent=timecode(state.time); $('#scene-time').textContent=timecode(state.time);
    $('#transported').innerHTML=`${state.stats.transported} <small>pers.</small>`;
    $('#active-trains').innerHTML=`${String(active).padStart(2,'0')} <small>/ ${String(FLEET_SIZE).padStart(2,'0')}</small>`;
    $('#queue').innerHTML=`${state.visitors.queue} <small>pers.</small>`;
    $('#top-status').innerHTML=state.emergency?pill('ARRÊT D’URGENCE','red'):state.open?pill('ATTRACTION OUVERTE','green'):pill('ATTRACTION FERMÉE','amber');
    $('#operation-label').textContent=state.emergency?'Arrêt d’urgence actif':state.open?'Service en cours':state.initialized?'Systèmes initialisés':'Systèmes à l’arrêt';
    $('#initialize').classList.toggle('is-on',state.initialized);
    $('#initialize').title=state.initialized?'Systèmes déjà initialisés':'Initialiser les systèmes';
    $('#open').classList.toggle('is-on',state.open); $('#close').classList.toggle('is-on',state.initialized&&!state.open);
    this.root.querySelectorAll('[data-mode]').forEach(el=>el.classList.toggle('active',el.dataset.mode===state.mode));
    $('#station-train-id').textContent=at?.id || '—';
    $('#station-state').textContent=at?(labels[at.state]||at.state):'En attente du train';
    $('#station-passengers').textContent=String(at?.passengers||0).padStart(2,'0');
    $('#seat-matrix').querySelectorAll('i').forEach((el,i)=>el.classList.toggle('filled',i<(at?.passengers||0)));
    const check = (id,good,text)=>{const el=$(id);el.classList.toggle('checked',good);el.querySelector('b').textContent=text;};
    check('#gates-control',!!at&&!state.station.gatesOpen,state.station.gatesOpen?'OUVERTS':'FERMÉS');
    check('#load-control',!!at&&at.passengers>0,at?.state==='LOADING'?`${Math.round((state.station.loadingProgress||0)*100)} %`:at?.passengers?'EMBARQUÉ':'CHARGER');
    check('#harness-control',at?.harness==='closed',at?.harness==='closed'?'FERMÉS':'OUVERTS');
    $('#harness-control').dataset.action=at?.harness==='closed'?'OPEN_HARNESSES':'CLOSE_HARNESSES';
    check('#platform-control',state.station.platformClear,state.station.platformClear?'DÉGAGÉ':'À VÉRIFIER');
    this.root.querySelectorAll('[data-index]').forEach((el,i)=>{el.classList.toggle('checked',!!at?.rows[i]);el.classList.toggle('restraint-fault',!!at?.restraints.slice(i*2,i*2+2).some(r=>['MISPOSITION','RECHECK','UNFIT','TECHNICAL'].includes(r.state)));el.setAttribute('aria-pressed',String(!!at?.rows[i]));});
    $('#authorization').classList.toggle('is-on',state.dispatchEnabled);$('#authorization .auth-state').textContent=state.dispatchEnabled?'ON':'OFF';
    $('#hold').classList.toggle('is-on',state.hold); $('#reset-emergency').hidden=!state.emergency;
    $('#reset-emergency').dataset.action=state.emergencyAcknowledged?'RESET_EMERGENCY':'ACKNOWLEDGE';
    $('#reset-emergency').innerHTML=icon('reset')+(state.emergencyAcknowledged?' Réarmer après arrêt':' Acquitter l’arrêt d’urgence');
    $('#emergency').classList.toggle('is-on',state.emergency);
    const issue=this.handlers.departureIssue();
    const reason=issue||'Tous les contrôles sont validés';
    const ready=!issue;
    $('#dispatch').classList.toggle('ready',ready);$('#dispatch').setAttribute('aria-disabled',String(!ready));$('#dispatch').title=reason;$('#dispatch-reason').textContent=reason;
    const hints=!state.initialized?['Bienvenue à votre poste.','Initialisez les systèmes pour commencer votre service.']:state.emergency?['Exploitation interrompue.','Acquittez puis réarmez l’arrêt d’urgence pour reprendre.']:!state.open?['Le poste est prêt.','Ouvrez l’attraction pour accueillir les visiteurs.']:state.mode==='auto'?['L’automatisme prend le relais.',!state.dispatchEnabled?'Activez l’autorisation pour permettre les départs.':state.hold?'Le maintien en gare est actif. Désactivez-le pour reprendre.':'Supervisez les trains et ajoutez une rame depuis la flotte.']:!at?['Circulation en cours.','Le train rejoint la gare. Suivez sa progression sur la carte.']:['Préparation du départ.',!at.passengers&&at.harness==='open'?'Ouvrez les accès au train, puis lancez l’embarquement.':reason];
    $('#hint-title').textContent=hints[0];$('#hint-text').textContent=hints[1];
    const fleetKey=JSON.stringify(state.trains.map(t=>[t.id,t.state,t.passengers,t.removeRequested,t.serviceRequested]))+this.selectedTrain;
    if(force||fleetKey!==this.fleetKey){this.fleetKey=fleetKey;$('#fleet-list').innerHTML=state.trains.map((t,i)=>{
      const action=t.serviceRequested?'CANCEL_ADD_TRAIN':t.state==='STORED'?'ADD_TRAIN':'REMOVE_TRAIN';
      const actionLabel=t.serviceRequested?'Annuler l’insertion':t.state==='STORED'?'Mettre en service':'Retirer du service';
      return `<div class="fleet-row ${t.id===this.selectedTrain?'selected':''}"><button class="train-id" data-train="${t.id}" title="Suivre ${t.id}"><i class="train-color train-color-${i}"></i>${t.id}</button><span class="train-state ${t.state==='STORED'?'muted':''}">${t.serviceRequested?'Insertion prévue':t.removeRequested?'Retrait prévu':escape(labels[t.state]||t.state)}</span><span class="load-value">${t.passengers}<small>/20</small></span><button class="fleet-toggle ${t.state!=='STORED'?'is-on':''} ${t.serviceRequested?'is-pending':''}" data-garage="${action}" data-id="${t.id}" title="${actionLabel} ${t.id}" aria-label="${actionLabel} ${t.id}"><span></span></button></div>`;
    }).join('');}
    const pendingService=state.trains.filter(t=>t.serviceRequested).length;
    $('#fleet-summary').textContent=`${active} en service · ${FLEET_SIZE-active} au garage${pendingService?` · ${pendingService} insertion(s) en attente`:''}`;
    const key=state.events.map(e=>e.id).join(',');
    if(force||key!==this.eventKey){this.eventKey=key;$('#event-list').innerHTML=[...state.events].sort((a,b)=>b.id-a.id).slice(0,25).map(e=>`<div class="event ${e.level}"><time>${timecode(e.time)}</time><i></i><span>${escape(e.message)}</span></div>`).join('');$('#event-count').textContent=state.events.length;}
  }
}
