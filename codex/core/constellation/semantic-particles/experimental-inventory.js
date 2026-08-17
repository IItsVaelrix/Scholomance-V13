/**
 * EXPERIMENTAL T1 INVENTORY
 *
 * Frozen 27-dimension lattice plus an authored lemma map. Not gold syntax.
 * Coverage over common English, not encyclopedic completeness.
 *
 * Phase 3B (2026-08-17, prereg phase-3b-complement-lexical): lexical
 * growth only, demand-bounded by the complement dark-ends census —
 * constituent classes for S/SBAR/INF, the lemma-by-lemma VP alias, and
 * the want/need cognition authoring. The dimension lattice is unchanged.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/experimental-inventory
 */

import { createFeatureProvider } from './feature-provider.js';
import { UNKNOWN } from './feature-provider.js';

export const EXPERIMENTAL_FEATURE_SCHEMA_VERSION = '1.2.0';

export const EXPERIMENTAL_FEATURE_DIMENSIONS = Object.freeze({
  'entity.animate': Object.freeze(['true', 'false']),
  'entity.human': Object.freeze(['true', 'false']),
  'entity.animal': Object.freeze(['true', 'false']),
  'entity.concrete': Object.freeze(['true', 'false']),
  'entity.abstract': Object.freeze(['true', 'false']),
  'entity.location': Object.freeze(['true', 'false']),
  'entity.organization': Object.freeze(['true', 'false']),
  'entity.artifact': Object.freeze(['true', 'false']),
  'entity.substance': Object.freeze(['true', 'false']),
  'event.motion': Object.freeze(['true', 'false']),
  'event.communication': Object.freeze(['true', 'false']),
  'event.cognition': Object.freeze(['true', 'false']),
  'event.perception': Object.freeze(['true', 'false']),
  'event.possession': Object.freeze(['true', 'false']),
  'event.creation': Object.freeze(['true', 'false']),
  'event.change': Object.freeze(['true', 'false']),
  'event.state': Object.freeze(['true', 'false']),
  'property.color': Object.freeze(['true', 'false']),
  'property.size': Object.freeze(['true', 'false']),
  'property.age': Object.freeze(['true', 'false']),
  'property.quantity': Object.freeze(['true', 'false']),
  'property.evaluation': Object.freeze(['true', 'false']),
  'property.physicalState': Object.freeze(['true', 'false']),
  'role.agentCapable': Object.freeze(['true', 'false']),
  'role.experiencerCapable': Object.freeze(['true', 'false']),
  'role.locationCapable': Object.freeze(['true', 'false']),
  'role.instrumentCapable': Object.freeze(['true', 'false']),
  'function.adposition': Object.freeze(['true', 'false']),
  'function.infinitival': Object.freeze(['true', 'false']),
  'function.particle': Object.freeze(['true', 'false']),
  'function.determiner': Object.freeze(['true', 'false']),
  'function.relativizer': Object.freeze(['true', 'false']),
  'function.auxiliary': Object.freeze(['true', 'false']),
  'function.copula': Object.freeze(['true', 'false']),
  'function.pronominal': Object.freeze(['true', 'false']),
  'function.adverbial': Object.freeze(['true', 'false']),
});

function bag(...words) {
  return new Set(words.map((w) => String(w).toLowerCase()));
}

