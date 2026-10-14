export const SERVICE_PHASES=['CLOSED','PREPARATION','TESTS','OPERATION'];
export const createService=()=>({phase:'CLOSED'});
export class ServiceSystem {
  constructor(engine){this.engine=engine;}
  openingIssue() {
    const s=this.engine.state,active=s.trains.filter(t=>t.blockId&&t.state!=='GARAGING');
    if(s.service.phase!=='TESTS')return 'Passez par Préparation puis Tests avant l’ouverture visiteurs.';
    if(s.emergency)return 'Réarmez l’arrêt d’urgence avant l’ouverture.';
    if(!active.length)return 'Mettez au moins un train en ligne.';
    if(active.some(t=>!t.testValid))return 'Chaque train en ligne doit terminer un cycle de test à vide.';
    if(s.trains.some(t=>t.serviceRequested||['GARAGING','INSERTING'].includes(t.state)))return 'Attendez la fin des transferts de garage.';
    if(s.maintenance.incidents.some(i=>i.status!=='RESOLVED'&&['supervision','gates','sensor'].includes(i.equipment)))return 'Un équipement nécessaire à l’exploitation reste indisponible.';
    return null;
  }
  command(type,p={}) {
    const s=this.engine.state;
    if(type!=='SET_SERVICE_PHASE')return null;
    if(!['PREPARATION','TESTS','CLOSED'].includes(p.phase))return {status:'rejected',message:'Utilisez l’ouverture visiteurs pour passer en exploitation.'};
    if(s.emergency)return {status:'rejected',message:'Réarmez l’urgence avant de changer de phase.'};
    if(p.phase==='TESTS'&&s.service.phase!=='PREPARATION')return {status:'rejected',message:'Sélectionnez d’abord le mode Préparation.'};
    s.service.phase=p.phase;s.open=false;s.dispatchEnabled=p.phase==='TESTS';s.hold=false;
    if(p.phase==='TESTS')s.mode='auto';
    return {status:'accepted',message:p.phase==='TESTS'?'Tests à vide : chaque train en ligne effectue son circuit avant l’ouverture.':p.phase==='PREPARATION'?'Préparation active : sélectionnez les trains du garage.':'Exploitation arrêtée : nouveaux départs bloqués, circulations engagées maintenues.'};
  }
}
export function validateService(s,assert) {
  assert(s.service&&SERVICE_PHASES.includes(s.service.phase),'phase d’exploitation invalide.');
  assert(s.open===(s.service.phase==='OPERATION'),'ouverture visiteurs incompatible avec la phase.');
  assert(!s.initialized||s.service.phase!=='CLOSED'||!s.dispatchEnabled,'départ autorisé sur un service fermé.');
  for(const t of s.trains){assert(typeof t.testValid==='boolean'&&typeof t.testInProgress==='boolean'&&Number.isFinite(t.garageElapsed)&&t.garageElapsed>=0&&t.garageElapsed<=3,'qualification ou transfert de train invalide.');assert(!t.testInProgress||t.passengers===0,'test en charge interdit.');}
}
