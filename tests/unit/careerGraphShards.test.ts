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
import { verifyShards, verifyCoverage, COVERAGE_POLICY } from '../../scripts/career-graph/verify-shards.mjs';

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

  // ──────────────────────────────────────────────────────────────────────────
  // COVERAGE LAW. The pipeline once produced 1018 occupations with 5 relations
  // and every existing gate passed, because they all ask whether the edges that
  // exist are well-formed, never whether edges exist. These tests assert the
  // new gate FAILS on that graph — a check that cannot fail is not a check.
  // ──────────────────────────────────────────────────────────────────────────
  describe('coverage law', () => {
    const occupation = (id: string, release: string) => ({
      id,
      kind: 'occupation',
      preferred_label: id,
      source_release: release,
    });
    const skillEdge = (id: string, from: string, release: string) => ({
      id,
      from_concept_id: from,
      to_concept_id: 'onet:skill.1',
      predicate: 'requires_skill',
      source_release: release,
    });

    it('rejects the historical failure: many occupations, almost no edges', () => {
      const concepts = Array.from({ length: 1018 }, (_, i) => occupation(`onet:occ-${i}`, 'onet-30.3'));
      const relations = [skillEdge('r1', 'onet:occ-0', 'onet-30.3')];

      const { errors, stats } = verifyCoverage({ concepts, relations });
      expect(stats.skilledOccupations).toBe(1);
      expect(errors.some((e: string) => e.startsWith('COVERAGE_FLOOR:'))).toBe(true);
    });

    it('rejects a source that contributes occupations but no skill edges', () => {
      const concepts = [
        occupation('onet:occ-0', 'onet-30.3'),
        occupation('esco:occ-0', 'esco-1.2.1'),
      ];
      // Only O*NET wired its skills; ESCO silently ingested none.
      const relations = [skillEdge('r1', 'onet:occ-0', 'onet-30.3')];

      const { errors } = verifyCoverage({ concepts, relations });
      expect(errors).toContain(
        'COVERAGE_NO_SKILL_EDGES:esco-1.2.1 — contributed occupations but zero requires_skill relations'
      );
    });

    it('accepts a graph where every source contributes and coverage clears the floor', () => {
      const concepts = Array.from({ length: 10 }, (_, i) => occupation(`onet:occ-${i}`, 'onet-30.3'));
      const relations = concepts
        .slice(0, 9)
        .map((c, i) => skillEdge(`r${i}`, c.id, 'onet-30.3'));

      const { errors, stats } = verifyCoverage({ concepts, relations });
      expect(errors).toEqual([]);
      expect(stats.skilledOccupationRatio).toBeGreaterThan(COVERAGE_POLICY.minSkilledOccupationRatio);
    });

    it('ignores non-skill predicates when measuring coverage', () => {
      const concepts = [occupation('onet:occ-0', 'onet-30.3')];
      const relations = [
        { id: 'x1', from_concept_id: 'onet:occ-0', to_concept_id: 'esco:occ-0', predicate: 'mapped_to', source_release: 'xwalk-2022-1' },
      ];

      const { errors } = verifyCoverage({ concepts, relations });
      expect(errors.some((e: string) => e.startsWith('COVERAGE_FLOOR:'))).toBe(true);
    });
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

    // The shared skill onet:skill.sql is duplicated into universal and
    // family-15 with an IDENTICAL id/label (identity preserved). It is NOT in
    // core: core is the occupation backbone, so an occupation→skill edge (and
    // its skill concept) belongs to the occupation's family shard, never the
    // always-pinned core — otherwise core is the whole graph and residency
    // bounds nothing.
    const open = (file: string) => new Database(join(outputDir, file), { readonly: true });
    const coreDb = open('career-core.sqlite');
    const universalDb = open('career-universal.sqlite');
    const familyDb = open('career-family-15.sqlite');
    try {
      const q = 'SELECT id, preferred_label, kind FROM career_concept WHERE id = ?';
      const inCore = coreDb.prepare(q).get('onet:skill.sql');
      const inUniversal = universalDb.prepare(q).get('onet:skill.sql');
      const inFamily = familyDb.prepare(q).get('onet:skill.sql');
      expect(inCore).toBeUndefined();
      expect(inUniversal).toBeTruthy();
      expect(inFamily).toBeTruthy();
      expect(inFamily).toEqual(inUniversal);

      // Core holds every occupation and does NOT carry occupation→skill edges.
      const coreOcc = coreDb
        .prepare("SELECT id FROM career_concept WHERE kind='occupation' ORDER BY id")
        .all()
        .map((r: any) => r.id);
      expect(coreOcc).toContain('onet:15-1252.00');
      const coreSkillEdges = coreDb
        .prepare(
          "SELECT count(*) n FROM career_relation r " +
          "JOIN career_concept c ON c.id = r.from_concept_id " +
          "WHERE r.predicate='requires_skill' AND c.namespace='onet'"
        )
        .get() as { n: number };
      expect(coreSkillEdges.n).toBe(0);
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
