/**
 * Tutorial Forest — Original Player Character Model in SCDL V2
 *
 * "Lotus Thaumaturge Wanderer"
 *
 * Authored 100% in SCDL V2 according to the canon:
 * 1. Silhouette Readability: Distinct cowl, tunic flare, and gnarled staff with glowing lotus crystal.
 * 2. Anatomical Proportion: 4 heads tall on 32x48 canvas for crisp RPG gameplay scale.
 * 3. Clear Material Separation: Indigo cloth, leather belt/boots, skin, chestnut hair, gold circlet, wooden staff, glowing crystal.
 * 4. Directional Lighting: Upper-left highlight relief against deep shade.
 */

export const LOTUS_WANDERER_SCDL_V2 = `SCDL 2
ASSET lotus_wanderer
CANVAS WIDTH 32 HEIGHT 48
BUDGET INSTRUCTIONS 10000 GENERATED_SHAPES 200 RASTER_CELLS 8192 RECURSION_DEPTH 16

# --- Color Constants ---
CONST $shadow_ao COLOR #090B10
CONST $boot_dark COLOR #22150C
CONST $boot_mid COLOR #4A2E19
CONST $boot_hi COLOR #784A28
CONST $leg_dark COLOR #131722
CONST $leg_mid COLOR #1F273A
CONST $robe_dark COLOR #1E1B4B
CONST $robe_mid COLOR #312E81
CONST $robe_lit COLOR #4338CA
CONST $belt_gold COLOR #D97706
CONST $buckle_hi COLOR #FDE047
CONST $cowl_dark COLOR #064E3B
CONST $cowl_mid COLOR #047857
CONST $cowl_lit COLOR #10B981
CONST $skin_shadow COLOR #78350F
CONST $skin_mid COLOR #B45309
CONST $skin_lit COLOR #D97706
CONST $skin_hi COLOR #FBBF24
CONST $hair_dark COLOR #1C1008
CONST $hair_mid COLOR #38200F
CONST $hair_hi COLOR #5C381E
CONST $circlet_gold COLOR #FDE047
CONST $staff_wood COLOR #451A03
CONST $crystal_deep COLOR #047857
CONST $crystal_glow COLOR #10B981
CONST $crystal_hi COLOR #6EE7B7
CONST $crystal_spark COLOR #FFFFFF

# --- Ground Shadow ---
SHAPE $ground_shadow (ELLIPSE CENTER (VEC2 (PX 15) (PX 45)) RADIUS_X (PX 10) RADIUS_Y (PX 3))

# --- Boots & Legs ---
SHAPE $boot_left (RECT ORIGIN (VEC2 (PX 10) (PX 41)) SIZE (VEC2 (PX 4) (PX 6)))
SHAPE $boot_right (RECT ORIGIN (VEC2 (PX 16) (PX 41)) SIZE (VEC2 (PX 4) (PX 6)))
SHAPE $leg_left (RECT ORIGIN (VEC2 (PX 11) (PX 33)) SIZE (VEC2 (PX 4) (PX 9)))
SHAPE $leg_right (RECT ORIGIN (VEC2 (PX 16) (PX 33)) SIZE (VEC2 (PX 4) (PX 9)))

# --- Robe & Tunic ---
SHAPE $tunic_skirt (RECT ORIGIN (VEC2 (PX 9) (PX 27)) SIZE (VEC2 (PX 13) (PX 9)))
SHAPE $tunic_body (RECT ORIGIN (VEC2 (PX 10) (PX 19)) SIZE (VEC2 (PX 11) (PX 10)))
SHAPE $belt (RECT ORIGIN (VEC2 (PX 9) (PX 26)) SIZE (VEC2 (PX 13) (PX 3)))
SHAPE $buckle (RECT ORIGIN (VEC2 (PX 14) (PX 26)) SIZE (VEC2 (PX 3) (PX 3)))

# --- Cowl & Mantle ---
SHAPE $mantle_base (RECT ORIGIN (VEC2 (PX 8) (PX 16)) SIZE (VEC2 (PX 15) (PX 7)))
SHAPE $mantle_shoulders (ELLIPSE CENTER (VEC2 (PX 15) (PX 18)) RADIUS_X (PX 7) RADIUS_Y (PX 3))
SHAPE $cowl_fold (RECT ORIGIN (VEC2 (PX 12) (PX 17)) SIZE (VEC2 (PX 7) (PX 7)))

# --- Head & Face ---
SHAPE $face (ELLIPSE CENTER (VEC2 (PX 15) (PX 13)) RADIUS_X (PX 4) RADIUS_Y (PX 4))
SHAPE $eye_left (PIXEL AT (VEC2 (PX 13) (PX 13)))
SHAPE $eye_right (PIXEL AT (VEC2 (PX 16) (PX 13)))
SHAPE $hair_mass (ELLIPSE CENTER (VEC2 (PX 15) (PX 10)) RADIUS_X (PX 5) RADIUS_Y (PX 3))
SHAPE $hair_fringe (RECT ORIGIN (VEC2 (PX 10) (PX 8)) SIZE (VEC2 (PX 10) (PX 4)))
SHAPE $circlet (RECT ORIGIN (VEC2 (PX 11) (PX 10)) SIZE (VEC2 (PX 8) (PX 2)))

# --- Staff & Glowing Lotus Crystal ---
SHAPE $staff_shaft (RECT ORIGIN (VEC2 (PX 23) (PX 12)) SIZE (VEC2 (PX 2) (PX 34)))
SHAPE $hand_grip (RECT ORIGIN (VEC2 (PX 22) (PX 24)) SIZE (VEC2 (PX 3) (PX 3)))
SHAPE $crystal_calyx (RECT ORIGIN (VEC2 (PX 22) (PX 9)) SIZE (VEC2 (PX 4) (PX 4)))
SHAPE $crystal_gem (CIRCLE CENTER (VEC2 (PX 23) (PX 8)) RADIUS (PX 3))
SHAPE $crystal_core (PIXEL AT (VEC2 (PX 23) (PX 8)))

# --- Layer Compositing ---
LAYER shadow ORDER 5 {
  PAINT $ground_shadow FILL $shadow_ao RASTER MIDPOINT
}

LAYER legs ORDER 10 {
  PAINT $leg_left FILL $leg_mid RASTER MIDPOINT
  PAINT $leg_right FILL $leg_dark RASTER MIDPOINT
  PAINT $boot_left FILL $boot_hi RASTER MIDPOINT
  PAINT $boot_right FILL $boot_mid RASTER MIDPOINT
}

LAYER tunic ORDER 20 {
  PAINT $tunic_skirt FILL $robe_mid RASTER MIDPOINT
  PAINT $tunic_body FILL $robe_lit RASTER MIDPOINT
  PAINT $belt FILL $belt_gold RASTER MIDPOINT
  PAINT $buckle FILL $buckle_hi RASTER MIDPOINT
}

LAYER mantle ORDER 30 {
  PAINT $mantle_base FILL $cowl_dark RASTER MIDPOINT
  PAINT $mantle_shoulders FILL $cowl_mid RASTER MIDPOINT
  PAINT $cowl_fold FILL $cowl_lit RASTER MIDPOINT
}

LAYER head ORDER 40 {
  PAINT $face FILL $skin_mid RASTER MIDPOINT
  PAINT $eye_left FILL #1E1B4B RASTER CENTER
  PAINT $eye_right FILL #1E1B4B RASTER CENTER
  PAINT $hair_fringe FILL $hair_mid RASTER MIDPOINT
  PAINT $hair_mass FILL $hair_dark RASTER MIDPOINT
  PAINT $circlet FILL $circlet_gold RASTER MIDPOINT
}

LAYER staff ORDER 50 {
  PAINT $staff_shaft FILL $staff_wood RASTER MIDPOINT
  PAINT $hand_grip FILL $skin_mid RASTER MIDPOINT
  PAINT $crystal_calyx FILL $staff_wood RASTER MIDPOINT
  PAINT $crystal_gem FILL $crystal_glow RASTER MIDPOINT
  PAINT $crystal_core FILL $crystal_spark RASTER CENTER
}
`;
