/**
 * CALIBRATION CASE 001 — Determinism Purity Assay
 * ========================================================================
 * First known-positive in Concept Chemistry history.
 *
 * PREDICTION: The lab scored the "determinism purity QA tool" idea as
 * STABLE (feasibility 0.629) — the first reaction ever to cross the
 * STABLE_MIN threshold of 0.55. Three reactions crossed STABLE.
 *
 * OUTCOME: The assay was implemented and passed 33/33 tests with zero
 * regressions across 870 pixelbrain tests. The prediction was correct.
 *
 * PURPOSE: This file is calibration data. Future sessions use it to:
 *   1. Verify the lab's thresholds haven't drifted
 *   2. Anchor the STABLE/METASTABLE/UNSTABLE boundary to a real case
 *   3. Detect if weight changes would have misclassified this case
 *   4. Provide a regression test for the scoring formula
 *
 * DETERMINISM: All scores below were computed by the LIVE synthesize()
 * function with frozen weights W_BOND=0.15, W_GROUND=0.65, W_COHERE=0.20
 * and thresholds STABLE_MIN=0.55, METASTABLE_MIN=0.30. These are the
 * canonical weights. If you change them, this calibration case MUST still
 * classify correctly or the change is invalid.
 *
 * SCORES VERIFIED: 2026-07-30 by running synthesize() directly.
 */

export const CALIBRATION_ID = 'CAL-001';
export const CALIBRATION_DATE = '2026-07-30';
export const SCHEMA = 'PB-CHEM-CALIBRATION-v1';

// ─── Weights at time of prediction ───────────────────────────────────
export const WEIGHTS_AT_PREDICTION = Object.freeze({
  W_BOND: 0.15,
  W_GROUND: 0.65,
  W_COHERE: 0.20,
  STABLE_MIN: 0.55,
  METASTABLE_MIN: 0.30,
});

// ─── The prediction ──────────────────────────────────────────────────
// Full reaction table as scored by the LIVE concept-chemistry.js synthesize().
// groundingA/groundingB were estimated from substrate corpus attestation.
// All bond/coherence/feasibility values are EXACT outputs of synthesize().
export const REACTIONS = Object.freeze([
  Object.freeze({
    id: 'R1',
    label: 'determinism purity → existing infra',
    a: 'determinism purity measurement code chunk',
    b: 'immune scan drift detection law audit replay verification structural mutation',
    product: 'unified determinism purity score grade violations channels',
    groundingA: 0.85,
    groundingB: 0.90,
    // Live-scored results (verified 2026-07-30):
    bond: 0.0362,
    grounding: 0.875,
    coherence: 0.274,
    lawScale: 1.0,
    lawNote: 'LAW_ALIGNED',
    feasibility: 0.629,
    stability: 'STABLE',
  }),
  Object.freeze({
    id: 'R5',
    label: 'SYNTHESIS: all components → unified tool',
    a: 'immune scanner drift detector law audit replay verifier structural scanner',
    b: 'compose unify single purity assay score grade frozen checksum',
    product: 'determinism purity assay five channels weighted score deterministic',
    groundingA: 0.85,
    groundingB: 0.85,
    bond: -0.0124,
    grounding: 0.85,
    coherence: 0.2138,
    lawScale: 1.0,
    lawNote: 'LAW_ALIGNED',
    feasibility: 0.5934,
    stability: 'STABLE',
  }),
  Object.freeze({
    id: 'R0',
    label: 'FULL THESIS: determinism purity QA tool',
    a: 'QA tool determine purity determinism specific code chunk',
    b: 'scholomance codebase immune system drift law replay structural',
    product: 'deterministic purity assay unified score grade channels checksum',
    groundingA: 0.80,
    groundingB: 0.85,
    bond: 0.0143,
    grounding: 0.825,
    coherence: 0.2155,
    lawScale: 1.0,
    lawNote: 'LAW_ALIGNED',
    feasibility: 0.5815,
    stability: 'STABLE',
  }),
  Object.freeze({
    id: 'R2',
    label: 'QA tool → diagnostic scan + cleri probe',
    a: 'QA tool quality assurance automated check',
    b: 'diagnostic scan cleri probe hypothesis pathology evidence',
    product: 'automated quality gate diagnostic verdict evidence',
    groundingA: 0.80,
    groundingB: 0.85,
    bond: 0.0091,
    grounding: 0.825,
    coherence: 0.4643,
    lawScale: 0.7,
    lawNote: 'LAW_NEUTRAL',
    feasibility: 0.4413,
    stability: 'METASTABLE',
  }),
  Object.freeze({
    id: 'CTRL-FF',
    label: 'FALSE FRIEND: purity ≈ test coverage',
    a: 'code purity determinism measurement',
    b: 'test coverage percentage lines branches',
    product: 'purity score equals test coverage metric',
    groundingA: 0.75,
    groundingB: 0.80,
    bond: 0.0123,
    grounding: 0.775,
    coherence: 0.3275,
    lawScale: 0.7,
    lawNote: 'LAW_NEUTRAL',
    feasibility: 0.3998,
    stability: 'METASTABLE',
  }),
  Object.freeze({
    id: 'R3',
    label: 'code chunk → AST + file-level audit',
    a: 'code chunk file source content AST parse',
    b: 'innate scanner adaptive scanner protocol scanner per-file audit',
    product: 'file-level immune scan violations severity evidence',
    groundingA: 0.75,
    groundingB: 0.85,
    bond: -0.0196,
    grounding: 0.8,
    coherence: 0.1196,
    lawScale: 0.7,
    lawNote: 'LAW_NEUTRAL',
    feasibility: 0.3787,
    stability: 'METASTABLE',
  }),
  Object.freeze({
    id: 'R4',
    label: 'purity score → feasibility + determinismScore',
    a: 'purity score grade threshold classification',
    b: 'feasibility score stability class determinism score drift',
    product: 'weighted channel composition purity grade PURE TRACE CONTAMINATED TOXIC',
    groundingA: 0.65,
    groundingB: 0.75,
    bond: 0.2227,
    grounding: 0.7,
    coherence: 0.155,
    lawScale: 0.7,
    lawNote: 'LAW_NEUTRAL',
    feasibility: 0.3636,
    stability: 'METASTABLE',
  }),
  Object.freeze({
    id: 'CTRL-MT',
    label: 'METAPHOR: purity = chemical cleanliness',
    a: 'chemical purity clean contaminated toxic laboratory',
    b: 'code quality determinism verification testing',
    product: 'purity metaphor chemical cleanliness analogy',
    groundingA: 0.45,
    groundingB: 0.50,
    bond: 0.0524,
    grounding: 0.475,
    coherence: 0.2644,
    lawScale: 0.7,
    lawNote: 'LAW_NEUTRAL',
    feasibility: 0.2586,
    stability: 'UNSTABLE',
  }),
  Object.freeze({
    id: 'CTRL-LAW',
    label: 'LAW VIOLATION: stochastic purity',
    a: 'determinism purity measurement code',
    b: 'random stochastic probabilistic sampling',
    product: 'stochastic random purity score non-deterministic',
    groundingA: 0.80,
    groundingB: 0.85,
    bond: -0.0778,
    grounding: 0.825,
    coherence: 0.4701,
    lawScale: 0.0,
    lawNote: 'LAW_VIOLATION:random,stochastic',
    feasibility: 0.0,
    stability: 'UNSTABLE',
  }),
]);

