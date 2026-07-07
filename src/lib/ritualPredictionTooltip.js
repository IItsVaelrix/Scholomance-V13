import { PhonemeEngine } from '../../codex/core/phonology/phoneme.engine.js';
import { deepRhymeEngine } from '../../codex/core/rhyme-astrology/deepRhyme.engine.js';
import { ScholomanceDictionaryAPI } from './scholomanceDictionary.api.js';

// Pending prime request keyed by the engine instance, so a second tooltip open
// in the same tab does not re-issue the same lookup while the first is in
// flight. Cleared on success/error.
const pendingPrimeByEngine = new WeakMap();

/**
 * Prime the rhyme engine's authoritative family cache from the live
 * ScholomanceDictionaryAPI. This is the bridge that fixes the local-phoneme
 * slant/perfect misclassification: words that share a `rhyme_family` in the
 * server lexicon are perfect rhymes by contract, regardless of how the local
 * scorer rates their ending signatures.
 *
 * Safe to call repeatedly: the engine's `primeRhymeFamilies` is a no-op for
 * already-cached words, and a single in-flight promise is shared across
 * concurrent callers (de-duped by engine identity).
 */
export async function primeRitualRhymeFamilies(words, engine = deepRhymeEngine) {
  const list = Array.from(new Set(
    (Array.isArray(words) ? words : [])
      .map((w) => String(w || '').trim())
      .filter(Boolean),
  ));
  if (list.length === 0) return { requested: 0, families: 0 };

  const inFlight = pendingPrimeByEngine.get(engine);
  if (inFlight) return inFlight;

  const promise = (async () => {
    if (!ScholomanceDictionaryAPI.isConfigured()) {
      return { requested: list.length, families: 0, skipped: 'unconfigured' };
    }
    return engine.primeRhymeFamilies(list, ScholomanceDictionaryAPI);
  })();
  pendingPrimeByEngine.set(engine, promise);
  try {
    return await promise;
  } finally {
    pendingPrimeByEngine.delete(engine);
  }
}

const CONNECTORS = new Set([
  'and', 'or', 'but', 'nor', 'for', 'yet', 'so', 'if', 'then', 'than',
  'as', 'while', 'when', 'where', 'that', 'which', 'who', 'whom', 'whose',
  'with', 'without', 'by', 'from', 'to', 'at', 'in', 'on', 'of', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might',
  'can', 'could', 'must', 'not', 'no', 'the', 'a', 'an', 'this', 'these',
  'those', 'it', 'its', 'my', 'your', 'his', 'her', 'our', 'their',
]);

const MODIFIER_SIGNALS = new Set([
  'very', 'quite', 'rather', 'somewhat', 'extremely', 'deeply', 'barely',
  'almost', 'just', 'only', 'still', 'even', 'also', 'too', 'well',
  'fast', 'slow', 'hard', 'soft', 'bright', 'dark', 'dim', 'faint',
]);

// Verb-shaped suffixes. Pairing a suffix with the verbiness it actually
// implies lets the "why" trace name the morphology instead of asserting the
// conclusion. `-ly` is included as a NEGATIVE marker (it almost always makes
// an adverb, i.e. a modifier) so we stop mis-firing "trigger" on it.
const TRIGGER_SUFFIXES = ['ize', 'ise', 'ate', 'ify', 'fy', 'en', 'ing', 'ed'];
const MODIFIER_SUFFIXES = ['ly', 'ous', 'ful', 'less', 'ish', 'able', 'ible', 'ive'];
const ANCHOR_SUFFIXES = ['tion', 'sion', 'ment', 'ness', 'ity', 'ism', 'ship', 'hood', 'ance', 'ence'];

const RITUAL_FAMILIES = {
  anchor: 'Naming Rite',
  modifier: 'Adornment Rite',
  trigger: 'Invocation Rite',
  connector: 'Binding Rite',
  unknown: 'Unbound Rite',
};

// Map a lexicon part-of-speech onto a ritual role. Used by the component to
// reconcile the heuristic guess against authoritative dictionary data.
const POS_TO_ROLE = {
  noun: 'anchor',
  'proper noun': 'anchor',
  propn: 'anchor',
  verb: 'trigger',
  adjective: 'modifier',
  adj: 'modifier',
  adverb: 'modifier',
  adv: 'modifier',
  conjunction: 'connector',
  conj: 'connector',
  preposition: 'connector',
  adp: 'connector',
  pronoun: 'connector',
  pron: 'connector',
  determiner: 'connector',
  det: 'connector',
  article: 'connector',
  interjection: 'modifier',
};

