import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAmpRelevance } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';

const PILOT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../codex/core/pixelbrain/amp-substrate/pilot-relevance',
);

describe('pilot-relevance/ is fully v2', () => {
  it('every JSON record in pilot-relevance/ validates as PB-AMP-RELEVANCE-v2', () => {
    const files = readdirSync(PILOT_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const record = JSON.parse(readFileSync(join(PILOT_DIR, file), 'utf8'));
      const { ok, errors } = validateAmpRelevance(record);
      expect(ok, `${file}: ${errors.join('; ')}`).toBe(true);
    }
  });

  it('the 4 item-pipeline pilots keep their real measured predicates', () => {
    const chestplate = JSON.parse(readFileSync(join(PILOT_DIR, 'chestplate-amp.json'), 'utf8'));
    expect(chestplate.pipeline).toBe('item');
    expect(chestplate.order).toBe(8);
    expect(chestplate.appliesTo).toEqual([
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'includes', value: 'chestplate' },
    ]);
  });

  it('symmetry-amp moved to the cross-cutting pipeline', () => {
    const symmetry = JSON.parse(readFileSync(join(PILOT_DIR, 'symmetry-amp.json'), 'utf8'));
    expect(symmetry.pipeline).toBe('cross-cutting');
    expect(symmetry.appliesTo).toEqual([]);
  });

  it('order is unique within each pipeline', () => {
    const files = readdirSync(PILOT_DIR).filter((f) => f.endsWith('.json'));
    const byPipeline = new Map();
    for (const file of files) {
      const r = JSON.parse(readFileSync(join(PILOT_DIR, file), 'utf8'));
      const seen = byPipeline.get(r.pipeline) ?? new Set();
      expect(seen.has(r.order), `${file}: duplicate order ${r.order} in pipeline ${r.pipeline}`).toBe(false);
      seen.add(r.order);
      byPipeline.set(r.pipeline, seen);
    }
  });
});
