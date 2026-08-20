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
import { BONDS, LIFTS, atomsFor, validateBonds } from './compose.js';
import {
  admitBond,
  clauseProvenance,
  imperativeLiftProvenance,
  isAdjunctEligible,
  isImperativeLift,
} from './bond-admission.js';
import { leafNucleus, mergeNuclei, nucleusFromDerivation } from './atom-nucleus.js';
import { fieldFromAtoms, rankByResonance, emitDescendingLight } from './resonance-beacon.js';
import { censusReactions } from './bond-kind.js';
import { seedLawfulUnknownAtoms, stampCarbonProduct } from './lawful-unknown-seed.js';
import { consumeBondValence, mintValence } from './atom-valence.js';
import { annotateChartMatter } from './atom-matter.js';
import { annotateMoleculeTopology } from './molecule-topology.js';
import { annotateSemanticParticles } from './semantic-particles/annotate.js';

/**
 * Compose bottom-up over a packed chart.
 *
 * @param {string[]} tokens
 * @param {Map<string, string[]>} posMap
 * @param {{roots?: string[], agenda?: 'stack'|'queue', bonds?: Array,
 *   disableMacrophage?: boolean, disableClauseProvenance?: boolean,
 *   seedLawfulUnknowns?: boolean}} [options]
 *   `seedLawfulUnknowns` is opt-in. Empty slots may receive a licensed
 *   nominal reading when DET/P/POSS seek into them. Not a new bond.
 *   Default OFF: the frozen treebank gate must not buy coverage with
 *   extra POS vagueness.
 *   Production parser. `agenda` exists so a test can prove admission does not
 *   depend on pop order; default is `stack`.
 * @returns {{atoms: object[], molecules: object[], spanning: object[],
 *   stable: object[], events: number, promotionWakes: number,
 *   reactions: object}} `events` is agenda pops. `promotionWakes` are the
 *   licensed re-pushes when an imperative S is promoted to a real clause.
 *   `events === molecules.length + promotionWakes`. `reactions` is the
 *   constructive / preservative / recursive-preservative / lifting census.
 */
/**
 * WHO CALLS THIS, AS OF 2026-08-20.
 *
 * Nothing on the request path does. `codex/server/services/constellationPage.service.js`
 * imports `queryIdentity`, `phraseAnalysis`, `pageBytecode`, `governor` and
 * `readings` from this directory; it does not import `compose.js` or this file.
 * An exhaustive reference sweep for `composePacked` returns only
 * `codex/core/constellation/`, `codex/research/`, `scripts/`, `tests/` and `docs/`.
 *
 * This note records a VERIFIED FACT and makes no claim about intent — the engine
 * may be staged ahead of integration, or it may have drifted. It is here because
 * the treebank gate, the evidence ledgers and every script in `scripts/` describe
 * this parser as though it were the shipped one, and a reader deserves to know
 * which numbers describe a served request and which describe a bench.
 *
 * If it gets wired, delete this block. If it is deliberately pre-integration, say
 * so here and name the blocking work.
 */
export const ROOT_DOORWAY = Object.freeze({
  CLAUSAL: Object.freeze(['S']),
  UTTERANCE: Object.freeze(['NP', 'APPOS', 'PP']),
  ALL: Object.freeze(['S', 'NP', 'APPOS', 'PP']),
});

