import { describe, it, expect } from 'vitest';
import { repetitionRule } from '../../src/lib/career/amplify/rules/repetition';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return repetitionRule({ document, lines: getAccomplishmentLines(document) });
}

const THREE_LED = [
  'Led the billing migration.',
  'Led the support rotation.',
  'Led the hiring loop.',
].join('\n');

describe('repetition rule', () => {
  it('suggests variety on the 2nd and later occurrences only', () => {
    const suggestions = run(THREE_LED);

    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((s) => s.before === 'Led')).toBe(true);
    expect(suggestions.map((s) => s.after)).toEqual(['Directed', 'Headed']);
    expect(suggestions[0].target!.span!.start).toBe(THREE_LED.indexOf('\n') + 1);
    expect(suggestions[0].evidence[0].rule).toBe('repetition');
    expect(suggestions[0].type).toBe('verb');
  });

  it('leaves a verb used twice alone', () => {
    expect(run('Led the billing migration.\nLed the support rotation.')).toEqual([]);
  });

  it('ignores weak leading verbs, which the strengthening rule owns', () => {
    const raw = [
      'Helped the support team.',
      'Helped the billing team.',
      'Helped the platform team.',
    ].join('\n');
    expect(run(raw)).toEqual([]);
  });

  it('stays silent when no variety alternatives are curated', () => {
    const raw = [
      'Negotiated the vendor contract.',
      'Negotiated the office lease.',
      'Negotiated the support terms.',
    ].join('\n');
    expect(run(raw)).toEqual([]);
  });

  it('is deterministic', () => {
    expect(run(THREE_LED)).toEqual(run(THREE_LED));
  });
});
