import { describe, it, expect } from 'vitest';
import { clauseAt } from '../../src/lib/career/improve/jd-clause';

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
