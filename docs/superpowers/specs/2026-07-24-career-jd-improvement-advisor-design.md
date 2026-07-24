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

**Fact ≠ token.** The guarantee is propositional, not lexical. A rewrite may reuse only legal tokens and still assert a false proposition — "Assisted a manager in training 15 agents" → "Managed and trained 15 agents" reuses permitted words but escalates *support* into *ownership*. Token provenance is necessary but insufficient; the honesty gate must also preserve the **claim relationship** — ownership/role, quantity binding, and object set (§5). Without this, canonicalization becomes a quiet claim escalator.

## 3. Scope

**In scope — four JD-driven improvement types:**
1. **Vocabulary injection** — reword a bullet to name the JD's canonical required term where the candidate's own evidence **demonstrates** it (e.g. "wrote Postgres queries to build weekly reports" → "wrote SQL/Postgres queries to build weekly reports"; a relational vendor is explicit-authorship evidence). A bullet that only says "queried the database" is `adjacent`, not demonstrated, and is NOT renamed — see §4.3/§4.5.
2. **Reorder for relevance** — promote bullets/sections the JD weights most; flag/demote content the JD never asks about. Never edits bullet text.
3. **Quantify** — promote a stated number into the phrasing; where no number was stated, emit a fill-in slot the candidate must complete before Accept unlocks.
4. **Add missing section** — when the JD is keyword-dense and no Skills section exists, draft one from skills already demonstrated elsewhere in the document.

**In scope — export:** a single ATS-safe **`.docx`** (one column, standard headings, no tables/text-boxes/headers-footers), generated client-side, rendering the improved structured résumé.

**Out of scope (YAGNI):**
- PDF and HTML export.
- A real embedding/semantic-similarity pass. The existing `scores.semantic: null` slot in `SkillClassification`/suggestion scoring stays the documented seam for a future pass; the tiered bridge (§4.3) is deterministic for now.
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

### 4.1 Résumé bullet model (parser addition — prerequisite)
Today a `ResumeSection` is `{ id, text: string, span }` with **no bullet-level structure and no bullet IDs**. Both the claim guard (per-bullet claim extraction) and stable-identity reordering (§4.5) require first-class bullets, so this is a prerequisite, not an afterthought.

`segmentBullets(section: ResumeSection): ResumeBullet[]` — deterministically splits a section's text into bullets (newline/bullet-glyph boundaries), assigning each a **stable id** derived from `sectionId` + ordinal + a content hash (stable across edits that don't touch that bullet).

```ts
interface ResumeBullet {
  id: string;          // stable identity — controls movement (§4.5)
  sectionId: string;
  rawText: string;
  sourceSpan: TextSpan; // provenance only — validates staleness, never controls movement
}
```
The `sourceSpan` protects against stale text; the `id` controls ordering. This separation is what lets an accepted rewrite and a later reorder coexist without one invalidating the other.

### 4.2 `requirement-ledger.ts`
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

### 4.3 `skill-phrase-bridge.ts` — **tiered** evidence, not a flat phrase list
`bridgeEvidence(canonical, bulletText): 'demonstrated' | 'adjacent' | 'none'`

The critical correction: a phrase match is not proof of the skill. "queried the database" does **not** demonstrate SQL — the store could be MongoDB, DynamoDB, Redis, a GUI tool, or SQL-backed without the candidate authoring queries. The bridge therefore returns a **tier**, governed by an explicit evidence law per skill (seeded in `data/skill-evidence-law.ts`), e.g. SQL:

```
demonstrated:  explicit "SQL"  OR  a relational vendor (postgres/mysql/oracle/…)
               OR  query-language syntax (SELECT/JOIN/…)
adjacent:      "database" / "queried records" / "relational data"
               (no explicit query authorship)
missing:       no relevant database evidence
```
Deterministic and explainable — no ML. Unknown skills fall back to label-token exact match = demonstrated, else none (never a speculative adjacent).

### 4.4 `evidence-map.ts`
`mapEvidence(requirements: Requirement[], bullets: ResumeBullet[], bridge): EvidenceMap`

```ts
interface RequirementEvidence {
  requirement: Requirement;
  support: 'demonstrated' | 'adjacent' | 'missing';   // strongest tier across bullets
  bullets: { bulletId: string; tier: 'demonstrated' | 'adjacent'; matchedPhrase: string }[];
}
type EvidenceMap = RequirementEvidence[];
```
For each requirement, evaluate `bridgeEvidence` against each bullet and keep the strongest tier. Bullets are referenced by **`bulletId`** (not span).

