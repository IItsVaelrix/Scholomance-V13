/**
 * Tile Forge — SCD128-Governed SCDL V2 Construction Generator & Compiler
 *
 * Enforces Scholomance Law:
 * "The lattice is the asset; SCDL, approved packets, bytecode, and schemas are truth.
 *  Never patch the render."
 *
 * SCD128 Dual-Witness Architecture:
 * - FORM64 governs the exact geometric SHAPE (topology primitive, projection, elevation, sockets).
 * - REALIZATION64 governs the exact STYLE (palette ramp, surface variation, material octave, light response).
 * - Generates authoritative declarative SCDL V2 source programs bound to the witness record.
 * - Compiles through compileSCDLV2, executing registered PB-AMP-ABI-v1 AMPs and producing
 *   verified discrete 1x cell packets.
 */

import { compileSCDLV2 } from '../scdl/v2/scdl-v2.compiler.js';
import {
  TILE_FORGE_BIOME_PALETTES,
  createTileForgeWitnessRecord,
} from './tile-forge.scd128.js';
import { TILE_FORGE_PALETTE_FAMILIES } from './tile-forge.palette-engine.js';

/**
 * Resolves a 10-color palette mapping for an SCDL asset program.
 */
export function resolveScdlPalette(biome = 'void_forest', paletteFamily = 'scholomance_sunlit_glade') {
  if (paletteFamily && TILE_FORGE_PALETTE_FAMILIES[paletteFamily]) {
    const fam = TILE_FORGE_PALETTE_FAMILIES[paletteFamily];
    const meadow = fam.roles?.meadow || [];
    const stone = fam.roles?.stone || [];
    const lotus = fam.roles?.lotus || [];
    const soil = fam.roles?.soil || [];
    return {
      c0: meadow[0] || soil[0] || '#090E07',
      c1: meadow[1] || soil[1] || '#15250D',
      c2: meadow[2] || '#26440F',
      c3: meadow[3] || '#3C6415',
      c4: meadow[4] || '#5B8C1D',
      c5: meadow[5] || '#87BA2A',
      c6: meadow[6] || '#B9E043',
      c7: meadow[7] || '#E8F596',
      cliff_hi: stone[6] || '#9CA3AF',
      cliff_mid: stone[4] || '#6B7280',
      cliff_dark: stone[1] || '#374151',
      crystal_glow: lotus[5] || '#22D3EE',
      flower_accent: lotus[6] || '#F472B6',
      soil_dark: soil[0] || '#2A1810',
      soil_mid: soil[1] || '#4A3020',
      soil_lit: soil[2] || '#654231',
      soil_hi: soil[3] || '#8F563B',
      soil_pebble: stone[3] || '#9CA3AF',
    };
  }

  const p = TILE_FORGE_BIOME_PALETTES[biome] || TILE_FORGE_BIOME_PALETTES.void_forest;
  const isIce = biome.includes('ice');
  const isCave = biome.includes('cave');
  const isVoid = biome.includes('void') && !isIce && !isCave;

  return {
    c0: p.c0,
    c1: p.c1,
    c2: p.c2,
    c3: p.c3,
    c4: p.c4,
    c5: p.c5,
    c6: p.c6,
    c7: p.c7,
    cliff_hi: p.cliff_hi,
    cliff_mid: p.cliff_mid,
    cliff_dark: p.cliff_dark,
    crystal_glow: p.crystal_glow,
    flower_accent: p.flower_accent,
    soil_dark: isIce ? '#031726' : (isCave ? '#020617' : (isVoid ? '#0F172A' : '#2A1810')),
    soil_mid: isIce ? '#082F49' : (isCave ? '#0F172A' : (isVoid ? '#1E1B4B' : '#4A3020')),
    soil_lit: isIce ? '#0C4A6E' : (isCave ? '#1E293B' : (isVoid ? '#2E1065' : '#654231')),
    soil_hi: isIce ? '#0369A1' : (isCave ? '#334155' : (isVoid ? '#4C1D95' : '#8F563B')),
    soil_pebble: isIce ? '#7DD3FC' : (isCave ? '#64748B' : (isVoid ? '#64748B' : '#9CA3AF')),
  };
}

/**
 * Calculates a dynamic, safe raster cell budget for an asset canvas.
 */
function calculateRasterBudget(width, height) {
  return Math.max(16384, Math.floor(width * height * 5));
}

/**
 * Derives a 4-bit socket bitmask from socket names (N=1, E=2, S=4, W=8).
 */
function deriveSocketMask(socketN, socketE, socketS, socketW) {
  let mask = 0;
  if (socketN && socketN !== 'socket_closed') mask |= 1;
  if (socketE && socketE !== 'socket_closed') mask |= 2;
  if (socketS && socketS !== 'socket_closed') mask |= 4;
  if (socketW && socketW !== 'socket_closed') mask |= 8;
  return mask || 15; // default all open
}

/**
 * Deterministic 32-bit PRNG for SCD128 cellular distribution.
 */