const HUMAN = bag(
  'man', 'men', 'woman', 'women', 'person', 'people', 'human', 'humans',
  'president', 'governor', 'director', 'leader', 'leaders', 'officials',
  'friend', 'friends', 'girl', 'girls', 'guy', 'guys', 'boy', 'child', 'children',
  'mother', 'father', 'daughter', 'son', 'wife', 'husband', 'cousin', 'family',
  'teacher', 'student', 'students', 'doctor', 'lawyer', 'attorney', 'author',
  'writer', 'editor', 'engineer', 'scientist', 'analyst', 'agent', 'client',
  'clients', 'customer', 'employee', 'employees', 'member', 'members',
  'soldier', 'soldiers', 'troops', 'officer', 'police', 'judge', 'jury',
  'citizen', 'citizens', 'civilian', 'civilians', 'refugee', 'refugees',
  'passenger', 'passengers', 'tourist', 'tourists', 'visitor', 'visitors',
  'president', 'minister', 'secretary', 'ambassador', 'king', 'queen',
  'bride', 'groom', 'gentleman', 'lady', 'someone', 'anyone', 'everybody',
  'arab', 'iraqi', 'iraqis', 'israeli', 'israelis', 'american', 'palestinian',
  'palestinians', 'muslims', 'westerners', 'historian', 'historians',
  'reporter', 'reporters', 'blogger', 'reader', 'owner', 'owners',
  'partner', 'attendant', 'attendees', 'demonstrators', 'guerrillas',
  'snipers', 'marines', 'trainee', 'trainees', 'trainer', 'dealer',
  'seller', 'sender', 'recipient', 'player', 'coach', 'fanatic',
  'staff',
  'idiot', 'idiots', 'stranger', 'strangers', 'heirs', 'descendant',
  'descendants', 'newlywed', 'cleric', 'sheikh', 'extremist',
  'allen', 'anderson', 'ben', 'bruce', 'brent', 'butler', 'griffin',
  'hayes', 'hector', 'james', 'john', 'kelly', 'lewis', 'martin', 'mary',
  'matt', 'mike', 'pauline', 'perry', 'philip', 'reynolds', 'russell',
  'saddam', 'hussein', 'arafat', 'mohammed', 'bin', 'laden',
  'bush', 'obama', 'clinton', 'trump', 'biden',
);

const ANIMAL = bag(
  'cat', 'cats', 'dog', 'dogs', 'bird', 'birds', 'horse', 'goat', 'wolf',
  'mouse', 'rat', 'hamster', 'gerbil', 'kitten', 'pet', 'pets', 'animal',
  'animals', 'fish', 'cow', 'pig', 'sheep', 'lion', 'tiger', 'bear',
  'lynx', 'chameleon', 'rodent', 'doberman', 'siamese',
);

const LOCATION = bag(
  'city', 'cities', 'town', 'towns', 'country', 'countries', 'state', 'states',
  'region', 'regions', 'area', 'place', 'places', 'location', 'site', 'sites',
  'home', 'house', 'office', 'room', 'bedroom', 'courtroom', 'auditorium',
  'street', 'road', 'river', 'sea', 'beach', 'bay', 'gulf', 'forest', 'field',
  'village', 'district', 'territories', 'border', 'camp', 'station',
  'airport', 'museum', 'church', 'garden', 'restaurant', 'restaurants',
  'iraq', 'iran', 'israel', 'palestine', 'afghanistan', 'america', 'france',
  'russia', 'mexico', 'ireland', 'vietnam', 'argentina', 'fiji',
  'baghdad', 'basra', 'fallujah', 'kirkuk', 'tehran', 'jerusalem', 'delhi',
  'mumbai', 'london', 'paris', 'chicago', 'detroit', 'houston', 'florida',
  'california', 'texas', 'york', 'orleans', 'philadelphia', 'portland',
  'omaha', 'calgary', 'toronto', 'sydney', 'auckland', 'tampa',
  'east', 'west', 'north', 'south', 'inside', 'outside', 'here', 'there',
  'world', 'earth', 'space', 'sky', 'land', 'heartland',
);

const ORGANIZATION = bag(
  'government', 'administration', 'department', 'agency', 'commission',
  'council', 'union', 'company', 'companies', 'corporation', 'association',
  'community', 'army', 'coalition', 'hamas', 'hezbollah', 'qaeda', 'nasa',
  'google', 'amazon', 'eu', 'un', 'iaea', 'fed', 'bank', 'airlines',
  'industry', 'sector', 'party', 'church', 'orchestra', 'museum',
  'university', 'college', 'school', 'hospital', 'court',
);

