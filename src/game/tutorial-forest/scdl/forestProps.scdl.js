/**
 * Tutorial Forest — SCDL V2 Environmental Props
 *
 * Authored in SCDL V2:
 * 1. Ancient Waymarker Shrine (Carved obelisk with glowing emerald lotus gem)
 * 2. Mossy Forest Boulder (Layered stone mass with clinging moss carpet)
 */

export const ANCIENT_WAYMARKER_SCDL_V2 = `SCDL 2
ASSET ancient_waymarker
CANVAS WIDTH 24 HEIGHT 48
BUDGET INSTRUCTIONS 8000 GENERATED_SHAPES 100 RASTER_CELLS 4096 RECURSION_DEPTH 16

# --- Colors ---
CONST $shadow COLOR #0A0D12
CONST $stone_base COLOR #292524
CONST $stone_dark COLOR #44403C
CONST $stone_mid COLOR #78716C
CONST $stone_lit COLOR #A8A29E
CONST $stone_hi COLOR #E7E5E4
CONST $gold_trim COLOR #D97706
CONST $gem_deep COLOR #064E3B
CONST $gem_glow COLOR #10B981
CONST $gem_hi COLOR #6EE7B7
CONST $gem_core COLOR #FFFFFF

# --- Ground Shadow ---
SHAPE $sh_ground (ELLIPSE CENTER (VEC2 (PX 12) (PX 44)) RADIUS_X (PX 9) RADIUS_Y (PX 3))

# --- Stone Plinth & Stele ---
SHAPE $plinth_base (RECT ORIGIN (VEC2 (PX 4) (PX 40)) SIZE (VEC2 (PX 16) (PX 4)))
SHAPE $plinth_tier (RECT ORIGIN (VEC2 (PX 6) (PX 37)) SIZE (VEC2 (PX 12) (PX 4)))
SHAPE $stele_body (RECT ORIGIN (VEC2 (PX 7) (PX 16)) SIZE (VEC2 (PX 10) (PX 22)))
SHAPE $stele_cap (TRIANGLE P1 (VEC2 (PX 7) (PX 16)) P2 (VEC2 (PX 17) (PX 16)) P3 (VEC2 (PX 12) (PX 10)))

# --- Carved Inlay & Emerald Lotus Focus ---
SHAPE $rune_line (RECT ORIGIN (VEC2 (PX 11) (PX 20)) SIZE (VEC2 (PX 2) (PX 14)))
SHAPE $rune_cross (RECT ORIGIN (VEC2 (PX 9) (PX 24)) SIZE (VEC2 (PX 6) (PX 2)))
SHAPE $lotus_calyx (RECT ORIGIN (VEC2 (PX 10) (PX 9)) SIZE (VEC2 (PX 4) (PX 3)))
SHAPE $gem_orb (CIRCLE CENTER (VEC2 (PX 12) (PX 7)) RADIUS (PX 3))
SHAPE $gem_spark (PIXEL AT (VEC2 (PX 12) (PX 7)))

LAYER shadow ORDER 5 {
  PAINT $sh_ground FILL $shadow RASTER MIDPOINT
}

LAYER plinth ORDER 10 {
  PAINT $plinth_base FILL $stone_base RASTER MIDPOINT
  PAINT $plinth_tier FILL $stone_dark RASTER MIDPOINT
}

LAYER stele ORDER 20 {
  PAINT $stele_body FILL $stone_mid RASTER MIDPOINT
  PAINT $stele_cap FILL $stone_lit RASTER MIDPOINT
}

LAYER inlay ORDER 30 {
  PAINT $rune_line FILL $gem_glow RASTER MIDPOINT
  PAINT $rune_cross FILL $gem_glow RASTER MIDPOINT
}

LAYER gem ORDER 40 {
  PAINT $lotus_calyx FILL $gold_trim RASTER MIDPOINT
  PAINT $gem_orb FILL $gem_hi RASTER MIDPOINT
  PAINT $gem_spark FILL $gem_core RASTER CENTER
}
`;

export const MOSSY_BOULDER_SCDL_V2 = `SCDL 2
ASSET mossy_boulder
CANVAS WIDTH 32 HEIGHT 24
BUDGET INSTRUCTIONS 5000 GENERATED_SHAPES 50 RASTER_CELLS 2048 RECURSION_DEPTH 16

CONST $shadow COLOR #0A0D12
CONST $stone_dark COLOR #1C1917
CONST $stone_mid COLOR #44403C
CONST $stone_lit COLOR #78716C
CONST $stone_hi COLOR #A8A29E
CONST $moss_dark COLOR #14532D
CONST $moss_mid COLOR #16A34A
CONST $moss_lit COLOR #86EFAC

SHAPE $sh_ground (ELLIPSE CENTER (VEC2 (PX 16) (PX 21)) RADIUS_X (PX 14) RADIUS_Y (PX 3))
SHAPE $boulder_body (ELLIPSE CENTER (VEC2 (PX 16) (PX 14)) RADIUS_X (PX 12) RADIUS_Y (PX 7))
SHAPE $boulder_crest (ELLIPSE CENTER (VEC2 (PX 14) (PX 11)) RADIUS_X (PX 8) RADIUS_Y (PX 4))
SHAPE $moss_cap (ELLIPSE CENTER (VEC2 (PX 13) (PX 9)) RADIUS_X (PX 6) RADIUS_Y (PX 3))

LAYER shadow ORDER 5 {
  PAINT $sh_ground FILL $shadow RASTER MIDPOINT
}

LAYER stone ORDER 10 {
  PAINT $boulder_body FILL $stone_mid RASTER MIDPOINT
  PAINT $boulder_crest FILL $stone_lit RASTER MIDPOINT
}

LAYER moss ORDER 20 {
  PAINT $moss_cap FILL $moss_mid RASTER MIDPOINT
}
`;
