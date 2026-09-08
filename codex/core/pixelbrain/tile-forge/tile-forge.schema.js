export const TileForgeCandidateSchema = {
  id: "string",
  type: "string", // "isometric_tile_chunk" | polymorphic ASSET_CLASSES
  assetClass: "string?",
  assetSpec: "AssetSpec?",
  visualBounds: "{ width: number, height: number, anchorX: number, anchorY: number }?",
  logicalFootprint: "{ gridW: number, gridH: number, originTx: number, originTy: number, elevation: number, walkable: boolean }?",
  intent: "TileIntent",
  layers: "Record<string, ProcessorOutput>",
  qbit: "QbitCell[]",
  snapProfiles: "TileSnapProfile[]",
  memory: "TurboQuantCandidateMemory",
  authoring: "TileAuthoringState",
  validation: "TileValidationResult",
  score: "TileScoreResult"
};

export const AssetSpecSchema = {
  id: "string",
  assetClass: "string",
  semanticType: "string",
  biome: "string",
  paletteFamily: "string",
  materialGrammar: "string",
  detailDensity: "string",
  lighting: "object",
  logicalFootprint: "object",
  visualBounds: "object",
  seed: "number|string",
  subSeeds: "object"
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