const ARTIFACT = bag(
  'table', 'chair', 'bed', 'box', 'bag', 'book', 'books', 'car', 'bus', 'boat',
  'plane', 'phone', 'iphone', 'ipod', 'computer', 'engine', 'weapon', 'weapons',
  'gun', 'rocket', 'rockets', 'ticket', 'tickets', 'card', 'cards', 'file',
  'files', 'letter', 'email', 'e-mail', 'message', 'page', 'paper', 'pen',
  'cup', 'plate', 'knife', 'fork', 'door', 'window', 'wall', 'bridge',
  'building', 'house', 'road', 'wheel', 'wheels', 'camera', 'tv', 'radio',
  'ship', 'train', 'bike', 'key', 'lock', 'clock', 'watch', 'glass',
  'bottle', 'bagels', 'sandwich', 'taco', 'sausages', 'chips',
  'passport', 'ticket', 'luggage', 'stereo', 'smartphone', 'blackberry',
);

const SUBSTANCE = bag(
  'water', 'air', 'oil', 'blood', 'food', 'foods', 'meat', 'cheese', 'egg',
  'eggs', 'milk', 'wine', 'beer', 'alcohol', 'gas', 'soil', 'sand', 'dust',
  'smoke', 'fire', 'ice', 'snow', 'rain', 'wood', 'metal', 'gold', 'silver',
  'iron', 'steel', 'plastic', 'paper', 'cloth', 'cotton', 'sugar', 'salt',
  'electricity', 'energy', 'crude', 'bacon', 'chorizo', 'seafood',
);

const ABSTRACT = bag(
  'idea', 'ideas', 'thought', 'thoughts', 'theory', 'theories', 'plan',
  'problem', 'problems', 'reason', 'reasons', 'truth', 'freedom', 'peace',
  'war', 'wars', 'love', 'hate', 'fear', 'hope', 'faith', 'justice',
  'policy', 'law', 'right', 'rights', 'power', 'authority', 'control',
  'information', 'data', 'news', 'story', 'history', 'future', 'past',
  'time', 'times', 'life', 'death', 'way', 'ways', 'thing', 'things',
  'fact', 'case', 'issue', 'issues', 'question', 'questions', 'answer',
  'opinion', 'opinions', 'interest', 'risk', 'risks', 'value', 'values',
  'meaning', 'sense', 'kind', 'sort', 'type', 'part', 'parts',
  'agreement', 'agreements', 'decision', 'result', 'results', 'effect',
  'cause', 'change', 'changes', 'process', 'system', 'program',
  'service', 'support', 'help', 'need', 'needs', 'want', 'goal', 'goals',
  'opportunity', 'experience', 'attention', 'respect', 'trust',
  'situation', 'condition', 'state', 'status', 'level', 'rate', 'rates',
  'number', 'numbers', 'amount', 'price', 'cost', 'money', 'dollars',
  'acquisition', 'administration', 'communication', 'conservation',
  'destruction', 'discrimination', 'distribution', 'evacuation',
  'exploration', 'implication', 'implications', 'imprisonment',
  'incompetence', 'indication', 'intelligence', 'negotiation',
  'negotiations', 'notification', 'participation', 'prevention',
  'realisation', 'reliance', 'resistance', 'solidarity', 'subterfuge',
  'transition', 'treatment', 'valuation', 'emptiness', 'extinction',
  'work', 'job', 'jobs', 'task', 'tasks', 'name', 'names', 'use',
);

const MOTION = bag(
  'run', 'ran', 'running', 'runs', 'go', 'goes', 'went', 'going', 'gone',
  'come', 'comes', 'came', 'coming', 'walk', 'walked', 'walking',
  'move', 'moved', 'moving', 'movement', 'fly', 'flew', 'flying',
  'drive', 'drove', 'driving', 'ride', 'travel', 'traveler',
  'leave', 'left', 'leaving', 'enter', 'arrive', 'return', 'returned',
  'bring', 'brought', 'carry', 'fall', 'fell', 'rise', 'raise',
  'climb', 'climbing', 'chase', 'chasing', 'follow', 'following',
  'send', 'sent', 'reach', 'reached', 'cross', 'crossing',
  'round', 'turn', 'turned', 'pass', 'passing', 'flow', 'floods',
);

