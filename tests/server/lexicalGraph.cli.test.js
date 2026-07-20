import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openWriteDatabase, runCli } from '../../scripts/lexical-graph.mjs';

const NOW = '2026-07-18T00:00:00.000Z';

describe('[Server] lexicalGraph.cli', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  });

  it('openWriteDatabase rejects a missing db path (fileMustExist)', () => {
    expect(() => openWriteDatabase('/nonexistent/path/to/missing.sqlite')).toThrow();
  });

  it('build-lemma-forms creates a complete inverse index', async () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-cli-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
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
      CREATE TABLE wordnet_lemma (
        lemma TEXT NOT NULL,
        lemma_lower TEXT NOT NULL,
        synset_id TEXT NOT NULL,
        sense_rank INTEGER,
        pos TEXT,
        source TEXT NOT NULL,
        source_url TEXT
      );
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO entry (
        id, headword, headword_lower, lang, pos, senses_json, source
      ) VALUES (1, 'Axis', 'axis', 'English', 'n', '[]', 'fixture');
    `);
    db.close();

    expect(await runCli([
      'build-lemma-forms', '--db', dbPath, '--timestamp', NOW,
    ])).toBe(0);

    const verified = new Database(dbPath, { readonly: true });
    expect(verified.prepare(
      "SELECT value FROM meta WHERE key = 'lemma_form_status'",
    ).get().value).toBe('complete');
    expect(verified.prepare(
      "SELECT lemma_lower FROM lemma_form WHERE surface_lower = 'axes'",
    ).get().lemma_lower).toBe('axis');
    verified.close();
  });
});
