import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import CareerPage from '../../src/pages/Career/CareerPage';
import { createSeedCareerGraphClient } from '../../src/lib/career/graph/seed-client';

/**
 * End-to-end proof of the production wiring: this renders <CareerPage> with the
 * EXACT client `main.jsx` constructs when the seed flag is on — a real
 * `CareerGraphClient` driving the in-memory seed transport — and drives the full
 * UI flow: parse → confirm → occupation review → confirmed skill evidence.
 */
const RESUME_TEXT =
  'Jane Doe\nEXPERIENCE\nBuilt data pipelines with Python and SQL.\nSKILLS\nPython, SQL';
const AMBIGUOUS_JD =
  'We need Python, SQL, machine learning, data analysis, software testing, marketing strategy and SEO.';

async function parseAndConfirm() {
  fireEvent.change(screen.getByLabelText(/Your Experience/i), {
    target: { value: RESUME_TEXT },
  });
  fireEvent.change(screen.getByLabelText(/Target Job Description/i), {
    target: { value: AMBIGUOUS_JD },
  });
  fireEvent.click(screen.getByRole('button', { name: /Parse & Inspect Résumé/i }));
  await waitFor(() => {
    expect(screen.getByText(/What the parser saw/i)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: /Confirm & Align JD/i }));
}

describe('Career Graph seed wiring (production client → in-memory transport → UI)', () => {
  it('drives occupation confirmation then confirmed skill evidence through the real client', async () => {
    const client = createSeedCareerGraphClient();
    render(<CareerPage graphClient={client} />);

    await parseAndConfirm();

    // Ambiguous posting → the seed requests occupation confirmation.
    expect(
      await screen.findByRole('heading', { name: /Confirm target role/i })
    ).toBeVisible();
    expect(screen.getByText(/missing skills are paused/i)).toBeVisible();

    // Candidate confirms Data Scientists → classified skills are released.
    fireEvent.click(screen.getByRole('button', { name: /Data Scientists/i }));

    expect(await screen.findByText(/Essential skill coverage/i)).toBeVisible();
    // Evidence-first wording: a gap is "not found in this résumé", never a claim
    // that the candidate lacks the skill.
    expect(screen.getAllByText(/not found in this résumé/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/you do not have this skill/i)).toBeNull();

    client.dispose();
  });

  it('falls back to the lexical flow when no client is injected (default)', async () => {
    render(<CareerPage />);
    await parseAndConfirm();
    // Lexical flow completes straight to the scorecard, never the graph panels.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /Confirm target role/i })).toBeNull();
    });
  });
});
