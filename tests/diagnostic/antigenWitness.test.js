import { describe, expect, it, vi } from 'vitest';
import {
  mutationsFor,
  adjudicate,
  witnessFinding,
  VERDICT,
} from '../../scripts/antigen-witness.mjs';

/**
 * A witness is what upgrades an antigen from a scar the system recites into one
 * it hunts. `antigen-sweep` reports that cleri-probe *believes* a site is sick.
 * Belief is the same currency that produced a 16/16 mutation score against a
 * self-authored mutant set. A witness is the currency that isn't: mutate the
 * cited line, run the tests that cover it, and let the suite answer.
 */
describe('mutationsFor — deterministic, meaning-agnostic source rewrites', () => {
  it('neutralizes a guard so the check it protects can never fire', () => {
    const m = mutationsFor("  if (!ok) errors.push('bad');", 1);
    expect(m.map(x => x.mutated)).toContain("  if (false) errors.push('bad');");
  });

  it('removes a throw so the rejection path disappears', () => {
    const m = mutationsFor('    throw new Error("rejected");', 1);
    expect(m.some(x => !x.mutated.includes('throw'))).toBe(true);
  });

  it('forces a predicate to accept everything', () => {
    const m = mutationsFor('  return typeof v === "string" && allowed.has(v);', 1);
    expect(m.map(x => x.mutated)).toContain('  return true;');
  });

  it('flips a comparison', () => {
    const m = mutationsFor('  const same = a === b;', 1);
    expect(m.map(x => x.mutated)).toContain('  const same = a !== b;');
  });

  it('invents nothing when the line has no mutable operator', () => {
    expect(mutationsFor('  const label = "cognitive-bus";', 1)).toEqual([]);
  });

  it('is deterministic — the same line always yields the same mutants', () => {
    const line = '  if (a === b) throw new Error("x");';
    expect(mutationsFor(line, 1)).toEqual(mutationsFor(line, 1));
  });

  it('preserves indentation so the mutant still parses', () => {
    for (const m of mutationsFor('      if (!ok) return;', 1)) {
      expect(m.mutated.startsWith('      ')).toBe(true);
    }
  });
});

describe('adjudicate — a verdict may never read as clean unless it was earned', () => {
  const green = { passed: true };
  const red = { passed: false };

  it('WITNESSED when the tests pass with the site broken', () => {
    expect(adjudicate({ baseline: green, mutants: [{ label: 'guard', result: green }] }).verdict)
      .toBe(VERDICT.WITNESSED);
  });

  it('PROTECTED when every mutant is killed', () => {
    expect(adjudicate({ baseline: green, mutants: [{ label: 'guard', result: red }] }).verdict)
      .toBe(VERDICT.PROTECTED);
  });

  it('WITNESSED if ANY mutant survives, even when others are killed', () => {
    expect(adjudicate({
      baseline: green,
      mutants: [{ label: 'a', result: red }, { label: 'b', result: green }],
    }).verdict).toBe(VERDICT.WITNESSED);
  });

  it('INCONCLUSIVE when the baseline is already red — the control failed', () => {
    expect(adjudicate({ baseline: red, mutants: [{ label: 'a', result: green }] }).verdict)
      .toBe(VERDICT.INCONCLUSIVE);
  });

  it('INCONCLUSIVE when nothing could be mutated', () => {
    expect(adjudicate({ baseline: green, mutants: [] }).verdict).toBe(VERDICT.INCONCLUSIVE);
  });

  it('never returns PROTECTED without a green baseline and at least one killed mutant', () => {
    for (const bad of [{ baseline: red, mutants: [] }, { baseline: green, mutants: [] }]) {
      expect(adjudicate(bad).verdict).not.toBe(VERDICT.PROTECTED);
    }
  });

  it('carries the surviving mutant as the witness itself, not just a label', () => {
    const w = adjudicate({
      baseline: green,
      mutants: [{ label: 'guard', mutated: 'if (false) x();', result: green }],
    });
    expect(w.witness).toMatchObject({ label: 'guard', mutated: 'if (false) x();' });
  });
});

describe('witnessFinding — the runner', () => {
  const finding = { path: 'codex/core/x.js', line: 2 };
  const source = ['const a = 1;', '  if (!a) throw new Error("no");', 'export default a;'].join('\n');

  it('runs the baseline BEFORE any mutant and reports INCONCLUSIVE if it fails', async () => {
    const order = [];
    const runTests = vi.fn(async (_tests, kind) => {
      order.push(kind);
      return { passed: false };
    });
    const out = await witnessFinding(finding, {
      readSource: () => source, selectTests: () => ['tests/x.test.js'],
      writeSource: () => {}, runTests,
    });
    expect(order[0]).toBe('baseline');
    expect(runTests).toHaveBeenCalledTimes(1);
    expect(out.verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(out.why).toMatch(/baseline/i);
  });

  it('is INCONCLUSIVE — never PROTECTED — when no test covers the file', async () => {
    const out = await witnessFinding(finding, {
      readSource: () => source, selectTests: () => [],
      writeSource: () => {}, runTests: async () => ({ passed: true }),
    });
    expect(out.verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(out.why).toMatch(/no test/i);
  });

  it('always restores the original source, even when a run throws', async () => {
    const writes = [];
    await expect(witnessFinding(finding, {
      readSource: () => source, selectTests: () => ['tests/x.test.js'],
      writeSource: (_p, text) => writes.push(text),
      runTests: async (_t, kind) => { if (kind === 'mutant') throw new Error('boom'); return { passed: true }; },
    })).resolves.toBeTruthy();
    expect(writes.at(-1)).toBe(source);
  });

  it('reports WITNESSED with the surviving mutant when the suite ignores the break', async () => {
    const out = await witnessFinding(finding, {
      readSource: () => source, selectTests: () => ['tests/x.test.js'],
      writeSource: () => {}, runTests: async () => ({ passed: true }),
    });
    expect(out.verdict).toBe(VERDICT.WITNESSED);
    expect(out.witness.mutated).toBeTruthy();
    expect(out.witness.line).toBe(2);
  });
});
