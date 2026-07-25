import { describe, it, expect } from 'vitest';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { segmentBullets, makeBulletId } from '../../src/lib/career/parser/segment-bullets';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { makeImproveDoc } from './fixtures/career-improve-doc';
import type { CareerGraphQueryPort } from '../../src/lib/career/graph/reference-query';

describe('segmentBullets (§4.1)', () => {
  it('splits a section into bullets with stable ids and exact spans', () => {
    const raw = 'EXPERIENCE\nWrote Postgres queries for reports\nLed a team of five engineers';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const bullets = segmentBullets(doc.sections[0]);

    expect(bullets).toHaveLength(2);
    expect(bullets[0].rawText).toBe('Wrote Postgres queries for reports');
    expect(bullets[1].rawText).toBe('Led a team of five engineers');
    // sourceSpan is byte-exact against rawText.
    for (const b of bullets) {
      expect(raw.slice(b.sourceSpan.start, b.sourceSpan.end)).toBe(b.rawText);
    }
    // Heading line is skipped.
    expect(bullets.every((b) => b.rawText !== 'EXPERIENCE')).toBe(true);
  });

  it('strips bullet glyphs but keeps the content span exact', () => {
    const raw = '• Built the billing API\n• Shipped the dashboard';
    const doc = makeImproveDoc(raw);
    const bullets = segmentBullets(doc.sections[0]);
    expect(bullets.map((b) => b.rawText)).toEqual(['Built the billing API', 'Shipped the dashboard']);
    expect(raw.slice(bullets[0].sourceSpan.start, bullets[0].sourceSpan.end)).toBe(
      'Built the billing API'
    );
  });

  it('ids are stable for unchanged content (content-hash anchored)', () => {
    const raw = 'Wrote Postgres queries for reports';
    const doc = makeImproveDoc(raw);
    const b1 = segmentBullets(doc.sections[0])[0];
    const b2 = segmentBullets(doc.sections[0])[0];
    expect(b1.id).toBe(b2.id);
    expect(b1.id).toBe(makeBulletId(doc.sections[0].id, 0, raw));
  });
});

describe('buildRequirementLedger (§4.2)', () => {
  it('extracts weighted JD requirements', () => {
    const jd = 'We require SQL and Postgres. Strong SQL skills are required. Experience with React is a plus.';
    const reqs = buildRequirementLedger(jd);
    expect(reqs.length).toBeGreaterThan(0);
    const terms = reqs.map((r) => r.term.toLowerCase());
    expect(terms).toContain('sql');
    // weights are normalized to [0,1]
    for (const r of reqs) {
      expect(r.weight).toBeGreaterThanOrEqual(0);
      expect(r.weight).toBeLessThanOrEqual(1);
    }
  });

  it('emphasis cues raise weight (required > plus)', () => {
    const jd = 'Required: SQL. Nice to have: Kubernetes.';
    const reqs = buildRequirementLedger(jd);
    const sql = reqs.find((r) => r.term.toLowerCase() === 'sql');
    const k8s = reqs.find((r) => r.term.toLowerCase() === 'kubernetes');
    expect(sql).toBeTruthy();
    if (sql && k8s) expect(sql.weight).toBeGreaterThan(k8s.weight);
  });

  it('canonicalizes via the seeded evidence law (postgres -> SQL) with no graph', () => {
    const jd = 'Required: Postgres and MySQL administration.';
    const reqs = buildRequirementLedger(jd);
    const postgres = reqs.find((r) => r.term.toLowerCase() === 'postgres');
    const mysql = reqs.find((r) => r.term.toLowerCase() === 'mysql');
    expect(postgres?.canonicalLabel).toBe('SQL');
    expect(mysql?.canonicalLabel).toBe('SQL');
  });

  it('graph canonicalization collapses synonyms when a port is supplied', () => {
    // Fake port: one occupation whose related skills include the SQL concept.
    const port: CareerGraphQueryPort = {
      searchOccupations: () => [
        {
          conceptId: 'onet:15-1252.00',
          label: 'Software Developers',
          namespace: 'onet',
          matchKind: 'exact',
          matchScore: 1,
          sourceRelease: 'onet-30.3',
        },
      ],
      relatedSkills: () => [
        {
          conceptId: 'onet:sql.canonical',
          label: 'SQL',
          namespace: 'onet',
          requirementKind: 'required',
          importance: 4.5,
          level: 4,
          sourceRelease: 'onet-30.3',
          viaOccupation: 'onet:15-1252.00',
        },
      ],
    };
    const jd = 'Required: Postgres and MySQL administration.';
    const reqs = buildRequirementLedger(jd, port);
    const postgres = reqs.find((r) => r.term.toLowerCase() === 'postgres');
    const mysql = reqs.find((r) => r.term.toLowerCase() === 'mysql');
    // Both collapse to the SAME graph concept id and label.
    expect(postgres?.canonicalConceptId).toBe('onet:sql.canonical');
    expect(mysql?.canonicalConceptId).toBe('onet:sql.canonical');
    expect(postgres?.canonicalLabel).toBe('SQL');
    expect(mysql?.canonicalLabel).toBe('SQL');
  });
});

