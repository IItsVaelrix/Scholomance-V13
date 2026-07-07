export class TileForgePipeline {
  constructor({
    processors,
    presets,
    validator,
    scorer,
    snapValidator,
    memoryStore,
    exporter
  }) {
    this.processors = processors;
    this.presets = presets;
    this.validator = validator;
    this.scorer = scorer;
    this.snapValidator = snapValidator;
    this.memoryStore = memoryStore;
    this.exporter = exporter;
  }

  generate(intent) {
    const preset = this.presets[intent.preset];

    if (!preset) {
      throw new Error(`Unknown Tile Forge preset: ${intent.preset}`);
    }

    const context = {
      layers: {},
      diagnostics: [],
      processorVersionMap: {},
      lockedLayers: intent.lockedLayers || {}
    };

    for (const processorId of preset.steps) {
      const processor = this.processors[processorId];

      if (!processor) {
        throw new Error(`Missing processor: ${processorId}`);
      }

      if (context.lockedLayers[processorId]) {
        context.layers[processorId] = this.memoryStore.restoreLayer({
          intent,
          processorId
        });
        continue;
      }

      const result = processor.run({
        intent,
        input: context.layers,
        context
      });

      context.layers[processorId] = result.output;
      context.diagnostics.push(result.diagnostics);
      context.processorVersionMap[processorId] = processor.version;

      this.memoryStore.snapshotLayer({
        intent,
        processorId,
        result
      });
    }

    const candidate = this.composeCandidate(intent, context);

    const validation = this.validator.validate(candidate);
    const snapValidation = this.snapValidator.validate(candidate);
    const score = this.scorer.score(candidate, validation, snapValidation);

    const memorySnapshot = this.memoryStore.snapshotCandidate({
      candidate,
      validation,
      snapValidation,
      score
    });

    const exportPacket = this.exporter.toPixelBrainPacket({
      candidate,
      validation,
      snapValidation,
      score,
      memorySnapshot
    });

    return {
      candidate,
      validation,
      snapValidation,
      score,
      memorySnapshot,
      exportPacket
    };
  }

  composeCandidate(intent, context) {
    return {
      id: intent.id,
      type: "isometric_tile_chunk",
      intent,
      layers: context.layers,
      processorVersionMap: context.processorVersionMap,
      diagnostics: context.diagnostics
    };
  }
}
