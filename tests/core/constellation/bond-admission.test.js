/**
 * Bond admission must be independent of agenda direction.
 *
 * The packed chart pairs a dequeued node as LEFT and as RIGHT. Receptors that
 * live in only one of those loops make the forest a function of pop order.
 * This file is the lock: every receptor-sensitive bond is offered both ways,
 * and the two forests must be the same object.
 *
 * Production change that would make these fail: deleting the receptor check
 * from the right-half pairing path in composePacked (the original leak).
 */
import { describe, it, expect } from 'vitest';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { compose } from '../../../codex/core/constellation/compose.js';
import { admitBond } from '../../../codex/core/constellation/bond-admission.js';

const URANIUM = new Map([
  ['pebble', ['n']],
  ['old', ['a']],
  ['uranium', ['n', 'v', 'a', 'r']],
  ['quickly', ['r']],
]);

function adjunctSBonds(chart) {
  const hits = [];
  for (const m of chart.molecules) {
    for (const d of m.derivations || []) {
      if (!d.bond) continue;
      if (d.bond[0] === 'ADJ' && d.bond[1] === 'S' && d.bond[2] === 'S') {
        hits.push({
          leftFrom: d.left.from,
          leftTo: d.left.to,
          rightFrom: d.right.from,
          rightTo: d.right.to,
          resultFrom: m.from,
          resultTo: m.to,
        });
      }
    }
  }
  return hits;
}

function forestSignature(chart) {
  return chart.molecules.map((m) => {
    const derivs = (m.derivations || []).map((d) => {
      if (d.lift) return `L:${d.child.type}->${m.type}`;
      const b = d.bond;
      return `B:${b[0]}+${b[1]}->${b[2]}@${d.left.from}-${d.left.to}|${d.right.from}-${d.right.to}`;
    }).sort();
    return `${m.from}:${m.to}:${m.type}{${derivs.join(';')}}`;
  }).sort();
}

function classicAdjunctS(chart) {
  const hits = [];
  for (const m of chart.molecules) {
    if (m.type !== 'S' || !m.parts || m.parts.length !== 2) continue;
    if (m.parts[0].type === 'ADJ' && m.parts[1].type === 'S') {
      hits.push({ leftFrom: m.parts[0].from, rightFrom: m.parts[1].from });
    }
  }
  return hits;
}

describe('admitBond — single gate', () => {
  const adjS = ['ADJ', 'S', 'S', 1];

  it('phagocytizes ADJ+S when the adjective is not sentence-initial', () => {
    const left = { type: 'ADJ', from: 1, to: 1 };
    const right = { type: 'S', from: 2, to: 2 };
    expect(admitBond(left, right, adjS)).toEqual({
      ok: false,
      reason: 'adj-s-not-initial',
    });
  });

  it('admits ADJ+S when the adjective starts the sentence', () => {
    const left = { type: 'ADJ', from: 0, to: 0 };
    const right = { type: 'S', from: 1, to: 2 };
    expect(admitBond(left, right, adjS).ok).toBe(true);
  });

  it('phagocytizes an overgrown NP+PART', () => {
    const left = { type: 'NP', from: 0, to: 0 };
    const right = { type: 'PART', from: 1, to: 9 };
    expect(admitBond(left, right, ['NP', 'PART', 'NP', 0])).toEqual({
      ok: false,
      reason: 'np-part-overgrown',
    });
  });
});

describe('macrophage symmetry — agenda direction', () => {
  /**
   * `pebble old uranium`: ADJ sits at index 1. The receptor says ADJ+S dies
   * unless left.from === 0. A right-path leak lets it live.
   */
  it.each(['stack', 'queue'])(
    'rejects mid-sentence ADJ+S when the agenda is a %s',
    (agenda) => {
      const chart = composePacked(['pebble', 'old', 'uranium'], URANIUM, { agenda });
      const leaked = adjunctSBonds(chart).filter((h) => h.leftFrom !== 0);
      expect(leaked).toEqual([]);
    },
  );

  it('produces the same forest whether the left or the right child is dequeued first', () => {
    const tokens = ['pebble', 'old', 'uranium'];
    const leftFirst = composePacked(tokens, URANIUM, { agenda: 'queue' });
    const rightFirst = composePacked(tokens, URANIUM, { agenda: 'stack' });
    expect(forestSignature(leftFirst)).toEqual(forestSignature(rightFirst));
  });

  it('packed and classic agree that mid-sentence ADJ+S is rejected', () => {
    const tokens = ['pebble', 'old', 'uranium'];
    const packed = adjunctSBonds(composePacked(tokens, URANIUM))
      .filter((h) => h.leftFrom !== 0);
    const classic = classicAdjunctS(compose(tokens, URANIUM))
      .filter((h) => h.leftFrom !== 0);
    expect(packed).toEqual([]);
    expect(classic).toEqual([]);
  });
});
