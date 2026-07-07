import { tokenize } from './tokenizer.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'its', 'of', 'on', 'or', 'that', 'the', 'to', 'with', 'without', 'your',
]);

const FAMILY_TERMS = Object.freeze({
  LIGHT: ['light', 'bright', 'brightness', 'dawn', 'daybreak', 'glow', 'gold', 'halo', 'illuminate', 'illumination', 'lantern', 'morning', 'prism', 'radiance', 'radiant', 'shine', 'sun', 'sunlit', 'torch'],
  REVELATION: ['confess', 'confession', 'disclose', 'expose', 'exposure', 'reveal', 'revelation', 'testify', 'truth', 'uncover', 'verdict'],
  WITNESS: ['name', 'named', 'oath', 'testify', 'verdict', 'witness', 'witnessed'],
  VOID: ['absence', 'black', 'dark', 'darkness', 'empty', 'hollow', 'nothing', 'null', 'shadow', 'void'],
  OBSCURITY: ['conceal', 'hidden', 'hide', 'mist', 'obscure', 'obscurity', 'shadow', 'shade', 'veil'],
  SILENCE: ['hush', 'mute', 'quiet', 'silence', 'silent'],
  CORROSION: ['acid', 'brine', 'corrode', 'corrosion', 'oxidize', 'oxidation', 'rust', 'salt', 'weather'],
  FRACTURE: ['break', 'crack', 'fracture', 'shatter', 'split', 'sunder'],
  RUST: ['oxidize', 'rust', 'rusted', 'rusting'],
  EROSION: ['abrade', 'erode', 'erosion', 'grind', 'salt', 'weather'],
  STONE: ['boulder', 'granite', 'rock', 'stone'],
  FORCE: ['blast', 'force', 'hit', 'impact', 'strike'],
  BONE: ['bone', 'marrow', 'skeleton'],
  RESONANCE: ['bell', 'choir', 'chord', 'echo', 'ring', 'resonance', 'sing', 'song', 'sound', 'tune'],
  DISSONANCE: ['discord', 'dissonance', 'noise', 'wrong'],
  REFLECTION: ['glass', 'mirror', 'reflect', 'reflection'],
  PURIFICATION: ['cleanse', 'distill', 'purify', 'wash', 'white'],
  SALT: ['brine', 'salt', 'saline'],
  DISTILLATION: ['alembic', 'condense', 'distill', 'retort'],
  SUN: ['dawn', 'solar', 'sun', 'sunlit'],
  DECAY: ['decay', 'mold', 'rot', 'spore'],
  POISON: ['poison', 'toxin', 'venom'],
  FUNGUS: ['fungus', 'mold', 'mushroom', 'spore'],
});

const OPPOSITION_PAIRS = Object.freeze([
  ['LIGHT', 'SHADE'],
  ['REVELATION', 'SHADE'],
  ['WITNESS', 'SHADE'],
  ['CORROSION', 'GOLEM'],
  ['RUST', 'GOLEM'],
  ['EROSION', 'GOLEM'],
  ['FRACTURE', 'GLASS_SERAPH'],
  ['RESONANCE', 'GLASS_SERAPH'],
  ['DISSONANCE', 'GLASS_SERAPH'],
  ['PURIFICATION', 'ROT_APOSTLE'],
  ['SALT', 'ROT_APOSTLE'],
  ['DISTILLATION', 'ROT_APOSTLE'],
  ['SUN', 'ROT_APOSTLE'],
]);

