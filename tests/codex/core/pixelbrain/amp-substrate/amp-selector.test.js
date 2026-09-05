/**
 * Selector (PDR §3.1 F4).
 *
 * The predicates under test are not invented for the test — each mirrors an AMP's
 * real, measured gate as it exists in the tree today, e.g. shield-rim-amp's
 * `if (spec.class !== 'armor' || spec.archetype !== 'kite_shield') return template;`
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { selectActiveAmps, SELECTOR_VERSION } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.js';
import { selectAndLog } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.db.js';
import { createAmpRelevanceRecord } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';
import {
  openAmpSubstrate,
  registerAmpRelevance,
  listAmpRelevance,
  readActivationLog,
} from '../../../../../codex/core/pixelbrain/amp-substrate/amp-substrate.db.js';

/** Records in the row shape the db layer hands the selector. */
function asRow(record) {
  return {
    pipeline: record.pipeline ?? 'item',
    ampId: record.ampId,
    order: record.order ?? 0,
    appliesToJson: JSON.stringify(record.appliesTo ?? []),
    requiresJson: JSON.stringify(record.requires ?? []),
  };
}

const CHESTPLATE = asRow(createAmpRelevanceRecord({
  ampId: 'chestplate-amp',
  version: '1.0.0',
  pipeline: 'item',
  order: 5,
  description: 'Adds a chestplate visual to armor items',
  concept: 'armor-chestplate-visualization',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'includes', value: 'chestplate' },
  ],
}));

const SHIELD_RIM = asRow(createAmpRelevanceRecord({
  ampId: 'shield-rim-amp',
  version: '1.0.0',
  pipeline: 'item',
  order: 6,
  description: 'Adds a rim effect to kite shields',
  concept: 'armor-shield-rim',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'eq', value: 'kite_shield' },
  ],
}));

const HOLYFIRE = asRow(createAmpRelevanceRecord({
  ampId: 'holyfire-motif-amp',
  version: '1.0.0',
  pipeline: 'item',
  order: 7,
  description: 'Adds holy fire effects to sword parts',
  concept: 'weapon-holyfire-motif',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'weapon' },
    { field: 'archetype', op: 'eq', value: 'sword' },
    {
      anyOf: [
        { field: 'parts.profile', op: 'eq', value: 'weapon.sword.holyfire_motif' },
        { field: 'parts.id', op: 'eq', value: ['holyFire', 'holy_fire'] },
      ],
    },
  ],
}));

const SYMMETRY = asRow(createAmpRelevanceRecord({
  ampId: 'symmetry-amp',
  version: '1.0.0',
  pipeline: 'cross-cutting',
  order: 1,
  description: 'Applies bilateral symmetry across all pipelines',
  concept: 'cross-cutting-symmetry',
}));

const HAIR = asRow(createAmpRelevanceRecord({
  ampId: 'hair-flow-amp',
  version: '1.0.0',
  pipeline: 'item',
  order: 8,
  description: 'Adds hair flow simulation to items with hair',
  concept: 'item-hair-flow',
  requires: ['hair.profile'],
}));

const ALL = [SYMMETRY, HOLYFIRE, CHESTPLATE, SHIELD_RIM, HAIR];

const CHESTPLATE_SPEC = { class: 'armor', archetype: 'void_chestplate', parts: [{ id: 'body' }] };
const KITESHIELD_SPEC = { class: 'armor', archetype: 'kite_shield', parts: [{ id: 'face' }] };
const HOLYSWORD_SPEC = {
  class: 'weapon',
  archetype: 'sword',
  parts: [{ id: 'blade' }, { id: 'holyFire', profile: 'weapon.sword.holyfire_motif' }],
};
const PLAIN_SWORD_SPEC = { class: 'weapon', archetype: 'sword', parts: [{ id: 'blade' }] };
const CHARACTER_SPEC = { class: 'character', archetype: 'human', hair: { profile: 'character.hair.cometSweep' } };