// ─── The implementation outcome ──────────────────────────────────────
export const OUTCOME = Object.freeze({
  implemented: true,
  implementationDate: '2026-07-30',
  file: 'codex/core/pixelbrain/determinism-purity-assay.js',
  schema: 'PB-PURITY-ASSAY-v1',
  lines: 367,
  tests: Object.freeze({
    suiteFile: 'tests/codex/core/pixelbrain/determinism-purity-assay.test.js',
    passed: 33,
    failed: 0,
    total: 33,
  }),
  regressions: Object.freeze({
    pixelbrainSuites: 198,
    pixelbrainTests: 870,
    pixelbrainFailures: 0,
  }),
  channels: Object.freeze([
    'immune',    // weight 0.30 — innate.scanner.js direct + adaptive/protocol injected
    'drift',     // weight 0.25 — subtlety-drift.js detectDrift()
    'law',       // weight 0.20 — injected from MCP law_audit
    'replay',    // weight 0.15 — injected from MCP health_verify (100-iter)
    'structural',// weight 0.10 — injected from MCP scd64_scan
  ]),
  grades: Object.freeze(['PURE', 'TRACE', 'CONTAMINATED', 'TOXIC']),
  gradeThresholds: Object.freeze({ PURE: 0.90, TRACE: 0.70, CONTAMINATED: 0.40, TOXIC: 0.0 }),
  determinismProof: '100-iteration identical checksum verified in test suite',
  checksum: 'purity1:sha256[:16]',
});

// ─── Calibration verdict ─────────────────────────────────────────────
export const VERDICT = Object.freeze({
  predictionCorrect: true,
  predictedStability: 'STABLE',
  actualOutcome: 'IMPLEMENTED_AND_PASSING',
  confidence: 'HIGH',
  notes: [
    'First STABLE reaction in lab history (feasibility 0.629).',
    'Three reactions crossed STABLE threshold (R1, R5, R0).',
    'Grounding channel hit 0.875 — highest ever recorded.',
    'Law gate ALIGNED on all three STABLE reactions.',
    'False friend (purity ≈ coverage) correctly METASTABLE, below STABLE tier.',
    'Metaphor (chemical cleanliness) correctly UNSTABLE (0.2586).',
    'Law violation (stochastic purity) correctly killed at 0.000.',
    'STABLE reactions are exactly those with LAW_ALIGNED + high grounding.',
    'Every component existed in codebase before synthesis — composition, not invention.',
    'LAW_NEUTRAL penalty (0.7×) correctly demotes plausible-but-unaligned ideas.',
  ],
});

// ─── Calibration invariants ──────────────────────────────────────────
// These MUST hold for any future weight/threshold change to be valid.
export const INVARIANTS = Object.freeze({
  // The top reaction must remain STABLE
  topReactionMustBeStable: true,
  topReactionId: 'R1',
  topReactionMinFeasibility: 0.55,

  // Law violation must remain 0
  lawViolationMustBeZero: true,
  lawViolationId: 'CTRL-LAW',

  // False friend must score below the STABLE tier
  falseFriendBelowStable: true,
  falseFriendId: 'CTRL-FF',
  stableReactionIds: ['R0', 'R1', 'R5'],

  // Metaphor must be UNSTABLE
  metaphorMustBeUnstable: true,
  metaphorId: 'CTRL-MT',

  // Ranking must be preserved (by feasibility, descending)
  expectedRanking: ['R1', 'R5', 'R0', 'R2', 'CTRL-FF', 'R3', 'R4', 'CTRL-MT', 'CTRL-LAW'],
});
