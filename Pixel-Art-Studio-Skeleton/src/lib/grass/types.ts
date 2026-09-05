export type RGB = readonly [number, number, number];

export type WindDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

export type TileSize = 16 | 24 | 32 | 48 | 64;

export type ViewMode = "tile" | "quad" | "meadow" | "layers";

export type LayerMode = "final" | "ground" | "blades";

export const WIND_VECTORS: Record<WindDir, readonly [number, number]> = {
  N: [-1, 0],
  NE: [-1, 1],
  E: [0, 1],
  SE: [1, 1],
  S: [1, 0],
  SW: [1, -1],
  W: [0, -1],
  NW: [-1, -1],
};

export const RANK_LABELS = [
  "shadow",
  "bed",
  "lit",
  "root",
  "leaf",
  "tip",
] as const;

export type RankLabel = (typeof RANK_LABELS)[number];

export type GrassParams = {
  width: TileSize;
  height: TileSize;
  seed: number;
  density: number;
  wind: WindDir;
  soil: number;
  bladeScale: number;
  paletteId: string;
  palette: RGB[];
};

export type GrassDiagnostics = {
  attempts: number;
  tuftCount: number;
  fillCount: number;
  counts: Record<number, number>;
  fractions: Record<number, number>;
  seed: number;
  warnings: string[];
  accepted: boolean;
};

export type GrassResult = {
  field: Int8Array;
  ground: Int8Array;
  blades: Int8Array;
  palette: string[];
  rgb: RGB[];
  width: number;
  height: number;
  diagnostics: GrassDiagnostics;
};

export type SavedTile = {
  id: string;
  name: string;
  savedAt: number;
  params: GrassParams;
  field: number[];
  palette: string[];
};
