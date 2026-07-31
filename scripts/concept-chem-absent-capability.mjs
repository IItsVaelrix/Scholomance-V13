#!/usr/bin/env node
/**
 * Concept Chemistry: a NEGATIVE CONTROL ON THE INSTRUMENT.
 *
 * Every previous harness asked the chemistry a question and read the ranking.
 * This one asks a question whose answer is already known to be NO, and checks
 * that the engine fails in the RIGHT WAY.
 *
 * The four FALSE reactions describe capabilities this codebase does not have.
 * They are written fluently and, deliberately, ADJACENTLY — each one is a
 * plausible-sounding neighbour of something the topography engines really do.
 * That is the hard case. The ledger's own worst finding was `failure by
 * synonymy`: an idea that is wrong announces itself, while a beautiful
 * restatement of something already denied is nearly undetectable from inside.
 *
 * PRE-REGISTERED PREDICTIONS (declared before the run, so the outcome can be
 * wrong):
 *
 *   P1  Every absent/* reaction scores AT OR BELOW the control bar.
 *   P2  Every present/* reaction scores ABOVE the control bar.
 *   P3  No absent/* reaction outscores any present/* reaction.
 *   P4  absent/backprop — the least plausible — scores at nonsense level.
 *
 * P3 is the one that matters. If a fluent description of something we do not do
 * outranks a plain description of something we do, the engine is scoring
 * rhetoric, and every ranking it has ever produced is suspect.
 *
 * THE CHEMISTRY RANKS. THE PROBE DECIDES. The architectural check at the bottom
 * is what actually settles whether these capabilities exist; the ranking is only
 * being tested for whether it agrees.
 *
 *   node scripts/concept-chem-absent-capability.mjs
 */
import { synthesize } from '../codex/core/pixelbrain/concept-chemistry.js';
import { computeControlBar } from '../codex/core/pixelbrain/calibration/control-gate.js';
import { execSync } from 'node:child_process';

// Substrate: what the topography engines actually do, as of 474cd6b1. Every
// statement here is measured or read off the source, not aspirational.
const corpus = [
  "per band l2 normalization divides each sixty four dim band by its own norm",
  "each band gets one vote the global cosine is the mean of four band cosines",
  "band zero direct indexes a closed inventory no hashing no aliasing",
  "band one hashes ordered bigrams so call catch differs from catch call",
  "band two buckets topology counts direction never magnitude",
  "band three hashes import sources hook names call receivers",
  "negation inverts the sign of its word primitives and claims no dimension",
  "negating prefix gated by dictionary lookup of the stem interest is not a negation",
  "wordnet lexicographer files supply seventy eight thousand lemmas closed inventory",
  "unknown word resolves to empty declared absence never a guess",
  "parse source facts returns null when babel refuses the source",
  "stamp built from rare syntactic kinds document frequency in the manifest",
  "rarity relative to the corpus that produced it stamp carries corpus id",
  "stamp nominates never identifies largest bucket held thirty five files",
  "content hash from the parser is the cache key parse once stamp once",
  "closed callee list criterion nondeterminism in an otherwise pure path",
  "assert inventory fenced throws on duplicate kinds and on band overflow",
  "turboquant four bit quantization estimate inner product dequant map",
  "cleri retrieval merges literal structural token prion vector stamp nominations",
  "merge candidates sorts structural literal nominator count score path line",
  "only a registered structural verifier may emit verified similarity nominates",
  "frozen thresholds derived checksum no timestamps or randomness participate",
];

function groundingScore(concept) {
  const toks = new Set(
    concept.toLowerCase().replace(/[-_]/g, ' ').split(/\s+/).filter((t) => t.length > 2),
  );
  let hits = 0;
  for (const doc of corpus) {
    const docToks = new Set(doc.toLowerCase().split(/\s+/));
    if ([...toks].some((t) => docToks.has(t))) hits++;
  }
  return hits / corpus.length;
}

