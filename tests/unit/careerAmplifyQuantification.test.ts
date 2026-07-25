import { describe, it, expect } from 'vitest';
import { quantificationRule } from '../../src/lib/career/amplify/rules/quantification';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/verb-classes';
import { makeResumeDoc } from './fixtures/career-amplify-doc';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

function run(raw: string) {
  const document: ResumeDocument = makeResumeDoc(raw);
  return quantificationRule({ document, lines: getAccomplishmentLines(document) });
}

describe('quantification rule', () => {
  it('prompts for a metric on an un-quantified measurable accomplishment', () => {
    const raw = 'Reduced the deployment pipeline runtime.';
    const [sug] = run(raw);

    expect(sug.type).toBe('quantify');
    expect(sug.requiresInput).toBe(true);
    expect(sug.before).toBe(raw);
    expect(sug.after).toBe(
      `Reduced the deployment pipeline runtime, reducing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}%.`
    );
    expect(sug.inputSlots).toHaveLength(2);
    expect(sug.target?.span).toEqual({ coordinateSpace: 'raw', start: 0, end: raw.length });
    expect(sug.status).toBe('pending');
    expect(sug.requiresUserApproval).toBe(true);
    expect(sug.risk).toBe('low');
    expect(sug.evidence[0].rule).toBe('quantification');
  });

  it('never fills a slot itself', () => {
    const suggestions = run('Led the engineering staff across the region.');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].after).toContain(INPUT_SENTINEL);
    expect(suggestions[0].after).toBe(
      `Led the engineering staff across the region, managing a team of ${INPUT_SENTINEL}.`
    );
  });

  it('never fabricates a "managing a team of" frame for a non-people object (honesty)', () => {
    // "platform" is a system object, not a team — the team frame would be a fabrication.
    const [sug] = run('Led the billing platform rewrite.');
    expect(sug.after).not.toContain('managing a team of');
    expect(sug.after).toBe(`Led the billing platform rewrite, ${INPUT_SENTINEL}.`);
  });

  it('never fabricates a team frame for "managed communications" (honesty)', () => {
    const [sug] = run('Managed communications across regions.');
    expect(sug.after).not.toContain('managing a team of');
    expect(sug.after).toBe(`Managed communications across regions, ${INPUT_SENTINEL}.`);
  });

  it('moves trailing punctuation to the end of the clause instead of doubling it', () => {
    const [sug] = run('Reduced the deployment pipeline runtime.');
    expect(sug.after).not.toMatch(/[.;:!?],/);
    expect(sug.after?.endsWith('.')).toBe(true);
  });

  it('appends the clause directly when the line has no trailing punctuation', () => {
    const raw = 'Reduced the deployment pipeline runtime';
    const [sug] = run(raw);
    expect(sug.after).toBe(
      `Reduced the deployment pipeline runtime, reducing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}%`
    );
  });

  it('stays silent on a line that already carries a metric', () => {
    expect(run('Reduced build time by 40%.')).toEqual([]);
  });

  it('stays silent on a line whose leading verb is not measurable', () => {
    expect(run('Presented the roadmap to stakeholders.')).toEqual([]);
  });

  it('stays silent on a line that does not lead with a verb', () => {
    expect(run('Senior Platform Engineer, Acme Corp')).toEqual([]);
  });

  it('gives one slot id per sentinel, in left-to-right order', () => {
    const [sug] = run('Increased trial conversion.');
    const sentinels = (sug.after || '').split(INPUT_SENTINEL).length - 1;
    expect(sentinels).toBe(4);
    expect(sug.inputSlots?.map((s) => s.id)).toEqual([
      `${sug.id}:slot:0`,
      `${sug.id}:slot:1`,
      `${sug.id}:slot:2`,
      `${sug.id}:slot:3`,
    ]);
  });

  it('produces identical ids across runs', () => {
    const a = run('Reduced the deployment pipeline runtime.');
    const b = run('Reduced the deployment pipeline runtime.');
    expect(a).toEqual(b);
  });
});
