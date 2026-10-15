export class StatisticsSystem {
  constructor(engine) { this.engine = engine; }
  update(dt) {
    const { state } = this.engine;
    const stats = state.stats;
    stats.activeTrains = state.trains.filter((train) => train.blockId).length;
    stats.transported = state.visitors.transported;
    stats.fillRate = stats.dispatches ? stats.totalDispatchedPassengers / (stats.dispatches * 20) : 0;
    if (state.open) stats.operatingTime += dt;
    const restraintFault=this.engine.stations.train()?.restraints.some(r=>['MISPOSITION','RECHECK','UNFIT','TECHNICAL'].includes(r.state));
    const critical=state.maintenance.incidents.some(i=>i.status!=='RESOLVED'&&(['gates','sensor','supervision'].includes(i.equipment)||i.equipment.startsWith('block:')||i.equipment.startsWith('harness:')||i.equipment.startsWith('train:')&&state.trains.some(t=>`train:${t.id}`===i.equipment&&t.blockId)));
    const stopped=state.emergency||state.hold||!state.dispatchEnabled||critical||restraintFault;
    if (state.open && (state.emergency||state.hold||critical||restraintFault)) stats.interruptionTime += dt;
    stats.hourlyThroughput = stats.operatingTime > 0 ? Math.round(stats.transported / stats.operatingTime * 3600) : 0;
    stats.estimatedWait = stats.hourlyThroughput > 0 ? Math.round(state.visitors.queue / stats.hourlyThroughput * 60) : 0;
    const f=state.flow,m=f.metrics;
    for(const key of ['dispatches','deposits','checksHistory','admissions'])m[key]=m[key].filter(e=>e.time>=state.time-300).slice(-2000);
    m.historyTimer+=dt;
    if(m.historyTimer<5&&dt>0)return;
    if(dt===0)return;
    m.historyTimer=0;
    const window=Math.min(300,state.time),rate=key=>window>0?m[key].reduce((n,e)=>n+e.count,0)/window:0;
    const bottleneck=Math.min(rate('dispatches'),rate('deposits'),rate('checksHistory'),rate('admissions'));
    const unavailable=stopped||!state.open||stats.activeTrains===0||this.engine.maintenance.has('preshow')||!f.preshow.auto&&f.preshow.state==='CLOSED'||f.security.stations.every(p=>!p.open||this.engine.maintenance.has(p.id))||bottleneck<=0;
    for(const [name,lane]of Object.entries(f.lanes)) {
      const count=f.people.filter(p=>p.lane===name&&p.stage==='queue').length,other=f.people.filter(p=>p.lane!==name&&p.stage==='queue').length;
      const ahead=f.people.filter(p=>p.stage!=='queue').length;
      const share=other===0?1:name==='single'?.1:name==='standard'?f.ratio/(f.ratio+1):1/(f.ratio+1);
      const estimate=unavailable?null:(count/share+ahead)/bottleneck/60;
      lane.wait=estimate===null?null:lane.wait===null?estimate:lane.wait*.8+estimate*.2;
      lane.history.push({time:state.time,wait:lane.wait,count});if(lane.history.length>120)lane.history.shift();
    }
  }
}
