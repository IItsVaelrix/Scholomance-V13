/**
 * buildImprovements — the single entry point the UI calls (spec §4.6).
 *
 * Orchestrates: segment-bullets → requirement ledger → tiered bridge → evidence map →
 * the four improvement rules, then dedupes overlapping suggestions and orders by
 * requirement weight. Returns the SAME `ResumeSuggestion[]` shape the review panel already
 * renders, so the four JD-driven types slot into the existing Accept/Edit/Reject flow.
 */
import type { ResumeDocument } from '../parser/types.js';
import type { ResumeSuggestion } from '../analysis/types.js';
import type { CareerGraphQueryPort } from '../graph/reference-query.js';
import { segmentDocumentBullets } from '../parser/segment-bullets.js';
import { buildRequirementLedger } from './requirement-ledger.js';
import { mapEvidence } from './evidence-map.js';
import { vocabularyInjectionRule } from './rules/vocabulary-injection.js';
import { reorderRule } from './rules/reorder.js';
import { quantifyRule } from './rules/quantify.js';
import { addSectionRule } from './rules/add-section.js';
import { missingEvidenceRule } from './rules/missing-evidence.js';
import type { CanonicalSkill, Requirement } from './types.js';

/** Fixed rule priority for overlap dedupe and ordering (lower = preferred). */
const TYPE_PRIORITY: Record<string, number> = {
  keyword: 0,
  quantify: 1,
  structure: 2,
  learning_gap: 3,
};

function spansOverlap(
  a: ResumeSuggestion,
  b: ResumeSuggestion
): boolean {
  const ra = a.target?.span;
  const rb = b.target?.span;
  if (!ra || !rb) return false;
  return ra.start < rb.end && rb.start < ra.end;
}

/** Greedy overlap dedupe: walk in priority order, drop any suggestion overlapping a kept one. */
function dedupeOverlapping(suggestions: ResumeSuggestion[]): ResumeSuggestion[] {
  const prioritized = [...suggestions].sort((a, b) => {
    const pa = TYPE_PRIORITY[a.type] ?? 9;
    const pb = TYPE_PRIORITY[b.type] ?? 9;
    if (pa !== pb) return pa - pb;
    return (b.confidence || 0) - (a.confidence || 0);
  });

  const kept: ResumeSuggestion[] = [];
  for (const sug of prioritized) {
    if (kept.some((k) => spansOverlap(k, sug))) continue;
    kept.push(sug);
  }
  return kept;
}

function buildWeightLookup(requirements: Requirement[]): Map<string, number> {
  const lookup = new Map<string, number>();
  for (const req of requirements) {
    if (req.canonicalConceptId) lookup.set(req.canonicalConceptId, req.weight);
    if (req.canonicalLabel) lookup.set(req.canonicalLabel.toLowerCase(), req.weight);
    lookup.set(req.term.toLowerCase(), req.weight);
  }
  return lookup;
}

function suggestionWeight(sug: ResumeSuggestion, lookup: Map<string, number>): number {
  if (sug.conceptId && lookup.has(sug.conceptId)) return lookup.get(sug.conceptId)!;
  // Fall back to the evidence text (often the canonical label / term).
  for (const ev of sug.evidence) {
    if (ev.text && lookup.has(ev.text.toLowerCase())) return lookup.get(ev.text.toLowerCase())!;
  }
  return 0;
}

export function buildImprovements(
  jdText: string,
  doc: ResumeDocument,
  graphPort?: CareerGraphQueryPort,
  canonicalSkills?: readonly CanonicalSkill[]
): ResumeSuggestion[] {
  if (!doc || !String(jdText ?? '').trim()) return [];

  const bullets = segmentDocumentBullets(doc.sections || []);
  const requirements = buildRequirementLedger(jdText, graphPort, canonicalSkills);
  if (requirements.length === 0) return [];

  const evidenceMap = mapEvidence(requirements, bullets);

  const suggestions: ResumeSuggestion[] = [
    ...vocabularyInjectionRule(evidenceMap, bullets, doc),
    ...reorderRule(evidenceMap, bullets, doc),
    ...quantifyRule(evidenceMap, bullets, doc),
    ...addSectionRule(evidenceMap, bullets, doc),
    ...missingEvidenceRule(evidenceMap, jdText, doc),
  ];

  const deduped = dedupeOverlapping(suggestions);
  const lookup = buildWeightLookup(requirements);

  // Order by requirement weight (desc), then rule priority, then id for determinism.
  deduped.sort((a, b) => {
    const wa = suggestionWeight(a, lookup);
    const wb = suggestionWeight(b, lookup);
    if (wb !== wa) return wb - wa;
    const pa = TYPE_PRIORITY[a.type] ?? 9;
    const pb = TYPE_PRIORITY[b.type] ?? 9;
    if (pa !== pb) return pa - pb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return applyGapBudget(deduped);
}

/**
 * How many adjacent-evidence gap notes the advisor contributes. `analyzeCareerFit` reports
 * its own missing-keyword gaps alongside these, so the two budgets add up in the panel.
 */
const MAX_ADVISOR_GAPS = 3;

/**
 * Cap advisory notes, keeping actionable edits untouched.
 *
 * A gap note costs the candidate attention and returns no edit, so past the first few they
 * crowd out the suggestions that actually change the résumé. The list arrives sorted by
 * requirement weight, so the survivors are the heaviest — no re-ranking, order preserved.
 */
function applyGapBudget(suggestions: ResumeSuggestion[]): ResumeSuggestion[] {
  let gaps = 0;
  return suggestions.filter((s) => {
    if (s.type !== 'learning_gap') return true;
    gaps += 1;
    return gaps <= MAX_ADVISOR_GAPS;
  });
}
