import { SIMULATION_CONFIG } from '../config/track.js';

export class StationSystem {
  constructor(engine) { this.engine = engine; }
  train() {
    return this.engine.state.trains.find((train) => train.blockId === 'LOAD' && train.progress >= 1) ?? null;
  }
  reset() {
    Object.assign(this.engine.state.station, { gatesOpen: false, platformClear: false, loadingProgress: 0, autoTimer: 0 });
  }
  unload(train, dt) {
    const { state } = this.engine;
    if (!train.unloadComplete) {
      train.dwell = Math.min(SIMULATION_CONFIG.unloadingDuration, train.dwell + dt);
      if (train.dwell + 1e-9 < SIMULATION_CONFIG.unloadingDuration) return;
      const passengers = train.passengers;
      this.engine.lockers.retrieve(train.passengerIds);
      train.passengerIds=[];
      state.visitors.transported += passengers;
      train.passengers = 0;
      train.unloadComplete = true;
      train.loadingElapsed = 0;
      train.loadingTarget = 0;
      train.loadingTransferred = 0;
      this.engine.log('success', `${train.id} · ${passengers} passagers débarqués, train vide confirmé.`);
    }
    if (train.removeRequested) this.engine.trains.store(train);
    else this.engine.trains.advance(train);
  }
  update(dt) {
    const { state } = this.engine;
    if (!state.initialized || !state.open || state.mode !== 'auto' || state.emergency || state.hold || !state.dispatchEnabled) return;
    const train = this.train();
    if (!train || train.state === 'LOADING') return;
    state.station.autoTimer += dt;
    if (state.station.autoTimer + 1e-9 < SIMULATION_CONFIG.automaticActionInterval) return;
    state.station.autoTimer = 0;
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
