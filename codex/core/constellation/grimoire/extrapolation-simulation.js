/**
 * EXTRAPOLATION SIMULATION — the cyclotron slate.
 *
 * "Take every law we can come up with, extrapolate them to the atoms we have,
 * then smash them together."
 *
 * Three generators, in increasing distance from stated law:
 *
 *   1. PROJECTION SWEEP — the Result Conservation table (PAIR_OPERATIONS ×
 *      PROJECTION_TRANSITIONS) applied to the full observed atom inventory.
 *      This is literally every generic law the physics already licenses,
 *      extrapolated to every atom the chart builds. Whatever it still finds is
 *      law that was implied all along and never written down.
 *
 *   2. HOST-ADJUNCT GRID + PUNCT PARITY — the modify/preserve schema
 *      generalized to hosts and adjuncts the table has not met yet. Named
 *      specials, but each one is an instance of an existing schema shape, not
 *      an invention.
 *
 *   3. NEW ELEMENTS — named constructions with no existing instance: the
 *      candidates that would extend what the grammar can express, not just
 *      where it applies. Each carries a grammatical rationale and submits to
 *      the identical purity gate as everything else.
 *
 * Every candidate additionally passes the POLYDISPERSE blocklist — the giant
 * raw-adjacency bonds the construction autopsy refused (NP+NP, S+S, NP+S,
 * S+NP, N+N): coverage hammers whose firings are <50% gold-backed. They are
 * refused here by policy so no generator can smuggle them back in.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/grimoire/extrapolation-simulation
 */

import { BONDS } from '../compose.js';
import { synthesizeByProjection } from './projection-laws.js';

const bondKey = (l, r, res) => `${l}|${r}|${res}`;

function activeSignatures() {
  return new Set(BONDS.map((b) => bondKey(b[0], b[1], b[2])));
}

/**
 * Giant raw-adjacency bonds refused by the 2026-08-08 construction autopsy:
 * polydisperse firings (<50% gold-backed). The gated family splits
 * (compound-nn, proper-compound, …) replaced them. None of them may enter a
 * reactor again as a raw bond.
 */
export const POLYDISPERSE_BLOCKLIST = Object.freeze([
  'NP|NP|NP',
  'S|S|S',
  'NP|S|S',
  'S|NP|S',
  'N|N|N',
  'S|VP|S',
]);

/**
 * Candidates already measured at the current BONDS baseline (coverage 490 DEV
 * / 502 TEST — identical state, deterministic reactor), from the 2026-08-08
 * hint grammar simulation. Re-reacting them would reproduce the same numbers
 * and burn minutes, so their verdicts are carried forward by citation.
 *
 * Keys are `left|right|result|head` where head matters (paired entries cite
 * the pair). Source: docs/superpowers/evidence/2026-08-08-hint-grammar-simulation.md
 */
