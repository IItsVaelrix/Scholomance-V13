import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { createLexiconAdapter } from '../../codex/server/adapters/lexicon.sqlite.adapter.js';

function createFixtureDb(dbPath) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE entry (
      id INTEGER PRIMARY KEY,
      headword TEXT NOT NULL,
      headword_lower TEXT NOT NULL,
      lang TEXT NOT NULL,
      pos TEXT,
      ipa TEXT,
      etymology TEXT,
      senses_json TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      embeddings_tq BLOB
    );

    CREATE VIRTUAL TABLE entry_fts USING fts5(
      headword,
      content,
      tokenize='unicode61',
      prefix='2 3 4'
    );

    CREATE TABLE rhyme_index (
      word_id INTEGER PRIMARY KEY,
      word_lower TEXT NOT NULL,
      rhyme_family TEXT NOT NULL,
      coda TEXT,
      rhyme_key TEXT NOT NULL
    );

    CREATE TABLE wordnet_lemma (
      lemma TEXT NOT NULL,
      lemma_lower TEXT NOT NULL,
      synset_id TEXT NOT NULL,
      sense_rank INTEGER,
      pos TEXT,
      source TEXT NOT NULL,
      source_url TEXT
    );

    CREATE TABLE wordnet_rel (
      synset_id TEXT NOT NULL,
      rel TEXT NOT NULL,
      target_synset_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT
    );
  `);

  const entries = db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa, etymology, senses_json, source, source_url)
    VALUES (?, ?, ?, 'English', ?, ?, ?, ?, ?, ?)
  `);

  entries.run(
    1,
    'Arcana',
    'arcana',
    'noun',
    'AA R K AA N AH',
    null,
    JSON.stringify([{ glosses: ['Secret knowledge'] }]),
    'oewn',
    'https://en-word.net/',
  );
  entries.run(
    2,
    'Banana',
    'banana',
    'noun',
    'B AH N AE N AH',
    null,
    JSON.stringify([{ glosses: ['A yellow fruit'] }]),
    'oewn',
    'https://en-word.net/',
  );
  entries.run(
    3,
    'Cabana',
    'cabana',
    'noun',
    'K AH B AE N AH',
    null,
    JSON.stringify([{ glosses: ['A small shelter'] }]),
    'oewn',
    'https://en-word.net/',
  );

  const fts = db.prepare('INSERT INTO entry_fts(rowid, headword, content) VALUES (?, ?, ?)');
  fts.run(1, 'Arcana', 'Secret knowledge of rites');
  fts.run(2, 'Banana', 'A yellow fruit');
  fts.run(3, 'Cabana', 'A small shelter');

  const rhymes = db.prepare(`
    INSERT INTO rhyme_index(word_id, word_lower, rhyme_family, coda, rhyme_key)
    VALUES (?, ?, ?, ?, ?)
  `);
  rhymes.run(1, 'arcana', 'AA', 'N', 'AA-N');
  rhymes.run(2, 'banana', 'AA', 'N', 'AA-N');
  rhymes.run(3, 'cabana', 'AA', 'N', 'AA-N');

  const lemmas = db.prepare(`
    INSERT INTO wordnet_lemma(lemma, lemma_lower, synset_id, sense_rank, pos, source, source_url)
    VALUES (?, ?, ?, ?, ?, 'oewn', 'https://en-word.net/')
  `);
  lemmas.run('arcana', 'arcana', 'syn.arcana', 1, 'noun');
  lemmas.run('mystery', 'mystery', 'syn.arcana', 2, 'noun');
  lemmas.run('enigma', 'enigma', 'syn.arcana', 3, 'noun');
  lemmas.run('banality', 'banality', 'syn.banal', 1, 'noun');
  // banality has a second POS in the same synset to test lookupSymbolsLoose's POS union
  lemmas.run('banality', 'banality', 'syn.banal', 2, 'verb');
  // arcana + mystery share a second, verb-POS synset so synonym results carry
  // a multi-POS set and batchLookupPos has a multi-POS word to classify.
  lemmas.run('arcana', 'arcana', 'syn.arcana2', 1, 'verb');
  lemmas.run('mystery', 'mystery', 'syn.arcana2', 1, 'verb');

  const rels = db.prepare(`
    INSERT INTO wordnet_rel(synset_id, rel, target_synset_id, source, source_url)
    VALUES (?, ?, ?, 'oewn', 'https://en-word.net/')
  `);
  rels.run('syn.arcana', 'antonym', 'syn.banal');
  // exemplifies relation to test lookupSymbolsLoose's POS union (banality has noun+verb in syn.banal)
  rels.run('syn.arcana', 'exemplifies', 'syn.banal');

  db.close();
}

