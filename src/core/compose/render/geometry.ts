/**
 * Phase 10 — semantic geometry parity (not pixel snapshots).
 * PDR: compare geometry within declared tolerance, not browser text pixels.
 */

export type SemanticGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GeometryCompareOptions = {
  tolerancePx?: number;
};

export type GeometryFieldDiff = {
  field: keyof SemanticGeometry;
  expected: number;
  actual: number;
  delta: number;
};

export type GeometryCompareResult = {
  ok: boolean;
  maxDelta: number;
  diffs: GeometryFieldDiff[];
  tolerancePx: number;
};

const FIELDS: (keyof SemanticGeometry)[] = ['x', 'y', 'width', 'height'];

/**
 * Compare two semantic geometry boxes. Passes when every field is within tolerance.
 */
export function compareSemanticGeometry(
  expected: SemanticGeometry,
  actual: SemanticGeometry,
  options: GeometryCompareOptions = {},
): GeometryCompareResult {
  const tolerancePx = options.tolerancePx ?? 1;
  const diffs: GeometryFieldDiff[] = [];
  let maxDelta = 0;

  for (const field of FIELDS) {
    const delta = Math.abs(expected[field] - actual[field]);
    maxDelta = Math.max(maxDelta, delta);
    if (delta > tolerancePx) {
      diffs.push({
        field,
        expected: expected[field],
        actual: actual[field],
        delta,
      });
    }
  }

  return {
    ok: diffs.length === 0,
    maxDelta,
    diffs,
    tolerancePx,
  };
}
