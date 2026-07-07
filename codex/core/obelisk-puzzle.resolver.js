import { calculateSyntacticBridge } from './spellweave.engine.js';
import { hashString } from './pixelbrain/shared.js';
import { tokenize } from './tokenizer.js';
import {
  OBELISK_DISCOVERY_EVENTS,
  OVERLOAD_LEXEMES,
  OVERLOAD_MODIFIERS,
  OVERLOAD_WEAVE_INTENTS,
  SIPHON_LEXEMES,
  SIPHON_MODIFIERS,
  SIPHON_WEAVE_INTENTS,
} from './obelisk-puzzle.signals.js';

export const OVERLOAD_THRESHOLD = 0.72;
export const SIPHON_THRESHOLD = 0.68;

export const OBELISK_REJECT_REASONS = Object.freeze({
  INACTIVE: 'inactive',
  NOT_ADJACENT: 'not_adjacent',
  BAD_PHASE: 'bad_phase',
  LOW_CHARGE: 'low_charge',
  WEAK_BINDING: 'weak_binding',
  COLLAPSED: 'collapsed',
});

const SEED_SEPARATOR = '␟';

function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizedTokenSet(text) {
  return new Set(tokenize(text).map((token) => token.toLowerCase()));
}

function countLexemeScore(tokens, lexemes) {
  let score = 0;
  for (const lexeme of lexemes) {
    if (tokens.has(lexeme)) score += 0.08;
  }
  return Math.min(0.4, score);
}

function phaseSeed({ verse, weave, phase }) {
  return hashString(`${verse || ''}${SEED_SEPARATOR}${weave || ''}${SEED_SEPARATOR}${phase || ''}`) >>> 0;
}

function getBridge(castSnapshot) {
  if (castSnapshot?.bridge) return castSnapshot.bridge;
  if (castSnapshot?.combatScore?.bridge) return castSnapshot.combatScore.bridge;
  return calculateSyntacticBridge({
    verse: castSnapshot?.verse || '',
    weave: castSnapshot?.weave || '',
    dominantSchool: castSnapshot?.combatScore?.school || 'WILL',
  });
}

function hasAny(values, accepted) {
  return values.some((value) => accepted.includes(String(value || '').toUpperCase()));
}

function scoreOverload({ tokens, bridge, phase, intensity }) {
  let score = countLexemeScore(tokens, OVERLOAD_LEXEMES);
  if (
    bridge?.school === 'SONIC'
    || hasAny(bridge?.intents || [], OVERLOAD_WEAVE_INTENTS)
  ) {
    score += 0.2;
  }
  if (hasAny(bridge?.clauses?.flatMap((clause) => clause.modifiers || []) || [], OVERLOAD_MODIFIERS)) {
    score += Math.min(0.16, (Number(bridge?.syntax?.modifierPower) || 1) - 1);
  }
  score += Math.min(0.1, (Number(bridge?.syntax?.legalOrder) || 0) * 0.1);
  if (bridge?.chainType === 'SEQUENCE') score += 0.15;
  if (phase === 'charge') score += intensity * 0.25;
  if (phase === 'discharge') score += 0.2;
  if (bridge?.collapsed) score -= 0.35;
  return score;
}

function scoreSiphon({ tokens, bridge, phase, intensity }) {
  let score = countLexemeScore(tokens, SIPHON_LEXEMES);
  if (
    bridge?.school === 'VOID'
    || bridge?.school === 'PSYCHIC'
    || hasAny(bridge?.intents || [], SIPHON_WEAVE_INTENTS)
  ) {
    score += 0.15;
  }
  if (bridge?.chainType === 'SUSTAINED') score += 0.2;
  score += Math.min(0.1, (Number(bridge?.syntax?.legalOrder) || 0) * 0.1);
  const modifiers = bridge?.clauses?.flatMap((clause) => clause.modifiers || []) || [];
  for (const modifier of SIPHON_MODIFIERS) {
    if (modifiers.includes(modifier)) score += 0.1;
  }
  if (phase === 'charge') score += intensity * 0.25;
  if (bridge?.collapsed) score -= 0.35;
  return score;
}

function scoringPhase(phase, intensity) {
  if (phase === 'charge' || phase === 'discharge') return phase;
  if (phase === 'cooldown' && intensity >= 0.12) return 'charge';
  return phase;
}