function createPrng(seed) {
  let s = (typeof seed === 'number' ? seed : 4242) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates authoritative SCDL V2 source for an isometric ground diamond tile,
 * governed strictly by SCD128 FORM64 (shape & topology) and REALIZATION64 (style & material).
 */
export function generateTileDiamondScdl({
  id = 'tile_diamond',
  width = 80,
  height = 40,
  hasGround = false,
  groundDepth = 16,
  biome = 'void_forest',
  seed = 4242,
  elevation = 0,
  hasFlowers = true,
  isRim = false,
  topology = null,
  paletteFamily = 'scholomance_sunlit_glade',
  socketN = 'socket_open',
  socketE = 'socket_open',
  socketS = 'socket_open',
  socketW = 'socket_open',
  scd128Record: inputRecord = null,
} = {}) {
  const effectiveGround = Boolean(hasGround || height > 40);
  const effectiveGroundDepth = effectiveGround ? (height > 40 ? height - 40 : (groundDepth || 16)) : 0;
  const topH = 40;
  const totalH = effectiveGround ? topH + effectiveGroundDepth : height;

  // 1. Formal SCD128 Dual-Witness Record (Governs Shape & Style)
  const scd128Record = inputRecord || createTileForgeWitnessRecord(
    {
      width,
      height: totalH,
      hasCliff: false,
      hasGround: effectiveGround,
      groundDepth: effectiveGroundDepth,
      elevation,
      terrainType: isRim ? `${biome}_rim` : (effectiveGround ? `${biome}_ground` : `${biome}_top`),
      isRim,
      topology: topology || (isRim ? 'rim_diamond_plane' : (effectiveGround ? 'crowned_ground_block' : 'crowned_meadow_dome')),
      socketN,
      socketE,
      socketS,
      socketW,
    },
    {
      biome,
      seed,
      cellCount: effectiveGround ? Math.floor(width * totalH * 0.55) : 1600,
      variation: biome === 'void_ice' ? 'prismatic_ice_facets' : biome === 'cave_chasm' ? 'chiseled_flagstone' : 'dofus_blade_clusters',
      ditherPolicy: 'bayer_2x2_ordered',
      material: biome === 'void_ice' ? 'prismatic_glaze' : biome === 'cave_chasm' ? 'chiseled_stone' : 'organic_lush_turf',
    }
  );

  // 2. Unpack FORM64 & REALIZATION64 slots
  const formSlots = Object.fromEntries(scd128Record.form.slots.map((s) => [s.slot, s]));
  const realSlots = Object.fromEntries(scd128Record.realization.slots.map((s) => [s.slot, s]));

  const effectiveSeed = realSlots.CELLULAR_SEED?.parameters?.seed ?? seed;
  const effectiveBiome = realSlots.BIOME_PALETTE?.canonicalCategory || biome;
  const effectiveTopology = formSlots.TOPOLOGY_PRIMITIVE?.canonicalCategory || (effectiveGround ? 'crowned_ground_block' : 'crowned_meadow_dome');
  const effectiveVariation = realSlots.SURFACE_VARIATION?.canonicalCategory || 'dofus_blade_clusters';
  const effectiveDither = realSlots.DITHER_POLICY?.canonicalCategory || 'bayer_2x2_ordered';

  const p = resolveScdlPalette(effectiveBiome, paletteFamily);
  const hw = Math.floor(width / 2);
  const hh = Math.floor(topH / 2);
  const cleanBiome = effectiveBiome.includes('ice') ? 'ice' : effectiveBiome.includes('cave') ? 'cave' : 'forest';
  const socketMask = deriveSocketMask(socketN, socketE, socketS, socketW);
  const budgetCells = calculateRasterBudget(width, totalH);
  const prng = createPrng(effectiveSeed);

  // Shoulder offset (raised toward upper-left directional sun)
  const ox = hw - 2;
  const oy = hh - 2;
  const srw = 26;
  const srh = 13;

  // Realization Blade Clumps (Dofus/Wakfu style: root shadow, side blades, tall center, lit tip)
  const bladeClumps = [];
  const clumpTargets = [
    { x: hw - 14, y: hh - 6 },
    { x: hw + 10, y: hh - 4 },
    { x: hw - 6, y: hh + 8 },
    { x: hw + 14, y: hh + 6 },
    { x: hw - 22, y: hh + 2 },
    { x: hw + 20, y: hh - 2 },
    { x: hw - 2, y: hh - 10 },
    { x: hw + 4, y: hh + 12 },
  ];

  for (let i = 0; i < clumpTargets.length; i += 1) {
    const t = clumpTargets[i];
    const jx = Math.round((prng() * 4) - 2);
    const jy = Math.round((prng() * 2) - 1);
    const bx = Math.max(8, Math.min(width - 8, t.x + jx));
    const by = Math.max(6, Math.min(topH - 6, t.y + jy));
    bladeClumps.push({ id: `clump_${i}`, bx, by });
  }

  // Dither Stipple Nodes (Bayer 2x2 / Checker stipples across contour boundaries)
  const ditherNodes = [
    // SE shadow boundary (c3 <-> c4)
    { id: 'dit_se1', x: hw + 12, y: hh + 10, color: '$c4' },
    { id: 'dit_se2', x: hw + 14, y: hh + 11, color: '$c3' },
    { id: 'dit_se3', x: hw + 18, y: hh + 8, color: '$c4' },
    { id: 'dit_se4', x: hw + 22, y: hh + 12, color: '$c3' },
    // Mid-slope shoulder boundary (c4 <-> c5)
    { id: 'dit_mid1', x: hw - 18, y: hh - 2, color: '$c5' },
    { id: 'dit_mid2', x: hw - 16, y: hh - 1, color: '$c4' },
    { id: 'dit_mid3', x: hw + 8, y: hh - 8, color: '$c5' },
    { id: 'dit_mid4', x: hw + 10, y: hh - 7, color: '$c4' },
    // Crown plateau boundary (c5 <-> c6)
    { id: 'dit_cr1', x: hw - 10, y: hh - 8, color: '$c6' },
    { id: 'dit_cr2', x: hw - 8, y: hh - 9, color: '$c5' },
    { id: 'dit_cr3', x: hw + 2, y: hh - 4, color: '$c6' },
    { id: 'dit_cr4', x: hw + 4, y: hh - 3, color: '$c5' },
  ];

  // Overhang Sod Fringe Teeth (South & West edges)
  const hasSodOverhang = socketS !== 'socket_closed' && socketW !== 'socket_closed';

  return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${totalH}
BUDGET INSTRUCTIONS 10000 GENERATED_SHAPES 200 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 16

# --- SCD128 DUAL-WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}
# FORM64 (Shape & Sockets): ${scd128Record.form.form64Hex}
# REALIZATION64 (Style & Material): ${scd128Record.realization.realization64Hex}
# TOPOLOGY: ${effectiveTopology} · VARIATION: ${effectiveVariation} · DITHER: ${effectiveDither} · SEED: ${effectiveSeed}

# --- REALIZATION64 Style Constants (Palette Ramp) ---
CONST $c0 COLOR ${p.c0}
CONST $c1 COLOR ${p.c1}
CONST $c2 COLOR ${p.c2}
CONST $c3 COLOR ${p.c3}
CONST $c4 COLOR ${p.c4}
CONST $c5 COLOR ${p.c5}
CONST $c6 COLOR ${p.c6}
CONST $c7 COLOR ${p.c7}
CONST $glow COLOR ${p.crystal_glow}
CONST $flower COLOR ${p.flower_accent}
${effectiveGround ? `CONST $soil_dark COLOR ${p.soil_dark}
CONST $soil_mid COLOR ${p.soil_mid}
CONST $soil_lit COLOR ${p.soil_lit}
CONST $soil_hi COLOR ${p.soil_hi}
CONST $soil_pebble COLOR ${p.soil_pebble}
CONST $bedrock COLOR ${p.c0}` : ''}

# --- FORM64 & REALIZATION64 Active Anchor Micro-Passes (AMPs) ---
APPLY_AMP $geo ANY {
  AMP pixelbrain.iso-tile-geometry
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM tileWidth ${width}
  PARAM tileHeight ${topH}
}

APPLY_AMP $mat ANY {
  AMP pixelbrain.biome-material
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM biome ${cleanBiome}
}

APPLY_AMP $grass ANY {
  AMP pixelbrain.grass
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM bladeDensity ${hasFlowers ? 0.65 : 0.45}
}
${effectiveGround ? `
APPLY_AMP $soil ANY {
  AMP pixelbrain.soil
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM depth ${effectiveGroundDepth}
  PARAM soilType loam
  PARAM pebbleDensity 0.3
  PARAM rootDensity 0.25
}` : ''}

APPLY_AMP $sock ANY {
  AMP pixelbrain.tile-socket
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM socketMask ${socketMask}
}

# --- FORM64 Physical Shape: Base 2:1 Dimetric Quadrants ---
SHAPE $facet_nw (TRIANGLE P1 (VEC2 (PX 0) (PX ${hh})) P2 (VEC2 (PX ${hw}) (PX 0)) P3 (VEC2 (PX ${hw}) (PX ${hh})))
SHAPE $facet_ne (TRIANGLE P1 (VEC2 (PX ${hw}) (PX 0)) P2 (VEC2 (PX ${width}) (PX ${hh})) P3 (VEC2 (PX ${hw}) (PX ${hh})))
SHAPE $facet_sw (TRIANGLE P1 (VEC2 (PX 0) (PX ${hh})) P2 (VEC2 (PX ${hw}) (PX ${hh})) P3 (VEC2 (PX ${hw}) (PX ${topH})))
SHAPE $facet_se (TRIANGLE P1 (VEC2 (PX ${hw}) (PX ${hh})) P2 (VEC2 (PX ${width}) (PX ${hh})) P3 (VEC2 (PX ${hw}) (PX ${topH})))

# --- FORM64 Volumetric Dome: Mid-Elevation Shoulder Diamond ---
SHAPE $shoulder_nw (TRIANGLE P1 (VEC2 (PX ${ox - srw}) (PX ${oy})) P2 (VEC2 (PX ${ox}) (PX ${oy - srh})) P3 (VEC2 (PX ${ox}) (PX ${oy})))
SHAPE $shoulder_ne (TRIANGLE P1 (VEC2 (PX ${ox}) (PX ${oy - srh})) P2 (VEC2 (PX ${ox + srw}) (PX ${oy})) P3 (VEC2 (PX ${ox}) (PX ${oy})))
SHAPE $shoulder_sw (TRIANGLE P1 (VEC2 (PX ${ox - srw}) (PX ${oy})) P2 (VEC2 (PX ${ox}) (PX ${oy})) P3 (VEC2 (PX ${ox}) (PX ${oy + srh})))
SHAPE $shoulder_se (TRIANGLE P1 (VEC2 (PX ${ox}) (PX ${oy})) P2 (VEC2 (PX ${ox + srw}) (PX ${oy})) P3 (VEC2 (PX ${ox}) (PX ${oy + srh})))

# --- FORM64 High Crown Plateau & Crest Highlight ---
SHAPE $crown_plateau (ELLIPSE CENTER (VEC2 (PX ${hw - 4}) (PX ${hh - 3})) RADIUS_X (PX 15) RADIUS_Y (PX 7))
SHAPE $crest_high (ELLIPSE CENTER (VEC2 (PX ${hw - 7}) (PX ${hh - 5})) RADIUS_X (PX 8) RADIUS_Y (PX 4))
SHAPE $spec_crest (PIXEL AT (VEC2 (PX ${hw - 10}) (PX ${hh - 6})))

# --- FORM64 Socket Overhang Sod Teeth (South & West Perimeter) ---
${hasSodOverhang ? `SHAPE $tooth_sw1 (TRIANGLE P1 (VEC2 (PX 10) (PX 25)) P2 (VEC2 (PX 14) (PX 27)) P3 (VEC2 (PX 12) (PX 29)))
SHAPE $tooth_sw2 (TRIANGLE P1 (VEC2 (PX 22) (PX 31)) P2 (VEC2 (PX 26) (PX 33)) P3 (VEC2 (PX 24) (PX 35)))
SHAPE $tooth_sw3 (TRIANGLE P1 (VEC2 (PX 32) (PX 36)) P2 (VEC2 (PX 36) (PX 38)) P3 (VEC2 (PX 34) (PX 40)))
SHAPE $tooth_se1 (TRIANGLE P1 (VEC2 (PX 44) (PX 38)) P2 (VEC2 (PX 48) (PX 36)) P3 (VEC2 (PX 46) (PX 40)))
SHAPE $tooth_se2 (TRIANGLE P1 (VEC2 (PX 54) (PX 33)) P2 (VEC2 (PX 58) (PX 31)) P3 (VEC2 (PX 56) (PX 35)))
SHAPE $tooth_se3 (TRIANGLE P1 (VEC2 (PX 66) (PX 27)) P2 (VEC2 (PX 70) (PX 25)) P3 (VEC2 (PX 68) (PX 29)))` : ''}

# --- FORM64 Socket Crest Bevel Lines (North & West Crests) ---
SHAPE $rim_line_nw (LINE FROM (VEC2 (PX 0) (PX ${hh})) TO (VEC2 (PX ${hw}) (PX 0)))
SHAPE $rim_line_ne (LINE FROM (VEC2 (PX ${hw}) (PX 0)) TO (VEC2 (PX ${width}) (PX ${hh})))
${isRim ? `SHAPE $rim_line_sw (LINE FROM (VEC2 (PX 0) (PX ${hh})) TO (VEC2 (PX ${hw}) (PX ${topH})))
SHAPE $rim_line_se (LINE FROM (VEC2 (PX ${hw}) (PX ${topH})) TO (VEC2 (PX ${width}) (PX ${hh})))` : ''}

# --- REALIZATION64 Dither Stipple Nodes ---
${ditherNodes.map((n) => `SHAPE $${n.id} (PIXEL AT (VEC2 (PX ${n.x}) (PX ${n.y})))`).join('\n')}

# --- REALIZATION64 Stylized Blade Clumps (Dofus/Wakfu Art Architecture) ---
${bladeClumps.map((c) => `SHAPE $${c.id}_root (PIXEL AT (VEC2 (PX ${c.bx}) (PX ${c.by})))
SHAPE $${c.id}_lb (PIXEL AT (VEC2 (PX ${c.bx - 1}) (PX ${c.by - 1})))
SHAPE $${c.id}_cb (PIXEL AT (VEC2 (PX ${c.bx}) (PX ${c.by - 2})))
SHAPE $${c.id}_tip (PIXEL AT (VEC2 (PX ${c.bx}) (PX ${c.by - 3})))
SHAPE $${c.id}_rb (PIXEL AT (VEC2 (PX ${c.bx + 1}) (PX ${c.by - 1})))`).join('\n')}

# --- REALIZATION64 Floral & Biome Accent Nodes ---
${hasFlowers ? `SHAPE $fl_node1_p1 (PIXEL AT (VEC2 (PX ${hw + 6}) (PX ${hh + 3})))
SHAPE $fl_node1_p2 (PIXEL AT (VEC2 (PX ${hw + 8}) (PX ${hh + 3})))
SHAPE $fl_node1_core (PIXEL AT (VEC2 (PX ${hw + 7}) (PX ${hh + 2})))
SHAPE $fl_node1_sh (PIXEL AT (VEC2 (PX ${hw + 7}) (PX ${hh + 4})))

SHAPE $fl_node2_p1 (PIXEL AT (VEC2 (PX ${hw - 14}) (PX ${hh + 4})))
SHAPE $fl_node2_p2 (PIXEL AT (VEC2 (PX ${hw - 12}) (PX ${hh + 4})))
SHAPE $fl_node2_core (PIXEL AT (VEC2 (PX ${hw - 13}) (PX ${hh + 3})))
SHAPE $fl_node2_sh (PIXEL AT (VEC2 (PX ${hw - 13}) (PX ${hh + 5})))

SHAPE $spore_glow1 (PIXEL AT (VEC2 (PX ${hw + 16}) (PX ${hh - 4})))
SHAPE $spore_glow2 (PIXEL AT (VEC2 (PX ${hw - 18}) (PX ${hh - 4})))` : ''}

${effectiveGround ? `# --- FORM64 Subterranean Soil / Ground Flanks ---
SHAPE $soil_sw1 (TRIANGLE P1 (VEC2 (PX 0) (PX ${hh})) P2 (VEC2 (PX ${hw}) (PX ${topH})) P3 (VEC2 (PX 0) (PX ${hh + effectiveGroundDepth})))
SHAPE $soil_sw2 (TRIANGLE P1 (VEC2 (PX ${hw}) (PX ${topH})) P2 (VEC2 (PX ${hw}) (PX ${topH + effectiveGroundDepth})) P3 (VEC2 (PX 0) (PX ${hh + effectiveGroundDepth})))
SHAPE $soil_se1 (TRIANGLE P1 (VEC2 (PX ${hw}) (PX ${topH})) P2 (VEC2 (PX ${width}) (PX ${hh})) P3 (VEC2 (PX ${hw}) (PX ${topH + effectiveGroundDepth})))
SHAPE $soil_se2 (TRIANGLE P1 (VEC2 (PX ${width}) (PX ${hh})) P2 (VEC2 (PX ${width}) (PX ${hh + effectiveGroundDepth})) P3 (VEC2 (PX ${hw}) (PX ${topH + effectiveGroundDepth})))

SHAPE $soil_prow (LINE FROM (VEC2 (PX ${hw}) (PX ${topH})) TO (VEC2 (PX ${hw}) (PX ${topH + effectiveGroundDepth})))
SHAPE $soil_strata_sw1 (LINE FROM (VEC2 (PX 4) (PX ${hh + 4})) TO (VEC2 (PX ${hw - 4}) (PX ${topH + 4})))
SHAPE $soil_strata_sw2 (LINE FROM (VEC2 (PX 8) (PX ${hh + 9})) TO (VEC2 (PX ${hw - 8}) (PX ${topH + 9})))
SHAPE $soil_strata_se1 (LINE FROM (VEC2 (PX ${hw + 4}) (PX ${topH + 4})) TO (VEC2 (PX ${width - 4}) (PX ${hh + 4})))

SHAPE $pebble_sw1 (PIXEL AT (VEC2 (PX ${hw - 18}) (PX ${hh + 8})))
SHAPE $pebble_sw2 (PIXEL AT (VEC2 (PX ${hw - 8}) (PX ${hh + 14})))
SHAPE $pebble_se1 (PIXEL AT (VEC2 (PX ${hw + 14}) (PX ${hh + 12})))

SHAPE $root_sw1 (LINE FROM (VEC2 (PX 12) (PX ${hh + 4})) TO (VEC2 (PX 14) (PX ${hh + 10})))
SHAPE $root_se1 (LINE FROM (VEC2 (PX ${width - 16}) (PX ${hh + 3})) TO (VEC2 (PX ${width - 14}) (PX ${hh + 8})))

SHAPE $bedrock_floor_sw (LINE FROM (VEC2 (PX 0) (PX ${hh + effectiveGroundDepth})) TO (VEC2 (PX ${hw}) (PX ${topH + effectiveGroundDepth})))
SHAPE $bedrock_floor_se (LINE FROM (VEC2 (PX ${hw}) (PX ${topH + effectiveGroundDepth})) TO (VEC2 (PX ${width}) (PX ${hh + effectiveGroundDepth})))` : ''}

${effectiveGround ? `# --- LAYER 0: ground_soil (ORDER 8) ---
LAYER ground_soil ORDER 8 {
  PAINT $soil_sw1 FILL $soil_mid RASTER MIDPOINT
  PAINT $soil_sw2 FILL $soil_mid RASTER MIDPOINT
  PAINT $soil_se1 FILL $soil_dark RASTER MIDPOINT
  PAINT $soil_se2 FILL $c0 RASTER MIDPOINT
  PAINT $soil_prow FILL $soil_lit RASTER CENTER
  PAINT $soil_strata_sw1 FILL $soil_lit RASTER CENTER
  PAINT $soil_strata_sw2 FILL $soil_dark RASTER CENTER
  PAINT $soil_strata_se1 FILL $soil_dark RASTER CENTER
  PAINT $pebble_sw1 FILL $soil_pebble RASTER CENTER
  PAINT $pebble_sw2 FILL $soil_pebble RASTER CENTER
  PAINT $pebble_se1 FILL $soil_pebble RASTER CENTER
  PAINT $root_sw1 FILL $soil_dark RASTER CENTER
  PAINT $root_se1 FILL $c0 RASTER CENTER
  PAINT $bedrock_floor_sw FILL $bedrock RASTER CENTER
  PAINT $bedrock_floor_se FILL $bedrock RASTER CENTER
}
` : ''}
# --- LAYER 1: ground_base (ORDER 10) ---
LAYER ground_base ORDER 10 {
  PAINT $facet_nw FILL $c5 RASTER MIDPOINT
  PAINT $facet_ne FILL $c4 RASTER MIDPOINT
  PAINT $facet_sw FILL $c4 RASTER MIDPOINT
  PAINT $facet_se FILL $c3 RASTER MIDPOINT
}

# --- LAYER 2: ground_shoulder (ORDER 15) ---
LAYER ground_shoulder ORDER 15 {
  PAINT $shoulder_nw FILL $c6 RASTER MIDPOINT
  PAINT $shoulder_ne FILL $c5 RASTER MIDPOINT
  PAINT $shoulder_sw FILL $c5 RASTER MIDPOINT
  PAINT $shoulder_se FILL $c4 RASTER MIDPOINT
}

# --- LAYER 3: ground_crown (ORDER 20) ---
LAYER ground_crown ORDER 20 {
  PAINT $crown_plateau FILL $c6 RASTER MIDPOINT
  PAINT $crest_high FILL $c7 RASTER MIDPOINT
  PAINT $spec_crest FILL $c7 RASTER CENTER
}

# --- LAYER 4: ground_dither (ORDER 25) ---
LAYER ground_dither ORDER 25 {
${ditherNodes.map((n) => `  PAINT $${n.id} FILL ${n.color} RASTER CENTER`).join('\n')}
}

# --- LAYER 5: ground_surface_clusters (ORDER 30) ---
LAYER ground_surface_clusters ORDER 30 {
${hasSodOverhang ? `  PAINT $tooth_sw1 FILL $c4 RASTER MIDPOINT
  PAINT $tooth_sw2 FILL $c4 RASTER MIDPOINT
  PAINT $tooth_sw3 FILL $c4 RASTER MIDPOINT
  PAINT $tooth_se1 FILL $c3 RASTER MIDPOINT
  PAINT $tooth_se2 FILL $c3 RASTER MIDPOINT
  PAINT $tooth_se3 FILL $c3 RASTER MIDPOINT` : ''}
${bladeClumps.map((c) => `  PAINT $${c.id}_root FILL $c2 RASTER CENTER
  PAINT $${c.id}_lb FILL $c5 RASTER CENTER
  PAINT $${c.id}_cb FILL $c6 RASTER CENTER
  PAINT $${c.id}_tip FILL $c7 RASTER CENTER
  PAINT $${c.id}_rb FILL $c5 RASTER CENTER`).join('\n')}
${hasFlowers ? `  PAINT $fl_node1_sh FILL $c1 RASTER CENTER
  PAINT $fl_node1_p1 FILL $flower RASTER CENTER
  PAINT $fl_node1_p2 FILL $flower RASTER CENTER
  PAINT $fl_node1_core FILL $c7 RASTER CENTER
  PAINT $fl_node2_sh FILL $c1 RASTER CENTER
  PAINT $fl_node2_p1 FILL $flower RASTER CENTER
  PAINT $fl_node2_p2 FILL $flower RASTER CENTER
  PAINT $fl_node2_core FILL $glow RASTER CENTER
  PAINT $spore_glow1 FILL $glow RASTER CENTER
  PAINT $spore_glow2 FILL $glow RASTER CENTER` : ''}
}

# --- LAYER 6: ground_highlights (ORDER 35) ---
LAYER ground_highlights ORDER 35 {
  PAINT $rim_line_nw FILL $c7 RASTER CENTER
  PAINT $rim_line_ne FILL $c6 RASTER CENTER
${isRim ? `  PAINT $rim_line_sw FILL $glow RASTER CENTER
  PAINT $rim_line_se FILL $glow RASTER CENTER` : ''}
}
`;
}

/**
 * Generates authoritative SCDL V2 source for a full isometric ground block tile with subterranean soil.
 */
export function generateTileGroundScdl({
  id = 'tile_ground',
  width = 80,
  height = 56,
  groundDepth = 16,
  biome = 'void_forest',
  seed = 4242,
  elevation = 0,
  hasFlowers = true,
  isRim = false,
  topology = null,
  paletteFamily = 'scholomance_sunlit_glade',
  socketN = 'socket_open',
  socketE = 'socket_open',
  socketS = 'socket_open',
  socketW = 'socket_open',
  scd128Record: inputRecord = null,
} = {}) {
  return generateTileDiamondScdl({
    id,
    width,
    height,
    hasGround: true,
    groundDepth,
    biome,
    seed,
    elevation,
    hasFlowers,
    isRim,
    topology: topology || 'crowned_ground_block',
    paletteFamily,
    socketN,
    socketE,
    socketS,
    socketW,
    scd128Record: inputRecord,
  });
}

/**
 * Generates authoritative SCDL V2 source for an extruded cliff skirt tile,
 * governed strictly by SCD128 FORM64 (shape, lift, & buttresses) and REALIZATION64 (strata style & crystal veins).
 */
export function generateCliffSkirtScdl({
  id = 'tile_cliff',
  width = 80,
  height = 56,
  cliffDepth = 16,
  biome = 'void_forest',
  seed = 4242,
  elevation = 1,
  paletteFamily = 'scholomance_sunlit_glade',
  socketN = 'socket_open',
  socketE = 'socket_open',
  socketS = 'socket_open',
  socketW = 'socket_open',
  scd128Record: inputRecord = null,
} = {}) {
  // 1. Formal SCD128 Dual-Witness Record (Governs Shape & Strata)
  const scd128Record = inputRecord || createTileForgeWitnessRecord(
    {
      width,
      height,
      hasCliff: true,
      cliffDepth,
      elevation,
      terrainType: `${biome}_cliff`,
      topology: 'extruded_cliff_skirt',
      socketN,
      socketE,
      socketS,
      socketW,
    },
    {
      biome,
      seed,
      cellCount: Math.floor(width * height * 0.52),
      stratification: biome === 'void_ice' ? 'crystalline_shear' : 'columnar_basalt',
      material: biome === 'void_ice' ? 'prismatic_glaze' : 'columnar_rock',
    }
  );

  const p = resolveScdlPalette(biome, paletteFamily);
  const hw = Math.floor(width / 2);
  const topH = 40;
  const cleanBiome = biome.includes('ice') ? 'ice' : biome.includes('cave') ? 'cave' : 'forest';
  const socketMask = deriveSocketMask(socketN, socketE, socketS, socketW);
  const budgetCells = calculateRasterBudget(width, height);

  return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${height}
BUDGET INSTRUCTIONS 10000 GENERATED_SHAPES 200 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 16

# --- SCD128 DUAL-WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}
# FORM64 (Shape & Lift): ${scd128Record.form.form64Hex}
# REALIZATION64 (Style & Strata): ${scd128Record.realization.realization64Hex}
# TOPOLOGY: extruded_cliff_skirt · STRATIFICATION: ${scd128Record.realization.slots[5]?.canonicalCategory || 'columnar_basalt'}

# --- Palette & Strata Constants ---
CONST $c0 COLOR ${p.c0}
CONST $c1 COLOR ${p.c1}
CONST $c2 COLOR ${p.c2}
CONST $c3 COLOR ${p.c3}
CONST $c4 COLOR ${p.c4}
CONST $c5 COLOR ${p.c5}
CONST $c6 COLOR ${p.c6}
CONST $c7 COLOR ${p.c7}
CONST $cliff_hi COLOR ${p.cliff_hi}
CONST $cliff_mid COLOR ${p.cliff_mid}
CONST $cliff_dark COLOR ${p.cliff_dark}
CONST $glow COLOR ${p.crystal_glow}

# --- Active Anchor Micro-Passes (AMPs) ---
APPLY_AMP $geo ANY {
  AMP pixelbrain.iso-tile-geometry
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM tileWidth ${width}
  PARAM tileHeight ${topH}
}

APPLY_AMP $mat ANY {
  AMP pixelbrain.biome-material
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM biome ${cleanBiome}
}

APPLY_AMP $vol ANY {
  AMP pixelbrain.volume-lift
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM liftHeight ${Math.min(32, cliffDepth)}
}

APPLY_AMP $sock ANY {
  AMP pixelbrain.tile-socket
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM socketMask ${socketMask}
}

# --- FORM64 Top Dimetric Ground Plane ---
SHAPE $top_nw (TRIANGLE P1 (VEC2 (PX 0) (PX 20)) P2 (VEC2 (PX ${hw}) (PX 0)) P3 (VEC2 (PX ${hw}) (PX 20)))
SHAPE $top_ne (TRIANGLE P1 (VEC2 (PX ${hw}) (PX 0)) P2 (VEC2 (PX ${width}) (PX 20)) P3 (VEC2 (PX ${hw}) (PX 20)))
SHAPE $top_sw (TRIANGLE P1 (VEC2 (PX 0) (PX 20)) P2 (VEC2 (PX ${hw}) (PX 20)) P3 (VEC2 (PX ${hw}) (PX 40)))
SHAPE $top_se (TRIANGLE P1 (VEC2 (PX ${hw}) (PX 20)) P2 (VEC2 (PX ${width}) (PX 20)) P3 (VEC2 (PX ${hw}) (PX 40)))

# --- FORM64 Top Dome & Shoulder Relief ---
SHAPE $top_shoulder (ELLIPSE CENTER (VEC2 (PX ${hw - 2}) (PX 18)) RADIUS_X (PX 22) RADIUS_Y (PX 11))
SHAPE $top_crown (ELLIPSE CENTER (VEC2 (PX ${hw - 4}) (PX 16)) RADIUS_X (PX 12) RADIUS_Y (PX 6))

# --- FORM64 Overhanging Sod Fringe on Cliff Top Rim ---
SHAPE $sod_rim_1 (TRIANGLE P1 (VEC2 (PX 8) (PX 23)) P2 (VEC2 (PX 14) (PX 26)) P3 (VEC2 (PX 11) (PX 28)))
SHAPE $sod_rim_2 (TRIANGLE P1 (VEC2 (PX 20) (PX 29)) P2 (VEC2 (PX 26) (PX 32)) P3 (VEC2 (PX 23) (PX 34)))
SHAPE $sod_rim_3 (TRIANGLE P1 (VEC2 (PX 32) (PX 35)) P2 (VEC2 (PX 38) (PX 38)) P3 (VEC2 (PX 35) (PX 41)))

# --- FORM64 Left Cliff Face (Lit Flank: Columnar Buttresses & Panels) ---
SHAPE $cliff_left_col1 (TRIANGLE P1 (VEC2 (PX 0) (PX 20)) P2 (VEC2 (PX 18) (PX 29)) P3 (VEC2 (PX 0) (PX ${20 + cliffDepth})))
SHAPE $cliff_left_col1_b (TRIANGLE P1 (VEC2 (PX 18) (PX 29)) P2 (VEC2 (PX 18) (PX ${29 + cliffDepth})) P3 (VEC2 (PX 0) (PX ${20 + cliffDepth})))
SHAPE $cliff_left_col2 (TRIANGLE P1 (VEC2 (PX 18) (PX 29)) P2 (VEC2 (PX ${hw}) (PX 40)) P3 (VEC2 (PX 18) (PX ${29 + cliffDepth})))
SHAPE $cliff_left_col2_b (TRIANGLE P1 (VEC2 (PX ${hw}) (PX 40)) P2 (VEC2 (PX ${hw}) (PX ${40 + cliffDepth})) P3 (VEC2 (PX 18) (PX ${29 + cliffDepth})))

# --- FORM64 Right Cliff Face (Shadowed Flank) ---
SHAPE $cliff_right_t1 (TRIANGLE P1 (VEC2 (PX ${hw}) (PX 40)) P2 (VEC2 (PX ${width}) (PX 20)) P3 (VEC2 (PX ${hw}) (PX ${40 + cliffDepth})))
SHAPE $cliff_right_t2 (TRIANGLE P1 (VEC2 (PX ${width}) (PX 20)) P2 (VEC2 (PX ${width}) (PX ${20 + cliffDepth})) P3 (VEC2 (PX ${hw}) (PX ${40 + cliffDepth})))

# --- REALIZATION64 Rock Strata Ledges & Columnar Fissures ---
SHAPE $strata_shelf_1 (LINE FROM (VEC2 (PX 4) (PX 26)) TO (VEC2 (PX 36) (PX 42)))
SHAPE $strata_shelf_2 (LINE FROM (VEC2 (PX 8) (PX 32)) TO (VEC2 (PX 38) (PX 47)))
SHAPE $joint_fissure_left (LINE FROM (VEC2 (PX 18) (PX 29)) TO (VEC2 (PX 18) (PX ${29 + cliffDepth})))
SHAPE $joint_fissure_right (LINE FROM (VEC2 (PX 58) (PX 31)) TO (VEC2 (PX 58) (PX ${31 + cliffDepth})))

# --- REALIZATION64 Prow Ridge Spine & Crystal Vein ---
SHAPE $prow_ridge (LINE FROM (VEC2 (PX ${hw}) (PX 40)) TO (VEC2 (PX ${hw}) (PX ${40 + cliffDepth})))
SHAPE $crystal_vein (LINE FROM (VEC2 (PX 24) (PX 34)) TO (VEC2 (PX 28) (PX 48)))

# --- FORM64 Bedrock Occlusion Floor ---
SHAPE $bedrock_floor (LINE FROM (VEC2 (PX 0) (PX ${20 + cliffDepth})) TO (VEC2 (PX ${hw}) (PX ${40 + cliffDepth})))

LAYER ground_top ORDER 10 {
  PAINT $top_nw FILL $c5 RASTER MIDPOINT
  PAINT $top_ne FILL $c4 RASTER MIDPOINT
  PAINT $top_sw FILL $c4 RASTER MIDPOINT
  PAINT $top_se FILL $c3 RASTER MIDPOINT
  PAINT $top_shoulder FILL $c5 RASTER MIDPOINT
  PAINT $top_crown FILL $c6 RASTER MIDPOINT
}

LAYER cliff_walls ORDER 20 {
  PAINT $cliff_left_col1 FILL $cliff_mid RASTER MIDPOINT
  PAINT $cliff_left_col1_b FILL $cliff_mid RASTER MIDPOINT
  PAINT $cliff_left_col2 FILL $cliff_hi RASTER MIDPOINT
  PAINT $cliff_left_col2_b FILL $cliff_hi RASTER MIDPOINT
  PAINT $cliff_right_t1 FILL $cliff_dark RASTER MIDPOINT
  PAINT $cliff_right_t2 FILL $c0 RASTER MIDPOINT
}

LAYER cliff_strata_details ORDER 30 {
  PAINT $strata_shelf_1 FILL $cliff_hi RASTER CENTER
  PAINT $strata_shelf_2 FILL $cliff_hi RASTER CENTER
  PAINT $joint_fissure_left FILL $cliff_dark RASTER CENTER
  PAINT $joint_fissure_right FILL $c0 RASTER CENTER
  PAINT $prow_ridge FILL $cliff_hi RASTER CENTER
  PAINT $crystal_vein FILL $glow RASTER CENTER
  PAINT $bedrock_floor FILL $c0 RASTER CENTER
  PAINT $sod_rim_1 FILL $c4 RASTER MIDPOINT
  PAINT $sod_rim_2 FILL $c4 RASTER MIDPOINT
  PAINT $sod_rim_3 FILL $c4 RASTER MIDPOINT
}
`;
}

/**
 * Generates authoritative SCDL V2 source for a botanical tree actor,
 * governed by SCD128 FORM64 (volume bounds) and REALIZATION64 (canopy style).
 */
export function generateTreeScdl({
  id = 'botanical_tree',
  assetClass = 'botanical_oak',
  width = 64,
  height = 80,
  biome = 'void_forest',
  seed = 4242,
  paletteFamily = 'scholomance_sunlit_glade',
  scd128Record: inputRecord = null,
} = {}) {
  const scd128Record = inputRecord || createTileForgeWitnessRecord(
    {
      width,
      height,
      hasCliff: false,
      terrainType: `prop_${assetClass}`,
    },
    {
      biome,
      seed,
      cellCount: Math.floor(width * height * 0.45),
    }
  );

  const p = resolveScdlPalette(biome, paletteFamily);
  const cx = Math.floor(width / 2);
  const gy = height - 4;
  const isPine = assetClass.includes('pine');
  const isCrystal = assetClass.includes('crystal') || biome.includes('forest');
  const budgetCells = calculateRasterBudget(width, height);

  if (isCrystal && !isPine) {
    // Crystalline Spire Tree
    return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${height}
BUDGET INSTRUCTIONS 20000 GENERATED_SHAPES 500 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 32

# --- SCD128 WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}
# FORM64: ${scd128Record.form.form64Hex}
# REALIZATION64: ${scd128Record.realization.realization64Hex}

CONST $glow_col COLOR ${p.crystal_glow}
CONST $trunk_col COLOR #1E1B4B
CONST $crystal_hi COLOR #E9D5FF
CONST $crystal_mid COLOR ${p.c5}
CONST $crystal_dark COLOR ${p.c3}

APPLY_AMP $geo ANY {
  AMP pixelbrain.volume-lift
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM liftHeight ${Math.min(32, height)}
}
APPLY_AMP $mat ANY {
  AMP pixelbrain.biome-material
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM biome forest
}

SHAPE $trunk_shape (RECT ORIGIN (VEC2 (PX ${cx - 2}) (PX 16)) SIZE (VEC2 (PX 4) (PX ${gy - 16})))
SHAPE $spire_core (RECT ORIGIN (VEC2 (PX ${cx - 1}) (PX 16)) SIZE (VEC2 (PX 2) (PX ${gy - 18})))
SHAPE $rhombus_top (ELLIPSE CENTER (VEC2 (PX ${cx}) (PX 18)) RADIUS_X (PX 10) RADIUS_Y (PX 10))
SHAPE $rhombus_mid (ELLIPSE CENTER (VEC2 (PX ${cx}) (PX 30)) RADIUS_X (PX 14) RADIUS_Y (PX 14))
SHAPE $rhombus_lit (ELLIPSE CENTER (VEC2 (PX ${cx - 3}) (PX 28)) RADIUS_X (PX 8) RADIUS_Y (PX 8))
SHAPE $crystal_spec (PIXEL AT (VEC2 (PX ${cx - 4}) (PX 24)))

LAYER trunk ORDER 10 {
  PAINT $trunk_shape FILL $trunk_col RASTER MIDPOINT
  PAINT $spire_core FILL $glow_col RASTER MIDPOINT
}
LAYER crystals ORDER 20 {
  PAINT $rhombus_mid FILL $crystal_dark RASTER MIDPOINT
  PAINT $rhombus_top FILL $crystal_mid RASTER MIDPOINT
  PAINT $rhombus_lit FILL $crystal_hi RASTER MIDPOINT
  PAINT $crystal_spec FILL #FFFFFF RASTER CENTER
}
`;
  }

  if (isPine) {
    // Conical Tiered Pine
    return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${height}
BUDGET INSTRUCTIONS 20000 GENERATED_SHAPES 500 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 32

# --- SCD128 WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}

CONST $trunk_col COLOR #2A1A0F
CONST $pine_dark COLOR ${p.c2}
CONST $pine_mid COLOR ${p.c4}
CONST $pine_lit COLOR ${p.c6}

APPLY_AMP $geo ANY {
  AMP pixelbrain.volume-lift
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM liftHeight ${Math.min(32, height)}
}
APPLY_AMP $mat ANY {
  AMP pixelbrain.biome-material
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM biome forest
}

SHAPE $trunk_shape (RECT ORIGIN (VEC2 (PX ${cx - 3}) (PX ${gy - 14})) SIZE (VEC2 (PX 6) (PX 14)))
SHAPE $tier1 (TRIANGLE P1 (VEC2 (PX ${cx}) (PX 6)) P2 (VEC2 (PX ${cx - 10}) (PX 24)) P3 (VEC2 (PX ${cx + 10}) (PX 24)))
SHAPE $tier2 (TRIANGLE P1 (VEC2 (PX ${cx}) (PX 20)) P2 (VEC2 (PX ${cx - 15}) (PX 40)) P3 (VEC2 (PX ${cx + 15}) (PX 40)))
SHAPE $tier3 (TRIANGLE P1 (VEC2 (PX ${cx}) (PX 34)) P2 (VEC2 (PX ${cx - 19}) (PX 56)) P3 (VEC2 (PX ${cx + 19}) (PX 56)))
SHAPE $tier1_lit (TRIANGLE P1 (VEC2 (PX ${cx}) (PX 6)) P2 (VEC2 (PX ${cx - 10}) (PX 24)) P3 (VEC2 (PX ${cx}) (PX 24)))
SHAPE $tier2_lit (TRIANGLE P1 (VEC2 (PX ${cx}) (PX 20)) P2 (VEC2 (PX ${cx - 15}) (PX 40)) P3 (VEC2 (PX ${cx}) (PX 40)))
SHAPE $tier3_lit (TRIANGLE P1 (VEC2 (PX ${cx}) (PX 34)) P2 (VEC2 (PX ${cx - 19}) (PX 56)) P3 (VEC2 (PX ${cx}) (PX 56)))

LAYER trunk ORDER 10 {
  PAINT $trunk_shape FILL $trunk_col RASTER MIDPOINT
}
LAYER pine_shade ORDER 20 {
  PAINT $tier3 FILL $pine_dark RASTER MIDPOINT
  PAINT $tier2 FILL $pine_dark RASTER MIDPOINT
  PAINT $tier1 FILL $pine_mid RASTER MIDPOINT
}
LAYER pine_sun ORDER 30 {
  PAINT $tier3_lit FILL $pine_mid RASTER MIDPOINT
  PAINT $tier2_lit FILL $pine_lit RASTER MIDPOINT
  PAINT $tier1_lit FILL $pine_lit RASTER MIDPOINT
}
`;
  }

  // Botanical Oak / Autumn Maple / Grandfather Oak
  const crownY = Math.floor(height * 0.42);
  const crownR = Math.floor(width * 0.35);

  return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${height}
BUDGET INSTRUCTIONS 20000 GENERATED_SHAPES 500 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 32

# --- SCD128 WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}
# FORM64: ${scd128Record.form.form64Hex}
# REALIZATION64: ${scd128Record.realization.realization64Hex}

CONST $shadow_col COLOR #090E07
CONST $trunk_mid COLOR #4A2E19
CONST $trunk_lit COLOR #784A28
CONST $foliage_dark COLOR ${p.c2}
CONST $foliage_mid COLOR ${p.c4}
CONST $foliage_lit COLOR ${p.c5}
CONST $foliage_hi COLOR ${p.c6}
CONST $canopy_spec COLOR ${p.c7}

APPLY_AMP $geo ANY {
  AMP pixelbrain.volume-lift
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM liftHeight ${Math.min(32, height)}
}
APPLY_AMP $mat ANY {
  AMP pixelbrain.biome-material
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM biome forest
}

SHAPE $sh_ground (ELLIPSE CENTER (VEC2 (PX ${cx}) (PX ${gy})) RADIUS_X (PX ${Math.floor(crownR * 0.85)}) RADIUS_Y (PX 7))
SHAPE $trunk_core (RECT ORIGIN (VEC2 (PX ${cx - 5}) (PX ${crownY + 8})) SIZE (VEC2 (PX 10) (PX ${gy - crownY - 8})))
SHAPE $c_back (CIRCLE CENTER (VEC2 (PX ${cx}) (PX ${crownY + 4})) RADIUS (PX ${crownR}))
SHAPE $c_left (CIRCLE CENTER (VEC2 (PX ${cx - 8}) (PX ${crownY + 2})) RADIUS (PX ${Math.floor(crownR * 0.8)}))
SHAPE $c_right (CIRCLE CENTER (VEC2 (PX ${cx + 8}) (PX ${crownY + 2})) RADIUS (PX ${Math.floor(crownR * 0.8)}))
SHAPE $c_top (CIRCLE CENTER (VEC2 (PX ${cx}) (PX ${crownY - 6})) RADIUS (PX ${Math.floor(crownR * 0.8)}))
SHAPE $c_lit_sw (CIRCLE CENTER (VEC2 (PX ${cx - 6}) (PX ${crownY - 3})) RADIUS (PX ${Math.floor(crownR * 0.6)}))
SHAPE $c_hi (CIRCLE CENTER (VEC2 (PX ${cx - 8}) (PX ${crownY - 6})) RADIUS (PX ${Math.floor(crownR * 0.35)}))
SHAPE $c_spec (PIXEL AT (VEC2 (PX ${cx - 10}) (PX ${crownY - 9})))

LAYER shadow ORDER 5 {
  PAINT $sh_ground FILL $shadow_col RASTER MIDPOINT
}
LAYER trunk ORDER 10 {
  PAINT $trunk_core FILL $trunk_mid RASTER MIDPOINT
}
LAYER canopy_base ORDER 20 {
  PAINT $c_back FILL $foliage_dark RASTER MIDPOINT
  PAINT $c_right FILL $foliage_dark RASTER MIDPOINT
  PAINT $c_left FILL $foliage_mid RASTER MIDPOINT
}
LAYER canopy_mid ORDER 30 {
  PAINT $c_top FILL $foliage_mid RASTER MIDPOINT
  PAINT $c_lit_sw FILL $foliage_lit RASTER MIDPOINT
}
LAYER canopy_highlights ORDER 40 {
  PAINT $c_hi FILL $foliage_hi RASTER MIDPOINT
  PAINT $c_spec FILL $canopy_spec RASTER CENTER
}
`;
}

/**
 * Generates authoritative SCDL V2 source for an environmental landmark/prop,
 * governed by SCD128 FORM64 (shape) and REALIZATION64 (style).
 */
export function generatePropScdl({
  id = 'environmental_prop',
  assetClass = 'ancient_dolmen',
  width = 48,
  height = 48,
  biome = 'void_forest',
  seed = 4242,
  paletteFamily = 'scholomance_sunlit_glade',
  scd128Record: inputRecord = null,
} = {}) {
  const scd128Record = inputRecord || createTileForgeWitnessRecord(
    {
      width,
      height,
      hasCliff: false,
      terrainType: `prop_${assetClass}`,
    },
    {
      biome,
      seed,
      cellCount: Math.floor(width * height * 0.4),
    }
  );

  const p = resolveScdlPalette(biome, paletteFamily);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const gy = height - 4;
  const budgetCells = calculateRasterBudget(width, height);

  if (assetClass === 'hologram_fern') {
    return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${height}
BUDGET INSTRUCTIONS 10000 GENERATED_SHAPES 200 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 16

# --- SCD128 WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}

CONST $fern_dark COLOR ${p.c3}
CONST $fern_mid COLOR ${p.c5}
CONST $fern_lit COLOR ${p.c7}
CONST $glow_col COLOR ${p.crystal_glow}

APPLY_AMP $geo ANY {
  AMP pixelbrain.volume-lift
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM liftHeight ${Math.min(32, height)}
}

SHAPE $stem (LINE FROM (VEC2 (PX ${cx}) (PX ${height})) TO (VEC2 (PX ${cx}) (PX 4)))
SHAPE $frond_l1 (TRIANGLE P1 (VEC2 (PX ${cx}) (PX ${height - 4})) P2 (VEC2 (PX 2) (PX ${cy})) P3 (VEC2 (PX ${cx}) (PX ${cy})))
SHAPE $frond_r1 (TRIANGLE P1 (VEC2 (PX ${cx}) (PX ${height - 4})) P2 (VEC2 (PX ${width - 2}) (PX ${cy})) P3 (VEC2 (PX ${cx}) (PX ${cy})))
SHAPE $frond_top (TRIANGLE P1 (VEC2 (PX ${cx - 3}) (PX ${cy})) P2 (VEC2 (PX ${cx}) (PX 2)) P3 (VEC2 (PX ${cx + 3}) (PX ${cy})))
SHAPE $tip_glow (PIXEL AT (VEC2 (PX ${cx}) (PX 2)))

LAYER fronds ORDER 10 {
  PAINT $frond_r1 FILL $fern_dark RASTER MIDPOINT
  PAINT $frond_l1 FILL $fern_mid RASTER MIDPOINT
  PAINT $frond_top FILL $fern_lit RASTER MIDPOINT
  PAINT $stem FILL $fern_dark RASTER CENTER
  PAINT $tip_glow FILL $glow_col RASTER CENTER
}
`;
  }

  if (assetClass === 'void_flowers') {
    return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${height}
BUDGET INSTRUCTIONS 10000 GENERATED_SHAPES 200 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 16

# --- SCD128 WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}

CONST $petal_col COLOR ${p.flower_accent}
CONST $center_col COLOR ${p.crystal_glow}

SHAPE $p1 (CIRCLE CENTER (VEC2 (PX ${cx - 3}) (PX ${cy})) RADIUS (PX 3))
SHAPE $p2 (CIRCLE CENTER (VEC2 (PX ${cx + 3}) (PX ${cy})) RADIUS (PX 3))
SHAPE $p3 (CIRCLE CENTER (VEC2 (PX ${cx}) (PX ${cy - 3})) RADIUS (PX 3))
SHAPE $p4 (CIRCLE CENTER (VEC2 (PX ${cx}) (PX ${cy + 3})) RADIUS (PX 3))
SHAPE $core (PIXEL AT (VEC2 (PX ${cx}) (PX ${cy})))

LAYER petals ORDER 10 {
  PAINT $p1 FILL $petal_col RASTER MIDPOINT
  PAINT $p2 FILL $petal_col RASTER MIDPOINT
  PAINT $p3 FILL $petal_col RASTER MIDPOINT
  PAINT $p4 FILL $petal_col RASTER MIDPOINT
  PAINT $core FILL $center_col RASTER CENTER
}
`;
  }

  // Ancient Dolmen / Ruined Monolith
  return `SCDL 2
ASSET ${id}
CANVAS WIDTH ${width} HEIGHT ${height}
BUDGET INSTRUCTIONS 20000 GENERATED_SHAPES 500 RASTER_CELLS ${budgetCells} RECURSION_DEPTH 32

# --- SCD128 WITNESS GOVERNANCE ---
# WIRE: ${scd128Record.scd128Wire}
# FORM64: ${scd128Record.form.form64Hex}
# REALIZATION64: ${scd128Record.realization.realization64Hex}

CONST $shadow_col COLOR #090E07
CONST $stone_dark COLOR #292524
CONST $stone_mid COLOR #57534E
CONST $stone_lit COLOR #8D857E
CONST $stone_hi COLOR #C7C2BA
CONST $glow_col COLOR ${p.crystal_glow}

APPLY_AMP $geo ANY {
  AMP pixelbrain.volume-lift
  VERSION 1.0.0
  STAGE WORLD_DESCRIPTOR
  PARAM liftHeight ${Math.min(32, height)}
}

SHAPE $sh_ground (ELLIPSE CENTER (VEC2 (PX ${cx}) (PX ${gy})) RADIUS_X (PX 18) RADIUS_Y (PX 6))
SHAPE $pillar_left (RECT ORIGIN (VEC2 (PX ${cx - 16}) (PX ${gy - 24})) SIZE (VEC2 (PX 8) (PX 24)))
SHAPE $pillar_right (RECT ORIGIN (VEC2 (PX ${cx + 8}) (PX ${gy - 24})) SIZE (VEC2 (PX 8) (PX 24)))
SHAPE $lintel_base (RECT ORIGIN (VEC2 (PX ${cx - 20}) (PX ${gy - 30})) SIZE (VEC2 (PX 40) (PX 7)))
SHAPE $lintel_top (RECT ORIGIN (VEC2 (PX ${cx - 18}) (PX ${gy - 32})) SIZE (VEC2 (PX 36) (PX 3)))
SHAPE $rune_core (RECT ORIGIN (VEC2 (PX ${cx - 2}) (PX ${gy - 20})) SIZE (VEC2 (PX 4) (PX 4)))
SHAPE $gem_spark (PIXEL AT (VEC2 (PX ${cx}) (PX ${gy - 18})))

LAYER shadow ORDER 5 {
  PAINT $sh_ground FILL $shadow_col RASTER MIDPOINT
}
LAYER pillars ORDER 10 {
  PAINT $pillar_left FILL $stone_mid RASTER MIDPOINT
  PAINT $pillar_right FILL $stone_dark RASTER MIDPOINT
}
LAYER lintel ORDER 20 {
  PAINT $lintel_base FILL $stone_lit RASTER MIDPOINT
  PAINT $lintel_top FILL $stone_hi RASTER MIDPOINT
}
LAYER runes ORDER 30 {
  PAINT $rune_core FILL $glow_col RASTER MIDPOINT
  PAINT $gem_spark FILL #FFFFFF RASTER CENTER
}
`;
}

/**
 * Creates a pixel buffer object matching the Tile Forge CanvasBuffer interface.
 */
function createBufferFromCells(width, height, cells = []) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    const x = Math.round(cell.x);
    const y = Math.round(cell.y);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const hex = cell.color || '#000000';
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    const a = typeof cell.alpha === 'number' ? Math.round(cell.alpha * 255) : 255;

    const idx = (y * width + x) * 4;
    data[idx] = r;
    data[idx + 1] = g;
    data[idx + 2] = b;
    data[idx + 3] = a;
  }

  return {
    width,
    height,
    data,
    setPixel(x, y, rgb, alpha = 255) {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const idx = (y * width + x) * 4;
      data[idx] = rgb[0];
      data[idx + 1] = rgb[1];
      data[idx + 2] = rgb[2];
      data[idx + 3] = alpha;
    },
    getPixel(x, y) {
      if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0, 0];
      const idx = (y * width + x) * 4;
      return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    },
    toCanvas() {
      if (typeof document === 'undefined') return null;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      const imgData = new ImageData(data, width, height);
      ctx.putImageData(imgData, 0, 0);
      return canvas;
    },
  };
}

/**
 * Compiles SCDL V2 source program and converts it into a Tile Forge asset result
 * with full dual-witness SCD128 records and AMP descriptors.
 */
export function compileTileForgeScdl(scdlSource, {
  assetClass = 'unknown',
  biome = 'void_forest',
  elevation = 0,
  seed = 4242,
  scd128Record: inputRecord = null,
} = {}) {
  const compileResult = compileSCDLV2(scdlSource);
  if (!compileResult.ok) {
    const errorMsg = (compileResult.diagnostics || compileResult.errors || []).map((e) => e.message).join('; ');
    throw new Error(`SCDL V2 compilation failed for Tile Forge asset: ${errorMsg}`);
  }

  const canvasWidth = compileResult.analysis?.canvas?.width || 80;
  const canvasHeight = compileResult.analysis?.canvas?.height || 40;
  const cells = compileResult.packet?.geometry?.coordinates || compileResult.packet?.coordinates || [];

  const buffer = createBufferFromCells(canvasWidth, canvasHeight, cells);
  const scd128Record = inputRecord || createTileForgeWitnessRecord(
    {
      width: canvasWidth,
      height: canvasHeight,
      hasCliff: canvasHeight > 40,
      cliffDepth: Math.max(0, canvasHeight - 40),
      elevation,
      terrainType: `${biome}_${assetClass}`,
    },
    {
      biome,
      seed,
      cellCount: cells.length,
    }
  );

  return {
    ok: true,
    width: canvasWidth,
    height: canvasHeight,
    buffer,
    scdlSource,
    ast: compileResult.ast,
    bytecode: compileResult.bytecode,
    ampDescriptors: compileResult.ampDescriptors || [],
    scd128Record,
    cells,
    toCanvas: () => buffer.toCanvas(),
  };
}

/**
 * Creates an immutable realization recipe for Tile Forge assets,
 * shared across SCDL compilation and direct rasterization preview.
 */
export function createTileForgeAssetRecipe(intent = {}) {
  const width = Math.floor(Number(intent.width) || 80);
  const height = Math.floor(Number(intent.height) || 40);
  const hasGround = intent.hasGround !== undefined ? Boolean(intent.hasGround) : true;
  const groundDepth = intent.groundDepth !== undefined ? Math.max(0, Math.floor(Number(intent.groundDepth))) : 16;
  const biome = String(intent.biome || 'void_forest');
  const paletteFamily = String(intent.paletteFamily || 'scholomance_sunlit_glade');
  const seed = typeof intent.seed === 'number' ? intent.seed : 4242;
  const elevation = Number(intent.elevation) || 0;

  const palette = resolveScdlPalette(biome, paletteFamily);
  const totalHeight = height + (hasGround ? groundDepth : 0);
  const canvas = Object.freeze({ width, height: totalHeight });

  const geometry = Object.freeze({
    kind: 'isometric_tile',
    projection: 'dimetric_2_to_1',
    width,
    height,
    topHeight: height,
    hasGround,
    groundDepth,
    totalHeight,
    elevation,
    logicalFootprint: Object.freeze({ widthTiles: 1, heightTiles: 1 }),
    groundAnchor: Object.freeze({ x: width / 2, y: totalHeight - 1 }),
  });

  const materialRoles = Object.freeze({ ...palette });

  const layerOrder = Object.freeze([
    'ground_body',
    'ground_strata',
    'top_surface',
    'sod_fringe',
    'foliage_tufts',
  ]);

  const seedStreams = Object.freeze({
    master: seed,
    shape: (seed * 1664525 + 1013904223) >>> 0,
    vegetation: (seed * 214013 + 2531011) >>> 0,
    minerals: (seed * 1103515245 + 12345) >>> 0,
  });

  const descriptors = Object.freeze([
    {
      ampId: 'pixelbrain.soil',
      stage: 'WORLD_DESCRIPTOR',
      params: {
        depth: groundDepth,
        soilType: 'loam',
        pebbleDensity: intent.pebbleDensity !== undefined ? intent.pebbleDensity : 15,
        rootDensity: intent.rootDensity !== undefined ? intent.rootDensity : 20,
      },
    },
  ]);

  return Object.freeze({
    schemaVersion: '1.0.0',
    assetClass: 'tile_forge_isometric_tile',
    canvas,
    geometry,
    materialRoles,
    layerOrder,
    seedStreams,
    descriptors,
    toScdl() {
      return generateTileGroundScdl({
        assetId: intent.assetId || 'tile_ground',
        width,
        topHeight: height,
        groundDepth,
        biome,
        paletteFamily,
        seed,
        hasGround,
        elevation,
      });
    },
  });
}
