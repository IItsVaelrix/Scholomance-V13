/**
 * T8 — INFORMATION-BOTTLENECK NEUTRONS
 *
 * Offline selection over particle families. Never rewrites the Grimoire.
 * Retired families stay in the ledger.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/evidence-ledger
 */

export function censusParticles(rows) {
  const byFamily = new Map();
  for (const row of rows || []) {
    const family = row.family;
    const current = byFamily.get(family) || {
      family,
      value: 0,
      cost: 0,
      n: 0,
      provenance: row.provenance || 'unknown',
    };
    current.value += Number(row.value || 0);
    current.cost += Number(row.cost || 0);
    current.n += 1;
    byFamily.set(family, current);
  }
  return Object.freeze({
    families: Object.freeze([...byFamily.values()].sort((a, b) => a.family.localeCompare(b.family))),
  });
}

export function selectBottleneck(census, options = {}) {
  const equivalence = options.equivalence ?? 0.01;
  const families = census?.families || [];
  const kept = [];
  const retired = [];
  const seenProvenance = new Set();
  for (const row of families) {
    const valuePerCost = row.value / Math.max(row.cost, 1e-9);
    const duplicate = seenProvenance.has(`${row.family}:${row.provenance}`) && row.n > 1;
    const useless = row.value <= equivalence && row.cost > 1;
    if (useless || duplicate) {
      retired.push({ family: row.family, reason: useless ? 'low-value' : 'duplicate-provenance' });
      continue;
    }
    seenProvenance.add(`${row.family}:${row.provenance}`);
    if (row.n > 1 && row.value <= equivalence * 50) {
      retired.push({ family: row.family, reason: 'redundant-copy' });
    }
    kept.push(row.family);
  }
  return Object.freeze({
    families: Object.freeze([...new Set(kept)]),
    retired: Object.freeze(retired),
    rewroteGrammar: false,
    protected: Object.freeze({ ...(options.protected || {}) }),
  });
}
