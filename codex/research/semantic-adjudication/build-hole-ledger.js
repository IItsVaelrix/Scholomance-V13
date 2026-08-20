/**
 * Hole ledger: the primary artifact of this phase.
 *
 * @module codex/research/semantic-adjudication/build-hole-ledger
 */

import { ADJUDICATION_CONTRACT, isGoldRefusal } from './adjudication-schema.js';
import { unusedExistingEvidence } from './classify-hole.js';
import { ballisticsTopSenseId } from './evaluate-ballistics.js';

export function buildHoleLedger(rows) {
  const byFamily = new Map();
  const byLayer = Object.create(null);
  for (const row of rows || []) {
    const fam = row.predicateFamily || 'OTHER';
    if (!byFamily.has(fam)) {
      byFamily.set(fam, {
        predicateFamily: fam,
        cases: 0,
        goldRecoverable: 0,
        ballisticsAligned: 0,
        existingProbeSupport: 0,
      });
    }
    const rec = byFamily.get(fam);
    rec.cases += 1;
    if (!isGoldRefusal(row.gold)) rec.goldRecoverable += 1;
    const aligned = row.ballisticsAligned
      ?? (row.frozen ? ballisticsTopSenseId(row.frozen) === row.gold : false);
    if (aligned && !isGoldRefusal(row.gold)) rec.ballisticsAligned += 1;
    const unused = row.frozen && !isGoldRefusal(row.gold)
      ? unusedExistingEvidence(row.frozen, row.gold)
      : [];
    if (unused.length) rec.existingProbeSupport += 1;
    const layer = row.failureLayer || 'UNKNOWN';
    byLayer[layer] = (byLayer[layer] || 0) + 1;
  }

  return Object.freeze({
    contract: ADJUDICATION_CONTRACT,
    cases: (rows || []).length,
    families: Object.freeze([...byFamily.values()]),
    layers: Object.freeze(byLayer),
  });
}
