# Résumé Amplification Engine — Design Specification

**Date:** 2026-07-24
**Status:** Draft (awaiting author review)
**Topic:** Deterministic, truth-preserving résumé enhancement suggestions ("amplify only")
**Extends:** `docs/superpowers/specs/2026-07-24-ats-parser-architecture-design.md`
**Honors:** `career-ats` capability packet (no OCR, no invented/unsupported content, deterministic identity)

---

## 1. Overview & Core Philosophy

The suggestion engine today makes four **blunt, static** alterations (`build-suggestions.ts`):
object-agnostic 1:1 verb swaps from `TORQUE_MAP`, acronym expansion, missing-keyword
appends, and `[Suggested Section Heading]` placeholders. They are deterministic and reviewable
but not *intelligent* — the verb swap fires on every occurrence in raw text regardless of context,
and the keyword append can suggest skills the candidate never claimed.

This engine adds **intelligent amplification** under one hard law:

> **Amplify only, never add claims.** Every suggestion reshapes the candidate's *own words* —
> making them stronger, tighter, more active, or prompting the candidate to supply a metric.
> The résumé's factual claims never change; only their force. No fabrication, no LLM, no new
> skills, no invented numbers.

This is the repo's proposal → deterministic-render pattern: explicit linguistic **rules** over the
parsed résumé structure produce reviewable proposals; the human approves. No model guesses.

### Truth-boundary decision (settled)
- **In:** amplifying the candidate's existing words.
- **Out:** evidence-gated gap-closing, LLM rewrites, any generation of new factual content.

---

## 2. Scope

Four capabilities, all **résumé-internal** (no job-description dependency):

1. **Quantification prompts** (centerpiece) — detect un-quantified accomplishments and emit a
   fill-in-the-blank template the candidate completes.
2. **Context-aware verb strengthening** — replace the leading weak verb of an accomplishment with
   a stronger one *chosen by the object it governs*; only where it improves.
3. **Passive→active + filler tightening** — deterministic syntactic transforms and hedge removal.
4. **Repetition / variety reduction** — flag an over-used leading verb and suggest varied equivalents.

### Non-goals (YAGNI)
No job-description matching, no LLM, no spaCy/dependency parse, no cross-sentence rewriting, no
bullet reordering, no new-claim generation, no numbers supplied by the machine.

---

## 3. Architecture

New module `src/lib/career/amplify/`:

```
amplify/
  primitives.ts        # deterministic English primitives over accomplishment lines
  rules/
    verb-strength.ts    # capability 2
    quantification.ts   # capability 1
    tightening.ts       # capability 3 (passive→active + filler)
    repetition.ts       # capability 4
  registry.ts          # runs all rules in fixed order → ResumeSuggestion[]
  data/
    verb-classes.ts     # weak-verb set, object-class keyword sets, class→strong-verb map,
                        # metric templates, filler set, variety map (all static, curated)
```

`build-suggestions.ts` changes: the current inline verb loop is **removed** and replaced by a call
to `buildAmplifications(document)`; acronym/keyword/structure loops stay. Each rule module is a pure
`(ctx: AmplifyContext) => ResumeSuggestion[]` function — unit-testable against fixtures in isolation,
with no shared mutable state.

### Data flow
```
ResumeDocument
  → primitives.getAccomplishmentLines()   // lines + raw spans from experience/projects/summary
  → registry runs each rule over the lines
  → ResumeSuggestion[] (deterministic ids, evidence, requiresUserApproval)
  → existing apply-suggestions.ts (with the new unfilled-input guard)
```

---

## 4. Primitives Layer (`primitives.ts`)

All functions are pure and deterministic. No regex over global `rawText`; everything is scoped to
accomplishment lines carrying a **raw-coordinate span** so suggestions map back precisely.

- `getAccomplishmentLines(doc): AccomplishmentLine[]`
  Iterate `experience`, `projects`, `summary` sections. Split each section's text on newlines.
  Keep non-empty lines. Each `AccomplishmentLine = { text, span: TextSpan /* raw */, sectionKind }`.
  Line raw start = section raw span start + line offset within section text (deterministic).

