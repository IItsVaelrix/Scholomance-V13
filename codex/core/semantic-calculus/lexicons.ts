/**
 * SEMANTIC CALCULUS — lexicons split by epistemic role (rev 7, P4)
 *
 * Three lexicons, three roles, three different questions:
 *
 *   action   what this app can DO          (verbs with formation formulas)
 *   surface  what this app can NAME        (referents for the {target} slot)
 *   inquiry  what this app can INVESTIGATE (Probe formulas)
 *
 * WHY THE SPLIT. Before this, one flat vocabulary answered all three, so
 * "why does Listen stutter?" was scored against npm scripts as though a
 * diagnosis were an action target. The CLI gate's proposer is fuzzy — it
 * scores every key and takes the top — so any diagnostic phrase sharing a
 * token with a script ("listen", "build") could out-score the inquiry
 * lexicon and arrive as a Do candidate. A diagnosis is not a thing to run.
 *
 * THE ROUTING RULE (the whole point of the phase):
 *
 *   An EXACT action bind wins.        Evidence beats shape.
 *   A FUZZY action score never wins.  A guess must not outrank a diagnosis.
 *
 * So an inquiry-shaped utterance is routed to the inquiry lexicon before the
 * fuzzy proposer is consulted at all. The worst case is Theory with a
 * procedure gap — nothing executes — which is the safe direction. The cost is
 * real and accepted: a script literally named for a symptom ("debug:jank")
 * can only be reached by command-shaped phrasing ("run debug:jank"), not by
 * "why is there jank". That is the correct trade. State supplies candidates
 * for a question, never the answer, and a symptom is a question.
 *
 * INVARIANT — inquiry entries can never become execution capabilities.
 * assertLexiconInvariants() enforces this structurally rather than by
 * convention: probe ids may not collide with formation ids, every probe is
 * read_only, and no probe id resolves through getFormation. A capability is
 * minted from a formation formula, so an inquiry entry that cannot reach one
 * cannot mint one.
 */

import { FORMATION_FORMULAS, getFormation } from './formulaRegistry.ts';
import {
  bindPattern,
  knownTargets,
  lexiconSize,
  resolveSlot,
  LEXICON_VERSION,
  type LexiconMatch,
  type SlotResolution,
} from './lexiconUi.ts';
import {
  PROBE_FORMULAS,
  bindInquiryProbe,
  listProbeIds,
  probeRegistryVersion,
  type ProbeFormula,
} from './probeRegistry.ts';
import type { TrustPartitionedContext } from './types.ts';

export type LexiconRole = 'action' | 'surface' | 'inquiry';

/**
 * Utterances the inquiry lexicon CLAIMS, whether or not a formula binds.
 *
 * Deliberately narrower than epistemic.ts's PROCEDURE_RE, which classifies a
 * gap after the fact and may be generous. This one takes an utterance away
 * from the action lexicon, so it only fires on shapes that cannot be a
 * command: a leading interrogative, or a symptom being reported.
 *
 * Bare imperatives ('debug the tests', 'diagnose it') are command-shaped and
 * deliberately NOT claimed — they name a procedure to run, not a question.
 */
const INQUIRY_CLAIM_RE =
  /(^\s*(why|how come|what'?s wrong|what is wrong|what makes|how is it that)\b)|(\b(stutter(s|ing)?|jank(y|ing)?|jitter(s|y)?|broken|blank|doesn'?t work|does not work|not work(ing)?|fail(s|ing|ure)?|regress(es|ion|ing)?|drops? frames?|off[- ]?screen|not show(ing)?)\b)/i;

export interface ActionLexicon {
  readonly role: 'action';
  readonly version: string;
  /** Exact parametric bind. undefined = a true miss, never a fuzzy guess. */
  bind(utterance: string, context: TrustPartitionedContext): LexiconMatch | undefined;
  size(): number;
}

