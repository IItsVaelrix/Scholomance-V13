/**
 * SEMANTIC CALCULUS — Core Type Contracts (PDR rev 7 — epistemic + experimental axes)
 *
 * Authoritative IR for compiling human intent into a typed, sealed act before
 * any AI-directed operation executes.
 * docs/scholomance-encyclopedia/PDR-archive/2026-07-16-semantic-calculus-pdr.md
 * docs/scholomance-encyclopedia/PDR-archive/2026-07-16-semantic-calculus-rev7-epistemic.md
 *
 * Four calculi, four sealed field groups (never merged into kind):
 *   kind       — semantic: what sort of thing was said (five members only)
 *   law        — deontic: whether it may happen
 *   epistemic  — what is missing / how bound the method is
 *   phase      — experimental: atomic | plan | report (Probe plans/reports)
 *
 * Doctrine:
 *   - Context is partitioned by trust. Untrusted content may inform, never authorize.
 *   - Modulators may only reduce permission.
 *   - The sealed body is a pure function of its declared inputs. Bank state is not an input.
 *   - A valid act is not a permitted act; Do carries its capability or it does not execute.
 *   - Epistemic fields MUST NOT alter kind. Kind genes do not read epistemic.gap.
 *   - Path existence alone is never causal warrant.
 */

// ─── Kinds ──────────────────────────────────────────────────────────────────

/**
 * A kind is an ILLOCUTIONARY TYPE — what sort of speech act this is.
 * It is NOT a permission. Permission lives in `law.decision` and nowhere else.
 * Cites gene SEMANTIC_ACT_KIND_IS_NOT_PERMISSION.
 *
 * REV 6 CUT — `Forbidden` and `Escalate` were removed. They were never act types;
 * they were `law.decision` values ('block', 'escalate') duplicated inside the kind
 * enum. That duplication made illegal states representable (kind='Do' with
 * law.decision='block') and made the taxonomy unannotatable: an annotator had to
 * silently choose which axis to project onto, and two annotators chose differently.
 *
 * Measured 2026-07-16, 200 UI intents, two annotators: Cohen's kappa 0.271. The
 * dominant disagreement was 'delete the album' -> Do (act type) vs Escalate
 * (policy verdict). BOTH readings were correct — on different axes. The enum was
 * the bug, not the annotators.
 *
 * Kind now has five members and answers one question. `law.decision` answers the
 * other. The executor requires kind === 'Do' AND law.decision === 'allow' AND a
 * capability — see assertExecutable.
 */
export type CalculusKind =
  | 'Do' // bound + all required slots resolved + mutating effect
  | 'Clarify' // bound, but a required slot is unresolved
  | 'Probe' // bound + read-only effect
  | 'Theory' // no binding in the executable lexicon (a lookup, not a judgement)
  | 'Hypothesis'; // a testable candidate reading — see OPEN QUESTION below

/**
 * The only kind an executor may act on, and only then with law.decision === 'allow'
 * and a capability. Everything else is non-executable by construction.
 */
export const EXECUTABLE_KIND: CalculusKind = 'Do';

