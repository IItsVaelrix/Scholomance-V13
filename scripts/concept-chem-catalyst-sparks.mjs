#!/usr/bin/env node
/**
 * CATALYST SPARKS — a transmutation test over the Concept Chemistry ledger.
 *
 * The engine's weakness, measured across five questions on 2026-07-30: every
 * verdict lands in a narrow band (0.09–0.51, nothing STABLE) and denials come
 * down to margins like -0.0126. That is a squint, not a result. Nothing ever
 * erupts.
 *
 * A catalyst spark is not another number on that scale. It is a reagent that
 * produces TWO QUALITATIVELY DIFFERENT observable events:
 *
 *   TRANSMUTATION — the vote. A bad idea dosed with a governing law does not
 *                   explode; it BECOMES A DIFFERENT IDEA. Every denial in this
 *                   ledger worked that way: the interlocutor dosed with
 *                   one-producer became second-projection; melanin became the
 *                   interlocutor; gravity became a signed seed. The mixture
 *                   stops pointing at its own product and starts pointing at
 *                   a rival's.
 *
 *                   (Effervescence was tried first and was the wrong concept:
 *                   it measured resistance, which in a bag-of-words space is
 *                   just topical distance. 4 of 9 refuted entries survived it.)
 *
 *   STAINING      — dye in water. The reagent permeates: it bonds with the
 *                   reactants AND the product, spreading through the structure
 *                   and revealing its shape.
 *
 *   INERT         — the tablet in plain water. Nothing happens.
 *
 * MEASUREMENT
 *   The ledger's own products are the assay plate. For a reaction (a,b -> P):
 *     undosed:  which product in the ledger is `a b` closest to?
 *     dosed:    which product is `a b c` closest to, for reagent c?
 *   If dosing moves the mixture off its own product and onto a rival's, the
 *   reagent TRANSMUTED it, and the rival names what the idea should have been.
 *   If it still points at its own product, the idea is STABLE under that law.
 *
 * THE REAGENT PANEL IS DECLARED UP FRONT AND APPLIED UNIFORMLY. Choosing a
 * reagent per reaction would be picking the bridge that gives the wanted
 * answer — the exact failure this whole ledger exists to prevent. Every entry
 * gets the same five reagents, which are this codebase's own laws.
 *
 * THE TEST THIS MUST PASS
 *   LBL-004 (governance-as-gate) is the ledger's recorded ENGINE-WAS-WRONG
 *   entry: scored below the bar, built anyway, works. A useful reagent should
 *   STAIN it.
 *   The seven REFUTED entries must NOT stain. If this mechanism revives
 *   melanin or the interlocutor, the mechanism is wrong and gets deleted.
 */
import { bondEnergy } from '../codex/core/pixelbrain/concept-chemistry.js';
import { buildLedger } from '../codex/core/pixelbrain/calibration/concept-chem-ledger.js';

/**
 * The reagent panel: this codebase's governing laws, stated plainly.
 * Fixed before any result was observed. Applied identically to every entry.
 */
const REAGENTS = Object.freeze([
  { id: 'falsifiability', text: 'a check that cannot fail enforces the defect it was meant to catch' },
  { id: 'one-producer', text: 'one producer and the consumer verifies by string equality and never computes' },
  { id: 'determinism', text: 'every output must be reproducible from a declared seed and declared inputs' },
  { id: 'projection', text: 'a projection carries a chosen subset of producer state across a boundary' },
  { id: 'unimplemented', text: 'a declared but unimplemented feature passes every test while doing nothing' },
]);

const store = buildLedger();
const labels = store.all();

/** Every product in the ledger is a possible identity for a dosed mixture. */
const PLATE = labels.map((l) => ({ id: l.id, product: l.reaction.product }));

/** Which product on the plate is this mixture closest to? */
function nearestProduct(mix) {
  let best = null;
  let bestScore = -Infinity;
  for (const cell of PLATE) {
    const score = bondEnergy(mix, cell.product);
    if (score > bestScore) {
      bestScore = score;
      best = cell;
    }
  }
  return { id: best.id, score: bestScore };
}