### 4.5 `rules/` — four pure rules
Each: `(map: EvidenceMap, bullets: ResumeBullet[], doc: ResumeDocument) => ResumeSuggestion[]`, emitting the **existing** `ResumeSuggestion` shape. Every drafting rule calls the claim-preservation guard (§5) before emitting; a suggestion that fails the guard is discarded (silence-by-default).

- **`vocabulary-injection.ts`** — fires **only** on `demonstrated` requirements whose supporting bullet does not already use the canonical term. `type: 'keyword'`; `before` = the bullet text; `after` = the bullet reworded to name the canonical term; `evidence` = JD span + résumé span; `conceptId` set. **An `adjacent` match is never renamed to the canonical term** (that is the escalation path) — it instead yields a non-rewriting gap note (`type: 'learning_gap'`, `editable: false`) telling the candidate what explicit evidence would upgrade it.
- **`reorder.ts`** — `type: 'structure'`; emits `MoveBulletOperation`s keyed on **stable bullet id**, never on text. Promotes high-weight-supported bullets/sections, demotes/flags JD-irrelevant ones. Never edits bullet text (zero fabrication surface). **Integration note:** `applyAcceptedSuggestions` models span rewrites and insertions, not moves. The additive extension applies a move by `{ bulletId, beforeBulletId?, afterBulletId? }`; the bullet's `sourceSpan` is validated for staleness but does **not** control placement — so an earlier accepted rewrite cannot invalidate a later move. This is the one place the feature touches existing apply logic.
- **`quantify.ts`** — `type: 'quantify'`; fires on bullets supporting a high-weight requirement that state impact without a metric. Promotes a stated number **only where the number already binds to that claim**; else emits a `␟` U+241F input slot (`requiresInput: true`) that blocks Accept until filled. It may never re-bind an existing metric to a different object (§5).
- **`add-section.ts`** — `type: 'structure'` with `target.insertionPoint`; only when the JD is keyword-dense and no Skills section exists. Drafts a Skills line listing ONLY requirements whose `support === 'demonstrated'`.

### 4.6 `build-improvements.ts`
`buildImprovements(jdText, doc, graphPort?): ResumeSuggestion[]` — orchestrates segment-bullets → ledger → bridge → evidence-map → rules, then dedupes overlapping suggestions and orders by requirement weight. Single entry point the UI calls.

### 4.7 `export/docx-export.ts`
`buildDocxExport(doc: ResumeDocument, meta: { targetRole?: string }): Promise<{ blob: Blob; fileName: string }>` using the `docx` npm library (client-side).
- Renders the improved structured doc through one ATS-safe template: single column, standard heading styles, real paragraph/bullet lists, **no `<w:tbl>`, no text boxes, no headers/footers**.
- Section order from `ResumeDocument` (contact → summary → experience → skills…), with reorder/add-section improvements already applied.
- `fileName = resume_<TargetRole|export>.docx`.

## 5. Honesty enforcement (mechanical) — two invariants, not one

Token provenance is necessary but **insufficient**: a rewrite can reuse only legal tokens and still assert a false proposition. The gate enforces both a lexical invariant and a **claim-relationship** invariant.

### 5.1 Token provenance (necessary)
`assertTokenProvenance(before, after, allowed)` — every content word in `after` must come from: (1) the `before` bullet's tokens, (2) the requirement's canonical label / bridge phrases, or (3) the closed-class allowlist + the strong-verb set in `amplify/data/verb-classes.ts`. An `after` introducing a content word from none of these is discarded.

### 5.2 Claim preservation (the real invariant)
Each drafting rule extracts a compact fact structure from `before` and `after` and asserts they match under a per-rule permit.

```ts
interface EvidenceClaim {
  subject: 'candidate';
  action: string;                              // head verb
  object?: string;                             // what the action acts on
  quantity?: { value: string; bindsTo: string }; // the number and the noun it modifies
  role: 'owner' | 'contributor' | 'support';   // from a verb→role lexicon (extends verb-classes.ts)
  qualifiers: string[];
  sourceSpan: TextSpan;
}

interface TransformationPermit {
  mayReplaceActionVocabulary: boolean; // synonym swap that preserves role
  mayReorderClauses: boolean;
  mayPromoteExistingMetric: boolean;
  mayChangeOwnership: false;            // role must be preserved EXACTLY (no escalate, no downgrade)
  mayChangeQuantityBinding: false;     // a number cannot move to a different object
  mayAddObject: false;                 // cannot introduce an object the source lacked
}
```

`assertClaimPreserved(beforeClaim, afterClaim, permit)` rejects the suggestion when: `role` differs (owner/contributor/support is derived from the verb — "assisted"=support, "contributed"=contributor, "led"/"managed"/"owned"=owner); a `quantity.bindsTo` changes; or an `object` appears in `after` that was absent in `before`. **Role is preserved exactly** — "assisted"→"managed" (escalation) and "managed"→"assisted" (downgrade) are both rejected; a legitimate vocab/quantify edit never needs to touch role.