const COMMUNICATION = bag(
  'say', 'says', 'said', 'saying', 'tell', 'telling', 'told',
  'ask', 'asked', 'asking', 'talk', 'talking', 'speak', 'speaks', 'spoke',
  'like', 'please',
  'write', 'wrote', 'written', 'writing', 'call', 'called', 'calling',
  'report', 'reports', 'announce', 'announced', 'claim', 'claimed',
  'explain', 'describe', 'described', 'discuss', 'comment', 'comments',
  'answer', 'reply', 'replied', 'mention', 'state', 'stated',
  'suggest', 'argue', 'warn', 'promise', 'promises', 'thank', 'thanks',
  'ask', 'question', 'questions', 'tell', 'inform', 'informed',
);

const COGNITION = bag(
  'think', 'thinking', 'thought', 'know', 'knew', 'known', 'knowing',
  'believe', 'believe', 'understand', 'understanding', 'remember',
  'forget', 'decide', 'decided', 'decision', 'consider', 'imagine',
  'realize', 'learn', 'guess', 'expect', 'expected', 'hope', 'wish',
  'intend', 'intends', 'intended', 'plan', 'wonder', 'assume',
  'interpret', 'interpreted', 'evaluate', 'calculate', 'mean', 'means',
  // Phase 3B (TRAIN-demand-bounded): top-ranked dark complement governors
  // in the 2026-08-17 dark-ends census, TRAIN terminal mass 130 each.
  // Propositional-attitude verbs, class-consistent with hope/wish/expect.
  // Inflected forms are literal members (the feature seed is exact-key;
  // same convention as say/says/said/saying above).
  'want', 'wants', 'wanted', 'wanting', 'need', 'needs', 'needed',
);

const PERCEPTION = bag(
  'see', 'saw', 'seen', 'seeing', 'look', 'looked', 'looking', 'looks',
  'watch', 'hear', 'heard', 'hearing', 'feel', 'felt', 'feeling',
  'find', 'finding',
  'smell', 'taste', 'notice', 'noticed', 'observe', 'seem', 'seems',
  'appear', 'appeared', 'show', 'shown',
);

const POSSESSION = bag(
  'have', 'has', 'had', 'having', 'own', 'get', 'got', 'getting', 'gets',
  'give', 'gives', 'gave', 'given', 'take', 'takes', 'took', 'taken', 'taking',
  'buy', 'bought', 'sell', 'sold', 'sells', 'keep', 'keeps', 'kept',
  'hold', 'held', 'receive', 'received', 'lose', 'lost', 'losing',
  'pay', 'paid', 'offer', 'offers', 'provide', 'provided',
);

const CREATION = bag(
  'make', 'makes', 'made', 'making', 'create', 'created', 'build', 'built',
  'produce', 'form', 'formed', 'write', 'wrote', 'design', 'cause',
  'generate', 'develop', 'found', 'founded', 'start', 'started',
  'work', 'use', 'let', 'try', 'tried', 'trying', 'attach', 'attached',
  'do', 'does', 'did', 'doing',
);

const CHANGE = bag(
  'become', 'became', 'change', 'changed', 'changes', 'grow', 'grew', 'growing',
  'grown', 'turn', 'turned', 'increase', 'decrease', 'improve', 'reduce',
  'reducing', 'break', 'broke', 'broken', 'open', 'opened', 'close', 'closed',
  'kill', 'killed', 'die', 'died', 'destroy', 'cut', 'break',
);

const STATE = bag(
  'be', 'is', 'are', 'was', 'were', 'been', 'being', 'am',
  'remain', 'stay', 'seem', 'seems', 'exist', 'live', 'lives', 'lived',
  'wait', 'sit', 'sitting', 'stand', 'standing', 'lie', 'sleep', 'sleeping',
);