export const ALREADY_MEASURED = Object.freeze({
  // ── held out (SURVIVE DEV + TEST, never promoted) ──
  'DET|NP|NP|1': 'hint-sim: SURVIVE, held out (Δcov DEV +3 / TEST +2)',
  'ADV+CONJADV pair': 'hint-sim: PAIR SURVIVE, held out (TEST Δ0 — cosmetic)',
  'PP+CONJPP pair': 'hint-sim: PAIR SURVIVE, held out (TEST Δ0 — cosmetic)',
  // ── NO-GAIN at this baseline ──
  'ADV|CONJADV|ADV|0': 'hint-sim: NO-GAIN alone (paired SURVIVE above)',
  'CONJ|ADV|CONJADV|1': 'hint-sim: NO-GAIN alone (paired SURVIVE above)',
  'PP|CONJPP|PP|0': 'hint-sim: NO-GAIN alone (paired SURVIVE above)',
  'CONJ|PP|CONJPP|1': 'hint-sim: NO-GAIN alone (paired SURVIVE above)',
  'N|CONJN|N|0': 'hint-sim: PAIR NO-GAIN (N coordination)',
  'CONJ|N|CONJN|1': 'hint-sim: PAIR NO-GAIN (N coordination)',
  'NC|CONJNC|NC|0': 'hint-sim: PAIR NO-GAIN (NC coordination)',
  'CONJ|NC|CONJNC|1': 'hint-sim: PAIR NO-GAIN (NC coordination)',
  'S|ADV|S|0': 'hint-sim: NO-GAIN (clause-adv-post)',
  'S|PP|S|0': 'hint-sim: NO-GAIN (clause-pp-adjunct)',
  'N|PP|NP|0': 'hint-sim: NO-GAIN (n-pp)',
  'NC|PP|NP|0': 'hint-sim: NO-GAIN (nc-pp)',
  'ADJ|NC|NC|1': 'hint-sim: NO-GAIN (adj-nc-stack)',
  'DET|NC|NP|1': 'hint-sim: NO-GAIN (det-nc — projection-legal, forest-toxic)',
  'GEN|NC|NP|1': 'hint-sim: NO-GAIN (gen-nc)',
  'POSS|NC|N|1': 'hint-sim: NO-GAIN (poss-nc)',
  'POSS|NC|NC|1': 'hint-sim: NO-GAIN (poss-nc)',
  'NC|PROPN|N|1': 'hint-sim: NO-GAIN (nc-port-left)',
  'PROPN|NC|N|1': 'hint-sim: NO-GAIN (nc-port-right)',
  'COP|VP|VP|1': 'deprecated in Grimoire (cop-vp-mislabel → AUX+VP)',
  'NC|PUNCT|N|0': 'hint-sim: NO-GAIN (nc-port-left punct)',
  'INF|PUNCT|INF|0': 'hint-sim: NO-GAIN (punct-parity)',
  'PART|PUNCT|PART|0': 'hint-sim: NO-GAIN (punct-parity)',
  'PP|PUNCT|PP|0': 'hint-sim: NO-GAIN (punct-parity)',
  'RELC|PUNCT|RELC|0': 'hint-sim: NO-GAIN (punct-parity)',
  'SBAR|PUNCT|SBAR|0': 'hint-sim: NO-GAIN (punct-parity)',
  'VP|PUNCT|VP|0': 'hint-sim: NO-GAIN (punct-parity)',
});

/** Signatures the generators must never emit. */
function exclusions() {
  const have = activeSignatures();
  const blocked = new Set(POLYDISPERSE_BLOCKLIST);
  const measuredSig = new Set();
  for (const key of Object.keys(ALREADY_MEASURED)) {
    if (key.includes('|')) measuredSig.add(key.slice(0, key.lastIndexOf('|')));
  }
  return { have, blocked, measuredSig };
}

/**
 * Build the extrapolation slate.
 *
 * @param {Set<string>} observed chart types the base grammar builds (DEV)
 * @returns {{candidates: Array<object>, pairs: Array<object>, carriedForward: object}}
 */