export function posToRole(pos) {
  if (!pos) return null;
  return POS_TO_ROLE[String(pos).trim().toLowerCase()] || null;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function matchSuffix(word, suffixes, minStem = 2) {
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length > suffix.length + minStem) return suffix;
  }
  return null;
}

/**
 * Classify the ritual role and, crucially, report WHY. Returns the winning
 * role plus the discrete evidence each candidate role accumulated, so the
 * downstream "why" trace and confidence decomposition reference real signals
 * rather than restating the answer.
 */
function classifyRoleDetailed(word, analysis) {
  const lower = normalize(word);
  /** @type {Array<{ role: string, signal: string, detail: string, weight: number }>} */
  const evidence = [];

  if (CONNECTORS.has(lower)) {
    evidence.push({ role: 'connector', signal: 'function_word', detail: `"${lower}" is a closed-class function word`, weight: 0.9 });
  }
  if (MODIFIER_SIGNALS.has(lower)) {
    evidence.push({ role: 'modifier', signal: 'intensifier', detail: `"${lower}" is a known degree/intensity word`, weight: 0.8 });
  }

  const modSuffix = matchSuffix(lower, MODIFIER_SUFFIXES);
  if (modSuffix) {
    evidence.push({ role: 'modifier', signal: `suffix:-${modSuffix}`, detail: `the -${modSuffix} ending marks an adjective/adverb`, weight: modSuffix === 'ly' ? 0.7 : 0.55 });
  }
  const anchorSuffix = matchSuffix(lower, ANCHOR_SUFFIXES);
  if (anchorSuffix) {
    evidence.push({ role: 'anchor', signal: `suffix:-${anchorSuffix}`, detail: `the -${anchorSuffix} ending nominalizes (forms a noun)`, weight: 0.65 });
  }
  const trigSuffix = !modSuffix && !anchorSuffix ? matchSuffix(lower, TRIGGER_SUFFIXES) : null;
  if (trigSuffix) {
    evidence.push({ role: 'trigger', signal: `suffix:-${trigSuffix}`, detail: `the -${trigSuffix} ending suggests a verb form`, weight: 0.5 });
  }

  const syllables = Number(analysis?.syllableCount) || 0;
  if (syllables >= 3) {
    evidence.push({ role: 'anchor', signal: `syllables:${syllables}`, detail: `${syllables} syllables — polysyllabic words are usually content nouns`, weight: 0.4 });
  }
  if (lower.length <= 2 && !CONNECTORS.has(lower)) {
    evidence.push({ role: 'connector', signal: 'short_token', detail: `only ${lower.length} letters — likely a particle`, weight: 0.3 });
  }

  if (evidence.length === 0) {
    return {
      role: lower.length >= 6 ? 'anchor' : 'unknown',
      signal: lower.length >= 6 ? 'length_fallback' : 'no_signal',
      evidence: [{ role: lower.length >= 6 ? 'anchor' : 'unknown', signal: 'length_fallback', detail: `no morphological or lexical signal; falling back on length (${lower.length})`, weight: 0.15 }],
      alternatives: [],
    };
  }

  // Tally weights per role; the highest total wins, ties broken by first seen.
  const totals = new Map();
  for (const e of evidence) totals.set(e.role, (totals.get(e.role) || 0) + e.weight);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const [role] = ranked[0];
  const winning = evidence.filter((e) => e.role === role);

  return {
    role,
    signal: winning[0].signal,
    evidence: winning,
    alternatives: ranked.slice(1).map(([altRole, score]) => ({ role: altRole, score: Math.round(score * 100) / 100 })),
  };
}

function buildRitualName(word, role) {
  const capitalized = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  switch (role) {
    case 'anchor': return `${capitalized} — Anchor Sigil`;
    case 'trigger': return `${capitalized} — Trigger Glyph`;
    case 'modifier': return `${capitalized} — Adornment Mark`;
    case 'connector': return `${capitalized} — Binding Thread`;
    default: return `${capitalized} — Unbound Token`;
  }
}

function buildSemanticAura(analysis, role) {
  const aura = [];
  if (analysis?.vowelFamily) aura.push(`vowel:${analysis.vowelFamily.toUpperCase()}`);
  if (analysis?.syllableCount) aura.push(`syllables:${analysis.syllableCount}`);
  if (analysis?.rhymeKey) aura.push(`rhyme:${analysis.rhymeKey}`);
  if (analysis?.coda) aura.push(`coda:${analysis.coda}`);
  if (analysis?.stressPattern) aura.push(`stress:${analysis.stressPattern}`);
  aura.push(`role:${role}`);
  return aura;
}

