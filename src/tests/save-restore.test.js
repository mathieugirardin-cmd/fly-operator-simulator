import { describe, expect, it } from 'vitest';
import { SimulationEngine } from './test-engine.js';

function running() {
  const engine = new SimulationEngine({ seed: 812 });
  for (const [type, payload] of [['INITIALIZE'], ['OPEN'], ['SET_MODE', { mode: 'auto' }], ['TOGGLE_DISPATCH']]) {
    expect(engine.command(type, payload).status).toBe('accepted');
  }
  return engine;
}

describe('restauration cohérente et déterministe', () => {
  it('reprend exactement un embarquement partiel, avec horloge fractionnaire et générateur aléatoire', () => {
    const original = running();
    for (let tick = 0; tick < 1000; tick++) {
      original.update(.1);
      if (original.state.trains[0].state === 'LOADING' && original.state.trains[0].loadingElapsed > 2) break;
    }
    expect(original.state.visitors.boarding).toBeGreaterThan(0);
    expect(original.state.trains[0].passengers).toBeGreaterThan(0);
    original.update(.037);
    const saved = JSON.parse(JSON.stringify(original.snapshot()));
    expect(saved.clockAccumulator).toBeCloseTo(.037);
    const restored = new SimulationEngine({ seed: 1 });
    restored.restore(saved);
    expect(restored.snapshot()).toEqual(saved);
    const frameTimes = [1 / 60, .05, .083, .201];
    for (let frame = 0; frame < 4000; frame++) {
      const dt = frameTimes[frame % frameTimes.length];
      original.update(dt);
      restored.update(dt);
    }
    expect(original.state.stats.dispatches).toBeGreaterThan(2);
    expect(original.state.visitors.transported).toBeGreaterThan(20);
    expect(restored.snapshot()).toEqual(original.snapshot());
  });

  it('ne partage aucune référence modifiable avec un instantané enregistré ou restauré', () => {
    const engine = running();
    const data = engine.snapshot();
    const expected = structuredClone(data);
    data.trains[0].rows[0] = true;
    data.blocks[0].blocked = true;
    expect(engine.snapshot()).toEqual(expected);
    engine.restore(expected);
    expected.trains[0].passengers = 20;
    expected.station.gatesOpen = true;
    expect(engine.state.trains[0].passengers).toBe(0);
    expect(engine.state.station.gatesOpen).toBe(false);
  });

  it('accepte ses instantanés pendant tous les stades d’un parcours et les réservations en approche', () => {
    const original = running();
    const encountered = new Set();
    let reservations = 0;
    for (let tick = 0; tick < 2500; tick++) {
      original.update(.1);
      const stage = `${original.state.trains[0].blockId}:${original.state.trains[0].state}`;
      const hasReservation = original.state.blocks.some((block) => block.reservedBy);
      if (encountered.has(stage) && (!hasReservation || reservations)) continue;
      encountered.add(stage);
      if (hasReservation) reservations++;
      const snapshot = original.snapshot();
      const copy = new SimulationEngine();
      expect(() => copy.restore(snapshot), stage).not.toThrow();
      expect(copy.snapshot()).toEqual(snapshot);
    }
    expect([...encountered]).toContain('LOAD:LOADING');
    expect([...encountered]).toContain('LOAD:READY');
    expect([...encountered]).toContain('UNLOAD:UNLOADING');
    expect([...encountered]).toContain('BRAKES:BRAKING');
    expect(reservations).toBeGreaterThan(0);
  });

  it('restaure une urgence active sans la réarmer ni autoriser les départs', () => {
    const engine = running();
    for (let tick = 0; tick < 450; tick++) engine.update(.1);
    expect(engine.command('EMERGENCY_STOP').status).toBe('accepted');
    const restored = new SimulationEngine();
    restored.restore(JSON.parse(JSON.stringify(engine.snapshot())));
    const positions = restored.state.trains.map(({ blockId, progress }) => [blockId, progress]);
    restored.update(15);
    expect(restored.state.emergency).toBe(true);
    expect(restored.state.dispatchEnabled).toBe(false);
    expect(restored.state.trains.map(({ blockId, progress }) => [blockId, progress])).toEqual(positions);
    expect(restored.command('RESET_EMERGENCY').status).toBe('rejected');
  });

  const corruptions = [
    ['version inconnue', (data) => { data.version = 99; }],
    ['horloge non finie', (data) => { data.time = NaN; }],
    ['accumulateur négatif', (data) => { data.clockAccumulator = -.1; }],
    ['générateur aléatoire invalide', (data) => { data.rngState = Infinity; }],
    ['train manquant', (data) => { data.trains.pop(); }],
    ['identifiant de train dupliqué', (data) => { data.trains[1].id = 'T01'; }],
    ['position hors canton', (data) => { data.trains[0].progress = 1.1; }],
    ['capacité de train dépassée', (data) => { data.trains[0].passengers = 21; }],
    ['rangée invalide', (data) => { data.trains[0].rows[0] = 'vérifiée'; }],
    ['état incompatible avec la voie', (data) => { data.trains[0].state = 'READY'; }],
    ['train présent dans deux cantons', (data) => { data.blocks[0].occupiedBy = 'T01'; }],
    ['occupation manquante', (data) => { data.blocks.find((block) => block.id === 'RETURN').occupiedBy = null; }],
    ['réservation inconnue', (data) => { data.blocks[0].reservedBy = 'T99'; }],
    ['réservation hors itinéraire', (data) => { data.blocks.find((block) => block.id === 'COURSE2').reservedBy = 'T01'; }],
    ['canton manquant', (data) => { data.blocks.pop(); }],
    ['longueur négative de canton', (data) => { data.blocks[0].length = -1; }],
    ['file trop remplie', (data) => { data.visitors.queue = 241; }],
    ['perte de visiteurs', (data) => { data.visitors.totalArrived += 1; }],
    ['embarquement sans train', (data) => { data.visitors.boarding = 1; }],
    ['portillons ouverts sans quai occupé', (data) => { data.station.gatesOpen = true; }],
    ['statistiques de départ incohérentes', (data) => { data.stats.dispatches += 1; }],
    ['statistiques de transport incohérentes', (data) => { data.stats.transported += 1; }],
    ['autorisation pendant une urgence', (data) => { data.emergency = true; data.dispatchEnabled = true; }],
    ['mode inconnu', (data) => { data.mode = 'turbo'; }],
    ['événement dans le futur', (data) => { data.events[0].time = data.time + 100; }],
  ];

  it.each(corruptions)('rejette %s et préserve intégralement la partie courante', (_, corrupt) => {
    const engine = running();
    engine.update(.037);
    const before = engine.snapshot();
    const malformed = structuredClone(before);
    corrupt(malformed);
    expect(() => engine.restore(malformed)).toThrow(/sauvegarde incohérente/i);
    expect(engine.snapshot()).toEqual(before);
  });

  it.each([null, undefined, [], {}, 'invalide'])('refuse une entrée sans structure de sauvegarde : %j', (value) => {
    const engine = new SimulationEngine();
    const before = engine.snapshot();
    expect(() => engine.restore(value)).toThrow(/sauvegarde incohérente/i);
    expect(engine.snapshot()).toEqual(before);
  });
});
