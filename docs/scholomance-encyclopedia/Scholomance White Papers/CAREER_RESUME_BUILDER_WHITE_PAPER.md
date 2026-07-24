# 🜃 THE SCHOLOMANCE WHITE PAPER: THE RÉSUMÉ BUILDER

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-WP-CAREER-RESUME-BUILDER`

## SUBTITLE: A DETERMINISTIC ATS PIPELINE THAT AMPLIFIES A CANDIDATE'S OWN WORDS AND REFUSES TO INVENT ANY
**Date:** 2026-07-24
**Author:** Scholomance Auditor (Career)
**Classification:** ARCHIVE — HONEST ASSESSMENT, NO PARTICIPATION TROPHIES
**Subject:** `src/lib/career/**`, `src/pages/Career/**`
**Supersedes:** `CAREER_RESONANCE_ALIGNMENT_WHITE_PAPER.md` (2026-06-03), whose headline finding — "the machine is built and currently dark" — is obsolete. It is wired.

---

## 0. Executive Summary

The résumé builder takes a real file — pasted text, `.txt`, `.docx`, or a text-layer `.pdf` — parses it into a structured document with byte-exact coordinates, measures it on six independent dimensions, and proposes **reviewable, deterministic** improvements that the candidate accepts or rejects one at a time. It then exports clean plain text.

It is not a résumé generator and deliberately cannot become one. Every suggestion it makes is bound by one law:

> **Amplify only, never add claims.** Every suggestion reshapes the candidate's *own words* — stronger, tighter, more active, or prompting the candidate to supply a metric. The résumé's factual claims never change; only their force. No fabrication, no LLM, no new skills, no invented numbers.

That law is not a promise in a doc — §3 describes the four mechanisms that make violating it structurally difficult, including a sentinel character the machine is incapable of filling in.

**Maturity, stated plainly:** the ingest → parse → review → analyze → suggest → apply → export pipeline is complete and wired to the page. 187 tests across 19 files cover it. The weak points are all in *measurement* (§4), not in the parse or the suggestion machinery.

---

## 1. The Pipeline

```
file / paste
   ↓  parser/adapters/{pasted-text,plain-text,docx,pdf}.ts     ← extraction, OCR refusal
ExtractedDocument
   ↓  parser/normalize-document.ts, detect-sections.ts,
      extract-contact.ts  →  parser/parse-resume.ts            ← structure + raw spans
ResumeDocument ──────────────→ PARSE_REVIEW (human confirms)
   ↓  analysis/analyze-career.ts                               ← the measurement boundary
   ├── analysis/keyword-matcher.ts     strict phrase matching vs. a job description
   ├── codex/core/career/ats-hmm       prose legibility (HMM)
   ├── acronyms.ts                     acronym coverage
   ├── analysis/scorecard.ts           the 6-dimension AtsScorecard
   └── suggestions/build-suggestions.ts
          └── amplify/registry.ts      ← five deterministic amplification rules
ResumeSuggestion[]
   ↓  pages/Career/SuggestionReviewPanel.tsx                   ← accept / reject / edit / fill
   ↓  suggestions/detect-conflicts.ts → suggestions/apply-suggestions.ts
   ↓  export/clean-export.ts
resume_export.txt
```

The page (`src/pages/Career/CareerPage.tsx`) walks a real state machine: `IDLE → EXTRACTING → PARSING → PARSE_REVIEW → ANALYZING → COMPLETE`. The `PARSE_REVIEW` stop is deliberate — the candidate sees what the machine *thinks* their résumé says before anything is measured or suggested.

---

## 2. What It Can Do

### 2.1 Ingestion — four sources, one refusal

| Source | Adapter | Engine |
|---|---|---|
| Pasted text | `adapters/pasted-text.ts` | direct |
| `.txt` | `adapters/plain-text.ts` | direct |
| `.docx` | `adapters/docx.ts` | `fflate` unzip + XML walk — no external service, no upload |
| `.pdf` | `adapters/pdf.ts` | text layer + per-block `bbox` |

**The refusal is a feature.** A PDF with no machine-readable text layer produces an `IMAGE_ONLY_PDF` diagnostic and stops, telling the candidate to supply a text-based file. The alternative — OCR — would mean the tool guessing at characters and then presenting the guesses as the candidate's résumé. A scanned résumé is *also* unreadable to the ATS the candidate is about to face, so refusing is the honest answer to the real question.

The PDF adapter also detects **multi-column layouts** from block x-coordinates by testing vertical y-overlap between left and right blocks — the layout that most reliably scrambles reading order inside an ATS.

### 2.2 Structural parse — coordinates, not vibes

`parse-resume.ts` produces a `ResumeDocument` carrying:

- **Sections** classified as `contact | summary | skills | experience | projects | education | unknown`, each with a `TextSpan` in **raw** coordinates.
- **Contact fields** — name, email, phone, links.
- **Deterministic identity** — every block, section and suggestion id is a DJB2 content hash (`parser/identity-utils.ts`). No timestamps, no counters. The same document parsed twice yields the same ids, so a résumé can be re-analyzed and diffed.
- **Offset mapping** between raw and normalized text, so a suggestion computed on cleaned text still points at the exact bytes of the original.

### 2.3 Measurement — six dimensions, no single vanity number

`AtsScorecard` (`analysis/types.ts`) is deliberately *decompressed* — six values, not one grade:

| Dimension | What it means |
|---|---|
| `parseQuality` | parser confidence, or `null` when unknown — never faked to 100 |
| `sectionCoverage` | how many of contact/summary/skills/experience/education were found |
| `literalKeywordCoverage` | weighted share of top job-description keywords actually present |
| `canonicalSkillCoverage` | share of a canonical skills lexicon present in skills/experience |
| `legibility` | HMM prose audit — flags lines that read as machine-mangled |
| `formattingRisk` | `low \| medium \| high`, from parse diagnostics |

**The keyword matcher does not give partial credit for scattered words.** `analysis/keyword-matcher.ts` grades each JD term on a ladder: `exact_phrase → normalized_phrase → recognized_alias → component_only → missing`. "Machine learning" is only matched when those tokens appear *contiguously* in one phrase segment — not because "machine" appears in one bullet and "learning" in another. That distinction is the difference between an honest coverage number and a flattering one.

### 2.4 The Amplification Engine — five rules

`src/lib/career/amplify/` operates on **accomplishment lines** (`primitives.ts`), each carrying a raw-coordinate span. Five pure rules run in fixed registry order:

**1. Quantification** (`rules/quantification.ts`) — the centerpiece. An un-quantified accomplishment with a measurable leading verb (`reduced`, `grew`, `led`, `launched`, …) gets a fill-in-the-blank clause:

```
Reduced the deployment pipeline runtime.
  → Reduced the deployment pipeline runtime, reducing ␟ by ␟%.
```

Each `␟` is a slot the candidate fills. The machine chooses the *sentence shape*; the candidate supplies every number. Already-quantified lines get nothing.

**2. Context-aware verb strengthening** (`rules/verb-strength.ts`) — a weak **leading** verb is replaced by one chosen from the class of object it governs:

```
people → Led      system  → Built        process → Streamlined
data   → Analyzed outcome → Drove        project → Spearheaded
```

`Helped the support team.` → `Led the support team.` This replaces an older engine that swept a verb map across the entire document and proposed swapping every occurrence anywhere — including inside job titles and mid-sentence. Only the leading verb is ever touched, and the rule stays silent when the object is unclassifiable or when a preposition or bare verb follows it (`Assisted the client with onboarding` yields nothing rather than the ungrammatical `Led the client with onboarding`).

**3. Weak-construction tightening** (`rules/weak-construction.ts`) — leading passive and duty-list forms become active:

```
Responsible for managing the release process.  → Managed the release process.
Duties included supporting the sales team.     → Supported the sales team.
Was promoted to senior engineer.               → Promoted to senior engineer.
Helped to migrate the billing database.        → Migrated the billing database.
Worked on the payment API.                     → Built the payment API.
```

Every pattern is anchored to the start of the line, and each consults a curated past-tense map. An unknown verb produces **nothing** — a guessed past tense would be a claim the candidate did not make.

**4. Filler and wordiness** (`rules/filler.ts`) — `successfully`, `various`, `several`, `a variety of`, `a number of`, `in order to → to`. A filler that leads the bullet takes the following word with it and capitalizes it, so `Successfully launched the mobile app.` becomes `Launched the mobile app.` rather than a lowercase bullet.

**5. Repetition / variety** (`rules/repetition.ts`) — a leading verb used three or more times gets varied alternatives on its **second and later** occurrences. The first use is never touched; the candidate earned it.

### 2.5 Review, apply, export

Every suggestion is a `ResumeSuggestion` carrying `before`, `after`, a raw `target.span`, a rule-tagged `evidence[]` entry, a `risk` rating, `requiresUserApproval: true`, and `status: 'pending'`. Nothing auto-applies, ever.

- **The panel** (`SuggestionReviewPanel.tsx`) renders before → after, and for a quantification prompt renders one text field per blank with **Accept disabled until every blank is filled**.
- **Conflict detection** (`detect-conflicts.ts`) refuses to apply two accepted suggestions that touch overlapping text.
- **Application** (`apply-suggestions.ts`) sorts edits by descending offset and rewrites the raw text, verifying that each suggestion's `before` still matches the document at its span — a stale suggestion is skipped, not misapplied.
- **Export** (`export/clean-export.ts`) applies the accepted set and strips all ceremonial Sigil scaffolding, producing plain text an ATS can read.

---

## 3. How the Law Is Enforced

Four mechanisms, all mechanical:

1. **The sentinel.** A quantification blank is `␟` (U+241F, SYMBOL FOR UNIT SEPARATOR) — a character that cannot occur in résumé prose. It has exactly one definition in the codebase (`amplify/data/input-sentinel.ts`).
2. **The guard.** `apply-suggestions.ts` skips any accepted suggestion whose `after` still contains that sentinel, with reason `unfilled_input`. It keys on the *sentinel*, not on a flag a future rule might forget to set. An unfilled prompt therefore cannot reach a résumé — not through the panel, not through the export path.
3. **Byte-identity of spans.** A suggestion's `before` must equal `rawText.slice(span.start, span.end)` exactly, or the apply engine discards it. A rule cannot claim to be editing text it is not actually editing.
4. **Silence as the default.** Every rule that consults a curated map emits nothing when the map has no entry. Unknown gerund, unknown participle, unclassifiable object → no suggestion. The engine would rather say nothing than guess.

Determinism backs all of it: no `Date`, no `Math.random`, content-derived ids, fixed rule order, results never sorted. The same résumé analyzed twice produces a byte-identical suggestion array — asserted by test, not by assertion.

---

## 4. What It Does *Not* Do

An honest capability paper is mostly this section.

- **No OCR.** Image-only PDFs are refused, by design (§2.1).
- **Amplification is résumé-internal.** The five rules never read the job description. JD awareness lives only in keyword matching and the keyword-append suggestion.
- **The keyword-append suggestion can propose a term the candidate never claimed.** It is rated `risk: 'medium'` and requires approval, but it is the one suggestion type that is *not* amplify-only. It proposes; the candidate is the last line of defense.
- **`canonicalSkillCoverage` is measured against 27 hard-coded, engineering-biased terms** (`javascript`, `docker`, `kubernetes`, …), duplicated in both `analysis/scorecard.ts` and `keyword-gap.js`. A nurse, a teacher, or a welder scores near zero and the number means nothing to them. This is the weakest dimension on the scorecard.
- **`formattingRisk` keys partly on diagnostics nothing emits.** It tests for `TABLE_LAYOUT`, `READING_ORDER_UNCERTAIN`, `UNKNOWN_SECTION`, `DATE_PAIRING_AMBIGUOUS` and `CONTACT_FIELD_AMBIGUOUS`; the parser currently emits only `IMAGE_ONLY_PDF`, `MULTI_COLUMN_LAYOUT` and `UNSUPPORTED_FILE`. Those branches are unreachable — the risk rating is real but narrower than it looks.
- **Overlapping accepted suggestions are both dropped, silently.** A whole-line quantification and an inline tightening on the same line cancel each other, and the skip reasons never reach the UI. The candidate sees neither edit and is told nothing.
- **No bullet reordering, no cross-sentence rewriting, no length management.** The engine edits within a line.
- **Variety alternatives wrap.** A verb used five times with a three-entry alternatives list repeats one.
- **10 pre-existing TypeScript errors** in `keyword-matcher.ts`, `scorecard.ts` and `parse-resume.ts` predate the amplification work (measured at both ends of the branch) and remain.

---

## 5. Test Posture, and the Lesson

187 tests across 19 files (`tests/unit/career*`), all passing. The parse layer is property-tested: raw-span byte-identity is asserted for *every* suggestion the registry emits, not for one example.

The instructive failure: the amplification engine reached a full green suite while producing three defects a candidate would have seen in their own exported file — a lowercase bullet (`launched the mobile app.`), doubled punctuation (`runtime., reducing…`), and an ungrammatical verb swap (`Led the support team resolve escalations.`). Every test asserted **suggestion objects**. None asserted the **sentence**.

The fix is now the engine's most valuable test — `tests/unit/careerAmplifyAppliedText.test.ts` builds suggestions, accepts them, applies them, and asserts the résumé string a candidate would actually read:

```
Launched the mobile app.
Reduced the deployment pipeline runtime, reducing build time by 40%.
Led the support team.
Helped the support team resolve escalations.     ← must survive UNCHANGED
```

The fourth line is the interesting one: rewriting only its leading verb would produce the ungrammatical `Led the support team resolve escalations.`, so the correct output is no edit at all. Each of the four bullets fails this test if its corresponding fix is reverted — verified by actually reverting each one, not by asserting it.

That verification was not academic. The first version of this test claimed in its own docstring that every bullet tripped its defect, and one of them didn't: the fixture had no catenative clause, so reverting the verb-strength guard left the output byte-identical. **The falsifier had itself become a check that cannot fail** — inside the test written to end that pattern.

A green suite that never renders the artifact proves nothing. Assert the output, not the plan for the output — and prove the assertion can fail by breaking the code on purpose.

---

## 6. Open Work

1. Replace the 27-term skills lexicon with a domain-aware source, or drop `canonicalSkillCoverage` until it means something outside software.
2. Emit the diagnostics `formattingRisk` already grades (`TABLE_LAYOUT`, `DATE_PAIRING_AMBIGUOUS`, `CONTACT_FIELD_AMBIGUOUS`), or remove the dead branches.
3. Surface `skipped` reasons in the review panel so a dropped overlap is visible.
4. Consider a zero-width insertion span for quantification so it stops colliding with same-line tightenings.
5. Decide whether the keyword-append suggestion belongs in a tool whose law is amplify-only.

---

## Appendix: Source Map

| Concern | Path |
|---|---|
| Ingestion adapters | `src/lib/career/parser/adapters/` |
| Structure + spans | `src/lib/career/parser/` |
| Measurement | `src/lib/career/analysis/` |
| Amplification | `src/lib/career/amplify/` |
| Suggestion apply / conflicts | `src/lib/career/suggestions/` |
| Export | `src/lib/career/export/clean-export.ts` |
| UI | `src/pages/Career/` |
| Design spec | `docs/superpowers/specs/2026-07-24-career-amplification-engine-design.md` |
| Implementation plan | `docs/superpowers/plans/2026-07-24-career-amplification-engine.md` |