describe('buildRequirementLedger modality (§4.2 negation + cue precedence)', () => {
  const find = (jd: string, term: string) =>
    buildRequirementLedger(jd).find((r) => r.term.toLowerCase() === term);

  it('drops a requirement the JD explicitly negates', () => {
    const jd = 'Kubernetes is not required for this role.\nWe use Python daily.';
    expect(find(jd, 'kubernetes')).toBeUndefined();
    // The affirmed term in the same JD survives.
    expect(find(jd, 'python')).toBeTruthy();
  });

  it('does not let a negation cue boost the term it negates', () => {
    // Regression: the cue scan matched "required" inside "not required" and applied the
    // strong-cue multiplier, scoring a ruled-out skill exactly like a mandatory one.
    const negated = buildRequirementLedger('Kubernetes is not required.\nWe use Python daily.');
    expect(negated.some((r) => r.term.toLowerCase() === 'kubernetes')).toBe(false);
  });

  it('keeps a term that is negated in one place but required in another', () => {
    const jd = 'A Kubernetes certification is not required.\nHands-on Kubernetes administration is required.';
    const k8s = find(jd, 'kubernetes');
    expect(k8s).toBeTruthy();
    expect(k8s!.modality).toBe('required');
  });

  it('resolves modality by precedence, not by line order', () => {
    const anchor = '\nPython Python Python Python Python Python is mandatory and essential.';
    const strongFirst = buildRequirementLedger(
      'Kubernetes experience required.\nKubernetes exposure is a plus.' + anchor
    );
    const softFirst = buildRequirementLedger(
      'Kubernetes exposure is a plus.\nKubernetes experience required.' + anchor
    );
    const a = strongFirst.find((r) => r.term.toLowerCase() === 'kubernetes')!;
    const b = softFirst.find((r) => r.term.toLowerCase() === 'kubernetes')!;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // Same evidence, different line order — the requirement must not change.
    expect(a.modality).toBe('required');
    expect(b.modality).toBe('required');
    expect(a.weight).toBe(b.weight);
  });

  it('labels an unqualified mention as unmarked, a cued one as required/preferred', () => {
    const jd = 'Requirements:\nSQL is required.\n\nNice to have:\nKubernetes is a plus.\n\nDay to day:\nWe write Python here.';
    expect(find(jd, 'sql')!.modality).toBe('required');
    expect(find(jd, 'kubernetes')!.modality).toBe('preferred');
    expect(find(jd, 'python')!.modality).toBe('unmarked');
  });

  it('drops a requirement with no locatable JD evidence', () => {
    // The keyword matcher emits stemmed bigrams ("salary generous" from "salary and
    // generous") whose surface never appears in the JD. With no span such a term escapes
    // every location check — negation, section, position — and cannot be quoted back to
    // the candidate. No evidence, no requirement.
    const jd = [
      'Requirements:',
      'Strong SQL skills are required.',
      '',
      'Benefits:',
      'We offer a competitive salary and generous PTO.',
    ].join('\n');
    for (const req of buildRequirementLedger(jd)) {
      expect(req.jdEvidence.length).toBeGreaterThan(0);
    }
  });

  it('every requirement from a realistic JD carries a span that slices back to its term', () => {
    const jd = [
      'Senior Data Engineer',
      '',
      'About us:',
      'We are a fast-growing fintech. Our team ships daily and we love what we do.',
      '',
      'Requirements:',
      '- 5+ years of experience building data pipelines in Python',
      '- Strong SQL skills; experience with PostgreSQL is required',
      '',
      'Nice to have:',
      '- Kubernetes experience is a plus',
      '',
      'Benefits:',
      'We offer generous PTO and a competitive salary.',
    ].join('\n');
    const reqs = buildRequirementLedger(jd);
    expect(reqs.length).toBeGreaterThan(0);
    for (const req of reqs) {
      expect(req.jdEvidence.length).toBeGreaterThan(0);
      for (const span of req.jdEvidence) {
        expect(jd.slice(span.start, span.end).toLowerCase()).toBe(req.term.toLowerCase());
      }
    }
    // And no perk survives as a requirement.
    const terms = reqs.map((r) => r.term.toLowerCase());
    for (const junk of ['salary', 'pto', 'ships', 'love']) {
      expect(terms.some((t) => t.includes(junk))).toBe(false);
    }
  });

  it('drops a phrase made only of JD scaffolding, keeping the skill it wraps', () => {
    // "Solid understanding of dimensional modeling" states ONE requirement. Left in, the
    // add-section rule writes "solid understanding" into the candidate's SKILLS list.
    const jd = 'Requirements:\n- Solid understanding of dimensional modeling\n- Strong SQL skills are required';
    const terms = buildRequirementLedger(jd).map((r) => r.term.toLowerCase());
    expect(terms).not.toContain('solid understanding');
    expect(terms.some((t) => t.includes('dimensional modeling'))).toBe(true);
    expect(terms.some((t) => t.includes('sql'))).toBe(true);
  });

  it('keeps a phrase where any token carries content', () => {
    const jd = 'Requirements:\n- Prior fintech experience\n- Hands-on Kubernetes administration';
    const terms = buildRequirementLedger(jd).map((r) => r.term.toLowerCase());
    expect(terms.some((t) => t.includes('fintech'))).toBe(true);
    expect(terms.some((t) => t.includes('kubernetes'))).toBe(true);
  });

  it('keeps spans in the ORIGINAL text coordinate space', () => {
    // Spans were located in a `toLowerCase()` copy but are consumed against the original
    // text — and lowercasing is not length-preserving ("İ".toLowerCase() is 2 chars). One
    // such character shifts every later span by one, so the JD excerpt quoted back to the
    // candidate is off by one and the section/negation checks read the wrong clause.
    const jd = 'İstanbul office\n\nRequirements:\nKubernetes is required.';
    const k8s = buildRequirementLedger(jd).find((r) => r.term.toLowerCase() === 'kubernetes');
    expect(k8s).toBeTruthy();
    const span = k8s!.jdEvidence[0];
    expect(jd.slice(span.start, span.end)).toBe('Kubernetes');
    expect(k8s!.modality).toBe('required');
  });

  it('does not treat a section heading word as a requirement', () => {
    const jd = 'Requirements:\nStrong SQL skills are required.\n\nBenefits:\nWe offer PTO.';
    const terms = buildRequirementLedger(jd).map((r) => r.term.toLowerCase());
    expect(terms).not.toContain('benefits');
    expect(terms).not.toContain('requirements');
  });

  it('reads the section heading, not the previous bullet, for position weight', () => {
    // Regression: `precedingHeading` returned the nearest short line, which in a bulleted
    // JD is the previous bullet — so a neighbour saying "preferred" demoted its successor.
    const withNeighbourCue = buildRequirementLedger(
      'Requirements:\nExperience with Docker preferred\nKubernetes administration\nWe use Python daily.'
    );
    const withNeutralNeighbour = buildRequirementLedger(
      'Requirements:\nExperience with Docker containers.\nKubernetes administration\nWe use Python daily.'
    );
    const a = withNeighbourCue.find((r) => r.term.toLowerCase() === 'kubernetes')!;
    const b = withNeutralNeighbour.find((r) => r.term.toLowerCase() === 'kubernetes')!;
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    // Both bullets sit under "Requirements:" — the neighbour's wording is not theirs.
    expect(a.weight).toBe(b.weight);
  });

  it('excludes terms that appear only in company boilerplate sections', () => {
    // A requirement found only in "Benefits"/"About us" is not a requirement. Left in, the
    // advisor tells the candidate to put "competitive salary" on their résumé.
    const jd = [
      'About us:',
      'We are a fast-growing fintech and our team ships daily.',
      '',
      'Requirements:',
      'Strong SQL skills are required.',
      '',
      'Benefits:',
      'We offer a competitive salary and generous PTO.',
    ].join('\n');
    const reqs = buildRequirementLedger(jd);
    const terms = reqs.map((r) => r.term.toLowerCase());

    expect(terms.some((t) => t.includes('salary'))).toBe(false);
    expect(terms.some((t) => t.includes('pto'))).toBe(false);
    expect(terms.some((t) => t.includes('ships'))).toBe(false);
    // The real requirement survives.
    expect(terms.some((t) => t.includes('sql'))).toBe(true);
  });

  it('keeps a term that appears in boilerplate AND in a requirements section', () => {
    const jd = [
      'About us:',
      'We are a Python shop.',
      '',
      'Requirements:',
      'Python is required.',
    ].join('\n');
    const python = buildRequirementLedger(jd).find((r) => r.term.toLowerCase() === 'python');
    expect(python).toBeTruthy();
    expect(python!.modality).toBe('required');
  });

  it('keeps terms under an unrecognized heading (only known boilerplate is dropped)', () => {
    const jd = ['Some Unusual Heading:', 'Kubernetes administration is required.'].join('\n');
    const k8s = buildRequirementLedger(jd).find((r) => r.term.toLowerCase() === 'kubernetes');
    expect(k8s).toBeTruthy();
    expect(k8s!.modality).toBe('required');
  });

  it('matches cues on word boundaries, not substrings', () => {
    // "surplus" must not read as the soft cue "plus".
    const surplus = buildRequirementLedger('Kubernetes manages our surplus capacity.\nWe use Python daily.');
    const plus = buildRequirementLedger('Kubernetes is a plus.\nWe use Python daily.');
    const a = surplus.find((r) => r.term.toLowerCase() === 'kubernetes')!;
    const b = plus.find((r) => r.term.toLowerCase() === 'kubernetes')!;
    expect(a.modality).toBe('unmarked');
    expect(b.modality).toBe('preferred');
  });
});

describe('mapEvidence (§4.4)', () => {
  it('joins requirements to bullets by strongest tier, keyed by bulletId', () => {
    const raw = 'Wrote Postgres queries for reports\nQueried the database for analysis\nLed a team of five';
    const doc = makeImproveDoc(raw);
    const bullets = segmentBullets(doc.sections[0]);
    const reqs = buildRequirementLedger('Required: SQL.');
    const map = mapEvidence(reqs, bullets);
    const sql = map.find((e) => (e.requirement.canonicalLabel || e.requirement.term) === 'SQL');
    expect(sql).toBeTruthy();
    // Strongest tier across bullets is demonstrated (Postgres bullet).
    expect(sql!.support).toBe('demonstrated');
    // Bullets referenced by id, demonstrated first.
    expect(sql!.bullets[0].tier).toBe('demonstrated');
    for (const be of sql!.bullets) {
      expect(bullets.some((b) => b.id === be.bulletId)).toBe(true);
    }
  });
});
