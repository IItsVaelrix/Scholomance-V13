import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import manifest from '../../config/career-graph-sources.json';
// @ts-expect-error - .mjs build scripts have no bundled types
import { ingestSources, lastPathSegment, onetRequirementFromImportance } from '../../scripts/career-graph/ingest-sources.mjs';
// @ts-expect-error - .mjs build scripts have no bundled types
import { buildCareerGraph } from '../../scripts/career-graph/build-database.mjs';

describe('Career Graph ingest (raw -> normalized -> SQLite)', () => {
  let workDir: string;

  beforeAll(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'career-ingest-'));
  });

  afterAll(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('maps ESCO URIs and O*NET importance deterministically', () => {
    expect(lastPathSegment('http://data.europa.eu/esco/skill/abc-123/')).toBe('abc-123');
    expect(lastPathSegment('plain-id')).toBe('plain-id');
    expect(onetRequirementFromImportance(4)).toBe('required');
    expect(onetRequirementFromImportance(3)).toBe('preferred');
    expect(onetRequirementFromImportance(1)).toBe('optional');
  });

  it('ingests synthetic raw releases into a valid canonical graph', async () => {
    const rawRoot = join(workDir, 'raw');
    const onetDir = join(rawRoot, manifest.onet.version);
    const escoDir = join(rawRoot, manifest.esco.version);
    const xwalkDir = join(rawRoot, manifest.crosswalk.version);
    await mkdir(onetDir, { recursive: true });
    await mkdir(escoDir, { recursive: true });
    await mkdir(xwalkDir, { recursive: true });

    // O*NET (tab-delimited).
    await writeFile(
      join(onetDir, 'occupations.tsv'),
      ['O*NET-SOC Code\tTitle\tDescription', '15-1252.00\tSoftware Developers\tBuild apps'].join('\n')
    );
    await writeFile(
      join(onetDir, 'occupation_skills.tsv'),
      [
        'O*NET-SOC Code\tSkill ID\tSkill Name\tImportance\tLevel',
        '15-1252.00\tactive_learning\tActive Learning\t4.0\t4.5',
      ].join('\n')
    );

    // ESCO (CSV).
    await writeFile(
      join(escoDir, 'occupations.csv'),
      ['conceptUri,preferredLabel,description', 'http://data.europa.eu/esco/occupation/dev-1,Software developer,Develops software'].join('\n')
    );
    await writeFile(
      join(escoDir, 'skills.csv'),
      ['conceptUri,preferredLabel,description', 'http://data.europa.eu/esco/skill/sql-1,SQL,Query databases'].join('\n')
    );
    await writeFile(
      join(escoDir, 'occupation_skills.csv'),
      ['occupationUri,skillUri,requirementType', 'http://data.europa.eu/esco/occupation/dev-1,http://data.europa.eu/esco/skill/sql-1,essential'].join('\n')
    );

    // Crosswalk (CSV).
    await writeFile(
      join(xwalkDir, 'crosswalk.csv'),
      ['onetSocCode,escoOccupationUri', '15-1252.00,http://data.europa.eu/esco/occupation/dev-1'].join('\n')
    );

    const normalizedDir = join(workDir, 'normalized');
    const ingest = await ingestSources({ rawRoot, outputDir: normalizedDir, manifest });
    expect(ingest.counts.onet).toBeGreaterThan(0);
    expect(ingest.counts.esco).toBeGreaterThan(0);
    expect(ingest.counts.crosswalk).toBe(1);

    const report = await buildCareerGraph({
      sources: normalizedDir,
      outputPath: join(workDir, 'canonical.sqlite'),
    });
    expect(report.orphanRelations).toBe(0);
    expect(report.mappedToCount).toBe(1);

    const db = new Database(report.outputPath, { readonly: true });
    try {
      // Namespaced identities preserved end-to-end.
      const ids = db
        .prepare('SELECT id FROM career_concept ORDER BY id')
        .all()
        .map((r: any) => r.id);
      expect(ids).toContain('onet:15-1252.00');
      expect(ids).toContain('onet:skill.active_learning');
      expect(ids).toContain('esco:dev-1');
      expect(ids).toContain('esco:sql-1');

      const mappedTo = db
        .prepare("SELECT from_concept_id, to_concept_id FROM career_relation WHERE predicate='mapped_to'")
        .get();
      expect(mappedTo).toEqual({
        from_concept_id: 'onet:15-1252.00',
        to_concept_id: 'esco:dev-1',
      });

      const escoReq = db
        .prepare("SELECT requirement_kind FROM career_relation WHERE from_concept_id='esco:dev-1'")
        .get();
      expect(escoReq.requirement_kind).toBe('required'); // essential -> required
    } finally {
      db.close();
    }
  });
});
