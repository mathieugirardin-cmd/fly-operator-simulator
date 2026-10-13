import {SimulationEngine as Engine} from '../core/SimulationEngine.js';
// Existing deterministic operational scenarios exclude random incidents.
// V4 incident tests exercise the probabilities and interventions separately.
export class SimulationEngine extends Engine {
  constructor(options){super(options);this.state.operations.harnessIncidents=false;this.state.maintenance.level='off';}
}