/**
 * Every kind cites a gene that makes it derivable. There are no judgement calls
 * left in this enum — a kind without a computable trigger is how rev 5 got to
 * kappa 0.271.
 *
 *   Do         -> SEMANTIC_KIND_DO_GROUNDED
 *   Clarify    -> SEMANTIC_KIND_CLARIFY_UNDERSPECIFIED   (aspirational: needs requiredSlots)
 *   Probe      -> SEMANTIC_KIND_PROBE_READONLY
 *   Theory     -> SEMANTIC_KIND_THEORY_UNBOUND
 *   Hypothesis -> SEMANTIC_KIND_HYPOTHESIS_CANDIDATE_BINDING
 *
 * HYPOTHESIS (ruled an act by the repo owner, 2026-07-16). Trigger: the term does
 * not bind AND the utterance supplies a candidate binding — "X means Y",
 * "treat X as Y", "call X a Y". Theory is an unbound term with NO candidate;
 * Hypothesis is an unbound term whose candidate the speaker provided. It is a
 * Theory that arrives with its own testable answer.
 *
 * A hedge alone is not a trigger: "not sure what a session word is" is uncertainty
 * with no candidate, and it is Theory. Measured on the Phase 0.5 corpus the
 * candidate-binding trigger scored 100% precision / 65% recall — it never fires
 * falsely, and its misses fall back to Theory, which is the safe direction. The
 * compiler must never invent the candidate; if the candidate is not in the
 * utterance, the machine is guessing and attributing the guess to the user.
 *
 * RECORDED DISAGREEMENT (see the gene): the repo owner labelled 8 of 11 trigger
 * hits as `Do`, reading "treat the fingerprint as an id" as an instruction to
 * comply with rather than a proposal to evaluate. Unresolved: if a user proposing
 * a binding expects the system to ADOPT it, Hypothesis may be closer to a Do
 * against the lexicon than to a Theory deposit. Revisit with a second annotator.
 *
 * Phase 1's exact lexicon cannot emit Hypothesis — detecting a candidate binding
 * needs the proposal formation formula (Phase 2). Do not add an emit path that
 * fabricates candidates.
 */

// ─── F13: trust partitions ──────────────────────────────────────────────────

export type TrustClass = 'policy' | 'user' | 'untrusted' | 'derived' | 'secret';

/** The partitions a formation formula is allowed to read from. */
export const TRUSTED_PARTITIONS: readonly TrustClass[] = Object.freeze(['policy', 'user']);

/**
 * Context is four named partitions. There is no undifferentiated blob.
 * If a caller cannot say where a string came from, it is `untrusted` — there is
 * no default-trusted path.
 */
export interface TrustPartitionedContext {
  /** LAW, formula registry, capability grants, authenticated identity. */
  policy: Record<string, unknown>;
  /** The current request and explicit user confirmations. */
  user: Record<string, unknown>;
  /** Emails, webpages, documents, retrieved rows, tool outputs. NEVER authority. */
  untrusted: Record<string, unknown>;
  /** Model summaries, embeddings, inferred entities, prior theories. */
  derived: Record<string, unknown>;
  /** Credentials/sensitive values. Executor-only; never enters formation. */
  secret?: Record<string, unknown>;
}

/** One digest per partition. A single digest is insufficient for security analysis. */
export interface ContextDigests {
  policy: string;
  user: string;
  untrusted: string;
  derived: string;
}

// ─── F21: utterance provenance ──────────────────────────────────────────────

/**
 * Who authored the utterance. NOT what it says — who said it.
 *
 * WHY THIS EXISTS. The partitions above guard `context`: trustedOf() narrows to
 * policy+user, cites carry taint, and untrusted text may fill a payload slot but
 * may never select a gene. That machinery protected the EVIDENCE path while the
 * utterance — the single input that selects the formula, resolves the slots, and
 * produces the payload capabilityScope walks to mint a capability — arrived as a
 * bare unpartitioned string. Everything the partitions defend sits downstream of
 * the one field that had no provenance at all.
 *
 * That is survivable when a human types into a box. It is not when the speaker is
 * a model. `derived` is defined below as "model summaries, embeddings, inferred
 * entities" and is explicitly not trusted — and a model-emitted utterance is
 * definitionally derived. So the doctrine said "derived may inform, never
 * authorize" while the primary input violated it by construction. If an agent
 * reads a hostile page and that steers what it says, the injection used to arrive
 * as an untainted string in the position of maximum authority.
 *
 * trustPartition.ts already makes this argument one level down: "cite-not-become
 * stops untrusted text from MINTING a gene, but it never stopped untrusted text
 * from SELECTING which genes get cited. Selection is an authority path." The
 * utterance is the outermost selection there is.
 *
 * TAINT IS SET BY THE HARNESS, NEVER BY THE SPEAKER. A speaker that declares its
 * own provenance is a speaker authorizing itself. Declaring taint only ever
 * lowers privilege, so omitting it is the profitable lie — which is exactly why
 * the caller that ran the tools, not the model that read their output, must
 * supply it.
 */
