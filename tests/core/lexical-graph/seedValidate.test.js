import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { validateSeed } from '../../../codex/core/lexical-graph/seedValidate.js';

const SEED_PATH = path.resolve(__dirname, '../../../codex/data/literary-devices/seed.v1.json');
const CONFUSE_SET = ['antithesis', 'juxtaposition', 'paradox', 'oxymoron'];

function baseDevice(overrides = {}) {
  return {
    slug: 'antithesis',
    name: 'Antithesis',
    aliases: ['antithetical pairing'],
    definition: 'Opposing ideas in parallel structure.',
    definitionsProvenance: [{ source: 'Scholomance craft notes', license: 'Project' }],
    detectionSignals: [
      {
        id: 'antithesis.semantic_opposition',
        kind: 'semantic_opposition',
        description: 'Opposing ideas in parallel structure',
        weight: 1,
        parameters: { requireParallelism: true },
        scope: 'line',
      },
    ],
    purposes: [{ id: 'contrast', description: 'Sharpen opposition' }],
    compatibleStructures: ['couplet'],
    examples: [{ text: 'It was the best of times, it was the worst of times.', license: 'Public Domain' }],
    relations: [],
    ...overrides,
  };
}

function baseSeed(devices) {
  return { seedVersion: '1', devices };
}

describe('[Core] lexical-graph seedValidate', () => {
  it('accepts a well-formed minimal seed and returns it unmodified', () => {
    const seed = baseSeed([baseDevice()]);
    expect(validateSeed(seed)).toBe(seed);
  });

  it('throws PB-ERR-v1-VALUE when an example is missing a license', () => {
    const seed = baseSeed([
      baseDevice({ examples: [{ text: 'It was the best of times, it was the worst of times.' }] }),
    ]);
    expect(() => validateSeed(seed)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => validateSeed(seed)).toThrow(/examples\[0\]\.license/);
  });

  it('throws PB-ERR-v1-VALUE when definitionsProvenance is missing a license', () => {
    const seed = baseSeed([baseDevice({ definitionsProvenance: [{ source: 'Scholomance craft notes' }] })]);
    expect(() => validateSeed(seed)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => validateSeed(seed)).toThrow(/definitionsProvenance\[0\]\.license/);
  });

  it('throws PB-ERR-v1-VALUE when a detection signal is missing kind', () => {
    const seed = baseSeed([
      baseDevice({
        detectionSignals: [
          { id: 'antithesis.x', description: 'x', weight: 1, parameters: {} },
        ],
      }),
    ]);
    expect(() => validateSeed(seed)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => validateSeed(seed)).toThrow(/detectionSignals\[0\]\.kind/);
  });

  it('throws PB-ERR-v1-VALUE when a detection signal is missing parameters', () => {
    const seed = baseSeed([
      baseDevice({
        detectionSignals: [
          { id: 'antithesis.x', kind: 'semantic_opposition', description: 'x', weight: 1 },
        ],
      }),
    ]);
    expect(() => validateSeed(seed)).toThrow(/PB-ERR-v1-VALUE/);
    expect(() => validateSeed(seed)).toThrow(/detectionSignals\[0\]\.parameters/);
  });

  it('throws PB-ERR-v1-VALUE when a detection signal kind is unrecognized', () => {
    const seed = baseSeed([
      baseDevice({
        detectionSignals: [
          { id: 'antithesis.x', kind: 'not_a_real_kind', description: 'x', weight: 1, parameters: {} },
        ],
      }),
    ]);
    expect(() => validateSeed(seed)).toThrow(/DetectionSignalKind/);
  });

  it('throws PB-ERR-v1-VALUE when a relation strength is out of bounds', () => {
    const seed = baseSeed([
      baseDevice({ slug: 'antithesis', relations: [{ targetSlug: 'juxtaposition', relation: 'commonly_confused_with', strength: 1.5 }] }),
      baseDevice({ slug: 'juxtaposition', name: 'Juxtaposition' }),
    ]);
    expect(() => validateSeed(seed)).toThrow(/strength/);
  });

  it('throws PB-ERR-v1-VALUE when a relation targets an unknown device slug', () => {
    const seed = baseSeed([
      baseDevice({ relations: [{ targetSlug: 'nonexistent-device', relation: 'related_device', strength: 0.5 }] }),
    ]);
    expect(() => validateSeed(seed)).toThrow(/unknown device slug/);
  });

  it('rejects contrasts_with between confuse-set members', () => {
    const seed = baseSeed([
      baseDevice({ slug: 'antithesis', relations: [{ targetSlug: 'juxtaposition', relation: 'contrasts_with', strength: 0.5 }] }),
      baseDevice({ slug: 'juxtaposition', name: 'Juxtaposition' }),
    ]);
    expect(() => validateSeed(seed)).toThrow(/contrasts_with is not allowed within the/);
  });

  it('allows commonly_confused_with between confuse-set members', () => {
    const seed = baseSeed([
      baseDevice({ slug: 'antithesis', relations: [{ targetSlug: 'juxtaposition', relation: 'commonly_confused_with', strength: 0.5 }] }),
      baseDevice({ slug: 'juxtaposition', name: 'Juxtaposition' }),
    ]);
    expect(() => validateSeed(seed)).not.toThrow();
  });

  it('rejects duplicate device slugs', () => {
    const seed = baseSeed([baseDevice(), baseDevice()]);
    expect(() => validateSeed(seed)).toThrow(/duplicate device slug/);
  });

  describe('committed seed.v1.json', () => {
    const raw = JSON.parse(readFileSync(SEED_PATH, 'utf8'));

    it('validates successfully', () => {
      expect(() => validateSeed(raw)).not.toThrow();
    });

    it('contains all ten minimum devices', () => {
      const slugs = raw.devices.map((d) => d.slug).sort();
      expect(slugs).toEqual(
        [
          'antithesis',
          'anaphora',
          'juxtaposition',
          'metaphor',
          'oxymoron',
          'paradox',
          'personification',
          'refrain',
          'simile',
          'volta',
        ].sort(),
      );
    });

    it('never asserts contrasts_with within the antithesis/juxtaposition/paradox/oxymoron confuse-set', () => {
      for (const device of raw.devices) {
        if (!CONFUSE_SET.includes(device.slug)) continue;
        for (const relation of device.relations ?? []) {
          if (CONFUSE_SET.includes(relation.targetSlug)) {
            expect(relation.relation).toBe('commonly_confused_with');
          }
        }
      }
    });

    it('every example carries a license', () => {
      for (const device of raw.devices) {
        for (const example of device.examples) {
          expect(typeof example.license).toBe('string');
          expect(example.license.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('every definitionsProvenance entry carries a license', () => {
      for (const device of raw.devices) {
        for (const provenance of device.definitionsProvenance) {
          expect(typeof provenance.license).toBe('string');
          expect(provenance.license.trim().length).toBeGreaterThan(0);
        }
      }
    });
  });
});
