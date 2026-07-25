/**
 * Quantify rule — JD-driven (spec §4.5).
 *
 * `type: 'quantify'`; fires on bullets supporting a HIGH-WEIGHT requirement that state
 * impact without a metric. It only ever emits a U+241F input slot the candidate must fill
 * (requiresInput blocks Accept until filled); it NEVER re-binds an existing metric to a
 * different object — an already-quantified bullet is left untouched (the safe path).
 * Honesty: claim-preservation guard + the sentinel-keyed apply guard (§5.4).
 */
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion, SuggestionInputSlot } from '../../analysis/types.js';
import type { ResumeDocument } from '../../parser/types.js';
import type { EvidenceMap, ResumeBullet } from '../types.js';
import { leadingVerb, isQuantified, classifyObject, type AccomplishmentLine } from '../../amplify/primitives.js';
import {
  MEASURABLE_VERB_CLASS,
  METRIC_TEMPLATES,
  INPUT_SENTINEL,
} from '../../amplify/data/verb-classes.js';
import { extractClaim, assertClaimPreserved, PERMITS } from '../honesty/claim-preservation.js';

const HIGH_WEIGHT = 0.5;

/**
 * Resolve the metric template for a bullet, guarding against frame fabrication (honesty
 * correction). The `team` template asserts "managing a team of N" — a claim that is only
 * truthful when the source bullet actually references a people object (team/staff/…).
 * "Independently managed communications" or "Managed caregiver scheduling" do NOT state a
 * team, so offering the team frame would fabricate one (the "managing a team of 10/2"
 * bug). In that case we downgrade to the generic `open` outcome slot, which lets the
 * candidate quantify their REAL impact without putting words (or headcounts) in their
 * mouth. The number itself still only enters via the candidate-filled slot.
 */
function resolveMetricTemplate(verb: string, line: AccomplishmentLine, verbEndOffset: number) {
  const metricClass = MEASURABLE_VERB_CLASS[verb.toLowerCase()];
  if (!metricClass) return null;
  if (metricClass === 'team') {
    const obj = classifyObject(line, verbEndOffset);
    const hasPeopleObject = obj?.objectClass === 'people';
    if (!hasPeopleObject) {
      // No team/people in the source — never assert "managing a team of N".
      return { metricClass: 'open' as const, template: METRIC_TEMPLATES.open };
    }
  }
  return { metricClass, template: METRIC_TEMPLATES[metricClass] };
}

export function quantifyRule(
  map: EvidenceMap,
  bullets: ResumeBullet[],
  _doc: ResumeDocument
): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];
  const bulletById = new Map(bullets.map((b) => [b.id, b]));
  const seen = new Set<string>();

  // High-weight requirements only.
  const highWeight = map.filter(
    (e) => e.requirement.weight >= HIGH_WEIGHT && e.support !== 'missing'
  );

  for (const entry of highWeight) {
    const label = entry.requirement.canonicalLabel || entry.requirement.term;
    for (const be of entry.bullets) {
      const bullet = bulletById.get(be.bulletId);
      if (!bullet || seen.has(bullet.id)) continue;
      if (isQuantified(bullet.rawText)) continue; // never re-bind an existing metric

      const line: AccomplishmentLine = {
        text: bullet.rawText,
        span: bullet.sourceSpan,
        sectionKind: 'experience',
      };
      const verb = leadingVerb(line);
      if (!verb) continue;
      const resolved = resolveMetricTemplate(verb.verb, line, verb.offsetInLine + verb.verb.length);
      if (!resolved) continue;
      const { metricClass, template } = resolved;

      const tail = /[.;:!?]+$/.exec(bullet.rawText);
      const stemText = tail ? bullet.rawText.slice(0, -tail[0].length) : bullet.rawText;
      const after = stemText + template.clause + (tail ? tail[0] : '');

      // Claim-preservation guard (fail closed). The sentinel clause adds no digit, so no
      // quantity is fabricated; role and object must be preserved.
      const beforeClaim = extractClaim(bullet.rawText, bullet.sourceSpan);
      const afterClaim = extractClaim(after, bullet.sourceSpan);
      if (!beforeClaim || !afterClaim) continue;
      const claim = assertClaimPreserved(beforeClaim, afterClaim, PERMITS.quantify);
      if (!claim.ok) continue;

      seen.add(bullet.id);

      const id = makeSuggestionId('quantify', bullet.id, `jd:${label}:${metricClass}`);
      const inputSlots: SuggestionInputSlot[] = template.slots.map((slot, index) => ({
        id: `${id}:slot:${index}`,
        placeholder: slot.placeholder,
        hint: slot.hint,
      }));

      suggestions.push({
        id,
        type: 'quantify',
        target: { span: bullet.sourceSpan, sectionId: bullet.sectionId },
        before: bullet.rawText,
        after,
        reason: `This bullet supports "${label}" (a high-weight JD requirement) but states no result. Fill in your own numbers — nothing is written until every blank is filled.`,
        evidence: [
          {
            source: 'resume',
            rule: 'jd_quantify',
            span: bullet.sourceSpan,
            text: bullet.rawText,
            confidence: 0.75,
          },
        ],
        confidence: 0.75,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        requiresInput: after.includes(INPUT_SENTINEL),
        inputSlots,
        conceptId: entry.requirement.canonicalConceptId,
        editable: true,
      });
    }
  }

  return suggestions;
}
