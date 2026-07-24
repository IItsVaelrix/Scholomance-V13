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
      `Reduced the deployment pipeline runtime., reducing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}%`
    );
    expect(sug.inputSlots).toHaveLength(2);
    expect(sug.target?.span).toEqual({ coordinateSpace: 'raw', start: 0, end: raw.length });
    expect(sug.status).toBe('pending');
    expect(sug.requiresUserApproval).toBe(true);
    expect(sug.risk).toBe('low');
    expect(sug.evidence[0].rule).toBe('quantification');
  });

  it('never fills a slot itself', () => {
    const suggestions = run('Led the billing platform rewrite.');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].after).toContain(INPUT_SENTINEL);
    expect(suggestions[0].after).toBe(
      `Led the billing platform rewrite., managing a team of ${INPUT_SENTINEL}`
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
