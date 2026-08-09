/**
 * THE REACTOR — one measurement surface for every bond simulation.
 *
 * Four scripts used to carry four private copies of `measure`. When the copies
 * drift, two evidence notes stop being comparable and the drift is invisible.
 * This module is the single scorer; scripts only choose slates and print.
 *
 * A gate is only a gate if something can fail it. `improves()` alone cannot
 * discriminate — on a 22%-covered chart almost any glue law raises root/coverage
 * — so callers pair it with `construction-families.js` purity and a shuffled
 * control arm that calibrates the bar.
 *
 * PURE AND ZERO-I/O. Callers supply parsed records and the POS map.
 *
 * @module codex/core/constellation/grimoire/reactor
 */

import { composePacked, projectAnswers } from '../compose-packed.js';
import { LIFTS } from '../compose.js';
import { goldAnswer } from '../treebank.js';

const lc = (x) => String(x ?? '').toLowerCase();

const sameAnswer = (a, g) =>
  a && g && lc(a.subject) === lc(g.subject) && lc(a.verb) === lc(g.verb);

/**
 * Gold subtree extents, 0-based and marked for contiguity.
 * Only contiguous subtrees are chart-buildable, so only those are scoreable.
 *
 * @param {Array<{id: number, head: number}>} tokens UD tokens (1-based ids)
 * @returns {Map<number, {min: number, max: number, size: number, contiguous: boolean}>}
 */
export function subtreeSpans(tokens) {
  const children = new Map();
  for (const t of tokens) {
    if (!children.has(t.head)) children.set(t.head, []);
    children.get(t.head).push(t.id);
  }
  const spans = new Map();
  const visit = (id) => {
    if (spans.has(id)) return spans.get(id);
    let min = id - 1;
    let max = id - 1;
    let size = 1;
    for (const c of children.get(id) || []) {
      const s = visit(c);
      if (s.min < min) min = s.min;
      if (s.max > max) max = s.max;
      size += s.size;
    }
    const out = { min, max, size, contiguous: max - min + 1 === size };
    spans.set(id, out);
    return out;
  };
  for (const t of tokens) visit(t.id);
  return spans;
}

/**
 * Score a bond set over a treebank split.
 *
 * EVENTS BUDGET. A candidate that detonates the chart costs minutes per DEV
 * pass, and `protectOk` then rejects it for exactly that. Pass
 * `{ eventsBudget }` — normally `base.meanEvents * 1.5 * records.length`, the
 * events floor itself — and the sweep aborts as soon as cumulative agenda
 * activity exceeds it. The verdict is preserved rather than guessed: once the
 * running total is past `1.5 × baseline total`, the final total can only be
 * larger, so the final mean *must* breach the same floor. Aborting early cannot
 * turn a passing trial into a failing one.
 *
 * @param {object[]} records conllu records
 * @param {Map<string, string[]>} posMap
 * @param {ReadonlyArray<[string, string, string, 0|1]>} bonds
 * @param {{eventsBudget?: number}} [options]
 * @returns {{n: number, parsed: number, coverage: number, spanRecall: number,
 *   nsubjRecall: number, rootBuilt: number, rootGold: number, rootRecall: number,
 *   goldInEnsemble: number, scoreable: number, ensembleRate: number,
 *   meanEvents: number, maxEvents: number, meanMolecules: number,
 *   threw: boolean}}
 */
