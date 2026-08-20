/**
 * TEXT PPSP / SDG (§6.2)
 *
 * Quench after a probe: structures that remain once the perturbation is
 * gone are persistent. Novelty is only discovery against a matched control.
 *
 * This does not run inside composePacked. It is the post-perturbation test
 * the beam was missing.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/text-ppsp
 */

export const TEXT_PPSP_CONTRACT = 'PB-TEXT-PPSP-v1';

export function moleculeKey(node) {
  if (!node) return '';
  return `${node.type}:${node.from}:${node.to}`;
}

export function chartInventory(chart) {
  const keys = new Set();
  for (const node of chart?.molecules || []) {
    const k = moleculeKey(node);
    if (k) keys.add(k);
  }
  return keys;
}

/**
 * @param {{generated: Set<string>, quenched: Set<string>, control: Set<string>}}
 */
export function measurePpsp({ generated, quenched, control }) {
  const gen = generated || new Set();
  const q = quenched || new Set();
  const c = control || new Set();
  let persistent = 0;
  let discovered = 0;
  for (const key of gen) {
    if (!q.has(key)) continue;
    persistent += 1;
    if (!c.has(key)) discovered += 1;
  }
  const ppsp = gen.size ? persistent / gen.size : 0;
  const sdg = persistent ? discovered / persistent : 0;
  return {
    contract: TEXT_PPSP_CONTRACT,
    generated: gen.size,
    persistent,
    discovered,
    ppsp,
    sdg,
  };
}
