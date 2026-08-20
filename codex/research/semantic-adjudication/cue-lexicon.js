/**
 * Typed cue lexicons for rubric gold and Pass B family labeling.
 *
 * These are world-knowledge cues, not Ballistics. They are allowed to
 * discover which predicate family a human would have used. They are not
 * a production warranting signal.
 *
 * @module codex/research/semantic-adjudication/cue-lexicon
 */

export const CUE_LEXICON = Object.freeze({
  ANIMACY: Object.freeze([
    'he', 'she', 'who', 'animal', 'dog', 'cat', 'bird', 'horse', 'creature',
    'living', 'alive', 'died', 'killed', 'ate', 'slept',
  ]),
  HUMANNESS: Object.freeze([
    'man', 'woman', 'person', 'people', 'doctor', 'teacher', 'child', 'human',
    'someone', 'anyone', 'crowd', 'audience',
  ]),
  CONCRETENESS: Object.freeze([
    'object', 'thing', 'stone', 'wood', 'metal', 'physical', 'held', 'touched',
    'idea', 'thought', 'concept', 'belief',
  ]),
  TEMPORALITY: Object.freeze([
    'yesterday', 'tomorrow', 'today', 'when', 'time', 'hour', 'day', 'year',
    'before', 'after', 'during', 'season', 'spring', 'summer', 'winter',
  ]),
  LOCATION: Object.freeze([
    'river', 'hill', 'city', 'near', 'beside', 'shore', 'slope', 'grassy',
    'valley', 'bankside', 'water', 'land', 'place', 'picnic', 'grass',
    'ground', 'field', 'pond', 'cave', 'harbor', 'ice', 'stream',
  ]),
  MOTION: Object.freeze([
    'run', 'ran', 'walk', 'walked', 'fly', 'flew', 'toward', 'across',
    'moved', 'flowed', 'rushed', 'sprang', 'leapt',
  ]),
  AGENCY: Object.freeze([
    'agent', 'actor', 'deliberately', 'chose', 'decided', 'forced',
  ]),
  INSTRUMENTALITY: Object.freeze([
    'using', 'tool', 'instrument', 'machine', 'device', 'lifted',
    'crane', 'hammer',
  ]),
  MATERIALITY: Object.freeze([
    'wood', 'metal', 'metallic', 'iron', 'glass', 'stone', 'cloth', 'made',
    'element', 'ore', 'mineral', 'earth',
  ]),
  EVENT_STRUCTURE: Object.freeze([
    'during', 'process', 'event', 'happened', 'occurred', 'ceremony',
  ]),
  SELECTIONAL_ROLE: Object.freeze([
    'subject', 'object', 'patient', 'theme',
  ]),
  NUMBER: Object.freeze([
    'many', 'few', 'several', 'one', 'two', 'plural',
  ]),
  MORPHOLOGY: Object.freeze([
    'ed', 'ing', 's',
  ]),
  SYNTACTIC_FRAME: Object.freeze([
    'determiner', 'modal', 'infinitive', 'imperative', 'passive',
  ]),
  DOMAIN: Object.freeze([
    'loan', 'cash', 'credit', 'account', 'teller', 'money', 'deposit',
    'deposits', 'financial', 'music', 'fish', 'legal', 'medical',
    'prison', 'grammar', 'factory', 'garden',
  ]),
  ENTITY_TYPE: Object.freeze([
    'institution', 'organization', 'company', 'firm', 'bank', 'school',
    'hospital', 'factory', 'plant', 'office', 'court',
  ]),
  PART_WHOLE: Object.freeze([
    'part', 'member', 'piece', 'whole', 'portion', 'component',
  ]),
  CAUSE_EFFECT: Object.freeze([
    'because', 'cause', 'result', 'therefore',
  ]),
  STATE_CHANGE: Object.freeze([
    'become', 'became', 'grew', 'closed', 'opened', 'broke',
  ]),
  SOCIAL_ROLE: Object.freeze([
    'king', 'teacher', 'officer', 'judge', 'role', 'office', 'title',
  ]),
  PHONETIC_ONLY: Object.freeze([]),
  OTHER: Object.freeze([]),
});

const TOKEN_RE = /[a-z']+/g;

export function tokenize(text) {
  return String(text ?? '').toLowerCase().match(TOKEN_RE) || [];
}

export function cueHits(tokens, family) {
  const lex = new Set(CUE_LEXICON[family] || []);
  let n = 0;
  for (const t of tokens) {
    if (lex.has(t)) n += 1;
  }
  return n;
}

export function familyScores(queryText, glossText) {
  const q = tokenize(queryText);
  const g = tokenize(glossText);
  const out = [];
  for (const family of Object.keys(CUE_LEXICON)) {
    const qh = cueHits(q, family);
    const gh = cueHits(g, family);
    const score = qh > 0 && gh > 0 ? qh * gh : 0;
    if (score > 0) out.push({ family, score, queryHits: qh, glossHits: gh });
  }
  return out.sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
}

export function discriminativeFamily(queryText, goldGloss, competitorGlosses) {
  const gold = familyScores(queryText, goldGloss);
  const goldMap = new Map(gold.map((r) => [r.family, r.score]));
  let best = { family: 'OTHER', delta: 0 };
  for (const [family, score] of goldMap) {
    const competitorMax = Math.max(
      0,
      ...competitorGlosses.map((g) => {
        const hit = familyScores(queryText, g).find((r) => r.family === family);
        return hit?.score ?? 0;
      }),
    );
    const delta = score - competitorMax;
    if (delta > best.delta || (delta === best.delta && family < best.family)) {
      best = { family, delta };
    }
  }
  return best.delta > 0 ? best.family : 'OTHER';
}
