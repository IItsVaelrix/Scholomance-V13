# Career JD Improvement Advisor + Formatted Export — Design

- **Date:** 2026-07-24
- **Branch:** `feature/semantic-calculus-lexical-predicates`
- **Status:** DESIGN — approved in brainstorming, pending spec review
- **Relates to:** [[project-career-amplification-engine]], [[project-career-graph-corpus]], the `ResumeSuggestion` model in `src/lib/career/analysis/types.ts`

## 1. Purpose

Today the Career tool faithfully reads the O*NET/ESCO corpus and classifies a résumé's skills, and the amplify engine polishes phrasing. It reflects; it does not advise. This feature makes it **compare a résumé against a specific job description and propose actionable improvements that the candidate accepts to directly improve the résumé**, then **export a formatted, ATS-safe `.docx`**.

The job description — not a generic O*NET occupation — is the reference spine. Two different "Software Developer" postings must produce different advice.

## 2. Authorship & honesty decision (settled in brainstorming)

**The tool drafts the improved text, but strictly from facts the candidate already stated.** It re-vocabularizes, reorders, quantifies (from stated numbers), and adds sections built only from already-demonstrated skills. It never invents a fact. This extends — does not break — the existing "amplify only, never add claims" law. It is enforced mechanically (§5), not by good intentions.

## 3. Scope

**In scope — four JD-driven improvement types:**
1. **Vocabulary injection** — reword a bullet to name the JD's canonical required term where the candidate's own evidence already supports it ("queried the production database" → "wrote SQL queries against the production database").
2. **Reorder for relevance** — promote bullets/sections the JD weights most; flag/demote content the JD never asks about. Never edits bullet text.
3. **Quantify** — promote a stated number into the phrasing; where no number was stated, emit a fill-in slot the candidate must complete before Accept unlocks.
4. **Add missing section** — when the JD is keyword-dense and no Skills section exists, draft one from skills already demonstrated elsewhere in the document.

**In scope — export:** a single ATS-safe **`.docx`** (one column, standard headings, no tables/text-boxes/headers-footers), generated client-side, rendering the improved structured résumé.

**Out of scope (YAGNI):**
- PDF and HTML export.
- A real embedding/semantic-similarity pass. The existing `scores.semantic: null` slot in `SkillClassification`/suggestion scoring stays the documented seam for a future pass; the bridge (§4.2) is deterministic for now.
- Multi-JD comparison.
- Real ESCO 1.2.1 + real O*NET-ESCO crosswalk (tracked separately in [[project-career-graph-corpus]]).

## 4. Architecture

All new logic is pure and lives under `src/lib/career/improve/`, plus one exporter under `src/lib/career/export/`. Data flow:

```
Job Description ─► RequirementLedger ─┐
                                       ├─► EvidenceBridge ─► EvidenceMap ─► 4 ImprovementRules ─► ResumeSuggestion[]
Résumé (parsed ResumeDocument) ───────┘                                                                │
                                                                          [candidate Accept / Edit / Reject]
                                                                                                       ▼
                                                                     applyAcceptedSuggestions ─► improved ResumeDocument
                                                                                                       ▼
                                                                              buildDocxExport ─► resume_<TargetRole>.docx
```

### 4.1 `requirement-ledger.ts`
`buildRequirementLedger(jdText: string, graphPort?: CareerGraphQueryPort): Requirement[]`

```ts
interface Requirement {
  term: string;                 // surface term as it appears in the JD
  canonicalConceptId?: string;  // O*NET/ESCO skill concept, when the graph canonicalizes it
  canonicalLabel?: string;      // e.g. "SQL"
  weight: number;               // 0..1 emphasis: frequency + cue words + position
  jdEvidence: TextSpan[];       // where in the JD this requirement appears
}
```
- Extract candidate requirement terms with the **existing** `keyword-matcher.ts` (stem-based unigrams/bigrams, skills-lexicon aware).
- Weight from: term frequency, emphasis cues ("required", "must have", "strong", "plus"), and section position (requirements section > nice-to-haves).
- When `graphPort` is present, canonicalize each term against O*NET skill labels via `searchOccupations`/skill lookup so "postgres", "mysql", "relational db" collapse to the canonical SQL concept. Degrades cleanly to raw terms when the graph is off.

### 4.2 `skill-phrase-bridge.ts`
`bridgePhrases(canonical: { label: string; conceptId?: string }): string[]`

The deterministic lexicon that resolves the lexical-mismatch problem. For a canonical skill it returns the common résumé phrasings that count as evidence for it. Sources, in order:
1. The O*NET skill label + its tokens (from the corpus).
2. A small **curated synonym seed** (`data/skill-synonyms.ts`) for high-frequency skills where résumé language diverges from O*NET vocabulary (e.g. `sql ← {sql, queries, relational, database, postgres, mysql}`).
Deterministic and explainable — no ML. Unknown skills fall back to the label tokens alone.

### 4.3 `evidence-map.ts`
`mapEvidence(requirements: Requirement[], doc: ResumeDocument, bridge): EvidenceMap`

```ts
interface RequirementEvidence {
  requirement: Requirement;
  support: 'demonstrated' | 'adjacent' | 'missing';
  bullets: { sectionId: string; span: TextSpan; matchedPhrase: string }[];
}
type EvidenceMap = RequirementEvidence[];
```
For each requirement, scan the parsed bullets; a bullet supports the requirement when it contains a bridge phrase (stem-aware). `demonstrated` = the canonical term or a strong bridge phrase is present; `adjacent` = a weaker bridge phrase; `missing` = none. Reuses the existing classification vocabulary so downstream UI is unchanged.

