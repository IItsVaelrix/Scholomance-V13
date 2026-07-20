import { MORPHOLOGY_VERSION } from '../lexical-graph/types.js';

const POS_ALIASES = Object.freeze({
  n: 'noun',
  noun: 'noun',
  v: 'verb',
  verb: 'verb',
  a: 'adjective',
  s: 'adjective',
  adjective: 'adjective',
  adjective_satellite: 'adjective',
  r: 'adverb',
  adverb: 'adverb',
});

const IRREGULARS = Object.freeze({
  'see/verb': Object.freeze([
    Object.freeze({ surface: 'saw', transformId: 'verb.past.irregular' }),
    Object.freeze({ surface: 'seen', transformId: 'verb.participle.irregular' }),
  ]),
  'go/verb': Object.freeze([
    Object.freeze({ surface: 'went', transformId: 'verb.past.irregular' }),
    Object.freeze({ surface: 'gone', transformId: 'verb.participle.irregular' }),
  ]),
  'good/adjective': Object.freeze([
    Object.freeze({ surface: 'better', transformId: 'adjective.comparative.irregular' }),
    Object.freeze({ surface: 'best', transformId: 'adjective.superlative.irregular' }),
  ]),
  'well/adverb': Object.freeze([
    Object.freeze({ surface: 'better', transformId: 'adverb.comparative.irregular' }),
    Object.freeze({ surface: 'best', transformId: 'adverb.superlative.irregular' }),
  ]),
});

function fail(message) {
  throw new Error(`PB-ERR-v1-VALUE: ${message}`);
}

function normalizeLemma(lemma) {
  if (typeof lemma !== 'string' || !lemma.trim()) fail('lemma is required');
  return lemma.normalize('NFC').trim().toLocaleLowerCase('en-US');
}

export function normalizeLemmaPos(pos) {
  const normalized = typeof pos === 'string' ? pos.trim().toLocaleLowerCase('en-US') : '';
  const canonical = POS_ALIASES[normalized];
  if (!canonical) fail(`unsupported lemma POS ${JSON.stringify(pos)}`);
  return canonical;
}

export function candidateId(lemma, pos) {
  return `${normalizeLemma(lemma)}/${normalizeLemmaPos(pos)}`;
}

function edge(lemma, pos, surface, transformId, confidence, irregular = false, source = MORPHOLOGY_VERSION) {
  return {
    surface,
    lemma,
    pos,
    transformId,
    source,
    irregular,
    morphologicalConfidence: confidence,
  };
}

function nounForms(lemma, pos) {
  if (lemma.endsWith('is')) {
    return [edge(lemma, pos, `${lemma.slice(0, -2)}es`, 'noun.plural.is_to_es', 0.85)];
  }
  if (/[^aeiou]y$/.test(lemma)) {
    return [edge(lemma, pos, `${lemma.slice(0, -1)}ies`, 'noun.plural.y_to_ies', 0.85)];
  }
  if (lemma.endsWith('fe')) {
    return [edge(lemma, pos, `${lemma.slice(0, -2)}ves`, 'noun.plural.fe_to_ves', 0.85)];
  }
  if (lemma.endsWith('f')) {
    return [edge(lemma, pos, `${lemma.slice(0, -1)}ves`, 'noun.plural.f_to_ves', 0.85)];
  }
  if (/(s|x|z|ch|sh)$/.test(lemma)) {
    return [edge(lemma, pos, `${lemma}es`, 'noun.plural.es', 0.85)];
  }
  return [edge(lemma, pos, `${lemma}s`, 'noun.plural.s', 0.85)];
}

function verbForms(lemma, pos) {
  let thirdPerson;
  if (/[^aeiou]y$/.test(lemma)) {
    thirdPerson = edge(lemma, pos, `${lemma.slice(0, -1)}ies`, 'verb.third_person.y_to_ies', 0.85);
  } else if (/(s|x|z|ch|sh|o)$/.test(lemma)) {
    thirdPerson = edge(lemma, pos, `${lemma}es`, 'verb.third_person.es', 0.85);
  } else {
    thirdPerson = edge(lemma, pos, `${lemma}s`, 'verb.third_person.s', 0.85);
  }

  let past;
  if (/[^aeiou]y$/.test(lemma)) {
    past = edge(lemma, pos, `${lemma.slice(0, -1)}ied`, 'verb.past.y_to_ied', 0.85);
  } else if (lemma.endsWith('e')) {
    past = edge(lemma, pos, `${lemma}d`, 'verb.past.d', 0.85);
  } else {
    past = edge(lemma, pos, `${lemma}ed`, 'verb.past.ed', 0.85);
  }

  let progressive;
  if (lemma.endsWith('ie')) {
    progressive = edge(lemma, pos, `${lemma.slice(0, -2)}ying`, 'verb.progressive.ie_to_ying', 0.85);
  } else if (lemma.endsWith('e') && !lemma.endsWith('ee')) {
    progressive = edge(lemma, pos, `${lemma.slice(0, -1)}ing`, 'verb.progressive.drop_e', 0.85);
  } else {
    progressive = edge(lemma, pos, `${lemma}ing`, 'verb.progressive.ing', 0.85);
  }

  return [thirdPerson, past, progressive];
}

function degreeForms(lemma, pos) {
  const prefix = pos === 'adverb' ? 'adverb' : 'adjective';
  if (/[^aeiou]y$/.test(lemma)) {
    return [
      edge(lemma, pos, `${lemma.slice(0, -1)}ier`, `${prefix}.comparative.y_to_ier`, 0.85),
      edge(lemma, pos, `${lemma.slice(0, -1)}iest`, `${prefix}.superlative.y_to_iest`, 0.85),
    ];
  }
  if (lemma.endsWith('e')) {
    return [
      edge(lemma, pos, `${lemma}r`, `${prefix}.comparative.r`, 0.85),
      edge(lemma, pos, `${lemma}st`, `${prefix}.superlative.st`, 0.85),
    ];
  }
  return [
    edge(lemma, pos, `${lemma}er`, `${prefix}.comparative.er`, 0.85),
    edge(lemma, pos, `${lemma}est`, `${prefix}.superlative.est`, 0.85),
  ];
}

export function forwardLemmaForms(rawLemma, rawPos) {
  const lemma = normalizeLemma(rawLemma);
  const pos = normalizeLemmaPos(rawPos);
  const rows = [edge(lemma, pos, lemma, 'identity', 1)];

  if (pos === 'noun') rows.push(...nounForms(lemma, pos));
  else if (pos === 'verb') rows.push(...verbForms(lemma, pos));
  else rows.push(...degreeForms(lemma, pos));

  for (const irregular of IRREGULARS[`${lemma}/${pos}`] ?? []) {
    rows.push(edge(
      lemma,
      pos,
      irregular.surface,
      irregular.transformId,
      0.95,
      true,
      `curated:${MORPHOLOGY_VERSION}`,
    ));
  }

  const unique = new Map();
  for (const row of rows) {
    const key = [row.surface, row.lemma, row.pos, row.transformId, row.source].join('\u0000');
    unique.set(key, row);
  }
  return [...unique.values()].sort((left, right) => (
    left.surface.localeCompare(right.surface)
      || left.lemma.localeCompare(right.lemma)
      || left.pos.localeCompare(right.pos)
      || left.transformId.localeCompare(right.transformId)
      || left.source.localeCompare(right.source)
  ));
}
