/**
 * Scholomium Ink — Tree Family Counsel Policy
 *
 * Evaluates pure compatibility between tree FORM64 and REALIZATION64 witnesses.
 * Emits projection directives for the 9 semantic layers.
 */

import { computeCanonicalDigest256 } from '../../scd128/scd128.canonical.js';

export const TREE_COUNSEL_POLICY_ID = 'scholomium_ink_tree_counsel_policy_v1';

export const treeCounselPolicy = Object.freeze({
  id: TREE_COUNSEL_POLICY_ID,
  digest256: computeCanonicalDigest256({ id: TREE_COUNSEL_POLICY_ID, version: 1 }),

  evaluateCompatibility({ form, realization, projectionContext = {} }) {
    const satisfiedRules = [];
    const conflicts = [];

    const formSlots = Object.fromEntries(form.slots.map((s) => [s.slot, s]));
    const realSlots = Object.fromEntries(realization.slots.map((s) => [s.slot, s]));

    const assetClassCat = formSlots.ASSET_CLASS?.canonicalCategory?.toLowerCase() || '';
    const envelope = formSlots.SILHOUETTE?.canonicalCategory?.toLowerCase() || '';
    const edgeStyle = realSlots.EDGE_LANGUAGE?.canonicalCategory?.toLowerCase() || '';
    const foliageMaterial = realSlots.MATERIAL_LANGUAGE?.canonicalCategory?.toLowerCase() || '';
    const densityCat = realSlots.PIXEL_DENSITY?.canonicalCategory?.toLowerCase() || '';

    // 1. Conifer vs Broadleaf Edge & Material Law
    const isConiferForm =
      envelope.includes('conical') ||
      envelope.includes('spire') ||
      envelope.includes('terraced') ||
      envelope.includes('radial') ||
      assetClassCat.includes('redwood') ||
      assetClassCat.includes('cedar') ||
      assetClassCat.includes('pine') ||
      assetClassCat.includes('evergreen');

    const isConiferReal =
      edgeStyle.includes('needle') ||
      edgeStyle.includes('scale') ||
      foliageMaterial.includes('needle') ||
      foliageMaterial.includes('scale') ||
      foliageMaterial.includes('conifer');

    const isBroadleafForm =
      envelope.includes('rounded') ||
      envelope.includes('columnar') ||
      envelope.includes('lobed') ||
      assetClassCat.includes('oak') ||
      assetClassCat.includes('hickory') ||
      assetClassCat.includes('maple');

    const isBroadleafReal =
      edgeStyle.includes('leaf') ||
      edgeStyle.includes('serrate') ||
      edgeStyle.includes('frills') ||
      foliageMaterial.includes('leaf') ||
      foliageMaterial.includes('broadleaf') ||
      foliageMaterial.includes('palmate') ||
      foliageMaterial.includes('compound');

    if (isConiferForm && isBroadleafReal && !isConiferReal) {
      conflicts.push({
        ruleId: 'TREE_LEAF_SILHOUETTE_MISMATCH',
        description: `Conifer silhouette '${envelope}' cannot be realized with purely broadleaf edge '${edgeStyle}'`,
        formSlot: 'SILHOUETTE',
        realizationSlot: 'EDGE_LANGUAGE',
        severity: 'mandatory',
      });
    } else if (isBroadleafForm && isConiferReal && !isBroadleafReal) {
      conflicts.push({
        ruleId: 'TREE_NEEDLE_SILHOUETTE_MISMATCH',
        description: `Broadleaf silhouette '${envelope}' cannot be realized with purely needle edge '${edgeStyle}'`,
        formSlot: 'SILHOUETTE',
        realizationSlot: 'EDGE_LANGUAGE',
        severity: 'mandatory',
      });
    } else {
      satisfiedRules.push('RULE_CANOPY_EDGE_MORPHOLOGY_COMPATIBLE');
    }

    // 2. Value Hierarchy Depth
    const valueBandsParam = realSlots.VALUE_HIERARCHY?.parameters?.value_bands ?? 4;
    const valueBands = Number(valueBandsParam);
    if (valueBands < 3) {
      conflicts.push({
        ruleId: 'TREE_INSUFFICIENT_VALUE_BANDS',
        description: `Tree realization requires at least 3 value bands for depth, found ${valueBands}`,
        formSlot: 'MASS_DISTRIBUTION',
        realizationSlot: 'VALUE_HIERARCHY',
        severity: 'mandatory',
      });
    } else {
      satisfiedRules.push('RULE_VALUE_HIERARCHY_DEPTH_ADEQUATE');
    }

    // 3. Ground Footprint & Shadow Presence
    const rootSpread = formSlots.WORLD_FOOTPRINT?.parameters?.root_spread;
    if (rootSpread !== undefined && typeof rootSpread === 'number' && rootSpread <= 0) {
      conflicts.push({
        ruleId: 'TREE_INVALID_WORLD_FOOTPRINT',
        description: 'Tree root spread must be positive',
        formSlot: 'WORLD_FOOTPRINT',
        realizationSlot: 'NONE',
        severity: 'mandatory',
      });
    } else {
      satisfiedRules.push('RULE_WORLD_FOOTPRINT_VALID');
    }

    // Directives for the 9 semantic layers if valid
    const directives = [
      {
        layer: 'ground_shadow',
        order: 5,
        directiveType: 'render_contact_shadow',
        params: {
          footprint: formSlots.WORLD_FOOTPRINT?.canonicalCategory || 'elliptical_base',
          radius: formSlots.WORLD_FOOTPRINT?.parameters?.root_spread || 12,
        },
      },
      {
        layer: 'roots_and_ground',
        order: 10,
        directiveType: 'render_roots',
        params: {
          style: formSlots.WORLD_FOOTPRINT?.canonicalCategory || 'buttressed',
          spread: formSlots.WORLD_FOOTPRINT?.parameters?.root_spread || 14,
        },
      },
      {
        layer: 'trunk',
        order: 20,
        directiveType: 'render_trunk_column',
        params: {
          axis: formSlots.STRUCTURAL_SKELETON?.canonicalCategory || 'straight',
          taperRatio: formSlots.PROPORTION?.parameters?.trunk_ratio || { numerator: '1', denominator: '2' },
          barkMaterial: realSlots.MATERIAL_LANGUAGE?.parameters?.bark_material || 'bark_base',
        },
      },
      {
        layer: 'primary_branches',
        order: 30,
        directiveType: 'render_primary_limbs',
        params: {
          branchingOrder: formSlots.STRUCTURAL_SKELETON?.canonicalCategory || 'bifurcated',
          reach: formSlots.PROPORTION?.parameters?.crown_width || 24,
        },
      },
      {
        layer: 'secondary_branches',
        order: 40,
        directiveType: 'render_secondary_twigs',
        params: {
          voidFrequency: formSlots.NEGATIVE_SPACE?.canonicalCategory || 'moderate_gaps',
        },
      },
      {
        layer: 'canopy_masses',
        order: 50,
        directiveType: 'render_canopy_volumes',
        params: {
          envelope,
          clusterStyle: realSlots.CLUSTER_RHYTHM?.canonicalCategory || 'foliage_masses',
          valueBands,
        },
      },
      {
        layer: 'foliage_edges',
        order: 60,
        directiveType: 'render_silhouette_fringe',
        params: {
          edgeStyle,
          outlineMode: realSlots.EDGE_LANGUAGE?.canonicalCategory || 'selout_single',
        },
      },
      {
        layer: 'surface_detail',
        order: 70,
        directiveType: 'render_bark_and_leaf_marks',
        params: {
          variationMode: realSlots.SURFACE_VARIATION?.canonicalCategory || 'clean',
        },
      },
      {
        layer: 'highlights',
        order: 80,
        directiveType: 'render_glints_and_specular',
        params: {
          lightLaw: realSlots.LIGHT_RESPONSE?.canonicalCategory || 'upper_left',
        },
      },
    ];

    return {
      satisfiedRules,
      conflicts,
      directives,
    };
  },
});
