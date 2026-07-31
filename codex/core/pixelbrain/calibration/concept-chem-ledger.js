/**
 * CONCEPT CHEMISTRY LEDGER — accumulated question outcomes
 * ========================================================================
 * PB-SIM-CHEMLEDGER-v1
 *
 * Institutional memory for Concept Chemistry: what was asked, what the
 * engine ranked, and — where it exists — what physically happened.
 *
 * The point of this file is the REFUTED entries. A denied idea that is not
 * written down is rediscovered as novel, and the more elegant it was the
 * faster it comes back. Every refutation here carries its numbers so a
 * future session can see the shape of the denial rather than take it on
 * authority.
 *
 * TIERS (from label-store.js):
 *   SIMULATED — ranked by the engine; never built. Triage only.
 *   PHYSICAL  — built and measured. Anchors truth, and OVERRIDES the
 *               engine where they disagree.
 *
 * THE MOST VALUABLE ENTRIES ARE THE DISAGREEMENTS. LBL governance-gate
 * records the engine ranking a framing BELOW its controls that was then
 * built and worked. That is not an embarrassment to hide; it is the only
 * kind of data that can ever calibrate this instrument.
 *
 * READING THE NUMBERS: every score is ORDINAL and comparable only within
 * its own run. The gate is always "beats every control", never STABLE_MIN.
 * No candidate in any run recorded here reached STABLE (0.55); the highest
 * observed was 0.5052.
 */

import { createLabelStore } from '../label-store.js';

export const SCHEMA = 'PB-SIM-CHEMLEDGER-v1';

/**
 * Every reaction this project has put through Concept Chemistry, with the
 * outcome and the evidence that settled it.
 *
 * @type {ReadonlyArray<object>}
 */
