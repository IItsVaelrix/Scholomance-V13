/**
 * AUDITION ROOM — parse-selection jury for constellation.
 *
 * Bonds create molecules; this room casts among projected answers.
 * Schema and pipeline benchmarked on the battle-tested G2P jury:
 *   codex/core/phonology/g2p/
 *
 * @module codex/core/constellation/audition
 */

export {
  AUDITION_JUROR_IDS,
  JUROR_WEIGHTS,
  FIDELITY_GRADES,
  POLICY_PASS,
  POLICY_WARN,
  POLICY_REJECT,
  POLICY_ERROR,
  POLICY_OFF,
  CANDIDATE_SOURCES,
  MAX_CANDIDATES,
  answerKey,
  computeWeightedScore,
  tallyJuryVotes,
  resolveWinner,
  rankUnderstudies,
  createDeterministicVerdict,
  createRuntimeDiagnostics,
  generateCandidateId,
  dedupeCandidates,
  isValidVote,
  isValidVerdict,
  isValidCandidate,
  verdictHash,
} from './schemas.js';

export {
  generateCandidates,
  generateFromComposeResult,
  generateFromAnswers,
} from './candidates/index.js';

export {
  createCoverageJuror,
  createContentHeadJuror,
  createClauseShapeJuror,
  createEnsembleJuror,
  createOrderJuror,
  isFunctionWord,
} from './jurors/index.js';

export {
  runAuditionJury,
  runVerificationTests,
} from './audition.adapter.js';
