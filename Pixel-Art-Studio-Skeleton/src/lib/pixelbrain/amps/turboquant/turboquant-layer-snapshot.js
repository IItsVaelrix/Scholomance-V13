export const TurboQuantCandidateMemorySchema = {
  chunkId: "string",
  seed: "string",
  preset: "string",

  processorVersionMap: "Record<string, string>",

  lockedLayers: {
    geometry: "boolean",
    isoTile: "boolean",
    tileSockets: "boolean",
    fibonacciField: "boolean",
    volume: "boolean",
    symmetry: "boolean",
    maskedNoise: "boolean",
    biomeMaterial: "boolean",
    propScatter: "boolean"
  },

  layerSnapshots: {
    geometryHash: "string",
    isoTileHash: "string",
    tileSocketHash: "string",
    fibonacciHash: "string",
    volumeHash: "string",
    symmetryHash: "string",
    noiseHash: "string",
    materialHash: "string",
    propHash: "string"
  },

  rerollHistory: [
    {
      processorId: "string",
      seed: "string",
      accepted: "boolean",
      createdAt: "nonCanonicalTimestamp"
    }
  ],

  authoring: {
    promoted: "boolean",
    rejected: "boolean",
    handEdited: "boolean",
    notes: "string[]"
  }
};
