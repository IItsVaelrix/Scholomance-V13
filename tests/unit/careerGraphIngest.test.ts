import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import manifest from '../../config/career-graph-sources.json';
// @ts-expect-error - .mjs build scripts have no bundled types
import {
  ingestSources,
  lastPathSegment,
  onetRequirementFromImportance,
  normalizeOnet,
  pivotOnetSkillRatings,
} from '../../scripts/career-graph/ingest-sources.mjs';
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

  describe('O*NET long-format skill ratings', () => {
    const row = (soc: string, id: string, name: string, scale: string, value: string, extra = {}) => ({
      'O*NET-SOC Code': soc,
      'Element ID': id,
      'Element Name': name,
      'Scale ID': scale,
      'Data Value': value,
      'Recommend Suppress': 'N',
      'Not Relevant': 'n/a',
      ...extra,
    });

    it('folds the IM and LV rows of a pair into one record', () => {
      const { pairs, usedRows } = pivotOnetSkillRatings([
        row('15-1252.00', '2.A.1.a', 'Reading Comprehension', 'IM', '4.12'),
        row('15-1252.00', '2.A.1.a', 'Reading Comprehension', 'LV', '4.62'),
      ]);
      expect(usedRows).toBe(2);
      expect([...pairs.values()]).toEqual([
        {
          soc: '15-1252.00',
          skillId: '2.A.1.a',
          skillName: 'Reading Comprehension',
          importance: 4.12,
          level: 4.62,
        },
      ]);
    });

    it('drops suppressed and not-relevant ratings rather than asserting them', () => {
      const { pairs } = pivotOnetSkillRatings([
        row('15-1252.00', '2.A.1.a', 'Reading Comprehension', 'IM', '4.12'),
        row('15-1252.00', '2.A.1.a', 'Reading Comprehension', 'LV', '4.62', {
          'Recommend Suppress': 'Y',
        }),
        row('15-1252.00', '2.B.1.a', 'Social Perceptiveness', 'LV', '1.00', {
          'Not Relevant': 'Y',
        }),
      ]);
      const bySkill = new Map([...pairs.values()].map((p: any) => [p.skillId, p]));
      expect(bySkill.get('2.A.1.a')).toMatchObject({ importance: 4.12, level: null });
      expect(bySkill.get('2.B.1.a')).toBeUndefined();
    });

    it('does not emit an edge for a pair with no importance rating', () => {
      const rows = normalizeOnet(
        [{ 'O*NET-SOC Code': '15-1252.00', Title: 'Software Developers', Description: '' }],
        [
          row('15-1252.00', '2.A.1.a', 'Reading Comprehension', 'IM', '4.12'),
          // Level only — cannot be graded required/preferred/optional.
          row('15-1252.00', '2.B.1.a', 'Social Perceptiveness', 'LV', '3.00'),
        ],
        'onet-30.3'
      );
      const edges = rows.filter((r: any) => r.record_type === 'relation');
      expect(edges).toHaveLength(1);
      expect(edges[0].to_concept_id).toBe('onet:skill.2.A.1.a');
    });

    // FALSIFICATION: this is the exact shape that shipped a 5-relation graph —
    // a real file whose columns the ingest does not recognise. It must throw,
    // not return an empty edge set.
    it('throws when skill rows parse but yield no relations', () => {
      const wrongFile = [
        {
          'Essential Skills Element ID': '2.A.1.a',
          'Essential Skills Element Name': 'Reading Comprehension',
          'Work Activities Element ID': '4.A.1.a.1',
          'Work Activities Element Name': 'Getting Information',
        },
      ];
      expect(() => normalizeOnet([], wrongFile, 'onet-30.3')).toThrow(
        /INGEST_NO_SKILL_RELATIONS/
      );
    });

    it('does not throw when the skill file is legitimately empty', () => {
      expect(() => normalizeOnet([], [], 'onet-30.3')).not.toThrow();
    });
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
    // O*NET ships skill ratings in long format: Importance ('IM') and Level
    // ('LV') are separate rows that the ingest must pivot together, split
    // across the Essential (2.A.*) and Transferable (2.B.*) files.
    const skillHeader =
      'O*NET-SOC Code\tElement ID\tElement Name\tScale ID\tData Value\tRecommend Suppress\tNot Relevant';
    await writeFile(
      join(onetDir, 'essential_skills.tsv'),
      [
        skillHeader,
        '15-1252.00\t2.A.2.c\tActive Learning\tIM\t4.00\tN\tn/a',
        '15-1252.00\t2.A.2.c\tActive Learning\tLV\t4.50\tN\tN',
      ].join('\n')
    );
    await writeFile(
      join(onetDir, 'transferable_skills.tsv'),
      [
        skillHeader,
        '15-1252.00\t2.B.1.a\tSocial Perceptiveness\tIM\t2.75\tN\tn/a',
        '15-1252.00\t2.B.1.a\tSocial Perceptiveness\tLV\t3.00\tN\tN',
      ].join('\n')
    );
    await writeFile(
      join(onetDir, 'technology_skills.tsv'),
      [
        'O*NET-SOC Code\tWorkplace Example\tElement ID\tElement Name\tHot Technology\tIn Demand',
        '15-1252.00\tPython\t2.E.1.a\tObject oriented development software\tY\tY',
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
      expect(ids).toContain('onet:skill.2.A.2.c');
      expect(ids).toContain('onet:skill.2.B.1.a');
      // The technology layer contributes a concrete tool concept.
      expect(ids).toContain('onet:tech.python');
      expect(ids).toContain('esco:dev-1');
      expect(ids).toContain('esco:sql-1');

      // Rated skills (both files, IM/LV folded) plus the technology edge.
      const onetEdges = db
        .prepare(
          "SELECT to_concept_id, requirement_kind, importance, level FROM career_relation " +
          "WHERE from_concept_id='onet:15-1252.00' AND predicate='requires_skill' ORDER BY to_concept_id"
        )
        .all();
      expect(onetEdges).toEqual([
        { to_concept_id: 'onet:skill.2.A.2.c', requirement_kind: 'required', importance: 4, level: 4.5 },
        { to_concept_id: 'onet:skill.2.B.1.a', requirement_kind: 'preferred', importance: 2.75, level: 3 },
        // Hot + in-demand tool → preferred; O*NET never asserts a tool as required.
        { to_concept_id: 'onet:tech.python', requirement_kind: 'preferred', importance: null, level: null },
      ]);

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