const COLOR = bag(
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'brown', 'gray', 'grey',
  'dark', 'light', 'golden', 'orange', 'purple', 'pink',
);

const SIZE = bag(
  'big', 'small', 'large', 'little', 'huge', 'tiny', 'long', 'short',
  'wide', 'narrow', 'high', 'low', 'thick', 'thin', 'great', 'greater',
  'larger', 'highest', 'higher',
);

const AGE = bag(
  'old', 'new', 'young', 'ancient', 'modern', 'recent', 'early', 'late',
  'former', 'current', 'future', 'past', 'aged',
  'first', 'last',
);

const QUANTITY = bag(
  'many', 'much', 'few', 'several', 'some', 'all', 'most', 'more',
  'less', 'enough', 'full', 'empty', 'half', 'whole', 'numerous',
  'million', 'millions', 'thousand', 'thousands', 'hundred', 'hundreds',
  'two', 'three', 'four', 'five',
);

const EVALUATION = bag(
  'good', 'bad', 'best', 'better', 'worse', 'worst', 'great', 'fine',
  'nice', 'beautiful', 'ugly', 'important', 'serious', 'true', 'false',
  'right', 'wrong', 'fair', 'excellent', 'horrible', 'amazing', 'awesome',
  'happy', 'sad', 'angry', 'crazy', 'stupid', 'smart', 'easy', 'hard',
  'possible', 'necessary', 'available', 'useful', 'successful',
  'acceptable', 'reasonable', 'genuine', 'sincere', 'proud',
  'just', 'only', 'same', 'friendly',
);

const PHYSICAL = bag(
  'hot', 'cold', 'warm', 'cool', 'dry', 'wet', 'soft', 'hard', 'raw',
  'dead', 'alive', 'ill', 'sick', 'healthy', 'clean', 'dirty', 'open',
  'closed', 'broken', 'solid', 'liquid',
);

const IRREGULAR = Object.freeze({
  ran: 'run', running: 'run', runs: 'run',
  went: 'go', going: 'go', gone: 'go', goes: 'go',
  came: 'come', coming: 'come', comes: 'come',
  said: 'say', says: 'say', saying: 'say',
  told: 'tell', thought: 'think', knew: 'know', known: 'know',
  saw: 'see', seen: 'see', heard: 'hear', felt: 'feel',
  got: 'get', getting: 'get', gave: 'give', given: 'give',
  took: 'take', taken: 'take', taking: 'take', made: 'make', making: 'make',
  had: 'have', having: 'have', did: 'do', done: 'do', doing: 'do',
  left: 'leave', leaving: 'leave',
  men: 'man', women: 'woman', people: 'person', children: 'child',
  mice: 'mouse', geese: 'goose',
  // Phase 3B: morphology fix only — 'try' is already bagged (CREATION);
  // the suffix stemmer maps tried→tri and misses it without this entry.
  tried: 'try',
});

function stem(lemma) {
  const lower = String(lemma || '').toLowerCase();
  if (IRREGULAR[lower]) return IRREGULAR[lower];
  if (lower.length > 4 && lower.endsWith('ies')) return `${lower.slice(0, -3)}y`;
  if (lower.length > 4 && lower.endsWith('ing')) return lower.slice(0, -3);
  if (lower.length > 3 && lower.endsWith('ed')) return lower.slice(0, -2);
  if (lower.length > 3 && lower.endsWith('es')) return lower.slice(0, -2);
  if (lower.length > 3 && lower.endsWith('s')) return lower.slice(0, -1);
  return lower;
}

function isNominal(type) {
  return type === 'N' || type === 'NP' || type === 'NC' || type === 'PROPN' || type === 'NPO';
}

function isVerbal(type) {
  return type === 'V' || type === 'VP';
}

function isAdj(type) {
  return type === 'ADJ' || type === 'A';
}

function hit(set, lemma) {
  return set.has(lemma) || set.has(stem(lemma));
}

