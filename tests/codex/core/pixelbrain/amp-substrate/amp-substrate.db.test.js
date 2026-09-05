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
  ampId: 'chestplate-amp',
  version: '1.0.0',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'includes', value: 'chestplate' },
  ],
});

const SYMMETRY = createAmpRelevanceRecord({ ampId: 'symmetry-amp', version: '1.0.0' });

describe('AMP substrate — SQLite store', () => {
  let db;
  beforeEach(async () => { db = await openAmpSubstrate(':memory:'); });
  afterEach(async () => { await db?.close(); });

  it('migrates on open, under the amp_substrate namespace, with the project pragma defaults', async () => {
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).rows.map((r) => r.name);
    expect(tables).toContain('amp_relevance');
    expect(tables).toContain('amp_activation_log');

    const applied = (await db.execute('SELECT version FROM schema_migrations WHERE namespace = ?', [SUBSTRATE_NAMESPACE])).rows;
    expect(applied).toEqual([{ version: 1 }]);
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
      expect(rows).toEqual([{ version: 1, name: 'create_amp_relevance_and_activation_log' }]);
    } finally {
      await second?.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('registers a record and reads it back with its checksum intact', async () => {
    await registerAmpRelevance(db, CHESTPLATE);
    const row = await getAmpRelevance(db, 'chestplate-amp');
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
    expect(await getAmpRelevance(db, 'chestplate-amp')).toBeNull();
  });

  it('re-registering the same ampId updates in place rather than duplicating', async () => {
    await registerAmpRelevance(db, CHESTPLATE);
    const v2 = createAmpRelevanceRecord({
      ampId: 'chestplate-amp',
      version: '2.0.0',
      appliesTo: [{ field: 'class', op: 'eq', value: 'armor' }],
    });
    await registerAmpRelevance(db, v2);

    const all = await listAmpRelevance(db);
    expect(all).toHaveLength(1);
    expect(all[0].version).toBe('2.0.0');
    expect(all[0].checksum).toBe(v2.checksum);
  });

  it('lists records in a stable alphabetical order regardless of insertion order', async () => {
    await registerAmpRelevance(db, SYMMETRY);
    await registerAmpRelevance(db, CHESTPLATE);
    expect((await listAmpRelevance(db)).map((r) => r.ampId)).toEqual(['chestplate-amp', 'symmetry-amp']);
  });

  it('unregisters a record and reports whether anything was actually removed', async () => {
    await registerAmpRelevance(db, CHESTPLATE);
    expect(await unregisterAmpRelevance(db, 'chestplate-amp')).toBe(true);
    expect(await unregisterAmpRelevance(db, 'chestplate-amp')).toBe(false);
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
});
