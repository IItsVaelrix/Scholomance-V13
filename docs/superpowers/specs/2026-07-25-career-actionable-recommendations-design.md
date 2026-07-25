# Actionable Recommendations — every card carries an operation

**Date:** 2026-07-25
**Branch:** `feature/semantic-calculus-lexical-predicates`
**Status:** design approved, not implemented

## Problem

The advisor tells the candidate what to do without doing any of it. Measured on a realistic
JD, two of five cards instruct rather than offer:

| Case | Situation | Current card |
|---|---|---|
| **A. missing** | JD requires Apache Airflow; résumé references nothing related | *"…add it in your own words with a concrete example"* — `before`/`after` undefined, `editable: false` |
| **B. adjacent** | JD requires "dimensional modeling"; résumé says "model warehouse tables" | *"Name the specific tool, method, or outcome you personally delivered"* — no draft |
| **C. trim** | Bullet the JD never asks about | *"consider trimming it"* — `before === after`, no operation |

A card with no operation is not a recommendation; it is homework. The goal of this work is
that **no card instructs without offering something the candidate can accept**.

The refusals that produced these cards were deliberate and correct in their original
framing — renaming adjacent evidence to a canonical term is claim escalation, and pasting a
missing keyword in is a keyword-anchor pile. This design keeps both refusals intact and
changes *who authors the claim*: the tool supplies a sentence frame built from the
employer's own words, the candidate supplies every specific fact, and accepting the card is
the candidate's assertion.

## Decisions locked in brainstorming (do not re-litigate)

1. **Missing requirements get slotted drafts too**, not just adjacent ones.
2. **One-step cards.** The draft is visible immediately with a warning; accepting it *is*
   the assertion. No "have you done this?" pre-gate.
3. **Frame wording comes from the JD's own phrasing** — lift the verb and object the
   employer used, normalize person/tense. No template library, no LLM.

Damien was told, and accepted, that a Case A draft puts the skill term in a sentence the
résumé has no evidence for; the mitigation is the provenance model in §4, not a pre-gate.

## Architecture

```
improve/
  jd-clause.ts             NEW — clause scoping, extracted from requirement-ledger.ts
  jd-phrase-frame.ts       NEW — JD clause → { frame, slots } | null
  honesty/
    frame-provenance.ts    NEW — the invariant for a draft with no `before`
  rules/
    missing-evidence.ts    NEW — Case A
    vocabulary-injection.ts  CHANGED — Case B adjacent branch drafts instead of instructs
    reorder.ts               CHANGED — Case C flag becomes a demote move
  build-improvements.ts      CHANGED — registers the new rule
```

`clauseAt` moves out of `requirement-ledger.ts` into `jd-clause.ts` unchanged; the ledger
imports it. The frame extractor needs the identical clause scoping, and one definition must
serve both or the ledger's modality and the frame's wording can disagree about which words
belong to a requirement.

### Data flow

```
Requirement (has jdEvidence spans)
   │
   ├─ support: 'demonstrated' → vocabulary-injection (unchanged: rename to canonical)
   │
   ├─ support: 'adjacent'     → vocabulary-injection, drafting branch
   │                             anchor bullet exists → in-place slotted REWRITE
   │
   └─ support: 'missing'      → missing-evidence rule
                                 no anchor → slotted NEW bullet + required entry choice
```

## §1 Frame extraction (`jd-phrase-frame.ts`)

`buildPhraseFrame(jdText, requirement): PhraseFrame | null`

```ts
interface PhraseFrame {
  /** Draft text with U+241F sentinels where the candidate must supply a fact. */
  text: string;
  /** One slot per sentinel, in order. */
  slots: { placeholder: string; hint: string }[];
  /** The JD clause the wording was lifted from — the provenance source of record. */
  sourceClause: string;
  /** Span of that clause in the JD, for the evidence trail. */
  sourceSpan: TextSpan;
}
```

Pipeline, applied to the clause containing the requirement's first `jdEvidence` span:

1. **Strip leading scaffolding.** `Experience with`, `5+ years of`, `Strong`, `Solid
   understanding of`, `Familiarity with`, `Proven`. Reuses `REQUIREMENT_SCAFFOLDING` from
   the ledger, which already enumerates these.
