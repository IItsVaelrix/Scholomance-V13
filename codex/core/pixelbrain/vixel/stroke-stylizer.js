/**
 * v1 stylizer — role to fixed treatment. Reads .role and nothing else; passes
 * .path.cells through unread. This is the seam future style profiles (Anime
 * Ink, Manga Ink, Pixel-Clean, ...) plug into without the extractor ever
 * changing -- see docs/scholomance-encyclopedia/PDR-archive/
 * 2026-09-03-vixel-stroke-ir-v1-pdr.md §5.
 */
const V1_TREATMENT = {
  'silhouette':        { color: '#1B1230', pixelWeight: 1 },
  'material-boundary': { color: '#1B1230', pixelWeight: 1 },
};

export function stylizeStrokes(strokeIR) {
  return strokeIR.map((stroke) => ({
    cells: stroke.path.cells,
    ...V1_TREATMENT[stroke.role],
  }));
}
