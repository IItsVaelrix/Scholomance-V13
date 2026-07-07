export class TileForgeExporter {
  toPixelBrainPacket({ candidate, validation, snapValidation, score, memorySnapshot }) {
    return {
      id: candidate.id,
      type: "isometric_tile_chunk",
      intent: candidate.intent,
      seed: candidate.intent.seed,
      preset: candidate.intent.preset,
      layers: candidate.layers || {},
      qbit: candidate.qbit || [],
      snapProfiles: candidate.snapProfiles || [],
      processorVersionMap: memorySnapshot?.processorVersionMap || {},
      validation: validation,
      snapValidation: snapValidation,
      score: score,
      memorySnapshot: memorySnapshot,
      metadata: {
        tileForge: true
      }
    };
  }
}
