/**
 * DEV vs TRAIN replication of interior sole-cause holes.
 *
 * Clause-root unreached (`root (* -> ROOT)`) is excluded. That plate is
 * "no clause formed", not a missing root bond.
 *
 * @module codex/research/parser-failure-atlas/replicate-interiors
 */

export const INTERIOR_WATCHLIST = Object.freeze([
  'punct (PUNCT -> NOUN)',
  'punct (PUNCT -> PROPN)',
  'list (NUM -> NUM)',
  'nmod (NOUN -> NOUN)',
  'advmod (PART -> VERB)',
]);

const TOP_K = 8;

export function isClauseRootLabel(label) {
  return /^root \(/.test(String(label || ''));
}

export function interiorConstructions(constructions) {
  return (constructions || []).filter((row) => !isClauseRootLabel(row.label));
}

function indexInteriors(constructions) {
  const interior = interiorConstructions(constructions)
    .slice()
    .sort((a, b) => (b.promisedUnblock || 0) - (a.promisedUnblock || 0)
      || (b.failures || 0) - (a.failures || 0)
      || String(a.label).localeCompare(String(b.label)));
  const total = interior.reduce((s, r) => s + (r.promisedUnblock || 0), 0);
  const byLabel = new Map();
  interior.forEach((row, i) => {
    byLabel.set(row.label, {
      rank: i + 1,
      promisedUnblock: row.promisedUnblock || 0,
      failures: row.failures || 0,
      share: total === 0 ? 0 : (row.promisedUnblock || 0) / total,
    });
  });
  return { interior, total, byLabel };
}

export function replicateInteriors({ dev, train } = {}) {
  const d = indexInteriors(dev);
  const t = indexInteriors(train);
  const watchlist = INTERIOR_WATCHLIST.map((label) => {
    const left = d.byLabel.get(label) || null;
    const right = t.byLabel.get(label) || null;
    const recurred = Boolean(
      left && right && left.rank <= TOP_K && right.rank <= TOP_K,
    );
    return Object.freeze({
      label,
      recurred,
      dev: left,
      train: right,
    });
  });
  return Object.freeze({
    topK: TOP_K,
    watchlist: Object.freeze(watchlist),
    recurredCount: watchlist.filter((w) => w.recurred).length,
    testOpened: false,
  });
}