export const LEDGER_ENTRIES = Object.freeze([
  // ── 2026-07-30 · VRI × BytecodeHealth ────────────────────────────────
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'vri render ir as an intermediary interpolation layer between animation keyframes',
      b: 'bytecode health green path signal emitted when a diagnostic check passes',
      product: 'vri interpolation plugged into the health channel to guide animation generation',
    },
    outcome: 'REFUTED',
    evidence:
      'hand 0.2018 (-0.0180 vs bar), corpus 0.3541 (-0.1383). Corpus polarity separation ' +
      '+0.0041 = NOT SEPARATED, so that run could not certify. Architectural falsifier is ' +
      'decisive and independent: BytecodeHealth has ZERO matches for interp|lerp|frame|animat| ' +
      'tween|generat|keyframe — every export is encode*/checksum*/verify*. VRI had no time axis ' +
      '(createVRIScene takes no frame/t/duration). Neither module had the port the claim assumed.',
    source: 'scripts/concept-chem-vri-health.mjs',
  },
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'animation generation lacking determinism it would not otherwise have',
      b: 'health determinism contract same input same output one hundred pass required',
      product: 'the health channel supplies the determinism the animation generator lacks',
    },
    outcome: 'REFUTED',
    evidence:
      'hand 0.2204 (+0.0006 vs bar — noise, not clearance), corpus 0.4882 (-0.0042). ' +
      'A +0.0006 margin is not a result; recorded so it is never cited as one.',
    source: 'scripts/concept-chem-vri-health.mjs',
  },
  {
    tier: 'PHYSICAL',
    reaction: {
      a: 'interpolation produces intermediate state between two declared endpoints',
      b: 'vri content addressed checksum hashes the full canonical scene',
      product: 'frame n reproducible from two sealed vri endpoint scenes and a declared parameter',
    },
    outcome: 'CONFIRMED',
    evidence:
      'Ranked FIRST in the hand corpus (0.2654, +0.0456 — the only candidate to clear) and ' +
      'subsequently BUILT: codex/core/pixelbrain/temporal/ replayFrame() re-derives frame N ' +
      'from gene + quantized time and verifies against a persisted projectionChecksum. ' +
      '69 tests green. The engine picked the shape that got built.',
    source: 'scripts/concept-chem-vri-health.mjs + codex/core/pixelbrain/temporal/',
  },
  {
    // THE DISAGREEMENT. Read this one before trusting a low score.
    tier: 'PHYSICAL',
    reaction: {
      a: 'health payload emitted only when a check passes carrying a stable checksum',
      b: 'constraint infeasibility deterministic refusal never partial solving',
      product: 'the health signal is the admission gate that refuses a frame failing its determinism check',
    },
    outcome: 'CONFIRMED',
    evidence:
      'ENGINE WAS WRONG. Ranked BELOW the bar in both runs (hand 0.1885 / -0.0313, corpus ' +
      '0.4469 / -0.0455). Built anyway and it works: compileTemporal throws ' +
      'PB-ERR-v1-TEMPORAL-COMPILE-DETERMINISM-FAILED rather than degrading, certifyGene ' +
      'rejects a tampered checksum, and diagnostic-constants gained PB-ERR/PB-WARN TEMPORAL ' +
      'codes so refusal is expressible. Governance framings appear to be UNDER-RANKED by this ' +
      'engine — the corpus has little vocabulary for design stances. Do not treat a low score ' +
      'on a governance question as a denial without an architectural check.',
    source: 'scripts/concept-chem-vri-health.mjs + codex/core/pixelbrain/temporal/temporal-governor.js',
  },

  // ── 2026-07-30 · PixelBrain gravity ──────────────────────────────────
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'a propagation field that attracts the energy of the qbit lattice toward a centre',
      b: 'gravitational potential well attracts mass toward a centre',
      product: 'pixel energy accumulates toward attractors instead of radiating from seeds',
    },
    outcome: 'REFUTED',
    evidence:
      'corpus 0.2117 (-0.0697 vs bar). Hand run was BLIND to this question: polarity separation ' +
      '+0.0025 between "attracts" and "repels", and gravity\'s entire content is its sign — ' +
      'record of the engine failing to rank. Architectural falsifier settles it: ' +
      'codex/core/pixelbrain/qbit-field.js already implements propagate() with INVERSE_SQUARE ' +
      '= seedEnergy/(distSq+1), the Newtonian kernel. Winner was A/attractor-is-a-signed-seed ' +
      '(corpus 0.2850, +0.0036): an attractor is a seed with a negative source term.',
    source: 'scripts/concept-chem-pixelbrain-gravity.mjs',
  },
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'assign material identity by threshold from a continuous energy value',
      b: 'turboquant quantized semantic buckets from formation formulas',
      product: 'the energy threshold bucket carries semantic meaning rather than material identity',
    },
    outcome: 'METASTABLE',
    evidence:
      'TOP of the field in BOTH corpora (hand 0.2720 / +0.0524, corpus 0.3036 / +0.0222) — the ' +
      'strongest positive signal of the day. The conflation control ("material names already ARE ' +
      'semantic buckets") scored LOWEST of everything at 0.0504, so the engine rejects the ' +
      'shortcut. NOT BUILT. Unverified. Substrate has zero prior art for it.',
    source: 'scripts/concept-chem-pixelbrain-gravity.mjs',
  },

  // ── 2026-07-30 · the interlocutor ────────────────────────────────────
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'a layer understanding every producer format and every consumer mode',
      b: 'protocol negotiation exchanges offers before data is sent',
      product: 'an interlocutor negotiates what crosses the bridge instead of a fixed projection',
    },
    outcome: 'REFUTED',
    evidence:
      'hand 0.1259 (-0.1803 — lowest non-nonsense candidate in the field), corpus 0.2856 ' +
      '(-0.0853). Polarity separated AGAINST consumer-initiation in BOTH runs (-0.1201, ' +
      '-0.0586): producer-initiated consistently outranks it. Also breaks the bridge law — a ' +
      'consumer declaring capabilities and selecting its receipt family is a second author of ' +
      'requirements. Proposed with a "VALIDATED" verdict carrying no controls and no scores.',
    source: 'scripts/concept-chem-interlocutor.mjs',
  },
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'a serialization boundary narrows producer state to a transferable form',
      b: 'count the producer output formats and carry all of them',
      product: 'any boundary that fails to carry every producer format is a defect',
    },
    outcome: 'REFUTED',
    evidence:
      'Authored as a CONTROL and it scored 0.3709 — the TOP control in the corpus run, beating ' +
      'most real candidates. Recorded because this inference is rhetorically powerful and wrong: ' +
      'a boundary that narrows is a projection working. It is the reasoning the interlocutor ' +
      'proposal rested on.',
    source: 'scripts/concept-chem-interlocutor.mjs',
  },
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'a projection carries a chosen subset of producer state across a boundary',
      b: 'one producer the consumer verifies the seal by string equality',
      product: 'each producer format gets its own sealed projection and the consumer chooses nothing',
    },
    outcome: 'METASTABLE',
    evidence:
      'Won BOTH runs of the interlocutor question (hand 0.3111 / +0.0049, corpus 0.5052 / ' +
      '+0.1343 — highest score recorded in this ledger) and survived as incumbent in the melanin ' +
      'run (0.5052, still first). NOT BUILT. Designed in ' +
      'docs/superpowers/specs/2026-07-30-sealed-projection-carrier-design.md.',
    source: 'scripts/concept-chem-interlocutor.mjs + scripts/concept-chem-melanin-fiche.mjs',
  },

  // ── 2026-07-30 · the melanin fiche ───────────────────────────────────
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'melanin is produced locally in response to light that already landed',
      b: 'the memory store records an access count and a last access per row',
      product: 'frames thicken where they were actually read and thin where they were not',
    },
    outcome: 'REFUTED',
    evidence:
      'Failed the one separation the run was built to test: vs control/false-friend-request ' +
      '("the consumer requests the frames it wants") hand -0.0978, corpus -0.0126 = NOT ' +
      'SEPARATED. Usage-driven feedback is a request with a delay, and the request framing was ' +
      'already refuted above. NOTE it DID separate from the forecast control (+0.0641, +0.0342), ' +
      'so "responds to what already landed" is a real distinction — just not a distinction from ' +
      'asking. This is failure by SYNONYMY, not by emptiness: it scored 0.2601 where nonsense ' +
      'scored 0.0973. An elegant restatement of an already-denied idea is the hardest failure ' +
      'mode to see from the inside.',
    source: 'scripts/concept-chem-melanin-fiche.mjs',
  },
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'a sealed carrier bundles many complete documents behind one index',
      b: 'a projection carries a chosen subset of producer state across a boundary',
      product: 'one sealed carrier holds every projection behind a manifest with a checksum per frame',
    },
    outcome: 'METASTABLE',
    evidence:
      'Corpus 0.5001 (+0.1866), statistically tied with the incumbent A/second-projection-plain ' +
      '(0.5052, -0.0051) — correct, since the carrier is PACKAGING for that idea rather than a ' +
      'rival to it. Hand run 0.1893 (-0.1350), i.e. corpus-dependent. NOT BUILT.',
    source: 'scripts/concept-chem-melanin-fiche.mjs',
  },

  // ── 2026-07-30 · paint buckets × misattribution cascade ──────────────
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'a signalling cascade amplifies one activation into many downstream activations',
      b: 'phosphorylate commits a paint only when confidence meets the collapse threshold',
      product: 'one detected misattribution amplifies into every region sharing its reason',
    },
    outcome: 'REFUTED',
    evidence:
      'Worst-scoring hypothesis in BOTH runs (hand 0.1835 / -0.1087, corpus 0.2043 / -0.1259). ' +
      'Polarity vs its attenuating twin: hand +0.0165 = NOT SEPARATED, corpus +0.0230 = marginal. ' +
      'Amplification is doing little or no work. A/single-kinase-no-cascade OUTSCORES it in both ' +
      'runs (0.2442 vs 0.1835; 0.3242 vs 0.2043). The cascade is decoration on a single gate.',
    source: 'scripts/concept-chem-paint-bucket-misattribution.mjs',
  },
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'an attribution is wrong when the reason recorded does not produce the value observed',
      b: 'retrospective audit examines artefacts already produced',
      product: 'audit painted regions for colour whose recorded reason does not reproduce it',
    },
    outcome: 'REFUTED',
    evidence:
      'AS STATED: below the bar in both runs (hand 0.1963 / -0.0959, corpus 0.3218 / -0.0084). ' +
      'Separation vs control/false-friend-confidence ("a region below the collapse threshold is ' +
      'misattributed") was INCONSISTENT: hand -0.0424 (the conflation outranks it), corpus ' +
      '+0.0230. The engine cannot reliably tell this apart from rereading the existing gate\'s ' +
      'confidence field. The INTENT survives in A/replay-the-reason — see that entry.',
    source: 'scripts/concept-chem-paint-bucket-misattribution.mjs',
  },
  {
    tier: 'SIMULATED',
    reaction: {
      a: 'the material name carries the hue and the authored hex is a value sketch',
      b: 'an attribution is wrong when the reason recorded does not produce the value observed',
      product: 'recompute the colour from the declared material and refuse any region that disagrees',
    },
    outcome: 'METASTABLE',
    evidence:
      'WON BOTH RUNS (hand 0.3571 / +0.0649, corpus 0.3520 / +0.0218) — the reformulation that ' +
      'carries the original intent without the cascade. A determinism check on attribution: ' +
      'replay the declared reason, refuse disagreement. Targets a defect already on the books ' +
      '(texture noise reassigning ramp bands, read library-wide as specular gloss, no test able ' +
      'to fail on it). A/extend-existing-gate-reasons also cleared both (0.3263, 0.3446), so the ' +
      'landing site is qbit-phosphorylation.js\'s existing reason taxonomy, not a new system. ' +
      'NOT BUILT.',
    source: 'scripts/concept-chem-paint-bucket-misattribution.mjs',
  },

  // ── 2026-07-30 · physical anchors from the Blender bridge ────────────
  {
    tier: 'PHYSICAL',
    reaction: {
      a: 'a coordinate set crossing as a vertex only mesh with named attributes',
      b: 'a path tracer renders geometry it can see',
      product: 'the rendered pixel receipt is evidence the asset crossed the bridge',
    },
    outcome: 'REFUTED',
    evidence:
      'Measured: a render with NO ingest at all hashed B6B1FD51, byte-identical to ' +
      'holy_fire_claymore (788 coords) and pixelbrain-painted-basic (2 coords). ' +
      'mesh.from_pydata(verts, [], []) is invisible to Cycles, so three slices of REPRODUCED ' +
      'verdicts measured the factory startup cube. Fixed in e0cee0f9 (POINTCLOUD + radius + ' +
      'scene prep); receipts now 3FF3A358 / C59E7DC4.',
    source: 'blender/tests/test_render_visibility.py',
  },
  {
    tier: 'PHYSICAL',
    reaction: {
      a: 'a pure function re-evaluated in the same process and compared to itself',
      b: 'a determinism certification that refuses non reproducible output',
      product: 'same process replay certifies that an interpolation is deterministic',
    },
    outcome: 'METASTABLE',
    evidence:
      'Mutation-tested, both directions. MUTATION A (hardcode certified=true): 65/65 tests still ' +
      'passed — the suite cannot tell whether certification works. MUTATION B (inject 1e-6 ' +
      'call-to-call drift): 14 tests failed and compilation threw — so it DOES catch ' +
      'intra-process nondeterminism. Narrow but real: blind to anything stable in-process and ' +
      'varying across process/machine/version, which is the class distributed rendering hits. ' +
      'Corrects an earlier overstatement that the check was purely tautological.',
    source: 'codex/core/pixelbrain/temporal/temporal-governor.js certifyInterpolation',
  },

  // ── 2026-07-31 · NEGATIVE CONTROL ON THE INSTRUMENT ──────────────────
  // Read this before citing any row above that rests on a ranking alone.
  {
    // THE SECOND DISAGREEMENT, and worse than LBL-004. There the engine ranked
    // a true idea too LOW and a human overrode it. Here it ranked a FALSE idea
    // highest of all, under a prediction written before the numbers existed.
    tier: 'PHYSICAL',
    reaction: {
      a: 'content hash from the parser is the cache key parse once stamp once',
      b: 'incremental index invalidation recomputes only the entries that changed',
      product: 'the stamp index updates incrementally on file change so only touched files are reparsed',
    },
    outcome: 'REFUTED',
    evidence:
      'REFUTED BY GREP, NOT BY THE ENGINE — and the engine was right to abstain. This ' +
      'describes a cache that does not exist (buildStampIndex is a full rebuild). It took the ' +
      'highest RAW feasibility of a ten-reaction run at 0.2460, with the true ' +
      '"rare kinds carry the signal band 0 averages away" second at 0.2261. Under the margin ' +
      'law that is (0.2460-0.2261)/(0.2460-0.1994) = 0.427 against minMargin 0.5 → CLARIFY. ' +
      'The engine reported that it could not tell the two apart, which is exactly true: one is ' +
      'fiction and one is fact and it has no channel that distinguishes them. ' +
      'CORRECTION, same day: this row first read "ENGINE WAS WRONG, IN THE DANGEROUS ' +
      'DIRECTION" on the strength of raw ordering. That was the reviewer committing the error ' +
      'this whole calibration layer exists to prevent — a ranking is not a verdict, and the ' +
      'harness that produced it pre-registered predictions comparing raw feasibilities, which ' +
      'is a mis-specified test. Recorded rather than quietly amended.',
    source: 'scripts/concept-chem-absent-capability.mjs',
  },
  {
    tier: 'PHYSICAL',
    reaction: {
      a: 'unknown word resolves to empty declared absence never a guess',
      b: 'a resolver that always resolves is a check that cannot fail',
      product: 'refusing to resolve makes a coverage gap visible instead of filling it with confident noise',
    },
    outcome: 'CONFIRMED',
    evidence:
      'TRUE, BUILT, MEASURED — and it scored 0.1148, below the nonsense control (0.1458) and ' +
      'below the bar, so the gate never admitted it as a contender at all. Shipped in ' +
      '474cd6b1: the hash fallback is deleted and unknown lemmas return []. Independently ' +
      'measured over 68,480 WordNet lemmas — distinct primitive sets 1,473 to 3,552, singleton ' +
      'sets 208 to 2,324. The lesson is NOT that the engine inverted this one; the run returned ' +
      'Clarify and concluded nothing. It is that "does this capability exist" is OUT OF DOMAIN ' +
      'for an instrument built to rank rival hypotheses inside a settled frame. It has no ' +
      'channel that reads a codebase. Ask grep. Compare LBL-004, where a low score on a ' +
      'governance framing was also not a denial.',
    source: 'scripts/concept-chem-absent-capability.mjs + codex/core/semantic/wordnet-senses.js',
  },
]);

