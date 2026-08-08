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

/**
 * Every head this node can have, across all its derivations.
 *
 * The classic `headOf` returns ONE head because it walks one concrete tree.
 * A packed node stands for many trees at once, so the honest return is a set.
 * Its size is the ambiguity that actually matters — measured at a mean of 1.54
 * distinct answers while parses reached 32.02, which is why this stays cheap.
 *
 * The DET rule matches `compose.js`: `headOf` takes `parts[1]` when an NP was
 * built from a determiner, and `parts[0]` otherwise.
 *
 * THIS IS DELIBERATELY BUG-COMPATIBLE WITH `compose.js`. `['ADJ', 'N', 'N']`
 * composes `old man` with `old` as `parts[0]`, and the unqualified default
 * takes `parts[0]`, so `headsOf` reports the head of "the old man" as `old`
 * — the same wrong answer `compose.js`'s own `headOf` gives. That is a known
 * defect (it understates containment on every prenominal-adjective subject),
 * and the fix belongs in `compose.js`, where both charts inherit it, not
 * here: Task 5 proves this module equivalent to the classic chart across a
 * large sentence set, and that proof is what licenses using this chart in
 * place of the classic one. A unilateral improvement here would make every
 * divergence something to manually excuse, which is exactly the condition
 * under which a real packing bug hides among the expected ones.
 *
 * @param {object} node
 * @param {Map<object, Set<string>>} [memo] shared across a traversal
 * @returns {Set<string>}
 */
export function headsOf(node, memo = new Map()) {
  if (!node) return new Set();
  const cached = memo.get(node);
  if (cached) return cached;

  /**
   * A lift chain could in principle cycle. It cannot today — LIFTS is
   * N->NP, V->VP, PRON->NP, PROPN->NP, PRONACC->NPO, VP->S, which is acyclic —
   * so this guard is defensive, and memoising is safe while it holds. A cycle
   * contributes nothing rather than recursing forever.
   */
  memo.set(node, new Set());

  const out = new Set();
  if (node.derivations.length === 0) {
    if (node.token != null) out.add(node.token);
  } else {
    for (const d of node.derivations) {
      if (d.lift) {
        for (const h of headsOf(d.child, memo)) out.add(h);
        continue;
      }
      const source = node.type === 'NP' && d.left.type === 'DET' ? d.right : d.left;
      for (const h of headsOf(source, memo)) out.add(h);
    }
  }
  memo.set(node, out);
  return out;
}

/**
 * The distinct `{subject, verb}` answers a root node stands for.
 *
 * The classic pipeline builds every parse and then projects each to an answer,
 * discarding the distinction it spent exponential work to produce. This reads
 * the answer set straight off the forest and never builds a tree.
 *
 * A single-child derivation is the VP->S lift, which is the imperative: the
 * subject is genuinely absent and projects as null rather than as an invented
 * `you`.
 *
 * @param {object} node a root node, or undefined
 * @param {Map<object, Set<string>>} [memo]
 * @returns {Array<{subject: string|null, verb: string}>}
 */
export function projectAnswers(node, memo = new Map()) {
  if (!node) return [];
  const byKey = new Map();
  for (const d of node.derivations) {
    if (d.lift) {
      for (const verb of headsOf(d.child, memo)) {
        byKey.set(`|${verb}`, { subject: null, verb });
      }
      continue;
    }
    for (const subject of headsOf(d.left, memo)) {
      for (const verb of headsOf(d.right, memo)) {
        byKey.set(`${subject}|${verb}`, { subject, verb });
      }
    }
  }
  return [...byKey.values()];
}
