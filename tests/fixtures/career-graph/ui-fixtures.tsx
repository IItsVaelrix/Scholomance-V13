/**
 * Shared Career Graph UI fixtures (Task 17).
 *
 * Privacy sentinel fixture + a ready-to-render complete-state panel + a helper
 * that runs an analysis through an in-memory graph client. Résumé/JD text in
 * the privacy fixture is a sentinel — real user text never leaves the browser.
 */
import React from 'react';
import SkillEvidencePanel from '../../../src/pages/Career/SkillEvidencePanel';
import {
  makeCareerGraphAnalysis,
  makeGraphClient,
  missingSqlSkill,
} from './runtime-fixtures';

/** Sentinel-only fixture: proves no real résumé/JD text is embedded in tests. */
export function makePrivateCareerFixture() {
  return {
    resumeText: 'PRIVATE_RESUME_SENTINEL',
    jobDescriptionText: 'PRIVATE_JOB_SENTINEL',
  };
}

/** A complete-state SkillEvidencePanel backed by a single missing skill. */
export function CareerGraphCompleteFixture() {
  return (
    <SkillEvidencePanel
      analysis={makeCareerGraphAnalysis({ skills: [missingSqlSkill] })}
    />
  );
}

/** Run an analysis through an in-memory graph client (no Worker / SQLite). */
export async function runCareerAnalysis(input: {
  resumeText: string;
  jobDescriptionText: string;
}) {
  const client = makeGraphClient({ analysis: makeCareerGraphAnalysis() });
  return client.analyze(input);
}