// Surface the full structured phoneme analysis instead of flattening it to
// stringly-typed tags. Defensive about which path the engine resolved through.
function buildPhonology(analysis) {
  if (!analysis) return null;
  const syllables = Array.isArray(analysis.syllables)
    ? analysis.syllables.map((s) => (typeof s === 'string' ? s : (s?.vowel || s?.nucleus || ''))).filter(Boolean)
    : [];
  return {
    vowelFamily: analysis.vowelFamily || null,
    syllableCount: Number(analysis.syllableCount) || syllables.length || 0,
    stressPattern: analysis.stressPattern || null,
    coda: analysis.coda || null,
    rhymeKey: analysis.rhymeKey || null,
    extendedRhymeKeys: Array.isArray(analysis.extendedRhymeKeys) ? analysis.extendedRhymeKeys : [],
    syllables,
  };
}

function buildIntent(role) {
  switch (role) {
    case 'anchor': return `Names or identifies a concept — a stable reference point in the verse.`;
    case 'trigger': return `Initiates an action or transformation — a dynamic force in the line.`;
    case 'modifier': return `Qualifies or intensifies another element — shaping its meaning.`;
    case 'connector': return `Links elements together — a structural thread in the syntax.`;
    default: return `Role undetermined — the token resists classification.`;
  }
}

/**
 * Build the resonance picture from the surrounding line using the real rhyme
 * engine: which neighbours this word actually phonetically connects to, the
 * connection type (perfect/near/slant/assonance) and its score. This is the
 * genuinely useful payload that the old tooltip never computed.
 *
 * Sync path: `analyzeLine` is synchronous, but the dictionary family cache
 * must be primed asynchronously. If the cache has not been primed yet (e.g.
 * the tooltip opens before the prime promise resolves), the engine still
 * produces a line analysis; the connection types in that pass fall back to
 * local phoneme scoring until the next call after `primeRhymeFamilies`
 * resolves. The `primeResonanceFamilies` helper in this module kicks off
 * the prime in parallel with the analysis so the very first open is correct.
 */
