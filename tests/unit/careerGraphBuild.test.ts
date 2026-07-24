import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error - .mjs build script has no bundled types
import { buildCareerGraph, computeBuildChecksum } from '../../scripts/career-graph/build-database.mjs';

const FIXTURES = 'tests/fixtures/career-graph';

describe('Career Graph canonical build (Gate B)', () => {
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'career-graph-build-'));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('preserves namespaces and uses one edge store', async () => {
    const report = await buildCareerGraph({
      sources: FIXTURES,
      outputPath: join(workDir, 'canonical.sqlite'),
      policy: 'career-graph-schema-v1',
    });

    const db = new Database(report.outputPath, { readonly: true });
    try {
      expect(
        db.prepare('select count(*) n from career_concept').get().n
      ).toBeGreaterThan(1);
      expect(
        db
          .prepare("select count(*) n from career_relation where predicate='mapped_to'")
          .get().n
      ).toBe(1);
      expect(
        db
          .prepare("select count(*) n from sqlite_master where name='career_search_fts'")
          .get().n
      ).toBe(1);
      expect(report.orphanRelations).toBe(0);

      // O*NET and ESCO identities stay namespaced and distinct.
      const namespaces = db
        .prepare('select distinct namespace from career_concept order by namespace')
        .all()
        .map((r: any) => r.namespace);
      expect(namespaces).toEqual(['esco', 'onet']);

      // The crosswalk is mapped_to, never same_as.
      const sameAs = db
        .prepare("select count(*) n from career_relation where predicate='same_as'")
        .get().n;
      expect(sameAs).toBe(0);
    } finally {
      db.close();
    }
  });

  it('is deterministic: identical inputs yield identical checksums', async () => {
    const a = await buildCareerGraph({
      sources: FIXTURES,
      outputPath: join(workDir, 'a.sqlite'),
    });
    const b = await buildCareerGraph({
      sources: FIXTURES,
      outputPath: join(workDir, 'b.sqlite'),
    });
    expect(a.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(a.checksum).toBe(b.checksum);
  });

  it('indexes concepts into FTS5 for retrieval', async () => {
    const report = await buildCareerGraph({
      sources: FIXTURES,
      outputPath: join(workDir, 'fts.sqlite'),
    });
    const db = new Database(report.outputPath, { readonly: true });
    try {
      const hits = db
        .prepare("select concept_id from career_search_fts where career_search_fts match 'SQL'")
        .all()
        .map((r: any) => r.concept_id)
        .sort();
      expect(hits).toEqual(['esco:skill.sql', 'onet:skill.sql']);
    } finally {
      db.close();
    }
  });

  it('rejects orphan relations under referential integrity (strict)', async () => {
    // Build a sources dir with a relation pointing at a nonexistent concept.
    const orphanDir = join(workDir, 'orphan-src');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(orphanDir, { recursive: true });
    await writeFile(
      join(orphanDir, 'mini-onet.csv'),
      [
        'record_type,namespace,external_id,kind,preferred_label,description,from_concept_id,predicate,to_concept_id,requirement_kind,importance,level,source_release,source_record_id',
        'concept,onet,15-1252.00,occupation,Software Developers,Apps,,,,,,,onet-30.3,onet-occ-1',
        'relation,onet,,,,,onet:15-1252.00,requires_skill,onet:does-not-exist,required,0.9,5,onet-30.3,onet-rel-bad',
        '',
      ].join('\n')
    );

    await expect(
      buildCareerGraph({
        sources: orphanDir,
        outputPath: join(workDir, 'orphan.sqlite'),
      })
    ).rejects.toThrow(/CAREER_GRAPH_ORPHAN_RELATION/);
  });

  it('exposes a pure checksum helper', () => {
    const checksum = computeBuildChecksum({
      schemaPolicy: 'career-graph-schema-v1',
      policy: 'p',
      concepts: [
        {
          id: 'onet:x',
          namespace: 'onet',
          external_id: 'x',
          kind: 'occupation',
          preferred_label: 'X',
          description: '',
          source_release: 'onet-30.3',
        },
      ],
      relations: [],
    });
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});