/**
 * What the CHEMISTRY ALONE concluded per run, once the scores were put through
 * the Semantic Calculus (scripts/*.mjs → chem-gate.js). Recorded 2026-07-30.
 *
 * This is the correction that matters most in this file. Every entry above was
 * written as though the ranking decided the question. It did not. Under the
 * margin law, four of five runs are Clarify or Theory — the chemistry could not
 * tell its top two apart, or nothing cleared the noise floor at all.
 *
 * The REFUTED entries above still stand, but NOT on the strength of the
 * ranking. They stand on architectural probes with receipts: BytecodeHealth has
 * zero generative surface; qbit-field.js already implements the Newtonian
 * kernel; the no-ingest render hashed identical to a 788-coordinate asset.
 *
 * THE CHEMISTRY RANKED. THE PROBE DECIDED. Whenever those two are conflated
 * again, this table is the evidence that they are different instruments.
 *
 * ── AUDIT, 2026-07-31 ─────────────────────────────────────────────────────
 *
 * After the engine failed its negative control (see the last two entries), the
 * whole ledger was re-read for which rows depend on a ranking and which carry
 * independent receipts. Of 18 entries, 13 cite a build, a measurement, a
 * mutation test or an architectural grep. FIVE rest on the ranking alone:
 *
 *   REFUTED  vri-health          "health supplies determinism the generator lacks"
 *   REFUTED  interlocutor        (both rows)
 *   REFUTED  paint-bucket        (both rows)
 *
 * All five are DENIALS, and all three CONFIRMED rows carry receipts. That
 * asymmetry is the good news and the warning at once.
 *
 * The warning: the 2026-07-31 run put a fluent FICTION at the highest raw
 * feasibility of ten, with a true statement 0.0199 behind it. Adjudicated, that
 * is a CLARIFY — the engine reported it could not tell them apart, and it was
 * right. But a denial from an instrument that cannot separate those two
 * populations is not a denial; it is an absence of evidence wearing a verdict's
 * clothes. Those five ideas are UNADJUDICATED, not refuted. Anyone re-proposing
 * one is owed an architectural probe, not a citation of this table.
 *
 * Note what the failure was NOT. The engine did not return a wrong answer. It
 * declined, correctly, to answer a question outside its domain: "does this
 * capability exist" is a fact about a codebase, and this instrument ranks rival
 * hypotheses inside a settled frame. The first version of these two entries
 * claimed an inversion on the strength of raw ordering — that was the reviewer
 * making the error, not the engine.
 *
 * The good news: no row that was ever acted on rests on a score. Every CONFIRMED
 * entry was built and measured, and the two rows that disagreed with the engine
 * (LBL-004 and the 2026-07-31 pair) were both settled by looking at the code.
 * The ledger's habit of demanding receipts is what makes this audit possible at
 * all — an instrument that logged only scores could not be audited this way.
 *
 * @type {ReadonlyArray<object>}
 */
