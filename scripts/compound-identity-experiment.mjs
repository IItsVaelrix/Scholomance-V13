#!/usr/bin/env node
/**
 * DOES A HYPHEN-DECLARED COMPOUND NEED ITS PIECES' IDENTITIES?
 *
 * The constellation query path splits on whitespace, so `peach-tree` reaches
 * `compose` as one token. `lemma_form` has no row for it, no irregular names it,
 * and no suffix ends it — so before this experiment's fix it received no lexical
 * atom, bonded with nothing, and took the whole phrase down with it.
 *
 * Three arms over the same phrases, so the two questions do not blur:
 *
 *   SPLIT   the compound is fed as its separate pieces
 *           — what a tokenizer that breaks on hyphens would deliver
 *   FUSED   one token, typed only by lexicon/irregular/suffix
 *           — the product before `compoundTags`
 *   UNION   one token, typed as the union of its pieces' identities
 *           — the product after it
 *
 * SPLIT vs UNION answers "should the tokenizer fuse?"; FUSED vs UNION answers
 * "what did this change buy?" and is the one that describes the product.
 *
 * A phrase SUCCEEDS when `compose` yields at least one stable molecule spanning
 * every token — the same criterion the treebank report calls coverage.
 *
 * Regressions are enumerated, not just counted: a phrase that parsed before and
 * does not now is the hard negative this change has to answer for.
 *
 * Usage:
 *   node scripts/compound-identity-experiment.mjs [--books N] [--phrases N] [--out report.json]
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { compose } from '../codex/core/constellation/compose.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BOOKS = Number(argOf('--books', '400'));
const PHRASES = Number(argOf('--phrases', '2000'));
const OUT = argOf('--out', null);

const CORPUS_DIR = path.resolve('cache/gutenberg');
const DICT = path.resolve('scholomance_dict.sqlite');
if (!existsSync(CORPUS_DIR)) { console.error(`missing ${CORPUS_DIR}`); process.exit(1); }
if (!existsSync(DICT)) { console.error(`missing ${DICT}`); process.exit(1); }

// ─── The lexicon under test is the product's own ─────────────────────────────
const LEMMA_POS = new Map([['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r']]);
const db = new Database(DICT, { readonly: true });
const posMap = new Map();
for (const row of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
  const tag = LEMMA_POS.get(row.pos);
  if (!tag) continue;
  const have = posMap.get(row.surface_lower);
  if (have) { if (!have.includes(tag)) have.push(tag); } else posMap.set(row.surface_lower, [tag]);
}
db.close();

// ─── Phrase extraction ───────────────────────────────────────────────────────
const COMPOUND = /^[a-z]{2,}(?:-[a-z]{2,})+$/;
const MIN_TOKENS = 3;
const MAX_TOKENS = 10;

/**
 * A hyphen at a line break is not a compound. Gutenberg wraps text, so `peach-`
 * at end of line rejoins as `peach-tree` only by accident of typesetting. When
 * the pieces run together into a word the lexicon knows, the hyphen was
 * hyphenation — the same signal `canonical-tokenizer.js` calls FRACTURED.
 */
function isFractured(token) {
  return posMap.has(token.split('-').join(''));
}