const reactions = [
  // ── ABSENT: capabilities this codebase does not have ─────────────────────
  {
    id: "absent/learned-band-weights",
    group: "absent",
    a: "per band normalization gives each band one vote in the global cosine",
    b: "attention weights fitted to a corpus so informative channels dominate",
    product: "band weights are learned from the corpus so discriminating bands are amplified automatically",
  },
  {
    id: "absent/incremental-stamp-index",
    group: "absent",
    a: "content hash from the parser is the cache key parse once stamp once",
    b: "incremental index invalidation recomputes only the entries that changed",
    product: "the stamp index updates incrementally on file change so only touched files are reparsed",
  },
  {
    id: "absent/hypernym-depth-weighting",
    group: "absent",
    a: "wordnet lexicographer files supply a closed inventory of supersenses",
    b: "hypernym chain depth measures specificity in a concept hierarchy",
    product: "primitives are weighted by wordnet hypernym depth so specific concepts outweigh general ones",
  },
  {
    id: "absent/backprop",
    group: "absent",
    a: "retrieval ranking produces an ordering over candidate files",
    b: "gradient descent backpropagates error through a differentiable pipeline",
    product: "retrieval error is backpropagated into the inventory to retrain the band encoders",
  },

  // ── PRESENT: capabilities this codebase does have ────────────────────────
  {
    id: "present/negation-sign",
    group: "present",
    a: "negation inverts the sign of its word primitives and claims no dimension",
    b: "signed contribution makes an opposed pair antiparallel rather than adjacent",
    product: "not x lands antiparallel to x instead of sharing most of its dimensions",
  },
  {
    id: "present/rare-kind-stamp",
    group: "present",
    a: "stamp built from rare syntactic kinds document frequency in the manifest",
    b: "a distribution averages away the terms that occur least often",
    product: "rare kinds carry diagnostic signal that band zero averages away so a stamp carries it separately",
  },
  {
    id: "present/declared-absence",
    group: "present",
    a: "unknown word resolves to empty declared absence never a guess",
    b: "a resolver that always resolves is a check that cannot fail",
    product: "refusing to resolve makes a coverage gap visible instead of filling it with confident noise",
  },

  // ── CONTROLS: these set the bar ──────────────────────────────────────────
  {
    id: "control/nonsense",
    group: "control",
    a: "band normalization and inventory grounding",
    b: "banana bread recipe with flour and sugar and frosting",
    product: "semantic grounding as a pastry glaze",
  },
  {
    id: "control/law-violation",
    group: "control",
    a: "vector similarity ranks candidate files",
    b: "random non deterministic unseeded stochastic generation",
    product: "assign a verified verdict by unseeded random resampling until it looks right",
  },
  {
    id: "control/false-friend",
    group: "control",
    a: "band cosine measures agreement between two vectors",
    b: "any band that reads high for unrelated input is measuring a shared baseline",
    product: "a band that never reads low is therefore the most informative band in the vector",
  },
];

// ── RUN ──────────────────────────────────────────────────────────────────────

const results = reactions.map((r) => {
  const out = synthesize({
    a: r.a,
    b: r.b,
    product: r.product,
    groundingA: groundingScore(r.a),
    groundingB: groundingScore(r.b),
  });
  return { ...r, ...out, feasibility: out.feasibility };
});

const { bar, barId } = computeControlBar(results, { groupKey: 'group' });

console.log('\n═══ CONCEPT CHEMISTRY: NEGATIVE CONTROL ON THE INSTRUMENT ═══\n');
console.log('  Testing four capabilities this codebase does NOT have, written to');
console.log('  sound like ones it does. The chemistry must rank them below the bar.\n');
console.log('  ID'.padEnd(40) + 'feasib   stability     bond     ground   cohere  law');
console.log('  ' + '─'.repeat(96));
for (const r of [...results].sort((a, b) => b.feasibility - a.feasibility)) {
  console.log(
    '  ' + r.id.padEnd(38) +
    r.feasibility.toFixed(4).padStart(6) + '   ' +
    (r.stability ?? '?').padEnd(12) +
    (r.bond ?? 0).toFixed(4).padStart(8) + '  ' +
    (r.grounding ?? 0).toFixed(4).padStart(8) + '  ' +
    (r.coherence ?? 0).toFixed(4).padStart(7) + '  ' +
    (r.lawNote ? String(r.lawNote).slice(0, 14) : 'NEUTRAL')
  );
}

console.log(`\n  control bar = ${bar.toFixed(4)}  (${barId})\n`);

// ── PRE-REGISTERED PREDICTIONS ───────────────────────────────────────────────

const absent = results.filter((r) => r.group === 'absent');
const present = results.filter((r) => r.group === 'present');

const p1 = absent.filter((r) => r.feasibility <= bar);
const p2 = present.filter((r) => r.feasibility > bar);
const worstPresent = Math.min(...present.map((r) => r.feasibility));
const bestAbsent = Math.max(...absent.map((r) => r.feasibility));
const p3 = bestAbsent < worstPresent;
const nonsense = results.find((r) => r.id === 'control/nonsense').feasibility;
const backprop = results.find((r) => r.id === 'absent/backprop').feasibility;
const p4 = backprop <= nonsense * 1.25;

