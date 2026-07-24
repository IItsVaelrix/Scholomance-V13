import { describe, it, expect } from 'vitest';
import { verbStrengthRule } from '../../src/lib/career/amplify/rules/verb-strength';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return verbStrengthRule({ document, lines: getAccomplishmentLines(document) });
}

describe('verb strength rule', () => {
  it('strengthens a weak leading verb using the object it governs', () => {
    const raw = 'Helped the support team.';
    const [sug] = run(raw);

    expect(sug.type).toBe('verb');
    expect(sug.before).toBe('Helped');
    expect(sug.after).toBe('Led');
    expect(sug.target?.span).toEqual({ coordinateSpace: 'raw', start: 0, end: 6 });
    expect(raw.slice(sug.target!.span!.start, sug.target!.span!.end)).toBe(sug.before);
    expect(sug.evidence[0].rule).toBe('verb_strength_class');
    expect(sug.requiresInput).toBeUndefined();
  });

  it('picks a different strong verb for a different object class', () => {
    expect(run('Handled the deployment process end to end.')[0].after).toBe('Streamlined');
    expect(run('Used the reporting dashboard daily.')[0].after).toBe('Analyzed');
  });

  it('leaves an already-strong leading verb alone', () => {
    expect(run('Spearheaded the billing migration.')).toEqual([]);
  });

  it('never touches a weak verb that is not leading', () => {
    const raw = 'Built the API and helped the team adopt it.';
    expect(run(raw)).toEqual([]);
  });

  it('skips prepositional forms, which belong to the construction rule', () => {
    expect(run('Worked on the payment API.')).toEqual([]);
    expect(run('Participated in the design review.')).toEqual([]);
  });

  it('falls back to the object-agnostic torque map when no class matches', () => {
    const [sug] = run('Used Docker daily.');
    expect(sug.after).toBe('Leveraged');
    expect(sug.evidence[0].rule).toBe('verb_strength_torque_fallback');
  });

  it('emits nothing when neither a class nor a torque fallback exists', () => {
    expect(run('Aided the paperwork.')).toEqual([]);
  });

  it('stays silent on a catenative construction ("helped <object> <bare verb>"), which would read ungrammatically if rewritten', () => {
    expect(run('Helped the support team resolve escalations.')).toEqual([]);
  });

  it('stays silent when a preposition follows the object, not just the verb', () => {
    expect(run('Assisted the client with onboarding.')).toEqual([]);
  });

  it('is deterministic', () => {
    const raw = 'Helped the support team.';
    expect(run(raw)).toEqual(run(raw));
  });
});
