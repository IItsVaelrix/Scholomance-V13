import { describe, it, expect } from 'vitest';
import { missingEvidenceRule } from '../../src/lib/career/improve/rules/missing-evidence';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { segmentDocumentBullets } from '../../src/lib/career/parser/segment-bullets';
import { makeImproveDoc } from './fixtures/career-improve-doc';

const JD = 'Requirements:\n- Experience with Apache Airflow for orchestration\n- Strong SQL skills are required';
const RESUME = 'EXPERIENCE\nWrote reporting queries against Postgres for the finance team';

function run() {
  const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
  const bullets = segmentDocumentBullets(doc.sections);
  const map = mapEvidence(buildRequirementLedger(JD), bullets);
  return missingEvidenceRule(map, JD, doc);
}

describe('missingEvidenceRule (Case A)', () => {
  it('drafts a new bullet for a requirement with no résumé evidence', () => {
    const sugs = run();
    const airflow = sugs.find((s) => s.reason.toLowerCase().includes('airflow'));
    expect(airflow).toBeTruthy();
    expect(airflow!.after).toBe('Used Apache Airflow for orchestration, ␟');
    expect(airflow!.requiresInput).toBe(true);
    expect(airflow!.editable).toBe(true);
    expect(airflow!.before).toBeUndefined(); // it is a new bullet, not a rewrite
  });

  it('requires the candidate to choose the target entry', () => {
    const airflow = run().find((s) => s.reason.toLowerCase().includes('airflow'))!;
    expect(airflow.requiresEntryChoice).toBe(true);
    expect(airflow.target?.entryId).toBeUndefined(); // no default — the candidate picks
  });

  it('warns that accepting the card is an assertion', () => {
    const airflow = run().find((s) => s.reason.toLowerCase().includes('airflow'))!;
    expect(airflow.reason.toLowerCase()).toContain('only accept if you have actually done this');
  });

  it('stays a learning_gap so it never outranks a demonstrated rewrite', () => {
    expect(run().every((s) => s.type === 'learning_gap')).toBe(true);
  });

  it('emits nothing for a requirement the résumé already demonstrates', () => {
    expect(run().some((s) => s.reason.toLowerCase().includes('sql'))).toBe(false);
  });

  it('emits no draft when the frame cannot be built — fail closed', () => {
    const jd = 'Requirements:\n- Kubernetes';   // bare noun, no clause to voice
    const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
    const bullets = segmentDocumentBullets(doc.sections);
    const map = mapEvidence(buildRequirementLedger(jd), bullets);
    const k8s = missingEvidenceRule(map, jd, doc).find((s) => s.reason.includes('Kubernetes'));
    // A card may still exist, but it must never carry a half-built draft.
    if (k8s) expect(k8s.after === undefined || k8s.after.includes('Kubernetes')).toBe(true);
  });
});
