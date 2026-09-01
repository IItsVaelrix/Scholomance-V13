/**
 * SCDL union/subtract/intersect — end-to-end, cross-part.
 *
 * Before this pass, boolean-op targets addressed auto-generated op ids
 * (e.g. "op:body:2:circle") that no SCDL author can type, so union/subtract/
 * intersect always silently combined nothing — confirmed by compiling
 * `subtract a b` on two overlapping circles and observing byte-identical
 * output to no subtract at all. Targets now address sibling PART ids
 * (the one thing authors already name), resolved via geometry-amp.js's
 * buildPartMask() for shape/overlap testing, scoped per-part so an
 * overlapping sibling can't steal cell ownership the way item-foundry's
 * exclusive-territory silhouettes intentionally allow.
 */

import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

function coordsByPart(result) {
  const byPart = {};
  for (const c of result.packet.geometry.coordinates) {
    byPart[c.partId] = (byPart[c.partId] || 0) + 1;
  }
  return byPart;
}

describe('SCDL boolean ops — cross-part union/subtract/intersect', () => {
  it('union combines two disjoint sibling parts into the consuming part', () => {
    const result = compileSCDL(`
asset union_probe canvas 8x8
part a material source { circle 2 2 radius 1 #ff0000 }
part b material source { circle 5 5 radius 1 #00ff00 }
part c material source { union a b }
export json
`.trim());

    expect(result.ok).toBe(true);
    const counts = coordsByPart(result);
    // Target parts still render standalone...
    expect(counts.a).toBe(5);
    expect(counts.b).toBe(5);
    // ...and the consuming part gets the real union of both shapes.
    expect(counts.c).toBe(10);
  });

  it('subtract removes a concentric sibling\'s footprint from the base', () => {
    const result = compileSCDL(`
asset subtract_probe canvas 8x8
part a material source { circle 4 4 radius 3 #ff0000 }
part b material source { circle 4 4 radius 1 #00ff00 }
part c material source { subtract a b }
export json
`.trim());

    expect(result.ok).toBe(true);
    const counts = coordsByPart(result);
    expect(counts.a).toBe(29); // radius-3 disc, untouched standalone
    expect(counts.b).toBe(5);  // radius-1 disc, untouched standalone
    expect(counts.c).toBe(24); // a minus the fully-contained b
  });

  it('intersect keeps only the overlap between base and sibling', () => {
    // This is the exact case that exposed a real bug mid-implementation:
    // routing the overlap test through geometry-amp.js's buildPartMask()
    // with one map SHARED across parts let the later-declared circle b
    // silently steal ownership of the overlapping region from a, leaving
    // intersect with zero cells. Each part now gets its own scoped map.
    const result = compileSCDL(`
asset intersect_probe canvas 8x8
part a material source { circle 4 4 radius 3 #ff0000 }
part b material source { circle 4 4 radius 1 #00ff00 }
part c material source { intersect a b }
export json
`.trim());

    expect(result.ok).toBe(true);
    const counts = coordsByPart(result);
    expect(counts.c).toBe(5); // b is fully inside a, so a ∩ b == b
  });

  it('rejects a boolean op that targets its own part (SCDL-026)', () => {
    const result = compileSCDL(`
asset selfref_probe canvas 8x8
part a material source {
  circle 2 2 radius 1 #ff0000
  union a b
}
part b material source { circle 5 5 radius 1 #00ff00 }
export json
`.trim());

    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.label === 'SCDL-026')).toBe(true);
  });

  it('rejects a boolean op that targets a part id that does not exist (SCDL-026)', () => {
    const result = compileSCDL(`
asset unknown_probe canvas 8x8
part a material source { circle 2 2 radius 1 #ff0000 }
part c material source { union a ghost }
export json
`.trim());

    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.label === 'SCDL-026')).toBe(true);
  });
});