**Fail closed.** If claim extraction cannot confidently parse `before` or `after` (ambiguous verb, no clear head), the suggestion is **discarded**, not passed. Recall is traded for zero fabrication — the correct trade for an honesty tool, consistent with the amplify engine's silence-by-default.

### 5.3 Worked example (the guard's whole reason to exist)
- Source: *"Assisted a manager in training 15 agents."* → claim `{ action: assist, role: support, quantity: {15, bindsTo: agents} }`
- Draft: *"Managed and trained 15 agents."* → claim `{ action: manage, role: owner, … }`
- `role` went `support → owner`. `assertClaimPreserved` **rejects it.** Token provenance alone would have passed it.

### 5.4 Reused from the amplify engine, unchanged
- `before` must equal `bullet.rawText` (validated via `sourceSpan`) or the suggestion is dropped as `stale_span`.
- The sentinel-keyed apply guard blocks accepting any suggestion with an unfilled `␟` (§4.5 quantify).
- `add-section` lists only `demonstrated` skills — a never-evidenced skill cannot appear.

## 6. UI wiring

Minimal. `buildImprovements` returns the same `ResumeSuggestion[]` the graph-complete view already renders in `SuggestionReviewPanel` (`src/pages/Career/`), so the four new types slot into the existing Accept/Edit/Reject panel. Additions only:
- A **"Download .docx"** button beside the existing "Download .txt".
- Group suggestions by requirement in the panel ("SQL — 3 improvements") for legibility.

`CareerPage` calls `buildImprovements(jobDescription, parsedDocument, graphClientPortIfAny)` at the point it currently builds graph suggestions, merging the output into the existing `suggestions` state.

## 7. Testing (TDD)

Baseline unit coverage:
- **Each rule** — fixture (requirements + bullets) → expected `ResumeSuggestion[]`.
- **`requirement-ledger`** — emphasis cues raise weight; frequency counted; graph canonicalization collapses synonyms when the port is supplied.
- **`docx-export`** — generated file unzips to valid document XML, contains the accepted improvements, and contains **no `<w:tbl>`** (ATS-safe assertion).

Required falsification / invariant tests (a guard that cannot reject is not a guard):
1. **Ownership falsification** — "Assisted … training 15 agents" → "Managed and trained 15 agents" MUST be rejected (role support→owner).
2. **Metric binding** — a "15% revenue increase" cannot be redrafted as a "15% engagement increase" (quantity `bindsTo` change rejected).
3. **Tool inference** — "queried the database" alone yields `adjacent`, never `demonstrated` SQL; vocabulary-injection does not fire on it.
4. **Sequential acceptance** — accepting a text rewrite then applying a later reorder both succeed; the move resolves by `bulletId`, unaffected by the earlier edit's span shift.
5. **Suggestion conflicts** — two overlapping accepted suggestions on the same bullet resolve deterministically (documented precedence), never double-apply.
6. **Round-trip parse** — export the DOCX, re-ingest it through the parser, and assert the structured facts (bullets, sections, accepted vocabulary) survive.
7. **Zero-change export** — rejecting every suggestion reproduces the original content exactly, apart from declared formatting normalization.
8. **JD divergence** — two postings with the same title but different requirements produce measurably different ranked suggestion sets.
- **End-to-end** — JD + résumé → improvements → accept a subset → DOCX; assert injected vocabulary appears and no un-accepted change leaks in.

## 8. Dependencies & rollout

- Add the `docx` npm package (client-side, pure JS).
- No server, no new network calls — satisfies the same-origin/offline law.
- No change to the `ResumeSuggestion` contract or the graph shard pipeline.
- Two existing-code touch points, both additive/non-breaking: (a) the parser gains a `ResumeBullet` model + `segmentBullets` (§4.1) — new structure, existing `ResumeSection.text` unchanged; (b) `applyAcceptedSuggestions` gains a move-by-`bulletId` path (§4.5) alongside its current rewrite/insert paths. Everything else is new modules under `improve/` + one UI button.

## 9. Success criteria

Given a real résumé and a real JD:
1. The tool names concrete, JD-specific improvements (not generic occupation advice) across all four types.
2. Every drafted change is traceable to a fact already in the résumé; the honesty guard provably rejects fabrication.
3. Accepting a subset and exporting yields a valid, ATS-safe `.docx` containing exactly the accepted improvements.
4. Two different JDs for the same role produce materially different advice.
