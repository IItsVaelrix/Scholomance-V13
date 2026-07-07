import { tokenize } from './tokenizer.js';
import { PREDICATES } from './semantics.registry.js';

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
    // a Shade is unmade by being questioned and named, not lectured at
    syntaxWeaknesses: Object.freeze(['PROBE', 'LITANY']),
    syntaxResistances: Object.freeze(['WARD']),
  }),
  GOLEM_BASE: Object.freeze({
    archetype: 'GOLEM',
    weaknessFamilies: Object.freeze(['CORROSION', 'FRACTURE', 'RUST', 'EROSION']),
    resistanceFamilies: Object.freeze(['STONE', 'FORCE', 'BONE']),
    favoredDevices: Object.freeze(['process_language', 'material_specificity']),
    punishedTerms: Object.freeze(['stone', 'force', 'bone']),
    symbolicBody: Object.freeze(['iron', 'joint', 'plate', 'core', 'hinge', 'armor']),
    // long grinding process chains wear a Golem down; bare commands bounce off
    syntaxWeaknesses: Object.freeze(['LITANY', 'RITUAL_CHAIN']),
    syntaxResistances: Object.freeze(['COMMAND']),
  }),
  SERAPH_GLASS_BASE: Object.freeze({
    archetype: 'GLASS_SERAPH',
    weaknessFamilies: Object.freeze(['RESONANCE', 'FRACTURE', 'DISSONANCE']),
    resistanceFamilies: Object.freeze(['LIGHT', 'REFLECTION']),
    favoredDevices: Object.freeze(['assonance', 'sonic_imagery', 'internal_rhyme']),
    punishedTerms: Object.freeze(['light', 'mirror', 'reflect']),
    symbolicBody: Object.freeze(['wing', 'pane', 'halo', 'choir', 'glass']),
    // repeated resonant structure shatters glass; questions pass through it
    syntaxWeaknesses: Object.freeze(['LITANY']),
    syntaxResistances: Object.freeze(['PROBE']),
  }),
  ROT_BASE: Object.freeze({
    archetype: 'ROT_APOSTLE',
    weaknessFamilies: Object.freeze(['PURIFICATION', 'SALT', 'DISTILLATION', 'SUN']),
    resistanceFamilies: Object.freeze(['DECAY', 'POISON', 'FUNGUS']),
    favoredDevices: Object.freeze(['ritual_sequence', 'cleansing_imagery']),
    punishedTerms: Object.freeze(['rot', 'decay', 'poison', 'spore']),
    symbolicBody: Object.freeze(['spore', 'mold', 'wound', 'sermon', 'rot']),
    // rot obeys the imperative scouring voice; statements feed its sermon
    syntaxWeaknesses: Object.freeze(['COMMAND']),
    syntaxResistances: Object.freeze(['WARD']),
  }),
  SENTINEL_BRAZIER_BASE: Object.freeze({
    archetype: 'BRAZIER_SENTINEL',
    weaknessFamilies: Object.freeze(['DISSONANCE', 'CORROSION', 'FRACTURE']),
    resistanceFamilies: Object.freeze(['RESONANCE', 'FORCE', 'LIGHT']),
    favoredDevices: Object.freeze(['sonic_imagery', 'assonance', 'process_language']),
    punishedTerms: Object.freeze(['resonance', 'song', 'choir', 'ring']),
    symbolicBody: Object.freeze(['matrix', 'brazier', 'torch', 'ring', 'containment', 'flame']),
    // the matrix buckles under dissonant questioning and decisive command
    syntaxWeaknesses: Object.freeze(['PROBE', 'COMMAND']),
    syntaxResistances: Object.freeze(['LITANY', 'WARD']),
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

// ─── Verse form analysis — grammar as a combat surface ───────────────────────

const WH_WORDS = new Set(['who', 'what', 'when', 'where', 'why', 'how', 'which', 'whose', 'whom']);

const COMMAND_VERBS = new Set([
  ...Object.keys(PREDICATES).map((predicate) => predicate.toLowerCase()),
  'answer', 'banish', 'begone', 'bloom', 'break', 'burn', 'cleanse', 'crush',
  'distill', 'drag', 'fall', 'feed', 'kneel', 'let', 'name', 'purify',
  'refuse', 'rise', 'rust', 'salt', 'sing', 'speak', 'split', 'stand',
  'testify', 'tune', 'wash', 'wear',
]);

const CHAIN_MARKERS = new Set(['then', 'until', 'after', 'before', 'first', 'next', 'finally']);

const WARD_FRAME = /\b(is|are|shall|will|stands?|holds?|becomes?)\b/;

function segmentSentences(raw) {
  return String(raw || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function resolveSentenceMood(segment, tokens) {
  const first = tokens[0] || '';
  if (/\?\s*$/.test(segment) || WH_WORDS.has(first)) return 'interrogative';
  if (COMMAND_VERBS.has(first)) return 'imperative';
  if (/!\s*$/.test(segment)) return 'exclamative';
  return 'declarative';
}

/**
 * Analyzes the grammatical FORM of a verse: sentence moods, rhythm, and
 * shape tags (COMMAND / PROBE / WARD / LITANY / RITUAL_CHAIN / FREE_VERSE).
 * Pure and deterministic; shape tags are matched against archetype
 * syntaxWeaknesses/syntaxResistances so structure can beat structure.
 */
export function analyzeVerseForm(phrase) {
  const raw = String(phrase || '');
  const segments = segmentSentences(raw);
  const sentences = segments.map((segment) => {
    const tokens = tokenize(segment);
    return {
      text: segment,
      tokens,
      length: tokens.length,
      first: tokens[0] || '',
      mood: resolveSentenceMood(segment, tokens),
    };
  }).filter((sentence) => sentence.length > 0);

  const moodCounts = { imperative: 0, interrogative: 0, declarative: 0, exclamative: 0 };
  sentences.forEach((sentence) => { moodCounts[sentence.mood] += 1; });
  const dominantMood = Object.entries(moodCounts)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || 'declarative';

  // anaphora: repeated sentence-initial token across the verse
  const initialCounts = new Map();
  sentences.forEach((sentence) => {
    if (sentence.first) {
      initialCounts.set(sentence.first, (initialCounts.get(sentence.first) || 0) + 1);
    }
  });
  const anaphora = sentences.length >= 2
    && [...initialCounts.values()].some((count) => count >= 2);

  const lowercase = raw.toLowerCase();
  const chainHits = tokenize(lowercase).filter((token) => CHAIN_MARKERS.has(token)).length;

  const lengths = sentences.map((sentence) => sentence.length);
  const meanLength = lengths.length > 0
    ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length
    : 0;
  const variance = lengths.length > 0
    ? lengths.reduce((sum, length) => sum + ((length - meanLength) ** 2), 0) / lengths.length
    : 0;
  // cadence is only meaningful across multiple sentences — a single line
  // has no rhythm to control, so it earns nothing.
  const cadence = sentences.length >= 2 && meanLength > 0
    ? clampBetween(1 - (Math.sqrt(variance) / meanLength), 0, 1)
    : 0;

  const shapes = [];
  if (anaphora) shapes.push('LITANY');
  if (moodCounts.interrogative >= 2 || dominantMood === 'interrogative') shapes.push('PROBE');
  if (dominantMood === 'imperative') shapes.push('COMMAND');
  if (dominantMood === 'declarative' && WARD_FRAME.test(lowercase)) shapes.push('WARD');
  if (chainHits >= 2) shapes.push('RITUAL_CHAIN');
  if (shapes.length === 0) shapes.push('FREE_VERSE');

  return {
    sentences,
    moodCounts,
    dominantMood,
    shapes,
    anaphora,
    rhythm: {
      cadence: Number(cadence.toFixed(3)),
      chainLength: chainHits,
      sentenceCount: sentences.length,
    },
  };
}

function scoreSyntaxForm(form, syntacticProfile) {
  const weaknesses = Array.isArray(syntacticProfile.syntaxWeaknesses)
    ? syntacticProfile.syntaxWeaknesses
    : [];
  const resistances = Array.isArray(syntacticProfile.syntaxResistances)
    ? syntacticProfile.syntaxResistances
    : [];
  const matchedSyntaxWeaknesses = weaknesses.filter((shape) => form.shapes.includes(shape));
  const resistedSyntaxForms = resistances.filter((shape) => form.shapes.includes(shape));
  const formMatch = weaknesses.length > 0
    ? clampBetween(matchedSyntaxWeaknesses.length / weaknesses.length, 0, 1)
    : 0;
  const formResist = resistances.length > 0
    ? clampBetween(resistedSyntaxForms.length / resistances.length, 0, 1)
    : 0;
  // controlled cadence only counts as pressure when the form actually bites
  const rhythmScore = formMatch > 0
    ? form.rhythm.cadence
    : form.rhythm.cadence * 0.5;
  return { matchedSyntaxWeaknesses, resistedSyntaxForms, formMatch, formResist, rhythmScore };
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
    mood: 'declarative',
    shapes: [],
    rhythm: { cadence: 0, chainLength: 0, sentenceCount: 0 },
    matchedSyntaxWeaknesses: [],
    resistedSyntaxForms: [],
    events: [],
  };
}

export function resolveSyntacticProfile(enemy = null) {
  if (enemy?.syntacticProfile) return enemy.syntacticProfile;
  if (enemy?.role === 'sentinel' || enemy?.bestiaryId === 'sentinel-brazier') {
    return SYNTACTIC_ARCHETYPE_PROFILES.SENTINEL_BRAZIER_BASE;
  }
  const name = String(enemy?.name || '').toLowerCase();
  if (name.includes('sentinel') || name.includes('brazier')) {
    return SYNTACTIC_ARCHETYPE_PROFILES.SENTINEL_BRAZIER_BASE;
  }
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
  const form = analyzeVerseForm(phrase);
  const {
    matchedSyntaxWeaknesses,
    resistedSyntaxForms,
    formMatch,
    formResist,
    rhythmScore,
  } = scoreSyntaxForm(form, syntacticProfile);

  // Lexical layer (unchanged weights) + grammatical-form overlay:
  // structure that matches an archetype's syntax weakness presses the
  // advantage; feeding its favored form hands tempo back.
  const score = clampBetween(
    weaknessMatch * 0.30
    + metaphorPrecision * 0.20
    + oppositionLogic * 0.16
    + literaryDeviceScore * 0.14
    + noveltyScore * 0.12
    + clarityScore * 0.08
    - resistanceMatch * 0.18
    + formMatch * 0.10
    + rhythmScore * 0.04
    - formResist * 0.08,
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
  if (matchedSyntaxWeaknesses.length > 0) {
    diagnostics.push(`Grammatical form ${matchedSyntaxWeaknesses.join('/')} pressed ${syntacticProfile.archetype}'s structure.`);
  }
  if (resistedSyntaxForms.length > 0) {
    diagnostics.push(`Sentence form ${resistedSyntaxForms.join('/')} played into the enemy's favored structure.`);
  }
  diagnostics.push(`Damage modifier: x${multiplier.toFixed(2)}.`);

  const events = [];
  if (matchedSyntaxWeaknesses.length > 0) {
    events.push({
      type: 'SYNTAX_FORM_ADVANTAGE',
      archetype: syntacticProfile.archetype,
      shapes: matchedSyntaxWeaknesses,
      mood: form.dominantMood,
    });
  }

  return {
    score: Number(score.toFixed(3)),
    multiplier: Number(multiplier.toFixed(3)),
    matchedWeaknessFamilies,
    resistedFamilies,
    detectedDevices,
    diagnostics,
    state,
    mood: form.dominantMood,
    shapes: form.shapes,
    rhythm: form.rhythm,
    matchedSyntaxWeaknesses,
    resistedSyntaxForms,
    events,
    components: {
      weaknessMatch: Number(weaknessMatch.toFixed(3)),
      resistanceMatch: Number(resistanceMatch.toFixed(3)),
      metaphorPrecision: Number(metaphorPrecision.toFixed(3)),
      oppositionLogic: Number(oppositionLogic.toFixed(3)),
      literaryDeviceScore: Number(literaryDeviceScore.toFixed(3)),
      noveltyScore: Number(noveltyScore.toFixed(3)),
      clarityScore: Number(clarityScore.toFixed(3)),
      formMatch: Number(formMatch.toFixed(3)),
      formResist: Number(formResist.toFixed(3)),
      rhythmScore: Number(rhythmScore.toFixed(3)),
    },
  };
}
