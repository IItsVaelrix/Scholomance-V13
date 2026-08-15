// @vitest-environment node
/**
 * DESCENDING LIGHT — the invariants.
 *
 * The mechanism's whole safety argument is that "lit" MEANS reachable from a
 * spanning root, so it cannot remove a reading that participates in a complete
 * parse. These tests turn that argument into a check, on real charts rather
 * than fixtures.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { composePacked } from '../../../codex/core/constellation/compose-packed.js';
import { parseConllu } from '../../../codex/core/constellation/treebank.js';
import {
  descendFromRoots,
  emitDescendingLight,
  decrypt,
  isLit,
} from '../../../codex/core/constellation/resonance-beacon.js';

const FIXTURES = path.resolve('tests/qa/fixtures/constellation');
const records = parseConllu(readFileSync(path.join(FIXTURES, 'treebank-gate.conllu'), 'utf8'));
const posMap = new Map(Object.entries(JSON.parse(
  readFileSync(path.join(FIXTURES, 'treebank-gate-lexicon.json'), 'utf8'),
)));

/** A modest slice of real parsed sentences — enough to be a property test. */
function parsedCharts(limit = 25) {
  const out = [];
  for (const rec of records) {
    if (out.length >= limit) break;
    const tokens = rec.tokens.map((t) => t.form);
    if (tokens.length === 0 || tokens.length > 20) continue;
    const chart = composePacked(tokens, posMap, { light: true });
    if (chart.stable.length > 0) out.push({ tokens, chart });
  }
  return out;
}

describe('descending light — the invariant', () => {
  it('is OFF by default, so the frozen baseline is untouched', () => {
    const tokens = ['the', 'old', 'man', 'ran'];
    expect(composePacked(tokens, posMap, {}).light).toBeNull();
    expect(composePacked(tokens, posMap, { light: true }).light).not.toBeNull();
  });

  it('changes nothing the chart contains', () => {
    for (const rec of records.slice(0, 60)) {
      const tokens = rec.tokens.map((t) => t.form);
      if (tokens.length === 0 || tokens.length > 20) continue;
      const off = composePacked(tokens, posMap, {});
      const on = composePacked(tokens, posMap, { light: true });
      expect(on.stable.length).toBe(off.stable.length);
      expect(on.spanning.length).toBe(off.spanning.length);
      expect(on.molecules.length).toBe(off.molecules.length);
      expect(on.events).toBe(off.events);
    }
  });

  it('LOSES NO PARSE — every node of every complete derivation is lit', () => {
    // The safety argument, executed. Walk each root's derivations independently
    // of the implementation under test and assert the walk finds nothing dark.
    for (const { chart } of parsedCharts()) {
      const lit = descendFromRoots(chart);
      const stack = [...chart.stable];
      const seen = new Set();
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node || seen.has(node)) continue;
        seen.add(node);
        expect(lit.has(node)).toBe(true);
        for (const d of node.derivations || []) {
          if (d.child) stack.push(d.child);
          if (d.left) stack.push(d.left);
          if (d.right) stack.push(d.right);
        }
      }
      expect(seen.size).toBeGreaterThan(0);
    }
  });

  it('an unlit node is genuinely unreachable from any root', () => {
    // The converse, and the one that catches an over-eager walk: if a node is
    // dark, no root may reach it by any path.
    for (const { chart } of parsedCharts(12)) {
      const lit = descendFromRoots(chart);
      const dark = chart.molecules.filter((m) => !lit.has(m));
      for (const target of dark.slice(0, 15)) {
        const stack = [...chart.stable];
        const seen = new Set();
        let found = false;
        while (stack.length > 0 && !found) {
          const node = stack.pop();
          if (!node || seen.has(node)) continue;
          seen.add(node);
          if (node === target) { found = true; break; }
          for (const d of node.derivations || []) {
            if (d.child) stack.push(d.child);
            if (d.left) stack.push(d.left);
            if (d.right) stack.push(d.right);
          }
        }
        expect(found).toBe(false);
      }
    }
  });

  it('RELABELLING CHANGES NOTHING — reachability is a graph property', () => {
    // Four defects in the sibling reactor were a screen reading a label instead
    // of a structure. Renaming a node's type must not move what is lit.
    for (const { chart } of parsedCharts(10)) {
      const before = descendFromRoots(chart);
      const targets = chart.molecules.filter((m) => !chart.stable.includes(m)).slice(0, 5);
      const originals = targets.map((m) => m.type);
      targets.forEach((m, i) => { m.type = `RELABELLED_${i}`; });
      const after = descendFromRoots(chart);
      targets.forEach((m, i) => { m.type = originals[i]; });

      expect(after.size).toBe(before.size);
      for (const node of before) expect(after.has(node)).toBe(true);
    }
  });

  it('aura decryption agrees with exact identity on the gate corpus', () => {
    // The aura is 32 bits, so a collision would let a dark atom decrypt. This
    // measures it rather than assuming it away.
    let disagreements = 0;
    let checked = 0;
    for (const { chart } of parsedCharts(40)) {
      const payload = emitDescendingLight(chart);
      for (const atom of chart.atoms) {
        checked += 1;
        if (decrypt(atom, payload) !== isLit(atom, payload)) disagreements += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
    expect(disagreements).toBe(0);
  });

  it('a chart with no root emits an empty payload rather than throwing', () => {
    const payload = emitDescendingLight({ stable: [] });
    expect(payload.litCells).toBe(0);
    expect(payload.auras.size).toBe(0);
    expect(decrypt({ type: 'N', from: 0, to: 0 }, payload)).toBe(false);
  });
});