export function measure(records, posMap, bonds, options = {}) {
  const eventsBudget = options.eventsBudget ?? Infinity;
  let n = 0;
  let parsed = 0;
  let goldContig = 0;
  let goldBuilt = 0;
  let nsubjG = 0;
  let nsubjB = 0;
  let rootG = 0;
  let rootB = 0;
  let scoreable = 0;
  let inEnsemble = 0;
  let eventsSum = 0;
  let eventsMax = 0;
  let moleculesSum = 0;

  for (const rec of records) {
    n += 1;
    const tokens = rec.tokens.map((t) => t.form);
    let chart;
    try {
      chart = composePacked(tokens, posMap, { bonds });
    } catch {
      // A throw is catastrophic explosion / death, scored as the worst case.
      return {
        n, parsed: 0, coverage: 0, spanRecall: 0, nsubjRecall: 0,
        rootBuilt: 0, rootGold: 0, rootRecall: 0, goldInEnsemble: 0, scoreable: 0,
        ensembleRate: 0, meanEvents: Infinity, maxEvents: Infinity,
        meanMolecules: Infinity, threw: true,
      };
    }
    eventsSum += chart.events;
    moleculesSum += chart.molecules.length;
    if (chart.events > eventsMax) eventsMax = chart.events;

    if (eventsSum > eventsBudget) {
      // Past the events floor already; the remaining sentences can only add.
      return {
        n, parsed, coverage: parsed / Math.max(n, 1),
        spanRecall: 0, nsubjRecall: 0,
        rootBuilt: 0, rootGold: 0, rootRecall: 0, goldInEnsemble: 0, scoreable: 0,
        ensembleRate: 0, meanEvents: Infinity, maxEvents: eventsMax,
        meanMolecules: Infinity, threw: false, budgetExceeded: true,
      };
    }

    const spans = subtreeSpans(rec.tokens);
    const cells = new Set(chart.molecules.map((m) => `${m.from}:${m.to}`));
    for (const t of rec.tokens) {
      const sp = spans.get(t.id);
      if (!sp?.contiguous) continue;
      goldContig += 1;
      if (cells.has(`${sp.min}:${sp.max}`)) goldBuilt += 1;
      if (t.deprel === 'nsubj' || t.deprel === 'nsubj:pass') {
        nsubjG += 1;
        if (cells.has(`${sp.min}:${sp.max}`)) nsubjB += 1;
      }
      if (t.head === 0) {
        rootG += 1;
        if (cells.has(`${sp.min}:${sp.max}`)) rootB += 1;
      }
    }

    if (!chart.stable.length) continue;
    parsed += 1;
    const gold = goldAnswer(rec);
    if (!rec.tokens.some((t) => t.deprel === 'nsubj' || t.deprel === 'nsubj:pass') || !gold.verb) {
      continue;
    }
    scoreable += 1;
    const answers = chart.stable.flatMap((s) => projectAnswers(s));
    if (answers.some((a) => sameAnswer(a, gold))) inEnsemble += 1;
  }

  return {
    n,
    parsed,
    coverage: parsed / Math.max(n, 1),
    spanRecall: goldBuilt / Math.max(goldContig, 1),
    nsubjRecall: nsubjB / Math.max(nsubjG, 1),
    rootBuilt: rootB,
    rootGold: rootG,
    rootRecall: rootB / Math.max(rootG, 1),
    goldInEnsemble: inEnsemble,
    scoreable,
    ensembleRate: inEnsemble / Math.max(scoreable, 1),
    meanEvents: eventsSum / Math.max(n, 1),
    maxEvents: eventsMax,
    meanMolecules: moleculesSum / Math.max(n, 1),
    threw: false,
    budgetExceeded: false,
  };
}

/**
 * Protect floors — a trial may not degrade span/nsubj recall or detonate the
 * chart. These are safety rails, not evidence of merit.
 */
export function protectOk(base, trial) {
  if (trial.threw) return { ok: false, reasons: ['threw'] };
  if (trial.budgetExceeded) return { ok: false, reasons: ['events-budget'] };
  const reasons = [];
  if (trial.spanRecall < base.spanRecall - 0.005) reasons.push('span-floor');
  if (trial.nsubjRecall < base.nsubjRecall - 0.005) reasons.push('nsubj-floor');
  if (trial.meanEvents > base.meanEvents * 1.5 + 1e-9) reasons.push('events-1.5x');
  const maxCap = Math.max(base.maxEvents * 2, base.maxEvents + 5000);
  if (trial.maxEvents > maxCap) reasons.push('max-events');
  return { ok: reasons.length === 0, reasons };
}