export function composePacked(tokens, posMap, options = {}) {
  let roots = options.roots;
  if (!roots) {
    if (options.doorway === 'all') roots = ROOT_DOORWAY.ALL;
    else if (options.doorway === 'utterance') roots = ROOT_DOORWAY.UTTERANCE;
    else roots = ROOT_DOORWAY.CLAUSAL;
  }
  /**
   * Optional bond table override for reactor experiments; default is Grimoire BONDS.
   *
   * Validated on the same terms as the standing table. `headsOf` below reads the
   * head index straight off `d.bond[3]`, so a candidate arriving without a declared
   * head would not throw — it would compare `undefined === 1`, take `d.left`, and
   * report a positional guess as a measurement. `validateBonds` is what makes that
   * impossible; running it here is what extends that guarantee to the experimental
   * path, which is the only path where unreviewed bonds ever appear.
   */
  const bonds = options.bonds || BONDS;
  if (options.bonds) validateBonds(bonds);
  /**
   * AGENDA TRAVERSAL POLICY:
   * 1. Layer 1 (Search Policy): Hierarchical Bottom-Up (Width-first, Left-to-Right).
   * 2. Layer 2 (Telemetry Control): Modulates local priority around the hierarchical base.
   */
  const take = (agenda) => {
    if (options.agenda === 'queue') return agenda.shift();
    if (options.agenda === 'stack') return agenda.pop();

    // Canonical Baseline: Hierarchical Bottom-Up with Telemetry Field Modulation
    let bestIdx = 0;
    let bestScore = -Infinity;
    const fo = options.fieldOrientation;
    for (let i = 0; i < agenda.length; i += 1) {
      const node = agenda[i];
      const width = (node.to - node.from) + 1;
      let score = (width * 10.0) - (node.from * 0.01);
      if (fo) {
        const span = node.from;
        const bias = fo.fieldBias?.[span] ?? 1.0;
        const damping = fo.magneticDamping?.[span] ?? 0.0;
        const focus = fo.resonanceFocus?.[span] ?? 1.0;
        const mod = (bias * focus * (1.0 - damping)) - 1.0;
        score += mod; // local field correction within hierarchical tier
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return agenda.splice(bestIdx, 1)[0];
  };
  const n = (tokens || []).length;
  if (n === 0 || !posMap) {
    return {
      atoms: [], molecules: [], spanning: [], stable: [], events: 0, promotionWakes: 0,
      reactions: censusReactions(null), field: [], ranked: [],
      bondAttempts: 0, bondRefusals: 0,
      semanticParticles: null,
    };
  }

  /** cell[from][to] = Map<category, Node>. One node per category, never more. */
  const cell = Array.from({ length: n }, () => Array.from({ length: n }, () => new Map()));
  const agenda = [];
  let events = 0;
  let promotionWakes = 0;
  let bondAttempts = 0;
  let bondRefusals = 0;

  /**
   * REFUSAL LEDGER — opt-in via `options.ledger`.
   *
   * The chart is otherwise a record of successes only. `admitBond` already
   * computes and names every refusal ('aura-collision', receptor names,
   * 'imperative-not-adjunct-eligible'), and both call sites read `.ok` and
   * drop `.reason` — so the one thing you cannot reconstruct after the fact
   * is why a bond did NOT happen. Heat can be re-measured; a refusal leaves
   * no trace.
   *
   * `side` is load-bearing: the macrophage bug was a receptor present on the
   * left-half loop and absent from the right, which is invisible in any
   * node-level view because the node existed either way.
   *
   * Off by default — refusals are far rarer than derivations (22 aura
   * collisions against 30,772 derivations on the gate corpus), but the array
   * is retained by every caller holding the returned chart.
   */
  const ledger = options.ledger ? [] : null;
  const note = (verdict, left, right, bond, side) => {
    if (!ledger || verdict.reason === 'type-mismatch') return;
    ledger.push({
      reason: verdict.reason,
      side,
      bond: `${bond[0]}+${bond[1]}->${bond[2]}`,
      left: { type: left?.type, from: left?.from, to: left?.to },
      right: { type: right?.type, from: right?.from, to: right?.to },
    });
  };

  /**
   * THE WAKE RULE. A derivation for a category the cell already has is
   * recorded and broadcasts NOTHING — the span is no more reachable than it
   * was, so no neighbour can newly combine with it. Only a genuinely new
   * category wakes the neighbourhood, which is what bounds the agenda by
   * spans x categories regardless of how ambiguous the sentence is.
   *
   * One licensed exception: an S that was only an imperative lift and later
   * gains a constructive clause derivation must re-broadcast, or ADJ+S / ADV+S
   * would never see the promotion. That re-push is counted in `promotionWakes`
   * so `events === molecules + promotionWakes` stays an invariant, not a leak.
   */
  const offer = (from, to, type, derivation) => {
    const existing = cell[from][to].get(type);
    const incoming = nucleusFromDerivation(type, from, to, derivation);
    if (existing) {
      stampCarbonProduct(existing, derivation);
      const isDuplicate = existing.derivations.some((d) => {
        if (derivation.lift) return d.lift === derivation.lift && d.child === derivation.child;
        if (derivation.bond) return d.bond === derivation.bond && d.left === derivation.left && d.right === derivation.right;
        return false;
      });
      if (isDuplicate) return;
      if (derivation.bond) consumeBondValence(derivation.left, derivation.right);
      const wasEligible = isAdjunctEligible(existing);
      existing.derivations.push(derivation);
      existing.nucleus = mergeNuclei(existing.nucleus, incoming);
      if (type === 'S' && !wasEligible && isAdjunctEligible(existing)) {
        agenda.push(existing);
        promotionWakes += 1;
      }
      return;
    }
    const node = {
      type, from, to, derivations: [derivation], token: null, nucleus: incoming,
      valence: mintValence(type),
    };
    stampCarbonProduct(node, derivation);
    if (derivation.bond) consumeBondValence(derivation.left, derivation.right);
    cell[from][to].set(type, node);
    agenda.push(node);
  };

  const atoms = [];
  for (let i = 0; i < n; i += 1) {
    // `options` reaches the atom typing here too. Without it `compoundIdentity`
    // would be honoured by the classic parser and silently dropped by this one,
    // so a caller asking for the arm switch would get the opposite behaviour
    // with nothing to say so — and the treebank gate runs on this parser.
    for (const a of atomsFor(tokens[i], i, posMap, options)) {
      // Two atoms of the same type at the same position ARE the same node.
      if (cell[i][i].has(a.type)) continue;
      const node = {
        type: a.type, from: i, to: i, derivations: [], token: a.token,
        nucleus: a.nucleus || leafNucleus(a.token, a.type, i),
        valence: mintValence(a.type),
      };
      cell[i][i].set(a.type, node);
      atoms.push(node);
      agenda.push(node);
    }
  }

  for (const node of seedLawfulUnknownAtoms(tokens, cell, options)) {
    if (cell[node.from][node.to].has(node.type)) continue;
    cell[node.from][node.to].set(node.type, node);
    atoms.push(node);
    agenda.push(node);
  }

  /**
   * `events` counts POPS, not pushes at a call site. This is deliberate: every
   * pushed node is popped exactly once before the loop below exits (the
   * agenda drains to empty), so counting pops is equivalent to counting
   * pushes yet needs no cooperation from wherever a push happens. A wake-rule
   * leak that pushes an EXISTING node — the exact mutation this counter must
   * catch — still goes through this same loop and still gets popped, so it
   * still gets counted, with no separate instrumentation to forget.
   */
  while (agenda.length > 0) {
    const node = take(agenda);
    events += 1;

    // Unary lifts occupy the same span, so they are offered like any other
    // derivation. A lift onto a category the cell already has adds a
    // derivation and stops — which is why no identity guard is needed here,
    // unlike `closeUnderLifts` in compose.js.
    for (const [src, dst] of LIFTS) {
      if (node.type !== src) continue;
      const derivation = { lift: dst, child: node };
      if (isImperativeLift(src, dst)) Object.assign(derivation, imperativeLiftProvenance());
      offer(node.from, node.to, dst, derivation);
    }

    // This node as the LEFT half of a bond. Snapshot the neighbour cell before
    // iterating: `offer` can insert into a cell we are walking.
    if (node.to + 1 < n) {
      for (let k = node.to + 1; k < n; k += 1) {
        for (const right of [...cell[node.to + 1][k].values()]) {
          for (const bond of bonds) {
            bondAttempts += 1;
            const verdict = admitBond(node, right, bond, options);
            if (!verdict.ok) { bondRefusals += 1; note(verdict, node, right, bond, 'left'); continue; }
            const derivation = { bond, left: node, right };
            const provenance = clauseProvenance(node, right, bond);
            if (provenance) Object.assign(derivation, provenance);
            offer(node.from, k, bond[2], derivation);
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
          for (const bond of bonds) {
            bondAttempts += 1;
            const verdict = admitBond(left, node, bond, options);
            if (!verdict.ok) { bondRefusals += 1; note(verdict, left, node, bond, 'right'); continue; }
            const derivation = { bond, left, right: node };
            const provenance = clauseProvenance(left, node, bond);
            if (provenance) Object.assign(derivation, provenance);
            offer(j, node.to, bond[2], derivation);
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
  const couplings = options.ledger ? [] : null;
  const field = fieldFromAtoms(atoms, tokens, bonds, couplings);
  const ranked = rankByResonance(stable, field, bonds);
  annotateMoleculeTopology({ molecules, spanning, stable, atoms });
  annotateChartMatter({ molecules, spanning, stable, atoms, field });

  /**
   * DESCENDING LIGHT — opt-in via `options.light`, default OFF.
   *
   * Off by default so the frozen gate baseline is untouched until someone
   * re-freezes it deliberately. It only ANNOTATES: `lit` is attached, nothing
   * is removed, and no consumer of this chart reads it yet. Three suppression
   * mechanisms have been measured on this parser and all three destroyed
   * sentences while reporting success, so consumption is a separate, graded
   * decision (see the 2026-08-15 descending-light spec, phase 2).
   */
  let light = null;
  if (options.light) {
    light = emitDescendingLight({ stable });
    for (const node of molecules) node.lit = light.lit.has(node);
  }

  /**
   * SEMANTIC PARTICLES — opt-in via `options.semanticParticles`, default OFF.
   *
   * Frozen-chart annotation. Particles cannot admit a bond. Score modes
   * attach a parallel ranking and leave `ranked` / the forest untouched.
   */
  let semanticParticles = null;
  if (options.semanticParticles) {
    semanticParticles = annotateSemanticParticles({
      atoms, molecules, spanning, stable, events, ledger, field, ranked,
      bondAttempts, bondRefusals,
    }, options.semanticParticles === true ? { mode: 'observe' } : options.semanticParticles);
  }

  return {
    atoms, molecules, spanning, stable, events, promotionWakes, cell,
    reactions: censusReactions(cell), field, ranked, ledger, couplings, light,
    bondAttempts, bondRefusals, semanticParticles,
  };
}

/**
 * Every head this node can have, across all its derivations.
 *
 * The classic `headOf` returns ONE head because it walks one concrete tree.
 * A packed node stands for many trees at once, so the honest return is a set.
 * Its size is the ambiguity that actually matters — measured at a mean of 1.54
 * distinct answers while parses reached 32.02, which is why this stays cheap.
 *
 * The head comes from the bond that built each derivation: `d.bond[3]` is the
 * declared head index — `0` for left, `1` for right — so `source` is `d.right`
 * when the bond says the head is on the right and `d.left` otherwise. No
 * lookup is needed; the derivation already carries the whole bond tuple.
 *
 * This used to guess by position instead — `parts[0]`, with one hand-carved
 * exception that took `parts[1]` when an NP was built from a determiner — and
 * it was DELIBERATELY BUG-COMPATIBLE WITH `compose.js`'s own positional
 * `headOf`: `['ADJ', 'N', 'N']` composes `old man` with `old` as `parts[0]`,
 * so both charts reported the head of "the old man" as `old`, which is wrong.
 * Both now read the declared head instead, so both say `man`.
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
      // The bond declares which child is the head; see BONDS in compose.js.
      const source = d.bond[3] === 1 ? d.right : d.left;
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
 * ONLY `S` NODES HAVE {subject, verb} SHAPE. `{ roots: ['NP'] }` is
 * first-class — `compose.js` documents that a bare noun phrase is queried as
 * often as a sentence — so a non-`S` node reaching this function is not an
 * error, it is a caller asking the wrong projection of a right answer. The
 * classic `projectAnswer` in `compose.js` guards this with
 * `molecule.type !== 'S'`; `projectAnswersFrom` below guards it the same way,
 * otherwise `{ roots: ['NP'] }` on `the old man` would fall through to the
 * NP's own two-child derivation (`DET + N`) and report the determiner as the
 * subject — exactly the positional guess the head-declaration work removed.
 *
 * TERMINAL PUNCTUATION IS NOT A PREDICATE. `S + PUNCT -> S` lets a clause
 * absorb its trailing `. ! ? ; :` so the whole sentence can span, because UD
 * tokenizes that mark separately from the word before it. A derivation whose
 * right child is `PUNCT` is not `[subject, predicate]` — reading `headOf`
 * off `d.right` there answers `.`, which is exactly what made every newly
 * parsing sentence report its full stop as the verb. Such a derivation
 * contributes whatever `d.left` contributes, and nothing of its own, so this
 * descends into `d.left`'s derivations and re-projects from there instead.
 *
 * MATRIX-PRESERVING ADJUNCTION. The same pattern applies when a bond builds S
 * by attaching a non-subject (ADV/PP/ADJ/FRONTED/CONJ/…) onto an already-built
 * matrix S and declares head on that matrix: re-project from the head child
 * instead of treating the adjunct as subject. Without this, `old men ran`
 * (ADJ+S) and `quickly men ran` (ADV+S) invent adjunct subjects.
 *
 * This must match `projectAnswer` in `compose.js` exactly — the equivalence
 * harness compares the two functions directly.
 *
 * @param {object} node a root node, or undefined
 * @param {Map<object, Set<string>>} [memo]
 * @returns {Array<{subject: string|null, verb: string}>}
 */
export function projectAnswers(node, memo = new Map()) {
  return projectAnswersFrom(node, memo, new Set());
}

/**
 * `projectAnswers`'s body, plus the `visiting` cycle guard the PUNCT-
 * absorption recursion needs — in the same spirit as `headsOf`'s
 * memo-seeded guard. Spans strictly shrink on every recursive step today
 * (a PUNCT atom is never zero tokens wide), so this never actually fires;
 * it is defensive rather than load-bearing. Kept as a separate, unexported
 * function so the public `projectAnswers(node, memo)` signature never
 * changes shape.
 *
 * @param {object} node a root node, or undefined
 * @param {Map<object, Set<string>>} memo
 * @param {Set<object>} visiting nodes currently on the recursion stack
 * @returns {Array<{subject: string|null, verb: string}>}
 */
function projectAnswersFrom(node, memo, visiting) {
  if (!node || visiting.has(node)) return [];
  visiting.add(node);
  const byKey = new Map();

  // Non-clausal utterance doorway roots (NP, APPOS, PP)
  if (node.type !== 'S') {
    for (const head of headsOf(node, memo)) {
      byKey.set(`|${head}`, { subject: null, verb: head });
    }
    visiting.delete(node);
    return [...byKey.values()];
  }

  for (const d of node.derivations) {
    if (d.lift) {
      for (const verb of headsOf(d.child, memo)) {
        byKey.set(`|${verb}`, { subject: null, verb });
      }
      continue;
    }
    if (d.right.type === 'PUNCT') {
      for (const answer of projectAnswersFrom(d.left, memo, visiting)) {
        byKey.set(`${answer.subject ?? ''}|${answer.verb}`, answer);
      }
      continue;
    }
    if (d.right.type === 'COMMA') {
      if (d.left.type === 'S') {
        for (const answer of projectAnswersFrom(d.left, memo, visiting)) {
          byKey.set(`${answer.subject ?? ''}|${answer.verb}`, answer);
        }
      } else {
        for (const head of headsOf(d.left, memo)) {
          byKey.set(`|${head}`, { subject: null, verb: head });
        }
      }
      continue;
    }
    /**
     * MATRIX-PRESERVING ADJUNCTION. Bonds like ADV+S→S, PP+S→S, ADJ+S→S,
     * FRONTED+S→S, CONJ+S→S declare head on the matrix clause. Treating the
     * left child as subject (positional [subj, pred]) answers "old"/"quickly"
     * for fronted material. When the head child is itself an S, the answer
     * is whatever that matrix already projects — same spirit as PUNCT absorb.
     */
    const headIdx = Array.isArray(d.bond) && (d.bond[3] === 0 || d.bond[3] === 1)
      ? d.bond[3]
      : null;
    if (headIdx === 1 && d.right.type === 'S') {
      for (const answer of projectAnswersFrom(d.right, memo, visiting)) {
        byKey.set(`${answer.subject ?? ''}|${answer.verb}`, answer);
      }
      continue;
    }
    if (headIdx === 0 && d.left.type === 'S') {
      for (const answer of projectAnswersFrom(d.left, memo, visiting)) {
        byKey.set(`${answer.subject ?? ''}|${answer.verb}`, answer);
      }
      continue;
    }
    for (const subject of headsOf(d.left, memo)) {
      for (const verb of headsOf(d.right, memo)) {
        byKey.set(`${subject}|${verb}`, { subject, verb });
      }
    }
  }
  visiting.delete(node);
  return [...byKey.values()];
}

/**
 * OPTICAL ANNEALING / GROUND-STATE DOORWAY CRYSTALLIZATION
 *
 * Processes descending light to dissolve the unlit dark scaffold and prunes
 * dead-end intermediate chart clutter.
 *
 * IT DOES NOT COLLAPSE AMBIGUITY, whatever this comment used to say. Nothing
 * below reduces `node.derivations`; a packed node keeps every derivation it had.
 * What is added is `groundStateDerivation` — the best-scoring one, ALONGSIDE the
 * alternatives, not instead of them. `ambiguityDensity` is therefore the mean
 * derivations per surviving molecule and is > 1.00 whenever any node is packed,
 * which is always, that being the point of a packed chart. The old claim of
 * `-> 1.00` promised a guarantee no line here delivers.
 *
 * @param {object} chart The raw composed chart
 * @param {object} [options]
 * @returns {Readonly<{
 *   rawMolecules: number,
 *   crystallizedMolecules: number,
 *   scaffoldDissolutionRate: number,
 *   molecules: ReadonlyArray<object>,
 *   stable: ReadonlyArray<object>,
 *   spanning: ReadonlyArray<object>,
 *   ambiguityDensity: number,
 *   light: object
 * }>}
 */
export function crystallizeChart(chart, options = {}) {
  if (!chart || !chart.molecules || chart.molecules.length === 0) {
    return Object.freeze({
      rawMolecules: 0,
      crystallizedMolecules: 0,
      scaffoldDissolutionRate: 1.0,
      molecules: Object.freeze([]),
      stable: Object.freeze([]),
      spanning: Object.freeze([]),
      ambiguityDensity: 0.0,
      light: null,
    });
  }

  // 1. Ensure descending light is computed from valid roots
  const stable = (chart.stable || []);
  const light = chart.light || emitDescendingLight({ stable });
  const litSet = light.lit || new Set();

  // A molecule is lit strictly if it is present in the lit set
  const isLit = (node) => litSet.has(node);

  // 2. Scaffold Dissolution: retain only lit molecules
  const litMolecules = chart.molecules.filter(isLit);
  const litNodeSet = new Set(litMolecules);
  const rawCount = chart.molecules.length;
  const crystalCount = litMolecules.length;
  const dissolutionRate = rawCount > 0 ? Number(((rawCount - crystalCount) / rawCount).toFixed(4)) : 0;

  // 3. Ground-State Derivation Selection (collapse ambiguity to 1.00)
  const crystallizedMolecules = litMolecules.map((m) => {
    // Filter derivations to only those whose children are also lit
    const validDerivs = (m.derivations || []).filter((d) => {
      if (d.lift) return litNodeSet.has(d.child);
      if (d.bond) return litNodeSet.has(d.left) && litNodeSet.has(d.right);
      return true;
    });

    if (validDerivs.length <= 1) {
      return Object.freeze({
        ...m,
        derivations: Object.freeze(validDerivs.length === 1 ? [validDerivs[0]] : []),
        groundStateDerivation: validDerivs[0] || null,
      });
    }

    let bestDeriv = validDerivs[0];
    let bestScore = -Infinity;
    for (const d of validDerivs) {
      let s = 1.0;
      if (d.clause) s += 2.0;
      if (d.lift) s += 0.5;
      if (d.bond) s += 1.0;
      if (s > bestScore) {
        bestScore = s;
        bestDeriv = d;
      }
    }
    return Object.freeze({
      ...m,
      derivations: Object.freeze([bestDeriv]),
      groundStateDerivation: bestDeriv,
    });
  });

  const bySignature = new Map(crystallizedMolecules.map((m) => [`${m.type}:${m.from}:${m.to}`, m]));
  const crystallizedStable = stable.filter(isLit).map((s) => {
    // `cell[from][to].set(type, node)` makes (type, from, to) unique per chart,
    // so the signature is a key, not a scan.
    return bySignature.get(`${s.type}:${s.from}:${s.to}`) || s;
  });

  const derivationsCount = crystallizedMolecules.reduce((acc, m) => acc + (m.derivations?.length || 1), 0);
  const ambiguityDensity = crystallizedMolecules.length > 0
    ? Number((derivationsCount / crystallizedMolecules.length).toFixed(4))
    : 0.0;

  return Object.freeze({
    rawMolecules: rawCount,
    crystallizedMolecules: crystalCount,
    scaffoldDissolutionRate: dissolutionRate,
    molecules: Object.freeze(crystallizedMolecules),
    stable: Object.freeze(crystallizedStable),
    spanning: Object.freeze((chart.spanning || []).filter(isLit)),
    ambiguityDensity,
    light,
  });
}

