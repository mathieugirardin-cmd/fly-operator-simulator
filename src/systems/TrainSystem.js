import { NEXT_BLOCK } from '../config/track.js';
import { transition } from '../core/StateMachine.js';
import { FLEET_SIZE } from '../config/operations.js';
import {createRestraints} from './HarnessSystem.js';

export function createTrains() {
  return Array.from({ length: FLEET_SIZE }, (_, index) => ({
    id: `T0${index + 1}`, state: index === 0 ? 'TRANSFER' : 'STORED',
    blockId: index === 0 ? 'RETURN' : null, progress: index === 0 ? 0.7 : 0,
    speed: 0, passengers: 0, capacity: 20, rows: Array(10).fill(false),
    harness: 'open', rotation: 0, available: true, departures: 0,
    dwell: 0, unloadComplete: false, loadingElapsed: 0, loadingTarget: 0, loadingTransferred: 0,
    removeRequested: false, serviceRequested:false, waitingState: null, passengerIds:[],boardingIds:[],
    restraints:createRestraints(),harnessTimer:0,
  }));
}

const routeState = (id) => id === 'BRAKES' ? 'BRAKING'
  : ['RETURN', 'TRANSFER', 'LOAD', 'UNLOAD'].includes(id) ? 'TRANSFER'
  : id === 'DEPART' ? 'DISPATCHED' : 'ON_TRACK';

export class TrainSystem {
  constructor(engine) { this.engine = engine; }
  update(dt) {
    const { state, blocks, stations } = this.engine;
    if (!state.initialized || state.emergency) return;
    const requested=state.trains.find(t=>t.state==='STORED'&&t.serviceRequested&&t.available);
    if(requested&&blocks.canEnter('TRANSFER',requested.id))this.engine.command('ADD_TRAIN',{trainId:requested.id});
    for (const train of state.trains) {
      if (!train.blockId || train.state === 'FAULT' || train.state === 'MAINTENANCE') continue;
      const block = blocks.get(train.blockId);
      if (block.blocked||this.engine.maintenance.has(`block:${block.id}`)||this.engine.maintenance.has(`train:${train.id}`)||this.engine.maintenance.has('supervision')) { train.speed = 0; continue; }
      if (train.blockId === 'LOAD' && train.progress >= 1) { train.speed = 0; continue; }
      if (train.blockId === 'UNLOAD' && train.progress >= 1) {
        train.speed = 0;
        stations.unload(train, dt);
        continue;
      }
      if (train.progress >= 1) {
        this.advance(train);
        continue;
      }
      const limit = block.maxSpeed;
      train.speed = Math.min(limit, train.speed + dt * (block.type === 'launch' ? 7 : 5));
      // Train arrêté exactement à l'extrémité d'un canton avant toute acquisition.
      train.progress = Math.min(1, train.progress + train.speed * dt / block.length);
      if (train.blockId === 'DEPART') train.rotation = train.progress;
      else if (train.blockId === 'BRAKES') train.rotation = 1 - train.progress;
      else if (['LAUNCH1','COURSE1','LAUNCH2','COURSE2'].includes(train.blockId)) train.rotation = 1;
      else train.rotation = 0;
      if (train.progress > 0.8 && !['LOAD', 'UNLOAD'].includes(train.blockId)) {
        blocks.reserve(NEXT_BLOCK[train.blockId], train.id);
      }
      if (train.progress >= 1) {
        if (train.blockId === 'LOAD') {
          train.speed = 0;
          transition(train, 'EMPTY');
          stations.reset();
          this.engine.log('info', `${train.id} à quai · prêt pour l'embarquement.`);
        } else if (train.blockId === 'UNLOAD') {
          train.speed = 0;
          transition(train, 'UNLOADING');
          train.harness = 'open';
          train.rows.fill(false);
          train.dwell = 0;
          train.unloadComplete = false;
          this.engine.log('info', `${train.id} au débarquement · ouverture des harnais.`);
        } else this.advance(train);
      }
    }
  }
  advance(train) {
    const destination = NEXT_BLOCK[train.blockId];
    if (!this.engine.blocks.enter(train, destination)) {
      train.speed = 0;
      if (train.state !== 'BLOCKED') {
        train.waitingState = train.state;
        transition(train, 'BLOCKED');
        this.engine.log('warning', `${train.id} attend la libération de ${this.engine.blocks.get(destination).name.toLowerCase()}.`);
      }
      return false;
    }
    transition(train, routeState(destination));
    train.waitingState = null;
    return true;
  }
  store(train) {
    if(this.engine.maintenance.has('garage'))return false;
    this.engine.blocks.release(train.id);
    transition(train, 'STORED');
    train.blockId = null;
    train.progress = 0;
    train.speed = 0;
    train.rotation = 0;
    train.harness = 'open';
    train.rows.fill(false);
    train.removeRequested = false;
    train.serviceRequested = false;
    train.waitingState = null;
    this.engine.log('success', `${train.id} retiré du service et garé.`);
  }
}
