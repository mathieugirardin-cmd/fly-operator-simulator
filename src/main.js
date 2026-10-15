import './styles/main.css';
import './styles/operations.css';
import './styles/console.css';
import './styles/living-plan.css';
import { SimulationEngine } from './core/SimulationEngine.js';
import { ThreeRenderer } from './rendering/ThreeRenderer.js';
import { Map2DRenderer } from './rendering/Map2DRenderer.js';
import { Queue2DRenderer } from './rendering/Queue2DRenderer.js';
import { LockerPanel } from './ui/LockerPanel.js';
import {OperationsPanel} from './ui/OperationsPanel.js';
import {ConsoleLayout} from './ui/ConsoleLayout.js';
import { TRACK } from './config/track.js';
import { Dashboard } from './ui/Dashboard.js';
import { SaveManager } from './services/SaveManager.js';
import {AudioDirector} from './services/AudioDirector.js';
import {KeyboardController} from './ui/KeyboardController.js';

let engine = new SimulationEngine();
const saves = new SaveManager();
const audio=new AudioDirector();
let stopAudioEvents;
function bindAudio(){stopAudioEvents?.();audio.reset(engine.state);stopAudioEvents=engine.on('effect',effect=>audio.effect(effect,engine.state));}
bindAudio();
document.addEventListener('pointerdown',()=>audio.unlock(),{capture:true});
document.addEventListener('keydown',event=>{if(!event.repeat)audio.unlock();},{capture:true});
let renderer;
let map;
let queueView;
let lockerPanel;
let operationsPanel;
let consoleLayout;
let lastDraw = 0;
let lastAutosave = 0;
let saveInFlight = false;
const ui = new Dashboard(document.querySelector('#app'), {
  command(type, payload) {
    const result = engine.command(type, payload);audio.sync(engine.state,document.hidden);
    ui.toast(result.message, result.status);
    ui.update(engine.state, true);
    map?.update(engine.state);
    queueView?.update(engine.state,0);
    lockerPanel?.update(engine.state);
    operationsPanel?.update(engine.state);
    consoleLayout?.update(engine.state);
    if(type==='CHECK_ROW'&&result.status==='rejected'&&operationsPanel){const t=engine.stations.train();const index=t?.restraints.findIndex((r,i)=>Math.floor(i/2)===payload.index&&['MISPOSITION','RECHECK','UNFIT','TECHNICAL'].includes(r.state));if(index>=0){operationsPanel.selectedSeat=index;operationsPanel.update(engine.state);ui.navigate('flow-harness');}}
  },
  departureIssue: () => engine.dispatcher.departureIssue(),
  navigate(id){if(engine.state.flow.security.controlled&&!['operations-workbench','flow-security','operations'].includes(id))engine.command('SECURITY_CONTROL',{id:null});if(consoleLayout){if(id==='operations'||id==='map'){consoleLayout.drawer.close();if(id==='map')ui.setCamera('overview');return true;}return consoleLayout.openDrawer(id);}},
  camera(id) { renderer?.setCamera(id); },
  quality(value) { renderer?.setQuality(value); ui.toast('Qualité graphique appliquée.'); },
  mapMode(mode) {map?.setMode(mode);},
  followTrain(train) {
    map?.setSelectedTrain(train.id);
    const segment = TRACK.find(block => block.id === train.blockId);
    const cameras = {CAM01:'station',CAM02:'unloading',CAM03:'launch1',CAM04:'launch2',CAM05:'garage',CAM06:'overview'};
    const camera = train.state === 'STORED' ? 'garage' : cameras[segment?.camera] || segment?.camera || 'overview';
    ui.setCamera(['station','unloading','launch1','launch2','garage','overview'].includes(camera)?camera:'overview');
  },
  save: () => saveGame(true),
  restore: restoreGame,
  async newGame() {
    try {
      await saves.clear();
      engine = new SimulationEngine();
      bindAudio();
      lastAutosave = performance.now();
      ui.update(engine.state,true);
      ui.setCamera('station');
      ui.toast('Nouveau service. Les systèmes sont à l’arrêt.');
      ui.saveStatus('Nouvelle partie · sauvegarde locale');
    } catch { ui.toast('Impossible de supprimer la sauvegarde locale. La partie est conservée.','fault'); }
  },
});

