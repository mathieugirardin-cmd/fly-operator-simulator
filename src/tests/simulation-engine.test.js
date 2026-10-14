import assert from 'node:assert/strict';
import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './test-engine.js';
import { SIMULATION_CONFIG } from '../config/track.js';
import { getTrainPose } from '../rendering/TrackGeometry.js';

const run = (engine, seconds) => {
  for (let tick = 0; tick < Math.round(seconds * 10); tick++) engine.step(.1);
};
const until = (engine, predicate, maxSeconds = 180) => {
  for (let tick = 0; tick <= maxSeconds * 10; tick++) {
    if (predicate()) return;
    engine.step(.1);
  }
  throw new Error(`Condition non atteinte après ${maxSeconds} secondes de simulation.`);
};
const command = (engine, type, payload = {}) => {
  const result = engine.command(type, payload);
  expect(result, `${type}: ${result.message}`).toMatchObject({ status: 'accepted' });
  return result;
};
const trainAtQuay = (engine) => engine.state.trains.find((train) => train.blockId === 'LOAD' && train.progress === 1);
const initialized = () => {
  const engine = new SimulationEngine({ seed: 42 });
  command(engine, 'INITIALIZE');
  command(engine, 'OPEN');
  until(engine, () => Boolean(trainAtQuay(engine))&&engine.lockers.readyIds().length===20);
  return engine;
};
const load = (engine) => {
  command(engine, 'TOGGLE_GATES');
  command(engine, 'LOAD');
  until(engine, () => trainAtQuay(engine)?.state !== 'LOADING', 10);
  command(engine, 'TOGGLE_GATES');
};
const prepare = (engine) => {
  load(engine);
  command(engine, 'CLOSE_HARNESSES');
  command(engine, 'CHECK_ALL');
  command(engine, 'CLEAR_PLATFORM');
};

function assertWorld(state) {
  const active = state.trains.filter((train) => train.blockId);
  assert.equal(new Set(active.map((train) => train.blockId)).size, active.length, 'Deux trains occupent le même canton');
  for (const block of state.blocks) {
    const occupying = active.filter((train) => train.blockId === block.id);
    assert.equal(block.occupiedBy, occupying[0]?.id ?? null, `Occupation incohérente de ${block.id}`);
    if (block.reservedBy) {
      assert(state.trains.some((train) => train.id === block.reservedBy), 'Réservation orpheline');
      assert(!block.occupiedBy || block.occupiedBy === block.reservedBy, 'Réservation incompatible avec l’occupant');
    }
  }
  let aboard = 0;
  for (const train of state.trains) {
    assert(Number.isInteger(train.passengers) && train.passengers >= 0 && train.passengers <= 20, 'Capacité train dépassée');
    assert(Number.isFinite(train.progress) && train.progress >= 0 && train.progress <= 1, 'Progression invalide');
    assert(getTrainPose(train).position.every(Number.isFinite), 'Position de rendu invalide');
    aboard += train.passengers;
  }
  assert(state.visitors.queue >= 0 && state.visitors.queue <= SIMULATION_CONFIG.queueCapacity, 'Capacité file dépassée');
  assert(state.visitors.boarding >= 0 && state.visitors.boarding <= 20, 'Capacité embarquement dépassée');
  assert.equal(state.visitors.queue + state.visitors.boarding + aboard + state.visitors.transported,
    state.visitors.totalArrived, 'Visiteurs perdus ou comptés deux fois');
  assert.equal(state.stats.transported, state.visitors.transported, 'Statistique transportés désynchronisée');
  assert.equal(state.stats.dispatches, state.trains.reduce((sum, train) => sum + train.departures, 0), 'Départs comptés deux fois');
}

