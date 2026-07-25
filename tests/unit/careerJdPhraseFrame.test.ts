import { describe, it, expect } from 'vitest';
import { toPastTense, buildPhraseFrame } from '../../src/lib/career/improve/jd-phrase-frame';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';

describe('toPastTense', () => {
  it('converts the base form', () => {
    expect(toPastTense('build')).toBe('built');
    expect(toPastTense('lead')).toBe('led');
    expect(toPastTense('design')).toBe('designed');
  });

  it('converts the gerund', () => {
    expect(toPastTense('building')).toBe('built');
    expect(toPastTense('managing')).toBe('managed');
  });

  it('accepts a form that is already past tense', () => {
    expect(toPastTense('built')).toBe('built');
    expect(toPastTense('delivered')).toBe('delivered');
  });

  it('is case insensitive and returns lowercase', () => {
    expect(toPastTense('Building')).toBe('built');
    expect(toPastTense('BUILD')).toBe('built');
  });

  it('returns null for a word that is not a known verb — fail closed', () => {
    expect(toPastTense('orchestration')).toBeNull();
    expect(toPastTense('kubernetes')).toBeNull();
    expect(toPastTense('modeling')).toBeNull();
    expect(toPastTense('')).toBeNull();
  });
});

function frameFor(jd: string, term: string) {
  const req = buildRequirementLedger(jd).find((r) => r.term.toLowerCase().includes(term));
  if (!req) throw new Error(`no requirement matched "${term}" in ledger`);
  return buildPhraseFrame(jd, req);
}

describe('buildPhraseFrame', () => {
  it('lifts the verb and object from the JD, in past tense', () => {
    const jd = 'Requirements:\n- 5+ years of experience building data pipelines in Python';
    expect(frameFor(jd, 'python')!.text).toBe('Built data pipelines in Python, ␟');
  });

  it('supplies a neutral verb when the clause has none', () => {
    const jd = 'Requirements:\n- Experience with Apache Airflow for orchestration';
    expect(frameFor(jd, 'airflow')!.text).toBe('Used Apache Airflow for orchestration, ␟');
  });

  it('strips leading scaffolding', () => {
    const jd = 'Requirements:\n- Solid understanding of dimensional modeling';
    expect(frameFor(jd, 'dimensional')!.text).toBe('Used dimensional modeling, ␟');
  });

  it('strips pronouns and modals from JD second-person phrasing', () => {
    const jd = 'Requirements:\n- You will drive adoption across teams';
    expect(frameFor(jd, 'adoption')!.text).toBe('Drove adoption across teams, ␟');
  });

  it('carries one slot and the source clause for provenance', () => {
    const jd = 'Requirements:\n- Experience with Apache Airflow for orchestration';
    const frame = frameFor(jd, 'airflow')!;
    expect(frame.slots).toHaveLength(1);
    expect(frame.text.split('␟')).toHaveLength(2);
    expect(frame.sourceClause).toContain('Apache Airflow');
    expect(jd.slice(frame.sourceSpan.start, frame.sourceSpan.end)).toBe(frame.sourceClause);
  });

  it('returns null when the requirement has no JD evidence span', () => {
    expect(buildPhraseFrame('Requirements:\n- SQL', {
      term: 'ghost', modality: 'unmarked', weight: 0.5, jdEvidence: [],
    })).toBeNull();
  });

  it('is deterministic', () => {
    const jd = 'Requirements:\n- Experience with Apache Airflow for orchestration';
    expect(frameFor(jd, 'airflow')).toEqual(frameFor(jd, 'airflow'));
  });

  it('folds a leading copula into scaffolding instead of drafting "Was ..."', () => {
    // toPastTense accepts 'was' verbatim (KNOWN_VERBS), so naively lifting "the first
    // token that resolves as a verb" would draft "Was responsible for managing vendor
    // relationships, <sentinel>" — a copula is not a usable résumé opener. LEADING_NOISE
    // strips the bare copula, and the "responsible for" idiom that usually follows it is
    // stripped separately (see the qualifier test below for why it's an idiom match, not
    // a bare-token one), so the real verb ("managing") is what gets lifted.
    const jd = 'Requirements:\n- Was responsible for managing vendor relationships';
    expect(frameFor(jd, 'vendor')!.text).toBe('Managed vendor relationships, ␟');
  });

  it('handles the other KNOWN_VERBS copula ("were") the same way', () => {
    const jd = 'Requirements:\n- Were responsible for managing vendor relationships';
    expect(frameFor(jd, 'vendor')!.text).toBe('Managed vendor relationships, ␟');
  });

  it('keeps "responsible" when it qualifies a noun instead of the "responsible for" idiom', () => {
    // "responsible" is only scaffolding in the "responsible for" idiom (see above). Bare,
    // it is a genuine qualifier — stripping it unconditionally from the front of every
    // clause silently deletes the word that WAS the requirement.
    const jd = 'Requirements:\n- Responsible AI development experience';
    expect(frameFor(jd, 'development')!.text).toBe('Used Responsible AI development experience, ␟');
  });
});
