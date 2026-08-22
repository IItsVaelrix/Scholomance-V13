#!/usr/bin/env node
/**
 * SCHOL-VERSE-COVERAGE-v1 — does the packed chart build structure over verse?
 *
 * Preregistered at docs/superpowers/evidence/2026-08-21-PREREG-verse-vs-prose-coverage.md.
 * Read that first: it fixes the arms, the endpoints, the length matching and the
 * falsifiers BEFORE this file was run, and it records the two facts that bound
 * every number printed here —
 *
 *   1. Nothing on the request path calls `composePacked` (compose-packed.js:60).
 *      This is a bench, not the product.
 *   2. Coverage is not accuracy. There is no gold poetry treebank on disk, so
 *      "a spanning derivation existed" is the whole claim.
 *
 * Usage:
 *   node scripts/verse-vs-prose-coverage.mjs [--books N] [--seed N] [--out FILE]
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

import {
  stripGutenbergWrapper,
  sanitizeGutenbergText,
} from './lib/gutenberg-corpus-sanitizer.mjs';
import { composePacked, ROOT_DOORWAY } from '../codex/core/constellation/compose-packed.js';
import { atomsFor } from '../codex/core/constellation/compose.js';
import { tokenize as codexTokenize } from '../codex/core/tokenizer.js';

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BOOKS_PER_ARM = Number(argOf('--books', '40'));
const SEED = Number(argOf('--seed', '20260821'));
const OUT = argOf('--out', 'docs/superpowers/evidence/2026-08-21-verse-vs-prose-coverage.json');
const UNITS_PER_BOOK = Number(argOf('--units-per-book', '300'));
const MIN_TOK = 3;
const MAX_TOK = 20;

/** Seeded PRNG so the book draw and the length match replay exactly. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffled = (list, rng) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// ─── LEXICON: the product table, not the gate fixture ────────────────────────
const LEMMA_POS = new Map([['noun', 'n'], ['verb', 'v'], ['adjective', 'a'], ['adverb', 'r']]);
function loadLexicon() {
  const db = new Database(path.resolve('scholomance_dict.sqlite'), { readonly: true });
  const posMap = new Map();
  for (const r of db.prepare('SELECT surface_lower, pos FROM lemma_form').iterate()) {
    const tag = LEMMA_POS.get(r.pos);
    if (!tag) continue;
    const have = posMap.get(r.surface_lower);
    if (have) { if (!have.includes(tag)) have.push(tag); } else posMap.set(r.surface_lower, [tag]);
  }
  db.close();
  return posMap;
}

// ─── CATALOG ─────────────────────────────────────────────────────────────────
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i += 1; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Author birth year, for the era match. `Milton, John, 1608-1674` -> 1608. */
function birthYear(authors) {
  const m = String(authors || '').match(/(1[0-9]{3}|20[0-9]{2})-/);
  return m ? Number(m[1]) : null;
}

function loadCatalog() {
  const raw = fs.readFileSync(path.resolve('cache/pg_catalog.csv'), 'utf8');
  const present = new Set(fs.readdirSync(path.resolve('cache/gutenberg'))
    .filter((f) => f.endsWith('.txt')).map((f) => f.slice(2, -4)));
  const lines = raw.split(/\r?\n/);
  const excluded = { notEnglish: 0, notText: 0, notCached: 0, bothGenres: 0, neitherGenre: 0, noBirthYear: 0 };
  const poetry = []; const fiction = [];
  for (let i = 1; i < lines.length; i += 1) {
    if (!lines[i]) continue;
    const c = parseCsvLine(lines[i]);
    const [id, type, , title, lang, authors, subjects, , shelves] = c;
    if (type !== 'Text') { excluded.notText += 1; continue; }
    if (lang !== 'en') { excluded.notEnglish += 1; continue; }
    if (!present.has(id)) { excluded.notCached += 1; continue; }
    const tags = `${subjects} ${shelves}`;
    const isPoetry = /Poetry|poems/i.test(tags);
    const isFiction = /Fiction/i.test(tags);
    if (isPoetry && isFiction) { excluded.bothGenres += 1; continue; }
    if (!isPoetry && !isFiction) { excluded.neitherGenre += 1; continue; }
    const born = birthYear(authors);
    if (born === null) { excluded.noBirthYear += 1; continue; }
    (isPoetry ? poetry : fiction).push({ id, title, authors, born, decade: Math.floor(born / 10) * 10 });
  }
  return { poetry, fiction, excluded };
}