2. **Split verb from remainder.** First token that resolves in the verb table is the verb;
   everything after it is the remainder.
3. **Normalize to past tense.** A curated table: regular `-ed` formation plus the
   irregulars that actually occur in job descriptions (build/built, write/wrote, lead/led,
   run/ran, drive/drove, own/owned, ship/shipped, …). Gerunds (`building`) and infinitives
   (`to build`) both fold to the same entry.
4. **Verbless clauses get a neutral verb.** `Apache Airflow for orchestration` has no verb,
   so the frame becomes `Used Apache Airflow for orchestration`.
5. **Append the outcome slot** — `, ␟` with hint *"the result it produced"*.

**Fail closed.** If step 3 cannot resolve the verb, return `null`. The card then falls back
to today's prose note. This is a deliberate coverage-for-quality trade: a requirement whose
JD phrasing we cannot confidently rewrite produces no draft rather than an awkward one.

Worked examples:

| JD clause | Frame |
|---|---|
| `- 5+ years of experience building data pipelines in Python` | `Built data pipelines in Python, ␟` |
| `- Experience with Apache Airflow for orchestration` | `Used Apache Airflow for orchestration, ␟` |
| `- Solid understanding of dimensional modeling` | `Used dimensional modeling, ␟` |
| `You will drive adoption across teams` | `Drove adoption across teams, ␟` |

## §2 Case B — adjacent evidence becomes an in-place rewrite

The anchor bullet exists, so entry ownership is already settled and the existing guards
apply unchanged.

```
before: Partnered with analysts to model warehouse tables for reporting
after:  Partnered with analysts to model warehouse tables for reporting using ␟
slot:   the specific method or tool (e.g. dimensional modeling)
```

Gates: `assertTokenProvenance` then `assertClaimPreserved` under **`PERMITS.quantify`** —
the existing permit, reused unchanged, because the transformation has the same shape
(append a clause, add no object, re-bind no quantity, change no role).
`mayAddObject: false` only trips when the source had **no** object
(`claim-preservation.ts:170`), so appending a qualifier to a bullet that already has one
passes. A draft failing either gate is discarded — silence, as everywhere else.

The suggestion keeps `type: 'keyword'`, gains `requiresInput: true` and `inputSlots`, and
becomes `editable: true`.

## §3 Case A — missing evidence becomes a new bullet

No anchor bullet, so two things must be supplied by the candidate rather than inferred.

**The facts.** Frame slots, exactly as §1 produces them.

**The employer.** A Case A bullet has no entry. Auto-placing it under the most recent
employer would assert *where* the work happened — a fabricated ownership claim, and the
thing `apply-moves.ts:246-251` enforces against everywhere else in the system. So the
target entry is a **required input on the card**: no default, no auto-placement, Accept
locked until the candidate picks one. It is a blank like any other.

Card shape:

```
Apache Airflow — required, no evidence in your résumé
⚠ Only accept if you have actually done this.

  "Used Apache Airflow for orchestration, ␟"
     slot 1: the result it produced
     entry:  [ choose employer ▾ ]     ← required

[Accept]  — locked until every blank and the entry are filled
```

**Type and ranking.** The card stays `type: 'learning_gap'` — it *is* a gap, and the panel
already groups that type under "Learning Gaps", which is exactly where a candidate should
find the cards they would be asserting for the first time. It becomes `editable: true` and
`requiresInput: true`, but keeps its place at the bottom of `TYPE_PRIORITY` and stays
subject to `applyGapBudget`'s cap of 3. Being actionable does not make it better-evidenced
than a demonstrated rewrite, and it must not outrank one.

**Two contract additions** (both optional, additive):

```ts
// analysis/types.ts — ResumeSuggestion
/** Insert as a new bullet at the end of the named entry. Set by the candidate's choice. */
target?: { …; entryId?: string };
/** True when the candidate must choose a target entry before Accept unlocks. */
requiresEntryChoice?: boolean;
```

The entry is chosen through a select on the card, not an `inputSlot` — `inputSlots` are
free-text sentinel fills, and an entry is a pick from a closed list. Conflating them would
let a typed employer name reach the résumé as an unvalidated string.

