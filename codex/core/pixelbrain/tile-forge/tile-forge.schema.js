export const TileForgeCandidateSchema = {
  id: "string",
  type: "isometric_tile_chunk",
  intent: "TileIntent",
  layers: "Record<string, ProcessorOutput>",
  qbit: "QbitCell[]",
  snapProfiles: "TileSnapProfile[]",
  memory: "TurboQuantCandidateMemory",
  authoring: "TileAuthoringState",
  validation: "TileValidationResult",
  score: "TileScoreResult"
};

export const TileAuthoringStateSchema = {
  lockedLayers: {
    geometry: "boolean",
    volume: "boolean",
    noise: "boolean",
    materials: "boolean",
    props: "boolean"
  },

  promoted: "boolean",
  rejected: "boolean",
  handEdited: "boolean",

  editableOperations: [
    "lockLayer",
    "unlockLayer",
    "rerollLayer",
    "moveChunk",
    "mirrorChunk",
    "duplicateChunk",
    "promoteCandidate",
    "rejectCandidate",
    "annotateCandidate"
  ],

  notes: "string[]"
};
