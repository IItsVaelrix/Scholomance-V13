import { TileForgeMicroprocessor, stableLayerHash } from '../../tile-forge/tile-forge.microprocessor.js';
import { generateFibonacciSeedField } from './fibonacci-seed-field.js';

export class FibonacciFieldMicroprocessor extends TileForgeMicroprocessor {
  constructor() {
    super({ id: 'fibonacciField', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const config = intent.fibonacci || { enabled: false, count: 0, mode: "none" };
    
    let seeds = [];
    let fields = {};

    if (config.enabled) {
        const seedFieldResult = generateFibonacciSeedField(intent, input);
        seeds = seedFieldResult.seeds;
        fields = seedFieldResult.fields;
    }

    const output = { seeds, fields };
    return {
      output,
      diagnostics: {
        warnings: [],
        errors: [],
        metrics: { seedCount: seeds.length }
      },
      hash: stableLayerHash(output),
      processor: {
        id: this.id,
        version: this.version
      }
    };
  }
}