**Apply-engine dependency.** `applyAcceptedSuggestions` supports insertion only at section
granularity (`insertionPoint: 'before_section' | 'after_section' | 'document_end'`); there
is no way to insert into a chosen *entry*. The plan must extend the insert path to accept
`target.entryId` and place the bullet after that entry's last bullet, reusing the entry
index `apply-moves.ts` already builds. Until that exists, a Case A card cannot be applied
truthfully, so this is a hard prerequisite and not a follow-up.

## §4 Honesty model for drafted claims

Case B is covered by the existing two invariants. Case A cannot be — there is no `before`
to preserve, so claim-preservation is structurally inapplicable. It gets a third invariant
in the same mechanical spirit:

> **Frame provenance.** Every content token in a drafted bullet must originate in exactly
> one of: the JD clause it was lifted from, the frame's fixed scaffolding, or a
> candidate-filled slot. Any other token is refused.

`assertFrameProvenance(after, frame, slotValues): HonestyVerdict`, mirroring
`assertTokenProvenance`'s tokenizer and its fail-closed posture. This makes it mechanically
impossible for the tool to introduce a noun that is neither the employer's word nor the
candidate's — which is the property that makes a one-step card defensible.

Provenance recorded on accept: claim source `candidate_accepted`; the tool is credited with
the frame only. Slot values flow into the existing `UserFactLedger` so the numbers the
candidate types are legal to the token-provenance guard.

## §5 Case C — trim advice becomes a demote move

The flag branch in `reorder.ts` currently emits `before === after` with `editable: false`.
It becomes a real `MoveBulletOperation` demoting the bullet to the end of **its own entry**,
reusing the existing move machinery and same-entry enforcement. Wording changes from
"consider trimming it" to "Move this below your JD-relevant bullets". Still
`editable: false` — but now it does something.

Trimming outright is not offered: deleting a true statement is the candidate's call and
carries no ATS benefit the demote does not.

## §6 Integration — suppressing the duplicate

`build-suggestions.ts` emits prose-only `learning_gap` cards for missing keywords from a
different pipeline (`analyzeCareerFit`), and `CareerPage.mergeImprovements` combines the two
lists. That merge dedupes by suggestion id and by **span overlap** — but `learning_gap`
cards have no `target` and therefore no span, so they never dedupe. Without a change, the
drafted Case A card and the old prose gap for the same requirement both render.

The advisor's missing-evidence rule is the only one of the two with access to the JD clause
(the prose path's `keywordGap.missing` carries no span), so it is the one that survives:
`mergeImprovements` gains term-level suppression — an existing `learning_gap` is dropped
when an improvement covers the same canonical term.

## §7 Testing

TDD throughout; each falsifier written and watched to fail first.

**Frame extraction**
- Each worked example in §1 produces exactly the stated frame.
- An unresolvable verb produces `null`, and the card falls back to prose — no bad draft.
- A verbless clause takes the neutral `Used …` verb.
- Scaffolding is stripped from the front and nowhere else.

**Honesty**
- A drafted bullet containing a token from neither JD, frame, nor slot is refused.
- Case B drafts still pass token-provenance and claim-preservation; a role escalation is
  still rejected.
- A negated requirement never reaches a draft (already true via the ledger; locked here).

**Ownership**
- A Case A suggestion cannot apply without an entry choice.
- An applied Case A bullet lands at the end of the chosen entry and no other.
- Parse → apply → re-parse preserves every other entry's bullet set unchanged.

**Integration**
- No card in the merged list instructs without an operation — asserted over the realistic
  JD fixture by requiring every card to carry `after`, `move`, or `inputSlots`.
- A requirement covered by a drafted card produces no duplicate prose gap.
- Same JD + résumé + versions → byte-identical drafts and ordering.

## Out of scope

The `RecommendationProofPacket`, ATS Gate Atlas, and reliability vector from
`ATS_IMPLEMENTATION_AND_CAREER_RELIABILITY_DEEP_DIVE.md`. This work makes existing cards
actionable; it does not restructure how they justify themselves.
