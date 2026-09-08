/**
 * Scholomium Ink — Pure Deterministic SCD128 Lawyer
 *
 * Adjudicates between FORM64 and REALIZATION64 witnesses.
 * The Lawyer is the ONLY module allowed to import both bank contracts.
 * It never mutates witness packets, never guesses defaults, and never renders pixels.
 */

import { verifyBankPacket, assembleArtPacket } from '../scd128.packet.js';
import { computeCanonicalDigest256 } from '../scd128.canonical.js';
import {
  COUNSEL_CONTRACT,
  COUNSEL_SCHEMA_VERSION,
  validateHearingInput,
} from './counsel.schema.js';
import { SCD128_ERROR_CODES } from '../scd128.constants.js';

/**
 * Conducts an SCD128 hearing.
 *
 * @param {object} hearingInput
 * @param {object} hearingInput.form - Validated SCD128BankPacketV1 (FORM64)
 * @param {object} hearingInput.realization - Validated SCD128BankPacketV1 (REALIZATION64)
 * @param {object} hearingInput.policy - Family counsel policy
 * @param {object} [hearingInput.projectionContext] - Projection hints
 * @param {"canonical"|"laboratory"} [hearingInput.mode="canonical"] - Hearing mode
 * @returns {Readonly<{ receipt: object, artPacket: object | null }>}
 */
export function conductSCD128Hearing(hearingInput) {
  const inputCheck = validateHearingInput(hearingInput);
  if (!inputCheck.ok) {
    throw new Error(`Invalid hearing input: ${inputCheck.reason}`);
  }

  const {
    form,
    realization,
    policy,
    projectionContext = {},
    mode = 'canonical',
  } = hearingInput;

  const conflicts = [];
  const satisfiedRules = [];

  // 1. Verify FORM64 packet integrity
  const formCheck = verifyBankPacket(form);
  if (!formCheck.ok) {
    conflicts.push({
      ruleId: 'BANK_INTEGRITY_FORM',
      description: `FORM64 verification failed: ${formCheck.reason}`,
      formSlot: 'ROOT',
      realizationSlot: 'NONE',
      severity: 'mandatory',
    });
  }

  // 2. Verify REALIZATION64 packet integrity
  const realCheck = verifyBankPacket(realization);
  if (!realCheck.ok) {
    conflicts.push({
      ruleId: 'BANK_INTEGRITY_REALIZATION',
      description: `REALIZATION64 verification failed: ${realCheck.reason}`,
      formSlot: 'NONE',
      realizationSlot: 'ROOT',
      severity: 'mandatory',
    });
  }

  // 3. Verify same adapter family
  if (form.adapterFamily !== realization.adapterFamily) {
    conflicts.push({
      ruleId: 'ADAPTER_FAMILY_MATCH',
      description: `Adapter family mismatch: FORM=${form.adapterFamily}, REALIZATION=${realization.adapterFamily}`,
      formSlot: 'ASSET_CLASS',
      realizationSlot: 'PIXEL_DENSITY',
      severity: 'mandatory',
    });
  }

  // 4. Check for unbound values in canonical mode
  if (mode === 'canonical') {
    const unboundForm = form.slots?.filter((s) => s.confidence === 'unbound') || [];
    const unboundReal = realization.slots?.filter((s) => s.confidence === 'unbound') || [];
    if (unboundForm.length > 0 || unboundReal.length > 0) {
      const names = [...unboundForm.map((s) => s.slot), ...unboundReal.map((s) => s.slot)].join(', ');
      conflicts.push({
        ruleId: 'NO_UNBOUND_IN_CANONICAL',
        description: `Canonical hearing rejects unbound confidence values in slots: ${names}`,
        formSlot: unboundForm[0]?.slot || 'NONE',
        realizationSlot: unboundReal[0]?.slot || 'NONE',
        severity: 'mandatory',
      });
    }
  }

  // 5. Run family compatibility policy
  let projectionDirectives = [];
  try {
    const evaluation = policy.evaluateCompatibility({
      form,
      realization,
      projectionContext,
      mode,
    });
    if (Array.isArray(evaluation.satisfiedRules)) {
      satisfiedRules.push(...evaluation.satisfiedRules);
    }
    if (Array.isArray(evaluation.conflicts)) {
      conflicts.push(...evaluation.conflicts);
    }
    if (Array.isArray(evaluation.directives)) {
      projectionDirectives = evaluation.directives;
    }
  } catch (err) {
    conflicts.push({
      ruleId: 'POLICY_EXCEPTION',
      description: `Family counsel policy execution error: ${err.message}`,
      formSlot: 'ALL',
      realizationSlot: 'ALL',
      severity: 'mandatory',
    });
  }

  // Sort satisfiedRules and conflicts for byte-identical determinism
  satisfiedRules.sort();
  conflicts.sort((a, b) => a.ruleId.localeCompare(b.ruleId) || a.description.localeCompare(b.description));

  // Determine verdict
  const hasMandatoryConflicts = conflicts.some((c) => c.severity === 'mandatory');
  let verdict;
  let finalDirectives;

  if (mode === 'canonical') {
    if (hasMandatoryConflicts || conflicts.length > 0) {
      verdict = 'quarantined';
      finalDirectives = [];
    } else {
      verdict = 'approved';
      finalDirectives = projectionDirectives;
    }
  } else {
    // Laboratory mode
    verdict = 'quarantined';
    finalDirectives = projectionDirectives.map((d) => ({
      ...d,
      quarantinedDiagnostic: true,
    }));
  }

  const checksum128 = form.checksum64 + realization.checksum64;
  const policyId = policy.id || 'unknown_policy';
  const policyDigest256 = policy.digest256 || computeCanonicalDigest256({ policyId });

  const receiptPreimage = {
    contract: COUNSEL_CONTRACT,
    schemaVersion: COUNSEL_SCHEMA_VERSION,
    mode,
    verdict,
    checksum128,
    formDigest256: form.digest256,
    realizationDigest256: realization.digest256,
    policyId,
    policyDigest256,
    satisfiedRules: Object.freeze(satisfiedRules),
    conflicts: Object.freeze(conflicts),
    projectionDirectives: Object.freeze(finalDirectives),
  };

  const receiptDigest256 = computeCanonicalDigest256(receiptPreimage);

  const receipt = Object.freeze({
    ...receiptPreimage,
    receiptDigest256,
  });

  // If approved in canonical mode, assemble the ArtPacket
  let artPacket = null;
  if (verdict === 'approved' && mode === 'canonical') {
    artPacket = assembleArtPacket({
      form,
      realization,
      sourceProvenance: {
        policyId,
        receiptDigest256,
        adjudicatedAtEpoch: '2026-09-07',
      },
    });
  }

  return Object.freeze({
    receipt,
    artPacket,
  });
}