function mark(out, key) {
  out[key] = true;
}

export function classifyLemma(lemma, type) {
  const L = String(lemma || '').toLowerCase();
  if (!L || L === '__none__') return null;
  const out = Object.create(null);
  const t = type || '';

  if (isNominal(t)) {
    const human = hit(HUMAN, L)
      || (t === 'PROPN' && !hit(LOCATION, L) && !hit(ORGANIZATION, L) && L.length > 2);
    if (human) {
      mark(out, 'entity.human');
      mark(out, 'entity.animate');
      mark(out, 'entity.concrete');
      out['entity.animal'] = false;
      out['entity.artifact'] = false;
      out['entity.abstract'] = false;
      mark(out, 'role.agentCapable');
      mark(out, 'role.experiencerCapable');
    }
    if (hit(ANIMAL, L)) {
      mark(out, 'entity.animal');
      mark(out, 'entity.animate');
      mark(out, 'entity.concrete');
      out['entity.human'] = false;
      out['entity.artifact'] = false;
      mark(out, 'role.experiencerCapable');
    }
    if (hit(LOCATION, L)) {
      mark(out, 'entity.location');
      mark(out, 'entity.concrete');
      out['entity.human'] = false;
      mark(out, 'role.locationCapable');
    }
    if (hit(ORGANIZATION, L)) {
      mark(out, 'entity.organization');
      mark(out, 'entity.abstract');
      out['entity.concrete'] = false;
      mark(out, 'role.agentCapable');
    }
    if (hit(ARTIFACT, L)) {
      mark(out, 'entity.artifact');
      mark(out, 'entity.concrete');
      out['entity.animate'] = false;
      out['entity.human'] = false;
      mark(out, 'role.instrumentCapable');
    }
    if (hit(SUBSTANCE, L)) {
      mark(out, 'entity.substance');
      mark(out, 'entity.concrete');
      out['entity.animate'] = false;
    }
    if (hit(ABSTRACT, L) || /(?:tion|sion|ment|ness|ity|ance|ence|ism|ship|hood)$/.test(L)) {
      mark(out, 'entity.abstract');
      out['entity.concrete'] = false;
      out['entity.animate'] = false;
    }
  }

  if (isVerbal(t)) {
    if (hit(MOTION, L)) { mark(out, 'event.motion'); out['event.cognition'] = false; }
    if (hit(COMMUNICATION, L)) mark(out, 'event.communication');
    if (hit(COGNITION, L)) { mark(out, 'event.cognition'); out['event.motion'] = false; }
    if (hit(PERCEPTION, L)) mark(out, 'event.perception');
    if (hit(POSSESSION, L)) mark(out, 'event.possession');
    if (hit(CREATION, L)) mark(out, 'event.creation');
    if (hit(CHANGE, L)) mark(out, 'event.change');
    if (hit(STATE, L)) { mark(out, 'event.state'); out['event.motion'] = false; }
    if (out['event.motion'] || out['event.creation'] || out['event.change']) {
      mark(out, 'role.agentCapable');
    }
    if (out['event.cognition'] || out['event.perception']) {
      mark(out, 'role.experiencerCapable');
    }
  }

  if (t === 'P') {
    mark(out, 'function.adposition');
    out['function.infinitival'] = false;
    out['function.particle'] = false;
  }
  if (t === 'TO') {
    mark(out, 'function.infinitival');
    out['function.adposition'] = false;
  }
  if (t === 'PRT') {
    mark(out, 'function.particle');
    out['function.adposition'] = false;
  }
  if (t === 'DET') {
    mark(out, 'function.determiner');
    out['function.relativizer'] = false;
  }
  if (t === 'REL') {
    mark(out, 'function.relativizer');
    out['function.determiner'] = false;
  }
  if (t === 'AUX') {
    mark(out, 'function.auxiliary');
    out['function.copula'] = false;
  }
  if (t === 'COP') {
    mark(out, 'function.copula');
    out['function.auxiliary'] = false;
  }
  if (t === 'PRON' || t === 'PRONACC') {
    mark(out, 'function.pronominal');
    mark(out, 'entity.animate');
    mark(out, 'role.agentCapable');
    mark(out, 'role.experiencerCapable');
    out['entity.artifact'] = false;
  }
  if (t === 'ADV') {
    mark(out, 'function.adverbial');
  }

  // Phase 3B constituent classes (lemma-independent structural facts).
  // An INF constituent is infinitival by construction — the same fact
  // `*::TO` carries. A clause composed as a complement denotes
  // propositional content: abstract, not concrete, not animate. These
  // describe what the constituent IS, never which parse should win.
  if (t === 'INF') {
    mark(out, 'function.infinitival');
    out['function.adposition'] = false;
  }
  if (t === 'S' || t === 'SBAR') {
    mark(out, 'entity.abstract');
    out['entity.concrete'] = false;
    out['entity.animate'] = false;
  }

  if (isAdj(t)) {
    if (hit(COLOR, L)) { mark(out, 'property.color'); out['property.age'] = false; }
    if (hit(SIZE, L)) mark(out, 'property.size');
    if (hit(AGE, L)) { mark(out, 'property.age'); out['property.color'] = false; }
    if (hit(QUANTITY, L)) mark(out, 'property.quantity');
    if (hit(EVALUATION, L) || /(?:ful|ous|ive|less|able|ible)$/.test(L)) {
      mark(out, 'property.evaluation');
    }
    if (hit(PHYSICAL, L)) mark(out, 'property.physicalState');
  }

  return Object.keys(out).length ? out : null;
}

