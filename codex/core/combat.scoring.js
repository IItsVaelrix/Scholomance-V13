import {
  COMBAT_ARENA_SCHOOL,
  EPIC_CAST_MIN_RARITY_ORDINAL,
  FAILURE_CAST_THRESHOLD,
  MIN_COMBAT_DAMAGE,
  clamp01,
  computeArenaResonanceMultiplier,
  getSchoolEffectiveness,
} from './combat.balance.js';
import { buildCombatProfile } from './combat.profile.js';
import { buildSpeakingTraces } from './speaking/index.js';
import { calculateCompendiumAmplification } from './spellweave-compendium/compendium.engine.js';
import { calculateSyntacticBridge } from './spellweave.engine.js';
import { evaluateSyntacticalChess } from './combat.syntax-chess.js';
import { INEXPLICABLE_ELEMENT_DOMAINS } from './verseir-amplifier/plugins/inexplicableElements.js';
import { hashString } from './pixelbrain/shared.js';
import { tokenize } from './tokenizer.js';

const SCORE_TO_DAMAGE_MULTIPLIER = 1.1;
const SCORE_TO_DAMAGE_OFFSET = 6;

export function getCombatTotalScore(scoreData) {
  const total = Number(scoreData?.totalScore ?? scoreData?.score ?? 0);
  return Number.isFinite(total) ? total : 0;
}

export function getCombatTraces(scoreData) {
  const traces = scoreData?.traces ?? scoreData?.explainTrace;
  return Array.isArray(traces) ? traces : [];
}

function getDominantDensity(profile) {
  return clamp01(profile?.schoolDensity?.[profile?.school] ?? profile?.dominantDensity ?? 0);
}

function computeBaseDamage(totalScore) {
  return Math.max(
    MIN_COMBAT_DAMAGE,
    Math.round((Math.max(0, totalScore) * SCORE_TO_DAMAGE_MULTIPLIER) + SCORE_TO_DAMAGE_OFFSET)
  );
}

function computeSyntaxControl(profile) {
  const cohesionScore = clamp01(profile?.cohesionScore ?? profile?.traceSignals?.cohesion ?? 0);
  const dominantDensity = getDominantDensity(profile);
  return 0.9 + (cohesionScore * 0.18) + (dominantDensity * 0.06);
}

function computeSpeechActMultiplier(profile) {
  const speechAct = String(profile?.intent?.speechAct || '');
  if (speechAct === 'THREAT' || speechAct === 'BANISHMENT') return 1.12;
  if (speechAct === 'COMMAND' || speechAct === 'DECLARATION') return 1.08;
  if (speechAct === 'BANISHMENT') return 1.1;
  if (speechAct === 'INVOCATION') return 1.06;
  if (speechAct === 'BLESSING' || speechAct === 'PLEA') return 0.98;
  if (speechAct === 'QUESTION') return 1.03;
  return 1;
}

function computeProsodyMultiplier(profile) {
  const beatAlignment = clamp01(profile?.speaking?.prosody?.beatAlignment ?? 0);
  const controlledVariance = clamp01(profile?.speaking?.prosody?.controlledVariance ?? 0);
  const closureScore = clamp01(profile?.speaking?.prosody?.closureScore ?? 0);
  return 0.94 + (beatAlignment * 0.1) + (controlledVariance * 0.08) + (closureScore * 0.08);
}

function computeHarmonyMultiplier(profile) {
  const harmony = clamp01(profile?.speaking?.harmony?.score ?? 0);
  return 0.96 + (harmony * 0.18);
}

function computeSeverityMultiplier(profile) {
  const potency = clamp01(profile?.speaking?.severity?.potency ?? 0);
  const rarityAmplifier = clamp01(profile?.speaking?.severity?.rarityAmplifier ?? 0);
  return 0.94 + (potency * 0.22) + (rarityAmplifier * 0.08);
}

function computeVoiceResonanceMultiplier(profile) {
  const voiceResonance = clamp01(profile?.voiceResonance ?? profile?.speaking?.voice?.resonance ?? 0);
  return 0.96 + (voiceResonance * 0.16);
}

function computeDamageFloor(profile) {
  const cohesionScore = clamp01(profile?.cohesionScore ?? profile?.traceSignals?.cohesion ?? 0);
  const statusTier = Math.max(0, Number(profile?.statusEffect?.tier) || 0);
  const severityPotency = clamp01(profile?.speaking?.severity?.potency ?? 0);
  return MIN_COMBAT_DAMAGE + Math.round((cohesionScore * 4) + Math.min(3, statusTier * 0.5) + (severityPotency * 3));
}

