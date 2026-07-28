/**
 * Vocabulary Injection rule (spec §4.5).
 *
 * Fires ONLY on `demonstrated` requirements whose supporting bullet does not already use
 * the canonical term. Rewords the bullet to name the canonical term (e.g. "wrote Postgres
 * queries" → "wrote SQL/Postgres queries"). Every draft passes the token-provenance and
 * claim-preservation guards before emission; a draft that fails is discarded (silence).
 *
 * An `adjacent` match is NEVER renamed to the canonical term (that is the escalation
 * path) — it instead yields a non-rewriting `learning_gap` note telling the candidate
 * what explicit evidence would upgrade it.
 */
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion, AnalysisEvidence } from '../../analysis/types.js';
import type { ResumeDocument } from '../../parser/types.js';
import type { EvidenceMap, ResumeBullet } from '../types.js';
import { assertTokenProvenance } from '../honesty/token-provenance.js';
import { stemToken } from '../skill-phrase-bridge.js';
import { extractClaim, assertClaimPreserved, PERMITS } from '../honesty/claim-preservation.js';
import { INPUT_SENTINEL } from '../../amplify/data/input-sentinel.js';

function wordPresent(text: string, term: string): boolean {
  const t = term.toLowerCase().trim();
  if (!t) return false;
  if (/^[a-z0-9]+$/.test(t)) {
    return new RegExp(`(?:^|[^a-z0-9])${t}(?:[^a-z0-9]|$)`, 'i').test(text);
  }
  return text.toLowerCase().includes(t);
}