/**
 * Did any headline metric move up?
 *
 * WEAK BY CONSTRUCTION. Nearly every adjacency law passes this on a sparse
 * chart — the 2026-08-08 gap simulation put 16 of 17 candidates through it, and
 * the autopsy then refuted the top four. Never report this as a filter result
 * without the purity gate and control arm beside it.
 */
export function improves(base, trial) {
  const gains = [];
  if (trial.rootBuilt > base.rootBuilt) gains.push(`root+${trial.rootBuilt - base.rootBuilt}`);
  if (trial.goldInEnsemble > base.goldInEnsemble) {
    gains.push(`ens+${trial.goldInEnsemble - base.goldInEnsemble}`);
  }
  if (trial.parsed > base.parsed) gains.push(`cov+${trial.parsed - base.parsed}`);
  return { ok: gains.length > 0, gains };
}

/**
 * Types from which a spanning root is still reachable.
 *
 * Least fixed point of: a root type is productive; T is productive if some bond
 * consumes T and produces a productive result, or some unary lift takes T to a
 * productive type.
 *
 * LIFTS MATTER. `NC` is consumed by no bond at all, but `NC → N → NP` is a unary
 * lift chain, so `NC` reaches `S` and the compound bonds that produce it are
 * live. Omitting lifts reports every NC-producing bond as a dead end.
 *
 * @param {ReadonlyArray<[string, string, string, 0|1]>} bonds
 * @param {ReadonlyArray<[string, string]>} [lifts] unary lifts src → dst
 * @param {string[]} [roots] acceptable spanning types (compose default is ['S'])
 * @returns {Set<string>}
 */
export function productiveTypes(bonds, lifts = LIFTS, roots = ['S']) {
  const productive = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [l, r, res] of bonds) {
      if (!productive.has(res)) continue;
      if (!productive.has(l)) { productive.add(l); grew = true; }
      if (!productive.has(r)) { productive.add(r); grew = true; }
    }
    for (const [src, dst] of lifts) {
      if (productive.has(dst) && !productive.has(src)) { productive.add(src); grew = true; }
    }
  }
  return productive;
}

/**
 * Bonds whose result type no other bond consumes on any path to a root.
 *
 * A dead-end bond CANNOT change coverage or the answer ensemble — its product
 * never reaches a spanning `S`. It can still move span recall and root-built
 * counts, because those score raw `chart.molecules` cells against gold
 * contiguous subtrees, so a dead-end molecule that happens to coincide with a
 * gold constituent scores. That is a cosmetic hit, not participation in a parse.
 *
 * `CONJ+ADJ→CONJADJ` was promoted in a batch of seven while its completion
 * `ADJ+CONJADJ→ADJ` was left out for being NO-GAIN alone. Nothing consumes
 * `CONJADJ`, so the bridge could only ever score cosmetically — which is exactly
 * what its TEST row said (cov Δ0, root Δ0, ens Δ0).
 *
 * @returns {Array<{bond: [string, string, string, 0|1], signature: string, result: string}>}
 */
export function deadEndBonds(bonds, lifts = LIFTS, roots = ['S']) {
  const productive = productiveTypes(bonds, lifts, roots);
  return bonds
    .filter(([, , res]) => !productive.has(res))
    .map((bond) => ({
      bond,
      signature: `${bond[0]}|${bond[1]}|${bond[2]}`,
      head: bond[3],
      result: bond[2],
    }));
}

/**
 * Chart types the grammar actually builds on a corpus.
 *
 * Measured rather than declared, so it cannot drift from `atomsFor` the way a
 * hardcoded atom inventory would.
 */
export function observedTypes(records, posMap, bonds, options = {}) {
  const limit = options.limit ?? Infinity;
  const seen = new Set();
  let n = 0;
  for (const rec of records) {
    if (n >= limit) break;
    n += 1;
    const chart = composePacked(rec.tokens.map((t) => t.form), posMap, { bonds });
    for (const m of chart.molecules) seen.add(m.type);
  }
  return seen;
}

