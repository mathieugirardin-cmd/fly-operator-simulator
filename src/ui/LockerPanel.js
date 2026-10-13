import {lockerSummary} from '../systems/LockerSystem.js';
import {queuedIds} from '../systems/FlowSystem.js';
import {LOCKER_CONFIG} from '../config/operations.js';

const phaseLabel={FREE:'Disponible',RESERVED:'Réservé · visiteur en approche',DEPOSIT:'Dépôt des affaires',STORED:'Affaires conservées',RETRIEVAL:'Récupération des affaires'};
export class LockerPanel {
  constructor(container,{onCommand,onCamera}) {
    this.container=container;this.selected='C001';this.nodes=new Map();
    container.innerHTML=`<div class="locker-summary"><div><b data-locker-stat="free">120</b><span>libres</span></div><div><b data-locker-stat="occupied">0</b><span>affaires déposées</span></div><div><b data-locker-stat="busy">0</b><span>en dépôt / retrait</span></div><div><b data-locker-stat="faults">0</b><span>en défaut</span></div><button class="button" id="locker-camera">Voir les casiers en 3D ↗</button></div><div class="locker-layout"><div><div class="locker-bank-heading"><span>CASIERS 001—120</span><span>1 CASIER = 1 VISITEUR</span></div><div class="locker-grid" role="group" aria-label="Casiers individuels, choisir un casier pour le superviser"></div><div class="locker-legend"><span><i class="free"></i>Libre</span><span><i class="reserved"></i>Réservé</span><span><i class="open"></i>Porte ouverte</span><span><i class="occupied"></i>Occupé</span><span><i class="fault"></i>Défaut</span></div></div><aside class="locker-controls"><div class="eyebrow">SUPERVISION DU COULOIR</div><label for="locker-mode">Attribution des casiers</label><select id="locker-mode"><option value="auto">Automatique · premier libre</option><option value="visitor">Choix simulé du visiteur</option></select><button class="button" id="locker-intake" data-locker-action="TOGGLE_LOCKER_INTAKE">Suspendre les attributions</button><div class="locker-detail"><strong id="locker-selected">C001</strong><b id="locker-phase">Disponible</b><span id="locker-owner">Sans attribution</span><span id="locker-door">Porte fermée</span><progress id="locker-progress" max="1" value="0" aria-label="Progression de l’opération au casier"></progress><p id="locker-help">Sélectionnez un casier pour voir son cycle.</p></div><button class="button" data-locker-action="ASSIGN_LOCKER">Attribuer au prochain visiteur</button><button class="button danger-text" data-locker-action="FAULT_LOCKER">Simuler une porte bloquée</button><button class="button" data-locker-action="REPAIR_LOCKER">Intervenir / débloquer</button><small>Une intervention conserve l’attribution. Les affaires sont rendues au même visiteur après son tour.</small></aside></div><div class="locker-flow" id="locker-flow"></div><div class="locker-footnote">Voyants et procédure fictifs de jeu. L’architecture s’inspire de la photographie fournie.</div>`;
    const grid=container.querySelector('.locker-grid');
    const maintenance=document.createElement('button');maintenance.className='button';maintenance.id='locker-maintenance';maintenance.textContent='Appeler la maintenance';container.querySelector('.locker-controls').append(maintenance);maintenance.addEventListener('click',()=>{const incident=this.state.maintenance.incidents.find(i=>i.equipment===`locker:${this.selected}`&&i.status!=='RESOLVED');if(incident)onCommand('CALL_MAINTENANCE',{id:incident.id});else{onCommand('INJECT_INCIDENT',{equipment:`locker:${this.selected}`});const created=this.state.maintenance.incidents.find(i=>i.equipment===`locker:${this.selected}`&&i.status==='OPEN');if(created)onCommand('CALL_MAINTENANCE',{id:created.id});}});
    for(let i=0;i<LOCKER_CONFIG.count;i++) {
      const id=`C${String(i+1).padStart(3,'0')}`,button=document.createElement('button');
      button.className='locker-cell free';button.dataset.lockerId=id;
      button.innerHTML=`<i></i><b>${String(i+1).padStart(3,'0')}</b><span>LIBRE</span>`;grid.append(button);
      this.nodes.set(id,{button,owner:button.querySelector('span'),key:''});
    }
    container.addEventListener('click',event=>{
      const cell=event.target.closest('[data-locker-id]');
      if(cell){this.selected=cell.dataset.lockerId;if(this.state)this.update(this.state);}
      const button=event.target.closest('[data-locker-action]');
      if(button)onCommand(button.dataset.lockerAction,{lockerId:this.selected});
    });
    container.querySelector('#locker-mode').addEventListener('change',e=>onCommand('SET_LOCKER_MODE',{mode:e.target.value}));
    container.querySelector('#locker-camera').addEventListener('click',()=>onCamera('lockers'));
  }
  update(state) {
    this.state=state;const $=q=>this.container.querySelector(q),summary=lockerSummary(state),waiting=queuedIds(state);
    for(const key of ['free','occupied','faults'])$(`[data-locker-stat="${key}"]`).textContent=summary[key];
    $('[data-locker-stat="busy"]').textContent=summary.depositing+summary.retrieving;
    if(document.activeElement!==$('#locker-mode'))$('#locker-mode').value=state.lockers.mode;
    $('#locker-intake').textContent=state.lockers.intakeOpen?'Suspendre les attributions':'Reprendre les attributions';
    for(const locker of state.lockers.items) {
      const node=this.nodes.get(locker.id),selected=locker.id===this.selected;
      const key=[locker.status,locker.assignedVisitor,locker.phase,selected].join(':');if(key===node.key)continue;node.key=key;
      node.button.className=`locker-cell ${locker.status.toLowerCase()}${selected?' selected':''}`;
      node.button.setAttribute('aria-pressed',String(selected));
      const label=`Casier ${locker.id} · ${locker.fault||phaseLabel[locker.phase]}${locker.assignedVisitor?` · visiteur ${locker.assignedVisitor}`:''}`;
      node.button.setAttribute('aria-label',label);node.button.title=label;
      node.owner.textContent=locker.assignedVisitor?`V${locker.assignedVisitor}`:locker.fault?'DÉFAUT':'LIBRE';
    }
    const locker=state.lockers.items.find(l=>l.id===this.selected);
    $('#locker-selected').textContent=locker.id;$('#locker-phase').textContent=locker.fault||phaseLabel[locker.phase];
    $('#locker-owner').textContent=locker.assignedVisitor?`Attribution exclusive · visiteur ${locker.assignedVisitor}`:'Sans attribution';
    $('#locker-door').textContent=locker.doorOpen?'Porte ouverte':'Porte fermée';
    const duration=locker.phase==='RESERVED'?LOCKER_CONFIG.reservationDuration:locker.phase==='RETRIEVAL'?LOCKER_CONFIG.retrievalDuration:LOCKER_CONFIG.depositDuration;
    $('#locker-progress').value=locker.phase==='STORED'?1:locker.elapsed/duration;
    $('#locker-help').textContent=locker.fault?'Intervention nécessaire. La personne et ses affaires restent liées à ce casier.':locker.phase==='FREE'?'Disponible après le préshow.':locker.phase==='STORED'?(waiting.has(locker.assignedVisitor)?'Dépôt terminé · sécurité puis embarquement.':'Affaires conservées jusqu’au retour du train.'):'Le cycle se poursuit automatiquement.';
    $('#locker-maintenance').disabled=!locker.fault;
    $('[data-locker-action="ASSIGN_LOCKER"]').disabled=locker.phase!=='FREE'||Boolean(locker.fault);
    $('[data-locker-action="FAULT_LOCKER"]').disabled=Boolean(locker.fault);
    $('[data-locker-action="REPAIR_LOCKER"]').disabled=!locker.fault;
    $('#locker-flow').textContent=`${summary.reserved+summary.depositing} au dépôt · ${summary.ready} affaires déposées dans la file · ${summary.retrieving} en récupération${summary.faults?` · ${summary.faults} intervention(s) à traiter`:''}. ${state.lockers.intakeOpen?'Accueil des casiers autorisé.':'Nouvelles attributions suspendues.'}`;
  }
}
