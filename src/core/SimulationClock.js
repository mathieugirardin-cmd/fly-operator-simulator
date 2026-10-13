export class SimulationClock {
  constructor(step = 0.1) { this.fixedStep = step; this.accumulator = 0; }
  update(deltaSeconds, callback) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return 0;
    this.accumulator += deltaSeconds;
    let steps = 0;
    while (this.accumulator + 1e-9 >= this.fixedStep) {
      this.accumulator = Math.max(0, this.accumulator - this.fixedStep);
      callback(this.fixedStep);
      steps += 1;
    }
    return steps;
  }
}