/** Stem-normalized tokens of a phrase, for "is this the same word?" comparisons. */
function stemTokens(phrase: string): string[] {
  return (String(phrase ?? '').toLowerCase().match(/[a-z0-9+#]+/g) ?? []).map(stemToken);
}

/** Shortest stem length at which a prefix relation is treated as the same root. */
const MIN_ROOT_LENGTH = 4;

/**
 * True when two phrases reduce to the same root — stem equality, or a prefix relation
 * between stems long enough to be meaningful ("mentor" ⊂ "mentorship", "supervis" ⊂
 * "supervision"). Mirrors the bridge's own token-matching rule.
 */
function sameRoot(a: string, b: string): boolean {
  const sa = stemTokens(a);
  const sb = stemTokens(b);
  if (sa.length !== sb.length) return false;
  return sa.every((tok, i) => {
    const other = sb[i];
    if (tok === other) return true;
    if (tok.length < MIN_ROOT_LENGTH || other.length < MIN_ROOT_LENGTH) return false;
    return tok.startsWith(other) || other.startsWith(tok);
  });
}

/** Insert the canonical label adjacent to the demonstrated anchor phrase. */
function injectCanonical(
  bulletText: string,
  matchedPhrase: string,
  canonicalLabel: string
): string | null {
  if (wordPresent(bulletText, canonicalLabel)) return null; // already named
  const mp = matchedPhrase.toLowerCase().trim();
  if (!mp || mp === canonicalLabel.toLowerCase()) return null;
  // The anchor and the canonical term are the same root ("reports" ⇄ "reporting",
  // "Mentored" ⇄ "mentorship", "Supervised" ⇄ "supervision"). If the bridge would treat
  // the two as the same token, splicing one beside the other adds no keyword an ATS could
  // not already read off the stem — and it wrecks the prose. Same-root covers derivational
  // suffixes, so the test is a prefix relation between stems, not equality.
  if (sameRoot(mp, canonicalLabel)) return null;

  const idx = bulletText.toLowerCase().indexOf(mp);
  if (idx === -1) return null; // no anchor → cannot inject without fabrication risk

  // Never prepend a lowercase canonical term to the start of a bullet: "leadership/Led the
  // team" opens the line in lowercase and reads as a typo.
  if (idx === 0 && canonicalLabel[0] !== canonicalLabel[0]?.toUpperCase()) return null;

  // Splice the anchor through unchanged: force-capitalizing it stamps a capital mid-sentence.
  const original = bulletText.slice(idx, idx + mp.length);
  return bulletText.slice(0, idx) + `${canonicalLabel}/${original}` + bulletText.slice(idx + mp.length);
}

/**
 * Sections whose lines are ACCOMPLISHMENTS — the only place a "… using ␟" rewrite may hang.
 *
 * Every section is flattened into `ResumeBullet`s by `segmentDocumentBullets`, so a skills
 * or readiness list arrives here shaped exactly like an achievement list. Appending " using
 * X" to one of those items fuses two facts the résumé listed SEPARATELY into a relationship
 * it never asserted: a candidate who lists "Consultative Needs Assessment" and "Zoom" on
 * adjacent lines has not claimed they did the former using the latter. The claim guards
 * cannot catch it — every token is provenanced, and the candidate types the value — because
 * the fabrication is the RELATION, not the words. Only the section boundary can.
 */
const ACCOMPLISHMENT_SECTION_KINDS: ReadonlySet<string> = new Set(['experience', 'projects']);

export function vocabularyInjectionRule(
  map: EvidenceMap,
  bullets: ResumeBullet[],
  doc: ResumeDocument
): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];
  const bulletById = new Map(bullets.map((b) => [b.id, b]));
  const sectionKindById = new Map((doc?.sections || []).map((s) => [s.id, s.kind]));
  const isAccomplishmentBullet = (bullet: ResumeBullet): boolean =>
    ACCOMPLISHMENT_SECTION_KINDS.has(sectionKindById.get(bullet.sectionId) ?? '');
  /** Anchor (bullet + matched phrase) → the gap note currently speaking for it. */
  const gapByAnchor = new Map<string, { weight: number; suggestion: ResumeSuggestion }>();

  for (const entry of map) {
    const req = entry.requirement;
    const canonicalLabel = req.canonicalLabel || req.term;

    if (entry.support === 'demonstrated') {
      for (const be of entry.bullets) {
        if (be.tier !== 'demonstrated') continue;
        const bullet = bulletById.get(be.bulletId);
        if (!bullet) continue;
        if (wordPresent(bullet.rawText, canonicalLabel)) continue; // already uses it

        const after = injectCanonical(bullet.rawText, be.matchedPhrase, canonicalLabel);
        if (!after || after === bullet.rawText) continue;

        // Honesty guard: token provenance + claim preservation. Fail closed.
        const provenance = assertTokenProvenance(bullet.rawText, after, [
          canonicalLabel,
          be.matchedPhrase,
          req.term,
        ]);
        if (!provenance.ok) continue;

        const beforeClaim = extractClaim(bullet.rawText, bullet.sourceSpan);
        const afterClaim = extractClaim(after, bullet.sourceSpan);
        if (!beforeClaim || !afterClaim) continue; // fail closed
        const claim = assertClaimPreserved(beforeClaim, afterClaim, PERMITS.vocabulary);
        if (!claim.ok) continue;

        const evidence: AnalysisEvidence[] = [];
        if (req.jdEvidence[0]) {
          evidence.push({
            source: 'job_description',
            rule: 'vocabulary_injection',
            span: req.jdEvidence[0],
            text: canonicalLabel,
            confidence: 0.85,
          });
        }
        evidence.push({
          source: 'resume',
          rule: 'vocabulary_injection',
          span: bullet.sourceSpan,
          text: be.matchedPhrase,
          confidence: 0.85,
        });

        suggestions.push({
          id: makeSuggestionId('keyword', bullet.id, `${canonicalLabel}:${req.term}`),
          type: 'keyword',
          target: { span: bullet.sourceSpan, sectionId: bullet.sectionId },
          before: bullet.rawText,
          after,
          reason: `The job description asks for "${canonicalLabel}". Your bullet already demonstrates it via "${be.matchedPhrase}" — name the canonical term so ATS and recruiters see it.`,
          evidence,
          confidence: 0.85,
          risk: 'low',
          requiresUserApproval: true,
          status: 'pending',
          conceptId: req.canonicalConceptId,
          editable: true,
        });
      }
    } else if (entry.support === 'adjacent') {
      // Adjacent is NOT renamed — emit a non-editable gap note (the escalation guard).
      // The note quotes the requirement back to the candidate, so it may only speak for a
      // requirement the JD literally states. Derived n-grams ("senior customer") carry no
      // `jdEvidence` span and would be putting words in the employer's mouth.
      if (!req.jdEvidence?.length) continue;
      const firstAdjacent = entry.bullets.find((b) => b.tier === 'adjacent');
      // One note per piece of résumé evidence. Overlapping requirements mined from the same
      // JD phrase ("customer retention" / "customer success" / "senior customer") all rest
      // on the same word in the same bullet and would otherwise stack up as near-identical
      // cards; the heaviest requirement speaks for the group.
      const anchorKey = `${firstAdjacent?.bulletId ?? ''}::${firstAdjacent?.matchedPhrase ?? ''}`;
      const incumbent = gapByAnchor.get(anchorKey);
      if (incumbent && incumbent.weight >= req.weight) continue;
      if (incumbent) {
        suggestions.splice(suggestions.indexOf(incumbent.suggestion), 1);
      }

      // Draft a fill-in rewrite when we have an anchor bullet to hang it on. The tool never
      // names the canonical term itself (that is the escalation the tiered bridge exists to
      // prevent) — it opens a blank and lets the candidate name what they actually did.
      const anchorCandidate = firstAdjacent ? bulletById.get(firstAdjacent.bulletId) : undefined;
      // A list item is not an accomplishment: only a bullet from an experience/projects
      // section may take the relationship the draft would assert (see the constant above).
      const anchorBullet =
        anchorCandidate && isAccomplishmentBullet(anchorCandidate) ? anchorCandidate : undefined;
      let draft: { after: string; slotId: string } | null = null;
      if (anchorBullet) {
        const tail = /[.;:!?]+$/.exec(anchorBullet.rawText);
        const stem = tail ? anchorBullet.rawText.slice(0, -tail[0].length) : anchorBullet.rawText;
        const after = `${stem} using ${INPUT_SENTINEL}${tail ? tail[0] : ''}`;

        const provenance = assertTokenProvenance(anchorBullet.rawText, after, [canonicalLabel, req.term]);
        const beforeClaim = extractClaim(anchorBullet.rawText, anchorBullet.sourceSpan);
        const afterClaim = extractClaim(after, anchorBullet.sourceSpan);
        if (provenance.ok && beforeClaim && afterClaim) {
          const claim = assertClaimPreserved(beforeClaim, afterClaim, PERMITS.quantify);
          if (claim.ok) {
            draft = { after, slotId: `${makeSuggestionId('learning_gap', req.term, `adjacent:${canonicalLabel}`)}:slot:0` };
          }
        }
      }

      const gap: ResumeSuggestion = {
        id: makeSuggestionId('learning_gap', req.term, `adjacent:${canonicalLabel}`),
        type: 'learning_gap',
        reason: draft
          ? `The JD wants "${canonicalLabel}". Your bullet is adjacent (e.g. "${firstAdjacent?.matchedPhrase ?? 'related work'}") but does not name it. Fill in what you actually used — nothing is written until the blank is filled.`
          : `The JD wants "${canonicalLabel}". Your résumé is adjacent (e.g. "${firstAdjacent?.matchedPhrase ?? 'related work'}") but does not demonstrate it explicitly. Name the specific tool, method, or outcome you personally delivered so this reads as evidence rather than proximity.`,
        target: draft && anchorBullet
          ? { span: anchorBullet.sourceSpan, sectionId: anchorBullet.sectionId }
          : undefined,
        before: draft && anchorBullet ? anchorBullet.rawText : undefined,
        after: draft ? draft.after : undefined,
        requiresInput: draft ? true : undefined,
        inputSlots: draft
          ? [{ id: draft.slotId, placeholder: 'what you used', hint: `the specific method or tool (e.g. ${canonicalLabel})` }]
          : undefined,
        // Provenance for a DRAFT is two-sided. The JD span says why the card exists; the
        // résumé span says which existing line the new clause is being welded onto. Without
        // the second, an accepted draft leaves no record of what the added relationship was
        // attached to — the reviewer sees a new claim and no trace of its anchor.
        evidence: [
          ...(req.jdEvidence[0]
            ? [
                {
                  source: 'job_description' as const,
                  rule: 'vocabulary_injection',
                  span: req.jdEvidence[0],
                  text: canonicalLabel,
                  confidence: 0.6,
                },
              ]
            : []),
          ...(draft && anchorBullet
            ? [
                {
                  source: 'resume' as const,
                  rule: 'vocabulary_injection_anchor',
                  span: anchorBullet.sourceSpan,
                  text: anchorBullet.rawText,
                  confidence: 0.6,
                },
              ]
            : []),
        ],
        confidence: 0.6,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        conceptId: req.canonicalConceptId,
        editable: draft ? true : false,
      };
      suggestions.push(gap);
      gapByAnchor.set(anchorKey, { weight: req.weight, suggestion: gap });
    }
  }

  return suggestions;
}
