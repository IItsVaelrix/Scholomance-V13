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

  it('resolves distinct boundaries when the same clause text occurs twice in one JD', () => {
    // This is the case a text-search re-derivation (`text.indexOf(clauseText, ...)`) can
    // get wrong: given only the clause's TEXT, a naive re-search has no way to tell the
    // two occurrences apart and can silently anchor both to the first one. clauseSpanAt
    // never re-searches — it returns the boundaries the scan already computed.
    const text = 'Requirements:\n- Experience with SQL\n- Experience with SQL required';
    const first = text.indexOf('SQL');
    const second = text.indexOf('SQL', first + 1);
    expect(second).toBeGreaterThan(first);

    const spanA = clauseSpanAt(text, first, first + 3);
    const spanB = clauseSpanAt(text, second, second + 3);

    // Each span's boundaries must slice back to its own clause text...
    expect(text.slice(spanA.start, spanA.end)).toBe(spanA.text);
    expect(text.slice(spanB.start, spanB.end)).toBe(spanB.text);
    // ...and the two occurrences must resolve to DIFFERENT positions, not both collapse
    // onto the first match.
    expect(spanA.start).not.toBe(spanB.start);
    expect(spanB.start).toBeGreaterThan(spanA.end);
  });
});
