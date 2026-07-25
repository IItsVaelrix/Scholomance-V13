/**
 * JD Advisor — output quality of the text that actually reaches a résumé.
 *
 * Generalizing the evidence bridge turned three latent template defects into user-visible
 * ones: the canonical-term injection could splice an inflection of a word the bullet
 * already used ("reporting/Reports"), it capitalized the anchor mid-sentence, and the
 * learning-gap note appended SQL-specific advice to every requirement. It also let derived
 * n-grams the JD never literally states ("senior customer") address the candidate.
 */
import { describe, it, expect } from 'vitest';
import { vocabularyInjectionRule } from '../../src/lib/career/improve/rules/vocabulary-injection';
import { buildImprovements } from '../../src/lib/career/improve/build-improvements';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { segmentDocumentBullets } from '../../src/lib/career/parser/segment-bullets';
import { makeImproveDoc } from './fixtures/career-improve-doc';
import type { EvidenceMap } from '../../src/lib/career/improve/types';

function pipeline(jd: string, raw: string) {
  const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
  const bullets = segmentDocumentBullets(doc.sections);
  const map = mapEvidence(buildRequirementLedger(jd), bullets);
  return { doc, bullets, map };
}

describe('vocabulary injection — text quality', () => {
  it('does not inject a canonical label that is only an inflection of the anchor', () => {
    const { doc, bullets, map } = pipeline(
      'Required: reporting.',
      'EXPERIENCE\nWas responsible for maintaining reports in Excel'
    );
    const sugs = vocabularyInjectionRule(map, bullets, doc);
    // "reporting/Reports" states the same word twice — no ATS value, broken prose.
    expect(sugs.filter((s) => s.type === 'keyword')).toEqual([]);
  });

  it('preserves the anchor phrase capitalization when injecting mid-sentence', () => {
    const { doc, bullets, map } = pipeline(
      'Required: SQL.',
      'EXPERIENCE\nBuilt weekly dashboards from postgres exports'
    );
    const kw = vocabularyInjectionRule(map, bullets, doc).find((s) => s.type === 'keyword');
    expect(kw).toBeTruthy();
    expect(kw!.after).toBe('Built weekly dashboards from SQL/postgres exports');
  });
});

describe('learning-gap note — addresses the actual requirement', () => {
  it('gives no SQL-specific advice for an unrelated requirement', () => {
    const { doc, bullets, map } = pipeline(
      'Required: customer retention.',
      'EXPERIENCE\nHandled inbound customer calls daily'
    );
    const gap = vocabularyInjectionRule(map, bullets, doc).find((s) => s.type === 'learning_gap');
    expect(gap).toBeTruthy();
    expect(gap!.reason).not.toMatch(/relational vendor|query language/i);
    expect(gap!.reason).toContain('customer retention');
  });

  it('emits one note per piece of résumé evidence, keeping the heaviest requirement', () => {
    // "Senior Customer Success Manager" mines three overlapping requirements that all rest
    // on the same word in the same bullet; three near-identical cards is noise, not advice.
    const { doc, bullets, map } = pipeline(
      'Senior Customer Success Manager. Required: customer retention, customer success.',
      'EXPERIENCE\nHandled inbound customer calls daily'
    );
    const gaps = vocabularyInjectionRule(map, bullets, doc).filter((s) => s.type === 'learning_gap');
    expect(gaps).toHaveLength(1);

    // The surviving note must be the heaviest of the requirements that shared the anchor.
    const sharedAnchor = map
      .filter((e) => e.support === 'adjacent' && e.bullets[0]?.matchedPhrase === 'customer')
      .map((e) => e.requirement);
    expect(sharedAnchor.length).toBeGreaterThan(1);
    const heaviest = [...sharedAnchor].sort((a, b) => b.weight - a.weight)[0];
    expect(gaps[0].reason).toContain(heaviest.canonicalLabel || heaviest.term);
  });

  it('stays silent about a derived n-gram the JD never literally states', () => {
    const doc = makeImproveDoc('EXPERIENCE\nHandled inbound customer calls daily', 'experience', 'EXPERIENCE');
    const bullets = segmentDocumentBullets(doc.sections);
    // "senior customer" is a synthesized bigram: no span, so nothing to quote back.
    const map: EvidenceMap = [
      {
        requirement: { term: 'senior customer', modality: 'unmarked', weight: 0.44, jdEvidence: [] },
        support: 'adjacent',
        bullets: [{ bulletId: bullets[0].id, tier: 'adjacent', matchedPhrase: 'customer' }],
      },
    ];
    const sugs = vocabularyInjectionRule(map, bullets, doc);
    expect(sugs.filter((s) => s.type === 'learning_gap')).toEqual([]);
  });
});

