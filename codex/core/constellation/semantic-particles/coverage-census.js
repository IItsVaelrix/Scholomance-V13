/**
 * TRAIN coverage census. Ranks lemma::TYPE keys by ambiguous frequency
 * and UNKNOWN mass. No gold values. No TEST.
 *
 * PURE AND ZERO-I/O (atomsFor is injected).
 *
 * @module codex/core/constellation/semantic-particles/coverage-census
 */

import { featuresFor } from './feature-provider.js';
import { knownFeatureCount } from './experimental-inventory.js';

export function censusUnknownMass(records, posMap, provider, atomsFor) {
  const byKey = new Map();
  let ambiguousTokens = 0;
  let unknownTokens = 0;
  for (const rec of records || []) {
    const tokens = rec.tokens || [];
    for (let i = 0; i < tokens.length; i += 1) {
      const form = tokens[i].form;
      const atoms = atomsFor(form, i, posMap) || [];
      if (atoms.length < 2) continue;
      ambiguousTokens += 1;
      let tokenUnknown = true;
      for (const atom of atoms) {
        const lemma = String(atom.token || form).toLowerCase();
        const key = `${lemma}::${atom.type}`;
        const known = knownFeatureCount(featuresFor(lemma, atom.type, provider));
        const row = byKey.get(key) || {
          key,
          lemma,
          type: atom.type,
          frequency: 0,
          unknownMass: 0,
        };
        row.frequency += 1;
        if (known === 0) row.unknownMass += 1;
        else tokenUnknown = false;
        byKey.set(key, row);
      }
      if (tokenUnknown) unknownTokens += 1;
    }
  }
  const rows = [...byKey.values()].sort((a, b) => (
    b.unknownMass - a.unknownMass || b.frequency - a.frequency || a.key.localeCompare(b.key)
  ));
  let cum = 0;
  const totalUnknown = rows.reduce((s, r) => s + r.unknownMass, 0);
  const withCum = rows.map((r) => {
    cum += r.unknownMass;
    return {
      ...r,
      cumulativeUnknown: cum,
      cumulativeShare: totalUnknown > 0 ? cum / totalUnknown : 0,
    };
  });
  return Object.freeze({
    ambiguousTokens,
    unknownTokens,
    unknownTokenRate: ambiguousTokens > 0 ? unknownTokens / ambiguousTokens : 1,
    keys: Object.freeze(withCum),
    totalUnknown,
  });
}

export function paretoCuts(census, cuts = [25, 100, 250]) {
  return cuts.map((n) => {
    const slice = (census.keys || []).slice(0, n);
    const mass = slice.reduce((s, r) => s + r.unknownMass, 0);
    return Object.freeze({
      n,
      unknownMass: mass,
      share: census.totalUnknown > 0 ? mass / census.totalUnknown : 0,
    });
  });
}
