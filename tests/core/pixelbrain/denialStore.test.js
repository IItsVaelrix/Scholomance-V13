import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendDenial,
  readDenials,
  verifyDenials,
  check,
  retirements,
  normaliseDenial,
  GROUNDS,
} from '../../../codex/core/pixelbrain/calibration/denial-store.js';

let dir;
let path;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deny-'));
  path = join(dir, 'denials.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const VALID = {
  idea: 'route sense disambiguation through whole-text semantic similarity',
  mechanism:
    'semanticTopographicSimilarity answers "noun" 3 times in 4 on a balanced set, so it is a ' +
    'class-biased constant, not a discriminator',
  evidence: '8/16 = 50% on 16 PP-attachment minimal pairs; chance is 50%',
  grounds: 'MEASURED',
  scope: 'codex/core/semantic/semantotopography.js',
  unbindsIf: 'a per-class breakdown shows above-chance accuracy on BOTH attachment classes',
  proposer: 'vaelrix',
};

describe('denial-store — the record', () => {
  it('appends a denial and reads it back with a checksum', () => {
    const row = appendDenial(VALID, path);
    expect(row.id).toBe('DENY-0001');
    expect(row.checksum).toMatch(/^deny1:[0-9a-f]{16}$/);

    const rows = readDenials(path);
    expect(rows).toHaveLength(1);
    expect(rows[0].mechanism).toContain('class-biased constant');
  });

  it('is append-only: a second write does not disturb the first byte range', () => {
    appendDenial(VALID, path);
    const afterFirst = readFileSync(path, 'utf8');
    appendDenial({ ...VALID, idea: 'a different idea entirely' }, path);
    const afterSecond = readFileSync(path, 'utf8');

    expect(afterSecond.startsWith(afterFirst)).toBe(true);
    expect(readDenials(path).map((r) => r.id)).toEqual(['DENY-0001', 'DENY-0002']);
  });

  it('defaults the date to today in absolute form, never a relative phrase', () => {
    const row = appendDenial({ ...VALID, date: undefined }, path);
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns an empty list rather than throwing when nothing has been recorded', () => {
    expect(existsSync(path)).toBe(false);
    expect(readDenials(path)).toEqual([]);
  });
});

describe('denial-store — validation refuses instead of defaulting', () => {
  it('refuses a denial with no mechanism', () => {
    expect(() => normaliseDenial({ ...VALID, mechanism: '   ' })).toThrow(/"mechanism" is required/);
  });

  it('refuses a mechanism that merely restates the idea', () => {
    expect(() => normaliseDenial({ ...VALID, mechanism: VALID.idea.toUpperCase() })).toThrow(
      /restates "idea"/,
    );
  });

  it('refuses MEASURED and ARCHITECTURAL grounds with no scope', () => {
    for (const grounds of ['MEASURED', 'ARCHITECTURAL']) {
      expect(() => normaliseDenial({ ...VALID, grounds, scope: '' })).toThrow(/requires "scope"/);
    }
  });

  it('allows JUDGEMENT with no scope — a stance has nothing to go stale against', () => {
    const row = normaliseDenial({ ...VALID, grounds: 'JUDGEMENT', scope: '' });
    expect(row.grounds).toBe('JUDGEMENT');
    expect(row.scope).toBeNull();
  });

  it('refuses an unknown grounds rather than coercing it to a plausible one', () => {
    expect(() => normaliseDenial({ ...VALID, grounds: 'probably' })).toThrow(/must be one of/);
    expect(GROUNDS).toEqual(['MEASURED', 'ARCHITECTURAL', 'JUDGEMENT']);
  });

  it('refuses a relative or malformed date', () => {
    expect(() => normaliseDenial({ ...VALID, date: 'yesterday' })).toThrow(/absolute YYYY-MM-DD/);
  });

  it('records unstated provenance as "unstated", not as a guess', () => {
    expect(normaliseDenial({ ...VALID, proposer: undefined }).proposer).toBe('unstated');
    expect(normaliseDenial({ ...VALID, unbindsIf: undefined }).unbindsIf).toBeNull();
  });

  it('refuses a malformed row on read instead of silently skipping it', () => {
    appendDenial(VALID, path);
    writeFileSync(path, readFileSync(path, 'utf8') + '{not json}\n', 'utf8');
    expect(() => readDenials(path)).toThrow(/malformed row/);
  });
});

