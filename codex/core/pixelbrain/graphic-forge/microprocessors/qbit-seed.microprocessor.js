import { GraphicForgeMicroprocessor } from '../graphic-forge.microprocessor.js';

export class QBITSeedMicroprocessor extends GraphicForgeMicroprocessor {
  constructor() {
    super({ id: 'gf.micro.qbit.seed', version: '1.0.0' });
  }

  run({ intent, input, context }) {
    const seeds = [...input.seeds];
    const cx = input.width / 2;
    const cy = input.height / 2;
    
    // Default intense central seed if none provided by intent
    if (seeds.length === 0) {
      seeds.push({
        x: cx,
        y: cy,
        z: 0,
        energy: 1.0,
        energyType: 0 // Resonant
      });
      
      // Entropic voids at the corners
      const entropic = -0.6; // negative energy for decay
      seeds.push({ x: 0, y: 0, z: 0, energy: entropic, energyType: 5 });
      seeds.push({ x: input.width, y: 0, z: 0, energy: entropic, energyType: 5 });
      seeds.push({ x: 0, y: input.height, z: 0, energy: entropic, energyType: 5 });
      seeds.push({ x: input.width, y: input.height, z: 0, energy: entropic, energyType: 5 });
    }
    
    // Add noise based on intent
    if (intent.noiseSeeds > 0) {
      for (let i = 0; i < intent.noiseSeeds; i++) {
        seeds.push({
          x: Math.random() * input.width,
          y: Math.random() * input.height,
          z: 0,
          energy: (Math.random() * 0.5) + 0.1, // small positive disruptions
          energyType: 0
        });
      }
    }
    
    return {
      ...input,
      seeds
    };
  }
}
