import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { migrateLexicalGraph } from '../../codex/core/lexical-graph/migrate.js';
import { seedLiteraryDevices } from '../../codex/core/lexical-graph/seedDevices.js';
import { deviceLexicalId } from '../../codex/core/lexical-graph/canonicalize.js';

const NOW = '2026-07-18T00:00:00.000Z';
const LATER = '2026-07-18T01:00:00.000Z';

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
  `);
  db.close();
}

describe('[Server] lexicalGraph.seedDevices', () => {
  let tempDir = null;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  function openFixture() {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexical-graph-seed-devices-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const db = new Database(dbPath);
    migrateLexicalGraph(db, { timestamp: NOW });
    return db;
  }

  function writeSeedFile(seed) {
    const seedPath = path.join(tempDir, 'seed.json');
    writeFileSync(seedPath, JSON.stringify(seed), 'utf8');
    return seedPath;
  }

  it('throws PB-ERR-v1-VALUE when caller timestamp is missing', () => {
    const db = openFixture();
    expect(() => seedLiteraryDevices(db, {})).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => seedLiteraryDevices(db)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => seedLiteraryDevices(db, { timestamp: '  ' })).toThrow(/PB-ERR-v1-VALUE/);
    db.close();
  });

  it('seeds exactly 10 literary_device rows from the committed catalog', () => {
    const db = openFixture();
    const { seeded } = seedLiteraryDevices(db, { timestamp: NOW });
    expect(seeded).toBe(10);

    const count = db.prepare(`SELECT COUNT(*) AS n FROM literary_device`).get().n;
    expect(count).toBe(10);

    const entryCount = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry WHERE type = 'device'`).get().n;
    expect(entryCount).toBe(10);

    db.close();
  });

  it('literary_device has no related_devices_json / commonly_confused_with_json columns', () => {
    const db = openFixture();
    seedLiteraryDevices(db, { timestamp: NOW });

    const columns = db.prepare(`PRAGMA table_info(literary_device)`).all().map((c) => c.name);
    expect(columns).not.toContain('related_devices_json');
    expect(columns).not.toContain('commonly_confused_with_json');

    db.close();
  });

  it('writes bidirectional commonly_confused_with edges between antithesis and juxtaposition', () => {
    const db = openFixture();
    seedLiteraryDevices(db, { timestamp: NOW });

    const antithesisId = deviceLexicalId('antithesis');
    const juxtapositionId = deviceLexicalId('juxtaposition');

    const forward = db
      .prepare(
        `SELECT strength FROM lexical_relation WHERE source_id = ? AND target_id = ? AND relation = 'commonly_confused_with'`,
      )
      .get(antithesisId, juxtapositionId);
    const backward = db
      .prepare(
        `SELECT strength FROM lexical_relation WHERE source_id = ? AND target_id = ? AND relation = 'commonly_confused_with'`,
      )
      .get(juxtapositionId, antithesisId);

    expect(forward).toBeTruthy();
    expect(backward).toBeTruthy();
    expect(forward.strength).toBe(backward.strength);

    const contrast = db
      .prepare(`SELECT 1 FROM lexical_relation WHERE relation = 'contrasts_with' AND (source_id = ? OR target_id = ?)`)
      .get(antithesisId, antithesisId);
    expect(contrast).toBeFalsy();

    db.close();
  });

  it('finds antithesis by name and by alias via FTS after seeding', () => {
    const db = openFixture();
    seedLiteraryDevices(db, { timestamp: NOW });

    const byName = db
      .prepare(`SELECT canonical_text FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'antithesis'`)
      .get();
    expect(byName).toBeTruthy();

    const byAlias = db
      .prepare(`SELECT rowid FROM lexical_entry_fts WHERE lexical_entry_fts MATCH 'antithetical'`)
      .get();
    expect(byAlias).toBeTruthy();

    db.close();
  });

  it('detection signals parse as arrays of objects with kind + weight + parameters', () => {
    const db = openFixture();
    seedLiteraryDevices(db, { timestamp: NOW });

    const row = db
      .prepare(`SELECT detection_signals_json FROM literary_device WHERE id = ?`)
      .get(deviceLexicalId('antithesis'));
    const signals = JSON.parse(row.detection_signals_json);

    expect(Array.isArray(signals)).toBe(true);
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(typeof signal.kind).toBe('string');
      expect(typeof signal.weight).toBe('number');
      expect(typeof signal.parameters).toBe('object');
      expect(signal.parameters).not.toBeNull();
    }

    db.close();
  });

  it('is idempotent across repeated seeding runs', () => {
    const db = openFixture();
    seedLiteraryDevices(db, { timestamp: NOW });
    const countAfterFirst = db.prepare(`SELECT COUNT(*) AS n FROM literary_device`).get().n;
    const relationCountAfterFirst = db.prepare(`SELECT COUNT(*) AS n FROM lexical_relation`).get().n;

    expect(() => seedLiteraryDevices(db, { timestamp: LATER })).not.toThrow();
    const countAfterSecond = db.prepare(`SELECT COUNT(*) AS n FROM literary_device`).get().n;
    const relationCountAfterSecond = db.prepare(`SELECT COUNT(*) AS n FROM lexical_relation`).get().n;

    expect(countAfterSecond).toBe(countAfterFirst);
    expect(relationCountAfterSecond).toBe(relationCountAfterFirst);

    const meta = db.prepare(`SELECT value FROM meta WHERE key = 'literary_device_seed_version'`).get();
    expect(meta.value).toBe('1');

    db.close();
  });

  it('fails the whole transaction (no partial rows) when an example is missing a license', () => {
    const db = openFixture();

    const badSeedPath = writeSeedFile({
      seedVersion: '1',
      devices: [
        {
          slug: 'antithesis',
          name: 'Antithesis',
          aliases: [],
          definition: 'Opposing ideas in parallel structure.',
          definitionsProvenance: [{ source: 'Scholomance craft notes', license: 'Project' }],
          detectionSignals: [
            {
              id: 'antithesis.semantic_opposition',
              kind: 'semantic_opposition',
              description: 'x',
              weight: 1,
              parameters: {},
            },
          ],
          purposes: [{ id: 'contrast', description: 'Sharpen opposition' }],
          compatibleStructures: [],
          examples: [{ text: 'Missing license example.' }],
          relations: [],
        },
      ],
    });

    expect(() => seedLiteraryDevices(db, { timestamp: NOW, seedPath: badSeedPath })).toThrow(/PB-ERR-v1-VALUE/);

    const count = db.prepare(`SELECT COUNT(*) AS n FROM literary_device`).get().n;
    expect(count).toBe(0);
    const entryCount = db.prepare(`SELECT COUNT(*) AS n FROM lexical_entry`).get().n;
    expect(entryCount).toBe(0);

    db.close();
  });

  it('rejects a seed relation targeting an unknown device slug before writing anything', () => {
    const db = openFixture();

    const badSeedPath = writeSeedFile({
      seedVersion: '1',
      devices: [
        {
          slug: 'antithesis',
          name: 'Antithesis',
          aliases: [],
          definition: 'Opposing ideas in parallel structure.',
          definitionsProvenance: [{ source: 'Scholomance craft notes', license: 'Project' }],
          detectionSignals: [
            {
              id: 'antithesis.semantic_opposition',
              kind: 'semantic_opposition',
              description: 'x',
              weight: 1,
              parameters: {},
            },
          ],
          purposes: [{ id: 'contrast', description: 'Sharpen opposition' }],
          compatibleStructures: [],
          examples: [{ text: 'x', license: 'Public Domain' }],
          relations: [{ targetSlug: 'not-a-device', relation: 'related_device', strength: 0.5 }],
        },
      ],
    });

    expect(() => seedLiteraryDevices(db, { timestamp: NOW, seedPath: badSeedPath })).toThrow();
    const count = db.prepare(`SELECT COUNT(*) AS n FROM literary_device`).get().n;
    expect(count).toBe(0);

    db.close();
  });

  it('uses a custom seedPath when provided instead of the default catalog', () => {
    const db = openFixture();

    const customSeedPath = writeSeedFile({
      seedVersion: '1',
      devices: [
        {
          slug: 'metaphor',
          name: 'Metaphor',
          aliases: ['figurative equation'],
          definition: 'Asserts one thing is another.',
          definitionsProvenance: [{ source: 'Scholomance craft notes', license: 'Project' }],
          detectionSignals: [
            {
              id: 'metaphor.comparison_marker',
              kind: 'comparison_marker',
              description: 'x',
              weight: 1,
              parameters: { equateForm: true },
            },
          ],
          purposes: [{ id: 'comparison', description: 'Map qualities across domains' }],
          compatibleStructures: ['line'],
          examples: [{ text: 'All the world is a stage.', license: 'Public Domain' }],
          relations: [],
        },
      ],
    });

    const { seeded } = seedLiteraryDevices(db, { timestamp: NOW, seedPath: customSeedPath });
    expect(seeded).toBe(1);

    const row = db.prepare(`SELECT name FROM literary_device WHERE id = ?`).get(deviceLexicalId('metaphor'));
    expect(row.name).toBe('Metaphor');

    db.close();
  });
});