/**
 * ─── SEGMENTATION, WITH THE DAMAGE MADE VISIBLE ─────────────────────────────
 *
 * Splitting at every period shatters `Mr. Bennet` into `Mr.` and `Bennet.`, and
 * a length filter then deletes the pieces. Audited over 900 cached books, the
 * naive version of this function produced 2,919,191 segments of which 4.4%
 * began after an abbreviation or a name initial — each one a sentence starting
 * mid-clause — and silently discarded 70.3% of them, 248M characters.
 *
 * Silent deletion is the part that corrupts a measurement rather than merely
 * shrinking it, because the survivors are not a random sample: short malformed
 * fragments parse MORE easily than whole sentences, so a corpus that keeps them
 * and drops the long ones flatters every coverage number computed on it.
 *
 * So: abbreviations are protected before segmentation, structural matter is
 * skipped, and nothing is dropped without a reason code that gets counted and
 * printed. The token cap stays — `compose` materialises every parse and does not
 * terminate on long input — but it is now a declared quarantine, not a silence.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'prof', 'rev', 'hon', 'jr', 'sr', 'capt', 'col',
  'gen', 'lt', 'sgt', 'messrs', 'mme', 'mlle', 'vs', 'etc', 'viz', 'no', 'vol',
  'ch', 'fig', 'pp', 'ed', 'esq', 'inst', 'ult', 'i.e', 'e.g',
]);

/** `Mr.` and `J.` end a word, not a sentence. */
function endsWithProtectedAbbreviation(text) {
  const tail = text.trimEnd();
  if (!tail.endsWith('.')) return false;
  const word = tail.slice(0, -1).split(/[\s(]/).pop() || '';
  if (/^[A-Z]$/.test(word)) return true;               // name initial: `J.`
  return ABBREVIATIONS.has(word.toLowerCase());
}

/** Segments a paragraph into sentences without breaking a protected form. */
function sentencesOf(flat) {
  const pieces = flat.split(/(?<=[.!?])\s+/);
  const out = [];
  for (const piece of pieces) {
    if (out.length > 0 && endsWithProtectedAbbreviation(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} ${piece}`;
    } else {
      out.push(piece);
    }
  }
  return out;
}

const STRUCTURAL = [
  { code: 'illustration', test: t => /^\[Illustration/i.test(t) },
  { code: 'asterism', test: t => /^[*\s]{3,}$/.test(t) },
  { code: 'heading', test: t => /^(CHAPTER|BOOK|PART|ACT|SCENE|CANTO)\b/i.test(t) && t.length < 60 },
  { code: 'markup', test: t => /^[_*[\]{}<>|=+~-]+$/.test(t) },
];

function phrasesFrom(text, reasons) {
  // Strip the Project Gutenberg wrapper; its legal boilerplate is not English prose.
  const start = text.indexOf('*** START');
  const end = text.indexOf('*** END');
  const body = text.slice(start >= 0 ? text.indexOf('\n', start) + 1 : 0, end >= 0 ? end : undefined);

  const out = [];
  for (const paragraph of body.split(/\n\s*\n/)) {
    // Physical line wrapping is typesetting, not structure: rejoin before segmenting.
    const flat = paragraph.replace(/\s+/g, ' ').trim();
    if (!flat) continue;

    const structural = STRUCTURAL.find(rule => rule.test(flat));
    if (structural) { reasons[structural.code] = (reasons[structural.code] ?? 0) + 1; continue; }

    for (const raw of sentencesOf(flat)) {
      const tokens = raw.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
      if (tokens.length < MIN_TOKENS) { reasons.tooShort = (reasons.tooShort ?? 0) + 1; continue; }
      if (tokens.length > MAX_TOKENS) { reasons.tooLong = (reasons.tooLong ?? 0) + 1; continue; }
      const compounds = tokens.filter(t => COMPOUND.test(t) && !isFractured(t));
      if (compounds.length === 0) { reasons.noCompound = (reasons.noCompound ?? 0) + 1; continue; }
      out.push({ tokens, compounds });
    }
  }
  return out;
}

const files = readdirSync(CORPUS_DIR).filter(f => f.endsWith('.txt')).sort().slice(0, BOOKS);
const phrases = [];
const quarantine = {};
for (const file of files) {
  if (phrases.length >= PHRASES) break;
  let text;
  try { text = readFileSync(path.join(CORPUS_DIR, file), 'utf8'); } catch { quarantine.unreadable = (quarantine.unreadable ?? 0) + 1; continue; }
  for (const phrase of phrasesFrom(text, quarantine)) {
    phrases.push({ ...phrase, book: file });
    if (phrases.length >= PHRASES) break;
  }
}

// ─── The arms ────────────────────────────────────────────────────────────────
const spans = (tokens, options) => {
  try {
    return compose(tokens, posMap, options).stable.length > 0;
  } catch {
    // A phrase the chart cannot build is a failure, not a crash of the run.
    return false;
  }
};

/**
 * FUSED is the product before `compoundTags`, produced by switching that one
 * identity source off.
 *
 * The first version of this arm substituted a placeholder token instead, on the
 * theory that a token nothing can name is what the compound used to be. It is
 * not: the placeholder ended in `-able`, so the suffix backoff typed it as an
 * ADJECTIVE and the arm measured the wrong thing. Worse, a placeholder erases
 * the per-compound suffix behaviour that really existed — `well-being` ends in
 * `-ing` and was typed a verb before this feature, while `peach-tree` was typed
 * nothing. Only switching the source off reproduces both.
 */
const NO_COMPOUND = { compoundIdentity: false };
const splitTokens = phrase => phrase.tokens.flatMap(t => (phrase.compounds.includes(t) ? t.split('-') : [t]));

const results = phrases.map(phrase => ({
  phrase,
  split: spans(splitTokens(phrase), NO_COMPOUND),
  fused: spans(phrase.tokens, NO_COMPOUND),
  union: spans(phrase.tokens),
}));

// ─── Scoring ─────────────────────────────────────────────────────────────────
const rate = key => results.filter(r => r[key]).length / Math.max(results.length, 1);

/** Two-sided exact McNemar over the discordant pairs. */
function mcnemar(a, b) {
  const bOnly = results.filter(r => !r[a] && r[b]).length;
  const aOnly = results.filter(r => r[a] && !r[b]).length;
  const n = aOnly + bOnly;
  if (n === 0) return { aOnly, bOnly, p: 1 };
  const k = Math.min(aOnly, bOnly);
  // Binomial(n, 0.5) tail, doubled; computed in log space so n is unbounded.
  let logSum = -Infinity;
  const logAdd = (x, y) => (x === -Infinity ? y : Math.max(x, y) + Math.log1p(Math.exp(-Math.abs(x - y))));
  let logC = 0;
  for (let i = 0; i <= k; i += 1) {
    if (i > 0) logC += Math.log((n - i + 1) / i);
    logSum = logAdd(logSum, logC);
  }
  return { aOnly, bOnly, p: Math.min(1, 2 * Math.exp(logSum + n * Math.log(0.5))) };
}

const fusedToUnion = mcnemar('fused', 'union');
const splitToUnion = mcnemar('split', 'union');

const regressions = results
  .filter(r => r.fused && !r.union)
  .map(r => ({ tokens: r.phrase.tokens.join(' '), compounds: r.phrase.compounds, book: r.phrase.book }));
const splitRegressions = results
  .filter(r => r.split && !r.union)
  .map(r => ({ tokens: r.phrase.tokens.join(' '), compounds: r.phrase.compounds, book: r.phrase.book }));

const pct = x => `${(x * 100).toFixed(1)}%`;
console.log(`\ncompound-bearing phrases: ${results.length} from ${files.length} books`);
console.log(`quarantined: ${JSON.stringify(quarantine)}\n`);
console.log(`  SPLIT (pieces separate)          ${pct(rate('split'))}`);
console.log(`  FUSED (one unnameable token)     ${pct(rate('fused'))}   <- the product before compoundTags`);
console.log(`  UNION (pieces' identities)       ${pct(rate('union'))}   <- after`);
console.log('');
console.log(`  FUSED -> UNION   +${pct(rate('union') - rate('fused'))}   gained ${fusedToUnion.bOnly}, lost ${fusedToUnion.aOnly}, McNemar p=${fusedToUnion.p.toExponential(2)}`);
console.log(`  SPLIT -> UNION   +${pct(rate('union') - rate('split'))}   gained ${splitToUnion.bOnly}, lost ${splitToUnion.aOnly}, McNemar p=${splitToUnion.p.toExponential(2)}`);
console.log('');
console.log(`  regressions against FUSED: ${regressions.length}`);
for (const r of regressions.slice(0, 10)) console.log(`    ${r.tokens}`);
console.log(`  regressions against SPLIT: ${splitRegressions.length}`);
for (const r of splitRegressions.slice(0, 10)) console.log(`    ${r.tokens}`);
console.log('');

/**
 * ─── FREEZING THE HARD NEGATIVES ────────────────────────────────────────────
 *
 * `cache/gutenberg` is 1.8GB and not in the repository, so a test that read it
 * would skip everywhere and check nothing. The phrases themselves are short, so
 * a deterministic slice of them — every regression, plus a fixed prefix of the
 * sample — travels with the repository along with the lexicon rows they reach.
 *
 * The regressions are the point. A phrase that parsed before this change and
 * does not now is what the change has to answer for, and freezing it means the
 * next person to touch `compoundTags` meets it rather than rediscovers it.
 */
if (args.includes('--freeze')) {
  const PREFIX = 300;
  const SPLIT_LOSSES = 60;
  const chosen = [
    // Losses against FUSED, of which there are none and cannot be: compoundTags
    // only fires when nothing else named the token, so it strictly ADDS atoms,
    // and more atoms can only add molecules. The filter stays because a future
    // change could break that property, and this is where it would show.
    ...results.filter(r => r.fused && !r.union),
    // Losses against SPLIT are real: they are the price of fusing rather than
    // splitting, which is a tokenizer question this feature does not settle.
    ...results.filter(r => r.split && !r.union).slice(0, SPLIT_LOSSES),
    ...results.slice(0, PREFIX),
  ];
  // `fromPrefix` separates the two populations. The regressions are selected FOR
  // being losses, so a rate computed over the whole slice is guaranteed to make
  // this change look worse than it is; only the prefix is an unbiased sample.
  const prefixKeys = new Set(results.slice(0, PREFIX).map(r => r.phrase.tokens.join(' ')));
  const seen = new Set();
  const frozen = [];
  for (const r of chosen) {
    const key = r.phrase.tokens.join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    frozen.push({
      tokens: r.phrase.tokens,
      compounds: r.phrase.compounds,
      fromPrefix: prefixKeys.has(key),
      split: r.split,
      fused: r.fused,
      union: r.union,
    });
  }
  frozen.sort((a, b) => a.tokens.join(' ').localeCompare(b.tokens.join(' ')));

  const forms = new Set();
  for (const item of frozen) {
    for (const token of item.tokens) {
      forms.add(token);
      for (const piece of token.split('-')) forms.add(piece);
    }
  }
  const lexicon = {};
  for (const form of [...forms].sort()) {
    const tags = posMap.get(form);
    if (tags) lexicon[form] = [...tags].sort();
  }

  const fixture = {
    contract: 'SCHOL-COMPOUND-IDENTITY-v1',
    frozenAt: new Date().toISOString().slice(0, 10),
    corpus: 'Project Gutenberg (public domain), phrases carrying a hyphen-declared compound',
    population: {
      books: files.length,
      phrases: results.length,
      rates: { split: rate('split'), fused: rate('fused'), union: rate('union') },
      fusedToUnion,
      splitToUnion,
    },
    // Two counts, because they answer different questions: how many the
    // population lost, and how many distinct phrases are pinned here.
    regressions: regressions.length,
    regressionsFrozen: frozen.filter(item => item.fused && !item.union).length,
    splitRegressions: splitRegressions.length,
    splitRegressionsFrozen: frozen.filter(item => item.split && !item.union).length,
    lexicon,
    phrases: frozen,
  };
  const target = path.resolve('tests/qa/fixtures/constellation/compound-identity.json');
  writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`);
  console.log(`froze ${frozen.length} phrases (${regressions.length} regressions + prefix) and ${Object.keys(lexicon).length} lexicon rows`);
  console.log(`→ ${target}`);
}

if (OUT) {
  writeFileSync(OUT, `${JSON.stringify({
    books: files.length,
    phrases: results.length,
    rates: { split: rate('split'), fused: rate('fused'), union: rate('union') },
    fusedToUnion,
    splitToUnion,
    regressions,
    splitRegressions,
  }, null, 2)}\n`);
  console.log(`written → ${OUT}`);
}