- `leadingVerb(line): { verb, span } | null`
  Résumé bullets lead with a verb. Strip a leading bullet marker (`•`, `-`, `*`, digit+`.`).
  Take the first token; classify as a verb via (a) membership in the curated verb lexicon
  (weak set ∪ strong set ∪ known résumé verbs) or (b) `-ed`/`-ing` morphology. Return null if the
  line does not begin with a verb (e.g. a heading or a noun phrase) — such lines are left alone.

- `isQuantified(line): boolean`
  True if the line contains a metric signal: a digit, `%`, `$`, `#`, a magnitude word
  (`k`, `m`, `bn`, `thousand`, `million`), a multiplier (`3x`), or a count noun pattern
  (`team of five`). Curated, conservative — false positives here suppress a useful prompt, which is
  the safe failure direction.

- `detectWeakConstruction(line): Match[]`
  Ordered pattern set for tightening: `responsible for <gerund>`, `was|were <past-participle>`,
  `helped (to)? <verb>`, `worked on`, `duties included`, `in order to`. Each match carries the
  raw span and a transform recipe (see §5.3).

- `detectFiller(line): Match[]`
  Curated hedge/filler tokens: `successfully`, `various`, `several`, `a variety of`, `basically`,
  `a number of`. Each carries a raw span and its removal/replacement.

---

## 5. Rule Modules

Every suggestion: deterministic id via `makeSuggestionId(type, targetKey, evidencePayload)`,
`requiresUserApproval: true`, `status: 'pending'`, evidence with a `rule` tag and raw span, and a
`risk` rating. Case and tense of the candidate's text are preserved on replacement.

### 5.1 Quantification (`type: 'quantify'`, risk `low`)
For each accomplishment line where `isQuantified(line) === false` **and** the leading verb is in the
*measurable-outcome* set (`reduced`, `cut`, `increased`, `grew`, `improved`, `saved`, `managed`,
`led`, `built`, `delivered`, `launched`, `automated`), emit a template suggestion:

- `after` = original line + a metric clause containing the input sentinel, chosen by verb class:
  - reduce/cut → `, reducing <metric> by ␟%`
  - increase/grow/improve → `, increasing <metric> by ␟% (from ␟ to ␟)`
  - save → `, saving $␟/yr`
  - manage/led → ` a team of ␟`
  - build/deliver/launch/automate → `, ␟` (open outcome)
- `requiresInput: true`, `inputSlots` describing each `␟` with a hint.
- The machine **never** fills a slot. `␟` is `U+241F` (SYMBOL FOR UNIT SEPARATOR) — a sentinel that
  cannot occur in résumé prose, so "unfilled" is unambiguous (see §7).

### 5.2 Context-aware verb strengthening (`type: 'verb'`, risk `low`)
For each accomplishment line whose `leadingVerb` is in the **weak set**
(`helped`, `worked`, `did`, `handled`, `used`, `assisted`, `participated`, `responsible`, …):

1. Find the **object head noun** after the verb (first noun-ish token past determiners/preps).
2. Classify it into an **object class** via curated keyword sets:
   `people` (team, staff, engineers, clients), `system` (system, api, service, platform, pipeline,
   app), `process` (process, workflow, deployment, release), `data` (data, dataset, report,
   analysis), `outcome` (revenue, cost, growth, retention), `project` (project, initiative, launch).
3. Replace with the class's preferred strong verb from `class→strong-verb`
   (people→`Led`, system→`Built`, process→`Streamlined`, data→`Analyzed`, outcome→`Drove`,
   project→`Spearheaded`). Unknown class → fall back to the object-agnostic `TORQUE_MAP` value if one
   exists, else no suggestion.