function buildObeliskRejection(obeliskSnapshot, castSnapshot, { overloadScore, siphonScore, bridge, phase, intensity }) {
  const state = obeliskSnapshot.state || 'active';
  if (state !== 'active') {
    return Object.freeze({
      kind: 'none',
      reason: OBELISK_REJECT_REASONS.INACTIVE,
      displayText: 'too late...',
      hint: 'The obelisk compartment is already open.',
      phase,
      intensity,
    });
  }

  if (!castSnapshot.playerAdjacent) {
    return Object.freeze({
      kind: 'none',
      reason: OBELISK_REJECT_REASONS.NOT_ADJACENT,
      displayText: 'too far...',
      hint: 'Move adjacent to the central obelisk before casting.',
      phase,
      intensity,
    });
  }

  if (phase === 'cooldown') {
    return Object.freeze({
      kind: 'none',
      reason: OBELISK_REJECT_REASONS.BAD_PHASE,
      displayText: 'timing...',
      hint: 'Cast while the runes swell or during the discharge flash.',
      phase,
      intensity,
      overloadScore,
      siphonScore,
    });
  }

  if (phase !== 'charge' && phase !== 'discharge') {
    return Object.freeze({
      kind: 'none',
      reason: OBELISK_REJECT_REASONS.BAD_PHASE,
      displayText: 'timing...',
      hint: 'The obelisk rhythm is between windows.',
      phase,
      intensity,
      overloadScore,
      siphonScore,
    });
  }

  if (bridge?.collapsed) {
    return Object.freeze({
      kind: 'none',
      reason: OBELISK_REJECT_REASONS.COLLAPSED,
      displayText: 'syntax frayed...',
      hint: 'Simplify the weave — the clause collapsed.',
      phase,
      intensity,
      overloadScore,
      siphonScore,
    });
  }

  const leaningSiphon = siphonScore >= overloadScore;
  const nearSiphon = siphonScore >= SIPHON_THRESHOLD * 0.88;
  const nearOverload = overloadScore >= OVERLOAD_THRESHOLD * 0.88;

  if (phase === 'charge' && intensity < 0.42 && (nearSiphon || nearOverload)) {
    return Object.freeze({
      kind: 'none',
      reason: OBELISK_REJECT_REASONS.LOW_CHARGE,
      displayText: 'timing...',
      hint: leaningSiphon
        ? 'Wait for the runes to swell before siphoning.'
        : 'Wait for peak charge or the discharge flash.',
      phase,
      intensity,
      overloadScore,
      siphonScore,
    });
  }

  return Object.freeze({
    kind: 'none',
    reason: OBELISK_REJECT_REASONS.WEAK_BINDING,
    displayText: leaningSiphon ? 'weak siphon...' : 'weak overload...',
    hint: leaningSiphon
      ? 'Bind drain / leech grammar to the obelisk.'
      : 'Bind thunder / resonate grammar to the obelisk.',
    phase,
    intensity,
    overloadScore,
    siphonScore,
  });
}

export function resolveObeliskPuzzle(obeliskSnapshot = {}, castSnapshot = {}) {
  const rawPhase = obeliskSnapshot.phase;
  const intensity = clamp01(obeliskSnapshot.intensity);
  const verse = castSnapshot.verse || castSnapshot.text || '';
  const weave = castSnapshot.weave || '';
  const tokens = normalizedTokenSet(`${verse} ${weave}`);
  const bridge = getBridge({ ...castSnapshot, verse, weave });
  const phase = scoringPhase(rawPhase, intensity);
  const overloadScore = scoreOverload({ tokens, bridge, phase, intensity });
  const siphonScore = scoreSiphon({ tokens, bridge, phase, intensity });
  const seed = phaseSeed({ verse, weave, phase: rawPhase });
  const rejectionContext = { overloadScore, siphonScore, bridge, phase: rawPhase, intensity };
  const state = obeliskSnapshot.state || 'active';

  if (
    state !== 'active'
    || !castSnapshot.playerAdjacent
    || rawPhase === 'cooldown'
    || (rawPhase !== 'charge' && rawPhase !== 'discharge')
    || bridge?.collapsed
  ) {
    return buildObeliskRejection(obeliskSnapshot, castSnapshot, rejectionContext);
  }

  const nearSiphon = siphonScore >= SIPHON_THRESHOLD * 0.88;
  const nearOverload = overloadScore >= OVERLOAD_THRESHOLD * 0.88;
  if (rawPhase === 'charge' && intensity < 0.42 && (nearSiphon || nearOverload)) {
    return buildObeliskRejection(obeliskSnapshot, castSnapshot, rejectionContext);
  }

  if (overloadScore >= OVERLOAD_THRESHOLD && overloadScore > siphonScore) {
    return Object.freeze({
      kind: 'overload',
      score: overloadScore,
      events: Object.freeze([{ type: OBELISK_DISCOVERY_EVENTS.OVERLOAD, seed, path: 'meltdown' }]),
    });
  }

  if (siphonScore >= SIPHON_THRESHOLD) {
    const manaGrant = Math.min(15, Math.max(1, Math.round(intensity * 15)));
    return Object.freeze({
      kind: 'siphon',
      score: siphonScore,
      manaGrant,
      events: Object.freeze([{ type: OBELISK_DISCOVERY_EVENTS.SIPHON, seed, path: 'siphon', manaGrant }]),
    });
  }

  return buildObeliskRejection(
    obeliskSnapshot,
    castSnapshot,
    { overloadScore, siphonScore, bridge, phase: rawPhase, intensity },
  );
}
