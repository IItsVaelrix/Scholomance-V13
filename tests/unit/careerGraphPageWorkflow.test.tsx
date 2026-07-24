import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CareerPage from '../../src/pages/Career/CareerPage';
import SkillEvidencePanel from '../../src/pages/Career/SkillEvidencePanel';
import TargetRolePanel from '../../src/pages/Career/TargetRolePanel';
import {
  makeAmbiguousOccupationAnalysis,
  makeCareerGraphAnalysis,
  makeGraphClient,
  missingSqlSkill,
  missingAndAdjacentSkills,
  demonstratedSqlSkill,
} from '../fixtures/career-graph/runtime-fixtures';

const RESUME_TEXT =
  'Jane Doe\nEXPERIENCE\nBuilt data pipelines and reporting.\nSKILLS\nPython';
const JD_TEXT = 'Technical Product Manager; SQL reporting experience required.';

/** Drive the page from blank -> parsed -> confirmed (graph flow runs on confirm). */
async function submitResumeAndJob() {
  fireEvent.change(screen.getByLabelText(/Your Experience/i), {
    target: { value: RESUME_TEXT },
  });
  fireEvent.change(screen.getByLabelText(/Target Job Description/i), {
    target: { value: JD_TEXT },
  });
  fireEvent.click(screen.getByRole('button', { name: /Parse & Inspect Résumé/i }));
  await waitFor(() => {
    expect(screen.getByText(/What the parser saw/i)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /Confirm & Align JD/i }));
}

describe('Task 17: Career Graph occupation review + skill evidence UI', () => {
  const ambiguousGraphClient = makeGraphClient({
    analysis: makeAmbiguousOccupationAnalysis(),
  });

  it('requires confirmation when more than three families are ambiguous', async () => {
    render(<CareerPage graphClient={ambiguousGraphClient} />);
    await submitResumeAndJob();

    expect(
      await screen.findByRole('heading', { name: /Confirm target role/i })
    ).toBeVisible();
    expect(screen.getByText(/missing skills are paused/i)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /Technical Product Manager/i }));

    expect(await screen.findByText(/Essential skill coverage/i)).toBeVisible();
  });

  it('explains not-found versus does-not-possess', () => {
    const missingSkillFixture = makeCareerGraphAnalysis({ skills: [missingSqlSkill] });
    render(<SkillEvidencePanel analysis={missingSkillFixture} />);

    expect(screen.getByText(/not found in this résumé/i)).toBeVisible();
    expect(screen.queryByText(/you do not have this skill/i)).toBeNull();
  });

  it('groups demonstrated and adjacent skills and shows evidence trails', () => {
    render(
      <SkillEvidencePanel
        analysis={makeCareerGraphAnalysis({
          skills: [...missingAndAdjacentSkills, demonstratedSqlSkill],
        })}
      />
    );

    expect(screen.getByText(/Demonstrated/)).toBeVisible();
    expect(screen.getByText(/Adjacent/)).toBeVisible();
    expect(screen.getAllByText(/Canonical skill:/).length).toBeGreaterThan(0);
    // A demonstrated skill reports résumé evidence, not absence.
    expect(screen.getByText(/demonstrated in this résumé/i)).toBeVisible();
  });

  it('lists occupation candidates in confirmation mode', () => {
    render(
      <TargetRolePanel
        analysis={makeAmbiguousOccupationAnalysis()}
        needsConfirmation
        onConfirmOccupation={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /Software Developers/i })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Technical Product Manager/i })
    ).toBeVisible();
  });

  it('shows a confirmed target role summary after selection', () => {
    const analysis = makeAmbiguousOccupationAnalysis();
    render(
      <TargetRolePanel
        analysis={analysis}
        confirmedOccupationId="onet:15-1252.00-tpm"
      />
    );

    expect(screen.getByText('Technical Product Manager')).toBeVisible();
    expect(screen.queryByRole('heading', { name: /Confirm target role/i })).toBeNull();
  });
});
