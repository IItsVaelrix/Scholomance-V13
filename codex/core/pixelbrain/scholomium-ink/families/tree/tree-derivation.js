/**
 * Scholomium Ink — Tree Pattern Derivation & Variant / Hybrid Generator
 *
 * Derives explainable invariants, bounded parameters, and legal variation ranges
 * from canonical tree masters.
 *
 * Generates:
 * - 14 unseen natural variants (2 per family)
 * - 3 original Scholomance hybrid species with explicit parent citations and declared transformations
 */

import { analyzeForm64 } from '../../scd128/form64/form64.analyzer.js';
import { analyzeRealization64 } from '../../scd128/realization64/realization64.analyzer.js';
import { conductSCD128Hearing } from '../../scd128/counsel/counsel.js';
import { treeCounselPolicy } from './tree-counsel.policy.js';
import { projectCounseledTreeToSCDLV2 } from './tree-projection.adapter.js';

export const NATURAL_VARIANTS_SPEC = Object.freeze([
  { family: 'oak', id: 'oak_ancient', widthAdj: 1.2, heightAdj: 1.1, density: 'res_48x64', palette: 'verdant_forest' },
  { family: 'oak', id: 'oak_young', widthAdj: 0.8, heightAdj: 0.85, density: 'res_32x52', palette: 'verdant_forest' },
  { family: 'hickory', id: 'hickory_slender', widthAdj: 0.75, heightAdj: 1.05, density: 'res_32x52', palette: 'olive_green' },
  { family: 'hickory', id: 'hickory_mature', widthAdj: 1.0, heightAdj: 1.15, density: 'res_48x64', palette: 'olive_green' },
  { family: 'redwood', id: 'redwood_monarch', widthAdj: 1.3, heightAdj: 1.25, density: 'res_48x112', palette: 'cinnamon_and_emerald' },
  { family: 'redwood', id: 'redwood_spire', widthAdj: 0.8, heightAdj: 1.1, density: 'res_48x112', palette: 'cinnamon_and_emerald' },
  { family: 'cedar', id: 'cedar_windswept', widthAdj: 1.15, heightAdj: 0.9, density: 'res_48x64', palette: 'deep_sage' },
  { family: 'cedar', id: 'cedar_terraced', widthAdj: 1.0, heightAdj: 1.05, density: 'res_48x64', palette: 'deep_sage' },
  { family: 'pine', id: 'pine_open', widthAdj: 0.9, heightAdj: 0.95, density: 'res_32x64', palette: 'voidpine_dark' },
  { family: 'pine', id: 'pine_high_canopy', widthAdj: 0.85, heightAdj: 1.15, density: 'res_32x64', palette: 'voidpine_dark' },
  { family: 'evergreen', id: 'evergreen_dense', widthAdj: 1.1, heightAdj: 0.95, density: 'res_32x52', palette: 'spruce_bluegreen' },
  { family: 'evergreen', id: 'evergreen_frostbound', widthAdj: 1.0, heightAdj: 1.0, density: 'res_32x52', palette: 'spruce_bluegreen' },
  { family: 'maple', id: 'maple_autumn', widthAdj: 1.1, heightAdj: 1.0, density: 'res_48x64', palette: 'autumn_scarlet_gold' },
  { family: 'maple', id: 'maple_spreading', widthAdj: 1.3, heightAdj: 0.95, density: 'res_48x64', palette: 'autumn_scarlet_gold' },
]);