function buildResonance(contextLine, word, debugTrace) {
  const empty = { partners: [], lineAnalysisOk: false };
  if (!contextLine || !contextLine.trim()) return empty;

  let lineAnalysis;
  try {
    lineAnalysis = deepRhymeEngine.analyzeLine(contextLine, 0, 0);
    debugTrace.push(`deepRhymeEngine.analyzeLine(line) → ${lineAnalysis?.words?.length || 0} words`);
  } catch (err) {
    debugTrace.push(`deepRhymeEngine.analyzeLine → FAILED (${err?.message || 'unknown'})`);
    return empty;
  }

  const target = normalize(word);
  const partners = [];
  const seen = new Set();
  for (const conn of lineAnalysis.internalRhymes || []) {
    const a = normalize(conn.wordA?.word);
    const b = normalize(conn.wordB?.word);
    let other = null;
    if (a === target && b !== target) other = conn.wordB.word;
    else if (b === target && a !== target) other = conn.wordA.word;
    if (!other) continue;
    const key = `${normalize(other)}:${conn.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    partners.push({ word: other, type: conn.type, score: Math.round((Number(conn.score) || 0) * 100) / 100 });
  }
  partners.sort((x, y) => y.score - x.score);
  return { partners: partners.slice(0, 6), lineAnalysisOk: true };
}

function buildNearbySignals(contextLine, word, resonance) {
  const signals = [];
  if (!contextLine) return signals;

  const tokens = contextLine.split(/\s+/).filter(Boolean);
  const target = normalize(word);
  const foundIndex = tokens.findIndex((t) => normalize(t) === target);

  if (foundIndex > 0) signals.push(`prev: "${tokens[foundIndex - 1]}"`);
  if (foundIndex >= 0 && foundIndex < tokens.length - 1) signals.push(`next: "${tokens[foundIndex + 1]}"`);
  for (const p of resonance.partners.slice(0, 3)) {
    signals.push(`${p.type} ↔ "${p.word}" (${p.score.toFixed(2)})`);
  }
  return signals;
}

/**
 * The "why" as a decision trace: the discrete evidence that actually moved the
 * classification, each with its weight — not prose templated off the answer.
 */
function buildWhyFactors(roleResult, analysis, resonance) {
  const factors = roleResult.evidence.map((e) => ({
    signal: e.signal,
    detail: e.detail,
    weight: Math.round(e.weight * 100) / 100,
  }));
  if (roleResult.alternatives.length > 0) {
    const alt = roleResult.alternatives[0];
    factors.push({ signal: 'runner_up', detail: `next-best role was "${alt.role}" (weight ${alt.score})`, weight: alt.score });
  }
  if (analysis?.rhymeKey) {
    factors.push({ signal: 'rhyme_key', detail: `rhyme key "${analysis.rhymeKey}" anchors phonetic matching`, weight: 0.2 });
  }
  if (resonance.partners.length > 0) {
    factors.push({ signal: 'line_resonance', detail: `resonates with ${resonance.partners.length} neighbour(s) in this line`, weight: 0.2 });
  }
  return factors;
}

function buildWhy(word, roleResult, factors) {
  const lead = `"${word}" → ${roleResult.role} via ${roleResult.signal}.`;
  const supporting = factors.slice(0, 2).map((f) => f.detail).join(' ');
  return supporting ? `${lead} ${supporting}` : lead;
}

function buildPossibleMeanings(role) {
  switch (role) {
    case 'anchor': return ['A named entity or concept'];
    case 'trigger': return ['An action or state change'];
    case 'modifier': return ['A quality or degree modifier'];
    case 'connector': return ['A grammatical or logical link'];
    default: return ['Unclassified token — may be a proper noun or rare word'];
  }
}

function buildSuggestedActions() {
  return ['Copy prediction', 'Inspect surrounding phrase'];
}

/**
 * Confidence as an auditable sum of factors tied to real determinacy:
 * did the phonology resolve, how decisive was the role signal, was there a
 * close runner-up (ambiguity penalty), and is the token out-of-vocabulary.
 */
function computeConfidence(roleResult, analysis) {
  const factors = [{ label: 'base prior', delta: 0.4 }];

  if (analysis) factors.push({ label: 'phonology resolved', delta: 0.15 });
  else factors.push({ label: 'no phoneme analysis', delta: -0.1 });

  const topWeight = roleResult.evidence.reduce((s, e) => s + e.weight, 0);
  if (roleResult.signal === 'no_signal') {
    factors.push({ label: 'unclassifiable token', delta: -0.2 });
  } else if (roleResult.signal === 'length_fallback') {
    factors.push({ label: 'heuristic length fallback', delta: -0.1 });
  } else if (topWeight >= 0.8) {
    factors.push({ label: `decisive signal (${roleResult.signal})`, delta: 0.25 });
  } else {
    factors.push({ label: `morphological signal (${roleResult.signal})`, delta: 0.12 });
  }

  const alt = roleResult.alternatives[0];
  if (alt && alt.score >= topWeight * 0.75) {
    factors.push({ label: `ambiguous vs "${alt.role}"`, delta: -0.12 });
  }

  const raw = factors.reduce((s, f) => s + f.delta, 0);
  const confidence = Math.min(0.98, Math.max(0.1, raw));
  return { confidence, factors };
}

export function buildRitualPrediction(params) {
  const {
    word,
    filePath,
    languageId,
    line,
    column,
    contextLine,
    surroundingText,
  } = params;

  const normalizedWord = normalize(word);
  const warnings = [];
  const debugTrace = [];

  let analysis = null;
  try {
    analysis = PhonemeEngine.analyzeWord(normalizedWord);
    debugTrace.push(`PhonemeEngine.analyzeWord("${normalizedWord}") → OK`);
  } catch (err) {
    warnings.push(`Phoneme analysis unavailable: ${err?.message || 'unknown error'}`);
    debugTrace.push(`PhonemeEngine.analyzeWord("${normalizedWord}") → FAILED`);
  }

  const roleResult = classifyRoleDetailed(normalizedWord, analysis);
  const role = roleResult.role;
  debugTrace.push(`classifyRole → ${role} (${roleResult.signal})`);

  const resonance = buildResonance(contextLine, word, debugTrace);
  const { confidence, factors: confidenceFactors } = computeConfidence(roleResult, analysis);
  debugTrace.push(`confidence → ${confidence.toFixed(2)}`);

  const whyFactors = buildWhyFactors(roleResult, analysis, resonance);

  return {
    word,
    normalizedWord,
    source: {
      filePath,
      languageId,
      line,
      column,
      contextLine: contextLine || '',
      surroundingText,
    },
    prediction: {
      ritualName: buildRitualName(word, role),
      ritualFamily: RITUAL_FAMILIES[role] || RITUAL_FAMILIES.unknown,
      role,
      roleSignal: roleResult.signal,
      roleAlternatives: roleResult.alternatives,
      intent: buildIntent(role),
      semanticAura: buildSemanticAura(analysis, role),
      phonology: buildPhonology(analysis),
      syntacticFunction: analysis?.stressPattern || undefined,
      confidence,
      confidenceFactors,
    },
    details: {
      why: buildWhy(word, roleResult, whyFactors),
      whyFactors,
      nearbySignals: buildNearbySignals(contextLine, word, resonance),
      resonancePartners: resonance.partners,
      possibleMeanings: buildPossibleMeanings(role),
      suggestedActions: buildSuggestedActions(),
    },
    diagnostics: {
      warnings,
      debugTrace,
    },
  };
}