/** Draws N books per arm with IDENTICAL author-birth-decade histograms. */
function eraMatchedDraw(poetry, fiction, want, rng) {
  const byDecade = (list) => {
    const m = new Map();
    for (const b of list) { if (!m.has(b.decade)) m.set(b.decade, []); m.get(b.decade).push(b); }
    return m;
  };
  const pd = byDecade(poetry); const fd = byDecade(fiction);
  const decades = [...pd.keys()].filter((d) => fd.has(d)).sort((a, b) => a - b);
  // Capacity per decade is what BOTH arms can supply.
  const capacity = decades.map((d) => [d, Math.min(pd.get(d).length, fd.get(d).length)]);
  const total = capacity.reduce((s, [, n]) => s + n, 0);
  const takeFor = new Map();
  let assigned = 0;
  for (const [d, cap] of capacity) {
    const share = Math.min(cap, Math.round((cap / total) * want));
    takeFor.set(d, share); assigned += share;
  }
  // Top up largest-capacity decades until the quota is met.
  const order = [...capacity].sort((a, b) => b[1] - a[1]);
  let oi = 0;
  while (assigned < want && oi < order.length * 8) {
    const [d, cap] = order[oi % order.length];
    if (takeFor.get(d) < cap) { takeFor.set(d, takeFor.get(d) + 1); assigned += 1; }
    oi += 1;
  }
  const pick = (map) => decades.flatMap((d) => shuffled(map.get(d), rng).slice(0, takeFor.get(d)));
  return { poetryBooks: pick(pd), fictionBooks: pick(fd), decades: Object.fromEntries(takeFor) };
}

// ─── UNIT EXTRACTION ─────────────────────────────────────────────────────────
/**
 * VERSE LINES. A stanza is a blank-line-delimited block of >=3 lines in which at
 * least two NON-FINAL lines are <=55 characters. That is the shape prose does not
 * have: a wrapped prose paragraph is short only on its last line. Every block that
 * fails is counted under a named reason, never dropped silently.
 */
const LINE_REASON = Object.freeze({
  NOT_STANZA: 'notStanzaShape', ALL_CAPS: 'allCaps', NO_LETTERS: 'noLetters',
  NUMERAL_ONLY: 'numeralOnly', TOO_SHORT: 'tooShort', TOO_LONG: 'tooLong',
});

function verseLines(bookText) {
  const body = stripGutenbergWrapper(bookText);
  const ledger = Object.fromEntries(Object.values(LINE_REASON).map((r) => [r, 0]));
  const out = [];
  let blocks = 0; let candidates = 0;
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    blocks += 1;
    const nonFinalShort = lines.slice(0, -1).filter((l) => l.length <= 55).length;
    if (lines.length < 3 || nonFinalShort < 2) { ledger[LINE_REASON.NOT_STANZA] += lines.length; continue; }
    for (const line of lines) {
      candidates += 1;
      if (!/[a-z]/.test(line)) {
        // No lowercase letter at all: a heading, a roman numeral, a speaker tag.
        ledger[/[A-Za-z]/.test(line) ? LINE_REASON.ALL_CAPS
          : (/[0-9IVXLC]/.test(line) ? LINE_REASON.NUMERAL_ONLY : LINE_REASON.NO_LETTERS)] += 1;
        continue;
      }
      out.push(line);
    }
  }
  return { units: out, ledger, blocks, candidates };
}

