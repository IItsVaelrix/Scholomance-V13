import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLemmaAdapter } from '../../codex/server/adapters/lemma.sqlite.adapter.js';
import { buildLemmaForms } from '../../codex/core/lexical-analysis/buildLemmaForms.js';
import { migrateLexicalGraph } from '../../codex/core/lexical-graph/migrate.js';
import { MORPHOLOGY_VERSION } from '../../codex/core/lexical-graph/types.js';

const NOW = '2026-07-18T00:00:00.000Z';
const quietLog = { info() {}, warn() {}, error() {} };

function createFixture(dbPath, { build = true } = {}) {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE entry (
      id INTEGER PRIMARY KEY,
      headword TEXT NOT NULL,
      headword_lower TEXT NOT NULL,
      lang TEXT NOT NULL,
      pos TEXT,
      senses_json TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE TABLE wordnet_synset (
      id TEXT PRIMARY KEY,
      pos TEXT,
      lexname TEXT,
      definition TEXT,
      examples_json TEXT,
      source TEXT NOT NULL,
      source_url TEXT
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
    CREATE TABLE rhyme_index (
      word_lower TEXT PRIMARY KEY,
      corpus_freq INTEGER NOT NULL
    );
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const synset = db.prepare(`
    INSERT INTO wordnet_synset (
      id, pos, definition, examples_json, source
    ) VALUES (?, ?, ?, ?, 'oewn')
  `);
  synset.run('syn.ax.n', 'n', 'a cutting tool', '[]');
  synset.run('syn.axis.n', 'n', 'a central line', '[]');
  synset.run('syn.saw.n', 'n', 'a tool used to cut wood', '["the saw bit the oak"]');
  synset.run('syn.see.v', 'v', 'perceive with the eyes', '["I saw the light"]');

  const lemma = db.prepare(`
    INSERT INTO wordnet_lemma (
      lemma, lemma_lower, synset_id, sense_rank, pos, source
    ) VALUES (?, ?, ?, 1, ?, 'oewn')
  `);
  lemma.run('ax', 'ax', 'syn.ax.n', 'n');
  lemma.run('axis', 'axis', 'syn.axis.n', 'n');
  lemma.run('saw', 'saw', 'syn.saw.n', 'n');
  lemma.run('see', 'see', 'syn.see.v', 'v');
  db.prepare(`
    INSERT INTO entry (
      id, headword, headword_lower, lang, pos, senses_json, source
    ) VALUES (1, 'See', 'see', 'English', 'v', '[]', 'fixture')
  `).run();
  db.prepare('INSERT INTO rhyme_index(word_lower, corpus_freq) VALUES (?, ?)')
    .run('saw', 30);
  db.prepare('INSERT INTO rhyme_index(word_lower, corpus_freq) VALUES (?, ?)')
    .run('see', 80);

  migrateLexicalGraph(db, { timestamp: NOW });
  if (build) buildLemmaForms(db, { timestamp: NOW });
  db.close();
}

describe('lemma.sqlite.adapter', () => {
  let tempDir = null;
  const adapters = [];

  afterEach(() => {
    while (adapters.length > 0) adapters.pop().close();
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  function fixturePath(options) {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lemma-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixture(dbPath, options);
    return dbPath;
  }

  function adapterFor(dbPath) {
    const adapter = createLemmaAdapter(dbPath, { log: quietLog });
    adapters.push(adapter);
    return adapter;
  }

  it('reads all lawful forms, senses, frequencies, and a healthy manifest', () => {
    const adapter = adapterFor(fixturePath());

    expect(adapter.lookupForms('Axes').map((row) => `${row.lemma}/${row.pos}`))
      .toEqual(['ax/noun', 'axis/noun']);
    expect(adapter.getIndexState()).toMatchObject({
      version: MORPHOLOGY_VERSION,
      status: 'complete',
      expectedLemmaCount: 4,
      indexedLemmaCount: 4,
    });
    expect(adapter.lookupSenses('see', 'verb')[0]).toEqual(expect.objectContaining({
      synsetId: 'syn.see.v',
      definition: 'perceive with the eyes',
      examples: ['I saw the light'],
    }));
    expect(adapter.getCorpusFrequencies(['saw', 'see']))
      .toEqual(new Map([['saw', 30], ['see', 80]]));
  });

  it('reports unavailable when the database or manifest is missing', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lemma-adapter-missing-'));
    const missing = adapterFor(path.join(tempDir, 'missing.sqlite'));
    expect(missing.getIndexState()).toMatchObject({ status: 'unavailable' });
    expect(missing.lookupForms('axes')).toEqual([]);

    const noManifest = adapterFor(fixturePath({ build: false }));
    expect(noManifest.getIndexState()).toMatchObject({ status: 'unavailable' });

    const missingSourcesPath = fixturePath({ build: false });
    const writer = new Database(missingSourcesPath);
    writer.exec('DROP TABLE wordnet_lemma; DROP TABLE wordnet_synset;');
    writer.close();
    expect(() => adapterFor(missingSourcesPath)).not.toThrow();
    expect(adapters.at(-1).getIndexState()).toMatchObject({ status: 'unavailable' });
  });

  it('downgrades partial, stale-version, count, and source-digest claims', () => {
    const dbPath = fixturePath();
    const adapter = adapterFor(dbPath);
    const writer = new Database(dbPath);

    writer.prepare("UPDATE meta SET value = 'partial' WHERE key = 'lemma_form_status'").run();
    expect(adapter.getIndexState()).toMatchObject({ status: 'partial' });

    writer.prepare("UPDATE meta SET value = 'complete' WHERE key = 'lemma_form_status'").run();
    writer.prepare("UPDATE meta SET value = 'stale' WHERE key = 'lemma_form_version'").run();
    expect(adapter.getIndexState()).toMatchObject({ status: 'partial' });

    writer.prepare("UPDATE meta SET value = ? WHERE key = 'lemma_form_version'")
      .run(MORPHOLOGY_VERSION);
    writer.prepare(`
      INSERT INTO entry (
        id, headword, headword_lower, lang, pos, senses_json, source
      ) VALUES (2, 'Leaf', 'leaf', 'English', 'n', '[]', 'fixture')
    `).run();
    expect(adapter.getIndexState()).toMatchObject({ status: 'partial' });
    writer.close();
  });
});
