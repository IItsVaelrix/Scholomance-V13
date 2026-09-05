const WIND_VECTORS = {
  N: [-1, 0],
  NE: [-1, 1],
  E: [0, 1],
  SE: [1, 1],
  S: [1, 0],
  SW: [1, -1],
  W: [0, -1],
  NW: [-1, -1]
};
const RANK_LABELS = [
  "shadow",
  "bed",
  "lit",
  "root",
  "leaf",
  "tip"
];
export {
  RANK_LABELS,
  WIND_VECTORS
};