function sentences(bookText) {
  const packet = sanitizeGutenbergText(bookText, {
    tokenize: (s) => s.split(/\s+/).filter(Boolean),
    minTokens: 1,
    maxTokens: 250,
  });
  return { units: packet.segments.map((s) => s.text), counts: packet.counts, quarantine: packet.quarantine };
}

// ─── TOKENIZATION ────────────────────────────────────────────────────────────
/**
 * PRIMARY: the repo's own `tokenize`. It lowercases and drops punctuation, so
 * neither arm gets PUNCT atoms and neither gets capitalisation evidence. That is
 * a real narrowing of absolute coverage versus the treebank runs (which read gold
 * CoNLL-U surface forms) and it is why absolute rates here are NOT comparable to
 * the gate. Both arms are narrowed identically, so the contrast survives.
 *
 * ROBUSTNESS: a case- and punctuation-preserving split, reported alongside, so a
 * conclusion cannot rest on the primary tokenizer's two lossy properties. It is
 * a check, not a second production authority.
 */
const tokenizers = {
  codex: { fn: (s) => codexTokenize(s), casePreserving: false },
  surface: {
    fn: (s) => String(s).match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?|[^\s\w]/g) || [],
    casePreserving: true,
  },
};

/** How many distinct atomless surface forms travel with each arm. */
const TOP_FORMS = 40;

// ─── NAME EVIDENCE ───────────────────────────────────────────────────────────
/**
 * The set of surface forms that appear capitalised NON-INITIALLY somewhere in an
 * arm's own units. This is the only way to ask "was that atomless token a name?"
 * under the `codex` tokenizer, which lowercases and destroys the evidence.
 *
 * Unit-initial words are excluded: every verse line and every sentence
 * capitalises its first word, so including them would mark half the language.
 * It is still a PROXY — verse personifies ("Death", "Love", "Spring") and those
 * will be counted name-like here. It bounds the name hypothesis; it does not
 * prove it.
 */
