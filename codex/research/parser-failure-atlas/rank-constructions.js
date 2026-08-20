/**
 * Rank GRAMMAR sole-cause constructions and leftover types.
 *
 * promisedUnblock is the falsifiable prediction. Mixed frontiers are
 * counted as failures and must not be promised.
 *
 * @module codex/research/parser-failure-atlas/rank-constructions
 */

import { SEALED_SPLIT } from './atlas-schema.js';

function assertDesignSplit(rows) {
  for (const row of rows || []) {
    if (row.split === SEALED_SPLIT) {
      throw new Error('test cases cannot enter construction ranking');
    }
  }
}

export function rankConstructionHoles(cases) {
  assertDesignSplit(cases);
  const byLabel = new Map();
  for (const row of cases || []) {
    if (row.plate !== 'GRAMMAR') continue;
    const labels = [...new Set((row.diagnosis?.categories || []).map((c) => c.label).filter(Boolean))];
    const sole = labels.length === 1;
    for (const label of labels) {
      if (!byLabel.has(label)) {
        const first = (row.diagnosis.categories || []).find((c) => c.label === label);
        byLabel.set(label, {
          label,
          deprel: first?.deprel ?? null,
          failures: 0,
          soleCause: 0,
          lemmas: new Set(),
        });
      }
      const rec = byLabel.get(label);
      rec.failures += 1;
      if (sole) rec.soleCause += 1;
      if (row.gold?.verb) rec.lemmas.add(String(row.gold.verb).toLowerCase());
    }
  }
  return [...byLabel.values()]
    .map((rec) => Object.freeze({
      label: rec.label,
      deprel: rec.deprel,
      failures: rec.failures,
      soleCause: rec.soleCause,
      promisedUnblock: rec.soleCause,
      lemmas: rec.lemmas.size,
    }))
    .sort((a, b) => b.promisedUnblock - a.promisedUnblock
      || b.failures - a.failures
      || a.label.localeCompare(b.label));
}

export function rankLeftoverTypes(cases) {
  assertDesignSplit(cases);
  const byType = new Map();
  for (const row of cases || []) {
    if (row.plate !== 'ROOT_TYPE_MISMATCH') continue;
    for (const type of row.chart?.leftoverTypes || []) {
      byType.set(type, (byType.get(type) || 0) + 1);
    }
  }
  return [...byType.entries()]
    .map(([type, cases]) => Object.freeze({ type, cases }))
    .sort((a, b) => b.cases - a.cases || a.type.localeCompare(b.type));
}
