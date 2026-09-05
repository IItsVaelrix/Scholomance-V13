/**
 * SQLite substrate (PDR §3.1 F2/F3).
 *
 * Runs against ':memory:' so no test ever touches a real substrate file.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openAmpSubstrate,
  registerAmpRelevance,
  listAmpRelevance,
  getAmpRelevance,
  unregisterAmpRelevance,
  appendActivationLog,
  readActivationLog,
  substrateStats,
  SUBSTRATE_NAMESPACE,
} from '../../../../../codex/core/pixelbrain/amp-substrate/amp-substrate.db.js';
import { createAmpRelevanceRecord } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';

const CHESTPLATE = createAmpRelevanceRecord({
  pipeline: 'item',
  ampId: 'chestplate-amp',
  order: 10,
  description: 'gates chestplate-specific geometry to armor chestplates',
  concept: 'structural',
  version: '1.0.0',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'includes', value: 'chestplate' },
  ],
});

const SYMMETRY = createAmpRelevanceRecord({
  pipeline: 'item',
  ampId: 'symmetry-amp',
  order: 20,
  description: 'enforces left/right symmetry on applicable parts',
  concept: 'structural',
  version: '1.0.0',
});

describe('AMP substrate — SQLite store', () => {
  let db;
  beforeEach(async () => { db = await openAmpSubstrate(':memory:'); });
  afterEach(async () => { await db?.close(); });

  it('migrates on open, under the amp_substrate namespace, with the project pragma defaults', async () => {
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).rows.map((r) => r.name);
    expect(tables).toContain('amp_relevance');
    expect(tables).toContain('amp_activation_log');

    const applied = (await db.execute('SELECT version FROM schema_migrations WHERE namespace = ? ORDER BY version', [SUBSTRATE_NAMESPACE])).rows;
    expect(applied).toEqual([{ version: 1 }, { version: 2 }]);
    expect(db.client.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('delegates idempotent file migration to the shared runner on every open', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'amp-substrate-migration-'));
    const file = join(dir, 'amp-substrate.sqlite');
    let second;
    try {
      const first = await openAmpSubstrate(file);
      await first.close();
      second = await openAmpSubstrate(file);
      const rows = (await second.execute(
        'SELECT version, name FROM schema_migrations WHERE namespace = ? ORDER BY version',
        [SUBSTRATE_NAMESPACE],
      )).rows;
      expect(rows).toEqual([
        { version: 1, name: 'create_amp_relevance_and_activation_log' },
        { version: 2, name: 'amp_relevance_v2_pipeline_order_description_concept' },
      ]);
    } finally {
      await second?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers a record and reads it back with its checksum intact', async () => {
    await registerAmpRelevance(db, CHESTPLATE);
    const row = await getAmpRelevance(db, 'item', 'chestplate-amp');
    expect(row.ampId).toBe('chestplate-amp');
    expect(row.checksum).toBe(CHESTPLATE.checksum);
    expect(JSON.parse(row.appliesToJson)).toHaveLength(2);
  });

  it('refuses a record whose checksum disagrees with its content, instead of correcting it', async () => {
    const tampered = { ...CHESTPLATE, version: '9.9.9' }; // checksum now stale
    await expect(registerAmpRelevance(db, tampered)).rejects.toThrow();
    try {
      await registerAmpRelevance(db, tampered);
    } catch (err) {
      expect(err.bytecode).toBeTruthy();
      expect(JSON.stringify(err.context ?? err.toJSON?.() ?? {})).toMatch(/checksum/);
    }
    expect(await getAmpRelevance(db, 'item', 'chestplate-amp')).toBeNull();
  });

  it('re-registering the same ampId updates in place rather than duplicating', async () => {
    await registerAmpRelevance(db, CHESTPLATE);
    const v2 = createAmpRelevanceRecord({
      pipeline: 'item',
      ampId: 'chestplate-amp',
      order: 10,
      description: 'gates chestplate-specific geometry to armor chestplates',
      concept: 'structural',
      version: '2.0.0',
      appliesTo: [{ field: 'class', op: 'eq', value: 'armor' }],
    });
    await registerAmpRelevance(db, v2);

    const all = await listAmpRelevance(db);
    expect(all).toHaveLength(1);
    expect(all[0].version).toBe('2.0.0');
    expect(all[0].checksum).toBe(v2.checksum);
  });

  it('lists records in a stable order regardless of insertion order', async () => {
    await registerAmpRelevance(db, SYMMETRY);
    await registerAmpRelevance(db, CHESTPLATE);
    expect((await listAmpRelevance(db)).map((r) => r.ampId)).toEqual(['chestplate-amp', 'symmetry-amp']);
  });

  it('unregisters a record and reports whether anything was actually removed', async () => {
    await registerAmpRelevance(db, CHESTPLATE);
    expect(await unregisterAmpRelevance(db, 'item', 'chestplate-amp')).toBe(true);
    expect(await unregisterAmpRelevance(db, 'item', 'chestplate-amp')).toBe(false);
    expect(await listAmpRelevance(db)).toHaveLength(0);
  });

  it('appends activation decisions and reads them back newest-first', async () => {
    await appendActivationLog(db, {
      specChecksum: 'a'.repeat(64), activated: ['chestplate-amp'], skipped: [], selectorVersion: '1.0.0',
    });
    await appendActivationLog(db, {
      specChecksum: 'b'.repeat(64), activated: [], skipped: [{ ampId: 'chestplate-amp', reason: 'no match' }], selectorVersion: '1.0.0',
    });

    const log = await readActivationLog(db, 10);
    expect(log).toHaveLength(2);
    expect(log[0].specChecksum).toBe('b'.repeat(64));
    expect(JSON.parse(log[0].skippedJson)[0].ampId).toBe('chestplate-amp');
    expect(JSON.parse(log[1].activatedJson)).toEqual(['chestplate-amp']);
  });

  it('stats counts records and activations, and ranks the most-activated amp deterministically', async () => {
    await registerAmpRelevance(db, CHESTPLATE);
    await registerAmpRelevance(db, SYMMETRY);
    for (let i = 0; i < 3; i += 1) {
      await appendActivationLog(db, {
        specChecksum: String(i).repeat(64).slice(0, 64),
        activated: ['symmetry-amp', 'chestplate-amp'],
        skipped: [],
        selectorVersion: '1.0.0',
      });
    }
    const stats = await substrateStats(db);
    expect(stats.registered).toBe(2);
    expect(stats.activations).toBe(3);
    // Both activated 3 times — the alphabetical tie-break must pick chestplate-amp,
    // every run, so `stats` output is reproducible rather than arbitrary.
    expect(stats.mostActivated).toEqual({ ampId: 'chestplate-amp', count: 3 });
  });

  it('refuses to open without a path instead of silently choosing one', async () => {
    await expect(openAmpSubstrate('')).rejects.toThrow();
  });

  it('migrates to schema v2 with a (pipeline, ampId) composite key', async () => {
    const record = createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'geometry-amp', order: 9,
      description: 'always-relevant base geometry pass', concept: 'structural',
      version: '2.0.0', appliesTo: [], requires: [],
    });
    await registerAmpRelevance(db, record);
    const rows = await listAmpRelevance(db, { pipeline: 'item' });
    expect(rows).toHaveLength(1);
    expect(rows[0].pipeline).toBe('item');
    expect(rows[0].order).toBe(9);
    expect(rows[0].description).toBe(record.description);
  });

  it('the same ampId may exist under two different pipelines', async () => {
    const itemRecord = createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'shadow-amp', order: 1,
      description: 'item-pipeline shadow pass (hypothetical)', concept: 'lighting',
      version: '1.0.0', appliesTo: [], requires: [],
    });
    const renderRecord = createAmpRelevanceRecord({
      pipeline: 'render-fidelity', ampId: 'shadow-amp', order: 1,
      description: 'render-fidelity shadow pass', concept: 'lighting',
      version: '1.0.0', appliesTo: [], requires: [],
    });
    await registerAmpRelevance(db, itemRecord);
    await registerAmpRelevance(db, renderRecord);
    expect(await getAmpRelevance(db, 'item', 'shadow-amp')).not.toBeNull();
    expect(await getAmpRelevance(db, 'render-fidelity', 'shadow-amp')).not.toBeNull();
  });

  it('listAmpRelevance with no filter returns every pipeline, ordered by (pipeline, order)', async () => {
    await registerAmpRelevance(db, createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'item-high-order', order: 10,
      description: 'runs late in the item pipeline', concept: 'structural',
      version: '1.0.0', appliesTo: [], requires: [],
    }));
    await registerAmpRelevance(db, createAmpRelevanceRecord({
      pipeline: 'cross-cutting', ampId: 'cross-cutting-only', order: 1,
      description: 'the sole cross-cutting pass in this test', concept: 'lighting',
      version: '1.0.0', appliesTo: [], requires: [],
    }));
    await registerAmpRelevance(db, createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'item-low-order', order: 2,
      description: 'runs early in the item pipeline', concept: 'structural',
      version: '1.0.0', appliesTo: [], requires: [],
    }));

    const rows = await listAmpRelevance(db);
    expect(rows.map((r) => [r.pipeline, r.order])).toEqual([
      ['cross-cutting', 1],
      ['item', 2],
      ['item', 10],
    ]);
  });

  it('unregisterAmpRelevance is scoped to (pipeline, ampId)', async () => {
    const record = createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'facet-amp', order: 14,
      description: 'faceting pass for gem-class parts', concept: 'lighting',
      version: '2.0.0', appliesTo: [], requires: [],
    });
    await registerAmpRelevance(db, record);
    const deleted = await unregisterAmpRelevance(db, 'item', 'facet-amp');
    expect(deleted).toBe(true);
    expect(await getAmpRelevance(db, 'item', 'facet-amp')).toBeNull();
  });

  it('refuses a second ampId in the same pipeline claiming an already-used order', async () => {
    await registerAmpRelevance(db, createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'first-amp', order: 5,
      description: 'holds order 5 in the item pipeline', concept: 'structural',
      version: '1.0.0', appliesTo: [], requires: [],
    }));
    const collider = createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'second-amp', order: 5,
      description: 'also wants order 5 in the item pipeline', concept: 'structural',
      version: '1.0.0', appliesTo: [], requires: [],
    });
    await expect(registerAmpRelevance(db, collider)).rejects.toThrow();
    expect(await getAmpRelevance(db, 'item', 'second-amp')).toBeNull();
  });

  it('allows the same order value in two different pipelines (order is scoped per-pipeline)', async () => {
    await registerAmpRelevance(db, createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'item-order-5', order: 5,
      description: 'holds order 5 in the item pipeline', concept: 'structural',
      version: '1.0.0', appliesTo: [], requires: [],
    }));
    const otherPipeline = createAmpRelevanceRecord({
      pipeline: 'render-fidelity', ampId: 'render-order-5', order: 5,
      description: 'holds order 5 in the render-fidelity pipeline', concept: 'lighting',
      version: '1.0.0', appliesTo: [], requires: [],
    });
    await expect(registerAmpRelevance(db, otherPipeline)).resolves.not.toThrow();
    expect(await getAmpRelevance(db, 'render-fidelity', 'render-order-5')).not.toBeNull();
  });

  it('re-registering the same ampId with the same order updates in place, not a collision', async () => {
    const v1 = createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'stable-amp', order: 7,
      description: 'first version of a stable-order pass', concept: 'structural',
      version: '1.0.0', appliesTo: [], requires: [],
    });
    await registerAmpRelevance(db, v1);
    const v2 = createAmpRelevanceRecord({
      pipeline: 'item', ampId: 'stable-amp', order: 7,
      description: 'second version of a stable-order pass', concept: 'structural',
      version: '2.0.0', appliesTo: [], requires: [],
    });
    await expect(registerAmpRelevance(db, v2)).resolves.not.toThrow();
    const row = await getAmpRelevance(db, 'item', 'stable-amp');
    expect(row.version).toBe('2.0.0');
  });
});
