/**
 * Combinatory Categorial Grammar channel for WordNet relation tasks.
 *
 * WHAT THIS IS: a CKY chart over real CCG categories, driven by three standard
 * combinators — forward application (>), backward application (<), and forward
 * composition (>B). Closed-class words carry declared categories; open-class
 * words are ambiguous between `N` and `N/N` and the chart resolves them.
 *
 * WHY IT IS HERE: WordNet glosses are genus–differentia. "a small domesticated
 * carnivorous mammal that has retractile claws" names its own hypernym as the
 * head of its leading NP. Finding that head is a parsing problem, and CCG's
 * modifier categories (`N/N` prenominal, `NP\NP` postnominal) are exactly the
 * distinction that decides where the leading NP stops.
 *
 * WHAT THIS IS NOT: a CCGbank supertagger. There is no statistical category
 * model, no type-raising, no coordination schema, no generalized composition.
 * Verb categories are absent, so relative and participial clauses do not derive
 * — which is deliberate: their failure to derive is what bounds the leading NP.
 *
 * PURE AND ZERO-I/O. Deterministic.
 *
 * @module codex/core/semantic/ccg-channel
 */

export const CCG_CHANNEL_CONTRACT = 'PB-CCG-CHANNEL-v1';

// ── Category algebra ──────────────────────────────────────────────────────

/** @typedef {{kind:'atom',name:string}|{kind:'/'|'\\',result:Category,arg:Category}} Category */

const atom = (name) => Object.freeze({ kind: 'atom', name });
const fwd = (result, arg) => Object.freeze({ kind: '/', result, arg });
const bwd = (result, arg) => Object.freeze({ kind: '\\', result, arg });

const N = atom('N');
const NP = atom('NP');

const show = (category) => {
  if (category.kind === 'atom') return category.name;
  const wrap = (c) => (c.kind === 'atom' ? show(c) : `(${show(c)})`);
  return `${wrap(category.result)}${category.kind}${wrap(category.arg)}`;
};

const sameCategory = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'atom') return a.name === b.name;
  return sameCategory(a.result, b.result) && sameCategory(a.arg, b.arg);
};

// ── Lexicon: closed classes carry declared categories ─────────────────────

/** Determiners: `NP/N`, plus a pronominal `NP` reading ("any of the…"). */
const DETERMINERS = new Set([
  'a', 'an', 'the', 'any', 'each', 'every', 'some', 'this', 'these', 'those',
  'all', 'both', 'either', 'neither', 'no', 'one', 'another', 'such', 'much',
]);

/** Prepositions: `(NP\NP)/NP` — postnominal modifiers that close the leading NP. */
const PREPOSITIONS = new Set([
  'of', 'in', 'on', 'at', 'to', 'for', 'with', 'from', 'by', 'into', 'onto',
  'upon', 'about', 'over', 'under', 'between', 'among', 'amongst', 'through',
  'during', 'without', 'within', 'against', 'toward', 'towards', 'near',
  'like', 'than', 'per', 'via', 'across', 'along', 'around', 'behind', 'below',
  'beneath', 'beside', 'beyond', 'inside', 'outside', 'throughout', 'up',
]);

/**
 * Words that terminate the leading NP but carry no nominal category: relativizers,
 * verbs, participial heads, negation, adverbs. They have no lexical entry at all,
 * so nothing spanning them can derive — which is how the leading NP is bounded.
 */
const BOUNDARY = new Set([
  'who', 'whom', 'whose', 'which', 'that', 'where', 'when', 'why', 'while',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'has', 'have', 'had', 'having', 'do', 'does', 'did', 'doing',
  'not', 'and', 'or', 'but', 'nor', 'if', 'as', 'so', 'then',
  'used', 'made', 'making', 'characterized', 'capable', 'consisting',
  'containing', 'marked', 'resembling', 'relating', 'belonging', 'involving',
  'produced', 'formed', 'composed', 'known', 'called', 'considered', 'said',
  'esp', 'especially', 'usually', 'typically', 'often', 'generally', 'also',
]);

