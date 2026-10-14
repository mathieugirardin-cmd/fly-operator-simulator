import { SIMULATION_CONFIG } from '../config/track.js';

export class StationSystem {
  constructor(engine) { this.engine = engine; }
  train() {
    return this.engine.state.trains.find((train) => train.blockId === 'LOAD' && train.progress >= 1&&train.state!=='GARAGING') ?? null;
  }
  reset() {
    Object.assign(this.engine.state.station, { gatesOpen: false, platformClear: false, loadingProgress: 0, autoTimer: 0 });
  }
  unload(train, dt) {
    const { state } = this.engine;
    if (!train.unloadComplete) {
      train.dwell = Math.min(SIMULATION_CONFIG.unloadingDuration, train.dwell + dt);
      const remaining=Math.ceil(train.loadingTarget*(1-train.dwell/SIMULATION_CONFIG.unloadingDuration)-1e-8);
      const leaving=Math.max(0,train.passengers-remaining);
      for(const id of train.passengerIds.splice(0,leaving)){state.flow.egress.push({id,stage:'unloading',remaining:state.flow.room.travelDuration});state.visitors.transported++;train.passengers--;}
      if (train.dwell + 1e-9 < SIMULATION_CONFIG.unloadingDuration) return;
      if(train.passengers>0)return;
      if(train.testInProgress){train.testValid=true;train.testInProgress=false;this.engine.log('success',`${train.id} · cycle de test à vide validé.`);}
      train.unloadComplete = true;
      train.loadingElapsed = 0;
      train.loadingTarget = 0;
      train.loadingTransferred = 0;
      this.engine.log('success', `${train.id} · débarquement terminé, train vide confirmé.`);
    }
    if (train.removeRequested) this.engine.trains.store(train);
    else this.engine.trains.advance(train);
  }
  update(dt) {
    const { state } = this.engine;
    const testing=state.service.phase==='TESTS';
    if (!state.initialized || (!state.open&&!testing) || state.mode !== 'auto' || state.emergency || state.hold || !state.dispatchEnabled) return;
    const train = this.train();
    if (!train || train.state === 'LOADING') return;
    state.station.autoTimer += dt;
    if (state.station.autoTimer + 1e-9 < SIMULATION_CONFIG.automaticActionInterval) return;
    state.station.autoTimer = 0;
    if(testing) {
      if(train.passengers)return;
      if(state.station.gatesOpen)this.engine.command('TOGGLE_GATES');
      else if(train.harness!=='closed')this.engine.command('CLOSE_HARNESSES');
      else if(train.rows.some(x=>!x))this.engine.command('CHECK_ALL');
      else if(!state.station.platformClear)this.engine.command('CLEAR_PLATFORM');
      else if(this.engine.dispatcher.departureIssue()===null)this.engine.command('DISPATCH');
      return;
    }
    // Chaque étape automatique passe par les mêmes validations que le pupitre.
    if (train.harness === 'open' && state.station.loadingProgress === 0 && train.passengers === 0) {
      if (!state.station.gatesOpen) this.engine.command('TOGGLE_GATES');
      else if (this.engine.lockers.readyIds().length > 0) this.engine.command('LOAD');
      return;
    }
    if (state.station.gatesOpen) this.engine.command('TOGGLE_GATES');
    else if (train.harness !== 'closed') this.engine.command('CLOSE_HARNESSES');
    else if (train.rows.some((checked) => !checked)) return; // Virtual checks run progressively in HarnessSystem; defects require intervention.
    else if (!state.station.platformClear) this.engine.command('CLEAR_PLATFORM');
    else if (this.engine.dispatcher.departureIssue() === null) this.engine.command('DISPATCH');
  }
}