describe('selectActiveAmps', () => {
  it('activates only the AMPs whose real gate matches — a chestplate spec', () => {
    const { activated, skipped } = selectActiveAmps('item', CHESTPLATE_SPEC, ALL);
    expect(activated).toEqual(['chestplate-amp']);
    expect(skipped.map((s) => s.ampId).sort()).toEqual(['hair-flow-amp', 'holyfire-motif-amp', 'shield-rim-amp']);
  });

  it('distinguishes two archetypes under the same class — kite shield, not chestplate', () => {
    const { activated } = selectActiveAmps('item', KITESHIELD_SPEC, ALL);
    expect(activated).toEqual(['shield-rim-amp']);
    expect(activated).not.toContain('chestplate-amp');
  });

  it('resolves an anyOf disjunction across array-element paths (holyfire)', () => {
    expect(selectActiveAmps('item', HOLYSWORD_SPEC, ALL).activated).toEqual(['holyfire-motif-amp']);
    // Same class and archetype, but no holy-fire part — the disjunction must fail.
    expect(selectActiveAmps('item', PLAIN_SWORD_SPEC, ALL).activated).toEqual([]);
  });

  it('matches an anyOf branch on part id alone, not just profile', () => {
    const byIdOnly = { class: 'weapon', archetype: 'sword', parts: [{ id: 'holy_fire' }] };
    expect(selectActiveAmps('item', byIdOnly, ALL).activated).toContain('holyfire-motif-amp');
  });

  it('honours requires: hair-flow-amp activates only when the spec actually has hair', () => {
    expect(selectActiveAmps('item', CHARACTER_SPEC, ALL).activated).toContain('hair-flow-amp');

    const skipped = selectActiveAmps('item', CHESTPLATE_SPEC, ALL).skipped;
    const hairSkip = skipped.find((s) => s.ampId === 'hair-flow-amp');
    expect(hairSkip.reason).toMatch(/requires 'hair\.profile'/);
  });

  it('an empty appliesTo means always relevant — but only for its pipeline', () => {
    expect(selectActiveAmps('item', CHESTPLATE_SPEC, ALL).activated).not.toContain('symmetry-amp');
    expect(selectActiveAmps('cross-cutting', CHESTPLATE_SPEC, ALL).activated).toContain('symmetry-amp');
  });

  it('returns an empty activation rather than throwing when nothing matches', () => {
    const result = selectActiveAmps('item', { class: 'nonexistent' }, [CHESTPLATE, SHIELD_RIM]);
    expect(result.activated).toEqual([]);
    expect(result.skipped).toHaveLength(2);
  });

  it('every skipped AMP carries a reason', () => {
    const { skipped } = selectActiveAmps('item', CHESTPLATE_SPEC, ALL);
    expect(skipped.length).toBeGreaterThan(0);
    for (const entry of skipped) expect(entry.reason).toBeTruthy();
  });

  it('is deterministic: 100 iterations, byte-identical result, regardless of record order', () => {
    const first = JSON.stringify(selectActiveAmps('item', HOLYSWORD_SPEC, ALL));
    for (let i = 0; i < 100; i += 1) {
      const shuffled = [...ALL].sort(() => (i % 2 === 0 ? 1 : -1));
      expect(JSON.stringify(selectActiveAmps('item', HOLYSWORD_SPEC, shuffled))).toBe(first);
    }
  });

  it('reports a spec checksum, selector version, and pipeline', () => {
    const result = selectActiveAmps('item', CHESTPLATE_SPEC, ALL);
    expect(result.specChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.selectorVersion).toBe(SELECTOR_VERSION);
    expect(result.pipeline).toBe('item');
  });

  it('an unknown op never matches — a broken predicate must not activate an AMP', () => {
    const rogue = { pipeline: 'item', ampId: 'rogue-amp', order: 0, appliesToJson: JSON.stringify([{ field: 'class', op: 'wat', value: 'armor' }]), requiresJson: '[]' };
    expect(selectActiveAmps('item', CHESTPLATE_SPEC, [rogue]).activated).toEqual([]);
  });

  it('treats matches as a literal whole-value comparison, never a caller-supplied regular expression', () => {
    const literal = {
      pipeline: 'item',
      ampId: 'literal-amp',
      order: 0,
      appliesToJson: JSON.stringify([{ field: 'archetype', op: 'matches', value: '^void_chestplate$' }]),
      requiresJson: '[]',
    };

    expect(selectActiveAmps('item', CHESTPLATE_SPEC, [literal]).activated).toEqual([]);
    expect(selectActiveAmps('item', { archetype: '^void_chestplate$' }, [literal]).activated).toEqual(['literal-amp']);
  });
});