describe('advisor output on a realistic JD (end-to-end)', () => {
  const JD = [
    'Senior Data Engineer',
    '',
    'About us:',
    'We are a fast-growing fintech. Our team ships daily and we love what we do.',
    '',
    'Requirements:',
    '- 5+ years of experience building data pipelines in Python',
    '- Strong SQL skills; experience with PostgreSQL is required',
    '- Solid understanding of dimensional modeling',
    '',
    'Nice to have:',
    '- Kubernetes experience is a plus',
    '',
    'Note: A formal computer science degree is not required.',
    '',
    'Benefits:',
    'We offer generous PTO, remote work, and a competitive salary.',
  ].join('\n');

  const RESUME = [
    'EXPERIENCE',
    'Built and maintained nightly ETL jobs moving records into Postgres',
    'Automated a manual reconciliation process with scheduled Python scripts',
    'Solid understanding of the payments domain gained over four years',
  ].join('\n');

  const advise = () =>
    buildImprovements(JD, makeImproveDoc(RESUME, 'experience', 'EXPERIENCE'));

  it('never proposes résumé text drawn from perks, culture, or JD scaffolding', () => {
    // Measured before the ledger fix: the advisor proposed a skills section reading
    // "SQL, solid understanding, Python" and promoted the payments bullet as evidence of
    // the requirement "solid understanding".
    const written = advise()
      .map((s) => `${s.after ?? ''}\n${s.reason}`)
      .join('\n')
      .toLowerCase();

    for (const junk of ['solid understanding', 'competitive salary', 'generous pto', 'ships daily']) {
      expect(written).not.toContain(junk);
    }
  });

  it('does not advise toward a skill the JD explicitly rules out', () => {
    // The résumé is ADJACENT to Kubernetes (Docker/containers), which is what makes this
    // bite: without the negation guard the advisor emits a gap note urging the candidate
    // toward a skill the JD just said it does not want.
    const jd = [
      'Requirements:',
      '- Strong SQL skills are required',
      '- Kubernetes is not required for this role',
    ].join('\n');
    const resume = [
      'EXPERIENCE',
      'Deployed containerized services with Docker across three environments',
      'Wrote reporting queries against Postgres for the finance team',
    ].join('\n');

    const written = buildImprovements(jd, makeImproveDoc(resume, 'experience', 'EXPERIENCE'))
      .map((s) => `${s.after ?? ''}\n${s.reason}`)
      .join('\n')
      .toLowerCase();

    expect(written).not.toContain('kubernetes');
    // The affirmed requirement in the same JD still produces advice.
    expect(written).toContain('sql');
  });

  it('still proposes the canonical term for a skill the résumé demonstrates', () => {
    const keyword = advise().filter((s) => s.type === 'keyword');
    expect(keyword.length).toBeGreaterThan(0);
    expect(keyword[0].after).toContain('SQL');
    // Amplify-only: the original evidence survives in the rewritten bullet.
    expect(keyword[0].after?.toLowerCase()).toContain('postgres');
  });
});

describe('adjacent evidence drafts a fill-in rewrite (Case B)', () => {
  const setup = () =>
    pipeline(
      'Requirements:\n- Solid understanding of dimensional modeling',
      'EXPERIENCE\nPartnered with analysts to model warehouse tables for reporting'
    );

  it('offers an editable draft with a blank instead of an instruction', () => {
    const { doc, bullets, map } = setup();
    const gaps = vocabularyInjectionRule(map, bullets, doc).filter((s) => s.type === 'learning_gap');
    expect(gaps.length).toBeGreaterThan(0);
    const gap = gaps[0];
    expect(gap.editable).toBe(true);
    expect(gap.requiresInput).toBe(true);
    expect(gap.after).toContain('␟');
    expect(gap.inputSlots?.length).toBeGreaterThan(0);
    // Amplify-only: the original bullet survives intact inside the draft.
    expect(gap.after).toContain('model warehouse tables for reporting');
    expect(gap.before).toBe('Partnered with analysts to model warehouse tables for reporting');
  });

  it('does not rename the adjacent phrase to the canonical term', () => {
    const { doc, bullets, map } = setup();
    const gaps = vocabularyInjectionRule(map, bullets, doc).filter((s) => s.type === 'learning_gap');
    // The escalation guard still holds: the tool never asserts the candidate did it.
    expect(gaps[0].after).not.toMatch(/dimensional modeling\//);
  });
});