export const SYNTACTIC_ARCHETYPE_PROFILES = Object.freeze({
  SHADE_BASE: Object.freeze({
    archetype: 'SHADE',
    weaknessFamilies: Object.freeze(['LIGHT', 'REVELATION', 'WITNESS']),
    resistanceFamilies: Object.freeze(['VOID', 'OBSCURITY', 'SILENCE']),
    favoredDevices: Object.freeze(['antithesis', 'metaphor', 'personification']),
    punishedTerms: Object.freeze(['shadow', 'darkness', 'void']),
    symbolicBody: Object.freeze(['shadow', 'silhouette', 'echo', 'veil', 'shade']),
  }),
  GOLEM_BASE: Object.freeze({
    archetype: 'GOLEM',
    weaknessFamilies: Object.freeze(['CORROSION', 'FRACTURE', 'RUST', 'EROSION']),
    resistanceFamilies: Object.freeze(['STONE', 'FORCE', 'BONE']),
    favoredDevices: Object.freeze(['process_language', 'material_specificity']),
    punishedTerms: Object.freeze(['stone', 'force', 'bone']),
    symbolicBody: Object.freeze(['iron', 'joint', 'plate', 'core', 'hinge', 'armor']),
  }),
  SERAPH_GLASS_BASE: Object.freeze({
    archetype: 'GLASS_SERAPH',
    weaknessFamilies: Object.freeze(['RESONANCE', 'FRACTURE', 'DISSONANCE']),
    resistanceFamilies: Object.freeze(['LIGHT', 'REFLECTION']),
    favoredDevices: Object.freeze(['assonance', 'sonic_imagery', 'internal_rhyme']),
    punishedTerms: Object.freeze(['light', 'mirror', 'reflect']),
    symbolicBody: Object.freeze(['wing', 'pane', 'halo', 'choir', 'glass']),
  }),
  ROT_BASE: Object.freeze({
    archetype: 'ROT_APOSTLE',
    weaknessFamilies: Object.freeze(['PURIFICATION', 'SALT', 'DISTILLATION', 'SUN']),
    resistanceFamilies: Object.freeze(['DECAY', 'POISON', 'FUNGUS']),
    favoredDevices: Object.freeze(['ritual_sequence', 'cleansing_imagery']),
    punishedTerms: Object.freeze(['rot', 'decay', 'poison', 'spore']),
    symbolicBody: Object.freeze(['spore', 'mold', 'wound', 'sermon', 'rot']),
  }),
});

