export class GraphicForgePipeline {
  constructor(microprocessors = []) {
    this.microprocessors = microprocessors;
  }

  add(processor) {
    this.microprocessors.push(processor);
    return this;
  }

  run(intent) {
    let state = {
      width: intent.width || 32,
      height: intent.height || 32,
      seeds: intent.baseSeeds || [],
      field: null,
      pixels: null
    };

    const context = { startTime: Date.now() };

    for (const processor of this.microprocessors) {
      state = processor.run({ intent, input: state, context });
    }

    return state;
  }
}
