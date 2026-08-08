/**
 * A PACKED CHART WITH AN ACTIVATION AGENDA.
 *
 * `compose.js` pushes a separate object for every DERIVATION, so a span
 * buildable as NP in 400 ways holds 400 NP objects, and the layer above
 * multiplies against all 400. The chart is an unpacked parse forest and its
 * size follows the Catalan numbers — measured at 1,382 MB and 8m15s on a single
 * sub-28-token sentence before it was killed.
 *
 * Here a cell holds each CATEGORY once. The 400 ways survive as 400 entries in
 * one node's `derivations`. Storing the factors instead of the product turns a
 * multiplication into a sum, which is what a logarithm does, and the bound goes
 * from 4^n to n^3.
 *
 * NOTHING IS DISCARDED. This is not pruning. Every parse the classic chart
 * represents is still represented; it merely stops being enumerated. A pruning
 * damper was considered and rejected: it can only act on molecules that already
 * exist, and once a reading is dropped a missing grammar rule and a discarded
 * reading look identical.
 */
import { BONDS, LIFTS, atomsFor } from './compose.js';

/**
 * Compose bottom-up over a packed chart.
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {{roots?: string[]}} [options] acceptable root types; defaults to a
 *   complete clause, matching `compose`.
 * @returns {{atoms: object[], molecules: object[], spanning: object[],
 *   stable: object[], events: number}} `events` is how many nodes were ever
 *   enqueued — the termination measurement, exposed so a test can assert the
 *   bound rather than trust it.
 */
export function composePacked(tokens, posMap, options = {}) {
  const roots = options.roots || ['S'];
  const n = (tokens || []).length;
  if (n === 0 || !posMap) {
    return { atoms: [], molecules: [], spanning: [], stable: [], events: 0 };
  }

  /** cell[from][to] = Map<category, Node>. One node per category, never more. */
  const cell = Array.from({ length: n }, () => Array.from({ length: n }, () => new Map()));
  const agenda = [];
  let events = 0;

  /**
   * THE WAKE RULE. A derivation for a category the cell already has is
   * recorded and broadcasts NOTHING — the span is no more reachable than it
   * was, so no neighbour can newly combine with it. Only a genuinely new
   * category wakes the neighbourhood, which is what bounds the agenda by
   * spans x categories regardless of how ambiguous the sentence is.
   */
  const offer = (from, to, type, derivation) => {
    const existing = cell[from][to].get(type);
    if (existing) { existing.derivations.push(derivation); return; }
    const node = { type, from, to, derivations: [derivation], token: null };
    cell[from][to].set(type, node);
    agenda.push(node);
    events += 1;
  };

  const atoms = [];
  for (let i = 0; i < n; i += 1) {
    for (const a of atomsFor(tokens[i], i, posMap)) {
      // Two atoms of the same type at the same position ARE the same node.
      if (cell[i][i].has(a.type)) continue;
      const node = { type: a.type, from: i, to: i, derivations: [], token: a.token };
      cell[i][i].set(a.type, node);
      atoms.push(node);
      agenda.push(node);
      events += 1;
    }
  }

  while (agenda.length > 0) {
    const node = agenda.pop();

    // Unary lifts occupy the same span, so they are offered like any other
    // derivation. A lift onto a category the cell already has adds a
    // derivation and stops — which is why no identity guard is needed here,
    // unlike `closeUnderLifts` in compose.js.
    for (const [src, dst] of LIFTS) {
      if (node.type !== src) continue;
      offer(node.from, node.to, dst, { lift: dst, child: node });
    }

    // This node as the LEFT half of a bond. Snapshot the neighbour cell before
    // iterating: `offer` can insert into a cell we are walking.
    if (node.to + 1 < n) {
      for (let k = node.to + 1; k < n; k += 1) {
        for (const right of [...cell[node.to + 1][k].values()]) {
          for (const bond of BONDS) {
            if (node.type !== bond[0] || right.type !== bond[1]) continue;
            offer(node.from, k, bond[2], { bond, left: node, right });
          }
        }
      }
    }

    // This node as the RIGHT half. A neighbour created after this node was
    // dequeued will pair with it when that neighbour is itself dequeued, so
    // no combination is missed by processing order.
    if (node.from - 1 >= 0) {
      for (let j = 0; j <= node.from - 1; j += 1) {
        for (const left of [...cell[j][node.from - 1].values()]) {
          for (const bond of BONDS) {
            if (left.type !== bond[0] || node.type !== bond[1]) continue;
            offer(j, node.to, bond[2], { bond, left, right: node });
          }
        }
      }
    }
  }

  const molecules = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i; j < n; j += 1) {
      for (const node of cell[i][j].values()) molecules.push(node);
    }
  }
  const spanning = [...cell[0][n - 1].values()];
  const stable = spanning.filter((m) => roots.includes(m.type));

  return { atoms, molecules, spanning, stable, events };
}
