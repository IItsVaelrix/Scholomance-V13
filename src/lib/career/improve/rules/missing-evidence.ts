/**
 * Missing Evidence rule (Case A) — a requirement the résumé shows nothing for.
 *
 * The old card said "add it in your own words" and offered nothing. This one drafts a
 * bullet out of the employer's own phrasing and hands the candidate the blanks. The tool
 * supplies the sentence frame; the candidate supplies every fact AND the employer it
 * belongs under. Accepting the card is the candidate's assertion, which is why the reason
 * text says so in as many words.
 *
 * The card stays `learning_gap`: being actionable does not make it better-evidenced than a
 * demonstrated rewrite, so it keeps the lowest rule priority and stays inside the gap
 * budget.
 */
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import type { ResumeDocument } from '../../parser/types.js';
import type { EvidenceMap } from '../types.js';
import { buildPhraseFrame } from '../jd-phrase-frame.js';

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * True when some OTHER requirement in the map already has evidence and its term is a
 * whole-word substring of this one. The ledger mines overlapping n-grams from the same
 * clause ("sql" / "sql skills" / "strong sql"); only the canonical form gets resolved
 * against the résumé, so the scaffolding-padded variants surface as their own "missing"
 * entries even though the content word is demonstrated. Without this check the rule would
 * draft a second, contradictory card for a requirement the résumé already satisfies.
 */
function coveredByEvidencedSibling(term: string, map: EvidenceMap): boolean {
  const t = term.toLowerCase();
  return map.some((other) => {
    if (other.support === 'missing') return false;
    const otherTerm = other.requirement.term.toLowerCase();
    if (otherTerm === t) return false;
    return new RegExp(`(?:^|\\s)${escapeRegExp(otherTerm)}(?:\\s|$)`).test(t);
  });
}

export function missingEvidenceRule(
  map: EvidenceMap,
  jdText: string,
  _doc: ResumeDocument
): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const entry of map) {
    if (entry.support !== 'missing') continue;
    const req = entry.requirement;
    if (!req.jdEvidence?.length) continue; // nothing to quote back — stay silent
    if (coveredByEvidencedSibling(req.term, map)) continue; // n-gram noise around an already-evidenced term

    const label = req.canonicalLabel || req.term;
    const frame = buildPhraseFrame(jdText, req);
    const id = makeSuggestionId('learning_gap', req.term, `missing:${label}`);

    if (!frame) {
      // Fail closed: no draft, keep the honest instruction.
      suggestions.push({
        id,
        type: 'learning_gap',
        reason: `The job description asks for "${label}", which does not appear in your résumé. If you have this experience, add it in your own words with a concrete example; if you do not, this is a real gap to close rather than a word to insert.`,
        evidence: [
          { source: 'job_description', rule: 'missing_evidence', span: req.jdEvidence[0], text: label, confidence: 0.6 },
        ],
        confidence: 0.6,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        conceptId: req.canonicalConceptId,
        editable: false,
      });
      continue;
    }

    suggestions.push({
      id,
      type: 'learning_gap',
      target: { insertionPoint: 'after_section' },
      after: frame.text,
      reason: `The job description asks for "${label}" and your résumé does not mention it. ⚠ Only accept if you have actually done this — filling this in states it as fact in your own words.`,
      evidence: [
        { source: 'job_description', rule: 'missing_evidence', span: frame.sourceSpan, text: frame.sourceClause, confidence: 0.6 },
      ],
      confidence: 0.6,
      risk: 'medium',
      requiresUserApproval: true,
      status: 'pending',
      requiresInput: true,
      requiresEntryChoice: true,
      inputSlots: frame.slots.map((slot, index) => ({
        id: `${id}:slot:${index}`,
        placeholder: slot.placeholder,
        hint: slot.hint,
      })),
      conceptId: req.canonicalConceptId,
      editable: true,
    });
  }

  // Deterministic order: heaviest requirement first, then id.
  return suggestions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
