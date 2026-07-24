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
      await writeFile(join(onetDir, 'Skill.txt'), 'skill data\n');
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
      expect(onet.mapped.length).toBeGreaterThan(0);

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
      // Missing: Skill.txt → occupation_skills.tsv
      await writeFile(join(escoDir, 'occupations_en.csv'), 'conceptUri\n');
      await writeFile(join(escoDir, 'skills_en.csv'), 'conceptUri\n');
      await writeFile(join(escoDir, 'occupation_skills_en.csv'), 'occ,skill\n');
      await writeFile(join(xwalkDir, 'onet-esco-crosswalk.csv'), 'soc,esco\n');

      const logs = [];
      const result = await prepareSources({ rawRoot: tmp, log: (l) => logs.push(l) });

      expect(result.ok).toBe(false);
      const onet = result.sources.find((s) => s.id === 'onet');
      expect(onet.ok).toBe(false);
      expect(onet.missing).toContain('occupation_skills.tsv');
      expect(logs.some((l) => l.includes('PREPARE_INCOMPLETE'))).toBe(true);
    });
  });

  describe('hasUnzip', () => {
    it('returns a boolean', () => {
      expect(typeof hasUnzip()).toBe('boolean');
    });
  });
});
