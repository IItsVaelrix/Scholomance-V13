/**
 * Scholomium Ink — Seven Tree Master Authoring & Evidence Bundler
 *
 * Defines the canonical specifications and evidence bundles for:
 * 1. Oak
 * 2. Hickory
 * 3. Redwood
 * 4. Cedar
 * 5. Pine
 * 6. Evergreen
 * 7. Maple
 */

import { analyzeForm64 } from '../scd128/form64/form64.analyzer.js';
import { analyzeRealization64 } from '../scd128/realization64/realization64.analyzer.js';
import { conductSCD128Hearing } from '../scd128/counsel/counsel.js';
import { treeCounselPolicy } from '../families/tree/tree-counsel.policy.js';
import { projectCounseledTreeToSCDLV2 } from '../families/tree/tree-projection.adapter.js';
import { createAdmissionReceipt } from './admission.js';
import { computeCanonicalDigest256 } from '../scd128/scd128.canonical.js';
import {
  buildTreeFormEvidenceView,
  buildTreeRealizationEvidenceView,
} from '../families/tree/tree-derivation.js';

export const MASTER_TREE_SPECS = Object.freeze({
  oak: {
    id: 'oak',
    name: 'Scholomium Master Oak',
    family: 'oak',
    canvasWidth: 48,
    canvasHeight: 64,
    envelope: 'broad_rounded',
    branching: 'deliquescent_low',
    proportion: 'broad_spreading',
    density: 'res_48x64',
    edgeStyle: 'lobed_leaf_clumps',
    foliageMaterial: 'broadleaf_clumps',
    barkMaterial: 'oak_furrowed_dark',
    palette: 'verdant_forest',
    valueBands: 5,
    brief: 'Broad spreading crown with heavy lateral limbs and controlled asymmetry. Lower branching allows substantial canopy overhang with visible negative space windows.',
  },
  hickory: {
    id: 'hickory',
    name: 'Scholomium Master Hickory',
    family: 'hickory',
    canvasWidth: 32,
    canvasHeight: 52,
    envelope: 'oval_columnar',
    branching: 'upward_ascending',
    proportion: 'tall_slender',
    density: 'res_32x52',
    edgeStyle: 'crisp_accent_serrate',
    foliageMaterial: 'compound_leaves',
    barkMaterial: 'hickory_striated',
    palette: 'olive_green',
    valueBands: 4,
    brief: 'Taller oval crown, straighter columnar trunk, and upward branch tendency. Strong central vertical spine with compact compound leaf clusters.',
  },
  redwood: {
    id: 'redwood',
    name: 'Scholomium Master Redwood',
    family: 'redwood',
    canvasWidth: 48,
    canvasHeight: 112,
    envelope: 'tapered_spire',
    branching: 'massive_vertical_stepped',
    proportion: 'ultra_tall',
    density: 'res_48x112',
    edgeStyle: 'high_frequency_needles',
    foliageMaterial: 'conifer_needles',
    barkMaterial: 'redwood_fibrous_cinnamon',
    palette: 'cinnamon_and_emerald',
    valueBands: 6,
    brief: 'Extreme verticality with a massive tapering trunk base, high-elevation foliage whorls, and compressed lateral spread. Clear scale cues through trunk mass dominance.',
  },
  cedar: {
    id: 'cedar',
    name: 'Scholomium Master Cedar',
    family: 'cedar',
    canvasWidth: 48,
    canvasHeight: 64,
    envelope: 'horizontal_terraced',
    branching: 'stepped_horizontal',
    proportion: 'balanced',
    density: 'res_48x64',
    edgeStyle: 'horizontal_scale_frills',
    foliageMaterial: 'conifer_needles',
    barkMaterial: 'cedar_stringy_gray',
    palette: 'deep_sage',
    valueBands: 5,
    brief: 'Layered horizontal boughs forming stepped irregular terraces. Distinct flat shelf rhythm across the vertical axis with open under-shelf shadows.',
  },
  pine: {
    id: 'pine',
    name: 'Scholomium Master Pine',
    family: 'pine',
    canvasWidth: 32,
    canvasHeight: 64,
    envelope: 'radial_tiered',
    branching: 'radial_whorled',
    proportion: 'tall_slender',
    density: 'res_32x64',
    edgeStyle: 'jagged_needle_stars',
    foliageMaterial: 'conifer_needles',
    barkMaterial: 'pine_scaly_amber',
    palette: 'voidpine_dark',
    valueBands: 5,
    brief: 'Exposed tall cylindrical trunk with separated tiered whorls, irregular radial branch reach, and expansive open negative space between clusters.',
  },
  evergreen: {
    id: 'evergreen',
    name: 'Scholomium Master Evergreen',
    family: 'evergreen',
    canvasWidth: 32,
    canvasHeight: 52,
    envelope: 'dense_conical',
    branching: 'continuous_conical',
    proportion: 'balanced',
    density: 'res_32x52',
    edgeStyle: 'dense_comb_needles',
    foliageMaterial: 'conifer_needles',
    barkMaterial: 'conifer_dark_bark',
    palette: 'spruce_bluegreen',
    valueBands: 5,
    brief: 'Project-defined dense conical archetype with a continuous chevron needle mantle, concealed inner trunk, and crisp triangular silhouette balance.',
  },
  maple: {
    id: 'maple',
    name: 'Scholomium Master Maple',
    family: 'maple',
    canvasWidth: 48,
    canvasHeight: 64,
    envelope: 'lobed_spreading',
    branching: 'radiating_crown',
    proportion: 'balanced',
    density: 'res_48x64',
    edgeStyle: 'lobed_pointed_frills',
    foliageMaterial: 'broadleaf_clumps',
    barkMaterial: 'maple_smooth_gray',
    palette: 'autumn_scarlet_gold',
    valueBands: 5,
    brief: 'Rounded lobed crown masses, radiating branch distribution, balanced weight, and season-capable autumn scarlet-gold palette logic.',
  },
});

