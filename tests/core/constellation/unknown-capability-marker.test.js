/**
 * Unknown capability markers.
 *
 * Production change that would make these fail: looking up BONDS to decide
 * whether an unknown can answer, skipping typeless seeds, or treating
 * irradiance-alone as capability (almost every silent atom already hears).
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import {
  SEEKING,
  annotateUnknownCapabilities,
  markUnknownReceiver,
  seedUnknownReceiver,
} from '../../../codex/core/constellation/unknown-capability-marker.js';

const require = createRequire(import.meta.url);
const markerSource = require('fs').readFileSync(
  require('path').resolve('codex/core/constellation/unknown-capability-marker.js'),
  'utf8',
);

function atom(partial) {
  return {
    type: 'N',
    from: 0,
    to: 0,
    token: 'x',
    charge: 0,
    light: { aura: 'aura-x', from: 0, to: 0, energy: 1 },
    nucleus: { aura: 'aura-x' },
    chloroplast: { irradiance: 0, voltage: 0, cells: [] },
    ingested: { energy: 0, reactions: [] },
    ...partial,
  };
}

function fieldOf(slots) {
  return slots.map((atoms, index) => ({
    token: atoms[0]?.token ?? `t${index}`,
    index,
    types: [...new Set(atoms.map((a) => a.type).filter(Boolean))],
    atoms,
  }));
}

describe('unknown capability markers', () => {
  it('does not import the bond table — capability is table-blind', () => {
    expect(markerSource).not.toMatch(/from ['"]\.\/compose\.js['"]/);
    expect(markerSource).not.toMatch(/from ['"]\.\/bond-admission\.js['"]/);
    expect(markerSource).not.toMatch(/from ['"]\.\/grimoire/);
  });

  it('seeds a typeless receiver so an empty slot can answer the phone', () => {
    const seed = seedUnknownReceiver('governor', 4);
    expect(seed.type).toBeNull();
    expect(seed.unknown).toBe(true);
    expect(seed.from).toBe(4);
    expect(seed.to).toBe(4);
    expect(seed.nucleus.kind).toBe('unknown');
    expect(seed.nucleus.aura).toMatch(/^aura1:/);
    expect(seed.nucleus.lemmas).toContain('governor');
  });

  it('marks a deaf unknown as incapable', () => {
    const unknown = seedUnknownReceiver('???', 1);
    const chart = { field: fieldOf([[atom({ from: 0, type: 'DET', token: 'the' })], []]) };
    chart.field[1].atoms = [];
    const marked = markUnknownReceiver(unknown, chart.field);
    expect(marked.capable).toBe(false);
    expect(marked.tags).toContain('deaf');
    expect(marked.id).toMatch(/^cap1:/);
  });

  it('marks capable when a seeking known neighbor is heard on the facing side', () => {
    const caller = atom({
      type: 'DET',
      from: 0,
      token: 'the',
      charge: 1.2,
      light: { aura: 'aura-det', from: 0, to: 0, energy: 1 },
      nucleus: { aura: 'aura-det' },
    });
    const unknown = seedUnknownReceiver('cat', 1);
    unknown.chloroplast = {
      irradiance: 0.5,
      voltage: 0,
      cells: [{ aura: 'aura-det', from: 0, to: 0, irradiance: 0.5, voltage: 0 }],
    };
    const field = fieldOf([[caller], [unknown]]);
    const marked = markUnknownReceiver(unknown, field);
    expect(SEEKING.DET).toBe('right');
    expect(marked.capable).toBe(true);
    expect(marked.tags).toEqual(expect.arrayContaining(['hears', 'left-socket', 'answer:DET:right']));
    expect(marked.reason).toBe('heard-seeking-call');
  });

  it('does not mark capable for a non-seeking known neighbor even if heard', () => {
    const caller = atom({
      type: 'N',
      from: 0,
      token: 'cat',
      light: { aura: 'aura-n', from: 0, to: 0, energy: 1 },
      nucleus: { aura: 'aura-n' },
    });
    const unknown = seedUnknownReceiver('zzz', 1);
    unknown.chloroplast = {
      irradiance: 0.4,
      voltage: 0,
      cells: [{ aura: 'aura-n', from: 0, to: 0, irradiance: 0.4, voltage: 0 }],
    };
    const marked = markUnknownReceiver(unknown, fieldOf([[caller], [unknown]]));
    expect(marked.capable).toBe(false);
    expect(marked.tags).toContain('hears');
    expect(marked.tags).not.toContain('answer:N:right');
    expect(marked.reason).toBe('no-seeking-neighbor');
  });

  it('lets a silent typed unknown answer if it seeks toward a heard known', () => {
    const known = atom({
      type: 'N',
      from: 1,
      token: 'governor',
      ingested: { energy: 1, reactions: [{ aura: 'x', from: 0, energy: 1 }] },
      light: { aura: 'aura-n', from: 1, to: 1, energy: 1 },
      nucleus: { aura: 'aura-n' },
    });
    const silent = atom({
      type: 'SUB',
      from: 0,
      token: 'as',
      ingested: { energy: 0, reactions: [] },
      light: { aura: 'aura-sub', from: 0, to: 0, energy: 1 },
      nucleus: { aura: 'aura-sub' },
      chloroplast: {
        irradiance: 0.3,
        voltage: 0,
        cells: [{ aura: 'aura-n', from: 1, to: 1, irradiance: 0.3, voltage: 0 }],
      },
    });
    const marked = markUnknownReceiver(silent, fieldOf([[silent], [known]]));
    expect(SEEKING.SUB).toBe('right');
    expect(marked.capable).toBe(true);
    expect(marked.tags).toContain('answer:SUB:right');
  });

  it('annotates atomless slots with a seeded receiver and does not invent a bond', () => {
    const chart = composePacked(['the', 'qzxqzx'], new Map([
      ['the', ['x']],
    ]), { seedLawfulUnknowns: false });
    const report = annotateUnknownCapabilities(chart);
    expect(report.seeded).toBeGreaterThan(0);
    const hole = report.field.find((slot) => slot.token === 'qzxqzx');
    expect(hole.unknownReceiver).toBeTruthy();
    expect(hole.unknownReceiver.type).toBeNull();
    expect(hole.unknownReceiver.capability).toBeTruthy();
    expect(hole.unknownReceiver.capability.id).toMatch(/^cap1:/);
    expect(chart.molecules.some((m) => m.type == null)).toBe(false);
  });

  it('gives the same epitope id to two holes that heard the same seeking call', () => {
    const caller = atom({
      type: 'DET',
      from: 0,
      token: 'a',
      light: { aura: 'aura-det', from: 0, to: 0, energy: 1 },
      nucleus: { aura: 'aura-det' },
    });
    const a = seedUnknownReceiver('one', 1);
    const b = seedUnknownReceiver('two', 1);
    const cells = [{ aura: 'aura-det', from: 0, to: 0, irradiance: 0.5, voltage: 0 }];
    a.chloroplast = { irradiance: 0.5, voltage: 0, cells };
    b.chloroplast = { irradiance: 0.5, voltage: 0, cells };
    const fieldA = fieldOf([[caller], [a]]);
    const fieldB = fieldOf([[caller], [b]]);
    expect(markUnknownReceiver(a, fieldA).id).toBe(markUnknownReceiver(b, fieldB).id);
  });
});