export function buildExtrapolationSlate(observed) {
  const { have, blocked, measuredSig } = exclusions();
  const out = new Map();

  const add = (c) => {
    if (!c || !c.left || !c.right || !c.result) return null;
    if (c.head !== 0 && c.head !== 1) return null;
    const signature = bondKey(c.left, c.right, c.result);
    if (have.has(signature) || blocked.has(signature) || measuredSig.has(signature)) return null;
    const k = `${signature}|${c.head}`;
    if (out.has(k)) return null;
    const cand = {
      left: c.left,
      right: c.right,
      result: c.result,
      head: c.head,
      signature,
      law: c.law,
      status: c.status || 'approximation',
      rationale: c.rationale || '',
      family: c.family || 'extrapolation',
      special: Boolean(c.special),
    };
    out.set(k, cand);
    return cand;
  };

  // ── 1. Projection sweep: every licensed law, every observed atom ─────────
  // synthesizeByProjection enumerates PAIR_OPERATIONS × licensed results —
  // the complete generic law space. Filtering to observed atoms keeps only
  // bonds that could physically fire; the rest is unfireable by construction.
  const projectionHits = [];
  for (const c of synthesizeByProjection()) {
    if (c.special) continue; // schemas handled by generator 3
    if (!observed.has(c.left) || !observed.has(c.right)) continue;
    const added = add({ ...c, law: c.law, family: 'projection-sweep' });
    if (added) projectionHits.push(added);
  }

  // ── 2a. Host-adjunct grid (modify-preserve schema generalization) ────────
  // Existing instances: VP+PP, VP+ADV, NP+PP, ADV+VP, ADV+ADJ, ADJ+N.
  // Same schema, hosts/adjuncts the table has not met:
  const grid = [
    { left: 'ADJ', right: 'PP', result: 'ADJ', head: 0,
      law: 'extrapolate:adj-pp-modifier',
      rationale: 'happy ABOUT IT — ADJ heads its oblique PP (UD obl on adj).' },
    { left: 'NP', right: 'ADV', result: 'NP', head: 0,
      law: 'extrapolate:np-adv-post',
      rationale: 'the man HERE — postpositive locative adverb on NP.' },
    { left: 'NP', right: 'ADJ', result: 'NP', head: 0,
      law: 'extrapolate:np-postpositive-adj',
      rationale: 'something SPECIAL, attorney GENERAL — postpositive adjective.' },
    { left: 'INF', right: 'PP', result: 'INF', head: 0,
      law: 'extrapolate:inf-pp-adjunct',
      rationale: 'to run IN THE PARK — PP adjunct on infinitive.' },
    { left: 'INF', right: 'ADV', result: 'INF', head: 0,
      law: 'extrapolate:inf-adv-adjunct',
      rationale: 'to run QUICKLY — adverb adjunct on infinitive.' },
    { left: 'ADV', right: 'PP', result: 'PP', head: 1,
      law: 'extrapolate:adv-pp-modifier',
      rationale: 'RIGHT ON TIME — adverb modifying a PP (UD advmod on P).' },
  ];
  for (const g of grid) add({ ...g, special: true, family: 'host-adjunct' });

  // ── 3. New elements — named constructions with no existing instance ─────
  const elements = [
    { left: 'TO', right: 'NP', result: 'PP', head: 1,
      law: 'element:to-preposition',
      rationale:
        'Prepositional TO emits only the TO atom (never P), so "to the store" '
        + 'cannot case-wrap: 107 TO+NP and 157 S+TO gap adjacencies on DEV. '
        + 'Same shape as P+NP→PP (UD case: head on the nominal). Isomeric '
        + 'with infinitival TO+VP — the chart keeps both arrangements.',
      family: 'new-element' },
    { left: 'DET', right: 'ADJ', result: 'NP', head: 1,
      law: 'element:substantive-adjective',
      rationale: 'THE RICH, THE POOR — determiner + adjective as full NP (UD: ADJ head).' },
    { left: 'ADJ', right: 'PROPN', result: 'N', head: 1,
      law: 'element:proper-noun-modifier',
      rationale:
        'ANCIENT ROME — attributive adjective on a proper noun (UD amod). '
        + 'Result N follows the existing PROPN compound family.' },
    { left: 'ADJ', right: 'ADV', result: 'ADJ', head: 0,
      law: 'element:postpositive-adv-adj',
      rationale: 'big ENOUGH, dark INDEED — postpositive adverb modifying ADJ. Mirror of ADV+ADJ.' },
    { left: 'NP', right: 'TO', result: 'NP', head: 0,
      law: 'element:np-to-inf-fringe',
      rationale:
        'a plan TO… — NP followed by stranded infinitival TO when the VP '
        + 'after it did not build. Fringe rescue; expect low purity.',
      family: 'new-element' },
  ];
  for (const e of elements) add({ ...e, special: true, status: 'approximation' });

  // ── 2b. Coordination closure for phrase types never bridged ──────────────
  // Existing: NP, VP, S, ADJ. New: INF and SBAR. Each is a two-bond
  // construction (bridge + completion); neither half can fire alone, so they
  // are emitted as PAIRS for the paired reactor, not singles.
  const pairs = [];
  const coordClosure = [
    { X: 'INF', bridge: 'CONJINF',
      rationale: 'to run AND (to) jump — infinitive coordination.' },
    { X: 'SBAR', bridge: 'CONJSBAR',
      rationale: 'because he ran AND because she walked — subordinate coordination.' },
  ];
  for (const { X, bridge, rationale } of coordClosure) {
    const b = {
      left: 'CONJ', right: X, result: bridge, head: 1,
      signature: bondKey('CONJ', X, bridge),
      law: 'extrapolate:coord-bridge', rationale, family: 'coord-closure', special: true,
    };
    const cm = {
      left: X, right: bridge, result: X, head: 0,
      signature: bondKey(X, bridge, X),
      law: 'extrapolate:coord-complete', rationale, family: 'coord-closure', special: true,
    };
    const bSigTaken = have.has(b.signature) || measuredSig.has(b.signature);
    const cSigTaken = have.has(cm.signature) || measuredSig.has(cm.signature);
    if (bSigTaken || cSigTaken) continue;
    pairs.push({ members: [b, cm], label: `${b.signature} + ${cm.signature}`, rationale });
  }

  return {
    candidates: [...out.values()].sort((a, b) => a.signature.localeCompare(b.signature)),
    pairs,
    projectionHits,
    carriedForward: ALREADY_MEASURED,
  };
}