export const RUN_GATE_VERDICTS = Object.freeze([
  {
    run: 'VRI × BytecodeHealth',
    kind: 'Theory',
    separation: null,
    note:
      'NOTHING cleared the noise floor — the file-hash false friend (0.4924) outscored ' +
      'every candidate. The run is unbound, not decided. Its own polarity check had ' +
      'already refused to certify (+0.0041). LBL-001/002 are REFUTED by the architectural ' +
      'probe, never by this ranking.',
  },
  {
    run: 'PixelBrain gravity',
    kind: 'Clarify',
    separation: 0.203,
    note:
      'Pairs H/meaning-buckets-for-pixels against A/attractor-is-a-signed-seed — the TWO ' +
      'HALVES of the original question, which were reported separately as one denied and ' +
      'one validated. The lattice sees a single unresolved slot where two confident answers ' +
      'were given. LBL-005 stands on qbit-field.js already implementing INVERSE_SQUARE.',
  },
  {
    run: 'The interlocutor',
    kind: 'Hypothesis',
    separation: 0.937,
    note:
      'THE ONE RUN THAT CONCLUDES. A/second-projection-not-negotiation takes 93.7% of the ' +
      'signal above noise, won both corpora, and survived as incumbent in the melanin run. ' +
      'Still capped at Hypothesis: a candidate binding, not executable, promotion needs a ' +
      'Probe plus human authority (F10).',
  },
  {
    run: 'The melanin fiche',
    kind: 'Clarify',
    separation: 0.022,
    note:
      '0.5052 vs 0.5001 between second-projection and the fiche carrier — genuinely ' +
      'indistinguishable, which is what a Clarify is for. LBL-010 (melanin itself) remains ' +
      'REFUTED on its own decisive control, not on this pairing.',
  },
  {
    run: 'Paint buckets × misattribution',
    kind: 'Clarify',
    separation: 0.139,
    note:
      'A/replay-the-reason vs A/extend-existing-gate-reasons, 0.3520 vs 0.3446. Both cleared ' +
      'the floor and neither separated. The honest read is that they are the same answer at ' +
      'two altitudes — recompute from the declared material, and put it in the existing ' +
      'gate taxonomy.',
  },
]);

/**
 * Build a populated label store from the ledger entries.
 * @returns {object} a frozen LabelStore with every entry appended in order
 */
export function buildLedger() {
  const store = createLabelStore();
  for (const entry of LEDGER_ENTRIES) store.append(entry);
  return store;
}
