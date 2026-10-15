export const SCORE_RULES = Object.freeze({ visitor:10, quickVisitor:20, quickWait:600, incidents:[[30,100],[60,50],[120,25]] });
export const createScore = () => ({ total:0, visitors:0, incidents:0, journeys:{}, recent:[] });
export class ScoreSystem {
  constructor(engine){this.engine=engine;}
  gain(points,reason){
    if(!points)return;
    const s=this.engine.state,score=s.score;score.total+=points;
    const last=score.recent.at(-1);
    if(last&&last.reason===reason&&s.time-last.time<3){last.points+=points;last.count++;last.time=s.time;}
    else score.recent.push({time:s.time,points,reason,count:1});
    score.recent=score.recent.slice(-8);
  }
  commit(id,arrivedAt){this.engine.state.score.journeys[id]={arrivedAt,boardedAt:null,rode:false};}
  boarded(id){const j=this.engine.state.score.journeys[id];if(j&&j.boardedAt===null)j.boardedAt=this.engine.state.time;}
  returned(id){const j=this.engine.state.score.journeys[id];if(j&&j.boardedAt!==null)j.rode=true;}
  exit(id){
    const score=this.engine.state.score,j=score.journeys[id];delete score.journeys[id];
    if(!j?.rode||j.boardedAt===null)return 0;
    // Fixed-step floating point noise must not turn exactly 10:00 into a quick wait.
    const quick=j.arrivedAt!==null&&j.boardedAt-j.arrivedAt<SCORE_RULES.quickWait-1e-7;
    const points=quick?SCORE_RULES.quickVisitor:SCORE_RULES.visitor;score.visitors++;this.gain(points,quick?'Tour terminé · attente < 10 min':'Tour terminé');return points;
  }
  incident(item){
    if(item.status!=='RESOLVED'||item.scoreAwarded)return 0;
    item.scoreAwarded=true;
    const points=SCORE_RULES.incidents.find(([limit])=>item.resolvedAt-item.createdAt<=limit+1e-7)?.[1]||0;
    this.engine.state.score.incidents+=points;this.gain(points,'Incident résolu');return points;
  }
}
export function validateScore(s,assert){
  const score=s.score;
  assert(score&&['total','visitors','incidents'].every(k=>Number.isSafeInteger(score[k])&&score[k]>=0)&&score.incidents<=score.total,'score invalide.');
  assert(score.journeys&&typeof score.journeys==='object'&&!Array.isArray(score.journeys)&&Object.keys(score.journeys).length<=140,'parcours de score invalides.');
  const active=new Set([...s.trains.flatMap(t=>[...t.passengerIds,...t.boardingIds]),...s.flow.egress.map(p=>p.id)]);
  for(const [id,j] of Object.entries(score.journeys))assert(active.has(Number(id))&&j&&(j.arrivedAt===null||Number.isFinite(j.arrivedAt)&&j.arrivedAt>=0&&j.arrivedAt<=s.time)&&(j.boardedAt===null||Number.isFinite(j.boardedAt)&&j.boardedAt>=(j.arrivedAt??0)&&j.boardedAt<=s.time)&&typeof j.rode==='boolean'&&(!j.rode||j.boardedAt!==null),'attente individuelle invalide.');
  assert(Array.isArray(score.recent)&&score.recent.length<=8&&score.recent.every(r=>Number.isFinite(r.time)&&r.time>=0&&r.time<=s.time&&Number.isSafeInteger(r.points)&&r.points>0&&Number.isSafeInteger(r.count)&&r.count>0&&typeof r.reason==='string'),'historique de score invalide.');
  for(const i of s.maintenance.incidents)assert(typeof i.scoreAwarded==='boolean'&&(!i.scoreAwarded||i.status==='RESOLVED'),'bonus incident invalide.');
}