export interface SurfaceLexicon {
  readonly role: 'surface';
  readonly version: string;
  resolve(raw: string, context: TrustPartitionedContext): SlotResolution;
  known(): string[];
}

export interface InquiryLexicon {
  readonly role: 'inquiry';
  readonly version: string;
  bind(utterance: string): ProbeFormula | undefined;
  ids(): string[];
  /** True when this utterance is the inquiry lexicon's to answer or to miss. */
  claims(utterance: string): boolean;
}

export interface SemanticLexicons {
  readonly action: ActionLexicon;
  readonly surface: SurfaceLexicon;
  readonly inquiry: InquiryLexicon;
}

export const LEXICONS: SemanticLexicons = Object.freeze({
  action: Object.freeze({
    role: 'action' as const,
    version: LEXICON_VERSION,
    bind: bindPattern,
    size: lexiconSize,
  }),
  surface: Object.freeze({
    role: 'surface' as const,
    version: LEXICON_VERSION,
    resolve: resolveSlot,
    known: knownTargets,
  }),
  inquiry: Object.freeze({
    role: 'inquiry' as const,
    version: probeRegistryVersion(),
    bind: bindInquiryProbe,
    ids: listProbeIds,
    claims: (utterance: string) => INQUIRY_CLAIM_RE.test(String(utterance ?? '')),
  }),
});

export const LEXICON_ROLE_ERRORS = Object.freeze({
  INQUIRY_IS_EXECUTABLE: 'SEMANTIC_CALCULUS_INQUIRY_IS_EXECUTABLE',
  ROLE_COLLISION: 'SEMANTIC_CALCULUS_LEXICON_ROLE_COLLISION',
} as const);

/**
 * Structural guarantee that an inquiry entry cannot become a Do.
 * Called at module load and asserted in tests; cheap enough to keep eager.
 */
export function assertLexiconInvariants(): void {
  for (const probe of PROBE_FORMULAS) {
    if (probe.maxRisk !== 'read_only') {
      throw new Error(LEXICON_ROLE_ERRORS.INQUIRY_IS_EXECUTABLE);
    }
    // A probe id that resolves through the formation registry could mint a
    // capability via the ordinary Do path. It must not be reachable there.
    if (getFormation(probe.id)) {
      throw new Error(LEXICON_ROLE_ERRORS.ROLE_COLLISION);
    }
    if (Object.prototype.hasOwnProperty.call(FORMATION_FORMULAS, probe.id)) {
      throw new Error(LEXICON_ROLE_ERRORS.ROLE_COLLISION);
    }
  }
  // Every mutating formation must belong to the action role. If an inquiry
  // formula ever declared 'mutate', the read_only plan contract would be a lie.
  const inquiryFormation = getFormation('inquiry.probe.v1');
  if (inquiryFormation && inquiryFormation.effect !== 'read') {
    throw new Error(LEXICON_ROLE_ERRORS.INQUIRY_IS_EXECUTABLE);
  }
}

assertLexiconInvariants();

/**
 * Which lexicon owns this utterance.
 *
 * `exactActionBind` is the caller's evidence that its action lexicon matched
 * EXACTLY (a parametric pattern hit), not that a scorer liked it. The UI path
 * passes the result of LEXICONS.action.bind; the CLI gate, whose proposer is
 * fuzzy by construction, passes false and therefore always yields inquiry to a
 * claimed utterance.
 */
export function routeUtterance(input: {
  utterance: string;
  exactActionBind: boolean;
}): LexiconRole {
  if (input.exactActionBind) return 'action';
  if (LEXICONS.inquiry.claims(input.utterance) || LEXICONS.inquiry.bind(input.utterance)) {
    return 'inquiry';
  }
  return 'surface';
}

/** Version identity across all three roles, for compiler identity / replay. */
export function lexiconsVersion(): string {
  return [
    `action@${LEXICONS.action.version}`,
    `surface@${LEXICONS.surface.version}`,
    `inquiry@${LEXICONS.inquiry.version}`,
  ].join('+');
}