describe('pipeline scoping', () => {
  const ITEM_RECORDS = [
    { pipeline: 'item', ampId: 'region-fill-amp', order: 10, appliesToJson: '[]', requiresJson: '[]' },
    { pipeline: 'item', ampId: 'chestplate-amp', order: 8,
      appliesToJson: JSON.stringify([{ field: 'class', op: 'eq', value: 'armor' }]), requiresJson: '[]' },
    { pipeline: 'item', ampId: 'noise-fill-amp', order: 11,
      appliesToJson: '[]', requiresJson: JSON.stringify(['parts.noise']) },
  ];
  const CROSS_CUTTING_RECORDS = [
    { pipeline: 'cross-cutting', ampId: 'symmetry-amp', order: 1, appliesToJson: '[]', requiresJson: '[]' },
  ];

  it('only evaluates records whose pipeline matches the argument', () => {
    const result = selectActiveAmps('item', { class: 'armor', parts: [] }, [...ITEM_RECORDS, ...CROSS_CUTTING_RECORDS]);
    expect(result.activated).not.toContain('symmetry-amp');
    expect(result.pipeline).toBe('item');
  });

  it('activated is sorted by order, not ampId', () => {
    const result = selectActiveAmps('item', { class: 'armor', parts: [{ id: 'p1', noise: { contract: 'PB-NOISE-v1' } }] }, ITEM_RECORDS);
    expect(result.activated).toEqual(['chestplate-amp', 'region-fill-amp', 'noise-fill-amp']);
  });
});

describe('selectAndLog', () => {
  let db;
  beforeEach(async () => { db = await openAmpSubstrate(':memory:'); });
  afterEach(async () => { await db?.close(); });

  it('records every decision, so "why didn\'t it run" is a query and not an investigation', async () => {
    await registerAmpRelevance(db, createAmpRelevanceRecord({
      ampId: 'chestplate-amp',
      version: '1.0.0',
      pipeline: 'item',
      order: 5,
      description: 'Adds a chestplate visual to armor items',
      concept: 'armor-chestplate-visualization',
      appliesTo: [{ field: 'class', op: 'eq', value: 'armor' }],
    }));
    await registerAmpRelevance(db, createAmpRelevanceRecord({
      ampId: 'symmetry-amp',
      version: '1.0.0',
      pipeline: 'cross-cutting',
      order: 1,
      description: 'Applies bilateral symmetry across all pipelines',
      concept: 'cross-cutting-symmetry',
    }));

    const records = await listAmpRelevance(db);
    const result = await selectAndLog(db, 'item', { class: 'weapon' }, records);

    expect(result.activated).toEqual([]);

    const log = await readActivationLog(db, 1);
    expect(log).toHaveLength(1);
    expect(log[0].specChecksum).toBe(result.specChecksum);
    expect(JSON.parse(log[0].activatedJson)).toEqual([]);
    expect(JSON.parse(log[0].skippedJson)[0].ampId).toBe('chestplate-amp');
    expect(log[0].selectorVersion).toBe(SELECTOR_VERSION);
  });
});