function capitalizedNonInitialForms(units) {
  const set = new Set();
  // A capital is only evidence of a NAME if nothing else explains it. Three
  // things else explain it, and prose fiction is full of all three:
  //   - the word opens a quoted utterance:      said "Hello there"
  //   - the previous word closed a sentence:    He left. Then rain fell.
  //   - the word itself carries a leading quote: "Well," he said
  // Without these exclusions the proxy scores prose's dialogue as proper nouns,
  // which is the exact bias the name hypothesis needs to be protected from.
  const QUOTE = /["'“”‘’`]/;
  for (const text of units) {
    const words = String(text).split(/\s+/).filter(Boolean);
    for (let i = 1; i < words.length; i += 1) {
      const raw = words[i];
      if (QUOTE.test(raw[0])) continue;
      const prev = words[i - 1];
      if (/[.!?:;]["'“”‘’]?$/.test(prev)) continue;
      if (QUOTE.test(prev[prev.length - 1])) continue;
      const w = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
      if (/^[A-Z][a-z]+$/.test(w)) set.add(w.toLowerCase());
    }
  }
  return set;
}

// ─── MEASUREMENT ─────────────────────────────────────────────────────────────
function measure(units, posMap, tok, roots, opts = {}) {
  let n = 0; let covered = 0; let atomlessUnits = 0; let atoms = 0; let tokens = 0; let threw = 0;
  let atomlessTokens = 0; let atomlessNonInitial = 0; let atomlessCapitalized = 0;
  let atomlessAlpha = 0; let atomlessPunct = 0; let atomlessNameLike = 0;
  const atomlessForms = new Map();
  const byLen = new Map();
  for (const text of units) {
    const t = tok(text);
    if (t.length < MIN_TOK || t.length > MAX_TOK) continue;
    n += 1;
    let hasAtomless = false;
    for (let i = 0; i < t.length; i += 1) {
      const a = atomsFor(t[i], i, posMap, {});
      tokens += 1; atoms += a.length;
      if (a.length === 0) {
        hasAtomless = true;
        atomlessTokens += 1;
        atomlessForms.set(t[i], (atomlessForms.get(t[i]) || 0) + 1);
        // Where does the atomless mass actually come from? Three buckets, so the
        // gap cannot be explained by a story picked off a top-20 list.
        if (/[A-Za-z0-9]/.test(t[i])) {
          atomlessAlpha += 1;
          if (opts.nameLike && opts.nameLike.has(t[i].toLowerCase())) atomlessNameLike += 1;
        } else {
          atomlessPunct += 1;
        }
        // Capitalisation is evidence for "this is a name" ONLY under a
        // case-preserving tokenizer; `codex` lowercases, so the proper-noun
        // question is unanswerable there and is reported as null, not as 0.
        // Unit-initial tokens are excluded from both sides of the ratio: every
        // verse line and every sentence capitalises its first word regardless.
        if (opts.casePreserving && i > 0) {
          atomlessNonInitial += 1;
          if (/^[A-Z]/.test(t[i])) atomlessCapitalized += 1;
        }
      }
    }
    if (hasAtomless) atomlessUnits += 1;
    let ok = false;
    try { ok = composePacked(t, posMap, { roots }).stable.length > 0; } catch { threw += 1; }
    if (ok) covered += 1;
    const bin = byLen.get(t.length) || { n: 0, covered: 0 };
    bin.n += 1; if (ok) bin.covered += 1;
    byLen.set(t.length, bin);
  }
  return {
    n, covered, atomlessUnits, atoms, tokens, threw, byLen,
    atomlessTokens, atomlessForms, atomlessNonInitial, atomlessCapitalized,
    atomlessAlpha, atomlessPunct, atomlessNameLike,
    casePreserving: Boolean(opts.casePreserving),
    nameLikeMeasured: Boolean(opts.nameLike),
  };
}

/** Wilson score interval, so a rate never travels without its uncertainty. */
function wilson(k, n, z = 1.96) {
  if (n === 0) return [0, 0];
  const p = k / n; const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const s = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}

// ─── LENGTH MATCHING ─────────────────────────────────────────────────────────
/** Identical length histograms by construction: min(nA,nB) drawn per token count. */
function lengthMatch(unitsA, unitsB, tok, rng) {
  const bin = (units) => {
    const m = new Map();
    for (const text of units) {
      const t = tok(text);
      if (t.length < MIN_TOK || t.length > MAX_TOK) continue;
      if (!m.has(t.length)) m.set(t.length, []);
      m.get(t.length).push(text);
    }
    return m;
  };
  const a = bin(unitsA); const b = bin(unitsB);
  const outA = []; const outB = []; const histogram = {};
  for (let k = MIN_TOK; k <= MAX_TOK; k += 1) {
    const la = a.get(k) || []; const lb = b.get(k) || [];
    const take = Math.min(la.length, lb.length);
    if (take === 0) continue;
    histogram[k] = take;
    outA.push(...shuffled(la, rng).slice(0, take));
    outB.push(...shuffled(lb, rng).slice(0, take));
  }
  return { a: outA, b: outB, histogram };
}

// ─── RUN ─────────────────────────────────────────────────────────────────────
const rng = mulberry32(SEED);
process.stderr.write('loading lexicon…\n');
const posMap = loadLexicon();
const { poetry, fiction, excluded } = loadCatalog();
const { poetryBooks, fictionBooks, decades } = eraMatchedDraw(poetry, fiction, BOOKS_PER_ARM, rng);
process.stderr.write(`lexicon ${posMap.size} | poetry ${poetryBooks.length} | fiction ${fictionBooks.length}\n`);

const readBook = (b) => fs.readFileSync(path.resolve(`cache/gutenberg/pg${b.id}.txt`), 'utf8');
const cap = (list) => shuffled(list, rng).slice(0, UNITS_PER_BOOK);

const vLine = []; const vSent = []; const pSent = [];
const lineLedger = {}; let lineBlocks = 0; let lineCandidates = 0;
for (const b of poetryBooks) {
  const raw = readBook(b);
  const vl = verseLines(raw);
  lineBlocks += vl.blocks; lineCandidates += vl.candidates;
  for (const [k, v] of Object.entries(vl.ledger)) lineLedger[k] = (lineLedger[k] || 0) + v;
  vLine.push(...cap(vl.units));
  vSent.push(...cap(sentences(raw).units));
}
for (const b of fictionBooks) pSent.push(...cap(sentences(readBook(b)).units));
process.stderr.write(`units: V-LINE ${vLine.length} | V-SENT ${vSent.length} | P-SENT ${pSent.length}\n`);

const results = {};
for (const [tokName, spec] of Object.entries(tokenizers)) {
  const tok = spec.fn;
  const mOpts = { casePreserving: spec.casePreserving };
  const mLine = lengthMatch(vLine, pSent, tok, mulberry32(SEED));
  const mSent = lengthMatch(vSent, pSent, tok, mulberry32(SEED + 1));
  // EXPLORATORY, not preregistered: line-vs-sentence on the SAME poetry books.
  // It goes through `lengthMatch` like every other contrast because verse lines
  // are far shorter than verse sentences (7.4 vs 10.2 tokens) and coverage falls
  // steeply with length — comparing the raw pooled rates would price the length
  // difference as a unit effect.
  const mUnit = lengthMatch(vLine, vSent, tok, mulberry32(SEED + 2));
  // Built once per matched sample, from that sample's own raw text — the length
  // match does not change across doorways, so neither does this.
  const nameSets = {
    lineA: capitalizedNonInitialForms(mLine.a), lineB: capitalizedNonInitialForms(mLine.b),
    sentA: capitalizedNonInitialForms(mSent.a), sentB: capitalizedNonInitialForms(mSent.b),
    unitA: capitalizedNonInitialForms(mUnit.a), unitB: capitalizedNonInitialForms(mUnit.b),
  };
  const opt = (key) => ({ ...mOpts, nameLike: nameSets[key] });
  results[tokName] = {};
  for (const doorway of ['CLAUSAL', 'ALL']) {
    const roots = ROOT_DOORWAY[doorway];
    const pack = (m) => {
      const rate = m.covered / (m.n || 1);
      const [lo, hi] = wilson(m.covered, m.n);
      return {
        n: m.n,
        coverage: Number(rate.toFixed(4)),
        wilson95: [Number(lo.toFixed(4)), Number(hi.toFixed(4))],
        atomlessUnitRate: Number((m.atomlessUnits / (m.n || 1)).toFixed(4)),
        atomsPerToken: Number((m.atoms / (m.tokens || 1)).toFixed(4)),
        // The atomless gap is the measured thing; WHY it exists is not, unless
        // the forms themselves are on the record. They are, here.
        atomlessTokenRate: Number((m.atomlessTokens / (m.tokens || 1)).toFixed(4)),
        atomlessDistinctForms: m.atomlessForms.size,
        atomlessTopForms: [...m.atomlessForms.entries()]
          .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))
          .slice(0, TOP_FORMS),
        atomlessPunctShare: Number((m.atomlessPunct / (m.atomlessTokens || 1)).toFixed(4)),
        atomlessNameLikeShareOfAlpha: m.nameLikeMeasured && m.atomlessAlpha
          ? Number((m.atomlessNameLike / m.atomlessAlpha).toFixed(4))
          : null,
        atomlessAlphaTokens: m.atomlessAlpha,
        atomlessNonInitialTokens: m.casePreserving ? m.atomlessNonInitial : null,
        atomlessCapitalizedShare: m.casePreserving && m.atomlessNonInitial
          ? Number((m.atomlessCapitalized / m.atomlessNonInitial).toFixed(4))
          : null,
        threw: m.threw,
        byLength: Object.fromEntries([...m.byLen.entries()].sort((x, y) => x[0] - y[0])
          .map(([k, v]) => [k, { n: v.n, coverage: Number((v.covered / v.n).toFixed(4)) }])),
      };
    };
    process.stderr.write(`  ${tokName}/${doorway}…\n`);
    results[tokName][doorway] = {
      vLineVsPSent: {
        histogram: mLine.histogram,
        verseLine: pack(measure(mLine.a, posMap, tok, roots, opt('lineA'))),
        proseSentence: pack(measure(mLine.b, posMap, tok, roots, opt('lineB'))),
      },
      vSentVsPSent: {
        histogram: mSent.histogram,
        verseSentence: pack(measure(mSent.a, posMap, tok, roots, opt('sentA'))),
        proseSentence: pack(measure(mSent.b, posMap, tok, roots, opt('sentB'))),
      },
      vLineVsVSent: {
        preregistered: false,
        histogram: mUnit.histogram,
        verseLine: pack(measure(mUnit.a, posMap, tok, roots, opt('unitA'))),
        verseSentence: pack(measure(mUnit.b, posMap, tok, roots, opt('unitB'))),
      },
    };
    const CONTRASTS = [
      ['vLineVsPSent', 'verseLine', 'proseSentence'],
      ['vSentVsPSent', 'verseSentence', 'proseSentence'],
      ['vLineVsVSent', 'verseLine', 'verseSentence'],
    ];
    for (const [key, aField, bField] of CONTRASTS) {
      const cell = results[tokName][doorway][key];
      cell.delta = Number((cell[aField].coverage - cell[bField].coverage).toFixed(4));
    }
  }
}

const packet = {
  contract: 'SCHOL-VERSE-COVERAGE-v1',
  prereg: 'docs/superpowers/evidence/2026-08-21-PREREG-verse-vs-prose-coverage.md',
  ranAt: new Date().toISOString().slice(0, 10),
  seed: SEED,
  scope: {
    isProduct: false,
    note: 'composePacked is not on the request path (compose-packed.js:60). Coverage is not accuracy: no gold poetry treebank exists.',
  },
  lexicon: { source: 'scholomance_dict.sqlite lemma_form', entries: posMap.size },
  population: {
    catalogExclusions: excluded,
    poetryAvailable: poetry.length,
    fictionAvailable: fiction.length,
    booksDrawn: { poetry: poetryBooks.length, fiction: fictionBooks.length },
    birthDecadeHistogram: decades,
    unitsPerBookCap: UNITS_PER_BOOK,
    verseLineLedger: { blocks: lineBlocks, candidates: lineCandidates, excluded: lineLedger },
    unitsBeforeLengthMatch: { vLine: vLine.length, vSent: vSent.length, pSent: pSent.length },
  },
  tokenRange: [MIN_TOK, MAX_TOK],
  results,
};
fs.writeFileSync(path.resolve(OUT), `${JSON.stringify(packet, null, 2)}\n`);
process.stderr.write(`wrote ${OUT}\n`);

for (const tokName of Object.keys(results)) {
  for (const doorway of ['CLAUSAL', 'ALL']) {
    const r = results[tokName][doorway];
    const a = r.vLineVsPSent; const b = r.vSentVsPSent;
    console.log(`${tokName.padEnd(8)} ${doorway.padEnd(8)} `
      + `V-LINE ${(a.verseLine.coverage * 100).toFixed(1)}%  vs P-SENT ${(a.proseSentence.coverage * 100).toFixed(1)}%  `
      + `(Δ ${(a.delta * 100).toFixed(1)}pp, n=${a.verseLine.n})   |   `
      + `V-SENT ${(b.verseSentence.coverage * 100).toFixed(1)}%  vs P-SENT ${(b.proseSentence.coverage * 100).toFixed(1)}%  `
      + `(Δ ${(b.delta * 100).toFixed(1)}pp, n=${b.verseSentence.n})`);
  }
}
