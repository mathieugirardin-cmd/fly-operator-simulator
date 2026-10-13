import { SIMULATION_CONFIG } from '../config/track.js';
import { transition } from '../core/StateMachine.js';
import {flowVisitor,INVENTORY} from './FlowSystem.js';

export class VisitorSystem {
  constructor(engine) { this.engine = engine; }
  random() {
    const state = this.engine.state;
    state.rngState = (Math.imul(state.rngState, 1664525) + 1013904223) >>> 0;
    return state.rngState / 4294967296;
  }
  update(dt) {
    const state = this.engine.state;
    for(const [key,lane] of Object.entries(state.flow.lanes))if(state.open&&lane.open&&!state.emergency) {
      lane.timer+=dt*lane.rate/60;
      while(lane.timer>=1-1e-9){lane.timer=Math.max(0,lane.timer-1);this.add(1,key);}
    }
    state.arrivalTimer=state.flow.lanes.standard.timer;
    if (state.emergency) return;
    for (const train of state.trains) {
      if (train.state !== 'LOADING') continue;
      train.loadingElapsed = Math.min(SIMULATION_CONFIG.loadingDuration, train.loadingElapsed + dt);
      state.station.loadingProgress = train.loadingElapsed / SIMULATION_CONFIG.loadingDuration;
      const aboard = Math.floor(state.station.loadingProgress * train.loadingTarget + 1e-8);
      const increment = aboard - train.loadingTransferred;
      train.passengers += increment;
      train.passengerIds.push(...train.boardingIds.splice(0,increment));
      train.loadingTransferred = aboard;
      state.visitors.boarding -= increment;
      if (state.station.loadingProgress >= 1 - 1e-9) {
        transition(train, 'EMPTY');
        state.station.loadingProgress = 1;
        this.engine.log('success', `${train.id} · embarquement terminé, ${train.passengers}/20 passagers.`);
      }
    }
  }
  add(amount,laneName='standard') {
    const state=this.engine.state,visitors=state.visitors,lane=state.flow.lanes[laneName];
    if(!lane)return 0;
    const accepted=Math.min(amount,SIMULATION_CONFIG.queueCapacity-visitors.queue,lane.capacity-state.flow.people.filter(p=>p.stage==='queue'&&p.lane===laneName).length);
    for(let i=0;i<accepted;i++){const p=flowVisitor(++visitors.totalArrived,state.time,laneName);if(this.random()<.08)p.inventory=[Math.floor(this.random()*INVENTORY.length)];state.flow.people.push(p);}
    visitors.queue+=accepted;lane.arrived+=accepted;
    return accepted;
  }
  load(train) {
    const state = this.engine.state;
    train.boardingIds=this.engine.lockers.readyIds(train.capacity-train.passengers);
    this.engine.flow.board(train.boardingIds);
    train.loadingTarget = train.boardingIds.length;
    train.loadingTransferred = 0;
    train.loadingElapsed = 0;
    state.visitors.queue -= train.loadingTarget;
    state.visitors.boarding += train.loadingTarget;
    state.station.loadingProgress = 0;
    state.station.platformClear = false;
    train.rows.fill(false);
    transition(train, 'LOADING');
  }
}