export const HYBRID_SPECIES_SPEC = Object.freeze([
  {
    id: 'scholo_ironbark_redcedar',
    parents: ['redwood', 'cedar'],
    transformation: 'redwood_verticality + cedar_terrace_rhythm + ironbark_mineral_hardening',
    formArchetype: {
      envelope: 'horizontal_terraced',
      skeleton: 'massive_vertical_stepped',
      proportion: 'ultra_tall',
    },
    realizationArchetype: {
      paletteTheme: 'cinnamon_and_emerald',
      barkMaterial: 'ironbark_striated_dense',
      foliageMaterial: 'cedar_flat_scales',
      edgeStyle: 'horizontal_scale_frills',
      valueBands: 6,
    },
  },
  {
    id: 'scholo_weeping_voidmaple',
    parents: ['maple', 'oak'],
    transformation: 'maple_canopy_lobes + oak_heavy_limbs + bioluminescent_void_drift',
    formArchetype: {
      envelope: 'lobed_spreading',
      skeleton: 'deliquescent_low_sinuous',
      proportion: 'broad_spreading',
    },
    realizationArchetype: {
      paletteTheme: 'autumn_scarlet_gold',
      barkMaterial: 'oak_furrowed_dark',
      foliageMaterial: 'maple_palmate_leaves',
      edgeStyle: 'lobed_pointed_frills',
      valueBands: 5,
    },
  },
  {
    id: 'scholo_frostpine_evergreen',
    parents: ['pine', 'evergreen'],
    transformation: 'pine_tiered_separation + evergreen_dense_conical_mass + alchemical_frost_rime',
    formArchetype: {
      envelope: 'radial_tiered',
      skeleton: 'radial_whorled_cylindrical',
      proportion: 'balanced',
    },
    realizationArchetype: {
      paletteTheme: 'spruce_bluegreen',
      barkMaterial: 'pine_scaly_amber',
      foliageMaterial: 'dense_spruce_needles',
      edgeStyle: 'dense_comb_needles',
      valueBands: 5,
    },
  },
]);

/**
 * Builds a valid form evidence view for a tree specimen.
 */
export function buildTreeFormEvidenceView({
  family,
  assetName,
  canvasWidth = 48,
  canvasHeight = 64,
  envelope = 'broad_rounded',
  branching = 'bifurcated',
  proportion = 'balanced',
  rootSpread = 12,
}) {
  return {
    adapterFamily: 'tree',
    evidenceDigest: `EVIDENCE_FORM_${assetName.toUpperCase()}`,
    slots: {
      ASSET_CLASS: { canonicalCategory: family, parameters: { archetype: family, asset_id: assetName } },
      SCALE_FRAME: {
        canonicalCategory: 'dimetric_2_5d',
        parameters: { canvas_width: Math.round(canvasWidth), canvas_height: Math.round(canvasHeight) },
      },
      SILHOUETTE: { canonicalCategory: envelope, parameters: { occupied_ratio: { numerator: '2', denominator: '3' } } },
      STRUCTURAL_SKELETON: { canonicalCategory: branching, parameters: { primary_limbs: 3, order: 2 } },
      PROPORTION: {
        canonicalCategory: proportion,
        parameters: { trunk_ratio: { numerator: '1', denominator: '2' }, crown_width: Math.round(canvasWidth * 0.7) },
      },
      MASS_DISTRIBUTION: { canonicalCategory: 'mid_canopy', parameters: { center_y: Math.round(canvasHeight * 0.35) } },
      NEGATIVE_SPACE: { canonicalCategory: 'moderate_gaps', parameters: { void_pct: 18 } },
      WORLD_FOOTPRINT: { canonicalCategory: 'buttressed_roots', parameters: { root_spread: Math.round(rootSpread) } },
    },
  };
}

/**
 * Builds a valid realization evidence view for a tree specimen.
 */
