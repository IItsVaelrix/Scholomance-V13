import { describe, it, expect } from 'vitest';
import { clauseAt, clauseSpanAt } from '../../src/lib/career/improve/jd-clause';

describe('clauseAt', () => {
  it('scopes to the clause containing the offset, not the whole line', () => {
    const text = 'Required: SQL. Nice to have: Kubernetes.';
    const sql = text.indexOf('SQL');
    const k8s = text.indexOf('Kubernetes');
    expect(clauseAt(text, sql, sql + 3)).toContain('Required');
    expect(clauseAt(text, sql, sql + 3)).not.toContain('Nice to have');
    expect(clauseAt(text, k8s, k8s + 10)).toContain('Nice to have');
  });

  it('does not split on a period inside a token', () => {
    const text = 'Experience with Node.js required';
    const node = text.indexOf('Node.js');
    expect(clauseAt(text, node, node + 7)).toContain('required');
  });

  it('is bounded by the containing line', () => {
    const text = 'Kubernetes administration\nPython is required';
    const k8s = text.indexOf('Kubernetes');
    expect(clauseAt(text, k8s, k8s + 10)).not.toContain('Python');
  });
});

describe('clauseSpanAt', () => {
  it('returns boundaries that slice back to its own text', () => {
    const text = 'Required: SQL. Nice to have: Kubernetes.';
    const k8s = text.indexOf('Kubernetes');
    const span = clauseSpanAt(text, k8s, k8s + 10);
    expect(text.slice(span.start, span.end)).toBe(span.text);
    expect(span.text).toContain('Kubernetes');
  });

  it('returns the SAME text as clauseAt for the same offsets', () => {
    const text = 'Experience with Node.js required';
    const node = text.indexOf('Node.js');
    expect(clauseSpanAt(text, node, node + 7).text).toBe(clauseAt(text, node, node + 7));
  });

  it('resolves the boundaries of the occurrence actually containing the offset, not an earlier byte-identical one', () => {
    // Repro verified by direct execution (see fix-round-2 report): three BYTE-IDENTICAL
    // clauses in one continuous run of text, split by clause punctuation rather than
    // newlines. Under the OLD `text.indexOf(clauseText, Math.max(0, start -
    // clauseText.length))` re-derivation this text is exactly where it breaks — passing
    // an offset inside the SECOND "SQL basics." clause, the old formula computes
    // `Math.max(0, 12 - 12) === 0` and `text.indexOf('SQL basics. ', 0)` returns the
    // FIRST occurrence's start (0), not the second's (12). A fixture built from two
    // non-identical bullet lines (as an earlier version of this test used) does NOT
    // reproduce this: the old algorithm handles that shape fine, which is why that
    // fixture passed identically before and after the fix and proved nothing.
    const text = 'SQL basics. SQL basics. SQL basics.';
    const first = text.indexOf('SQL');
    const second = text.indexOf('SQL', first + 1);
    const third = text.indexOf('SQL', second + 1);
    expect([first, second, third]).toEqual([0, 12, 24]);

    const spanSecond = clauseSpanAt(text, second, second + 3);
    expect(spanSecond.start).toBe(12);
    expect(spanSecond.end).toBe(24);
    expect(text.slice(spanSecond.start, spanSecond.end)).toBe(spanSecond.text);
    expect(spanSecond.text).toBe('SQL basics. ');

    // The third occurrence too, so this isn't a coincidence of exactly two repeats.
    const spanThird = clauseSpanAt(text, third, third + 3);
    expect(spanThird.start).toBe(24);
    expect(spanThird.end).toBe(35);
    expect(text.slice(spanThird.start, spanThird.end)).toBe(spanThird.text);
  });
});
