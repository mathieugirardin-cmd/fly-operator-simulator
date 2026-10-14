import {SimulationEngine as Engine} from '../core/SimulationEngine.js';
// Existing deterministic operational scenarios exclude random incidents.
// V4 incident tests exercise the probabilities and interventions separately.
export class SimulationEngine extends Engine {
  constructor(options){super(options);this.state.operations.harnessIncidents=false;this.state.maintenance.level='off';}
  command(type,payload){
    const result=super.command(type,payload);
    // These legacy operational fixtures begin with already certified rolling stock.
    // Service-system.test.js covers the real commissioning sequence on the base engine.
    if(type==='INITIALIZE'&&result.status==='accepted'){this.state.trains.forEach(t=>t.testValid=true);this.state.service.phase='TESTS';}
    return result;
  }
}