function clampBetween(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeTokens(phrase) {
  return tokenize(phrase).filter(Boolean);
}

function contentTokens(tokens) {
  return tokens.filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function phraseIncludesTerm(tokens, normalizedPhrase, term) {
  const normalizedTerm = String(term || '').toLowerCase();
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(' ')) return normalizedPhrase.includes(normalizedTerm);
  return tokens.some((token) => token === normalizedTerm || token.includes(normalizedTerm));
}

function matchFamilies(tokens, normalizedPhrase, families = []) {
  return unique(families.filter((family) => {
    const terms = FAMILY_TERMS[family] || [family.toLowerCase()];
    return terms.some((term) => phraseIncludesTerm(tokens, normalizedPhrase, term));
  }));
}

function scoreFamilyMatch(matchedFamilies, configuredFamilies) {
  if (!Array.isArray(configuredFamilies) || configuredFamilies.length === 0) return 0;
  return clampBetween(matchedFamilies.length / configuredFamilies.length, 0, 1);
}

function scoreMetaphorPrecision(tokens, normalizedPhrase, symbolicBody = []) {
  if (!Array.isArray(symbolicBody) || symbolicBody.length === 0) return 0;
  const bodyHits = symbolicBody.filter((term) => phraseIncludesTerm(tokens, normalizedPhrase, term));
  const bodyScore = clampBetween(bodyHits.length / Math.min(2, symbolicBody.length), 0, 1);
  const actionScore = tokens.some((token) => ['split', 'force', 'drag', 'wear', 'bloom', 'testify', 'salt', 'rust', 'tune', 'wash', 'distill', 'refuse'].includes(token))
    ? 0.35
    : 0;
  return clampBetween(bodyScore * 0.75 + actionScore, 0, 1);
}

function scoreOppositionLogic(matchedWeaknessFamilies, archetype) {
  if (!archetype) return 0;
  const hits = matchedWeaknessFamilies.filter((family) =>
    OPPOSITION_PAIRS.some(([opposingFamily, opposingArchetype]) =>
      opposingFamily === family && opposingArchetype === archetype
    )
  );
  return clampBetween(hits.length / Math.max(1, matchedWeaknessFamilies.length), 0, 1);
}

function estimateClarity(tokens) {
  if (tokens.length === 0) return 0;
  if (tokens.length <= 2) return 0.25;
  const connectors = tokens.filter((token) => STOP_WORDS.has(token)).length;
  const repeated = tokens.length - new Set(tokens).size;
  const connectorScore = clampBetween((connectors / tokens.length) / 0.28, 0, 1);
  const lengthScore = clampBetween(tokens.length / 8, 0, 1);
  const repetitionPenalty = clampBetween(repeated / tokens.length, 0, 0.45);
  return clampBetween((connectorScore * 0.55) + (lengthScore * 0.45) - repetitionPenalty, 0, 1);
}

function firstVowelGroup(token) {
  return token.match(/[aeiouy]+/)?.[0] || '';
}

function detectDevices(tokens, normalizedPhrase) {
  const content = contentTokens(tokens);
  const initials = new Map();
  const vowels = new Map();
  const tails = new Map();
  content.forEach((token) => {
    initials.set(token[0], (initials.get(token[0]) || 0) + 1);
    const vowel = firstVowelGroup(token);
    if (vowel) vowels.set(vowel, (vowels.get(vowel) || 0) + 1);
    if (token.length >= 4) {
      const tail = token.slice(-3);
      const words = tails.get(tail) || new Set();
      words.add(token);
      tails.set(tail, words);
    }
  });

  const devices = [];
  if ([...initials.values()].some((count) => count >= 2)) devices.push('alliteration');
  if ([...vowels.values()].some((count) => count >= 2)) devices.push('assonance');
  if ([...tails.values()].some((words) => words.size >= 2)) devices.push('internal_rhyme');
  if (/\b(is|are|becomes?|wears?|blooms?|learns?|testif(?:y|ies))\b/.test(normalizedPhrase) && content.length >= 5) devices.push('metaphor');
  if (/\b(sun|light|lantern|dawn|prism)\b/.test(normalizedPhrase) && /\b(shade|shadow|dark|absence|hidden|veil)\b/.test(normalizedPhrase)) devices.push('antithesis');
  if (/\b(answers|asks|blooms|learns|remembers|sings|speaks|testifies|wears)\b/.test(normalizedPhrase)) devices.push('personification');
  if (/\b(first|then|until|after|before)\b/.test(normalizedPhrase)) devices.push('ritual_sequence');
  if (/\b(wash|cleanse|purify|distill|salt|sunlit)\b/.test(normalizedPhrase)) devices.push('cleansing_imagery');
  if (/\b(rust|oxidize|corrode|distill|salt|tune|fracture)\b/.test(normalizedPhrase)) devices.push('process_language');
  if (/\b(iron|joint|hinge|plate|core|glass|pane|wing|halo|spore|mold|wound)\b/.test(normalizedPhrase)) devices.push('material_specificity');
  if (/\b(song|sing|ring|tune|choir|chord|echo|dissonance)\b/.test(normalizedPhrase)) devices.push('sonic_imagery');
  return unique(devices);
}

function scoreLiteraryDevices(detectedDevices, favoredDevices = []) {
  if (!Array.isArray(favoredDevices) || favoredDevices.length === 0) {
    return clampBetween(detectedDevices.length / 3, 0, 1);
  }
  const favoredHits = favoredDevices.filter((device) => detectedDevices.includes(device)).length;
  const broadScore = clampBetween(detectedDevices.length / 4, 0, 1) * 0.35;
  return clampBetween((favoredHits / favoredDevices.length) * 0.65 + broadScore, 0, 1);
}

function scoreNovelty(profile, verseIR) {
  const profileNovelty = Number(profile?.verseIRAmplifier?.noveltySignal);
  if (Number.isFinite(profileNovelty)) return clampBetween(profileNovelty, 0, 1);
  const multiplier = Number(verseIR?.verseIRAmplifier?.impactMultiplier ?? verseIR?.impactMultiplier);
  if (Number.isFinite(multiplier)) return clampBetween((multiplier - 1) / 0.12, 0, 1);
  return 0.45;
}

export function createNeutralSyntacticalChessResult() {
  return {
    score: 0,
    multiplier: 1,
    matchedWeaknessFamilies: [],
    resistedFamilies: [],
    detectedDevices: [],
    diagnostics: ['SYNTACTICAL CHESS: NEUTRAL · No enemy symbolic profile available.'],
    state: 'neutral',
  };
}

export function resolveSyntacticProfile(enemy = null) {
  if (enemy?.syntacticProfile) return enemy.syntacticProfile;
  const name = String(enemy?.name || '').toLowerCase();
  if (name.includes('shade') || name.includes('revenant') || name.includes('cryptonym') || name.includes('hollow')) {
    return SYNTACTIC_ARCHETYPE_PROFILES.SHADE_BASE;
  }
  if (name.includes('golem') || name.includes('iron') || name.includes('liturgist')) {
    return SYNTACTIC_ARCHETYPE_PROFILES.GOLEM_BASE;
  }
  if (name.includes('glass') || name.includes('seraph')) {
    return SYNTACTIC_ARCHETYPE_PROFILES.SERAPH_GLASS_BASE;
  }
  if (name.includes('rot') || name.includes('apostle')) {
    return SYNTACTIC_ARCHETYPE_PROFILES.ROT_BASE;
  }
  if (enemy?.school === 'SONIC') return SYNTACTIC_ARCHETYPE_PROFILES.SHADE_BASE;
  if (enemy?.school === 'WILL') return SYNTACTIC_ARCHETYPE_PROFILES.GOLEM_BASE;
  if (enemy?.school === 'ALCHEMY') return SYNTACTIC_ARCHETYPE_PROFILES.ROT_BASE;
  return null;
}

export function evaluateSyntacticalChess({
  phrase = '',
  enemy = null,
  verseIR = null,
  profile = null,
} = {}) {
  const syntacticProfile = resolveSyntacticProfile(enemy);
  if (!syntacticProfile || !phrase) return createNeutralSyntacticalChessResult();

  const normalizedPhrase = String(phrase || '').toLowerCase();
  const tokens = normalizeTokens(normalizedPhrase);
  const matchedWeaknessFamilies = matchFamilies(tokens, normalizedPhrase, syntacticProfile.weaknessFamilies);
  const resistedFamilies = matchFamilies(tokens, normalizedPhrase, syntacticProfile.resistanceFamilies);
  const weaknessMatch = scoreFamilyMatch(matchedWeaknessFamilies, syntacticProfile.weaknessFamilies);
  const resistanceMatch = scoreFamilyMatch(resistedFamilies, syntacticProfile.resistanceFamilies);
  const metaphorPrecision = scoreMetaphorPrecision(tokens, normalizedPhrase, syntacticProfile.symbolicBody);
  const oppositionLogic = scoreOppositionLogic(matchedWeaknessFamilies, syntacticProfile.archetype);
  const detectedDevices = detectDevices(tokens, normalizedPhrase);
  const literaryDeviceScore = scoreLiteraryDevices(detectedDevices, syntacticProfile.favoredDevices);
  const noveltyScore = scoreNovelty(profile, verseIR);
  const clarityScore = estimateClarity(tokens);

  const score = clampBetween(
    weaknessMatch * 0.30
    + metaphorPrecision * 0.20
    + oppositionLogic * 0.16
    + literaryDeviceScore * 0.14
    + noveltyScore * 0.12
    + clarityScore * 0.08
    - resistanceMatch * 0.18,
    0,
    1
  );

  const baseMultiplier = 0.94 + (score * 0.34);
  const resistancePenalty = resistanceMatch > 0
    ? 1 - Math.min(0.18, resistanceMatch * 0.18)
    : 1;
  const multiplier = clampBetween(baseMultiplier * resistancePenalty, 0.82, 1.28);
  const advantage = weaknessMatch >= 0.75 && oppositionLogic >= 0.60 && clarityScore >= 0.50;
  const state = resistanceMatch >= 0.5 && matchedWeaknessFamilies.length === 0
    ? 'disadvantage'
    : advantage
      ? 'advantage'
      : 'neutral';

  const diagnostics = [];
  if (state === 'advantage') diagnostics.push('SYNTACTICAL CHESS: ADVANTAGE');
  else if (state === 'disadvantage') diagnostics.push('SYNTACTICAL CHESS: DISADVANTAGE');
  else diagnostics.push('SYNTACTICAL CHESS: NEUTRAL');
  if (matchedWeaknessFamilies.length > 0) {
    diagnostics.push(`Matched ${matchedWeaknessFamilies.join('/')} against ${syntacticProfile.archetype}.`);
  }
  if (resistedFamilies.length > 0) {
    diagnostics.push(`Phrase reinforced enemy ${resistedFamilies.join('/')} identity.`);
  }
  if (detectedDevices.length > 0) {
    diagnostics.push(`Detected devices: ${detectedDevices.slice(0, 4).join(', ')}.`);
  }
  diagnostics.push(`Damage modifier: x${multiplier.toFixed(2)}.`);

  return {
    score: Number(score.toFixed(3)),
    multiplier: Number(multiplier.toFixed(3)),
    matchedWeaknessFamilies,
    resistedFamilies,
    detectedDevices,
    diagnostics,
    state,
    components: {
      weaknessMatch: Number(weaknessMatch.toFixed(3)),
      resistanceMatch: Number(resistanceMatch.toFixed(3)),
      metaphorPrecision: Number(metaphorPrecision.toFixed(3)),
      oppositionLogic: Number(oppositionLogic.toFixed(3)),
      literaryDeviceScore: Number(literaryDeviceScore.toFixed(3)),
      noveltyScore: Number(noveltyScore.toFixed(3)),
      clarityScore: Number(clarityScore.toFixed(3)),
    },
  };
}