### 4.4 `rules/` — four pure rules
Each: `(map: EvidenceMap, doc: ResumeDocument) => ResumeSuggestion[]`, emitting the **existing** `ResumeSuggestion` shape.

- **`vocabulary-injection.ts`** — fires on `demonstrated`/`adjacent` requirements whose supporting bullet does NOT already use the canonical term. `type: 'keyword'`; `before` = the bullet slice; `after` = the bullet reworded to name the canonical term; `evidence` = JD span + résumé span; `conceptId` set.
- **`reorder.ts`** — `type: 'structure'`; emits reorder intents (promote high-weight-supported bullets/sections, demote/flag JD-irrelevant ones). Carries `target.sectionId` + insertion intent; never sets `after` text for a bullet (no text edit). **Integration note:** `applyAcceptedSuggestions` currently models span rewrites and insertions, not reordering of existing bullets. Applying a reorder needs a small, additive extension to the apply path (move a bullet by span within its section) — the plan must cover this; it is the one place this feature touches existing apply logic.
- **`quantify.ts`** — `type: 'quantify'`; fires on bullets supporting a high-weight requirement that state impact without a metric. Promotes a stated number; else emits a `␟` U+241F input slot (`requiresInput: true`, `inputSlots`) that blocks Accept until filled.
- **`add-section.ts`** — `type: 'structure'` with `target.insertionPoint`; only when the JD is keyword-dense and no Skills section exists. Drafts a Skills line listing ONLY requirements whose `support === 'demonstrated'`.

### 4.5 `build-improvements.ts`
`buildImprovements(jdText, doc, graphPort?): ResumeSuggestion[]` — orchestrates ledger → bridge → evidence-map → rules, then dedupes overlapping spans and orders by requirement weight. This is the single entry point the UI calls.

### 4.6 `export/docx-export.ts`
`buildDocxExport(doc: ResumeDocument, meta: { targetRole?: string }): Promise<{ blob: Blob; fileName: string }>` using the `docx` npm library (client-side).
- Renders the improved structured doc through one ATS-safe template: single column, standard heading styles, real paragraph/bullet lists, **no `<w:tbl>`, no text boxes, no headers/footers**.
- Section order from `ResumeDocument` (contact → summary → experience → skills…), with reorder/add-section improvements already applied.
- `fileName = resume_<TargetRole|export>.docx`.

## 5. Honesty enforcement (mechanical)

`assertDraftedFromEvidence(before, after, allowed)` — called at **build time** inside each drafting rule. Every content word (non-closed-class token) in `after` must come from one of:
1. the original `before` bullet's tokens,
2. the requirement's canonical label or its bridge phrases,
3. the closed-class allowlist (articles, prepositions, conjunctions) + the strong-verb set already in `amplify/data/verb-classes.ts`.

Any `after` introducing a content word from none of these is **discarded — it never reaches the candidate**. This is the falsifier: the tool cannot surface "led a team of 12" unless "12" and "team" were already present.

Reused from the amplify engine, unchanged:
- `before` must equal `rawText.slice(span.start, span.end)` byte-for-byte or the suggestion is dropped as `stale_span`.
- The sentinel-keyed apply guard blocks accepting any suggestion with an unfilled `␟` (§4.4 quantify).
- `add-section` lists only `demonstrated` skills — a never-evidenced skill cannot appear.

## 6. UI wiring

Minimal. `buildImprovements` returns the same `ResumeSuggestion[]` the graph-complete view already renders in `SuggestionReviewPanel` (`src/pages/Career/`), so the four new types slot into the existing Accept/Edit/Reject panel. Additions only:
- A **"Download .docx"** button beside the existing "Download .txt".
- Group suggestions by requirement in the panel ("SQL — 3 improvements") for legibility.

`CareerPage` calls `buildImprovements(jobDescription, parsedDocument, graphClientPortIfAny)` at the point it currently builds graph suggestions, merging the output into the existing `suggestions` state.

## 7. Testing (TDD)

- **Each rule** — pure unit tests: fixture (requirements + parsed doc) → expected `ResumeSuggestion[]`.
- **Honesty guard — falsification tests**: hand-built `after` strings smuggling a new content word MUST be rejected; legitimate re-vocabularizations MUST pass. (A guard that cannot reject is not a guard — same discipline as the coverage-law gate.)
- **`skill-phrase-bridge`** — "queried the database" bridges to SQL; unrelated phrases do not.
- **`requirement-ledger`** — emphasis cues raise weight; frequency counted; graph canonicalization collapses synonyms when the port is supplied.
- **`docx-export`** — generated file unzips to valid document XML, contains the accepted improvements, and contains **no `<w:tbl>`** (ATS-safe assertion).
- **End-to-end** — JD + résumé → improvements → accept a subset → DOCX; assert injected vocabulary appears in the output and no un-accepted change leaks in.

## 8. Dependencies & rollout

- Add the `docx` npm package (client-side, pure JS).
- No server, no new network calls — satisfies the same-origin/offline law.
- No change to the `ResumeSuggestion` contract or the graph shard pipeline. Purely additive modules + one UI button.

## 9. Success criteria

Given a real résumé and a real JD:
1. The tool names concrete, JD-specific improvements (not generic occupation advice) across all four types.
2. Every drafted change is traceable to a fact already in the résumé; the honesty guard provably rejects fabrication.
3. Accepting a subset and exporting yields a valid, ATS-safe `.docx` containing exactly the accepted improvements.
4. Two different JDs for the same role produce materially different advice.