function computeHealingAmount(profile, damage) {
  const speechAct = String(profile?.intent?.speechAct || '');
  const isBlessedHealing = speechAct === 'BLESSING' || speechAct === 'PLEA';
  if ((!profile?.intent?.healing && !isBlessedHealing) || profile.school !== 'ALCHEMY') {
    return 0;
  }
  if (profile?.intent?.healingMode === 'REGEN') {
    return 0;
  }

  const rarityBonus = Number(profile?.rarity?.ordinal) || 0;
  const speechBonus = isBlessedHealing ? 0.18 : 0;
  const voiceBonus = clamp01(profile?.voiceResonance ?? 0);
  const creativityBonus = clamp01(profile?.intent?.healingCreativity ?? 0);
  return Math.max(
    0,
    Math.round((damage * (0.65 + speechBonus + (creativityBonus * 0.28))) + (profile.totalScore * 0.2) + (rarityBonus * 4) + (voiceBonus * 6))
  );
}

function isFailureCast(profile) {
  const speakingRescue = clamp01(
    (
      (Number(profile?.speaking?.prosody?.beatAlignment) || 0)
      + (Number(profile?.speaking?.harmony?.score) || 0)
      + (Number(profile?.voiceResonance) || 0)
      + (Number(profile?.speaking?.speechAct?.confidence) || 0)
    ) / 4
  );
  if ((Number(profile?.totalScore) || 0) < FAILURE_CAST_THRESHOLD && speakingRescue >= 0.62) {
    return false;
  }
  return (
    (Number(profile?.totalScore) || 0) < FAILURE_CAST_THRESHOLD
    || (Number(profile?.tokenCount) || 0) <= 2
    || getDominantDensity(profile) < 0.24
  );
}

// ─── Cast events: discovery + epic animation cues ────────────────────────────

const INEXPLICABLE_LEXEME_INDEX = (() => {
  const index = new Map();
  for (const domain of INEXPLICABLE_ELEMENT_DOMAINS) {
    for (const lexeme of domain.lexemes) {
      index.set(lexeme, domain.id);
    }
  }
  return index;
})();

const SCHOOL_ANIMATION_MOTIFS = Object.freeze({
  VOID: 'collapse-star',
  SONIC: 'shatter-wave',
  ALCHEMY: 'transmute-bloom',
  PSYCHIC: 'mind-spiral',
  WILL: 'force-lattice',
});

// U+241F (symbol for unit separator) keeps verse/weave boundaries unambiguous
// in the seed text, so 'a b'+'c' never collides with 'a'+'b c'.
const SEED_SEPARATOR = '␟';

/**
 * Builds the typed cast event descriptors the UI consumes. Pure data —
 * dedupe of "first ever discovery" and the actual UI reactions belong to
 * runtime/UI layers. Deterministic: same inputs, same events, same seeds.
 */
export function buildCastEvents({ verse = '', weave = '', rarity = null, bridge = null, syntacticalChess = null, school = null } = {}) {
  const events = [];

  const seen = new Set();
  const scanSource = (text, source) => {
    for (const token of tokenize(text)) {
      if (!INEXPLICABLE_LEXEME_INDEX.has(token) || seen.has(token)) continue;
      seen.add(token);
      events.push({
        type: 'DISCOVERY_INEXPLICABLE',
        word: token,
        domain: INEXPLICABLE_LEXEME_INDEX.get(token),
        source,
        seed: hashString(token) >>> 0,
      });
    }
  };
  scanSource(verse, 'verse');
  scanSource(weave, 'weave');

  if ((Number(rarity?.ordinal) || 0) >= EPIC_CAST_MIN_RARITY_ORDINAL) {
    const motifBase = SCHOOL_ANIMATION_MOTIFS[school] || 'arcane-sigil';
    const motif = bridge?.chainType === 'SEQUENCE' && (bridge?.strikes || 1) > 1
      ? `${motifBase}-combo`
      : motifBase;
    events.push({
      type: 'EPIC_CAST',
      rarityId: rarity.id,
      animationCue: {
        seed: hashString(`${verse}${SEED_SEPARATOR}${weave}`) >>> 0,
        school: school || null,
        rarityId: rarity.id,
        motif,
      },
    });
  }

  if (Array.isArray(bridge?.events)) events.push(...bridge.events);
  if (Array.isArray(syntacticalChess?.events)) events.push(...syntacticalChess.events);

  return events;
}

// Lore Sheet Rating Ladder
const RATINGS = {
  NEOPHYTE: 'Neophyte',
  ADEPT: 'Adept',
  MASTER: 'Master',
  GODLIKE: 'Godlike',
};

