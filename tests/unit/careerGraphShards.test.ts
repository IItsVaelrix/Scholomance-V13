import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error - .mjs build scripts have no bundled types
import { buildCareerGraph } from '../../scripts/career-graph/build-database.mjs';
// @ts-expect-error - .mjs build scripts have no bundled types
import { buildShards, computeShardPartition, loadCanonicalGraph, socMajorGroup } from '../../scripts/career-graph/build-shards.mjs';
// @ts-expect-error - .mjs build scripts have no bundled types
import { verifyShards } from '../../scripts/career-graph/verify-shards.mjs';

const FIXTURES = 'tests/fixtures/career-graph';

describe('Career Graph shards (Gate C)', () => {
  let workDir: string;
  let canonicalPath: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'career-shards-'));
    canonicalPath = join(workDir, 'canonical.sqlite');
    await buildCareerGraph({ sources: FIXTURES, outputPath: canonicalPath });
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('derives SOC major groups from O*NET occupation ids', () => {
    expect(socMajorGroup('15-1252.00')).toBe('15');
    expect(socMajorGroup('29-1141.00')).toBe('29');
    expect(socMajorGroup('isco-2512')).toBeNull();
  });

  it('limits residency inputs and duplicates shared concepts without changing identity', async () => {
    const outputDir = join(workDir, 'shards');
    const result = await buildShards({ databasePath: canonicalPath, outputDir });

    // Core + universal pinned, plus one family shard (SOC 15).
    const shardIds = result.shards.map((s: any) => s.shardId).sort();
    expect(shardIds).toEqual(['core', 'family-15', 'universal']);

    // Residency law declared in the manifest.
    expect(result.manifest.residency.maxFamilyShards).toBe(3);
    expect(result.manifest.residency.pinned).toEqual(['core', 'universal']);

    // The shared skill onet:skill.sql is duplicated into core, universal, and
    // family-15 with an IDENTICAL id and label (identity preserved).
    const open = (file: string) => new Database(join(outputDir, file), { readonly: true });
    const coreDb = open('career-core.sqlite');
    const universalDb = open('career-universal.sqlite');
    const familyDb = open('career-family-15.sqlite');
    try {
      const q = 'SELECT id, preferred_label, kind FROM career_concept WHERE id = ?';
      const inCore = coreDb.prepare(q).get('onet:skill.sql');
      const inUniversal = universalDb.prepare(q).get('onet:skill.sql');
      const inFamily = familyDb.prepare(q).get('onet:skill.sql');
      expect(inCore).toBeTruthy();
      expect(inUniversal).toBeTruthy();
      expect(inFamily).toBeTruthy();
      expect(inUniversal).toEqual(inCore);
      expect(inFamily).toEqual(inCore);
    } finally {
      coreDb.close();
      universalDb.close();
      familyDb.close();
    }
  });

  it('produces shards that pass verification (integrity + checksum + identity)', async () => {
    const outputDir = join(workDir, 'shards-verify');
    await buildShards({ databasePath: canonicalPath, outputDir });
    const result = await verifyShards(outputDir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.shardCount).toBe(3);
  });

  it('partitions the canonical graph deterministically', () => {
    const graph = loadCanonicalGraph(canonicalPath);
    const a = computeShardPartition(graph);
    const b = computeShardPartition(graph);
    expect(Object.keys(a.families)).toEqual(Object.keys(b.families));
    expect(a.core.concepts.map((c: any) => c.id)).toEqual(
      b.core.concepts.map((c: any) => c.id)
    );
    // Universal bridge holds only skills.
    expect(a.universal.concepts.every((c: any) => c.kind === 'skill')).toBe(true);
    expect(a.universal.relations).toEqual([]);
  });
});
