/**
 * Selector (PDR §3.1 F4).
 *
 * The predicates under test are not invented for the test — each mirrors an AMP's
 * real, measured gate as it exists in the tree today, e.g. shield-rim-amp's
 * `if (spec.class !== 'armor' || spec.archetype !== 'kite_shield') return template;`
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { selectActiveAmps, selectAndLog, SELECTOR_VERSION } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.js';
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
    ampId: record.ampId,
    appliesToJson: JSON.stringify(record.appliesTo ?? []),
    requiresJson: JSON.stringify(record.requires ?? []),
  };
}

const CHESTPLATE = asRow(createAmpRelevanceRecord({
  ampId: 'chestplate-amp',
  version: '1.0.0',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'includes', value: 'chestplate' },
  ],
}));

const SHIELD_RIM = asRow(createAmpRelevanceRecord({
  ampId: 'shield-rim-amp',
  version: '1.0.0',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'eq', value: 'kite_shield' },
  ],
}));

const HOLYFIRE = asRow(createAmpRelevanceRecord({
  ampId: 'holyfire-motif-amp',
  version: '1.0.0',
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

const SYMMETRY = asRow(createAmpRelevanceRecord({ ampId: 'symmetry-amp', version: '1.0.0' }));

const HAIR = asRow(createAmpRelevanceRecord({
  ampId: 'hair-flow-amp',
  version: '1.0.0',
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
    const { activated, skipped } = selectActiveAmps(CHESTPLATE_SPEC, ALL);
    expect(activated).toEqual(['chestplate-amp', 'symmetry-amp']);
    expect(skipped.map((s) => s.ampId).sort()).toEqual(['hair-flow-amp', 'holyfire-motif-amp', 'shield-rim-amp']);
  });

  it('distinguishes two archetypes under the same class — kite shield, not chestplate', () => {
    const { activated } = selectActiveAmps(KITESHIELD_SPEC, ALL);
    expect(activated).toEqual(['shield-rim-amp', 'symmetry-amp']);
    expect(activated).not.toContain('chestplate-amp');
  });

  it('resolves an anyOf disjunction across array-element paths (holyfire)', () => {
    expect(selectActiveAmps(HOLYSWORD_SPEC, ALL).activated).toEqual(['holyfire-motif-amp', 'symmetry-amp']);
    // Same class and archetype, but no holy-fire part — the disjunction must fail.
    expect(selectActiveAmps(PLAIN_SWORD_SPEC, ALL).activated).toEqual(['symmetry-amp']);
  });

  it('matches an anyOf branch on part id alone, not just profile', () => {
    const byIdOnly = { class: 'weapon', archetype: 'sword', parts: [{ id: 'holy_fire' }] };
    expect(selectActiveAmps(byIdOnly, ALL).activated).toContain('holyfire-motif-amp');
  });

  it('honours requires: hair-flow-amp activates only when the spec actually has hair', () => {
    expect(selectActiveAmps(CHARACTER_SPEC, ALL).activated).toContain('hair-flow-amp');

    const skipped = selectActiveAmps(CHESTPLATE_SPEC, ALL).skipped;
    const hairSkip = skipped.find((s) => s.ampId === 'hair-flow-amp');
    expect(hairSkip.reason).toMatch(/requires 'hair\.profile'/);
  });

  it('an empty appliesTo means always relevant — symmetry-amp activates on every spec', () => {
    for (const spec of [CHESTPLATE_SPEC, KITESHIELD_SPEC, HOLYSWORD_SPEC, CHARACTER_SPEC, {}]) {
      expect(selectActiveAmps(spec, ALL).activated).toContain('symmetry-amp');
    }
  });

  it('returns an empty activation rather than throwing when nothing matches', () => {
    const result = selectActiveAmps({ class: 'nonexistent' }, [CHESTPLATE, SHIELD_RIM]);
    expect(result.activated).toEqual([]);
    expect(result.skipped).toHaveLength(2);
  });

  it('every skipped AMP carries a reason', () => {
    const { skipped } = selectActiveAmps(CHESTPLATE_SPEC, ALL);
    expect(skipped.length).toBeGreaterThan(0);
    for (const entry of skipped) expect(entry.reason).toBeTruthy();
  });

  it('is deterministic: 100 iterations, byte-identical result, regardless of record order', () => {
    const first = JSON.stringify(selectActiveAmps(HOLYSWORD_SPEC, ALL));
    for (let i = 0; i < 100; i += 1) {
      const shuffled = [...ALL].sort(() => (i % 2 === 0 ? 1 : -1));
      expect(JSON.stringify(selectActiveAmps(HOLYSWORD_SPEC, shuffled))).toBe(first);
    }
  });

  it('reports a spec checksum and the selector version', () => {
    const result = selectActiveAmps(CHESTPLATE_SPEC, ALL);
    expect(result.specChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(result.selectorVersion).toBe(SELECTOR_VERSION);
  });

  it('an unknown op never matches — a broken predicate must not activate an AMP', () => {
    const rogue = { ampId: 'rogue-amp', appliesToJson: JSON.stringify([{ field: 'class', op: 'wat', value: 'armor' }]), requiresJson: '[]' };
    expect(selectActiveAmps(CHESTPLATE_SPEC, [rogue]).activated).toEqual([]);
  });

  it('treats matches as a literal whole-value comparison, never a caller-supplied regular expression', () => {
    const literal = {
      ampId: 'literal-amp',
      appliesToJson: JSON.stringify([{ field: 'archetype', op: 'matches', value: '^void_chestplate$' }]),
      requiresJson: '[]',
    };

    expect(selectActiveAmps(CHESTPLATE_SPEC, [literal]).activated).toEqual([]);
    expect(selectActiveAmps({ archetype: '^void_chestplate$' }, [literal]).activated).toEqual(['literal-amp']);
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
      appliesTo: [{ field: 'class', op: 'eq', value: 'armor' }],
    }));
    await registerAmpRelevance(db, createAmpRelevanceRecord({ ampId: 'symmetry-amp', version: '1.0.0' }));

    const records = await listAmpRelevance(db);
    const result = await selectAndLog(db, { class: 'weapon' }, records);

    expect(result.activated).toEqual(['symmetry-amp']);

    const log = await readActivationLog(db, 1);
    expect(log).toHaveLength(1);
    expect(log[0].specChecksum).toBe(result.specChecksum);
    expect(JSON.parse(log[0].activatedJson)).toEqual(['symmetry-amp']);
    expect(JSON.parse(log[0].skippedJson)[0].ampId).toBe('chestplate-amp');
    expect(log[0].selectorVersion).toBe(SELECTOR_VERSION);
  });
});
