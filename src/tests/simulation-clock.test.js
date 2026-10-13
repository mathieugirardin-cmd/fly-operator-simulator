import { describe, expect, it } from 'vitest';
import { SimulationClock } from '../core/SimulationClock.js';

describe('horloge à pas fixe', () => {
  it('conserve le temps écoulé malgré des fréquences de rendu différentes', () => {
    const simulate = (deltas) => {
      const clock = new SimulationClock(.1);
      const steps = [];
      for (const delta of deltas) clock.update(delta, (dt) => steps.push(dt));
      return { clock, steps };
    };
    const regular = simulate(Array(120).fill(1 / 60));
    const irregular = simulate([.015, .205, .7, .08, 1]);
    expect(regular.steps).toEqual(Array(20).fill(.1));
    expect(irregular.steps).toEqual(regular.steps);
    expect(irregular.clock.accumulator).toBeCloseTo(regular.clock.accumulator, 8);
  });

  it('accumule les fractions et ignore les deltas impossibles', () => {
    const clock = new SimulationClock(.1);
    const steps = [];
    const update = (dt) => clock.update(dt, (step) => steps.push(step));
    expect(update(.04)).toBe(0);
    for (const invalid of [-1, NaN, Infinity, undefined]) expect(update(invalid)).toBe(0);
    expect(clock.accumulator).toBeCloseTo(.04);
    expect(update(.07)).toBe(1);
    expect(steps).toEqual([.1]);
    expect(clock.accumulator).toBeCloseTo(.01);
  });
});
