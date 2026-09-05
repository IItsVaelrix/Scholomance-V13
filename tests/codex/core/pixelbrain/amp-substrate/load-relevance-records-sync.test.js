/**
 * `load-relevance-records-sync.js` — the synchronous JSON reader Task 4 built
 * for `item-foundry.js`'s hot, synchronous forge path.
 *
 * Two families of test live here:
 *
 * 1. The brief's own Step-1 tests, run against the REAL
 *    `pilot-relevance/` directory. Task 6 has migrated the 5 files under
 *    `codex/core/pixelbrain/amp-substrate/pilot-relevance/` from
 *    PB-AMP-RELEVANCE-v1 shape to v2, so these now pass for real.
 *
 * 2. This loader's own correctness proof: hand-authored, checksummed,
 *    VALID v2-shape records written to a temp directory per test, exercising
 *    reading, row-shaping, `selectActiveAmps` interop, error reporting and the
 *    default-directory-only caching guard — all independent of whether the
 *    real `pilot-relevance/` directory happens to be migrated yet.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadRelevanceRecordsSync,
  clearRelevanceRecordsCache,
} from '../../../../../codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.js';
import { selectActiveAmps } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.js';
import { createAmpRelevanceRecord } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';
import { BytecodeError } from '../../../../../codex/core/pixelbrain/bytecode-error.js';

afterEach(() => clearRelevanceRecordsCache());

describe('loadRelevanceRecordsSync — against the real pilot-relevance/ directory', () => {
  it('reads every JSON record from pilot-relevance/ synchronously', () => {
    const records = loadRelevanceRecordsSync();
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => typeof r.pipeline === 'string')).toBe(true);
  });

  it('throws with the offending filename when a record in the directory fails validation', () => {
    const badDir = join(process.cwd(), 'tests/codex/core/pixelbrain/amp-substrate/fixtures/invalid-relevance');
    expect(() => loadRelevanceRecordsSync(badDir)).toThrow(/description/);
  });

  it('the loaded records work directly with selectActiveAmps', () => {
    const records = loadRelevanceRecordsSync();
    const result = selectActiveAmps('item', { class: 'armor', archetype: 'chestplate', parts: [] }, records);
    expect(result.activated).toContain('chestplate-amp');
  });

  it('caches on repeated calls with the default directory', () => {
    const first = loadRelevanceRecordsSync();
    const second = loadRelevanceRecordsSync();
    expect(second).toBe(first);
  });

  // Not from the brief — a live sentinel, inverted now that Task 6 has
  // migrated pilot-relevance/ to v2: pins down that the real default
  // directory loads cleanly, so this file screams if a future change
  // regresses one of the real files back out of v2 shape.
  it('documents post-Task-6 state: the real default directory loads and validates as v2', () => {
    const records = loadRelevanceRecordsSync();
    expect(records.length).toBeGreaterThanOrEqual(5);
    expect(records.every((r) => typeof r.pipeline === 'string')).toBe(true);
  });
});

describe('loadRelevanceRecordsSync — v2 fixture verification (independent of Task 6)', () => {
  /** Write hand-authored, checksummed, valid v2 records to a fresh temp dir. */
  function writeValidV2Dir(records) {
    const dir = mkdtempSync(join(tmpdir(), 'amp-relevance-v2-'));
    records.forEach((record) => {
      writeFileSync(join(dir, `${record.ampId}.json`), JSON.stringify(record), 'utf8');
    });
    return dir;
  }

  const CHESTPLATE_INPUT = {
    pipeline: 'item',
    ampId: 'test-chestplate-amp',
    order: 8,
    description: 'Test fixture: gated on class:armor + archetype includes chestplate.',
    concept: 'structural',
    version: '1.0.0',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'includes', value: 'chestplate' },
    ],
    requires: [],
  };

  it('reads a well-formed v2 record and produces the exact row shape selectActiveAmps expects', () => {
    const chestplate = createAmpRelevanceRecord(CHESTPLATE_INPUT);
    const dir = writeValidV2Dir([chestplate]);
    try {
      const records = loadRelevanceRecordsSync(dir);
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual({
        pipeline: 'item',
        ampId: 'test-chestplate-amp',
        order: 8,
        appliesToJson: JSON.stringify(chestplate.appliesTo),
        requiresJson: JSON.stringify(chestplate.requires),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the row shape produced from valid v2 fixtures works directly with selectActiveAmps', () => {
    const chestplate = createAmpRelevanceRecord(CHESTPLATE_INPUT);
    const symmetry = createAmpRelevanceRecord({
      pipeline: 'item',
      ampId: 'test-symmetry-amp',
      order: 1,
      description: 'Test fixture: universally relevant pass (empty appliesTo).',
      concept: 'structural',
      version: '1.0.0',
      appliesTo: [],
      requires: [],
    });
    const dir = writeValidV2Dir([chestplate, symmetry]);
    try {
      const records = loadRelevanceRecordsSync(dir);
      const result = selectActiveAmps(
        'item',
        { class: 'armor', archetype: 'chestplate', parts: [] },
        records,
      );
      // symmetry-amp (order 1) always matches; chestplate-amp (order 8) matches
      // this spec too — activated is sorted by `order`.
      expect(result.activated).toEqual(['test-symmetry-amp', 'test-chestplate-amp']);
      expect(result.skipped).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a BytecodeError naming the offending filename and every missing field, for a v2-shaped-but-invalid record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'amp-relevance-v2-invalid-'));
    writeFileSync(
      join(dir, 'broken-fixture.json'),
      JSON.stringify({
        contract: 'PB-AMP-RELEVANCE-v2',
        schemaVersion: 'PB-AMP-RELEVANCE-v2',
        pipeline: 'item',
        ampId: 'broken-fixture',
        order: 1,
        concept: 'structural',
        version: '1.0.0',
        appliesTo: [],
        requires: [],
        checksum: 'deadbeef',
      }),
      'utf8',
    );
    try {
      let caught;
      try {
        loadRelevanceRecordsSync(dir);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BytecodeError);
      expect(caught.message).toMatch(/description/);
      expect(caught.context.file).toBe('broken-fixture.json');
      expect(caught.context.errors.some((e) => e.startsWith('description:'))).toBe(true);
      expect(caught.context.errors.some((e) => e.startsWith('checksum:'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not cache explicit (non-default) directories: repeated loads re-read from disk', () => {
    const chestplate = createAmpRelevanceRecord(CHESTPLATE_INPUT);
    const dir = writeValidV2Dir([chestplate]);
    try {
      const first = loadRelevanceRecordsSync(dir);
      const second = loadRelevanceRecordsSync(dir);
      // Same content, but the cache branch only fires for the module's own
      // DEFAULT_DIR sentinel — an explicit dir must always re-read.
      expect(second).not.toBe(first);
      expect(second).toEqual(first);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
