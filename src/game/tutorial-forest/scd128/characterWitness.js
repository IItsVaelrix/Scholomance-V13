import { createSlotRecord, createBankPacket } from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.packet.js';
import { FORM64_SLOT_NAMES, REALIZATION64_SLOT_NAMES } from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.constants.js';
import { computeCanonicalDigest256 } from '../../../../codex/core/pixelbrain/scholomium-ink/scd128/scd128.canonical.js';
function bankPacket(bank, categories, parameters) {
  const names = bank === 'form' ? FORM64_SLOT_NAMES : REALIZATION64_SLOT_NAMES;
  const evidenceDigest = computeCanonicalDigest256(parameters);
  return createBankPacket({ bank, adapterFamily: 'authored-adult-character', evidenceDigest, slots: names.map((slot, position) => createSlotRecord({ bank, slot, position, canonicalCategory: categories[position], parameters: parameters[position], confidence: 'authored', evidenceRefs: [`character:${bank}:${evidenceDigest}`], canonicalDerivation: 'Authored character declaration; not a canonical Lawyer admission.' })) });
}
/** FORM64 receives only anatomy and occupied coordinates; never reads palette. */
export function buildCharacterFormWitness({ canvas, joints, occupied }) {
  return bankPacket('form', ['adult_humanoid', 'upright_sprite', 'articulated_scholar', 'named_joint_manifold', 'adult_seven_and_half_heads', 'balanced_stance', 'separated_limbs', 'grounded_feet'], [
    { species: 'human', posture: 'upright' }, { width: canvas.width, height: canvas.height },
    { occupancyDigest: computeCanonicalDigest256(occupied) }, { joints },
    { headsTall: { numerator: '15', denominator: '2' } }, { shoulderToHip: 'adult_taper' },
    { limbSeparation: 'joint_based' }, { anchorX: { numerator: '1', denominator: '2' }, anchorY: { numerator: '19', denominator: '20' } },
  ]);
}
/** REALIZATION64 receives only authored material/color declarations, never form. */
export function buildCharacterRealizationWitness(palette) {
  return bankPacket('realization', ['integer_pixel', 'selective_contour', 'material_planes', 'four_band_relief', 'cloth_steel_leather', 'restrained_scholar', 'upper_left_key', 'engraved_signature'], [
    { alpha: 'opaque_or_transparent' }, { outline: 'one_pixel' }, { method: 'contiguous_clusters' },
    { contrast: 'light_face_dark_torso' }, { materials: ['cloth','steel','leather','skin','wood','crystal'] },
    { palette }, { direction: 'upper_left' }, { signature: 'wand_stroke', animation: 'joint_trajectory' },
  ]);
}
export function createCharacterWitnessRecord({ canvas, joints, coordinates, palette }) {
  const occupied = coordinates.map(({ x, y }) => ({ x, y }));
  const form = buildCharacterFormWitness({ canvas, joints, occupied });
  const realization = buildCharacterRealizationWitness(palette);
  return Object.freeze({ contract: 'SCD128-ASSET-RECORD', assetClass: 'adult_character', scd128Wire: form.checksum64 + realization.checksum64, form, realization, admission: 'authored; not Lawyer-approved' });
}
