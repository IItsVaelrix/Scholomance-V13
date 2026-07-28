/**
 * A suggestion card must show what it actually does.
 *
 * The review panel rendered every card as one before→after text diff. Two of the three card
 * shapes have no text change to show, so they rendered as nothing:
 *   - a MOVE changes position, not wording, so `before === after` renders "X → X";
 *   - an ADVISORY has no replacement text, so it renders "(None) → (None)".
 * Both also (correctly) hide the Edit button, because there is no text to edit — together
 * that reads as "it suggested nothing and won't let me fix it".
 *
 * The volume came from the reorder rule running over EVERY section: `segmentDocumentBullets`
 * flattens a contact block and a skills list into `ResumeBullet`s exactly like achievements,
 * so the rule proposed moving the candidate's own name and email.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { detectResumeSections } from '../../src/lib/career/parser/detect-sections';
import { segmentDocumentBullets } from '../../src/lib/career/parser/segment-bullets';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { reorderRule } from '../../src/lib/career/improve/rules/reorder';
import SuggestionReviewPanel from '../../src/pages/Career/SuggestionReviewPanel';
import type { ResumeDocument } from '../../src/lib/career/parser/types';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

const RESUME = `Angel Hernandez
itsvaelrix@gmail.com

EXPERIENCE
Customer Service Representative - GC Services
2021 - Present
Was responsible for maintaining reports in Excel
Trained new hires on company systems
Responsible for handling inbound customer calls

TECHNICAL & REMOTE READINESS
PII awareness
Wired internet
VoIP and AVAYA
Zoom
CRM systems`;

const JD = `Senior Customer Success Manager.
Required: SQL, Salesforce, data analysis, customer retention, stakeholder communication.
Must have experience with reporting dashboards and process improvement.
Preferred: team leadership, onboarding and training experience.`;

function reorderCards() {
  const sections = detectResumeSections(RESUME, []);
  const bullets = segmentDocumentBullets(sections);
  const doc = { rawText: RESUME, sections, contact: { links: [] } } as unknown as ResumeDocument;
  const map = mapEvidence(buildRequirementLedger(JD), bullets);
  return { sections, bullets, suggestions: reorderRule(map, bullets, doc) };
}

describe('reorder only proposes moves where line order is an argument', () => {
  it('never proposes moving a contact line', () => {
    const { suggestions } = reorderCards();
    const moved = suggestions.map((s) => s.before);
    expect(moved).not.toContain('Angel Hernandez');
    expect(moved).not.toContain('itsvaelrix@gmail.com');
  });

  it('never proposes reshuffling a skills / readiness list', () => {
    const { suggestions } = reorderCards();
    const moved = suggestions.map((s) => s.before);
    for (const item of ['PII awareness', 'Wired internet', 'VoIP and AVAYA', 'Zoom', 'CRM systems']) {
      expect(moved).not.toContain(item);
    }
  });

  it('every emitted move targets an experience-section bullet', () => {
    const { sections, bullets, suggestions } = reorderCards();
    const kindById = new Map(sections.map((s) => [s.id, s.kind]));
    const bulletById = new Map(bullets.map((b) => [b.id, b]));
    expect(suggestions.length).toBeGreaterThan(0);
    for (const sug of suggestions) {
      const bullet = bulletById.get(sug.move!.bulletId)!;
      expect(kindById.get(bullet.sectionId)).toBe('experience');
    }
  });

  it('states the destination in words, since the diff cannot show it', () => {
    const { suggestions } = reorderCards();
    for (const sug of suggestions) {
      expect(sug.reason).toMatch(/position \d+|end of this role/i);
    }
  });
});

const noop = () => {};

function renderCard(sug: ResumeSuggestion) {
  render(
    <SuggestionReviewPanel
      suggestions={[sug]}
      onAccept={noop}
      onReject={noop}
      onEdit={vi.fn()}
      onAcceptAllLowRisk={noop}
    />
  );
}

describe('the panel renders each card as what it is', () => {
  const moveCard: ResumeSuggestion = {
    id: 'sug:move:1',
    type: 'structure',
    target: { sectionId: 'section:experience:0:10' },
    before: 'Trained new hires on company systems',
    after: 'Trained new hires on company systems',
    reason: 'Move it from position 3 to position 1 of 3 in this role.',
    evidence: [],
    confidence: 0.7,
    risk: 'low',
    requiresUserApproval: true,
    status: 'pending',
    editable: false,
    move: { bulletId: 'bullet:1', entryId: 'entry:1' },
  };

  const advisoryCard: ResumeSuggestion = {
    id: 'sug:gap:1',
    type: 'learning_gap',
    reason: 'The job description asks for "Salesforce", which does not appear in your résumé.',
    evidence: [],
    confidence: 0.6,
    risk: 'low',
    requiresUserApproval: true,
    status: 'pending',
    editable: false,
  };

  it('a move does not render a before→after diff that shows no change', () => {
    renderCard(moveCard);
    expect(screen.queryByText('Before:')).toBeNull();
    expect(screen.queryByText('After:')).toBeNull();
    expect(screen.getByText(/move \(wording unchanged\)/i)).toBeTruthy();
    expect(screen.getByText('Trained new hires on company systems')).toBeTruthy();
  });

  it('a move says where it goes', () => {
    renderCard(moveCard);
    expect(screen.getByText(/position 3 to position 1/i)).toBeTruthy();
  });

  it('an advisory never renders "(None)" as its suggested text', () => {
    renderCard(advisoryCard);
    expect(screen.queryByText('(None)')).toBeNull();
    expect(screen.queryByText('Before:')).toBeNull();
    expect(screen.getByText(/no edit drafted/i)).toBeTruthy();
  });

  it('an ordinary text edit still renders the before→after diff', () => {
    renderCard({
      ...advisoryCard,
      id: 'sug:kw:1',
      type: 'keyword',
      before: 'Wrote Postgres queries for reports',
      after: 'Wrote SQL/Postgres queries for reports',
      editable: true,
    });
    expect(screen.getByText('Before:')).toBeTruthy();
    expect(screen.getByText('After:')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });
});