function dose(label, reagent) {
  const mix = `${label.reaction.a} ${label.reaction.b}`;
  const undosed = nearestProduct(mix);
  const dosed = nearestProduct(`${mix} ${reagent.text}`);
  return {
    undosed,
    dosed,
    transmuted: dosed.id !== label.id,
    heldOwn: undosed.id === label.id,
  };
}

// ── Dose every entry with every reagent ─────────────────────────────────────
const rows = [];
for (const l of labels) {
  for (const r of REAGENTS) {
    rows.push({ label: l, reagent: r, ...dose(l, r) });
  }
}

function verdictOf(l) {
  const mine = rows.filter((x) => x.label.id === l.id);
  // BASELINE CONTROL: a mixture that does not point at its own product when
  // UNDOSED has no identity to transmute away from. Counting its post-dose
  // position as a transmutation credits the reagent for an error that was
  // already there. Only 11/16 hold their own product at rest.
  if (!mine[0].heldOwn) return { verdict: 'NO-BASELINE', into: [] };
  const t = mine.filter((x) => x.transmuted);
  if (t.length === 0) return { verdict: 'STABLE', into: [] };
  // What it becomes, most frequent first.
  const counts = new Map();
  for (const x of t) counts.set(x.dosed.id, (counts.get(x.dosed.id) ?? 0) + 1);
  const into = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { verdict: 'TRANSMUTED', into, n: t.length, of: mine.length };
}

const productOf = (id) => labels.find((l) => l.id === id)?.reaction.product ?? '?';

console.log('═══ CATALYST SPARKS — transmutation over the ledger ═══\n');
console.log(`  ${labels.length} entries × ${REAGENTS.length} reagents = ${rows.length} doses`);
const held = labels.filter((l) => rows.find((x) => x.label.id === l.id).heldOwn).length;
console.log(`  undosed mixtures that already point at their own product: ${held}/${labels.length}\n`);

for (const l of labels) {
  const v = verdictOf(l);
  const mark = v.verdict === 'TRANSMUTED' ? '⇄' : '=';
  console.log(`${mark} ${l.id}  ${l.outcome.padEnd(11)} → ${v.verdict}${v.verdict === 'TRANSMUTED' ? ` (${v.n}/${v.of} reagents)` : ''}`);
  console.log(`    is:  ${l.reaction.product.slice(0, 86)}`);
  for (const [intoId, n] of v.into ?? []) {
    console.log(`    ⇒ ${intoId} ×${n}: ${productOf(intoId).slice(0, 78)}`);
  }
  console.log('');
}

console.log('═══ DOES TRANSMUTATION AGREE WITH THE LEDGER? ═══\n');
const refuted = labels.filter((l) => l.outcome === 'REFUTED');
const confirmed = labels.filter((l) => l.outcome === 'CONFIRMED');
const meta = labels.filter((l) => l.outcome === 'METASTABLE');

for (const [name, group] of [['REFUTED', refuted], ['CONFIRMED', confirmed], ['METASTABLE', meta]]) {
  console.log(`  ${name} (${group.length}):`);
  for (const l of group) console.log(`    ${verdictOf(l).verdict.padEnd(12)} ${l.id}`);
  console.log('');
}

const refutedStable = refuted.filter((l) => verdictOf(l).verdict === 'STABLE');
const confirmedStable = confirmed.filter((l) => verdictOf(l).verdict === 'STABLE');

console.log('═══ VERDICT ON THE MECHANISM ═══\n');
console.log(`  REFUTED entries that survive dosing (want 0):  ${refutedStable.length}/${refuted.length}`);
for (const l of refutedStable) console.log(`      ✗ SURVIVED: ${l.id}`);
console.log(`  CONFIRMED entries that hold (want all):        ${confirmedStable.length}/${confirmed.length}`);
for (const l of confirmed.filter((x) => verdictOf(x).verdict !== 'STABLE')) {
  console.log(`      ✗ TRANSMUTED a confirmed entry: ${l.id}`);
}

const ok = refutedStable.length === 0 && confirmedStable.length === confirmed.length;
console.log(`\n  → ${ok ? 'transmutation agrees with the ledger on every decided entry.' : 'DISAGREEMENT — read the misses before trusting this.'}`);
