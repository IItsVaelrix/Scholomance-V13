import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { runLexicalGraphAll } from '../../scripts/lexical-graph.mjs';
import {
  DEVICE_EMBEDDING_KIND,
  DEVICE_EMBEDDING_VERSION,
  DEVICE_EMBEDDING_DIMENSIONS,
} from '../../codex/core/lexical-graph/types.js';

const NOW = '2026-07-18T00:00:00.000Z';

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

    CREATE TABLE meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
  `);

  const insert = db.prepare(`
    INSERT INTO entry(id, headword, headword_lower, lang, pos, ipa, etymology, senses_json, source, source_url)
    VALUES (?, ?, ?, 'English', ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    1,
    'Grief',
    'grief',
    'noun',
    'G R IY F',
    null,
    JSON.stringify([{ glosses: ['Deep sorrow, especially at a death'] }]),
    'oewn',
    'https://en-word.net/',
  );
  insert.run(
    2,
    'Grief',
    'grief',
    'noun',
    'G R IY F',
    null,
    JSON.stringify([{ glosses: ['A cause of sorrow or annoyance'] }]),
    'oewn',
    'https://en-word.net/',
  );

  db.close();
}

describe('[Server] lexicalGraph.all', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function openFixture() {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-all-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    return new Database(dbPath);
  }

  it('runs the full graph and lemma pipeline on a same-headword fixture', () => {
    const db = openFixture();
    const entryBefore = db.prepare(`SELECT * FROM entry ORDER BY id`).all();

    const result = runLexicalGraphAll(db, { timestamp: NOW });

    expect(result.mirrored).toBe(2);
    expect(result.seeded).toBe(10);
    expect(result.embedded).toBe(10);
    expect(result.lemmaForms).toBe(1);

    expect(db.prepare(
      "SELECT value FROM meta WHERE key = 'lemma_form_status'",
    ).get().value).toBe('complete');
    expect(db.prepare(
      "SELECT value FROM meta WHERE key = 'lemma_form_indexed_lemma_count'",
    ).get().value).toBe('1');

    const wordCount = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry WHERE type = 'word'`).get().n;
    expect(wordCount).toBe(2);

    const deviceCount = db.prepare(`SELECT COUNT(*) AS n FROM literary_device`).get().n;
    expect(deviceCount).toBe(10);

    const deviceEntries = db.prepare(`SELECT * FROM lexical_entry WHERE type = 'device'`).all();
    expect(deviceEntries.length).toBe(10);
    for (const row of deviceEntries) {
      expect(row.embedding_kind).toBe(DEVICE_EMBEDDING_KIND);
      expect(row.embedding_version).toBe(DEVICE_EMBEDDING_VERSION);
      expect(row.embedding_dimensions).toBe(DEVICE_EMBEDDING_DIMENSIONS);
      expect(Buffer.isBuffer(row.embeddings_tq)).toBe(true);
      expect(row.embeddings_tq.length).toBeGreaterThan(0);
    }

    const entryAfter = db.prepare(`SELECT * FROM entry ORDER BY id`).all();
    expect(entryAfter).toEqual(entryBefore);

    db.close();
  });
});