function getRatingForValue(val) {
  if (val >= 0.9) return RATINGS.GODLIKE;
  if (val >= 0.7) return RATINGS.MASTER;
  if (val >= 0.4) return RATINGS.ADEPT;
  return RATINGS.NEOPHYTE;
}

export function calculateCombatScore({
  text = '',
  weave = '',
  scoreData = null,
  arenaSchool = COMBAT_ARENA_SCHOOL,
  defenderSchool = null,
  analyzedDoc = null,
  corpusRanks = null,
  fallbackSchool = arenaSchool,
  speakerId = 'speaker:unknown',
  speakerType = 'PLAYER',
  speakerProfile = null,
  defender = null,
  scholomance = null,
  compendiumContext = null,
} = {}) {
  const totalScore = getCombatTotalScore(scoreData);
  const traces = getCombatTraces(scoreData);
  const profile = buildCombatProfile({
    text,
    scoreData: {
      ...scoreData,
      totalScore,
      traces,
    },
    analyzedDoc,
    arenaSchool,
    corpusRanks,
    fallbackSchool,
    speakerId,
    speakerType,
    speakerProfile,
  });

  // Calculate Syntactic Bridge (Weave)
  const bridge = calculateSyntacticBridge({
    verse: text,
    weave: weave,
    dominantSchool: profile.school
  });

  const baseDamage = computeBaseDamage(totalScore);
  const arenaResonanceMultiplier = computeArenaResonanceMultiplier({
    dominantSchool: profile.school,
    schoolDensity: profile.schoolDensity,
    arenaSchool,
  });
  const schoolAffinityMultiplier = getSchoolEffectiveness(profile.school, defenderSchool);
  const densityMultiplier = 1 + (getDominantDensity(profile) * 0.18);
  const terrainMultiplier = profile.intent.terrain ? 1.08 : 1;
  const supportPenalty = profile.intent.healing ? 0.72 : 1;
  const syntaxControlMultiplier = computeSyntaxControl(profile);
  const speechActMultiplier = computeSpeechActMultiplier(profile);
  const prosodyMultiplier = computeProsodyMultiplier(profile);
  const harmonyMultiplier = computeHarmonyMultiplier(profile);
  const severityMultiplier = computeSeverityMultiplier(profile);
  const voiceResonanceMultiplier = computeVoiceResonanceMultiplier(profile);
  const weaveResonanceMultiplier = bridge.resonance;
  const speakingTraces = buildSpeakingTraces(profile.speaking);
  const combinedTraces = [...traces, ...speakingTraces];

  const rhymeMultiplier = typeof profile.rhymeQuality === 'number'
    ? Math.max(0.92, Math.min(1.14, 0.92 + (profile.rhymeQuality * 0.22)))
    : 1.0;
  const verseIRMultiplier = Math.max(0.85, Math.min(1.12, Number(profile.verseIRAmplifier?.impactMultiplier) || 1.0));
  const verbalFormMultiplier = rhymeMultiplier * verseIRMultiplier;
  const syntacticalChess = evaluateSyntacticalChess({
    phrase: text,
    enemy: defender,
    verseIR: scoreData?.verseIR || profile.verseIRAmplifier,
    profile,
  });

  const compendium = calculateCompendiumAmplification({
    verse: text,
    weave,
    bridge,
    scholomance: scholomance || compendiumContext?.scholomance || null,
    syntacticalChess,
    encounter: compendiumContext?.encounter || defender || null,
    verseIRAmplifier: scoreData?.verseIRAmplifier || profile.verseIRAmplifier || null,
    usedEntryIds: compendiumContext?.usedEntryIds || [],
    unlockedEntryIds: compendiumContext?.unlockedEntryIds || [],
    discoveredEntryIds: compendiumContext?.discoveredEntryIds || [],
  });

  const rawDamage = baseDamage
    * arenaResonanceMultiplier
    * schoolAffinityMultiplier
    * densityMultiplier
    * terrainMultiplier
    * syntaxControlMultiplier
    * speechActMultiplier
    * prosodyMultiplier
    * harmonyMultiplier
    * severityMultiplier
    * voiceResonanceMultiplier
    * weaveResonanceMultiplier
    * verbalFormMultiplier
    * syntacticalChess.multiplier
    * (profile.rarity?.totalMultiplier ?? 1)
    * (profile.abyssalResonanceMultiplier ?? 1)
    * supportPenalty
    * compendium.compendiumMultiplier;

  const damage = Math.max(computeDamageFloor(profile), Math.round(rawDamage));
  const baseHealing = computeHealingAmount(profile, damage);
  const healing = Math.round(baseHealing * verbalFormMultiplier);
  const failureCast = isFailureCast(profile) || bridge.collapsed;

  // Lore Sheet Stat Mapping
  const syntVal = clamp01((profile.cohesionScore + (profile.tokenCount / 20) + (profile.rhymeQuality || 0)) / 3);
  const metaVal = clamp01(profile.abyssalResonanceMultiplier || 0.1);
  const mythVal = clamp01(((Number(profile.verseIRAmplifier?.impactMultiplier) || 1.0) - 1.0) / 0.12);
  const visVal = clamp01(profile.literaryDeviceRichness || 0.2);
  const psycVal = clamp01(profile.emotionalResonance || 0.2);
  const codexVal = clamp01(profile.vocabularyRichness || 0.3);

  const loreStats = {
    SYNT: { rating: getRatingForValue(syntVal), value: syntVal, justification: 'Structural precision and internal patterning.' },
    META: { rating: getRatingForValue(metaVal), value: metaVal, justification: 'Spiritual reach and reality-bending force.' },
    MYTH: { rating: getRatingForValue(mythVal), value: mythVal, justification: 'Symbolic archetype and epic resonance.' },
    VIS: { rating: getRatingForValue(visVal), value: visVal, justification: 'Visual imagination and atmospheric force.' },
    PSYC: { rating: getRatingForValue(psycVal), value: psycVal, justification: 'Trauma logic and cognitive complexity.' },
    CODEX: { rating: getRatingForValue(codexVal), value: codexVal, justification: 'Lore density and continuity weight.' },
  };

  const compendiumCommentary = compendium.counselLines.join(' ');
  const commentary = bridge.collapsed
    ? "Syntactic Collapse: The Weave has frayed."
    : [
      profile.commentary || profile.rarity?.praise || '',
      compendiumCommentary,
      ...syntacticalChess.diagnostics,
    ].filter(Boolean).join(' ');

  const events = buildCastEvents({
    verse: text,
    weave,
    rarity: profile.rarity,
    bridge,
    syntacticalChess,
    school: bridge.school || profile.school,
  });

  return {
    events,
    strikes: bridge.strikes || 1,
    chainType: bridge.chainType || 'SINGLE',
    totalScore,
    traces: combinedTraces,
    explainTrace: combinedTraces,
    damage,
    healing,
    school: bridge.school || profile.school,
    schoolDensity: profile.schoolDensity,
    arenaSchool,
    opponentSchool: defenderSchool || null,
    arenaResonanceMultiplier,
    schoolAffinityMultiplier,
    syntaxControlMultiplier,
    speechActMultiplier,
    prosodyMultiplier,
    harmonyMultiplier,
    severityMultiplier,
    voiceResonanceMultiplier,
    abyssalResonanceMultiplier: profile.abyssalResonanceMultiplier,
    weaveResonanceMultiplier,
    bridge,
    rarity: profile.rarity,
    intent: {
      ...profile.intent,
      bridgeIntent: bridge.intent || null,
    },
    cohesionScore: profile.cohesionScore,
    speaking: profile.speaking,
    voiceProfile: profile.voiceProfile,
    nextVoiceProfile: profile.nextVoiceProfile,
    statusEffect: profile.statusEffect,
    failureCast,
    commentary,
    loreStats,
    rhymeMultiplier,
    verseIRMultiplier,
    verbalFormMultiplier,
    syntacticalChessMultiplier: syntacticalChess.multiplier,
    syntacticalChess,
    rhymeQuality: profile.rhymeQuality ?? null,
    verseIRImpactMultiplier: profile.verseIRAmplifier?.impactMultiplier ?? null,
    compendiumMultiplier: compendium.compendiumMultiplier,
    tierBreakdown: compendium.tierBreakdown,
    compendiumCounselLines: compendium.counselLines,
    newlyDiscoveredEntryIds: compendium.newlyDiscoveredEntryIds,
  };
}

export function normalizeCombatScore(scoreData, options = {}) {
  return calculateCombatScore({
    text: options.scrollText || scoreData?.scrollText || '',
    weave: options.weave || scoreData?.weave || '',
    scoreData,
    arenaSchool: options.arenaSchool,
    defenderSchool: options.opponentSchool,
    analyzedDoc: options.analyzedDoc,
    corpusRanks: options.corpusRanks,
    fallbackSchool: options.fallbackSchool,
    speakerId: options.speakerId,
    speakerType: options.speakerType,
    speakerProfile: options.speakerProfile,
    defender: options.defender,
    scholomance: options.scholomance,
    compendiumContext: options.compendiumContext,
  });
}

export { MIN_COMBAT_DAMAGE };
