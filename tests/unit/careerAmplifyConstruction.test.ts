import { describe, it, expect } from 'vitest';
import { weakConstructionRule } from '../../src/lib/career/amplify/rules/weak-construction';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return weakConstructionRule({ document, lines: getAccomplishmentLines(document) });
}

describe('weak construction rule', () => {
  it('converts "Responsible for managing X" to "Managed X"', () => {
    const raw = 'Responsible for managing the release process.';
    const [sug] = run(raw);

    expect(sug.type).toBe('tighten');
    expect(sug.before).toBe('Responsible for managing');
    expect(sug.after).toBe('Managed');
    expect(raw.slice(sug.target!.span!.start, sug.target!.span!.end)).toBe(sug.before);
    expect(sug.evidence[0].rule).toBe('construction_responsible_for');
  });

  it('converts "Duties included supporting X" to "Supported X"', () => {
    const [sug] = run('Duties included supporting the sales team.');
    expect(sug.before).toBe('Duties included supporting');
    expect(sug.after).toBe('Supported');
  });

  it('drops the auxiliary from a leading passive', () => {
    const [sug] = run('Was promoted to senior engineer after one year.');
    expect(sug.before).toBe('Was promoted');
    expect(sug.after).toBe('Promoted');
    expect(sug.evidence[0].rule).toBe('construction_leading_passive');
  });

  it('converts "Helped to migrate X" to "Migrated X"', () => {
    const [sug] = run('Helped to migrate the billing database.');
    expect(sug.before).toBe('Helped to migrate');
    expect(sug.after).toBe('Migrated');
  });

  it('converts "Worked on X" using the object class', () => {
    expect(run('Worked on the payment API.')[0].after).toBe('Built');
    expect(run('Worked on the onboarding workflow.')[0].after).toBe('Streamlined');
  });

  it('stays silent when "Worked on" has no classifiable object', () => {
    expect(run('Worked on the quarterly paperwork.')).toEqual([]);
  });

  it('stays silent on constructions it has no safe recipe for', () => {
    expect(run('Responsible for photocopying the archives.')).toEqual([]);
    expect(run('Was mentioned in the company newsletter.')).toEqual([]);
    expect(run('Helped to photocopy the archives.')).toEqual([]);
  });

  it('never rewrites a construction that is not leading', () => {
    expect(run('Built the API and was promoted afterwards.')).toEqual([]);
  });

  it('emits at most one suggestion per line', () => {
    expect(run('Responsible for managing the release process.')).toHaveLength(1);
  });

  it('is deterministic', () => {
    const raw = 'Responsible for managing the release process.';
    expect(run(raw)).toEqual(run(raw));
  });
});
