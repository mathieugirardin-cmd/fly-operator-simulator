import {transition} from '../core/StateMachine.js';
export const RESTRAINT_STATES=['EMPTY','OPEN','CLOSED','VERIFIED','MISPOSITION','RECHECK','UNFIT','TECHNICAL'];
export const RESTRAINT_LABELS={EMPTY:'Place vide',OPEN:'Ouvert',CLOSED:'À vérifier',VERIFIED:'Conforme',MISPOSITION:'Mal positionné',RECHECK:'Vérification à reprendre',UNFIT:'Retenue non adaptée au passager',TECHNICAL:'Défaut technique'};
export const createRestraints=()=>Array.from({length:20},()=>({visitorId:null,state:'EMPTY'}));
export const createOperations=()=>({mode:'chief',post:'boarding',autoHarness:true,harnessIncidents:true,difficulty:'normal',harnessMultiplier:1,probabilities:{MISPOSITION:1/15,RECHECK:1/30,UNFIT:1/150,TECHNICAL:1/1000},harnessFaults:0});
export class HarnessSystem {
  constructor(engine){this.engine=engine;}
  syncOpen(train){train.restraints=createRestraints();train.passengerIds.forEach((id,i)=>{train.restraints[i]={visitorId:id,state:'OPEN'};});train.harnessTimer=0;}
  close(train) {
    this.syncOpen(train);for(const r of train.restraints)if(r.visitorId!==null)r.state='CLOSED';
    const s=this.engine.state,o=s.operations;if(!o.harnessIncidents||!train.passengers)return;
    const factor=({easy:.4,normal:1,hard:2})[o.difficulty]*o.harnessMultiplier;
    for(const [cause,chance]of Object.entries(o.probabilities))if(this.engine.visitors.random()<Math.min(1,chance*factor)){
      const available=train.restraints.filter(r=>r.state==='CLOSED');if(!available.length)break;
      const r=available[Math.floor(this.engine.visitors.random()*available.length)];r.state=cause;o.harnessFaults++;
      if(cause==='TECHNICAL'&&!this.engine.maintenance.create(`harness:${train.id}`,'Défaut technique de retenue')&&!this.engine.maintenance.has(`harness:${train.id}`)){r.state='CLOSED';continue;}
      const row=Math.floor(train.restraints.indexOf(r)/2)+1;
      this.engine.log('error',`${train.id} — rangée ${String(row).padStart(2,'0')} : ${RESTRAINT_LABELS[cause]}. Intervention nécessaire.`);
    }
  }
  issue(train){return train.restraints?.some(r=>!['EMPTY','VERIFIED'].includes(r.state))?'Une retenue reste non conforme ou non vérifiée.':null;}
  check(train,index,undo=false) {
    const row=train.restraints.slice(index*2,index*2+2);
    if(row.some(r=>['MISPOSITION','RECHECK','UNFIT','TECHNICAL'].includes(r.state)))return false;
    for(const r of row)if(r.visitorId!==null)r.state=undo?'CLOSED':'VERIFIED';
    train.rows[index]=!undo;transition(train,train.rows.every(Boolean)?'READY':'CHECKING');return true;
  }
  command(type,p={}) {
    const s=this.engine.state,o=s.operations,ok=message=>({status:'accepted',message}),no=message=>({status:'rejected',message});
    if(type==='SET_OPERATOR') {
      if(!['chief','operator'].includes(p.mode)||!['preshow','lockers','SEC-01','SEC-02','boarding','unloading','maintenance'].includes(p.post))return no('Poste inconnu.');
      o.mode=p.mode;o.post=p.post;s.flow.security.controlled=p.mode==='operator'&&p.post.startsWith('SEC')?p.post:null;
      s.flow.preshow.auto=!(p.mode==='operator'&&p.post==='preshow');
      if(p.mode==='operator'){s.mode=p.post==='boarding'?'manual':'auto';s.lockers.intakeOpen=true;}
      return ok(p.mode==='chief'?'Supervision générale active.':`Poste ${p.post} sélectionné ; les autres postes sont automatiques.`);
    }
    if(type==='SET_HARNESS_CONFIG') {
      if(['autoHarness','harnessIncidents'].includes(p.field)&&typeof p.value==='boolean')o[p.field]=p.value;
      else if(p.field==='difficulty'&&['easy','normal','hard'].includes(p.value))o.difficulty=p.value;
      else if(p.field==='harnessMultiplier'&&Number.isFinite(p.value)&&p.value>=0&&p.value<=5)o.harnessMultiplier=p.value;
      else if(Object.hasOwn(o.probabilities,p.field)&&Number.isFinite(p.value)&&p.value>=0&&p.value<=1)o.probabilities[p.field]=p.value;
      else return no('Réglage de harnais invalide.');return ok('Réglage de retenues appliqué.');
    }
    if(!['HARNESS_RECLOSE','HARNESS_RECHECK','HARNESS_EXIT'].includes(type))return null;
    const t=this.engine.stations.train();if(!t||t.state==='LOADING'||!Number.isInteger(p.seat)||p.seat<0||p.seat>=20)return no('Choisissez une place du train immobilisé au quai.');
    const r=t.restraints[p.seat],row=Math.floor(p.seat/2);
    if(type==='HARNESS_RECLOSE'&&r.state==='MISPOSITION'){r.state='CLOSED';t.rows[row]=false;return ok('Nouvelle fermeture effectuée ; vérification nécessaire.');}
    if(type==='HARNESS_RECHECK'&&r.state==='RECHECK'){r.state='CLOSED';t.rows[row]=false;return ok('Une nouvelle vérification est demandée.');}
    if(type==='HARNESS_EXIT'&&r.state==='UNFIT') {
      const id=r.visitorId;t.passengerIds=t.passengerIds.filter(x=>x!==id);t.passengers--;s.flow.metrics.exited++;
      this.engine.lockers.retrieve([id]);r.visitorId=null;r.state='EMPTY';t.rows[row]=false;s.station.platformClear=false;
      s.flow.egress.push({id,stage:'retrieval',remaining:0});
      return ok('Passager sorti sous accompagnement ; récupération de ses affaires et nouvelle vérification du quai requises.');
    }
    return no('Action non adaptée à cette retenue. Un défaut technique nécessite la maintenance.');
  }
  update(dt) {
    const s=this.engine.state;if(s.emergency)return;
    for(const t of s.trains)if(t.harness==='open')this.syncOpen(t);
    const t=this.engine.stations.train();if(!t||t.harness!=='closed'||s.station.gatesOpen||!s.operations.autoHarness)return;
    if(this.engine.maintenance.has(`harness:${t.id}`))return;
    t.harnessTimer+=dt;if(t.harnessTimer<.7)return;t.harnessTimer=0;
    const row=t.rows.findIndex((checked,index)=>!checked&&t.restraints.slice(index*2,index*2+2).every(r=>['EMPTY','CLOSED','VERIFIED'].includes(r.state)));
    if(row>=0)this.check(t,row);
  }
}
export function validateHarness(s,assert) {
  const o=s.operations;assert(o&&['chief','operator'].includes(o.mode)&&['preshow','lockers','SEC-01','SEC-02','boarding','unloading','maintenance'].includes(o.post)&&typeof o.autoHarness==='boolean'&&typeof o.harnessIncidents==='boolean'&&['easy','normal','hard'].includes(o.difficulty)&&Number.isFinite(o.harnessMultiplier)&&o.harnessMultiplier>=0&&o.harnessMultiplier<=5&&Number.isSafeInteger(o.harnessFaults)&&o.harnessFaults>=0,'réglage de retenues invalide.');
  for(const key of ['MISPOSITION','RECHECK','UNFIT','TECHNICAL'])assert(Number.isFinite(o.probabilities?.[key])&&o.probabilities[key]>=0&&o.probabilities[key]<=1,'probabilité de harnais invalide.');
  for(const t of s.trains){assert(Array.isArray(t.restraints)&&t.restraints.length===20&&Number.isFinite(t.harnessTimer)&&t.harnessTimer>=0&&t.harnessTimer<=.7+1e-9,'retenues manquantes.');const ids=new Set();for(const [i,r]of t.restraints.entries()){assert(RESTRAINT_STATES.includes(r.state)&&(r.visitorId===null?r.state==='EMPTY':t.passengerIds.includes(r.visitorId)&&!ids.has(r.visitorId)&&r.state!=='EMPTY'),'place incohérente.');if(r.visitorId!==null)ids.add(r.visitorId);assert(!t.rows[Math.floor(i/2)]||['EMPTY','VERIFIED'].includes(r.state),'rangée verte non conforme.');}assert(ids.size===t.passengers,'places désynchronisées.');}
}