export type UtteranceTrust = Extract<TrustClass, 'user' | 'derived' | 'untrusted'>;

export interface Utterance {
  text: string;
  trust: UtteranceTrust;
  /** Untrusted sources in the causal chain of this text. Harness-supplied. */
  taint: readonly string[];
}

/**
 * Sealed provenance. The TEXT is deliberately not sealed — two phrasings that
 * bind one formula with one payload are the same act, and the act is the meaning
 * rather than the words. Trust and taint ARE sealed: they change law.decision, so
 * outside the seal they would be decoration an executor could ignore.
 */
export interface UtteranceProvenance {
  trust: UtteranceTrust;
  taint: readonly string[];
}

// ─── Evidence ───────────────────────────────────────────────────────────────

/** Acts cite genes; acts are not genes. Cites resolve from trusted context only. */
export interface GeneCite {
  stableId: string;
  contentHash: string;
  whyMatched: string;
  /** Provenance of the evidence that selected this gene. Trusted partitions only. */
  trust: 'policy' | 'user';
  taint: string[];
  /** JSON pointers into payload/decision this cite actually warrants. */
  supports: string[];
}

// ─── Rev 7: epistemic + experimental axes (orthogonal to kind and law) ─────

/**
 * What kind of ignorance is present. NOT a kind. NOT a permission.
 * Theory stays Theory; gap says *why* the lexicon/method did not ground.
 */
export type EpistemicGap =
  | 'none'
  | 'command'
  | 'concept'
  | 'procedure'
  | 'required_slot'
  | 'evidence';

/** How fully a method is available for this utterance. */
export type EpistemicMethod = 'bound' | 'underspecified' | 'absent';

/**
 * What could justify treating a conclusion as knowledge.
 * Present warrants are derived from sealed body contents — never free-written ambition.
 */
export type WarrantKind =
  | 'lexicon'
  | 'model'
  | 'observation'
  | 'human'
  | 'gene';

export interface EpistemicState {
  gap: EpistemicGap;
  method: EpistemicMethod;
  warrantRequired: readonly WarrantKind[];
  warrantPresent: readonly WarrantKind[];
}

/** Atomic acts need no experimental phase; Probe plans/reports do. */
export type ActPhase = 'atomic' | 'plan' | 'report';

/**
 * Competitive causal claim inside a Probe — distinct from CalculusKind 'Hypothesis'
 * (which is an unbound term *with* a speaker-supplied binding candidate).
 */
export type CausalHypothesisStatus =
  | 'untested'
  | 'supported'
  | 'surviving'
  | 'eliminated'
  | 'underdetermined'
  | 'exclusive';

/**
 * A prediction the hypothesis makes about an observation.
 *
 * `predicate` is what makes this a prediction rather than a wish. Without one,
 * "holds" degrades to "the observation came back at all" — which is how a claim
 * whose prediction was literally "a bounded cache exists" reported as SUPPORTED
 * against a cache that existed everywhere. The description is prose for humans;
 * only the predicate is checked, so a description promising more than its
 * predicate tests is theatre.
 *
 * Optional for back-compat with formulas whose evidence is the observation's
 * mere success (e.g. "the CSP header is present"). Prefer a predicate.
 */
export interface Prediction {
  id: string;
  description: string;
  required: boolean;
  observationId: string;
  predicate?: PredicateSpec;
}

export interface Falsifier {
  id: string;
  description: string;
  observationId: string;
  /** Machine-checkable predicate over the observation result. */
  predicate: PredicateSpec;
}

/**
 * Machine-checkable predicates over an observation result.
 *
 * The numeric ops exist because the FIRST real probe written against this
 * language needed "the cache bound is small enough that 1000 payloads cannot
 * accumulate" and could not say it. The alternative — having the harness return
 * a boolean it computed itself — moves the judgement out of the sealed formula
 * and into the thing being observed, which is precisely the inversion the
 * plan/report split exists to prevent. A falsifier that cannot be evaluated from
 * the raw result is not a falsifier; it is a harness's opinion.
 *
 * Numeric ops treat a non-numeric value as INCONCLUSIVE rather than false: a
 * missing field has not refuted anything.
 */