// Reproduces the real OW-LD rhyme bucket, including the CMUdict surnames that
// carry a pronunciation but no meaning. Frequencies are the observed sentence
// counts from scholomance_corpus.sqlite (115,680 sentences).
function createRhymeRankingFixtureDb(dbPath) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE entry (
      id INTEGER PRIMARY KEY,
      headword TEXT NOT NULL,
      headword_lower TEXT NOT NULL,
      lang TEXT NOT NULL,
      pos TEXT,
      ipa TEXT,
      etymology TEXT,
      senses_json TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT,
      embeddings_tq BLOB
    );

    CREATE VIRTUAL TABLE entry_fts USING fts5(
      headword,
      content,
      tokenize='unicode61',
      prefix='2 3 4'
    );

    CREATE TABLE rhyme_index (
      word_id INTEGER PRIMARY KEY,
      word_lower TEXT NOT NULL,
      rhyme_family TEXT NOT NULL,
      coda TEXT,
      rhyme_key TEXT NOT NULL,
      corpus_freq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE wordnet_lemma (
      lemma TEXT NOT NULL,
      lemma_lower TEXT NOT NULL,
      synset_id TEXT NOT NULL,
      sense_rank INTEGER,
      pos TEXT,
      source TEXT NOT NULL,
      source_url TEXT
    );

    CREATE TABLE wordnet_rel (
      synset_id TEXT NOT NULL,
      rel TEXT NOT NULL,
      target_synset_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT
    );
  `);

  const entry = db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa, etymology, senses_json, source, source_url)
    VALUES (?, ?, ?, 'English', NULL, NULL, NULL, '[]', 'cmudict', NULL)
  `);
  const rhyme = db.prepare(`
    INSERT INTO rhyme_index(word_id, word_lower, rhyme_family, coda, rhyme_key, corpus_freq)
    VALUES (?, ?, 'OW', 'LD', 'OW-LD', ?)
  `);

  const bucket = [
    ['bold', 0], ['old', 1451], ['told', 662], ['cold', 395], ['gold', 244],
    ['hold', 244], ['behold', 68], ['sold', 64], ['fold', 22], ['mold', 10],
    ['wold', 1], ['bowled', 1], ['scold', 1],
    ['dold', 0], ['nold', 0], ['vold', 0], ['olde', 0], ['golde', 0],
    ['ahold', 0], ['doled', 0],
  ];

  bucket.forEach(([word, freq], index) => {
    const id = index + 1;
    entry.run(id, word.charAt(0).toUpperCase() + word.slice(1), word);
    rhyme.run(id, word, freq);
  });

  db.close();
}

