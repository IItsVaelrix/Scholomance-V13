import { TileForgeMicroprocessor, stableLayerHash } from '../../tile-forge/tile-forge.microprocessor.js';
import { generateNoiseMask } from './noise-mask.microprocessor.js';

export class PerlinFieldMicroprocessor extends TileForgeMicroprocessor {
  constructor() {
    super({ id: 'maskedNoise', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const config = intent.noise || { enabled: false, scale: 0.1, intensity: 0.5 };
    
    let fields = {};
    let masks = {};
    let affectedCells = [];

    if (config.enabled) {
        const maskResult = generateNoiseMask(intent, input, config);
        fields = maskResult.fields;
        masks = maskResult.masks;
        affectedCells = maskResult.affectedCells;
    }

    const output = { fields, masks, affectedCells };
    return {
      output,
      diagnostics: {
        warnings: [],
        errors: [],
        metrics: { affectedCellCount: affectedCells.length }
      },
      hash: stableLayerHash(output),
      processor: {
        id: this.id,
        version: this.version
      }
    };
  }
}