const TOKEN_RE = /[a-z][a-z-]*/g;

/** Lowercase, strip punctuation, drop empties. */
export function tokenize(text) {
  if (typeof text !== 'string') return [];
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

/**
 * Lexical categories for one token. Open-class words are genuinely ambiguous
 * between head (`N`) and prenominal modifier (`N/N`); the chart decides.
 */
function lexicalCategories(token) {
  if (BOUNDARY.has(token)) return [];
  if (PREPOSITIONS.has(token)) return [fwd(bwd(NP, NP), NP)];
  if (DETERMINERS.has(token)) return [fwd(NP, N), NP];
  return [N, fwd(N, N)];
}

// ── The three combinators ─────────────────────────────────────────────────

/**
 * Combine two adjacent categories. Returns every licensed result with the
 * combinator that produced it and which side supplies the head.
 */
function combine(left, right) {
  const out = [];
  // Forward application:  X/Y  Y  ->  X          (head: the argument, Y)
  if (left.kind === '/' && sameCategory(left.arg, right)) {
    out.push({ category: left.result, combinator: '>', headFrom: 'right' });
  }
  // Backward application:  Y  X\Y  ->  X         (head: the argument, Y)
  if (right.kind === '\\' && sameCategory(right.arg, left)) {
    out.push({ category: right.result, combinator: '<', headFrom: 'left' });
  }
  // Forward composition:  X/Y  Y/Z  ->  X/Z      (head: the functor's argument chain)
  if (left.kind === '/' && right.kind === '/' && sameCategory(left.arg, right.result)) {
    out.push({ category: fwd(left.result, right.arg), combinator: '>B', headFrom: 'right' });
  }
  return out;
}

/**
 * Unary type change `N -> NP`. Bare mass/plural nominals project a full NP
 * ("customary practice among a people"). Applied once, never chained.
 */
function unaryNP(entry) {
  if (sameCategory(entry.category, N)) {
    return { ...entry, category: NP, combinators: [...entry.combinators, 'N->NP'] };
  }
  return null;
}

// ── CKY chart ─────────────────────────────────────────────────────────────

function chartParse(tokens) {
  const n = tokens.length;
  /** cells[start][length] = entry[] */
  const cells = Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => []));

  const push = (start, length, entry) => {
    const bucket = cells[start][length];
    if (bucket.some((existing) => sameCategory(existing.category, entry.category)
      && existing.head === entry.head)) return;
    bucket.push(entry);
  };

  for (let i = 0; i < n; i += 1) {
    for (const category of lexicalCategories(tokens[i])) {
      // Atomic categories are heads (including a determiner's pronominal `NP`
      // reading, as in "ANY of the terminal members"). Functors never are.
      push(i, 1, { category, head: category.kind === 'atom' ? tokens[i] : null, combinators: [] });
    }
    for (const entry of [...cells[i][1]]) {
      const raised = unaryNP(entry);
      if (raised) push(i, 1, raised);
    }
  }

  for (let length = 2; length <= n; length += 1) {
    for (let start = 0; start + length <= n; start += 1) {
      for (let split = 1; split < length; split += 1) {
        for (const left of cells[start][split]) {
          for (const right of cells[start + split][length - split]) {
            for (const result of combine(left.category, right.category)) {
              push(start, length, {
                category: result.category,
                head: result.headFrom === 'right' ? right.head : left.head,
                combinators: [...left.combinators, ...right.combinators, result.combinator],
              });
            }
          }
        }
      }
      for (const entry of [...cells[start][length]]) {
        const raised = unaryNP(entry);
        if (raised) push(start, length, raised);
      }
    }
  }
  return cells;
}

/**
 * Derive the leading nominal constituent: the LONGEST span starting at token 0
 * whose category is `N` or `NP` and which carries a head.
 *
 * @returns {{head: string|null, category: string|null, span: number, combinators: string[]}}
 */
