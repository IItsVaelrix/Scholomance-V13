import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { buildLemmaForms } from '../../../codex/core/lexical-analysis/buildLemmaForms.js';
import { migrateLexicalGraph } from '../../../codex/core/lexical-graph/migrate.js';
import { MORPHOLOGY_VERSION } from '../../../codex/core/lexical-graph/types.js';

const NOW = '2026-07-18T00:00:00.000Z';

function createFixture() {
  const db = new Database(':memory:');
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
  `);

  const insertLemma = db.prepare(`
    INSERT INTO wordnet_lemma (
      lemma, lemma_lower, synset_id, sense_rank, pos, source
    ) VALUES (?, ?, ?, 1, ?, 'oewn')
  `);
  for (const [lemma, pos] of [
    ['ax', 'n'],
    ['axis', 'n'],
    ['leaf', 'n'],
    ['leave', 'v'],
    ['saw', 'n'],
    ['see', 'v'],
  ]) {
    insertLemma.run(lemma, lemma, `syn.${lemma}.${pos}`, pos);
  }

  db.prepare(`
    INSERT INTO entry (
      id, headword, headword_lower, lang, pos, senses_json, source
    ) VALUES (1, 'Good', 'good', 'English', 'adjective', '[]', 'fixture')
  `).run();
  migrateLexicalGraph(db, { timestamp: NOW });
  return db;
}

describe('buildLemmaForms', () => {
  const open = [];

  afterEach(() => {
    while (open.length > 0) open.pop().close();
  });

  it('builds a complete, stable, idempotent inverse index', () => {
    const db = createFixture();
    open.push(db);

    const first = buildLemmaForms(db, { timestamp: NOW });
    const rows = db.prepare(`
      SELECT surface_lower, lemma_lower, pos
      FROM lemma_form
      WHERE surface_lower IN ('axes', 'leaves', 'saw')
      ORDER BY surface_lower, lemma_lower, pos
    `).all();

    expect(rows).toEqual(expect.arrayContaining([
      { surface_lower: 'axes', lemma_lower: 'ax', pos: 'noun' },
      { surface_lower: 'axes', lemma_lower: 'axis', pos: 'noun' },
      { surface_lower: 'leaves', lemma_lower: 'leaf', pos: 'noun' },
      { surface_lower: 'leaves', lemma_lower: 'leave', pos: 'verb' },
      { surface_lower: 'saw', lemma_lower: 'saw', pos: 'noun' },
      { surface_lower: 'saw', lemma_lower: 'see', pos: 'verb' },
    ]));
    expect(first).toMatchObject({
      version: MORPHOLOGY_VERSION,
      status: 'complete',
      expectedLemmaCount: 7,
      indexedLemmaCount: 7,
    });
    expect(first.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const second = buildLemmaForms(db, { timestamp: NOW });
    expect(second).toEqual(first);
    expect(db.prepare('SELECT COUNT(*) AS count FROM lemma_form').get().count)
      .toBeGreaterThan(first.indexedLemmaCount);
  });

  it('retains a partial marker and rolls back row changes when rebuilding fails', () => {
    const db = createFixture();
    open.push(db);
    buildLemmaForms(db, { timestamp: NOW });
    const before = db.prepare(`
      SELECT surface_lower, lemma_lower, pos, transform_id, source
      FROM lemma_form ORDER BY 1, 2, 3, 4, 5
    `).all();

    db.exec(`
      CREATE TRIGGER fail_lemma_rebuild
      BEFORE INSERT ON lemma_form
      WHEN NEW.surface_lower = 'axes'
      BEGIN
        SELECT RAISE(ABORT, 'fixture rebuild failure');
      END;
    `);

    expect(() => buildLemmaForms(db, { timestamp: NOW })).toThrow(/fixture rebuild failure/);
    expect(db.prepare("SELECT value FROM meta WHERE key = 'lemma_form_status'").get().value)
      .toBe('partial');
    expect(db.prepare("SELECT value FROM meta WHERE key = 'lemma_form_version'").get())
      .toBeUndefined();
    expect(db.prepare(`
      SELECT surface_lower, lemma_lower, pos, transform_id, source
      FROM lemma_form ORDER BY 1, 2, 3, 4, 5
    `).all()).toEqual(before);
  });
});
