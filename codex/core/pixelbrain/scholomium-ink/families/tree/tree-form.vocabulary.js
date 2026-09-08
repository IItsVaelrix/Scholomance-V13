/**
 * Scholomium Ink — Tree Family FORM64 Vocabulary
 *
 * Defines the structural categories and parameter ranges for the seven canonical tree families:
 * Oak, Hickory, Redwood, Cedar, Pine, Evergreen, Maple.
 */

export const TREE_FAMILIES = Object.freeze([
  'oak',
  'hickory',
  'redwood',
  'cedar',
  'pine',
  'evergreen',
  'maple',
]);

export const TREE_FORM_ARCHETYPES = Object.freeze({
  oak: {
    envelope: 'broad_rounded',
    trunkAxis: 'sinuous_heavy',
    branchingOrder: 'deliquescent_low',
    proportionClass: 'broad_spreading',
    massCenter: 'mid_low',
    negativeSpace: 'moderate_gaps',
    rootSpread: 'buttressed_wide',
    trunkTaperRatio: { numerator: '3', denominator: '4' },
    crownWidthRatio: { numerator: '5', denominator: '4' },
  },
  hickory: {
    envelope: 'oval_columnar',
    trunkAxis: 'straight_tall',
    branchingOrder: 'upward_ascending',
    proportionClass: 'tall_slender',
    massCenter: 'mid_high',
    negativeSpace: 'dense_closed',
    rootSpread: 'compact',
    trunkTaperRatio: { numerator: '4', denominator: '5' },
    crownWidthRatio: { numerator: '3', denominator: '4' },
  },
  redwood: {
    envelope: 'tapered_spire',
    trunkAxis: 'massive_vertical',
    branchingOrder: 'high_whorled',
    proportionClass: 'ultra_tall',
    massCenter: 'upper_canopy',
    negativeSpace: 'open_airy',
    rootSpread: 'buttressed_massive',
    trunkTaperRatio: { numerator: '1', denominator: '2' },
    crownWidthRatio: { numerator: '1', denominator: '3' },
  },
  cedar: {
    envelope: 'horizontal_terraced',
    trunkAxis: 'straight_tapered',
    branchingOrder: 'stepped_horizontal',
    proportionClass: 'balanced',
    massCenter: 'tiered_whorls',
    negativeSpace: 'layered_horizontal_voids',
    rootSpread: 'exposed_spreading',
    trunkTaperRatio: { numerator: '2', denominator: '3' },
    crownWidthRatio: { numerator: '1', denominator: '1' },
  },
  pine: {
    envelope: 'radial_tiered',
    trunkAxis: 'straight_cylindrical',
    branchingOrder: 'radial_whorled',
    proportionClass: 'tall_slender',
    massCenter: 'tiered_whorls',
    negativeSpace: 'open_airy',
    rootSpread: 'compact',
    trunkTaperRatio: { numerator: '5', denominator: '6' },
    crownWidthRatio: { numerator: '2', denominator: '3' },
  },
  evergreen: {
    envelope: 'dense_conical',
    trunkAxis: 'concealed_central',
    branchingOrder: 'continuous_conical',
    proportionClass: 'balanced',
    massCenter: 'low_pyramidal',
    negativeSpace: 'dense_closed',
    rootSpread: 'compact',
    trunkTaperRatio: { numerator: '3', denominator: '4' },
    crownWidthRatio: { numerator: '4', denominator: '5' },
  },
  maple: {
    envelope: 'lobed_spreading',
    trunkAxis: 'balanced_divided',
    branchingOrder: 'radiating_crown',
    proportionClass: 'balanced',
    massCenter: 'mid_canopy',
    negativeSpace: 'moderate_gaps',
    rootSpread: 'spreading',
    trunkTaperRatio: { numerator: '2', denominator: '3' },
    crownWidthRatio: { numerator: '6', denominator: '5' },
  },
});