console.log('═══ PRE-REGISTERED PREDICTIONS ═══\n');
console.log(`  P1  every absent reaction at or below the bar      ${p1.length}/${absent.length}  ${p1.length === absent.length ? 'HELD' : 'FAILED'}`);
console.log(`  P2  every present reaction above the bar           ${p2.length}/${present.length}  ${p2.length === present.length ? 'HELD' : 'FAILED'}`);
console.log(`  P3  no absent outranks any present                 ${bestAbsent.toFixed(4)} vs ${worstPresent.toFixed(4)}  ${p3 ? 'HELD' : 'FAILED'}`);
console.log(`  P4  backprop near nonsense level                   ${backprop.toFixed(4)} vs ${nonsense.toFixed(4)}  ${p4 ? 'HELD' : 'FAILED'}`);

for (const r of absent.filter((x) => x.feasibility > bar)) {
  console.log(`\n  ⚠️  ${r.id} scored ${r.feasibility.toFixed(4)}, ABOVE the bar.`);
  console.log('      A fluent description of something we do not do cleared the control.');
}

// ── CORPUS-INDEPENDENT CHANNELS ──────────────────────────────────────────────
// grounding is W_GROUND = 0.65 of the score and is computed against a corpus
// written by the same hand as the reactions, so a reaction that quotes a corpus
// line is rewarded for the quotation. Ask whether the two channels that do NOT
// touch the corpus — bond and coherence — separate present from absent.

console.log('\n═══ CORPUS-INDEPENDENT CHANNELS ONLY (bond + coherence) ═══\n');
const W_B = 0.15, W_C = 0.20;
const ci = results
  .filter((r) => r.group !== 'control')
  .map((r) => ({ id: r.id, group: r.group, ci: W_B * (r.bond ?? 0) + W_C * (r.coherence ?? 0) }))
  .sort((a, b) => b.ci - a.ci);
for (const r of ci) {
  console.log(`  ${r.group.padEnd(8)} ${r.ci.toFixed(4)}  ${r.id}`);
}
const ciAbsentMax = Math.max(...ci.filter((r) => r.group === 'absent').map((r) => r.ci));
const ciPresentMin = Math.min(...ci.filter((r) => r.group === 'present').map((r) => r.ci));
console.log(`\n  best absent ${ciAbsentMax.toFixed(4)}  vs  worst present ${ciPresentMin.toFixed(4)}  ` +
  `→ ${ciAbsentMax < ciPresentMin ? 'SEPARATED' : 'NOT SEPARATED'}`);
if (ciAbsentMax >= ciPresentMin) {
  console.log('  Removing the corpus does not rescue the ranking. The failure is not');
  console.log('  merely that the corpus was authored by the same hand.');
}

// ── THE PROBE DECIDES ────────────────────────────────────────────────────────
// The ranking above is an opinion. These greps are the receipts. Each pattern
// is the thing that would HAVE to exist if the capability were real.

console.log('\n═══ ARCHITECTURAL PROBE (this is what actually settles it) ═══\n');

const probes = [
  { id: 'absent/learned-band-weights', pattern: 'backward|gradient|\\.fit\\(|train\\(|learningRate|optimizer' },
  { id: 'absent/incremental-stamp-index', pattern: 'invalidate|incremental|watch\\(|stampCache|updateStamp' },
  { id: 'absent/hypernym-depth-weighting', pattern: 'hypernym|hyponym|chainDepth|depthWeight' },
  { id: 'absent/backprop', pattern: 'backprop|backward|gradient|autograd' },
];

for (const probe of probes) {
  let hits = '';
  try {
    hits = execSync(
      `grep -rnE '${probe.pattern}' codex/core/semantic/ codex/core/pixelbrain/concept-chemistry.js 2>/dev/null | head -3`,
      { encoding: 'utf8' },
    ).trim();
  } catch { hits = ''; }
  const verdict = hits ? 'FOUND — capability may exist, re-read' : 'ABSENT — no implementation';
  console.log(`  ${probe.id.padEnd(38)} ${verdict}`);
  if (hits) for (const line of hits.split('\n')) console.log(`      ${line.slice(0, 110)}`);
}

// ── VERDICT ──────────────────────────────────────────────────────────────────

console.log('\n═══ VERDICT ═══\n');
const allHeld = p1.length === absent.length && p2.length === present.length && p3 && p4;
if (allHeld) {
  console.log('  ✅ The instrument failed in the right way. Every capability we do not');
  console.log('     have ranked at or below the control bar, every capability we do have');
  console.log('     ranked above it, and no fluent absence outranked a plain presence.');
} else {
  console.log('  ❌ The instrument did NOT fail in the right way. Read the predictions');
  console.log('     above: a ranking that cannot separate present from absent is scoring');
  console.log('     rhetoric, and prior rankings from this engine need re-reading.');
}
console.log('');
