/**
 * Career benchmark — invariants that must hold across the whole corpus.
 *
 * These are the checks that CAN fail. Every assertion here runs the real default pipeline
 * (`analyzeCareerFit` + `buildImprovements` — the flow a user without the Career Graph
 * feature flag actually gets) over 20 diverse résumé/JD pairs and asserts a property that
 * no single-fixture test could establish.
 *
 * The central one is fabrication: `build-suggestions.ts` states the safety law for the
 * graph path — "a `missing` or `adjacent` skill is NEVER turned into a résumé edit" — and
 * that law must hold on the lexical path too, or the default configuration is coaching
 * candidates to claim credentials they do not have.
 */
import { beforeAll, describe, it, expect } from 'vitest';
import { parseResumeSource } from '../../src/lib/career/parser/parse-resume';
import { analyzeCareerFit } from '../../src/lib/career/analysis/analyze-career';
import { buildImprovements } from '../../src/lib/career/improve/build-improvements';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { BENCHMARK_PAIRS } from '../fixtures/career-benchmark/pairs';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

interface Run {
  id: string;
  archetype: string;
  doc: ResumeDocument;
  suggestions: ResumeSuggestion[];
  unsupportedTerms: string[];
}

/** The exact pipeline `CareerPage` runs with no graph client injected. */
async function runDefaultPipeline(pair: (typeof BENCHMARK_PAIRS)[number]): Promise<Run> {
  const doc = await parseResumeSource({ type: 'paste', content: pair.resume });
  const analysis = analyzeCareerFit(doc, pair.jd);
  const improvements = buildImprovements(pair.jd, doc);
  return {
    id: pair.id,
    archetype: pair.archetype,
    doc,
    suggestions: [...(analysis.suggestions ?? []), ...improvements],
    unsupportedTerms: pair.unsupportedTerms,
  };
}

let runs: Run[] = [];

beforeAll(async () => {
  runs = await Promise.all(BENCHMARK_PAIRS.map(runDefaultPipeline));
});

function wordPresent(haystack: string, needle: string): boolean {
  const n = needle.toLowerCase().trim();
  if (!n) return false;
  if (/^[a-z0-9]+$/.test(n)) {
    return new RegExp(`(?:^|[^a-z0-9])${n}(?:[^a-z0-9]|$)`).test(haystack.toLowerCase());
  }
  return haystack.toLowerCase().includes(n);
}

describe('career benchmark — fabrication', () => {
  it('never proposes text introducing a credential the résumé has no evidence for', () => {
    const violations: string[] = [];

    for (const run of runs) {
      const resumeText = run.doc.rawText.toLowerCase();
      for (const sug of run.suggestions) {
        const proposed = sug.after ?? '';
        if (!proposed) continue; // a note with no edit cannot fabricate
        for (const term of run.unsupportedTerms) {
          // Only a term the résumé genuinely lacks can be fabricated by proposing it.
          if (wordPresent(resumeText, term)) continue;
          if (wordPresent(proposed, term)) {
            violations.push(`${run.id}: ${sug.type} would insert "${term}" — ${JSON.stringify(proposed)}`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('never lets an accepted edit put an unsupported credential into the applied text', () => {
    const violations: string[] = [];

    for (const run of runs) {
      const resumeText = run.doc.rawText.toLowerCase();
      const accepted = run.suggestions.map((s) => ({ ...s, status: 'accepted' as const }));
      const result = applyAcceptedSuggestions(run.doc, accepted);
      for (const term of run.unsupportedTerms) {
        if (wordPresent(resumeText, term)) continue;
        if (wordPresent(result.text, term)) {
          violations.push(`${run.id}: applied text now claims "${term}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

describe('career benchmark — coverage and prose', () => {
  it('produces at least one suggestion for every pair', () => {
    const silent = runs.filter((r) => r.suggestions.length === 0).map((r) => r.id);
    expect(silent).toEqual([]);
  });

  it('proposes no edit that mangles the sentence it rewrites', () => {
    const defects: string[] = [];
    for (const run of runs) {
      for (const sug of run.suggestions) {
        const after = sug.after ?? '';
        if (!after || !sug.before) continue;
        // A capital stamped mid-sentence, e.g. the old "reporting/Reports" splice.
        if (/[a-z]\/[A-Z]/.test(after)) {
          defects.push(`${run.id}: mid-sentence capital splice — ${JSON.stringify(after)}`);
        }
        // The same word repeated back to back after a rewrite.
        if (/\b(\w+)\s+\1\b/i.test(after)) {
          defects.push(`${run.id}: duplicated word — ${JSON.stringify(after)}`);
        }
      }
    }
    expect(defects).toEqual([]);
  });

  it('keeps advisory notes to a reviewable handful per résumé', () => {
    // Refusing to fabricate turned every missing JD term into a note. Honest, but a wall of
    // 20+ "you don't have this" cards is not review — it is a list nobody reads. The gap
    // report must be ranked and bounded to stay advice.
    const MAX_NOTES = 8;
    const overloaded = runs
      .map((r) => ({ id: r.id, notes: r.suggestions.filter((s) => !s.after).length }))
      .filter((r) => r.notes > MAX_NOTES);
    expect(overloaded).toEqual([]);
  });

  it('leaves the résumé byte-identical when every suggestion is rejected', () => {
    for (const run of runs) {
      const rejected = run.suggestions.map((s) => ({ ...s, status: 'rejected' as const }));
      const result = applyAcceptedSuggestions(run.doc, rejected);
      expect(result.text).toBe(run.doc.rawText);
    }
  });
});