// Slant rhymes are the SAME rhyme tail with a DIFFERENT nucleus, so the fixture
// needs several keys that share a tail ("-D") plus one that does not ("-LD").
function createSlantFixtureDb(dbPath) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE entry (
      id INTEGER PRIMARY KEY, headword TEXT NOT NULL, headword_lower TEXT NOT NULL,
      lang TEXT NOT NULL, pos TEXT, ipa TEXT, etymology TEXT, senses_json TEXT NOT NULL,
      source TEXT NOT NULL, source_url TEXT, embeddings_tq BLOB
    );
    CREATE VIRTUAL TABLE entry_fts USING fts5(headword, content, tokenize='unicode61', prefix='2 3 4');
    CREATE TABLE rhyme_index (
      word_id INTEGER PRIMARY KEY, word_lower TEXT NOT NULL, rhyme_family TEXT NOT NULL,
      coda TEXT, rhyme_key TEXT NOT NULL, corpus_freq INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE wordnet_lemma (
      lemma TEXT NOT NULL, lemma_lower TEXT NOT NULL, synset_id TEXT NOT NULL,
      sense_rank INTEGER, pos TEXT, source TEXT NOT NULL, source_url TEXT
    );
    CREATE TABLE wordnet_rel (
      synset_id TEXT NOT NULL, rel TEXT NOT NULL, target_synset_id TEXT NOT NULL,
      source TEXT NOT NULL, source_url TEXT
    );
  `);

  const entry = db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa, etymology, senses_json, source, source_url)
    VALUES (?, ?, ?, 'English', NULL, NULL, NULL, '[]', 'cmudict', NULL)
  `);
  const rhyme = db.prepare(`
    INSERT INTO rhyme_index(word_id, word_lower, rhyme_family, coda, rhyme_key, corpus_freq)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const rows = [
    ['blood', 'AH', 'D', 'AH-D', 120],
    ['mud', 'AH', 'D', 'AH-D', 40],    // perfect rhyme — same key
    ['good', 'UH', 'D', 'UH-D', 900],  // slant — same tail, different nucleus
    ['food', 'UW', 'D', 'UW-D', 500],  // slant
    ['scrid', 'IH', 'D', 'IH-D', 0],   // unattested CMUdict junk
    ['bold', 'OW', 'LD', 'OW-LD', 300], // different tail entirely — not a slant
  ];
  rows.forEach(([word, family, coda, key, freq], index) => {
    const id = index + 1;
    entry.run(id, word.charAt(0).toUpperCase() + word.slice(1), word);
    rhyme.run(id, word, family, coda, key, freq);
  });

  db.close();
}

describe('[Server] lexicon.sqlite.adapter', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('returns empty-safe methods when db path is missing', () => {
    const warn = vi.fn();
    const adapter = createLexiconAdapter('', { log: { warn } });

    expect(adapter.lookupWord('arcana')).toEqual([]);
    expect(adapter.lookupRhymes('arcana')).toEqual({ family: null, words: [] });
    expect(adapter.batchLookupFamilies(['arcana'])).toEqual({});
    expect(adapter.batchValidateWords(['arcana'])).toEqual([]);
    expect(adapter.searchEntries('arcana')).toEqual([]);
    expect(adapter.suggestEntries('ar')).toEqual([]);
    expect(adapter.batchLookupPos(['arcana'])).toEqual({});
    expect(() => adapter.close()).not.toThrow();
    // Adapter returns empty results silently when db is unavailable
    expect(adapter.__unsafe.connected).toBe(false);
  });

  it('supports lookup, rhyme, and batch operations against sqlite', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexicon-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const adapter = createLexiconAdapter(dbPath);

    const entries = adapter.lookupWord('Arcana');
    expect(entries).toHaveLength(1);
    expect(entries[0].headword).toBe('Arcana');
    expect(entries[0].senses[0].glosses[0]).toBe('Secret knowledge');

    const rhymes = adapter.lookupRhymes('arcana');
    expect(rhymes.family).toBe('AA');
    expect(rhymes.words).toEqual(['banana', 'cabana']);

    const families = adapter.batchLookupFamilies(['arcana', 'banana', 'unknown']);
    expect(families).toEqual({
      ARCANA: { family: 'AA', phonemes: expect.any(Array) },
      BANANA: { family: 'AA', phonemes: expect.any(Array) },
    });

    const valid = adapter.batchValidateWords(['Arcana', 'banana', 'unknown']);
    expect(valid).toEqual(['arcana', 'banana']);

    adapter.close();
  });

  it('carries deduped POS sets on lemma lookups and classifies words in batch', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexicon-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const adapter = createLexiconAdapter(dbPath);

    const synonyms = adapter.lookupSynonyms('arcana');
    expect(synonyms).toContainEqual({ lemma: 'mystery', pos: ['noun', 'verb'] });
    expect(synonyms).toContainEqual({ lemma: 'enigma', pos: ['noun'] });
    // never itself, still deduped
    expect(synonyms.map((entry) => entry.lemma)).not.toContain('arcana');

    // banality now has two POS in syn.banal, so antonyms show the union
    expect(adapter.lookupAntonyms('arcana'))
      .toEqual([{ lemma: 'banality', pos: ['noun', 'verb'] }]);

    // lookupSymbolsLoose also unions POS across seen-set (banality reached via exemplifies)
    expect(adapter.lookupSymbolsLoose('arcana'))
      .toEqual([{ lemma: 'banality', via: 'exemplifies', pos: ['noun', 'verb'] }]);

    const pos = adapter.batchLookupPos(['Arcana', 'mystery', 'unknown']);
    expect(pos).toEqual({
      arcana: ['noun', 'verb'],
      mystery: ['noun', 'verb'],
    });
    expect(adapter.batchLookupPos([])).toEqual({});

    adapter.close();
  });

  it('ranks rhymes by corpus attestation so CMUdict proper nouns cannot outrank real words', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexicon-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createRhymeRankingFixtureDb(dbPath);
    const adapter = createLexiconAdapter(dbPath);

    const { words } = adapter.lookupRhymes('bold', 8);

    // 'dold', 'nold' and 'vold' are surnames CMUdict happens to carry a
    // pronunciation for. They are four letters long, so the previous
    // LENGTH-ASC ordering floated them above every real rhyme.
    expect(words).not.toContain('dold');
    expect(words).not.toContain('nold');
    expect(words).not.toContain('vold');

    // 'told' has no WordNet lemma and no gloss (it is an irregular past
    // tense), so attestation alone would have discarded it. Corpus frequency
    // keeps it, which is why the ordering signal has to be usage, not lexicon
    // membership.
    expect(words).toContain('told');
    expect(words.slice(0, 3)).toEqual(['old', 'told', 'cold']);

    adapter.close();
  });

  it('computes slant rhymes as the same rhyme tail with a different nucleus', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexicon-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createSlantFixtureDb(dbPath);
    const adapter = createLexiconAdapter(dbPath);

    // "blood" is AH-D. A slant rhyme shares the tail (D) and differs in the vowel:
    // good (UH-D), food (UW-D). A PERFECT rhyme (mud, AH-D) is not a slant.
    const slants = adapter.lookupSlantRhymes('blood', 8);

    expect(slants).toContain('good');
    expect(slants).toContain('food');
    expect(slants).not.toContain('mud');   // same key — that is a perfect rhyme
    expect(slants).not.toContain('blood'); // never itself
    expect(slants).not.toContain('bold');  // different tail (LD) — not a slant at all

    // Unattested CMUdict junk stays out, exactly as it does for perfect rhymes.
    expect(slants).not.toContain('scrid');

    adapter.close();
  });

  it('falls back to deterministic ordering when the corpus_freq column is absent', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexicon-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const adapter = createLexiconAdapter(dbPath);

    // createFixtureDb builds a pre-migration rhyme_index with no corpus_freq.
    // The adapter must still answer rather than throw a SQLITE_ERROR.
    const rhymes = adapter.lookupRhymes('arcana');
    expect(rhymes.words).toEqual(['banana', 'cabana']);

    adapter.close();
  });

  it('supports search/suggest and sanitizes unsafe FTS input', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexicon-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const adapter = createLexiconAdapter(dbPath);

    const search = adapter.searchEntries('secret', 20);
    expect(search.map((entry) => entry.headword)).toEqual(['Arcana']);

    const unsafe = adapter.searchEntries('" OR *', 20);
    expect(unsafe).toEqual([]);

    const suggestions = adapter.suggestEntries('ba', 20);
    expect(suggestions).toEqual([{ headword: 'Banana', pos: 'noun' }]);

    adapter.close();
  });
});
