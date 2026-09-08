/**
 * Scholomium Ink — FORM64 Pure Structural Analyzer
 *
 * Consumes redacted structural evidence and produces a sealed FORM64 bank packet.
 * Strict isolation: zero imports or dependencies on REALIZATION64.
 * Never-throw API returning SCD128AnalysisResult<SCD128BankPacketV1>.
 */

import { FORM64_SLOT_NAMES, SCD128_ERROR_CODES } from '../scd128.constants.js';
import { createSlotRecord, createBankPacket } from '../scd128.packet.js';
import { validateFormEvidenceView } from './form64.schema.js';

/**
 * Analyzes structural evidence and emits an immutable FORM64 bank packet.
 *
 * @param {object} evidenceView - Redacted structural evidence view.
 * @param {object} [options]
 * @returns {Readonly<{ ok: boolean, packet: object | null, diagnostics: readonly object[] }>}
 */
export function analyzeForm64(evidenceView, options = {}) {
  const diagnostics = [];

  try {
    const forbiddenViolations = validateFormEvidenceView(evidenceView);
    if (forbiddenViolations.length > 0) {
      for (const v of forbiddenViolations) {
        diagnostics.push({
          code: v.code || SCD128_ERROR_CODES.FORBIDDEN_FIELD,
          message: v.message,
          field: v.field,
          severity: 'CRIT',
        });
      }
      return Object.freeze({ ok: false, packet: null, diagnostics: Object.freeze(diagnostics) });
    }

    const adapterFamily = evidenceView?.adapterFamily || options.adapterFamily || 'tree';
    const evidenceDigest = evidenceView?.evidenceDigest || options.evidenceDigest || '';
    const rawSlots = evidenceView?.slots || {};

    const slots = [];
    for (let i = 0; i < FORM64_SLOT_NAMES.length; i++) {
      const slotName = FORM64_SLOT_NAMES[i];
      const slotData = rawSlots[slotName] || {};

      const canonicalCategory = slotData.canonicalCategory || 'standard';
      const parameters = slotData.parameters || {};
      const evidenceRefs = slotData.evidenceRefs || [];
      const confidence = slotData.confidence || 'authored';
      const canonicalDerivation = slotData.canonicalDerivation || `${adapterFamily}:${slotName.toLowerCase()}`;

      const slotRecord = createSlotRecord({
        slot: slotName,
        position: i,
        canonicalCategory,
        parameters,
        evidenceRefs,
        confidence,
        canonicalDerivation,
        bank: 'form',
      });
      slots.push(slotRecord);
    }

    const packet = createBankPacket({
      bank: 'form',
      adapterFamily,
      slots,
      evidenceDigest,
    });

    return Object.freeze({
      ok: true,
      packet,
      diagnostics: Object.freeze([]),
    });
  } catch (error) {
    diagnostics.push({
      code: error.code || SCD128_ERROR_CODES.FORM_SCHEMA,
      message: error.message || 'Form analysis failed',
      severity: 'CRIT',
    });
    return Object.freeze({
      ok: false,
      packet: null,
      diagnostics: Object.freeze(diagnostics),
    });
  }
}
