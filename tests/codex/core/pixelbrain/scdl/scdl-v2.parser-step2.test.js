import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { formatSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js';

describe('SCDL v2 parser Step 2 extensions', () => {
  it('parses primitive shapes and geometric expressions', () => {
    const source = `SCDL 2
ASSET primitives_test
CANVAS WIDTH 64 HEIGHT 64

SHAPE $l (LINE FROM (VEC2 (PX 0) (PX 0)) TO (VEC2 (PX 10) (PX 10)))
SHAPE $r (RECT CENTER (VEC2 (PX 32) (PX 32)) SIZE (VEC2 (PX 16) (PX 16)))
SHAPE $rr (ROUNDED_RECT ORIGIN (VEC2 (PX 4) (PX 4)) SIZE (VEC2 (PX 20) (PX 20)) CORNER_RADIUS (PX 2))
SHAPE $ring (RING CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8) THICKNESS (PX 2))
SHAPE $el (ELLIPSE CENTER (VEC2 (PX 32) (PX 32)) RADIUS_X (PX 12) RADIUS_Y (PX 6))
SHAPE $arc (ARC CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8) START (DEGREES 0) END (DEGREES 90))
SHAPE $sec (SECTOR CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8) START (TURNS 0) END (TURNS 0.25))
SHAPE $tri (TRIANGLE P1 (VEC2 (PX 0) (PX 0)) P2 (VEC2 (PX 10) (PX 0)) P3 (VEC2 (PX 5) (PX 10)))
SHAPE $poly (REGULAR_POLYGON SIDES 6 RADIUS (PX 10) CENTER (VEC2 (PX 32) (PX 32)))
SHAPE $star (STAR POINTS 5 INNER_RADIUS (PX 4) OUTER_RADIUS (PX 10) CENTER (VEC2 (PX 32) (PX 32)))
SHAPE $path (PATH DATA "M 0 0 L 10 10 Z")

LAYER main ORDER 10 {
  PAINT $l FILL #FFFFFF RASTER BRESENHAM
  PAINT $r FILL #FF0000 RASTER CENTER
}
`;
    const result = parseSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.ast.declarations.length).toBe(15);
  });

  it('parses transforms and angle expressions', () => {
    const source = `SCDL 2
ASSET transform_test
CANVAS WIDTH 32 HEIGHT 32

CONST $deg ANGLE (DEGREES 45)
CONST $rad ANGLE (RADIANS 1.57)
CONST $rot TRANSFORM (ROTATE ANGLE (DEGREES 90) PIVOT (VEC2 (PX 16) (PX 16)))
CONST $trans TRANSFORM (TRANSLATE OFFSET (VEC2 (PX 4) (PX -2)))
CONST $scale TRANSFORM (SCALE FACTOR 2 PIVOT (VEC2 (PX 16) (PX 16)))
CONST $comp TRANSFORM (TRANSFORM_COMPOSE $rot $trans)

SHAPE $orig (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 8) (PX 8)))
SHAPE $moved (TRANSFORM_APPLY $comp $orig)

LAYER main ORDER 0 {
  PAINT $moved FILL #00FFCC RASTER CENTER
}
`;
    const result = parseSCDLV2(source);
    expect(result.ok).toBe(true);
  });

  it('parses boolean CSG, masks, anchors, and assertions', () => {
    const source = `SCDL 2
ASSET csg_and_masks
CANVAS WIDTH 32 HEIGHT 32

SHAPE $a (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 10) (PX 10)))
SHAPE $b (CIRCLE CENTER (VEC2 (PX 10) (PX 10)) RADIUS (PX 6))
SHAPE $cut (SUBTRACT $a $b)
SHAPE $joined (UNION $a $b)
SHAPE $edge (OUTLINE $joined WIDTH (PX 1))

MASK $clip (TO_MASK $cut)
MASK $inverted (MASK_INVERT $clip)

ANCHOR $tip ON $cut AT TOP
ASSERT (CONTAINS $joined $cut)

LAYER bg ORDER 0 BLEND REPLACE OPACITY 1.0 {
  PAINT $joined AT (VEC2 (PX 2) (PX 2)) FILL #222222 RASTER CENTER
}

LAYER fg ORDER 10 BLEND OVER OPACITY 0.8 {
  PAINT $edge FILL #FFFFFF RASTER CENTER CLIP_TO $clip MATERIAL "crystal"
}
`;
    const result = parseSCDLV2(source);
    expect(result.ok).toBe(true);
  });

  it('canonical formatter preserves and formats Step 2 constructs idempotently', () => {
    const source = `SCDL 2
ASSET fmt_step2
CANVAS WIDTH 32 HEIGHT 32
BUDGET INSTRUCTIONS 1000 GENERATED_SHAPES 50 RASTER_CELLS 1024

SHAPE $box (RECT ORIGIN (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 10) (PX 10)))
MASK $m (TO_MASK $box)
ANCHOR $anc ON $box AT CENTER
ASSERT (INSIDE (VEC2 (PX 5) (PX 5)) $box)

LAYER main ORDER 10 BLEND OVER OPACITY 1.0 {
  PAINT $box AT (VEC2 (PX 0) (PX 0)) FILL #FF00FF RASTER CENTER CLIP_TO $m
}
`;
    const formatted1 = formatSCDLV2(source);
    expect(formatted1.ok).toBe(true);
    const formatted2 = formatSCDLV2(formatted1.output);
    expect(formatted2.ok).toBe(true);
    expect(formatted2.output).toBe(formatted1.output);
  });
});
