// Tests for scripts/career-graph/prepare-sources.mjs
//
// Exercises the pure mapping logic and the full prepareSources flow using
// synthetic files in a temp directory. Does NOT require the `unzip` binary
// or real O*NET/ESCO archives — it tests the file-mapping and reporting
// logic that runs AFTER extraction.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// @ts-expect-error - .mjs script has no bundled types
import {
  FILE_MAP,
  mapFiles,
  prepareSources,
  hasUnzip,
  matchesPattern,
  resolvePattern,
} from '../../scripts/career-graph/prepare-sources.mjs';

describe('prepare-sources', () => {
  let tmp;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'career-prepare-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  describe('FILE_MAP', () => {
    it('is frozen and covers onet, esco', () => {
      expect(Object.isFrozen(FILE_MAP)).toBe(true);
      const ids = FILE_MAP.map((s) => s.id);
      expect(ids).toContain('onet');
      expect(ids).toContain('esco');
    });

    it('every entry has a version, archive, and expected mappings', () => {
      for (const entry of FILE_MAP) {
        expect(entry.version).toBeTruthy();
        expect(entry.archive).toBeTruthy();
        expect(entry.expected.length).toBeGreaterThan(0);
        for (const m of entry.expected) {
          expect(m.from).toBeTruthy();
          expect(m.to).toBeTruthy();
        }
      }
    });
  });

  describe('matchesPattern', () => {
    it('treats a pattern with an extension as an exact basename match', () => {
      expect(matchesPattern('Essential Skills.txt', 'Essential Skills.txt')).toBe(true);
      // The regression that shipped a skill-less graph: this neighbour file has
      // no O*NET-SOC column and must never satisfy the skills target.
      expect(matchesPattern('Essential Skills to Work Activities.txt', 'Essential Skills.txt')).toBe(false);
      expect(matchesPattern('Essential Skills to Work Context.txt', 'Essential Skills.txt')).toBe(false);
    });

    it('treats an extension-less pattern as a substring match', () => {
      expect(matchesPattern('Occupation Data.txt', 'occupation data')).toBe(true);
      expect(matchesPattern('Occupation Level Metadata.txt', 'occupation data')).toBe(false);
    });
  });

  describe('resolvePattern', () => {
    it('tries patterns in order and returns the single match', () => {
      const files = ['Transferable Skills.txt', 'Essential Skills.txt'];
      expect(resolvePattern(files, ['Essential Skills.txt'])).toEqual({
        match: 'Essential Skills.txt',
        ambiguous: null,
      });
    });

    it('reports ambiguity instead of picking whichever file came first', () => {
      const files = ['Essential Skills.txt', 'Software Skills.txt', 'Transferable Skills.txt'];
      const result = resolvePattern(files, 'skills');
      expect(result.match).toBeNull();
      expect(result.ambiguous).toEqual([
        'Essential Skills.txt',
        'Software Skills.txt',
        'Transferable Skills.txt',
      ]);
    });

    it('returns no match when nothing matches any pattern', () => {
      expect(resolvePattern(['unrelated.txt'], ['Essential Skills.txt'])).toEqual({
        match: null,
        ambiguous: null,
      });
    });
  });

  describe('mapFiles', () => {
    it('maps a matching extracted file to the expected name', async () => {
      const dir = join(tmp, '30.3');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'Occupation Data.txt'), 'O*NET-SOC Code\tTitle\n15-1252.00\tSoftware Developers\n');

      const sourceMap = {
        id: 'onet',
        version: '30.3',
        expected: [{ from: 'occupation data', to: 'occupations.tsv' }],
      };

      const result = await mapFiles(dir, ['Occupation Data.txt'], sourceMap);
      expect(result.mapped).toEqual([{ from: 'Occupation Data.txt', to: 'occupations.tsv' }]);
      expect(result.missing).toEqual([]);

      const content = await readFile(join(dir, 'occupations.tsv'), 'utf-8');
      expect(content).toContain('15-1252.00');
    });

    it('reports missing when no file matches the pattern', async () => {
      const dir = join(tmp, '1.2.1');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'unrelated.txt'), 'nothing');

      const sourceMap = {
        id: 'esco',
        version: '1.2.1',
        expected: [{ from: 'occupations', to: 'occupations.csv' }],
      };

      const result = await mapFiles(dir, ['unrelated.txt'], sourceMap);
      expect(result.mapped).toEqual([]);
      expect(result.missing).toEqual(['occupations.csv']);
    });

    it('skips mapping when the target already exists', async () => {
      const dir = join(tmp, '30.3');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'occupations.tsv'), 'already here');

      const sourceMap = {
        id: 'onet',
        version: '30.3',
        expected: [{ from: 'occupation data', to: 'occupations.tsv' }],
      };

      const result = await mapFiles(dir, ['Occupation Data.txt'], sourceMap);
      expect(result.alreadyPresent).toEqual(['occupations.tsv']);
      expect(result.mapped).toEqual([]);
    });

    it('refuses to copy an ambiguous match and reports the candidates', async () => {
      const dir = join(tmp, '30.3');
      await mkdir(dir, { recursive: true });
      const files = ['Essential Skills.txt', 'Software Skills.txt'];
      for (const f of files) await writeFile(join(dir, f), 'data\n');

      const sourceMap = {
        id: 'onet',
        version: '30.3',
        expected: [{ from: 'skills', to: 'occupation_skills.tsv' }],
      };

      const logs: string[] = [];
      const result = await mapFiles(dir, files, sourceMap, (l: string) => logs.push(l));
      expect(result.mapped).toEqual([]);
      expect(result.ambiguous).toEqual([
        { to: 'occupation_skills.tsv', candidates: ['Essential Skills.txt', 'Software Skills.txt'] },
      ]);
      expect(logs.some((l) => l.includes('PREPARE_AMBIGUOUS'))).toBe(true);
    });

    it('is case-insensitive in pattern matching', async () => {
      const dir = join(tmp, '1.2.1');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'OCCUPATIONS_EN.CSV'), 'conceptUri\n');

      const sourceMap = {
        id: 'esco',
        version: '1.2.1',
        expected: [{ from: 'occupations', to: 'occupations.csv' }],
      };

      const result = await mapFiles(dir, ['OCCUPATIONS_EN.CSV'], sourceMap);
      expect(result.mapped).toEqual([{ from: 'OCCUPATIONS_EN.CSV', to: 'occupations.csv' }]);
    });
  });

  describe('prepareSources', () => {
    it('reports DIR_MISSING when the raw directory does not exist', async () => {
      const logs = [];
      const result = await prepareSources({
        rawRoot: join(tmp, 'nonexistent'),
        log: (l) => logs.push(l),
      });

      expect(result.ok).toBe(false);
      const onetResult = result.sources.find((s) => s.id === 'onet');
      expect(onetResult.ok).toBe(false);
      expect(onetResult.reason).toBe('DIR_MISSING');
      expect(logs.some((l) => l.includes('PREPARE_DIR_MISSING'))).toBe(true);
    });

    it('maps files from a populated raw directory (no archive)', async () => {
      const onetDir = join(tmp, '30.3');
      const escoDir = join(tmp, '1.2.1');
      const xwalkDir = join(tmp, '2022-1');
      await mkdir(onetDir, { recursive: true });
      await mkdir(escoDir, { recursive: true });
      await mkdir(xwalkDir, { recursive: true });

      await writeFile(join(onetDir, 'Occupation Data.txt'), 'soc\ttitle\n');
      await writeFile(join(onetDir, 'Essential Skills.txt'), 'skill data\n');
      await writeFile(join(onetDir, 'Transferable Skills.txt'), 'skill data\n');
      await writeFile(join(onetDir, 'Software Skills.txt'), 'tech data\n');
      // Near-miss neighbours from the real archive: present, never selected.
      await writeFile(join(onetDir, 'Essential Skills to Work Activities.txt'), 'not skills\n');
      await writeFile(join(onetDir, 'Essential Skills to Work Context.txt'), 'not skills\n');
      await writeFile(join(escoDir, 'occupations_en.csv'), 'conceptUri\n');
      await writeFile(join(escoDir, 'skills_en.csv'), 'conceptUri\n');
      await writeFile(join(escoDir, 'occupation_skills_en.csv'), 'occ,skill\n');
      await writeFile(join(xwalkDir, 'onet-esco-crosswalk.csv'), 'soc,esco\n');

      const logs = [];
      const result = await prepareSources({ rawRoot: tmp, log: (l) => logs.push(l) });

      expect(result.ok).toBe(true);
      expect(result.sources).toHaveLength(3);

      const onet = result.sources.find((s) => s.id === 'onet');
      expect(onet.ok).toBe(true);
      expect(onet.mapped).toEqual(
        expect.arrayContaining([
          { from: 'Essential Skills.txt', to: 'essential_skills.tsv' },
          { from: 'Transferable Skills.txt', to: 'transferable_skills.tsv' },
          { from: 'Software Skills.txt', to: 'technology_skills.tsv' },
        ])
      );
      // The activity/context crosswalks must not have been mapped anywhere.
      expect(onet.mapped.map((m: any) => m.from)).not.toContain(
        'Essential Skills to Work Activities.txt'
      );

      const crosswalk = result.sources.find((s) => s.id === 'crosswalk');
      expect(crosswalk.ok).toBe(true);
    });

    it('reports incomplete when expected files are missing', async () => {
      const onetDir = join(tmp, '30.3');
      const escoDir = join(tmp, '1.2.1');
      const xwalkDir = join(tmp, '2022-1');
      await mkdir(onetDir, { recursive: true });
      await mkdir(escoDir, { recursive: true });
      await mkdir(xwalkDir, { recursive: true });

      await writeFile(join(onetDir, 'Occupation Data.txt'), 'soc\ttitle\n');
      // Missing: Essential Skills.txt → essential_skills.tsv
      await writeFile(join(escoDir, 'occupations_en.csv'), 'conceptUri\n');
      await writeFile(join(escoDir, 'skills_en.csv'), 'conceptUri\n');
      await writeFile(join(escoDir, 'occupation_skills_en.csv'), 'occ,skill\n');
      await writeFile(join(xwalkDir, 'onet-esco-crosswalk.csv'), 'soc,esco\n');

      const logs = [];
      const result = await prepareSources({ rawRoot: tmp, log: (l) => logs.push(l) });

      expect(result.ok).toBe(false);
      const onet = result.sources.find((s) => s.id === 'onet');
      expect(onet.ok).toBe(false);
      expect(onet.missing).toContain('essential_skills.tsv');
      expect(logs.some((l) => l.includes('PREPARE_INCOMPLETE'))).toBe(true);
    });
  });

  describe('hasUnzip', () => {
    it('returns a boolean', () => {
      expect(typeof hasUnzip()).toBe('boolean');
    });
  });
});
