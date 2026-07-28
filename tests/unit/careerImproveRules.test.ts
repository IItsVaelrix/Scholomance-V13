import { describe, it, expect } from 'vitest';
import { buildImprovements } from '../../src/lib/career/improve/build-improvements';
import { vocabularyInjectionRule } from '../../src/lib/career/improve/rules/vocabulary-injection';
import { reorderRule, planMoves } from '../../src/lib/career/improve/rules/reorder';
import { quantifyRule } from '../../src/lib/career/improve/rules/quantify';
import { addSectionRule } from '../../src/lib/career/improve/rules/add-section';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { segmentDocumentBullets } from '../../src/lib/career/parser/segment-bullets';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/input-sentinel';
import { makeImproveDoc, makeTwoSectionDoc } from './fixtures/career-improve-doc';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

function pipeline(jd: string, raw: string, heading = 'EXPERIENCE') {
  const doc = makeImproveDoc(raw, 'experience', heading);
  const bullets = segmentDocumentBullets(doc.sections);
  const reqs = buildRequirementLedger(jd);
  const map = mapEvidence(reqs, bullets);
  return { doc, bullets, reqs, map };
}

describe('vocabulary-injection rule (§4.5)', () => {
  it('injects the canonical term on a demonstrated bullet that lacks it', () => {
    const { doc, bullets, map } = pipeline(
      'Required: SQL and Postgres. Must have strong SQL.',
      'EXPERIENCE\nWrote Postgres queries to build weekly reports'
    );
    const sugs = vocabularyInjectionRule(map, bullets, doc);
    const kw = sugs.find((s) => s.type === 'keyword');
    expect(kw).toBeTruthy();
    expect(kw!.before).toBe('Wrote Postgres queries to build weekly reports');
    expect(kw!.after).toBe('Wrote SQL/Postgres queries to build weekly reports');
    expect(kw!.conceptId).toBeTruthy();
  });

  it('does NOT rename an adjacent match — drafts an editable fill-in blank instead', () => {
    const { doc, bullets, map } = pipeline(
      'Required: SQL.',
      'EXPERIENCE\nQueried the database for ad-hoc analysis'
    );
    const sugs = vocabularyInjectionRule(map, bullets, doc);
    expect(sugs.find((s) => s.type === 'keyword')).toBeUndefined();
    const gap = sugs.find((s) => s.type === 'learning_gap');
    expect(gap).toBeTruthy();
    // Editable draft with a blank — the escalation guard still holds: never renamed to "SQL".
    expect(gap!.editable).toBe(true);
    expect(gap!.requiresInput).toBe(true);
    expect(gap!.after).toContain(INPUT_SENTINEL);
    expect(gap!.after).not.toMatch(/SQL\//);
  });
});

describe('reorder rule (§4.5)', () => {
  it('emits a move keyed on stable bullet id and never edits text', () => {
    const { doc, bullets, map } = pipeline(
      'Required: SQL and Postgres.',
      'EXPERIENCE\nFiled paperwork and organized cabinets\nWrote Postgres queries to build weekly reports'
    );
    const sugs = reorderRule(map, bullets, doc);
    const move = sugs.find((s) => s.move);
    expect(move).toBeTruthy();
    expect(move!.move!.bulletId).toBeTruthy();
    // Text unchanged — a move is not an edit.
    expect(move!.before).toBe(move!.after);
    // No span (so it cannot conflict with a text rewrite on the same bullet).
    expect(move!.target?.span).toBeUndefined();
  });

  it('planMoves produces ops that yield the target order when applied in sequence', () => {
    const moves = planMoves(['a', 'b', 'c'], ['c', 'a', 'b']);
    const order = ['a', 'b', 'c'];
    for (const m of moves) {
      const idx = order.indexOf(m.bulletId);
      order.splice(idx, 1);
      if (m.afterBulletId) order.splice(order.indexOf(m.afterBulletId) + 1, 0, m.bulletId);
      else if (m.beforeBulletId) order.splice(order.indexOf(m.beforeBulletId), 0, m.bulletId);
      else order.unshift(m.bulletId);
    }
    expect(order).toEqual(['c', 'a', 'b']);
  });
});

describe('quantify rule (§4.5)', () => {
  it('emits an input-slot quantify suggestion for an unquantified high-weight bullet', () => {
    const { doc, bullets, map } = pipeline(
      'Required: deployment pipeline optimization. Must have deployment experience.',
      'EXPERIENCE\nReduced the deployment pipeline runtime'
    );
    const sugs = quantifyRule(map, bullets, doc);
    const q = sugs.find((s) => s.type === 'quantify');
    expect(q).toBeTruthy();
    expect(q!.requiresInput).toBe(true);
    expect(q!.after).toContain(INPUT_SENTINEL);
    expect((q!.inputSlots || []).length).toBeGreaterThan(0);
  });

  it('never re-binds an existing metric — stays silent on a quantified bullet', () => {
    const { doc, bullets, map } = pipeline(
      'Required: deployment pipeline optimization.',
      'EXPERIENCE\nReduced the deployment pipeline runtime by 40%'
    );
    const sugs = quantifyRule(map, bullets, doc);
    expect(sugs.find((s) => s.type === 'quantify')).toBeUndefined();
  });
});

describe('add-section rule (§4.5)', () => {
  it('drafts a Skills section listing ONLY demonstrated skills when JD is keyword-dense', () => {
    const experience =
      'Wrote Postgres queries\nBuilt React components\nProvisioned Kubernetes clusters\nAutomated deployment with Python';
    const doc = makeTwoSectionDoc('Experienced software engineer.', experience);
    const bullets = segmentDocumentBullets(doc.sections);
    const jd = 'Required: SQL, React, Kubernetes, Python, Docker, AWS. Must have all of these.';
    const reqs = buildRequirementLedger(jd);
    const map = mapEvidence(reqs, bullets);
    const sugs = addSectionRule(map, bullets, doc);
    const add = sugs.find((s) => s.type === 'structure' && s.after?.startsWith('SKILLS'));
    expect(add).toBeTruthy();
    expect(add!.after).toContain('SQL');
    expect(add!.after).toContain('React');
    expect(add!.after).toContain('Kubernetes');
    expect(add!.after).toContain('Python');
    // Never-evidenced skills cannot appear.
    expect(add!.after).not.toContain('Docker');
    expect(add!.after).not.toContain('AWS');
  });

  it('stays silent when a Skills section already exists', () => {
    const doc = makeImproveDoc('SKILLS\nSQL, React', 'skills', 'SKILLS');
    const bullets = segmentDocumentBullets(doc.sections);
    const reqs = buildRequirementLedger('Required: SQL, React, Kubernetes, Python, Docker, AWS.');
    const map = mapEvidence(reqs, bullets);
    expect(addSectionRule(map, bullets, doc)).toEqual([]);
  });
});

describe('buildImprovements — sequential acceptance (test 4)', () => {
  it('applies an accepted rewrite AND a later reorder; the move resolves by bulletId', () => {
    const raw =
      'EXPERIENCE\nFiled paperwork and organized cabinets\nWrote Postgres queries to build weekly reports';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const jd = 'Required: SQL and Postgres. Must have strong SQL.';
    const suggestions = buildImprovements(jd, doc);

    const rewrite = suggestions.find((s) => s.type === 'keyword');
    const move = suggestions.find((s) => s.move);
    expect(rewrite).toBeTruthy();
    expect(move).toBeTruthy();

    const accepted = suggestions.map<ResumeSuggestion>((s) =>
      s.id === rewrite!.id || s.id === move!.id ? { ...s, status: 'accepted' } : { ...s, status: 'rejected' }
    );
    const result = applyAcceptedSuggestions(doc, accepted);

    expect(result.applied).toContain(rewrite!.id);
    expect(result.applied).toContain(move!.id);
    // The rewritten bullet is promoted to the top, reworded with the canonical term.
    const rewrittenLine = 'Wrote SQL/Postgres queries to build weekly reports';
    const filedLine = 'Filed paperwork and organized cabinets';
    expect(result.text).toContain(rewrittenLine);
    expect(result.text.indexOf(rewrittenLine)).toBeLessThan(result.text.indexOf(filedLine));
  });
});

describe('buildImprovements — suggestion conflicts (test 5)', () => {
  it('dedupes overlapping suggestions so at most one targets a given bullet span', () => {
    const raw = 'EXPERIENCE\nWrote Postgres queries to build weekly reports';
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const jd = 'Required: SQL and Postgres. Must have strong SQL.';
    const suggestions = buildImprovements(jd, doc);
    const keywordSpans = suggestions
      .filter((s) => s.type === 'keyword' && s.target?.span)
      .map((s) => `${s.target!.span!.start}:${s.target!.span!.end}`);
    // No two keyword suggestions share the same span.
    expect(new Set(keywordSpans).size).toBe(keywordSpans.length);
  });

  it('never double-applies two overlapping accepted suggestions', () => {
    const raw = 'Wrote Postgres queries to build weekly reports';
    const doc = makeImproveDoc(raw);
    const span = { coordinateSpace: 'raw' as const, start: 0, end: raw.length };
    const mk = (id: string, after: string): ResumeSuggestion => ({
      id,
      type: 'keyword',
      target: { span },
      before: raw,
      after,
      reason: 'test',
      evidence: [],
      confidence: 0.8,
      risk: 'low',
      requiresUserApproval: true,
      status: 'accepted',
    });
    const result = applyAcceptedSuggestions(doc, [
      mk('s1', 'Wrote SQL/Postgres queries to build weekly reports'),
      mk('s2', 'Wrote MySQL/Postgres queries to build weekly reports'),
    ]);
    // Overlapping spans: the conflict guard prevents a double-apply.
    expect(result.applied.length).toBeLessThanOrEqual(1);
  });
});

describe('buildImprovements — JD divergence (test 8)', () => {
  const raw =
    'EXPERIENCE\nWrote Postgres queries to build weekly reports\nProvisioned infrastructure with Kubernetes';

  it('two postings with the same title but different requirements produce different advice', () => {
    const doc = makeImproveDoc(raw, 'experience', 'EXPERIENCE');
    const jdSql = 'Software Developer. Required: SQL and Postgres. Must have strong SQL skills.';
    const jdK8s = 'Software Developer. Required: Kubernetes and Docker. Must have Kubernetes orchestration.';

    const sqlSuggestions = buildImprovements(jdSql, doc);
    const k8sSuggestions = buildImprovements(jdK8s, doc);

    const sqlLabels = sqlSuggestions.map((s) => s.reason).join(' ');
    const k8sLabels = k8sSuggestions.map((s) => s.reason).join(' ');

    expect(sqlLabels).toContain('SQL');
    expect(k8sLabels).toContain('Kubernetes');
    // The ranked sets are materially different.
    expect(sqlLabels).not.toBe(k8sLabels);
  });
});

describe('JD-irrelevant bullets (Case C)', () => {
  it('offers a demote move rather than prose advice', () => {
    const doc = makeImproveDoc(
      'EXPERIENCE\nWrote reporting queries against Postgres\nCoached the office softball team',
      'experience',
      'EXPERIENCE'
    );
    const bullets = segmentDocumentBullets(doc.sections);
    const map = mapEvidence(buildRequirementLedger('Requirements:\n- Strong SQL skills are required'), bullets);
    const flags = reorderRule(map, bullets, doc).filter((s) => s.reason.includes('below'));

    expect(flags.length).toBeGreaterThan(0);
    const flag = flags[0];
    expect(flag.move).toBeTruthy();
    // The move stays inside the bullet's own entry — never across employers.
    const softball = bullets.find((b) => b.rawText.includes('softball'))!;
    expect(flag.move!.bulletId).toBe(softball.id);
    expect(flag.move!.entryId).toBe(softball.entryId);
  });
});
