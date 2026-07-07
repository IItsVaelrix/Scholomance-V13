import { GraphicForgeMicroprocessor } from '../graphic-forge.microprocessor.js';
import { propagateWithOctree, ATTENUATION_MODELS } from '../../qbit-field.js';

export class QBITPropagateMicroprocessor extends GraphicForgeMicroprocessor {
  constructor() {
    super({ id: 'gf.micro.qbit.propagate', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const { width, height, seeds } = input;
    const depth = 1; // 2D tiles are a 1-deep slice of the lattice
    
    // Allow intent to override physics
    const decay = intent.decay || 0.1;
    const iterations = intent.iterations || 2;
    const attenuationModel = intent.attenuationModel || ATTENUATION_MODELS.PHI_ATTENUATION;
    
    const field = propagateWithOctree(
      seeds || [],
      width,
      height,
      depth,
      {
        attenuationModel,
        iterations,
        decay,
        maxRadius: Math.max(width, height)
      }
    );
    
    return {
      ...input,
      field
    };
  }
}