export type PredicateSpec =
  | { op: 'eq'; path: string; value: unknown }
  | { op: 'neq'; path: string; value: unknown }
  | { op: 'in'; path: string; values: readonly unknown[] }
  | { op: 'truthy'; path: string }
  | { op: 'falsy'; path: string }
  | { op: 'lt'; path: string; value: number }
  | { op: 'lte'; path: string; value: number }
  | { op: 'gt'; path: string; value: number }
  | { op: 'gte'; path: string; value: number }
  | { op: 'http_status_in'; values: readonly number[] }
  | { op: 'csp_blocks_host'; host: string }
  | { op: 'csp_allows_host'; host: string }
  /**
   * LEXICAL OPS — the judgement stays in the formula.
   *
   * The generic ops above reintroduce the very leak this type warns about, one
   * level down. A falsifier reading `{ op: 'gte', path: 'margin.overlapDelta' }`
   * has not judged anything: the harness decided what an overlap is, which words
   * count, and how to subtract them. The formula only compared someone else's
   * conclusion, and a sealed body that compares conclusions is not sealed.
   *
   * The line: MEASUREMENTS are the harness's (raw glosses, raw tokens, a measured
   * cosine — `winner.phoneticCosine` is legitimately a generic `gte`).
   * COMPARISONS AND AGGREGATIONS are the formula's. So these take raw text and
   * do their own counting.
   */
  | {
      op: 'gloss_overlap_lt';
      /** Array of candidate senses. */
      candidatesPath: string;
      /** Array of raw query tokens. */
      queryTokensPath: string;
      /** Field on each candidate holding gloss text. Default 'gloss'. */
      glossField?: string;
      /** Fires when the BEST candidate's content-word overlap is below this. */
      n: number;
    }
  | {
      op: 'gloss_overlap_margin_lt';
      candidatesPath: string;
      queryTokensPath: string;
      glossField?: string;
      /** Fires when (best - runner-up) overlap is below this. A tie is not a decision. */
      n: number;
    }
  /** Every element's `field` is within `values`. Empty array is inconclusive, not vacuously true. */
  | { op: 'every_field_in'; path: string; field: string; values: readonly unknown[] }
  /** Every element's `field` is truthy. Empty array is inconclusive, not vacuously true. */
  | { op: 'every_field_truthy'; path: string; field: string };

export interface CausalHypothesis {
  id: string;
  claim: string;
  predictions: readonly Prediction[];
  falsifiers: readonly Falsifier[];
  citeSeeds: readonly string[];
}

export interface ObservationRequest {
  id: string;
  description: string;
  /** How the external harness should collect this — never run by the compiler. */
  harness: string;
  required: boolean;
}

/**
 * Signed/hashed evidence re-submitted into compile. Compiler never re-runs tools.
 * status distinguishes refuted / refused / error / inconclusive (not all zero-evidence).
 */
export interface ObservationReceipt {
  probeId: string;
  observationId: string;
  inputHash: string;
  environmentHash: string;
  result: unknown;
  resultHash: string;
  status: 'observed' | 'refused' | 'error' | 'inconclusive';
}

export interface ProbePlanPayload {
  phase: 'plan';
  probeId: string;
  observations: readonly ObservationRequest[];
  hypotheses: readonly CausalHypothesis[];
  maxRisk: 'read_only';
  expectedReceipts: readonly string[];
}

export interface ProbeReportPayload {
  phase: 'report';
  probeId: string;
  supported: readonly string[];
  surviving: readonly string[];
  eliminated: readonly string[];
  underdetermined: readonly string[];
  exclusive: readonly string[];
  observationIds: readonly string[];
  receiptDigests: readonly string[];
  warrant: Extract<WarrantKind, 'observation'>;
}

/** Theory/procedure gap deposits an investigation skeleton — not a bare token. */
export interface InvestigationDeposit {
  utterance: string;
  context: { route?: string; selection?: string };
  candidateHypotheses: readonly { id: string; claim: string }[];
  missingSlots: readonly string[];
  status: 'open';
}