describe('exploitation par les commandes publiques', () => {
  it('commence fermé et attend l’initialisation avant une arrivée animée et un arrêt au quai', () => {
    const engine = new SimulationEngine();
    const first = engine.state.trains[0];
    const start = { blockId: first.blockId, progress: first.progress };
    expect(engine.state.open).toBe(false);
    expect(engine.state.trains.map((train) => train.id)).toEqual(['T01', 'T02', 'T03', 'T04', 'T05', 'T06']);
    expect(engine.command('OPEN').status).toBe('rejected');
    run(engine, 2);
    expect({ blockId: first.blockId, progress: first.progress }).toEqual(start);
    command(engine, 'INITIALIZE');
    run(engine, 1);
    expect(first.progress).not.toBe(start.progress);
    until(engine, () => Boolean(trainAtQuay(engine)));
    expect(first).toMatchObject({ id: 'T01', blockId: 'LOAD', progress: 1, speed: 0, state: 'EMPTY' });
    run(engine, 20);
    expect(first).toMatchObject({ blockId: 'LOAD', progress: 1, speed: 0 });
    expect(engine.state.stats.dispatches).toBe(0);
  });

  it('refuse chaque départ prématuré et n’enregistre qu’un départ après tous les contrôles', () => {
    const engine = initialized();
    command(engine, 'TOGGLE_DISPATCH');
    expect(engine.command('DISPATCH').message).toMatch(/harnais/i);
    command(engine, 'TOGGLE_GATES');
    expect(engine.command('DISPATCH').message).toMatch(/portillons/i);
    command(engine, 'LOAD');
    expect(engine.command('DISPATCH').status).toBe('rejected');
    expect(engine.command('CLOSE_HARNESSES').status).toBe('rejected');
    until(engine, () => trainAtQuay(engine).state !== 'LOADING');
    expect(trainAtQuay(engine).passengers).toBe(20);
    command(engine, 'TOGGLE_GATES');
    command(engine, 'CLOSE_HARNESSES');
    for (let index = 0; index < 9; index++) command(engine, 'CHECK_ROW', { index });
    expect(engine.command('DISPATCH').message).toMatch(/rangées/i);
    command(engine, 'CHECK_ROW', { index: 9 });
    expect(engine.command('DISPATCH').message).toMatch(/quai/i);
    command(engine, 'CLEAR_PLATFORM');
    command(engine, 'TOGGLE_DISPATCH');
    expect(engine.command('DISPATCH').message).toMatch(/autorisation/i);
    command(engine, 'TOGGLE_DISPATCH');
    run(engine, 5);
    expect(engine.state.stats.dispatches).toBe(0);
    command(engine, 'DISPATCH');
    expect(engine.state.trains[0]).toMatchObject({ blockId: 'DEPART', state: 'DISPATCHED', passengers: 20, departures: 1 });
    expect(engine.command('DISPATCH').status).toBe('rejected');
    expect(engine.state.stats.dispatches).toBe(1);
    expect(engine.state.visitors.transported).toBe(0);
  });

  it('annule les contrôles après réouverture des harnais et bloque un canton de départ indisponible', () => {
    const engine = initialized();
    prepare(engine);
    command(engine, 'TOGGLE_DISPATCH');
    command(engine, 'OPEN_HARNESSES');
    expect(trainAtQuay(engine).rows).toEqual(Array(10).fill(false));
    expect(engine.state.station.platformClear).toBe(false);
    command(engine, 'CLOSE_HARNESSES');
    expect(engine.command('DISPATCH').status).toBe('rejected');
    command(engine, 'CHECK_ALL');
    command(engine, 'CLEAR_PLATFORM');
    engine.state.blocks.find((block) => block.id === 'DEPART').blocked = true;
    expect(engine.command('DISPATCH').message).toMatch(/canton/i);
    expect(trainAtQuay(engine).departures).toBe(0);
  });

  it('effectue deux cycles manuels complets sans recompter le débarquement', () => {
    const engine = initialized();
    command(engine, 'TOGGLE_DISPATCH');
    for (let trip = 1; trip <= 2; trip++) {
      prepare(engine);
      command(engine, 'DISPATCH');
      const visited = new Set();
      until(engine, () => {
        visited.add(engine.state.trains[0].blockId);
        assertWorld(engine.state);
        return engine.state.visitors.transported === trip * 20 && Boolean(trainAtQuay(engine));
      });
      expect(visited).toEqual(new Set(['DEPART', 'LAUNCH1', 'COURSE1', 'LAUNCH2', 'COURSE2', 'BRAKES', 'RETURN', 'UNLOAD', 'TRANSFER', 'LOAD']));
      expect(trainAtQuay(engine)).toMatchObject({ passengers: 0, harness: 'open', rotation: 0, departures: trip });
      run(engine, 5);
      expect(engine.state.stats.transported).toBe(trip * 20);
      expect(engine.state.stats.dispatches).toBe(trip);
    }
  });

  it('en automatique attend l’autorisation générale puis vérifie et expédie le train', () => {
    const engine = initialized();
    command(engine, 'SET_MODE', { mode: 'auto' });
    run(engine, 40);
    expect(engine.state.stats.dispatches).toBe(0);
    expect(trainAtQuay(engine).passengers).toBe(0);
    command(engine, 'TOGGLE_DISPATCH');
    until(engine, () => engine.state.stats.dispatches === 1, 40);
    expect(engine.state.trains[0]).toMatchObject({ harness: 'closed', passengers: 20 });
    expect(engine.state.trains[0].rows.every(Boolean)).toBe(true);
    expect(engine.state.station.gatesOpen).toBe(false);
  });

  it('le maintien empêche les départs et laisse les trains déjà partis terminer leur parcours', () => {
    const engine = initialized();
    prepare(engine);
    command(engine, 'TOGGLE_DISPATCH');
    command(engine, 'TOGGLE_HOLD');
    expect(engine.command('DISPATCH').message).toMatch(/maintien/i);
    run(engine, 5);
    expect(engine.state.stats.dispatches).toBe(0);
    command(engine, 'TOGGLE_HOLD');
    command(engine, 'DISPATCH');
    command(engine, 'TOGGLE_HOLD');
    until(engine, () => engine.state.visitors.transported === 20);
    expect(engine.state.hold).toBe(true);
    expect(engine.state.stats.dispatches).toBe(1);
  });

  it('l’urgence fige les mouvements et nécessite acquittement, réarmement puis nouvelle autorisation', () => {
    const engine = initialized();
    prepare(engine);
    command(engine, 'TOGGLE_DISPATCH');
    command(engine, 'DISPATCH');
    run(engine, 3);
    command(engine, 'EMERGENCY_STOP');
    const positions = engine.state.trains.map(({ blockId, progress, passengers }) => ({ blockId, progress, passengers }));
    run(engine, 8);
    expect(engine.state.trains.map(({ blockId, progress, passengers }) => ({ blockId, progress, passengers }))).toEqual(positions);
    expect(engine.state.trains.every((train) => train.speed === 0)).toBe(true);
    expect(engine.command('DISPATCH').status).toBe('fault');
    expect(engine.command('RESET_EMERGENCY').status).toBe('rejected');
    expect(engine.state.stats.incidents).toBe(1);
    expect(engine.command('EMERGENCY_STOP').status).toBe('rejected');
    expect(engine.state.stats.incidents).toBe(1);
    command(engine, 'ACKNOWLEDGE');
    command(engine, 'RESET_EMERGENCY');
    expect(engine.state.dispatchEnabled).toBe(false);
    run(engine, 1);
    expect(engine.state.trains.map(({ blockId, progress, passengers }) => ({ blockId, progress, passengers }))).not.toEqual(positions);
    expect(engine.state.stats.interruptionTime).toBeCloseTo(8);
  });

  it('borne la file saturée et coupe les nouvelles arrivées à la fermeture', () => {
    const engine = initialized();
    run(engine, 900);
    assertWorld(engine.state);
    expect(engine.state.flow.people.filter(p=>p.stage==='queue'&&p.lane==='standard')).toHaveLength(engine.state.flow.lanes.standard.capacity);
    command(engine, 'CLOSE');
    const arrived = engine.state.visitors.totalArrived;
    run(engine, 60);
    expect(engine.state.visitors.totalArrived).toBe(arrived);
    expect(engine.command('LOAD').status).toBe('rejected');
    expect(engine.state.dispatchEnabled).toBe(false);
  });

  it('exploite six trains dix minutes, conserve les visiteurs et retire un train après débarquement', () => {
    const engine = initialized();
    command(engine, 'SET_MODE', { mode: 'auto' });
    command(engine, 'TOGGLE_DISPATCH');
    let observedDisembarked = 0;
    let maxActive = 0;
    for (let tick = 0; tick < 6000; tick++) {
      if (tick % 10 === 0) {
        for (const train of engine.state.trains.filter((item) => item.state === 'STORED')) {
          const result = engine.command('ADD_TRAIN', { trainId: train.id });
          expect(['accepted', 'pending']).toContain(result.status);
        }
      }
      const before = engine.state.trains.map(({ blockId, passengers }) => ({ blockId, passengers }));
      engine.step(.1);
      engine.state.trains.forEach((train, index) => {
        if (before[index].blockId === 'UNLOAD' && before[index].passengers>train.passengers) {
          observedDisembarked += before[index].passengers-train.passengers;
        }
      });
      assertWorld(engine.state);
      assert.equal(engine.state.visitors.transported, observedDisembarked);
      maxActive = Math.max(maxActive, engine.state.trains.filter((train) => train.blockId).length);
    }
    expect(maxActive).toBe(6);
    expect(engine.state.trains.every((train) => train.departures >= 3)).toBe(true);
    expect(observedDisembarked).toBeGreaterThan(200);
    expect(engine.state.stats.fillRate).toBeGreaterThan(0);
    expect(engine.state.stats.fillRate).toBeLessThanOrEqual(1);
    const removed = engine.state.trains[3];
    expect(['accepted', 'pending']).toContain(engine.command('REMOVE_TRAIN', { trainId: removed.id }).status);
    until(engine, () => removed.state === 'STORED', 240);
    expect(removed).toMatchObject({ passengers: 0, blockId: null, speed: 0 });
    assertWorld(engine.state);
    expect(engine.state.blocks.some((block) => block.occupiedBy === removed.id || block.reservedBy === removed.id)).toBe(false);
  });
});