export function deriveGloss(text) {
  const tokens = tokenize(text);
  const empty = { head: null, category: null, span: 0, combinators: [] };
  if (tokens.length === 0) return empty;
  const cells = chartParse(tokens);
  for (let length = tokens.length; length >= 1; length -= 1) {
    const nominal = cells[0][length].filter((entry) => entry.head
      && (sameCategory(entry.category, NP) || sameCategory(entry.category, N)));
    if (nominal.length > 0) {
      // Prefer NP over N at the same span — the saturated reading.
      const chosen = nominal.find((entry) => sameCategory(entry.category, NP)) ?? nominal[0];
      return {
        head: chosen.head,
        category: show(chosen.category),
        span: length,
        combinators: chosen.combinators,
      };
    }
  }
  return empty;
}

/** The head of the leading NP — the genus term of a genus–differentia gloss. */
export function glossGenus(text) {
  return deriveGloss(text).head;
}

/**
 * Heads of every `of`-complement NP in a gloss. Meronym glosses name their
 * holonym here: "any of the terminal members of THE HAND".
 */
export function ofComplementHeads(text) {
  const tokens = tokenize(text);
  const heads = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i] !== 'of') continue;
    const rest = tokens.slice(i + 1);
    if (rest.length === 0) continue;
    const head = deriveGloss(rest.join(' ')).head;
    if (head && !heads.includes(head)) heads.push(head);
  }
  return heads;
}

// ── The channel ───────────────────────────────────────────────────────────

const normalizeLemma = (lemma) => String(lemma ?? '').toLowerCase().replaceAll('_', ' ').trim();

/** Tokens inside the leading NP — the genus plus its prenominal modifiers. */
function leadingTokens(text) {
  const derived = deriveGloss(text);
  return new Set(tokenize(text).slice(0, derived.span));
}

const clamp01 = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * CCG channel score in 0..1 for an ordered (source, candidate) pair under one
 * relation. Directional by construction: hypernymy reads the SOURCE's genus.
 *
 * @param {{lemma:string, definition:string}} source
 * @param {{lemma:string, definition:string}} candidate
 * @param {'hypernym'|'antonym'|'mero_part'|'similar'} relation
 * @returns {number}
 */
export function ccgChannel(source, candidate, relation) {
  const sourceLemma = normalizeLemma(source?.lemma);
  const candidateLemma = normalizeLemma(candidate?.lemma);
  const sourceDerived = deriveGloss(source?.definition);
  const candidateDerived = deriveGloss(candidate?.definition);
  const sourceGenus = sourceDerived.head;
  const candidateGenus = candidateDerived.head;

  const categoryAgreement = Number(
    Boolean(sourceDerived.category)
    && sourceDerived.category === candidateDerived.category,
  );
  const sharedGenus = Number(Boolean(sourceGenus) && sourceGenus === candidateGenus);

  switch (relation) {
    case 'hypernym': {
      if (sourceGenus && sourceGenus === candidateLemma) return 1;
      if (candidateLemma && leadingTokens(source?.definition).has(candidateLemma)) return 0.7;
      if (candidateGenus && candidateGenus === sourceLemma) return 0.25;
      return clamp01(0.1 * categoryAgreement);
    }
    case 'similar': {
      if (sharedGenus) return 1;
      if (sourceGenus && candidateGenus
        && (sourceGenus === candidateLemma || candidateGenus === sourceLemma)) return 0.6;
      return clamp01(0.15 * categoryAgreement);
    }
    case 'mero_part': {
      const holonyms = ofComplementHeads(source?.definition);
      if (candidateLemma && holonyms.includes(candidateLemma)) return 1;
      if (candidateLemma && ofComplementHeads(candidate?.definition).includes(sourceLemma)) return 0.4;
      if (sharedGenus) return 0.3;
      return clamp01(0.1 * categoryAgreement);
    }
    case 'antonym': {
      // CCG carries little antonymy signal; syntactic substitutability is what it has.
      return clamp01(0.6 * categoryAgreement + 0.4 * sharedGenus);
    }
    default:
      return 0;
  }
}