function compileSeed() {
  const lemmas = new Set();
  for (const set of [
    HUMAN, ANIMAL, LOCATION, ORGANIZATION, ARTIFACT, SUBSTANCE, ABSTRACT,
    MOTION, COMMUNICATION, COGNITION, PERCEPTION, POSSESSION, CREATION, CHANGE, STATE,
    COLOR, SIZE, AGE, QUANTITY, EVALUATION, PHYSICAL,
    new Set(Object.keys(IRREGULAR)),
    new Set(Object.values(IRREGULAR)),
  ]) {
    for (const w of set) lemmas.add(w);
  }
  const seed = Object.create(null);
  for (const lemma of [...lemmas].sort()) {
    for (const type of ['N', 'V', 'ADJ', 'PROPN']) {
      const feats = classifyLemma(lemma, type);
      if (feats) seed[`${lemma}::${type}`] = Object.freeze(feats);
    }
    // Phase 3B VP alias law: a VP constituent inherits the classification
    // of its head verb. The lexical layer already aliases VP→V for senses
    // (TYPE_ALIASES); this makes the feature seed see the same lexicon.
    // Lemma-by-lemma, NOT a *::VP default — an unclassified head (nouns
    // mis-tagged as V, participles, cutoff lemmas) must stay dark.
    const verbal = classifyLemma(lemma, 'V');
    if (verbal) seed[`${lemma}::VP`] = Object.freeze({ ...verbal });
  }
  // Phase 3B adds the clause-constituent defaults S / SBAR / INF
  // (lemma-independent structural classes; see classifyLemma).
  for (const type of ['P', 'TO', 'PRT', 'DET', 'REL', 'AUX', 'COP', 'PRON', 'PRONACC', 'ADV', 'S', 'SBAR', 'INF']) {
    const feats = classifyLemma('*', type);
    if (feats) seed[`*::${type}`] = Object.freeze(feats);
  }
  return seed;
}

export const EXPERIMENTAL_FEATURE_PROVIDER = createFeatureProvider(
  compileSeed(),
  {
    version: EXPERIMENTAL_FEATURE_SCHEMA_VERSION,
    role: 'experimental',
    dimensions: EXPERIMENTAL_FEATURE_DIMENSIONS,
  },
);

export function knownFeatureCount(features) {
  return (features || []).filter((f) => f.value !== UNKNOWN && f.confidence != null).length;
}