/**
 * Builds the complete evidence bundle for a master tree.
 */
export function buildMasterTreeBundle(familyKey) {
  const spec = MASTER_TREE_SPECS[familyKey];
  if (!spec) throw new Error(`Unknown master tree family: ${familyKey}`);

  const formView = buildTreeFormEvidenceView({
    family: spec.family,
    assetName: `scholomium_master_${spec.family}`,
    canvasWidth: spec.canvasWidth,
    canvasHeight: spec.canvasHeight,
    envelope: spec.envelope,
    branching: spec.branching,
    proportion: spec.proportion,
  });

  const realView = buildTreeRealizationEvidenceView({
    family: spec.family,
    assetName: `scholomium_master_${spec.family}`,
    density: spec.density,
    edgeStyle: spec.edgeStyle,
    foliageMaterial: spec.foliageMaterial,
    barkMaterial: spec.barkMaterial,
    palette: spec.palette,
    valueBands: spec.valueBands,
  });

  const formResult = analyzeForm64(formView);
  if (!formResult.ok) throw new Error(`Form analysis failed for ${spec.family}`);

  const realResult = analyzeRealization64(realView);
  if (!realResult.ok) throw new Error(`Realization analysis failed for ${spec.family}`);

  const hearing = conductSCD128Hearing({
    form: formResult.packet,
    realization: realResult.packet,
    policy: treeCounselPolicy,
    mode: 'canonical',
  });

  if (hearing.receipt.verdict !== 'approved') {
    throw new Error(`Master hearing quarantined: ${hearing.receipt.conflicts.map((c) => c.description).join('; ')}`);
  }

  const projection = projectCounseledTreeToSCDLV2({
    receipt: hearing.receipt,
    artPacket: hearing.artPacket,
    assetName: `scholomium_master_${spec.family}`,
  });

  const sourceDigest = computeCanonicalDigest256({ source: projection.scdlSource });

  const admissionReceipt = createAdmissionReceipt({
    specimenId: spec.id,
    family: spec.family,
    counselReceipt: hearing.receipt,
    sourceDigest,
    approvedBy: 'Angel',
    notes: `Canonical admission for master ${spec.name}`,
  });

  return {
    spec,
    formView,
    realView,
    formPacket: formResult.packet,
    realizationPacket: realResult.packet,
    counselReceipt: hearing.receipt,
    artPacket: hearing.artPacket,
    admissionReceipt,
    scdlSource: projection.scdlSource,
    compileResult: projection.compileResult,
  };
}