export function buildTreeRealizationEvidenceView({
  family,
  assetName,
  density = 'res_48x64',
  edgeStyle = 'lobed_leaf_clumps',
  foliageMaterial = 'broadleaf',
  barkMaterial = 'furrowed_bark',
  palette = 'verdant_forest',
  valueBands = 5,
}) {
  return {
    adapterFamily: 'tree',
    evidenceDigest: `EVIDENCE_REAL_${assetName.toUpperCase()}`,
    slots: {
      PIXEL_DENSITY: { canonicalCategory: density, parameters: { cluster_quantum: 1 } },
      EDGE_LANGUAGE: { canonicalCategory: edgeStyle, parameters: { outline_weight: 1 } },
      CLUSTER_RHYTHM: { canonicalCategory: 'foliage_masses', parameters: { max_isolated_cells: 2 } },
      VALUE_HIERARCHY: { canonicalCategory: `bands_${valueBands}`, parameters: { value_bands: valueBands } },
      MATERIAL_LANGUAGE: {
        canonicalCategory: foliageMaterial,
        parameters: { bark_material: barkMaterial, foliage_material: foliageMaterial },
      },
      PALETTE_LOGIC: { canonicalCategory: palette, parameters: { steps: valueBands } },
      LIGHT_RESPONSE: { canonicalCategory: 'upper_left', parameters: { light_x: -1, light_y: -1 } },
      SURFACE_VARIATION: { canonicalCategory: 'subtle_weathering', parameters: { variation_pct: 5 } },
    },
  };
}

/**
 * Generates and adjudicates a natural variant or hybrid tree.
 */
export function generateTreeDescendant({
  spec,
  isHybrid = false,
  parentReceipts = [],
}) {
  const family = spec.family || (spec.parents ? spec.parents[0] : 'oak');
  const assetName = spec.id;

  const formView = buildTreeFormEvidenceView({
    family,
    assetName,
    canvasWidth: (spec.widthAdj ? Math.round(48 * spec.widthAdj) : 48),
    canvasHeight: (spec.heightAdj ? Math.round(64 * spec.heightAdj) : 64),
    envelope: spec.formArchetype?.envelope || (family === 'evergreen' ? 'dense_conical' : family === 'pine' ? 'radial_tiered' : family === 'redwood' ? 'tapered_spire' : family === 'cedar' ? 'horizontal_terraced' : 'broad_rounded'),
    branching: spec.formArchetype?.skeleton || 'bifurcated',
    proportion: spec.formArchetype?.proportion || 'balanced',
  });

  const realView = buildTreeRealizationEvidenceView({
    family,
    assetName,
    density: spec.density || 'res_48x64',
    edgeStyle: spec.realizationArchetype?.edgeStyle || (family === 'evergreen' ? 'dense_comb_needles' : family === 'pine' ? 'jagged_needle_stars' : family === 'cedar' ? 'horizontal_scale_frills' : family === 'redwood' ? 'high_frequency_needles' : 'lobed_leaf_clumps'),
    foliageMaterial: spec.realizationArchetype?.foliageMaterial || (family === 'pine' || family === 'evergreen' || family === 'redwood' || family === 'cedar' ? 'conifer_needles' : 'broadleaf_clumps'),
    barkMaterial: spec.realizationArchetype?.barkMaterial || 'bark_base',
    palette: spec.palette || spec.realizationArchetype?.paletteTheme || 'verdant_forest',
    valueBands: spec.realizationArchetype?.valueBands || 5,
  });

  const formResult = analyzeForm64(formView);
  if (!formResult.ok) throw new Error(`Form analysis failed for ${assetName}`);

  const realResult = analyzeRealization64(realView);
  if (!realResult.ok) throw new Error(`Realization analysis failed for ${assetName}`);

  const hearing = conductSCD128Hearing({
    form: formResult.packet,
    realization: realResult.packet,
    policy: treeCounselPolicy,
    mode: 'canonical',
  });

  if (hearing.receipt.verdict !== 'approved') {
    throw new Error(`Tree descendant hearing quarantined: ${hearing.receipt.conflicts.map((c) => c.description).join('; ')}`);
  }

  const projection = projectCounseledTreeToSCDLV2({
    receipt: hearing.receipt,
    artPacket: hearing.artPacket,
    assetName,
  });

  return {
    id: assetName,
    spec,
    isHybrid,
    parentReceipts,
    formPacket: formResult.packet,
    realizationPacket: realResult.packet,
    receipt: hearing.receipt,
    artPacket: hearing.artPacket,
    projection,
  };
}