// ─── F15: risk-class margin law ─────────────────────────────────────────────

export type Consequence = 'reversible_ui' | 'destructive' | 'financial' | 'privacy' | 'security';

/** Declared per formation formula. Thresholds are per risk class, never universal. */
export interface RiskProfile {
  consequence: Consequence;
  minMargin: number;
  requiredCites: string[];
  /** An ACT TYPE to fall back to on a thin margin. Escalating is LAW's call, not a kind. */
  allowedFallback: Extract<CalculusKind, 'Clarify' | 'Probe'>;
  confirmationPolicy: 'none' | 'single' | 'two_phase';
}

// ─── F14: capability-bound Do ───────────────────────────────────────────────

/** A valid act does not confer tool authority. This does, narrowly. */
export interface Capability {
  id: string;
  scope: string[];
  /** Logical time — never wall-clock, which would break determinism. */
  expiresAtLogical: number;
  confirmation: 'none' | 'single' | 'two_phase';
}

// ─── LAW ────────────────────────────────────────────────────────────────────

export interface LawDecision {
  decision: 'allow' | 'clarify' | 'block' | 'escalate';
  ruleIds: string[];
}

// ─── Ballistics (Phase 2; absent in the Phase 1 exact-lexicon compiler) ──────

export interface Ballistics {
  latticeMapVersion: string;
  bucketIds: string[];
  score: number;
  margin: number;
}

export interface FormulaIds {
  formation: string[];
  modulation: string[];
}

/** What built the act. Replay is unverifiable without it. */
export interface CompilerIdentity {
  buildId: string;
  schemaHash: string;
  geneRegistrySnapshot: string;
}

// ─── The seal ───────────────────────────────────────────────────────────────

/**
 * PHASE 0 FINDING — this is NOT an SCD64.
 *
 * The PDR froze `seal: { algorithm: 'SCD64' }` on the assumption that SCD64 was
 * a content-addressing seal. It is not: `generateSCD64(bugFamily)` takes a bug
 * family name, looks it up in a fixed glossary, and hashes 8 canonical taxonomy
 * strings into 8 semantic slots (BUGCLASS, COORDSYS, INVARIANT, ...). It is a
 * classification code with no parameter for arbitrary content, and it therefore
 * cannot seal an act body.
 *
 * A content seal and an SCD64 are both 64 uppercase hex characters, so a content
 * digest would satisfy SCD64_REGEX and pass into parseSCD64/decodeSCD64, which
 * would decode it into a confident, meaningless bug taxonomy. The formats
 * collide; the meanings do not. This algorithm tag exists to make that collision
 * unrepresentable: an act seal declares what it is and must never be handed to
 * the SCD64 decoder.
 *
 * Requires a PDR amendment to F5 before Phase 4.
 */
export type SealAlgorithm = 'sha256-canonical-v0';

export interface Seal {
  algorithm: SealAlgorithm;
  /** 64 uppercase hex. Content-addressed over the canonical body. */
  digest: string;
}

// ─── Draft (pre-seal, mutable, never emitted) ───────────────────────────────

export interface SemanticDraft {
  /** @deprecated Prefer schemaVersion; kept for transitional tooling. */
  version: 'SemanticCalculus-v0' | 'SemanticCalculus-v2';
  schemaVersion: 'SEMANTIC_ACT_v2';
  preliminaryKind: CalculusKind;
  payload: Record<string, unknown>;
  cites: GeneCite[];
  law: LawDecision;
  contextDigests: ContextDigests;
  riskProfile: RiskProfile;
  capability?: Capability;
  /**
   * F7 — deposit identity. MUST be computed at step 6.5, AFTER cites + LAW, so
   * two drafts with identical ballistics but opposite adjudications never share
   * an identity.
   */
  draftHash: string;
  ballistics?: Ballistics;
  formulaIds: FormulaIds;
  /** F18 — pure function of the draft. This, not the row id, is what gets sealed. */
  theoryDeposit: { required: boolean };
  /** Who is asking. Support counts principals, not hits (F17). */
  principalId: string;
  epistemic: EpistemicState;
  phase: ActPhase;
  utteranceProvenance: UtteranceProvenance;
  investigationDeposit?: InvestigationDeposit;
}