/**
 * Can this candidate fire at all when added alone to the base grammar?
 *
 * A candidate that consumes a type the base grammar never builds is
 * **UNFIREABLE**, not NO-GAIN. The distinction matters: the one-candidate-at-a-
 * time reactor structurally guarantees zero gain for the second half of any
 * two-bond construction, then reports that guarantee as an empirical result.
 *
 * `ADJ+CONJADJ→ADJ` was recorded NO-GAIN in the 2026-08-08 hint simulation
 * because nothing in the 73-bond baseline produced `CONJADJ` — its bridge was a
 * sibling candidate in the same slate. The bridge was promoted, the completion
 * discarded, and the pair left half-built.
 *
 * @param {{left: string, right: string}} cand
 * @param {Set<string>} observed types the base grammar builds
 * @param {Iterable<{result?: string}>} [slate] sibling candidates, which may
 *   supply the missing type if promoted together
 */
export function fireability(cand, observed, slate = []) {
  const fromSlate = new Set([...slate].map((c) => c.result).filter(Boolean));
  const missing = [];
  for (const t of [cand.left, cand.right]) {
    if (!observed.has(t)) missing.push(t);
  }
  const suppliedBySlate = missing.filter((t) => fromSlate.has(t));
  return {
    fireable: missing.length === 0,
    missing,
    suppliedBySlate,
    /** Unfireable alone, but a sibling candidate in this slate would produce it. */
    pairedOnly: missing.length > 0 && suppliedBySlate.length === missing.length,
  };
}

/** Deterministic LCG — control arms must be reproducible from the seed alone. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Shuffled negative controls: bonds drawn from the same type inventory as the
 * real slate, so they can fire, but with no grammatical motivation whatsoever.
 *
 * The controls' survival rate is the calibration of the gate. If junk survives
 * as often as candidates, the gate measured nothing.
 *
 * A CONTROL MUST HAVE THE SAME OPPORTUNITY AS A CANDIDATE. Inputs are drawn from
 * types the grammar actually builds, so the control can fire; results are drawn
 * from `resultTypes` — pass the productive types, or every control that lands on
 * a dead-end result is structurally barred from the coverage gain a real
 * candidate is free to score, and the gate looks sharper than it is.
 *
 * @param {string[]} types chart types observed in the mined charts
 * @param {Set<string>} exclude `left|right|result|head` keys to never emit
 * @param {{count?: number, seed?: number, resultTypes?: string[]}} [options]
 * @returns {Array<{left: string, right: string, result: string, head: 0|1, signature: string, control: true}>}
 */
export function shuffledControls(types, exclude, options = {}) {
  const count = options.count ?? 24;
  const next = rng(options.seed ?? 20260808);
  const pool = [...types];
  const resultPool = options.resultTypes?.length ? [...options.resultTypes] : pool;
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < count && guard < count * 200) {
    guard += 1;
    const left = pool[Math.floor(next() * pool.length)];
    const right = pool[Math.floor(next() * pool.length)];
    const result = resultPool[Math.floor(next() * resultPool.length)];
    const head = next() < 0.5 ? 0 : 1;
    const key = `${left}|${right}|${result}|${head}`;
    if (!left || !right || !result) continue;
    if (seen.has(key) || exclude.has(key)) continue;
    seen.add(key);
    out.push({
      left, right, result, head,
      signature: `${left}|${right}|${result}`,
      law: 'control:shuffled',
      status: 'control',
      rationale: 'Type-shuffled negative control — no grammatical motivation.',
      control: true,
    });
  }
  return out;
}

/**
 * Percentile of a numeric sample (linear interpolation, p in [0,1]).
 * Returns null for an empty sample — an absent bar is not a bar of zero.
 */
export function percentile(values, p) {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  if (xs.length === 1) return xs[0];
  const idx = p * (xs.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (idx - lo);
}
