export const EQUIPMENT=[
  ['preshow','Préshow · écran','major','Présentation interrompue'],['doors','Préshow · portes','minor','Portes du préshow bloquées'],['audio','Préshow · audio','minor','Présentation suspendue'],
  ['SEC-01','Sécurité SEC-01','minor','Un poste de sécurité indisponible'],['SEC-02','Sécurité SEC-02','minor','Un poste de sécurité indisponible'],
  ['gates','Portillons','medium','Accès et départ du quai bloqués'],['garage','Garage','medium','Insertion et retrait des trains bloqués'],
  ['block:TRANSFER','Transfert','medium','Transfert immobilisé'],['block:LAUNCH1','Lancement 1','major','Mouvements du lancement bloqués'],['block:LAUNCH2','Lancement 2','major','Mouvements du lancement bloqués'],['block:BRAKES','Freins','major','Zone de freinage immobilisée'],['sensor','Capteur fictif du départ','medium','Départs suspendus'],['supervision','Supervision','major','Mouvements des trains suspendus'],
  ...Array.from({length:6},(_,i)=>[`train:T0${i+1}`,`Train T0${i+1}`,'medium','Train immobilisé ; retrait possible après réparation']),
  ...Array.from({length:120},(_,i)=>[`locker:C${String(i+1).padStart(3,'0')}`,`Casier ${i+1}`,'minor','Un casier indisponible']),
  ...Array.from({length:6},(_,i)=>[`harness:T0${i+1}`,`Retenues T0${i+1}`,'medium','Départ du train bloqué']),
].map(([id,label,severity,consequence])=>({id,label,severity,consequence}));
export const createMaintenance=()=>({level:'normal',multiplier:1,quietUntil:0,nextId:1,incidents:[],technicians:[{id:'TECH-01',incidentId:null},{id:'TECH-02',incidentId:null}],resolved:0,totalRepairTime:0});
const durations={minor:[3,4,8],medium:[6,8,18],major:[10,15,35]};
export class MaintenanceSystem {
  constructor(engine){this.engine=engine;}
  has(id){const ids=id==='preshow'?['preshow','doors','audio']:[id];return this.engine.state.maintenance.incidents.some(x=>x.status!=='RESOLVED'&&ids.includes(x.equipment));}
  history(item,message){item.history.push({time:this.engine.state.time,message});if(item.history.length>30)item.history.shift();}
  create(equipment,description) {
    const s=this.engine.state,m=s.maintenance,def=EQUIPMENT.find(x=>x.id===equipment);
    if(!def||this.has(equipment)||m.incidents.filter(x=>x.status!=='RESOLVED').length>=3)return null;
    const item={id:`INC-${String(m.nextId++).padStart(4,'0')}`,equipment,severity:def.severity,description:description||def.label,consequence:def.consequence,status:'OPEN',priority:def.severity==='major'?3:def.severity==='medium'?2:1,elapsed:0,createdAt:s.time,startedAt:null,resolvedAt:null,history:[]};
    m.incidents.push(item);this.history(item,'Incident détecté');s.stats.incidents++;
    if(equipment.startsWith('locker:')){const l=this.engine.lockers.get(equipment.slice(7));l.fault='Porte bloquée (simulation)';this.engine.lockers.refresh(l);}
    if(def.severity==='major')m.quietUntil=s.time+600;
    this.engine.log('error',`${item.id} · ${item.description} : ${item.consequence}.`);return item;
  }
  command(type,p={}) {
    const m=this.engine.state.maintenance,ok=message=>({status:'accepted',message}),no=message=>({status:'rejected',message});
    if(type==='SET_FAILURE_LEVEL'){if(!['off','low','normal','high'].includes(p.level))return no('Fréquence inconnue.');m.level=p.level;return ok('Fréquence des incidents appliquée.');}
    if(type==='SET_FAILURE_MULTIPLIER'){if(!Number.isFinite(p.value)||p.value<.1||p.value>3)return no('Multiplicateur attendu entre 0,1 et 3.');m.multiplier=p.value;return ok('Fréquence personnalisée appliquée.');}
    if(type==='INJECT_INCIDENT')return this.create(p.equipment)?ok('Incident de démonstration créé.'):no('Équipement inconnu, déjà en défaut ou trois incidents déjà actifs.');
    if(!['CALL_MAINTENANCE','VERIFY_REPAIR','RESTORE_EQUIPMENT','SET_PRIORITY'].includes(type))return null;
    const item=m.incidents.find(x=>x.id===p.id);if(!item)return no('Incident inconnu.');
    if(type==='SET_PRIORITY'){if(!Number.isInteger(p.priority)||p.priority<1||p.priority>3||!['OPEN','QUEUED'].includes(item.status))return no('Priorité modifiable uniquement avant intervention.');item.priority=p.priority;return ok('Priorité modifiée.');}
    if(type==='CALL_MAINTENANCE'){if(item.status!=='OPEN')return no('Intervention déjà demandée.');item.status='QUEUED';this.history(item,'Maintenance appelée');return ok('Demande ajoutée à la file des techniciens.');}
    if(type==='VERIFY_REPAIR'){if(item.status!=='VERIFY')return no('Attendez la fin de la réparation.');if(this.engine.state.emergency)return no('Réarmez avant la vérification finale.');item.status='READY';this.history(item,'Vérification finale conforme');return ok('Vérification conforme ; remise en service disponible.');}
    if(item.status!=='READY')return no('Une vérification finale est nécessaire.');
    item.status='RESOLVED';item.resolvedAt=this.engine.state.time;m.resolved++;m.totalRepairTime+=item.resolvedAt-item.startedAt;this.history(item,'Remis en service');
    if(item.severity==='major')m.quietUntil=item.resolvedAt+600;
    if(item.equipment.startsWith('locker:')){const l=this.engine.lockers.get(item.equipment.slice(7));l.fault=null;this.engine.lockers.refresh(l);}
    if(item.equipment.startsWith('harness:')){const t=this.engine.state.trains.find(t=>t.id===item.equipment.slice(8));for(const r of t.restraints)if(r.state==='TECHNICAL')r.state='CLOSED';t.rows.fill(false);}
    if(m.incidents.length>100)m.incidents=m.incidents.filter(x=>x.status!=='RESOLVED').concat(m.incidents.filter(x=>x.status==='RESOLVED').slice(-80));
    return ok('Équipement réparé, vérifié et remis en service.');
  }
  update(dt) {
    const s=this.engine.state,m=s.maintenance;if(!s.initialized)return;
    const automatic=s.operations?.mode==='operator'&&s.operations.post!=='maintenance';
    if(automatic)for(const i of m.incidents){if(i.status==='OPEN')this.command('CALL_MAINTENANCE',{id:i.id});if(i.status==='VERIFY'&&!s.emergency)this.command('VERIFY_REPAIR',{id:i.id});if(i.status==='READY'&&!s.emergency)this.command('RESTORE_EQUIPMENT',{id:i.id});}
    for(const tech of m.technicians) {
      if(tech.incidentId===null){const i=m.incidents.filter(x=>x.status==='QUEUED').sort((a,b)=>b.priority-a.priority||a.createdAt-b.createdAt)[0];if(i){tech.incidentId=i.id;i.status='ARRIVING';i.startedAt=s.time;i.elapsed=0;this.history(i,`${tech.id} en route`);}}
      const item=m.incidents.find(i=>i.id===tech.incidentId);if(!item)continue;
      item.elapsed+=dt;const phases=['ARRIVING','DIAGNOSIS','REPAIR'],index=phases.indexOf(item.status);
      if(index>=0&&item.elapsed>=durations[item.severity][index]){item.elapsed=0;item.status=phases[index+1]||'VERIFY';this.history(item,{DIAGNOSIS:'Diagnostic en cours',REPAIR:'Réparation en cours',VERIFY:'Réparation terminée ; vérification attendue'}[item.status]);if(item.status==='VERIFY')tech.incidentId=null;}
    }
    if(!s.open||s.emergency||m.level==='off'||s.time<m.quietUntil||m.incidents.filter(x=>x.status!=='RESOLVED').length>=3)return;
    const scale=({low:.35,normal:1,high:3})[m.level]*m.multiplier;
    for(const [severity,mean]of [['minor',4050],['medium',10800],['major',86400]])if(this.engine.visitors.random()<1-Math.exp(-dt*scale/mean)){
      const choices=EQUIPMENT.filter(e=>e.severity===severity&&!this.has(e.id));if(choices.length)this.create(choices[Math.floor(this.engine.visitors.random()*choices.length)].id);break;
    }
  }
}
export function validateMaintenance(s,assert) {
  const m=s.maintenance;assert(m&&['off','low','normal','high'].includes(m.level)&&Number.isFinite(m.multiplier)&&m.multiplier>=.1&&m.multiplier<=3&&Number.isSafeInteger(m.nextId)&&m.nextId>=1&&Number.isFinite(m.quietUntil)&&m.quietUntil>=0&&Array.isArray(m.incidents)&&m.incidents.length<=103,'maintenance invalide.');
  const ids=new Set(),equipment=new Set();for(const i of m.incidents){assert(typeof i.id==='string'&&!ids.has(i.id)&&EQUIPMENT.some(e=>e.id===i.equipment)&&['minor','medium','major'].includes(i.severity)&&['OPEN','QUEUED','ARRIVING','DIAGNOSIS','REPAIR','VERIFY','READY','RESOLVED'].includes(i.status)&&Number.isInteger(i.priority)&&i.priority>=1&&i.priority<=3&&typeof i.description==='string'&&typeof i.consequence==='string'&&Number.isFinite(i.elapsed)&&i.elapsed>=0&&Number.isFinite(i.createdAt)&&i.createdAt<=s.time&&i.createdAt>=0&&Array.isArray(i.history)&&i.history.length<=30,'incident invalide.');ids.add(i.id);if(i.status!=='RESOLVED'){assert(!equipment.has(i.equipment),'incident dupliqué sur un équipement.');equipment.add(i.equipment);}assert(i.startedAt===null||Number.isFinite(i.startedAt)&&i.startedAt>=i.createdAt&&i.startedAt<=s.time,'début de maintenance invalide.');assert(i.resolvedAt===null||Number.isFinite(i.resolvedAt)&&i.resolvedAt>=i.startedAt&&i.resolvedAt<=s.time,'fin de maintenance invalide.');for(const h of i.history)assert(Number.isFinite(h.time)&&h.time>=0&&h.time<=s.time&&typeof h.message==='string','historique de panne invalide.');}
  assert(equipment.size<=3&&Array.isArray(m.technicians)&&m.technicians.length===2,'équipe de maintenance invalide.');const assigned=new Set();m.technicians.forEach((t,i)=>{assert(t.id===`TECH-0${i+1}`&&(t.incidentId===null||ids.has(t.incidentId)&&!assigned.has(t.incidentId)),'affectation technicien invalide.');if(t.incidentId){assigned.add(t.incidentId);assert(['ARRIVING','DIAGNOSIS','REPAIR'].includes(m.incidents.find(x=>x.id===t.incidentId).status),'intervention technicien incohérente.');}});for(const i of m.incidents)assert(!['ARRIVING','DIAGNOSIS','REPAIR'].includes(i.status)||assigned.has(i.id),'intervention sans technicien.');for(const key of ['resolved','totalRepairTime'])assert(Number.isFinite(m[key])&&m[key]>=0,'compteur maintenance invalide.');
}