describe('denial-store — verification detects post-hoc editing', () => {
  it('passes on an untouched ledger', () => {
    appendDenial(VALID, path);
    appendDenial({ ...VALID, idea: 'second idea' }, path);
    expect(verifyDenials(path)).toEqual({ total: 2, tampered: [] });
  });

  it('flags a row whose evidence was edited after writing', () => {
    appendDenial(VALID, path);
    const row = JSON.parse(readFileSync(path, 'utf8').trim());
    row.evidence = 'actually the numbers were fine';
    writeFileSync(path, JSON.stringify(row) + '\n', 'utf8');

    const { tampered } = verifyDenials(path);
    expect(tampered).toHaveLength(1);
    expect(tampered[0].id).toBe('DENY-0001');
    expect(tampered[0].recorded).not.toBe(tampered[0].recomputed);
  });
});

describe('denial-store — retirement is a new row, never a deletion', () => {
  it('retires a denial while leaving the original in the ledger', () => {
    appendDenial(VALID, path);
    const retirement = appendDenial(
      {
        idea: 'RETIRES DENY-0001',
        mechanism: 'the per-class breakdown now clears chance on both classes',
        evidence: 'rerun after the v2 engine landed: 13/16, 6/8 per class',
        grounds: 'MEASURED',
        scope: 'codex/core/semantic/semantotopography.js @ v2',
        retires: 'DENY-0001',
      },
      path,
    );

    expect(readDenials(path)).toHaveLength(2);
    expect(retirements(path).get('DENY-0001').id).toBe(retirement.id);
  });

  it('refuses to retire a denial that does not exist', () => {
    expect(() =>
      appendDenial({ ...VALID, retires: 'DENY-9999' }, path),
    ).toThrow(/not in the ledger/);
  });
});

describe('check() is retrieval, and says so by behaviour', () => {
  it('surfaces a prior denial that shares vocabulary', () => {
    appendDenial(VALID, path);
    const { searched, candidates } = check(
      'use semantic similarity over the whole text to disambiguate senses',
      path,
    );
    expect(searched).toBe(1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].row.id).toBe('DENY-0001');
    expect(candidates[0].shared).toContain('semantic');
  });

  it('DOES NOT surface a restatement with no shared vocabulary — the documented blind spot', () => {
    appendDenial(VALID, path);
    const { candidates } = check(
      'let the reader rank word meanings by how close a passage feels overall',
      path,
    );
    // This is the `melanin` failure mode, asserted rather than hoped away:
    // an empty result is the absence of a lexical match, not evidence of novelty.
    expect(candidates).toHaveLength(0);
  });

  it('excludes retirement rows from collision candidates', () => {
    appendDenial(VALID, path);
    appendDenial(
      {
        idea: 'RETIRES DENY-0001',
        mechanism: 'semantic similarity now clears chance per class',
        evidence: 'rerun 13/16',
        grounds: 'MEASURED',
        scope: 'semantotopography.js v2',
        retires: 'DENY-0001',
      },
      path,
    );
    const { candidates } = check('semantic similarity disambiguation', path);
    expect(candidates.every((c) => !c.row.retires)).toBe(true);
  });

  it('reports an empty ledger as searched:0, distinguishable from "no match"', () => {
    const empty = check('anything at all', path);
    expect(empty.searched).toBe(0);
    expect(empty.candidates).toEqual([]);
  });
});