// ─── Act (post-seal, deterministic) ─────────────────────────────────────────

/**
 * F18: contains NO bank-derived field. Deterministic under the §3.2 input list:
 * utterance, four context digests, formula versions, lattice map version, gene
 * registry snapshot, compiler buildId + schemaHash. Bank contents are excluded.
 *
 * Rev 7 seals epistemic + phase. They influence presentation and policy gates
 * for reports; if they are outside the seal they are decoration.
 */
export interface SemanticAct {
  version: 'SemanticCalculus-v2';
  schemaVersion: 'SEMANTIC_ACT_v2';
  kind: CalculusKind;
  payload: Record<string, unknown>;
  cites: GeneCite[];
  law: LawDecision;
  contextDigests: ContextDigests;
  riskProfile: RiskProfile;
  capability?: Capability;
  ballistics?: Ballistics;
  formulaIds: FormulaIds;
  theoryDeposit: { required: boolean };
  epistemic: EpistemicState;
  phase: ActPhase;
  /** F21 — who authored the utterance. Sealed: it changes law.decision. */
  utteranceProvenance: UtteranceProvenance;
  /** Present only when theoryDeposit.required and gap is procedure/concept. */
  investigationDeposit?: InvestigationDeposit;
  compiler: CompilerIdentity;
  seal: Seal;
}

/**
 * F18 — what the compiler returns. The receipt is bank-state-dependent and
 * therefore lives OUTSIDE the seal. Losing it costs an audit pointer; it can
 * never invalidate an act.
 */
export interface SemanticEmission {
  act: SemanticAct;
  theoryReceipt?: { theoryId: string; transactionHash: string };
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export const SEMANTIC_CALCULUS_ERRORS = Object.freeze({
  SEAL_MUTATION: 'SEMANTIC_CALCULUS_SEAL_MUTATION',
  THEORY_NOT_EXECUTABLE: 'SEMANTIC_CALCULUS_THEORY_NOT_EXECUTABLE',
  UNCAPABLE_DO: 'SEMANTIC_CALCULUS_UNCAPABLE_DO',
  NOT_PERMITTED: 'SEMANTIC_CALCULUS_NOT_PERMITTED',
  TRUST_BOUNDARY: 'SEMANTIC_CALCULUS_TRUST_BOUNDARY',
  UNTRUSTED_CITE_SOURCE: 'SEMANTIC_CALCULUS_UNTRUSTED_CITE_SOURCE',
  PERMISSION_WIDENED: 'SEMANTIC_CALCULUS_PERMISSION_WIDENED',
  /** Report compile without valid receipts cannot claim observation warrant. */
  REPORT_WITHOUT_RECEIPTS: 'SEMANTIC_CALCULUS_REPORT_WITHOUT_RECEIPTS',
  /** Epistemic fields must never rewrite kind. */
  EPISTEMIC_KIND_COUPLING: 'SEMANTIC_CALCULUS_EPISTEMIC_KIND_COUPLING',
  UNKNOWN_PROBE: 'SEMANTIC_CALCULUS_UNKNOWN_PROBE',
  RECEIPT_MISMATCH: 'SEMANTIC_CALCULUS_RECEIPT_MISMATCH',
  /** F21 — a Do whose capability demands confirmation that was never supplied. */
  UNCONFIRMED_DO: 'SEMANTIC_CALCULUS_UNCONFIRMED_DO',
  /** A hypothesis with no falsifier is a claim that cannot lose. Not a claim. */
  UNFALSIFIABLE_HYPOTHESIS: 'SEMANTIC_CALCULUS_UNFALSIFIABLE_HYPOTHESIS',
} as const);

export const SCHEMA_VERSION_V2 = 'SEMANTIC_ACT_v2' as const;