ui.update(engine.state,true);
const viewport = document.querySelector('#viewport');
try {
  renderer = new ThreeRenderer(viewport, {onError: showRendererError});
  viewport.querySelector('.scene-loading')?.remove();
} catch (error) { showRendererError(error); }
try {
  map = new Map2DRenderer(document.querySelector('#map-view'), {
    onSelectTrain: id => ui.selectTrain(typeof id === 'string' ? id : id.id),
    onSelectBlock: id => ui.selectBlock(typeof id === 'string' ? id : id.id),
  });
  map.update(engine.state);
} catch(error) { ui.toast(`La carte n’a pas pu être chargée : ${error.message}`, 'fault'); }
queueView=new Queue2DRenderer(document.querySelector('#queue-view'),{onCommand:(type,payload)=>ui.handlers.command(type,payload)});
queueView.update(engine.state);
lockerPanel=new LockerPanel(document.querySelector('#locker-view'),{onCommand:(type,payload)=>ui.handlers.command(type,payload),onCamera:id=>{ui.setCamera(id);ui.navigate('operations');}});
lockerPanel.update(engine.state);
const workbench=document.createElement('section');workbench.className='panel operations-panel';workbench.id='operations-workbench';document.querySelector('#visitors').after(workbench);
operationsPanel=new OperationsPanel(workbench,{onCommand:(type,payload)=>ui.handlers.command(type,payload),onCamera:id=>{ui.setCamera(id);ui.navigate('operations');},onNavigate:id=>ui.navigate(id)});
operationsPanel.update(engine.state);
consoleLayout=new ConsoleLayout(document.querySelector('#app'),{onCommand:(type,payload)=>ui.handlers.command(type,payload),onCamera:id=>ui.setCamera(id),onDrawer:id=>ui.navigate(id),onSeat:index=>{operationsPanel.selectedSeat=index;operationsPanel.update(engine.state);},onToast:(message,status)=>ui.toast(message,status)});
consoleLayout.update(engine.state);
const keyboard=new KeyboardController({state:()=>engine.state,command:(type,payload)=>ui.handlers.command(type,payload),blocked:target=>!!document.querySelector('dialog[open]')||!!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="menu"],[role="listbox"],[role="combobox"]')});
document.addEventListener('keydown',event=>keyboard.down(event));
document.addEventListener('keyup',event=>keyboard.up(event));
window.addEventListener('blur',()=>keyboard.release());
ui.setCamera('station');

function showRendererError(error) {
  viewport.classList.add('renderer-error');
  if(!viewport.querySelector('.error-panel')) {
    const panel=document.createElement('div');panel.className='error-panel';
    const title=document.createElement('strong');title.textContent='La scène 3D n’a pas pu démarrer.';
    const description=document.createElement('small');description.textContent='Activez l’accélération graphique de Chrome ou Edge puis rechargez la page. Le moteur et la carte restent disponibles.';
    panel.append(title,description);viewport.append(panel);
  }
  console.error('Initialisation WebGL',error);
}

async function saveGame(manual = false) {
  if(saveInFlight) return;
  saveInFlight=true;
  try {
    await saves.save(engine.snapshot());
    ui.saveStatus(`Enregistré à ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · en local`);
    if(manual) ui.toast('Partie sauvegardée sur cet appareil.');
  } catch {
    ui.saveStatus('Sauvegarde indisponible');
    if(manual) ui.toast('Le navigateur a refusé la sauvegarde locale. Vérifiez l’accès au stockage.','fault');
  } finally { saveInFlight=false; }
}

async function restoreGame() {
  try {
    const saved=await saves.load();
    if(!saved) return ui.toast('Aucune sauvegarde n’est disponible sur cet appareil.','rejected');
    const restored=new SimulationEngine();
    restored.restore(saved.snapshot);
    engine=restored;
    bindAudio();
    lastAutosave=performance.now();
    ui.update(engine.state,true);
    ui.toast('Partie restaurée. Cohérence des trains et cantons vérifiée.');
    ui.uiAction('close-dialog');
  } catch { ui.toast('La sauvegarde ne peut pas être restaurée : données incohérentes ou stockage inaccessible.','fault'); }
}

// A hidden tab deliberately pauses the service; resuming never adds a large time jump.
let previous=performance.now();
document.addEventListener('visibilitychange',()=>{
  previous=performance.now();
  audio.sync(engine.state,document.hidden);keyboard.release();
  if(document.hidden && engine.state.initialized) saveGame();
});
function frame(now) {
  const dt=Math.max(0,(now-previous)/1000); previous=now;
  if(!document.hidden) {
    engine.update(Math.min(dt,1));
    audio.sync(engine.state,false);
    renderer?.update(engine.state,engine.state.runtime.paused||engine.state.emergency?0:dt*engine.state.runtime.speed);
    if(now-lastDraw>=100) {ui.update(engine.state);map?.update(engine.state);queueView?.update(engine.state,Math.min(.3,(now-lastDraw)/1000));lockerPanel?.update(engine.state);operationsPanel?.update(engine.state);consoleLayout?.update(engine.state);lastDraw=now;}
    if(engine.state.initialized && now-lastAutosave>=30000) {lastAutosave=now;saveGame();}
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
saves.load().then(saved=>{
  if(saved) ui.toast('Une sauvegarde est disponible. Retrouvez-la dans les paramètres.');
}).catch(()=>ui.saveStatus('Stockage local indisponible'));