Only the **leading** verb is considered (fixes today's global over-swap). Already-strong leading
verbs produce nothing.

### 5.3 Passive→active + filler tightening (`type: 'tighten'`, risk `low`)
- `responsible for managing X` → `Managed X` (strip prefix, gerund→past tense, capitalize).
- `was/were <pp>` → active where the recipe is safe; otherwise no suggestion (conservative).
- `helped (to) X` → strengthen `X`'s verb (delegates to §5.2 recipe on `X`).
- `worked on X` → `Built X` / `Developed X` (class-selected) — a tightening + strengthening.
- `in order to` → `to`; filler tokens (§4 `detectFiller`) → removed.
Each is an independent `before`→`after` suggestion so the user accepts/rejects granularly.

### 5.4 Repetition / variety (`type: 'verb'`, rule `repetition`, risk `low`)
Tally leading verbs (post-strengthening intent) across all accomplishment lines. For any verb used
`≥ 3` times, emit suggestions on the **2nd and later** occurrences offering a varied equivalent from
the `variety map`. First occurrence is never touched.

---

## 6. Schema Delta

`analysis/types.ts` and `schemas.ts` (zod), `ResumeSuggestion`:

- `type` union gains `'quantify'` and `'tighten'` → `'verb' | 'keyword' | 'acronym' | 'format' |
  'structure' | 'quantify' | 'tighten'`.
- Add `requiresInput?: boolean` (default/absent = false).
- Add `inputSlots?: Array<{ id: string; placeholder: string; hint: string }>` — one per `␟` in
  `after`, in left-to-right order.

Backward compatible: existing suggestions omit the new fields.

---

## 7. Apply-Engine Guard (`apply-suggestions.ts`)

`SuggestionApplicationResult.skipped[].reason` union gains `'unfilled_input'`.

Before applying any accepted suggestion, if `requiresInput === true` and its `after` (as edited by
the user) still contains the sentinel `␟` (U+241F), **skip** it with reason `'unfilled_input'` — it
is never written to the résumé. A quantification suggestion becomes applicable only once the user has
replaced every `␟` with real text (status transitions `pending` → `edited`). This is the mechanism
that keeps "amplify" from silently becoming "fabricate": the structure is ours, the number is always
theirs.

---

## 8. Determinism & Identity

- Rules run in a fixed registry order; within a rule, lines are processed in source order.
- Every id is content-derived via `makeSuggestionId` — no timestamps, no randomness.
- Repeated analysis of the same document yields a byte-identical `ResumeSuggestion[]`
  (parser gate §6.1 extended to the amplifier).

---

## 9. UI (`SuggestionReviewPanel.tsx`)

Quantification suggestions render each `inputSlot` as an inline text field (using its `hint` as
placeholder text). **Accept** is disabled until every slot is filled; on accept, the filled `after`
is what gets applied. All other suggestion types render unchanged (before→after with Accept / Reject
/ Edit). No new page-level state machine — this fits the existing `PARSE_REVIEW`/review surface.

---

## 10. Testing Plan (TDD, per rule)

Unit fixtures, one behavior each:
- **quantification:** un-quantified measurable line → one `quantify` suggestion with correct slots;
  an already-quantified line → none; a non-measurable-verb line → none.
- **verb-strength:** `helped the team` → `Led the team`; `worked on the API` → `Built the API`;
  a strong leading verb → none; a non-leading weak verb elsewhere in the line → untouched.
- **tightening:** `Responsible for managing X` → `Managed X`; `successfully` removed; `in order to`
  → `to`.
- **repetition:** three `Led` bullets → suggestions on the 2nd and 3rd only.
- **apply guard:** a `requiresInput` suggestion with `␟` remaining → skipped `unfilled_input`; the
  same with slots filled → applied at the correct offset.
- **determinism:** analyze twice → identical suggestion arrays.

---

## 11. Acceptance Gates

- [ ] No suggestion adds a factual claim, skill, or number absent from the candidate's input.
- [ ] The machine never fills a quantification slot; an unfilled slot can never reach the résumé.
- [ ] Verb strengthening only rewrites the **leading** verb of an accomplishment line.
- [ ] Every suggestion carries a raw-coordinate span and a rule-tagged evidence entry.
- [ ] Repeated analysis produces byte-identical suggestions.
- [ ] All suggestions remain `requiresUserApproval: true`; none auto-apply.
- [ ] `career-ats` capability packet law upheld (no OCR, no invented/unsupported content).
