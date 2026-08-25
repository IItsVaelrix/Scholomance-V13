import { describe, expect, it } from 'vitest';
import {
  mutationsFor,
  selectTests,
  languageOf,
  VERDICT,
  adjudicate,
} from '../../scripts/antigen-witness.mjs';

/**
 * The witness was born JS-only: `selectTests` looked for `*.test.js`, `runTests`
 * shelled to vitest, and every mutation in `mutationsFor` was JS syntax — `if (`,
 * `throw`, `return x;`, `===`. Pointed at a Python module it returned
 * INCONCLUSIVE, which its own docstring says must never be read as clean.
 *
 * That gap is not cosmetic. `code_lens.py` is the module the cockpit navigates
 * with, and a repair to it could not be witnessed at all — the author would have
 * been the only thing standing behind it, which is the exact currency the
 * witness exists to refuse.
 */
describe('languageOf — the arm is chosen by the file, not by the caller', () => {
  it('routes a .py target to the python arm', () => {
    expect(languageOf('divtube_downloader/tui/services/code_lens.py')).toBe('python');
  });

  it('routes js/ts targets to the javascript arm', () => {
    expect(languageOf('scripts/antigen-witness.mjs')).toBe('javascript');
    expect(languageOf('src/core/scd64/glossary.ts')).toBe('javascript');
  });

  it('returns null for a language it cannot mutate, rather than guessing', () => {
    expect(languageOf('docs/readme.md')).toBeNull();
  });
});

describe('mutationsFor — python rewrites, meaning-agnostic like the js ones', () => {
  it('neutralizes a guard so the branch it protects can never be taken', () => {
    const m = mutationsFor('    if paren_depth == 0:', 1, 'python');
    expect(m.map((x) => x.mutated)).toContain('    if False:');
  });

  it('neutralizes an elif as readily as an if', () => {
    const m = mutationsFor('        elif ch in ")]}":', 1, 'python');
    expect(m.map((x) => x.mutated)).toContain('        elif False:');
  });

  it('removes a raise so the rejection path disappears', () => {
    const m = mutationsFor('        raise ValueError("unknown schema")', 1, 'python');
    expect(m.map((x) => x.mutated)).toContain('        pass');
  });

  it('forces a predicate to accept everything', () => {
    const m = mutationsFor('    return bool(word) and word.group(0) in WORDS', 1, 'python');
    expect(m.map((x) => x.mutated)).toContain('    return True');
  });

  it('flips a comparison', () => {
    const m = mutationsFor('    if depth == 0 and opened:', 1, 'python');
    expect(m.some((x) => x.mutated.includes('depth != 0'))).toBe(true);
  });

  it('leaves a bare return alone — it carries no expression to widen', () => {
    expect(mutationsFor('        return', 1, 'python')).toEqual([]);
  });

  it('invents nothing when the line has no mutable operator', () => {
    expect(mutationsFor('    limit = min(len(lines), start_idx + 2000)', 1, 'python')).toEqual([]);
  });

  it('does not emit javascript rewrites for a python line', () => {
    const m = mutationsFor('    if not ok:', 1, 'python');
    expect(m.every((x) => !x.mutated.includes('if (false)'))).toBe(true);
  });

  it('preserves indentation so the mutant still parses', () => {
    for (const m of mutationsFor('            if stack and stack[-1] == "${":', 1, 'python')) {
      expect(m.mutated.startsWith('            ')).toBe(true);
    }
  });

  it('is deterministic', () => {
    const line = '    if depth == 0:';
    expect(mutationsFor(line, 1, 'python')).toEqual(mutationsFor(line, 1, 'python'));
  });
});

describe('selectTests — python coverage is found by import, not by filename luck', () => {
  it('finds the pytest files that import code_lens', () => {
    const tests = selectTests('divtube_downloader/tui/services/code_lens.py');
    expect(tests.length).toBeGreaterThan(0);
    expect(tests.every((t) => t.endsWith('.py'))).toBe(true);
    expect(tests.some((t) => t.includes('test_code_lens'))).toBe(true);
  });

  it('does not hand python tests to a javascript target', () => {
    const tests = selectTests('scripts/antigen-witness.mjs');
    expect(tests.every((t) => !t.endsWith('.py'))).toBe(true);
  });
});

describe('adjudicate is language-blind — the discipline does not fork', () => {
  it('still refuses a verdict when the baseline is red', () => {
    expect(adjudicate({ baseline: { passed: false }, mutants: [] }).verdict)
      .toBe(VERDICT.INCONCLUSIVE);
  });
});
