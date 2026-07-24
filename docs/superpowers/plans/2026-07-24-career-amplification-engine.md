# Résumé Amplification Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blunt global verb-swap in `build-suggestions.ts` with a deterministic, rule-based amplification engine that strengthens the candidate's own words and prompts them for metrics, without ever inventing a factual claim.

**Architecture:** A new pure module `src/lib/career/amplify/` holds one curated static data file, a primitives layer that turns a `ResumeDocument` into raw-coordinate accomplishment lines, and five pure rule functions run in fixed order by a registry. `build-suggestions.ts` drops its inline `TORQUE_MAP` loop and calls `buildAmplifications(document)`. Quantification suggestions carry a `␟` (U+241F) sentinel that the apply-engine refuses to write to the résumé, so the machine can propose a shape but never a number.

**Tech Stack:** TypeScript (ESM, `.js` extensions on relative imports), zod v4 schemas, vitest (`npx vitest run <path>`), React 18 for the review panel.

**Spec:** `docs/superpowers/specs/2026-07-24-career-amplification-engine-design.md`

## Global Constraints

- **Law: amplify only, never add claims.** Every suggestion reshapes the candidate's *own words*. No new skills, no invented numbers, no LLM, no spaCy, no dependency parse.
- All suggestions keep `requiresUserApproval: true` and `status: 'pending'`; nothing auto-applies.
- **Determinism:** no timestamps, no randomness, no `Date`, no `Math.random`. Ids come from `makeSuggestionId(type, targetKey, evidencePayload)` (`src/lib/career/parser/identity-utils.ts`). Rules run in fixed registry order; lines are processed in source order. Analyzing the same document twice must yield a byte-identical `ResumeSuggestion[]`.
- Every amplification suggestion carries a `target.span` in **raw** coordinates (`coordinateSpace: 'raw'`) and an `evidence[]` entry with a `rule` tag.
- `before` must be byte-identical to `rawText.slice(span.start, span.end)` — `apply-suggestions.ts` skips a suggestion as `stale_span` otherwise.
- Only the **leading** verb / leading construction of an accomplishment line is ever rewritten. No mid-sentence verb swaps (that is exactly the bug being removed).
- Honors the `career-ats` capability packet: no OCR, no invented or unsupported skills, deterministic content-derived ids.
- Relative imports inside `src/lib/career/**` use explicit `.js` extensions (match existing files).
- Curated data lives in `amplify/data/verb-classes.ts` only. No rule file defines its own word list.

### Deliberate refinements to the spec (apply these, they are not deviations to re-litigate)

1. **§5.1 `<metric>` placeholders become sentinels.** The spec wrote templates like `, reducing <metric> by ␟%`. An unfilled `<metric>` would be *written to the résumé* (only `␟` is guarded). Every blank in a metric template is a `␟` with its own `inputSlot`.
2. **§5.1 `manage/led` template** is `, managing a team of ␟` rather than the spec's bare ` a team of ␟`, which produces ungrammatical output when appended (`Led the migration a team of 6`).
3. **§5.2 object class** is decided by the first object-class keyword appearing after the leading verb (no head-noun parse). Deterministic, and closer to what the curated keyword sets can actually support.
4. **§5.2 preposition guard.** Verb strengthening is skipped when the token after the weak verb is a preposition (`worked on X`, `participated in X`) — swapping there yields `Led with clients`. Those forms belong to the construction rule (Task 6).
5. **§5.3 `was/were <pp>`** is implemented only for the safe leading case (`Was promoted to X` → `Promoted to X`). Any other passive produces no suggestion.
6. `responsible` is **not** in `WEAK_VERBS` — it is handled solely by the `Responsible for <gerund>` construction, so verb strengthening can't emit `Led for managing the team`.
7. **§4 `detectWeakConstruction` / `detectFiller` live in their rule modules**, not in `primitives.ts`. Each is used by exactly one rule and carries that rule's replacement recipe; putting them in the shared primitives layer would give it two consumers' concerns. `primitives.ts` keeps only what more than one rule needs.
8. `INPUT_SENTINEL` has exactly one definition (`amplify/data/input-sentinel.ts`, Task 1). The apply-engine guard, the templates, and the UI all import it — a second copy that drifted would silently disarm the guard.
9. **§5.1 quantification clause and trailing punctuation.** Appending `template.clause` directly after `line.text` doubled sentence punctuation whenever the bullet already ended in one (`"…runtime., reducing ␟ by ␟%"`). Any trailing `[.;:!?]+` is now moved to the end of the assembled clause instead of staying stranded before the comma.

### Known boundary (test it, do not "fix" it)

`detect-conflicts.ts` marks any two overlapping accepted suggestions as `overlap` and skips **both**. A quantification suggestion targets a whole line, so accepting it *and* a tightening suggestion inside that same line drops both. This is existing engine behavior and out of scope; Task 9 pins it with a test so it is a known, documented boundary rather than a surprise.

---

## File Structure

**Create**
- `src/lib/career/amplify/data/input-sentinel.ts` — the single definition of `INPUT_SENTINEL`.
- `src/lib/career/amplify/data/verb-classes.ts` — every curated word list, template, and map. No behavior.
- `src/lib/career/amplify/primitives.ts` — `getAccomplishmentLines`, `leadingVerb`, `isQuantified`, `classifyObject`, and the shared `AmplifyContext` / `AccomplishmentLine` types.
- `src/lib/career/amplify/rules/quantification.ts` — capability 1.
- `src/lib/career/amplify/rules/verb-strength.ts` — capability 2.
- `src/lib/career/amplify/rules/weak-construction.ts` — capability 3a (passive / prefix constructions).
- `src/lib/career/amplify/rules/filler.ts` — capability 3b (filler + wordiness).
- `src/lib/career/amplify/rules/repetition.ts` — capability 4.
- `src/lib/career/amplify/registry.ts` — `buildAmplifications(document)`, fixed rule order.
- `tests/unit/fixtures/career-amplify-doc.ts` — `makeResumeDoc(rawText, kind?)` fixture helper shared by every amplify test.

**Modify**
- `src/lib/career/analysis/types.ts` — `ResumeSuggestion.type` union, `requiresInput`, `inputSlots`, `SuggestionApplicationResult.skipped[].reason`.
- `src/lib/career/schemas.ts` — matching zod changes to `ResumeSuggestionSchema`.
- `src/lib/career/suggestions/apply-suggestions.ts` — `unfilled_input` guard.
- `src/lib/career/suggestions/build-suggestions.ts` — remove the inline verb loop, call `buildAmplifications`.
- `src/pages/Career/SuggestionReviewPanel.tsx` — inline slot inputs, Accept gated until filled.
- `tests/unit/careerSuggestions.test.ts` — update the one test that assumed the global verb loop.

---

### Task 1: Schema delta + apply-engine `unfilled_input` guard

The truth boundary lands first: before any rule exists, the engine must be structurally incapable of writing an unfilled prompt into a résumé.

**Files:**
- Create: `src/lib/career/amplify/data/input-sentinel.ts`
- Modify: `src/lib/career/analysis/types.ts:38-54`, `src/lib/career/analysis/types.ts:104-111`
- Modify: `src/lib/career/schemas.ts:157-177`
- Modify: `src/lib/career/suggestions/apply-suggestions.ts:16-33`
- Test: `tests/unit/careerSuggestions.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `ResumeSuggestion` with `type` union including `'quantify' | 'tighten'`, optional `requiresInput?: boolean` and `inputSlots?: Array<{ id: string; placeholder: string; hint: string }>`; skip reason `'unfilled_input'`. Every later task depends on these.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/careerSuggestions.test.ts`, inside the top-level `describe('Career Suggestions Engine', ...)` block, after the existing `describe('applyAcceptedSuggestions', ...)` block:

```ts
  describe('unfilled input guard', () => {
    const SENTINEL = '␟';

    const baseDoc: ResumeDocument = {
      ...dummyDoc,
      rawText: 'Led the platform migration.',
    };

    function quantifySuggestion(after: string): ResumeSuggestion {
      return {
        id: 'sugg-quantify',
        type: 'quantify',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 27 } },
        before: 'Led the platform migration.',
        after,
        reason: 'add a metric',
        evidence: [],
        confidence: 0.75,
        risk: 'low',
        requiresUserApproval: true,
        status: 'accepted',
        requiresInput: true,
        inputSlots: [{ id: 'slot-0', placeholder: 'headcount', hint: 'how many people' }],
      };
    }

    it('never writes a suggestion whose input slot is still unfilled', () => {
      const result = applyAcceptedSuggestions(baseDoc, [
        quantifySuggestion(`Led the platform migration, managing a team of ${SENTINEL}`),
      ]);

      expect(result.applied).toEqual([]);
      expect(result.skipped).toContainEqual({
        suggestionId: 'sugg-quantify',
        reason: 'unfilled_input',
      });
      expect(result.text).toBe('Led the platform migration.');
      expect(result.text).not.toContain(SENTINEL);
    });

    it('applies the same suggestion once every slot is filled', () => {
      const result = applyAcceptedSuggestions(baseDoc, [
        quantifySuggestion('Led the platform migration, managing a team of 6'),
      ]);

      expect(result.applied).toEqual(['sugg-quantify']);
      expect(result.text).toBe('Led the platform migration, managing a team of 6');
    });

    it('ignores the guard for suggestions that do not require input', () => {
      const plain: ResumeSuggestion = {
        ...quantifySuggestion('Led the platform migration, managing a team of 6'),
        id: 'sugg-plain',
        requiresInput: undefined,
        inputSlots: undefined,
      };

      const result = applyAcceptedSuggestions(baseDoc, [plain]);
      expect(result.applied).toEqual(['sugg-plain']);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/careerSuggestions.test.ts -t "unfilled input guard"`
Expected: FAIL — TypeScript rejects `type: 'quantify'` / `requiresInput`, and the first test fails because the sentinel text is applied.

- [ ] **Step 3: Widen the types**

In `src/lib/career/analysis/types.ts`, replace the `ResumeSuggestion` interface (currently lines 38-54) with:

```ts
export interface SuggestionInputSlot {
  id: string;
  placeholder: string;
  hint: string;
}

export interface ResumeSuggestion {
  id: string;
  type: 'verb' | 'keyword' | 'acronym' | 'format' | 'structure' | 'quantify' | 'tighten';
  target?: {
    span?: TextSpan;
    sectionId?: string;
    insertionPoint?: 'before_section' | 'after_section' | 'document_end';
  };
  before?: string;
  after?: string;
  reason: string;
  evidence: AnalysisEvidence[];
  confidence: number;
  risk: 'low' | 'medium' | 'high';
  requiresUserApproval: true;
  status: 'pending' | 'accepted' | 'rejected' | 'edited';
  /** True when `after` contains one or more U+241F input sentinels the candidate must fill. */
  requiresInput?: boolean;
  /** One entry per sentinel in `after`, in left-to-right order. */
  inputSlots?: SuggestionInputSlot[];
}
```

In the same file, replace the `SuggestionApplicationResult` skip reason union (currently line 109) with:

```ts
    reason:
      | 'rejected'
      | 'stale_span'
      | 'overlap'
      | 'missing_target'
      | 'conflict'
      | 'unfilled_input';
```

- [ ] **Step 4: Widen the zod schema**

In `src/lib/career/schemas.ts`, replace the `type` line and append the two optional fields inside `ResumeSuggestionSchema`:

```ts
export const SuggestionInputSlotSchema = z.object({
  id: z.string(),
  placeholder: z.string(),
  hint: z.string(),
});

export const ResumeSuggestionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'verb',
    'keyword',
    'acronym',
    'format',
    'structure',
    'quantify',
    'tighten',
  ]),
  target: z
    .object({
      span: TextSpanSchema.optional(),
      sectionId: z.string().optional(),
      insertionPoint: z
        .enum(['before_section', 'after_section', 'document_end'])
        .optional(),
    })
    .optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  reason: z.string(),
  evidence: z.array(AnalysisEvidenceSchema),
  confidence: z.number(),
  risk: z.enum(['low', 'medium', 'high']),
  requiresUserApproval: z.literal(true),
  status: z.enum(['pending', 'accepted', 'rejected', 'edited']),
  requiresInput: z.boolean().optional(),
  inputSlots: z.array(SuggestionInputSlotSchema).optional(),
});
```

- [ ] **Step 5: Add the guard to the apply engine**

Create `src/lib/career/amplify/data/input-sentinel.ts` — the one definition every consumer imports:

```ts
/**
 * U+241F SYMBOL FOR UNIT SEPARATOR — a sentinel that cannot occur in résumé prose,
 * so "this blank is still unfilled" is unambiguous.
 *
 * Single source of truth: the apply-engine guard, the metric templates, and the
 * review panel all import this. A second copy that drifted would disarm the guard.
 */
export const INPUT_SENTINEL = '␟';
```

In `src/lib/career/suggestions/apply-suggestions.ts`, add below the existing imports:

```ts
import { INPUT_SENTINEL } from '../amplify/data/input-sentinel.js';
```

Widen the local `skipped` declaration (currently lines 17-20):

```ts
  const skipped: Array<{
    suggestionId: string;
    reason:
      | 'rejected'
      | 'stale_span'
      | 'overlap'
      | 'missing_target'
      | 'conflict'
      | 'unfilled_input';
  }> = [];
```

Then, inside the `for (const s of acceptedSuggestions)` loop, immediately after the `if (conflicts.has(s.id))` block and *before* the `if (s.target?.span)` branch, insert:

```ts
    if (s.requiresInput === true && (s.after ?? '').includes(INPUT_SENTINEL)) {
      skipped.push({ suggestionId: s.id, reason: 'unfilled_input' });
      continue;
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/careerSuggestions.test.ts`
Expected: PASS — all pre-existing tests in the file plus the three new ones.

- [ ] **Step 7: Commit**

```bash
git add src/lib/career/amplify/data/input-sentinel.ts src/lib/career/analysis/types.ts src/lib/career/schemas.ts src/lib/career/suggestions/apply-suggestions.ts tests/unit/careerSuggestions.test.ts
git commit -m "feat(career): add quantify/tighten suggestion types and unfilled-input apply guard"
```

---

### Task 2: Curated amplification data

One static file, no behavior. The invariant test is real: a template whose sentinel count disagrees with its slot count would render an unfillable prompt in the UI.

**Files:**
- Create: `src/lib/career/amplify/data/verb-classes.ts`
- Test: `tests/unit/careerAmplifyData.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (imported by every later task):
  - `INPUT_SENTINEL: '␟'`
  - `type ObjectClass = 'people' | 'system' | 'process' | 'data' | 'outcome' | 'project'`
  - `OBJECT_CLASS_ORDER: readonly ObjectClass[]`
  - `WEAK_VERBS`, `STRONG_VERBS`, `KNOWN_VERBS`, `PREPOSITIONS`, `FILLER_PATTERNS` (see code)
  - `OBJECT_CLASS_KEYWORDS: Record<ObjectClass, readonly string[]>`
  - `CLASS_STRONG_VERB: Record<ObjectClass, string>`
  - `type MetricClass = 'reduce' | 'increase' | 'save' | 'team' | 'open'`
  - `MEASURABLE_VERB_CLASS: Record<string, MetricClass>`
  - `METRIC_TEMPLATES: Record<MetricClass, { clause: string; slots: Array<{ placeholder: string; hint: string }> }>`
  - `GERUND_PAST: Record<string, string>`, `STEM_PAST: Record<string, string>`, `LEADING_PARTICIPLES: ReadonlySet<string>`
  - `VARIETY_MAP: Record<string, readonly string[]>`
  - `MAGNITUDE_RE`, `NUMBER_WORD_RE`

- [ ] **Step 1: Write the failing invariant test**

Create `tests/unit/careerAmplifyData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  INPUT_SENTINEL,
  METRIC_TEMPLATES,
  MEASURABLE_VERB_CLASS,
  WEAK_VERBS,
  STRONG_VERBS,
  VARIETY_MAP,
  OBJECT_CLASS_ORDER,
  OBJECT_CLASS_KEYWORDS,
  CLASS_STRONG_VERB,
} from '../../src/lib/career/amplify/data/verb-classes';

describe('amplify curated data', () => {
  it('uses U+241F as the input sentinel', () => {
    expect(INPUT_SENTINEL).toBe('␟');
    expect(INPUT_SENTINEL.length).toBe(1);
  });

  it('gives every metric template exactly one slot per sentinel', () => {
    for (const [name, template] of Object.entries(METRIC_TEMPLATES)) {
      const sentinels = template.clause.split(INPUT_SENTINEL).length - 1;
      expect(sentinels, `template ${name} sentinel count`).toBeGreaterThan(0);
      expect(template.slots.length, `template ${name} slot count`).toBe(sentinels);
      for (const slot of template.slots) {
        expect(slot.placeholder.length).toBeGreaterThan(0);
        expect(slot.hint.length).toBeGreaterThan(0);
      }
    }
  });

  it('maps every measurable verb to a defined metric template', () => {
    for (const [verb, metricClass] of Object.entries(MEASURABLE_VERB_CLASS)) {
      expect(verb).toBe(verb.toLowerCase());
      expect(METRIC_TEMPLATES[metricClass], `verb ${verb}`).toBeDefined();
    }
  });

  it('keeps weak and strong verb sets lowercase and disjoint', () => {
    for (const verb of WEAK_VERBS) expect(verb).toBe(verb.toLowerCase());
    for (const verb of STRONG_VERBS) {
      expect(verb).toBe(verb.toLowerCase());
      expect(WEAK_VERBS.has(verb), `${verb} in both sets`).toBe(false);
    }
    expect(WEAK_VERBS.has('responsible')).toBe(false);
  });

  it('offers variety only for verbs it recognises as strong', () => {
    for (const [verb, alternatives] of Object.entries(VARIETY_MAP)) {
      expect(STRONG_VERBS.has(verb), `variety key ${verb}`).toBe(true);
      expect(alternatives.length).toBeGreaterThan(0);
      for (const alt of alternatives) {
        expect(alt[0]).toBe(alt[0].toUpperCase());
        expect(alt.toLowerCase()).not.toBe(verb);
      }
    }
  });

  it('defines keywords and a strong verb for every object class', () => {
    for (const cls of OBJECT_CLASS_ORDER) {
      expect(OBJECT_CLASS_KEYWORDS[cls].length).toBeGreaterThan(0);
      expect(CLASS_STRONG_VERB[cls]).toBeTruthy();
      for (const keyword of OBJECT_CLASS_KEYWORDS[cls]) {
        expect(keyword).toBe(keyword.toLowerCase());
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyData.test.ts`
Expected: FAIL — `Failed to resolve import ".../amplify/data/verb-classes"`.

- [ ] **Step 3: Write the data module**

Create `src/lib/career/amplify/data/verb-classes.ts`:

```ts
/**
 * Curated static data for the résumé amplification engine.
 * Behavior lives in ../primitives.ts and ../rules/*; this file is words only.
 */

import { INPUT_SENTINEL } from './input-sentinel.js';

export { INPUT_SENTINEL };

export type ObjectClass =
  | 'people'
  | 'system'
  | 'process'
  | 'data'
  | 'outcome'
  | 'project';

/** Fixed evaluation order — the first class that matches a token wins. */
export const OBJECT_CLASS_ORDER: readonly ObjectClass[] = [
  'people',
  'system',
  'process',
  'data',
  'outcome',
  'project',
];

export const OBJECT_CLASS_KEYWORDS: Record<ObjectClass, readonly string[]> = {
  people: ['team', 'staff', 'engineer', 'developer', 'client', 'customer', 'intern', 'stakeholder', 'contractor', 'volunteer'],
  system: ['system', 'api', 'service', 'platform', 'pipeline', 'app', 'application', 'website', 'database', 'server', 'integration'],
  process: ['process', 'workflow', 'deployment', 'release', 'onboarding', 'procedure', 'operation', 'rollout'],
  data: ['data', 'dataset', 'report', 'analysis', 'metric', 'dashboard', 'model', 'survey'],
  outcome: ['revenue', 'cost', 'growth', 'retention', 'churn', 'conversion', 'profit', 'sales', 'engagement'],
  project: ['project', 'initiative', 'launch', 'migration', 'campaign', 'rewrite', 'redesign', 'program'],
};

export const CLASS_STRONG_VERB: Record<ObjectClass, string> = {
  people: 'Led',
  system: 'Built',
  process: 'Streamlined',
  data: 'Analyzed',
  outcome: 'Drove',
  project: 'Spearheaded',
};

/**
 * Weak leading verbs eligible for strengthening.
 * `responsible` is deliberately absent: `Responsible for <gerund>` is a construction
 * (see rules/weak-construction.ts), and swapping just the word would produce
 * "Led for managing the team".
 */
export const WEAK_VERBS: ReadonlySet<string> = new Set([
  'helped',
  'worked',
  'did',
  'handled',
  'used',
  'assisted',
  'participated',
  'supported',
  'contributed',
  'aided',
  'performed',
]);

export const STRONG_VERBS: ReadonlySet<string> = new Set([
  'led', 'built', 'streamlined', 'analyzed', 'drove', 'spearheaded',
  'reduced', 'cut', 'increased', 'grew', 'improved', 'saved', 'managed',
  'delivered', 'launched', 'automated', 'designed', 'created', 'developed',
  'engineered', 'implemented', 'owned', 'shipped', 'negotiated', 'trained',
  'migrated', 'authored', 'resolved', 'coordinated',
]);

/** Verbs recognised as verbs for line classification but never rewritten. */
export const KNOWN_VERBS: ReadonlySet<string> = new Set([
  'was', 'were', 'ran', 'wrote', 'oversaw', 'grew', 'won', 'set', 'kept',
  'held', 'took', 'made', 'sold', 'taught', 'spoke', 'drew',
]);

/** After a weak leading verb, these mean the verb governs no direct object. */
export const PREPOSITIONS: ReadonlySet<string> = new Set([
  'on', 'with', 'for', 'in', 'at', 'to', 'from', 'as', 'under',
  'alongside', 'across', 'through', 'within', 'during', 'toward', 'towards',
]);

export type MetricClass = 'reduce' | 'increase' | 'save' | 'team' | 'open';

/** Leading verbs whose accomplishments are measurable — the only quantification triggers. */
export const MEASURABLE_VERB_CLASS: Record<string, MetricClass> = {
  reduced: 'reduce',
  cut: 'reduce',
  increased: 'increase',
  grew: 'increase',
  improved: 'increase',
  saved: 'save',
  managed: 'team',
  led: 'team',
  built: 'open',
  delivered: 'open',
  launched: 'open',
  automated: 'open',
};

export interface MetricTemplate {
  clause: string;
  slots: Array<{ placeholder: string; hint: string }>;
}

/**
 * Every blank is a sentinel with its own slot. The machine never fills one —
 * apply-suggestions.ts refuses to write a suggestion that still contains U+241F.
 */
export const METRIC_TEMPLATES: Record<MetricClass, MetricTemplate> = {
  reduce: {
    clause: `, reducing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}%`,
    slots: [
      { placeholder: 'what you reduced', hint: 'e.g. build time, support tickets' },
      { placeholder: 'percent', hint: 'e.g. 40' },
    ],
  },
  increase: {
    clause: `, increasing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}% (from ${INPUT_SENTINEL} to ${INPUT_SENTINEL})`,
    slots: [
      { placeholder: 'what you increased', hint: 'e.g. weekly active users' },
      { placeholder: 'percent', hint: 'e.g. 32' },
      { placeholder: 'starting value', hint: 'e.g. 12k' },
      { placeholder: 'ending value', hint: 'e.g. 16k' },
    ],
  },
  save: {
    clause: `, saving $${INPUT_SENTINEL}/yr`,
    slots: [{ placeholder: 'amount', hint: 'annual dollars saved, e.g. 120k' }],
  },
  team: {
    clause: `, managing a team of ${INPUT_SENTINEL}`,
    slots: [{ placeholder: 'headcount', hint: 'how many people, e.g. 6' }],
  },
  open: {
    clause: `, ${INPUT_SENTINEL}`,
    slots: [
      {
        placeholder: 'measurable outcome',
        hint: "the result in numbers, e.g. 'cutting page load from 2.1s to 0.4s'",
      },
    ],
  },
};

/** `Responsible for managing X` / `Duties included managing X` → `Managed X`. */
export const GERUND_PAST: Record<string, string> = {
  managing: 'Managed',
  leading: 'Led',
  building: 'Built',
  developing: 'Developed',
  running: 'Ran',
  maintaining: 'Maintained',
  testing: 'Tested',
  designing: 'Designed',
  coordinating: 'Coordinated',
  supporting: 'Supported',
  overseeing: 'Oversaw',
  handling: 'Handled',
  training: 'Trained',
  writing: 'Wrote',
  creating: 'Created',
  reporting: 'Reported',
  scheduling: 'Scheduled',
};

/** `Helped (to) migrate X` → `Migrated X`. */
export const STEM_PAST: Record<string, string> = {
  migrate: 'Migrated',
  build: 'Built',
  design: 'Designed',
  develop: 'Developed',
  launch: 'Launched',
  ship: 'Shipped',
  test: 'Tested',
  train: 'Trained',
  write: 'Wrote',
  create: 'Created',
  manage: 'Managed',
  run: 'Ran',
  deploy: 'Deployed',
  automate: 'Automated',
  improve: 'Improved',
  reduce: 'Reduced',
  resolve: 'Resolved',
};

/** `Was promoted to X` → `Promoted to X`. Leading position only. */
export const LEADING_PARTICIPLES: ReadonlySet<string> = new Set([
  'promoted', 'selected', 'awarded', 'recognized', 'recognised',
  'chosen', 'appointed', 'hired', 'certified', 'nominated',
]);

/** Alternatives offered for an over-used leading verb (2nd occurrence onward). */
export const VARIETY_MAP: Record<string, readonly string[]> = {
  led: ['Directed', 'Headed', 'Guided'],
  built: ['Engineered', 'Constructed', 'Assembled'],
  managed: ['Oversaw', 'Coordinated', 'Administered'],
  created: ['Produced', 'Authored', 'Established'],
  developed: ['Engineered', 'Advanced', 'Produced'],
  designed: ['Architected', 'Devised', 'Modeled'],
  improved: ['Enhanced', 'Refined', 'Elevated'],
  implemented: ['Deployed', 'Instituted', 'Delivered'],
  delivered: ['Shipped', 'Completed', 'Released'],
};

/** Filler and hedge patterns, matched in this fixed order. `after` is the replacement. */
export const FILLER_PATTERNS: ReadonlyArray<{ rule: string; pattern: RegExp; after: string }> = [
  { rule: 'wordiness_in_order_to', pattern: /\bin order to\b/gi, after: 'to' },
  { rule: 'filler_a_variety_of', pattern: /\ba variety of\s+/gi, after: '' },
  { rule: 'filler_a_number_of', pattern: /\ba number of\s+/gi, after: '' },
  { rule: 'filler_successfully', pattern: /\bsuccessfully\s+/gi, after: '' },
  { rule: 'filler_basically', pattern: /\bbasically\s+/gi, after: '' },
  { rule: 'filler_various', pattern: /\bvarious\s+/gi, after: '' },
  { rule: 'filler_several', pattern: /\bseveral\s+/gi, after: '' },
];

/** Magnitude and number words that count as an existing metric. */
export const MAGNITUDE_RE = /\b(?:thousand|million|billion|bn|dozen|hundred)\b/i;
export const NUMBER_WORD_RE =
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)\b/i;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyData.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/amplify/data/verb-classes.ts tests/unit/careerAmplifyData.test.ts
git commit -m "feat(career): add curated amplification verb classes and metric templates"
```

---

### Task 3: Primitives layer

**Files:**
- Create: `src/lib/career/amplify/primitives.ts`
- Create: `tests/unit/fixtures/career-amplify-doc.ts`
- Test: `tests/unit/careerAmplifyPrimitives.test.ts`

**Interfaces:**
- Consumes: everything from `data/verb-classes.ts` (Task 2).
- Produces:
  - `interface AccomplishmentLine { text: string; span: TextSpan; sectionKind: string }`
  - `interface AmplifyContext { document: ResumeDocument; lines: AccomplishmentLine[] }`
  - `getAccomplishmentLines(doc: ResumeDocument): AccomplishmentLine[]`
  - `interface VerbMatch { verb: string; span: TextSpan; offsetInLine: number }`
  - `leadingVerb(line: AccomplishmentLine): VerbMatch | null`
  - `isQuantified(text: string): boolean`
  - `classifyObject(line: AccomplishmentLine, fromOffset: number): { objectClass: ObjectClass; keyword: string } | null`
  - `nextTokenAfter(line: AccomplishmentLine, fromOffset: number): string | null`
  - `capitalizeFirst(word: string): string`
  - Fixture: `makeResumeDoc(rawText: string, kind?: string): ResumeDocument`

- [ ] **Step 1: Write the fixture helper**

Create `tests/unit/fixtures/career-amplify-doc.ts`:

```ts
import type { ResumeDocument } from '../../../src/lib/career/parser/types';

/**
 * Minimal single-section ResumeDocument whose section span covers the whole raw text,
 * so accomplishment-line raw coordinates equal plain string offsets.
 */
export function makeResumeDoc(rawText: string, kind = 'experience'): ResumeDocument {
  return {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'fixture.txt' },
    rawText,
    normalizedText: rawText.toLowerCase(),
    offsetMap: [],
    sections: [
      {
        id: `section:${kind}:0:${rawText.length}`,
        kind: kind as ResumeDocument['sections'][number]['kind'],
        heading: null,
        text: rawText,
        span: { coordinateSpace: 'raw', start: 0, end: rawText.length },
        confidence: 0.9,
        evidence: [],
      },
    ],
    contact: { links: [] },
    diagnostics: [],
    confidence: 0.9,
  };
}
```

- [ ] **Step 2: Write the failing primitives test**

Create `tests/unit/careerAmplifyPrimitives.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getAccomplishmentLines,
  leadingVerb,
  isQuantified,
  classifyObject,
  nextTokenAfter,
} from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

describe('amplify primitives', () => {
  describe('getAccomplishmentLines', () => {
    it('returns trimmed lines with exact raw spans', () => {
      const raw = 'Led the platform team.\n  Built the billing API.\n';
      const lines = getAccomplishmentLines(makeResumeDoc(raw));

      expect(lines.map((l) => l.text)).toEqual([
        'Led the platform team.',
        'Built the billing API.',
      ]);
      for (const line of lines) {
        expect(raw.slice(line.span.start, line.span.end)).toBe(line.text);
        expect(line.span.coordinateSpace).toBe('raw');
        expect(line.sectionKind).toBe('experience');
      }
    });

    it('ignores sections that are not experience, projects, or summary', () => {
      const doc = makeResumeDoc('Python, TypeScript, SQL', 'skills');
      expect(getAccomplishmentLines(doc)).toEqual([]);
    });

    it('skips a first line that merely repeats the section heading', () => {
      const doc = makeResumeDoc('EXPERIENCE\nLed the platform team.');
      doc.sections[0].heading = 'EXPERIENCE';
      const lines = getAccomplishmentLines(doc);
      expect(lines.map((l) => l.text)).toEqual(['Led the platform team.']);
    });

    it('returns nothing when a section span is out of range', () => {
      const doc = makeResumeDoc('Led the platform team.');
      doc.sections[0].span = { coordinateSpace: 'raw', start: 0, end: 9999 };
      expect(getAccomplishmentLines(doc)).toEqual([]);
    });
  });

  describe('leadingVerb', () => {
    it('finds the verb past a bullet marker with a raw span', () => {
      const raw = '• helped the support team';
      const [line] = getAccomplishmentLines(makeResumeDoc(raw));
      const verb = leadingVerb(line);

      expect(verb?.verb).toBe('helped');
      expect(raw.slice(verb!.span.start, verb!.span.end)).toBe('helped');
    });

    it('returns null when the line does not begin with a verb', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Senior Platform Engineer'));
      expect(leadingVerb(line)).toBeNull();
    });
  });

  describe('isQuantified', () => {
    it.each([
      'Reduced build time by 40%',
      'Saved $120k per year',
      'Grew signups 3x',
      'Led a team of five engineers',
      'Cut costs by half a million',
    ])('treats "%s" as already quantified', (text) => {
      expect(isQuantified(text)).toBe(true);
    });

    it.each([
      'Reduced build time significantly',
      'Led the platform team',
      'Improved the onboarding flow',
    ])('treats "%s" as un-quantified', (text) => {
      expect(isQuantified(text)).toBe(false);
    });
  });

  describe('classifyObject', () => {
    it('classifies by the first class keyword after the verb', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Helped the support team'));
      expect(classifyObject(line, 'Helped'.length)).toEqual({
        objectClass: 'people',
        keyword: 'team',
      });
    });

    it('matches plural keywords', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Worked on the payment APIs'));
      expect(classifyObject(line, 'Worked'.length)?.objectClass).toBe('system');
    });

    it('returns null when no curated keyword appears', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Handled the paperwork'));
      expect(classifyObject(line, 'Handled'.length)).toBeNull();
    });
  });

  describe('nextTokenAfter', () => {
    it('returns the next word in lowercase', () => {
      const [line] = getAccomplishmentLines(makeResumeDoc('Worked on the API'));
      expect(nextTokenAfter(line, 'Worked'.length)).toBe('on');
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyPrimitives.test.ts`
Expected: FAIL — `Failed to resolve import ".../amplify/primitives"`.

- [ ] **Step 4: Write the primitives module**

Create `src/lib/career/amplify/primitives.ts`:

```ts
import type { ResumeDocument, TextSpan } from '../parser/types.js';
import {
  WEAK_VERBS,
  STRONG_VERBS,
  KNOWN_VERBS,
  OBJECT_CLASS_ORDER,
  OBJECT_CLASS_KEYWORDS,
  MAGNITUDE_RE,
  NUMBER_WORD_RE,
  type ObjectClass,
} from './data/verb-classes.js';

/** Only these sections contain accomplishments worth amplifying. */
const AMPLIFY_SECTION_KINDS: ReadonlySet<string> = new Set([
  'experience',
  'projects',
  'summary',
]);

const BULLET_PREFIX = /^(?:[•·▪◦–—*-]|\d+[.)])\s+/;

export interface AccomplishmentLine {
  /** Trimmed line text; byte-identical to rawText.slice(span.start, span.end). */
  text: string;
  span: TextSpan;
  sectionKind: string;
}

export interface AmplifyContext {
  document: ResumeDocument;
  lines: AccomplishmentLine[];
}

export interface VerbMatch {
  verb: string;
  span: TextSpan;
  /** Index of the verb inside line.text. */
  offsetInLine: number;
}

/**
 * Slice each amplifiable section straight out of rawText (never section.text) so every
 * emitted span is exact — apply-suggestions.ts rejects a suggestion whose `before`
 * does not match rawText at its span.
 */
export function getAccomplishmentLines(doc: ResumeDocument): AccomplishmentLine[] {
  const rawText = doc?.rawText || '';
  const out: AccomplishmentLine[] = [];

  for (const section of doc?.sections || []) {
    if (!AMPLIFY_SECTION_KINDS.has(section.kind)) continue;

    const span = section.span;
    if (!span || span.coordinateSpace !== 'raw') continue;
    const { start, end } = span;
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      start < 0 ||
      end > rawText.length ||
      start >= end
    ) {
      continue;
    }

    const heading = section.heading ? section.heading.trim() : null;
    let cursor = 0;
    let isFirstLine = true;

    for (const rawLine of rawText.slice(start, end).split('\n')) {
      const lineStart = start + cursor;
      cursor += rawLine.length + 1;

      const text = rawLine.trim();
      const wasFirst = isFirstLine;
      if (text) isFirstLine = false;
      if (!text) continue;
      if (wasFirst && heading && text === heading) continue;

      const leadingWs = rawLine.length - rawLine.trimStart().length;
      out.push({
        text,
        span: {
          coordinateSpace: 'raw',
          start: lineStart + leadingWs,
          end: lineStart + leadingWs + text.length,
        },
        sectionKind: section.kind,
      });
    }
  }

  return out;
}

/** The verb a bullet leads with, or null when the line is not a verb-led accomplishment. */
export function leadingVerb(line: AccomplishmentLine): VerbMatch | null {
  const bullet = BULLET_PREFIX.exec(line.text);
  const offset = bullet ? bullet[0].length : 0;
  const token = /^[A-Za-z]+/.exec(line.text.slice(offset));
  if (!token) return null;

  const word = token[0];
  const lower = word.toLowerCase();
  const isVerb =
    WEAK_VERBS.has(lower) ||
    STRONG_VERBS.has(lower) ||
    KNOWN_VERBS.has(lower) ||
    (lower.length > 4 && /(?:ed|ing)$/.test(lower));
  if (!isVerb) return null;

  return {
    verb: word,
    offsetInLine: offset,
    span: {
      coordinateSpace: 'raw',
      start: line.span.start + offset,
      end: line.span.start + offset + word.length,
    },
  };
}

/**
 * Conservative on purpose: a false positive suppresses a prompt (safe),
 * a false negative prompts for a metric that is already there (noise).
 */
export function isQuantified(text: string): boolean {
  if (/\d/.test(text)) return true;
  if (/[%$#]/.test(text)) return true;
  if (MAGNITUDE_RE.test(text)) return true;
  if (NUMBER_WORD_RE.test(text)) return true;
  return false;
}

function singular(token: string): string {
  return token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
}

/** First curated object-class keyword appearing after `fromOffset` (index into line.text). */
export function classifyObject(
  line: AccomplishmentLine,
  fromOffset: number
): { objectClass: ObjectClass; keyword: string } | null {
  const tokens = line.text.slice(fromOffset).toLowerCase().match(/[a-z][a-z-]*/g) || [];

  for (const token of tokens) {
    const base = singular(token);
    for (const cls of OBJECT_CLASS_ORDER) {
      const keywords = OBJECT_CLASS_KEYWORDS[cls];
      if (keywords.includes(token) || keywords.includes(base)) {
        return { objectClass: cls, keyword: token };
      }
    }
  }

  return null;
}

export function nextTokenAfter(
  line: AccomplishmentLine,
  fromOffset: number
): string | null {
  const match = /[A-Za-z][A-Za-z-]*/.exec(line.text.slice(fromOffset));
  return match ? match[0].toLowerCase() : null;
}

export function capitalizeFirst(word: string): string {
  return word.length === 0 ? word : word[0].toUpperCase() + word.slice(1);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyPrimitives.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/career/amplify/primitives.ts tests/unit/careerAmplifyPrimitives.test.ts tests/unit/fixtures/career-amplify-doc.ts
git commit -m "feat(career): add amplification primitives over raw-coordinate accomplishment lines"
```

---

### Task 4: Quantification rule (centerpiece)

**Files:**
- Create: `src/lib/career/amplify/rules/quantification.ts`
- Test: `tests/unit/careerAmplifyQuantification.test.ts`

**Interfaces:**
- Consumes: `AmplifyContext`, `leadingVerb`, `isQuantified` (Task 3); `MEASURABLE_VERB_CLASS`, `METRIC_TEMPLATES`, `INPUT_SENTINEL` (Task 2); `makeSuggestionId` from `../../parser/identity-utils.js`.
- Produces: `quantificationRule(ctx: AmplifyContext): ResumeSuggestion[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/careerAmplifyQuantification.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { quantificationRule } from '../../src/lib/career/amplify/rules/quantification';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/verb-classes';
import { makeResumeDoc } from './fixtures/career-amplify-doc';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

function run(raw: string) {
  const document: ResumeDocument = makeResumeDoc(raw);
  return quantificationRule({ document, lines: getAccomplishmentLines(document) });
}

describe('quantification rule', () => {
  it('prompts for a metric on an un-quantified measurable accomplishment', () => {
    const raw = 'Reduced the deployment pipeline runtime.';
    const [sug] = run(raw);

    expect(sug.type).toBe('quantify');
    expect(sug.requiresInput).toBe(true);
    expect(sug.before).toBe(raw);
    expect(sug.after).toBe(
      `Reduced the deployment pipeline runtime, reducing ${INPUT_SENTINEL} by ${INPUT_SENTINEL}%.`
    );
    expect(sug.inputSlots).toHaveLength(2);
    expect(sug.target?.span).toEqual({ coordinateSpace: 'raw', start: 0, end: raw.length });
    expect(sug.status).toBe('pending');
    expect(sug.requiresUserApproval).toBe(true);
    expect(sug.risk).toBe('low');
    expect(sug.evidence[0].rule).toBe('quantification');
  });

  it('never fills a slot itself', () => {
    const suggestions = run('Led the billing platform rewrite.');
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].after).toContain(INPUT_SENTINEL);
    expect(suggestions[0].after).toBe(
      `Led the billing platform rewrite, managing a team of ${INPUT_SENTINEL}.`
    );
  });

  it('stays silent on a line that already carries a metric', () => {
    expect(run('Reduced build time by 40%.')).toEqual([]);
  });

  it('stays silent on a line whose leading verb is not measurable', () => {
    expect(run('Presented the roadmap to stakeholders.')).toEqual([]);
  });

  it('stays silent on a line that does not lead with a verb', () => {
    expect(run('Senior Platform Engineer, Acme Corp')).toEqual([]);
  });

  it('gives one slot id per sentinel, in left-to-right order', () => {
    const [sug] = run('Increased trial conversion.');
    const sentinels = (sug.after || '').split(INPUT_SENTINEL).length - 1;
    expect(sentinels).toBe(4);
    expect(sug.inputSlots?.map((s) => s.id)).toEqual([
      `${sug.id}:slot:0`,
      `${sug.id}:slot:1`,
      `${sug.id}:slot:2`,
      `${sug.id}:slot:3`,
    ]);
  });

  it('produces identical ids across runs', () => {
    const a = run('Reduced the deployment pipeline runtime.');
    const b = run('Reduced the deployment pipeline runtime.');
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyQuantification.test.ts`
Expected: FAIL — `Failed to resolve import ".../rules/quantification"`.

- [ ] **Step 3: Write the rule**

Create `src/lib/career/amplify/rules/quantification.ts`:

```ts
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import { leadingVerb, isQuantified, type AmplifyContext } from '../primitives.js';
import { MEASURABLE_VERB_CLASS, METRIC_TEMPLATES } from '../data/verb-classes.js';

/**
 * Capability 1 — prompt the candidate for a metric.
 * The template is ours; every number stays theirs. `requiresInput` plus the U+241F
 * sentinels mean an unfilled prompt can never reach the résumé.
 */
export function quantificationRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    if (isQuantified(line.text)) continue;

    const verb = leadingVerb(line);
    if (!verb) continue;

    const metricClass = MEASURABLE_VERB_CLASS[verb.verb.toLowerCase()];
    if (!metricClass) continue;

    const template = METRIC_TEMPLATES[metricClass];
    const targetKey = `${line.span.start}:${line.span.end}`;
    const id = makeSuggestionId('quantify', targetKey, `${metricClass}:${line.text}`);

    suggestions.push({
      id,
      type: 'quantify',
      target: { span: line.span },
      before: line.text,
      after: line.text + template.clause,
      reason:
        'This accomplishment has no measurable result. Fill in each blank with your own ' +
        'numbers — nothing is written to your résumé until every blank is filled.',
      evidence: [
        {
          source: 'resume',
          rule: 'quantification',
          text: line.text,
          span: line.span,
          confidence: 0.75,
        },
      ],
      confidence: 0.75,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
      requiresInput: true,
      inputSlots: template.slots.map((slot, index) => ({
        id: `${id}:slot:${index}`,
        placeholder: slot.placeholder,
        hint: slot.hint,
      })),
    });
  }

  return suggestions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyQuantification.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/amplify/rules/quantification.ts tests/unit/careerAmplifyQuantification.test.ts
git commit -m "feat(career): add quantification prompt rule with unfillable-by-machine slots"
```

---

### Task 5: Context-aware verb strengthening

**Files:**
- Create: `src/lib/career/amplify/rules/verb-strength.ts`
- Test: `tests/unit/careerAmplifyVerbStrength.test.ts`

**Interfaces:**
- Consumes: `AmplifyContext`, `leadingVerb`, `classifyObject`, `nextTokenAfter`, `capitalizeFirst` (Task 3); `WEAK_VERBS`, `PREPOSITIONS`, `CLASS_STRONG_VERB` (Task 2); `TORQUE_MAP` from `../../transmuter.js`.
- Produces: `verbStrengthRule(ctx: AmplifyContext): ResumeSuggestion[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/careerAmplifyVerbStrength.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { verbStrengthRule } from '../../src/lib/career/amplify/rules/verb-strength';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return verbStrengthRule({ document, lines: getAccomplishmentLines(document) });
}

describe('verb strength rule', () => {
  it('strengthens a weak leading verb using the object it governs', () => {
    const raw = 'Helped the support team resolve escalations.';
    const [sug] = run(raw);

    expect(sug.type).toBe('verb');
    expect(sug.before).toBe('Helped');
    expect(sug.after).toBe('Led');
    expect(sug.target?.span).toEqual({ coordinateSpace: 'raw', start: 0, end: 6 });
    expect(raw.slice(sug.target!.span!.start, sug.target!.span!.end)).toBe(sug.before);
    expect(sug.evidence[0].rule).toBe('verb_strength_class');
    expect(sug.requiresInput).toBeUndefined();
  });

  it('picks a different strong verb for a different object class', () => {
    expect(run('Handled the deployment process end to end.')[0].after).toBe('Streamlined');
    expect(run('Used the reporting dashboard daily.')[0].after).toBe('Analyzed');
  });

  it('leaves an already-strong leading verb alone', () => {
    expect(run('Spearheaded the billing migration.')).toEqual([]);
  });

  it('never touches a weak verb that is not leading', () => {
    const raw = 'Built the API and helped the team adopt it.';
    expect(run(raw)).toEqual([]);
  });

  it('skips prepositional forms, which belong to the construction rule', () => {
    expect(run('Worked on the payment API.')).toEqual([]);
    expect(run('Participated in the design review.')).toEqual([]);
  });

  it('falls back to the object-agnostic torque map when no class matches', () => {
    const [sug] = run('Used Docker daily.');
    expect(sug.after).toBe('Leveraged');
    expect(sug.evidence[0].rule).toBe('verb_strength_torque_fallback');
  });

  it('emits nothing when neither a class nor a torque fallback exists', () => {
    expect(run('Aided the paperwork.')).toEqual([]);
  });

  it('is deterministic', () => {
    const raw = 'Helped the support team resolve escalations.';
    expect(run(raw)).toEqual(run(raw));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyVerbStrength.test.ts`
Expected: FAIL — `Failed to resolve import ".../rules/verb-strength"`.

- [ ] **Step 3: Write the rule**

Create `src/lib/career/amplify/rules/verb-strength.ts`:

```ts
import { makeSuggestionId } from '../../parser/identity-utils.js';
import { TORQUE_MAP } from '../../transmuter.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import {
  leadingVerb,
  classifyObject,
  nextTokenAfter,
  capitalizeFirst,
  type AmplifyContext,
} from '../primitives.js';
import { WEAK_VERBS, PREPOSITIONS, CLASS_STRONG_VERB } from '../data/verb-classes.js';

const TORQUE: Record<string, string> = TORQUE_MAP as Record<string, string>;

/**
 * Capability 2 — replace a weak LEADING verb with one chosen by the object it governs.
 * Leading only: the old global TORQUE_MAP sweep rewrote every occurrence in the document.
 */
export function verbStrengthRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    const verb = leadingVerb(line);
    if (!verb) continue;

    const lower = verb.verb.toLowerCase();
    if (!WEAK_VERBS.has(lower)) continue;

    const afterVerb = verb.offsetInLine + verb.verb.length;

    // "worked on X" / "participated in X": the verb governs no direct object here.
    const next = nextTokenAfter(line, afterVerb);
    if (next && PREPOSITIONS.has(next)) continue;

    const classified = classifyObject(line, afterVerb);
    let replacement: string | null = null;
    let rule = 'verb_strength_class';

    if (classified) {
      replacement = CLASS_STRONG_VERB[classified.objectClass];
    } else if (TORQUE[lower]) {
      replacement = TORQUE[lower];
      rule = 'verb_strength_torque_fallback';
    }

    if (!replacement) continue;
    if (replacement.toLowerCase() === lower) continue;

    // The leading verb of a bullet is always capitalized.
    const after = capitalizeFirst(replacement);
    const targetKey = `${verb.span.start}:${verb.span.end}`;
    const id = makeSuggestionId('verb', targetKey, `${lower}->${after}:${rule}`);

    suggestions.push({
      id,
      type: 'verb',
      target: { span: verb.span },
      before: verb.verb,
      after,
      reason: classified
        ? `"${verb.verb}" understates what you did to the ${classified.keyword}. "${after}" is the stronger verb for that kind of work.`
        : `Replace the low-torque verb "${verb.verb}" with the higher-impact "${after}".`,
      evidence: [
        {
          source: 'resume',
          rule,
          text: verb.verb,
          span: verb.span,
          confidence: 0.85,
        },
      ],
      confidence: 0.85,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
    });
  }

  return suggestions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyVerbStrength.test.ts`
Expected: PASS (8 tests).

If `Used Docker daily.` does not yield `Leveraged`, read `TORQUE_MAP` in `src/lib/career/transmuter.js:25` and align the test to the actual mapped value — do not edit `TORQUE_MAP`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/amplify/rules/verb-strength.ts tests/unit/careerAmplifyVerbStrength.test.ts
git commit -m "feat(career): strengthen leading verbs by the object class they govern"
```

---

### Task 6: Weak-construction tightening (passive → active)

**Files:**
- Create: `src/lib/career/amplify/rules/weak-construction.ts`
- Test: `tests/unit/careerAmplifyConstruction.test.ts`

**Interfaces:**
- Consumes: `AmplifyContext`, `classifyObject`, `capitalizeFirst` (Task 3); `GERUND_PAST`, `STEM_PAST`, `LEADING_PARTICIPLES`, `CLASS_STRONG_VERB` (Task 2).
- Produces: `weakConstructionRule(ctx: AmplifyContext): ResumeSuggestion[]` — at most **one** suggestion per line (first matching pattern wins, so two recipes can never propose overlapping edits to the same words).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/careerAmplifyConstruction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { weakConstructionRule } from '../../src/lib/career/amplify/rules/weak-construction';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return weakConstructionRule({ document, lines: getAccomplishmentLines(document) });
}

describe('weak construction rule', () => {
  it('converts "Responsible for managing X" to "Managed X"', () => {
    const raw = 'Responsible for managing the release process.';
    const [sug] = run(raw);

    expect(sug.type).toBe('tighten');
    expect(sug.before).toBe('Responsible for managing');
    expect(sug.after).toBe('Managed');
    expect(raw.slice(sug.target!.span!.start, sug.target!.span!.end)).toBe(sug.before);
    expect(sug.evidence[0].rule).toBe('construction_responsible_for');
  });

  it('converts "Duties included supporting X" to "Supported X"', () => {
    const [sug] = run('Duties included supporting the sales team.');
    expect(sug.before).toBe('Duties included supporting');
    expect(sug.after).toBe('Supported');
  });

  it('drops the auxiliary from a leading passive', () => {
    const [sug] = run('Was promoted to senior engineer after one year.');
    expect(sug.before).toBe('Was promoted');
    expect(sug.after).toBe('Promoted');
    expect(sug.evidence[0].rule).toBe('construction_leading_passive');
  });

  it('converts "Helped to migrate X" to "Migrated X"', () => {
    const [sug] = run('Helped to migrate the billing database.');
    expect(sug.before).toBe('Helped to migrate');
    expect(sug.after).toBe('Migrated');
  });

  it('converts "Worked on X" using the object class', () => {
    expect(run('Worked on the payment API.')[0].after).toBe('Built');
    expect(run('Worked on the onboarding workflow.')[0].after).toBe('Streamlined');
  });

  it('falls back to "Developed" when "Worked on" has no classifiable object', () => {
    const [sug] = run('Worked on the quarterly paperwork.');
    expect(sug.after).toBe('Developed');
  });

  it('stays silent on constructions it has no safe recipe for', () => {
    expect(run('Responsible for photocopying the archives.')).toEqual([]);
    expect(run('Was mentioned in the company newsletter.')).toEqual([]);
    expect(run('Helped to photocopy the archives.')).toEqual([]);
  });

  it('never rewrites a construction that is not leading', () => {
    expect(run('Built the API and was promoted afterwards.')).toEqual([]);
  });

  it('emits at most one suggestion per line', () => {
    expect(run('Responsible for managing the release process.')).toHaveLength(1);
  });

  it('is deterministic', () => {
    const raw = 'Responsible for managing the release process.';
    expect(run(raw)).toEqual(run(raw));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyConstruction.test.ts`
Expected: FAIL — `Failed to resolve import ".../rules/weak-construction"`.

- [ ] **Step 3: Write the rule**

Create `src/lib/career/amplify/rules/weak-construction.ts`:

```ts
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import {
  classifyObject,
  capitalizeFirst,
  type AccomplishmentLine,
  type AmplifyContext,
} from '../primitives.js';
import {
  GERUND_PAST,
  STEM_PAST,
  LEADING_PARTICIPLES,
  CLASS_STRONG_VERB,
} from '../data/verb-classes.js';

interface ConstructionMatch {
  rule: string;
  /** Offset of the matched text inside line.text. */
  offset: number;
  before: string;
  after: string;
  reason: string;
}

const BULLET = '(?:[\\u2022\\u00B7\\u25AA\\u25E6\\u2013\\u2014*-]\\s+|\\d+[.)]\\s+)?';

const RESPONSIBLE_FOR = new RegExp(`^${BULLET}(responsible for (\\w+ing))\\b`, 'i');
const DUTIES_INCLUDED = new RegExp(`^${BULLET}(duties included (\\w+ing))\\b`, 'i');
const LEADING_PASSIVE = new RegExp(`^${BULLET}((?:was|were) (\\w+))\\b`, 'i');
const HELPED_TO = new RegExp(`^${BULLET}(helped (?:to )?(\\w+))\\b`, 'i');
const WORKED_ON = new RegExp(`^${BULLET}(worked on)\\b`, 'i');

/**
 * Capability 3a — leading passive and prefix constructions.
 * Anchored to the start of the line: a mid-sentence rewrite is exactly the class of
 * damage this engine exists to avoid. First matching recipe wins.
 */
function matchConstruction(line: AccomplishmentLine): ConstructionMatch | null {
  const text = line.text;

  const responsible = RESPONSIBLE_FOR.exec(text);
  if (responsible) {
    const past = GERUND_PAST[responsible[2].toLowerCase()];
    if (!past) return null;
    return {
      rule: 'construction_responsible_for',
      offset: text.indexOf(responsible[1]),
      before: responsible[1],
      after: past,
      reason: `"${responsible[1]}" describes a job description. "${past}" describes what you did.`,
    };
  }

  const duties = DUTIES_INCLUDED.exec(text);
  if (duties) {
    const past = GERUND_PAST[duties[2].toLowerCase()];
    if (!past) return null;
    return {
      rule: 'construction_duties_included',
      offset: text.indexOf(duties[1]),
      before: duties[1],
      after: past,
      reason: `"${duties[1]}" describes a job description. "${past}" describes what you did.`,
    };
  }

  const passive = LEADING_PASSIVE.exec(text);
  if (passive) {
    const participle = passive[2].toLowerCase();
    if (!LEADING_PARTICIPLES.has(participle)) return null;
    const after = capitalizeFirst(participle);
    return {
      rule: 'construction_leading_passive',
      offset: text.indexOf(passive[1]),
      before: passive[1],
      after,
      reason: `Drop the passive auxiliary: "${after}" is more direct than "${passive[1]}".`,
    };
  }

  const helped = HELPED_TO.exec(text);
  if (helped) {
    const past = STEM_PAST[helped[2].toLowerCase()];
    if (!past) return null;
    return {
      rule: 'construction_helped_to',
      offset: text.indexOf(helped[1]),
      before: helped[1],
      after: past,
      reason: `"${helped[1]}" hides your contribution behind someone else's work. "${past}" claims the same work directly.`,
    };
  }

  const worked = WORKED_ON.exec(text);
  if (worked) {
    const offset = text.indexOf(worked[1]);
    const classified = classifyObject(line, offset + worked[1].length);
    const after = classified ? CLASS_STRONG_VERB[classified.objectClass] : 'Developed';
    return {
      rule: 'construction_worked_on',
      offset,
      before: worked[1],
      after,
      reason: `"${worked[1]}" says you were present. "${after}" says what you produced.`,
    };
  }

  return null;
}

export function weakConstructionRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    const match = matchConstruction(line);
    if (!match) continue;

    const span = {
      coordinateSpace: 'raw' as const,
      start: line.span.start + match.offset,
      end: line.span.start + match.offset + match.before.length,
    };
    const targetKey = `${span.start}:${span.end}`;
    const id = makeSuggestionId('tighten', targetKey, `${match.rule}:${match.before}->${match.after}`);

    suggestions.push({
      id,
      type: 'tighten',
      target: { span },
      before: match.before,
      after: match.after,
      reason: match.reason,
      evidence: [
        {
          source: 'resume',
          rule: match.rule,
          text: match.before,
          span,
          confidence: 0.85,
        },
      ],
      confidence: 0.85,
      risk: 'low',
      requiresUserApproval: true,
      status: 'pending',
    });
  }

  return suggestions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyConstruction.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/amplify/rules/weak-construction.ts tests/unit/careerAmplifyConstruction.test.ts
git commit -m "feat(career): convert leading passive and duty-list constructions to active voice"
```

---

### Task 7: Filler and wordiness tightening

**Files:**
- Create: `src/lib/career/amplify/rules/filler.ts`
- Test: `tests/unit/careerAmplifyFiller.test.ts`

**Interfaces:**
- Consumes: `AmplifyContext` (Task 3); `FILLER_PATTERNS` (Task 2).
- Produces: `fillerRule(ctx: AmplifyContext): ResumeSuggestion[]` — one suggestion per match, sorted by raw start offset within each line.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/careerAmplifyFiller.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { fillerRule } from '../../src/lib/career/amplify/rules/filler';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return fillerRule({ document, lines: getAccomplishmentLines(document) });
}

describe('filler rule', () => {
  it('removes a hedge word and the space after it', () => {
    const raw = 'Successfully launched the mobile app.';
    const [sug] = run(raw);

    expect(sug.type).toBe('tighten');
    expect(sug.before).toBe('Successfully ');
    expect(sug.after).toBe('');
    expect(raw.slice(sug.target!.span!.start, sug.target!.span!.end)).toBe(sug.before);
    expect(sug.evidence[0].rule).toBe('filler_successfully');
  });

  it('shortens "in order to" to "to"', () => {
    const [sug] = run('Refactored the parser in order to cut build time.');
    expect(sug.before).toBe('in order to');
    expect(sug.after).toBe('to');
  });

  it('removes vague quantity phrases', () => {
    expect(run('Managed a variety of client accounts.')[0].before).toBe('a variety of ');
    expect(run('Shipped several internal tools.')[0].before).toBe('several ');
  });

  it('emits one suggestion per match, ordered by position', () => {
    const suggestions = run('Successfully shipped various tools in order to help teams.');
    expect(suggestions.map((s) => s.before)).toEqual([
      'Successfully ',
      'various ',
      'in order to',
    ]);
    const starts = suggestions.map((s) => s.target!.span!.start);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('produces non-overlapping spans', () => {
    const suggestions = run('Successfully shipped various tools in order to help teams.');
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i].target!.span!.start).toBeGreaterThanOrEqual(
        suggestions[i - 1].target!.span!.end
      );
    }
  });

  it('stays silent on a clean line', () => {
    expect(run('Reduced build time by 40%.')).toEqual([]);
  });

  it('is deterministic', () => {
    const raw = 'Successfully shipped various tools in order to help teams.';
    expect(run(raw)).toEqual(run(raw));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyFiller.test.ts`
Expected: FAIL — `Failed to resolve import ".../rules/filler"`.

- [ ] **Step 3: Write the rule**

Create `src/lib/career/amplify/rules/filler.ts`:

```ts
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import type { AmplifyContext } from '../primitives.js';
import { FILLER_PATTERNS } from '../data/verb-classes.js';

interface FillerHit {
  rule: string;
  offset: number;
  before: string;
  after: string;
}

/**
 * Capability 3b — hedge and wordiness removal.
 * Patterns are module-level regexes with /g, so lastIndex is reset before every scan.
 */
export function fillerRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const suggestions: ResumeSuggestion[] = [];

  for (const line of ctx.lines) {
    const hits: FillerHit[] = [];
    const claimed: Array<{ start: number; end: number }> = [];

    for (const { rule, pattern, after } of FILLER_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line.text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (match[0].length === 0) break;
        const overlaps = claimed.some((c) => start < c.end && c.start < end);
        if (overlaps) continue;
        claimed.push({ start, end });
        hits.push({ rule, offset: start, before: match[0], after });
      }
    }

    hits.sort((a, b) => a.offset - b.offset);

    for (const hit of hits) {
      const span = {
        coordinateSpace: 'raw' as const,
        start: line.span.start + hit.offset,
        end: line.span.start + hit.offset + hit.before.length,
      };
      const targetKey = `${span.start}:${span.end}`;
      const id = makeSuggestionId('tighten', targetKey, `${hit.rule}:${hit.before}`);

      suggestions.push({
        id,
        type: 'tighten',
        target: { span },
        before: hit.before,
        after: hit.after,
        reason: hit.after
          ? `"${hit.before.trim()}" can be shortened to "${hit.after}" without losing meaning.`
          : `"${hit.before.trim()}" adds words without adding information — cut it.`,
        evidence: [
          {
            source: 'resume',
            rule: hit.rule,
            text: hit.before,
            span,
            confidence: 0.8,
          },
        ],
        confidence: 0.8,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      });
    }
  }

  return suggestions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyFiller.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/amplify/rules/filler.ts tests/unit/careerAmplifyFiller.test.ts
git commit -m "feat(career): cut hedge words and wordiness from accomplishment lines"
```

---

### Task 8: Repetition / variety

**Files:**
- Create: `src/lib/career/amplify/rules/repetition.ts`
- Test: `tests/unit/careerAmplifyRepetition.test.ts`

**Interfaces:**
- Consumes: `AmplifyContext`, `leadingVerb`, `capitalizeFirst` (Task 3); `WEAK_VERBS`, `VARIETY_MAP` (Task 2).
- Produces: `repetitionRule(ctx: AmplifyContext): ResumeSuggestion[]`.

Tally **only** leading verbs that are not in `WEAK_VERBS` — weak ones are already being rewritten by Task 5, and proposing both would put two suggestions on one word.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/careerAmplifyRepetition.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { repetitionRule } from '../../src/lib/career/amplify/rules/repetition';
import { getAccomplishmentLines } from '../../src/lib/career/amplify/primitives';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

function run(raw: string) {
  const document = makeResumeDoc(raw);
  return repetitionRule({ document, lines: getAccomplishmentLines(document) });
}

const THREE_LED = [
  'Led the billing migration.',
  'Led the support rotation.',
  'Led the hiring loop.',
].join('\n');

describe('repetition rule', () => {
  it('suggests variety on the 2nd and later occurrences only', () => {
    const suggestions = run(THREE_LED);

    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((s) => s.before === 'Led')).toBe(true);
    expect(suggestions.map((s) => s.after)).toEqual(['Directed', 'Headed']);
    expect(suggestions[0].target!.span!.start).toBe(THREE_LED.indexOf('\n') + 1);
    expect(suggestions[0].evidence[0].rule).toBe('repetition');
    expect(suggestions[0].type).toBe('verb');
  });

  it('leaves a verb used twice alone', () => {
    expect(run('Led the billing migration.\nLed the support rotation.')).toEqual([]);
  });

  it('ignores weak leading verbs, which the strengthening rule owns', () => {
    const raw = [
      'Helped the support team.',
      'Helped the billing team.',
      'Helped the platform team.',
    ].join('\n');
    expect(run(raw)).toEqual([]);
  });

  it('stays silent when no variety alternatives are curated', () => {
    const raw = [
      'Negotiated the vendor contract.',
      'Negotiated the office lease.',
      'Negotiated the support terms.',
    ].join('\n');
    expect(run(raw)).toEqual([]);
  });

  it('is deterministic', () => {
    expect(run(THREE_LED)).toEqual(run(THREE_LED));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyRepetition.test.ts`
Expected: FAIL — `Failed to resolve import ".../rules/repetition"`.

- [ ] **Step 3: Write the rule**

Create `src/lib/career/amplify/rules/repetition.ts`:

```ts
import { makeSuggestionId } from '../../parser/identity-utils.js';
import type { ResumeSuggestion } from '../../analysis/types.js';
import { leadingVerb, type AmplifyContext, type VerbMatch } from '../primitives.js';
import { WEAK_VERBS, VARIETY_MAP } from '../data/verb-classes.js';

const REPETITION_THRESHOLD = 3;

/**
 * Capability 4 — an over-used leading verb flattens a résumé.
 * The first occurrence is never touched; occurrences 2..n each get a distinct alternative.
 */
export function repetitionRule(ctx: AmplifyContext): ResumeSuggestion[] {
  const byVerb = new Map<string, VerbMatch[]>();

  for (const line of ctx.lines) {
    const verb = leadingVerb(line);
    if (!verb) continue;
    const lower = verb.verb.toLowerCase();
    if (WEAK_VERBS.has(lower)) continue;

    const bucket = byVerb.get(lower);
    if (bucket) bucket.push(verb);
    else byVerb.set(lower, [verb]);
  }

  const suggestions: ResumeSuggestion[] = [];

  // Map iteration order is first-appearance order — deterministic.
  for (const [lower, occurrences] of byVerb) {
    if (occurrences.length < REPETITION_THRESHOLD) continue;

    const alternatives = VARIETY_MAP[lower];
    if (!alternatives || alternatives.length === 0) continue;

    for (let i = 1; i < occurrences.length; i++) {
      const occurrence = occurrences[i];
      const after = alternatives[(i - 1) % alternatives.length];
      const targetKey = `${occurrence.span.start}:${occurrence.span.end}`;
      const id = makeSuggestionId('verb', targetKey, `repetition:${lower}->${after}`);

      suggestions.push({
        id,
        type: 'verb',
        target: { span: occurrence.span },
        before: occurrence.verb,
        after,
        reason: `"${occurrence.verb}" leads ${occurrences.length} bullets. Vary this one to "${after}" so each accomplishment reads distinctly.`,
        evidence: [
          {
            source: 'resume',
            rule: 'repetition',
            text: occurrence.verb,
            span: occurrence.span,
            confidence: 0.7,
          },
        ],
        confidence: 0.7,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      });
    }
  }

  return suggestions;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyRepetition.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/amplify/rules/repetition.ts tests/unit/careerAmplifyRepetition.test.ts
git commit -m "feat(career): flag over-used leading verbs and offer varied equivalents"
```

---

### Task 9: Registry + `build-suggestions` integration

This is where the old global verb sweep dies.

**Files:**
- Create: `src/lib/career/amplify/registry.ts`
- Modify: `src/lib/career/suggestions/build-suggestions.ts:1-2`, `:25-75`
- Modify: `tests/unit/careerSuggestions.test.ts:16-33` (fixture) and `:56-100` (the one test that assumed the global loop)
- Test: `tests/unit/careerAmplifyRegistry.test.ts`

**Interfaces:**
- Consumes: all five rule functions (Tasks 4-8) and `getAccomplishmentLines` (Task 3).
- Produces: `buildAmplifications(document: ResumeDocument): ResumeSuggestion[]`, consumed by `build-suggestions.ts` and Task 10's UI work.

- [ ] **Step 1: Write the failing registry test**

Create `tests/unit/careerAmplifyRegistry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildAmplifications } from '../../src/lib/career/amplify/registry';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/verb-classes';
import { makeResumeDoc } from './fixtures/career-amplify-doc';

const RESUME = [
  'Responsible for managing the release process.',
  'Helped the support team resolve escalations.',
  'Successfully launched the mobile app.',
  'Led the billing migration.',
  'Led the support rotation.',
  'Led the hiring loop.',
].join('\n');

describe('amplification registry', () => {
  it('runs every rule and tags each suggestion with its rule', () => {
    const suggestions = buildAmplifications(makeResumeDoc(RESUME));
    const rules = new Set(suggestions.map((s) => s.evidence[0]?.rule));

    expect(rules.has('quantification')).toBe(true);
    expect(rules.has('verb_strength_class')).toBe(true);
    expect(rules.has('construction_responsible_for')).toBe(true);
    expect(rules.has('filler_successfully')).toBe(true);
    expect(rules.has('repetition')).toBe(true);
  });

  it('anchors every suggestion to raw text that still matches', () => {
    const doc = makeResumeDoc(RESUME);
    for (const sug of buildAmplifications(doc)) {
      expect(sug.target?.span?.coordinateSpace).toBe('raw');
      const { start, end } = sug.target!.span!;
      expect(doc.rawText.slice(start, end)).toBe(sug.before);
      expect(sug.requiresUserApproval).toBe(true);
      expect(sug.status).toBe('pending');
    }
  });

  it('produces byte-identical output across runs', () => {
    const first = buildAmplifications(makeResumeDoc(RESUME));
    const second = buildAmplifications(makeResumeDoc(RESUME));
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('adds no claim the candidate did not make', () => {
    const doc = makeResumeDoc(RESUME);
    const accepted = buildAmplifications(doc)
      .filter((s) => s.requiresInput !== true)
      .map((s) => ({ ...s, status: 'accepted' as const }));

    const result = applyAcceptedSuggestions(doc, accepted);
    expect(result.text).not.toContain(INPUT_SENTINEL);
    expect(result.text).not.toMatch(/\d/);
  });

  it('keeps an unfilled quantification prompt out of the résumé', () => {
    const doc = makeResumeDoc(RESUME);
    const quantify = buildAmplifications(doc)
      .filter((s) => s.requiresInput === true)
      .map((s) => ({ ...s, status: 'accepted' as const }));

    expect(quantify.length).toBeGreaterThan(0);
    const result = applyAcceptedSuggestions(doc, quantify);
    expect(result.applied).toEqual([]);
    expect(result.skipped.every((s) => s.reason === 'unfilled_input')).toBe(true);
  });

  it('documents the known overlap boundary: a whole-line quantify conflicts with an inline tighten', () => {
    // Leading measurable verb (→ whole-line quantify) plus an inline filler (→ tighten).
    const doc = makeResumeDoc('Launched the mobile app successfully across the org.');
    const accepted = buildAmplifications(doc).map((s) => ({
      ...s,
      status: 'accepted' as const,
      after: (s.after || '').split(INPUT_SENTINEL).join('12'),
    }));

    expect(accepted.length).toBe(2); // one quantify (whole line) + one filler (inline)
    const result = applyAcceptedSuggestions(doc, accepted);
    expect(result.applied).toEqual([]);
    expect(result.skipped.every((s) => s.reason === 'overlap')).toBe(true);
  });

  it('returns nothing for a document with no amplifiable sections', () => {
    expect(buildAmplifications(makeResumeDoc('Python, TypeScript, SQL', 'skills'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerAmplifyRegistry.test.ts`
Expected: FAIL — `Failed to resolve import ".../amplify/registry"`.

- [ ] **Step 3: Write the registry**

Create `src/lib/career/amplify/registry.ts`:

```ts
import type { ResumeDocument } from '../parser/types.js';
import type { ResumeSuggestion } from '../analysis/types.js';
import { getAccomplishmentLines, type AmplifyContext } from './primitives.js';
import { quantificationRule } from './rules/quantification.js';
import { verbStrengthRule } from './rules/verb-strength.js';
import { weakConstructionRule } from './rules/weak-construction.js';
import { fillerRule } from './rules/filler.js';
import { repetitionRule } from './rules/repetition.js';

/** Fixed order — the identity contract depends on it. Do not sort the result. */
const RULES: ReadonlyArray<(ctx: AmplifyContext) => ResumeSuggestion[]> = [
  quantificationRule,
  verbStrengthRule,
  weakConstructionRule,
  fillerRule,
  repetitionRule,
];

/**
 * Amplify only, never add claims: every suggestion reshapes the candidate's own words,
 * and any suggestion needing a number asks them for it.
 */
export function buildAmplifications(document: ResumeDocument): ResumeSuggestion[] {
  const ctx: AmplifyContext = {
    document,
    lines: getAccomplishmentLines(document),
  };

  const suggestions: ResumeSuggestion[] = [];
  for (const rule of RULES) {
    suggestions.push(...rule(ctx));
  }
  return suggestions;
}
```

- [ ] **Step 4: Run the registry test to verify it passes**

Run: `npx vitest run tests/unit/careerAmplifyRegistry.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Wire the registry into `build-suggestions.ts` and delete the global verb loop**

In `src/lib/career/suggestions/build-suggestions.ts`, replace the first import line:

```ts
import { buildAmplifications } from '../amplify/registry.js';
```

(`TORQUE_MAP` is no longer imported here — it is now reached only through `amplify/rules/verb-strength.ts`.)

Then replace the whole `// 1. Verb Swaps` block (currently lines 25-75, from `if (rawText && TORQUE_MAP) {` through its closing brace) with:

```ts
  // 1. Amplification (quantification, verb strength, tightening, repetition)
  suggestions.push(...buildAmplifications(document));
```

Leave sections 2-4 (acronym, keyword, structure) and `escapeRegExp` exactly as they are — the acronym loop still uses `escapeRegExp`.

- [ ] **Step 6: Update the one existing test that assumed the global sweep**

In `tests/unit/careerSuggestions.test.ts`, replace the `dummyDoc` declaration (currently lines 16-33) with a two-line fixture so a weak leading verb exists:

```ts
  const RAW_TEXT =
    'Led a team and built software systems with AWS.\n' +
    'Helped the support team resolve escalations.';

  const dummyDoc: ResumeDocument = {
    schemaVersion: 1,
    source: { type: 'txt', fileName: 'test.txt' },
    rawText: RAW_TEXT,
    normalizedText: RAW_TEXT.toLowerCase(),
    offsetMap: [],
    sections: [
      {
        id: 'sec-1',
        kind: 'experience',
        heading: 'Experience',
        text: RAW_TEXT,
        span: { coordinateSpace: 'raw', start: 0, end: RAW_TEXT.length },
        confidence: 0.9,
        evidence: [],
      },
    ],
    contact: { links: [] },
    diagnostics: [],
    confidence: 0.9,
  };
```

Then, in the test `'generates verb, acronym, keyword, and structure suggestions'`, replace the verb assertions (currently lines 82-87) with:

```ts
      const verbSugg = suggestions.find((s) => s.type === 'verb');
      expect(verbSugg).toBeDefined();
      expect(verbSugg?.before).toBe('Helped');
      expect(verbSugg?.after).toBe('Led');
      expect(verbSugg?.risk).toBe('low');
      expect(verbSugg?.requiresUserApproval).toBe(true);
      expect(verbSugg?.status).toBe('pending');
      expect(verbSugg?.id).toMatch(/^suggestion:verb:/);

      // The old engine swapped every occurrence anywhere in the document;
      // amplification only ever rewrites the leading verb of an accomplishment line.
      expect(suggestions.filter((s) => s.type === 'verb')).toHaveLength(1);
      expect(suggestions.some((s) => s.before === 'built')).toBe(false);

      const quantifySugg = suggestions.find((s) => s.type === 'quantify');
      expect(quantifySugg?.requiresInput).toBe(true);
```

- [ ] **Step 7: Run the full career test surface**

Run: `npx vitest run tests/unit/career`
Expected: PASS — every `careerAmplify*`, `careerSuggestions`, `careerAnalysisBoundary`, `careerAdapters`, `careerTypes`, `careerNormalization`, `careerKeywordMatcher`, `careerSectionDetection`, `careerAcronyms`, `careerTransmuter` file green. If `careerAnalysisBoundary` or `careerPageWorkflow` fails, fix the test's expectation only where it encoded the removed global sweep; do not restore the loop.

- [ ] **Step 8: Commit**

```bash
git add src/lib/career/amplify/registry.ts src/lib/career/suggestions/build-suggestions.ts tests/unit/careerAmplifyRegistry.test.ts tests/unit/careerSuggestions.test.ts
git commit -m "feat(career): replace global verb sweep with the amplification registry"
```

---

### Task 10: Review panel input slots

**Files:**
- Modify: `src/pages/Career/SuggestionReviewPanel.tsx`
- Modify: `src/pages/Career/CareerPage.css` (append)
- Test: `tests/unit/careerPageWorkflow.test.tsx` (append a `describe` block)

**Interfaces:**
- Consumes: `ResumeSuggestion.requiresInput` / `inputSlots` (Task 1), `INPUT_SENTINEL` from `../../lib/career/amplify/data/input-sentinel` (Task 1).
- Produces: no new exports. `onEdit(id, filledAfter)` is called with the sentinel-free text; `CareerPage.handleEditSuggestion` (`src/pages/Career/CareerPage.tsx:204`) already sets `status: 'edited'` and stores `after`, so no page change is needed.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/careerPageWorkflow.test.tsx`, inside the existing top-level `describe`, after the `describe('SuggestionReviewPanel', ...)` block:

```tsx
  describe('SuggestionReviewPanel input slots', () => {
    const SENTINEL = '␟';

    function quantifySuggestion(): ResumeSuggestion {
      return {
        id: 'sugg-quantify',
        type: 'quantify',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 26 } },
        before: 'Led the billing migration.',
        after: `Led the billing migration., managing a team of ${SENTINEL}`,
        reason: 'add a metric',
        evidence: [],
        confidence: 0.75,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        requiresInput: true,
        inputSlots: [{ id: 'slot-0', placeholder: 'headcount', hint: 'how many people, e.g. 6' }],
      };
    }

    it('renders one input per slot and blocks Accept until every slot is filled', () => {
      const onAccept = vi.fn();
      const onEdit = vi.fn();

      render(
        <SuggestionReviewPanel
          suggestions={[quantifySuggestion()]}
          onAccept={onAccept}
          onReject={vi.fn()}
          onEdit={onEdit}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      const slotInput = screen.getByPlaceholderText('how many people, e.g. 6');
      const acceptButton = screen.getByRole('button', { name: 'Accept' });
      expect(acceptButton).toBeDisabled();

      fireEvent.change(slotInput, { target: { value: '6' } });
      expect(acceptButton).not.toBeDisabled();

      fireEvent.click(acceptButton);
      expect(onEdit).toHaveBeenCalledWith(
        'sugg-quantify',
        'Led the billing migration., managing a team of 6'
      );
      expect(onAccept).toHaveBeenCalledWith('sugg-quantify');
    });

    it('never shows the raw sentinel to the user', () => {
      render(
        <SuggestionReviewPanel
          suggestions={[quantifySuggestion()]}
          onAccept={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      expect(document.body.textContent).not.toContain(SENTINEL);
    });

    it('leaves suggestions without slots rendering exactly as before', () => {
      const plain: ResumeSuggestion = {
        id: 'sugg-verb',
        type: 'verb',
        target: { span: { coordinateSpace: 'raw', start: 0, end: 6 } },
        before: 'Helped',
        after: 'Led',
        reason: 'stronger verb',
        evidence: [],
        confidence: 0.85,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
      };

      render(
        <SuggestionReviewPanel
          suggestions={[plain]}
          onAccept={vi.fn()}
          onReject={vi.fn()}
          onEdit={vi.fn()}
          onAcceptAllLowRisk={vi.fn()}
        />
      );

      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled();
    });
  });
```

Confirm the file's existing imports include `vi`, `render`, `screen`, and `fireEvent`; add whichever are missing to the existing import statements at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/careerPageWorkflow.test.tsx -t "input slots"`
Expected: FAIL — no slot input is rendered, so `getByPlaceholderText` throws.

- [ ] **Step 3: Implement slot rendering**

In `src/pages/Career/SuggestionReviewPanel.tsx`, add the import and slot state below the existing imports:

```tsx
import { INPUT_SENTINEL } from '../../lib/career/amplify/data/input-sentinel';
```

Inside the component, next to the existing `editingId` / `editText` state:

```tsx
  const [slotValues, setSlotValues] = useState<Record<string, string>>({});

  const setSlotValue = (slotId: string, value: string) => {
    setSlotValues((prev) => ({ ...prev, [slotId]: value }));
  };

  /** Left-to-right substitution of each sentinel by its slot's current value. */
  const fillSlots = (suggestion: ResumeSuggestion): string => {
    const segments = (suggestion.after || '').split(INPUT_SENTINEL);
    return segments
      .map((segment, index) => {
        if (index === segments.length - 1) return segment;
        const slot = suggestion.inputSlots?.[index];
        return segment + (slot ? slotValues[slot.id] || '' : '');
      })
      .join('');
  };

  const slotsFilled = (suggestion: ResumeSuggestion): boolean =>
    (suggestion.inputSlots || []).every((slot) => (slotValues[slot.id] || '').trim().length > 0);

  const handleAcceptSuggestion = (suggestion: ResumeSuggestion) => {
    if (suggestion.requiresInput && onEdit) {
      onEdit(suggestion.id, fillSlots(suggestion));
    }
    onAccept(suggestion.id);
  };
```

Inside the `suggestions.map((sug) => {` body, add above the `return (`:

```tsx
            const needsInput = sug.requiresInput === true && (sug.inputSlots || []).length > 0;
            const acceptBlocked = needsInput && !slotsFilled(sug);
```

Replace the `preview-after` block's non-editing branch (currently line 112) with:

```tsx
                      <span className="preview-text preview-text--after">
                        {needsInput ? fillSlots(sug) || '(fill in the blanks below)' : sug.after || '(None)'}
                      </span>
```

Immediately after the closing `</div>` of `.suggestion-preview` and before `<p className="suggestion-reason">`, insert:

```tsx
                {needsInput && (
                  <div className="suggestion-slots">
                    {(sug.inputSlots || []).map((slot) => (
                      <label key={slot.id} className="suggestion-slot">
                        <span className="suggestion-slot-label">{slot.placeholder}</span>
                        <input
                          type="text"
                          className="suggestion-slot-input"
                          placeholder={slot.hint}
                          value={slotValues[slot.id] || ''}
                          onChange={(e) => setSlotValue(slot.id, e.target.value)}
                        />
                      </label>
                    ))}
                    <p className="suggestion-slot-note">
                      These numbers are yours — nothing is added to your résumé until you fill them in.
                    </p>
                  </div>
                )}
```

Finally, rewire the Accept button:

```tsx
                  <button
                    className={`btn btn-control btn-accept ${isAccepted ? 'active' : ''}`}
                    onClick={() => handleAcceptSuggestion(sug)}
                    disabled={isAccepted || acceptBlocked}
                  >
                    Accept
                  </button>
```

And exclude input-requiring suggestions from the bulk action, since the machine must not accept a prompt on the candidate's behalf — replace the `lowRiskPendingCount` definition with:

```tsx
  const lowRiskPendingCount = suggestions.filter(
    (s) => s.risk === 'low' && s.status !== 'accepted' && s.requiresInput !== true
  ).length;
```

and in `CareerPage.tsx`, replace the body of `handleAcceptAllLowRisk` (line 210) with:

```tsx
  const handleAcceptAllLowRisk = () => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.risk === 'low' && s.requiresInput !== true ? { ...s, status: 'accepted' } : s
      )
    );
  };
```

- [ ] **Step 4: Add the styles**

Append to `src/pages/Career/CareerPage.css`:

```css
.suggestion-slots {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0.5rem 0;
}

.suggestion-slot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.suggestion-slot-label {
  min-width: 10rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.75;
}

.suggestion-slot-input {
  flex: 1;
  padding: 0.35rem 0.5rem;
  font: inherit;
}

.suggestion-slot-note {
  margin: 0;
  font-size: 0.75rem;
  opacity: 0.7;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/careerPageWorkflow.test.tsx`
Expected: PASS — the three new tests plus the pre-existing panel test.

- [ ] **Step 6: Run the whole career surface and the type check**

Run: `npx vitest run tests/unit/career`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i career`
Expected: no output. (Errors outside `career`/`VideoForge` are pre-existing and out of scope — see the repo's known-typecheck note.)

Run: `npm run scd64:intellisense`
Expected: no new SCD64 fossils attributed to `src/lib/career/**`.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Career/SuggestionReviewPanel.tsx src/pages/Career/CareerPage.tsx src/pages/Career/CareerPage.css tests/unit/careerPageWorkflow.test.tsx
git commit -m "feat(career): render quantification input slots and gate Accept until filled"
```

---

## Acceptance Gates (verify before declaring the feature done)

Run each command; paste the output rather than asserting from memory.

- [ ] `npx vitest run tests/unit/career` — all green.
- [ ] **No suggestion adds a factual claim, skill, or number absent from the input** — covered by `careerAmplifyRegistry.test.ts` → `'adds no claim the candidate did not make'`.
- [ ] **The machine never fills a quantification slot; an unfilled slot can never reach the résumé** — `careerAmplifyQuantification.test.ts` → `'never fills a slot itself'` and `careerSuggestions.test.ts` → `'never writes a suggestion whose input slot is still unfilled'`.
- [ ] **Verb strengthening only rewrites the leading verb** — `careerAmplifyVerbStrength.test.ts` → `'never touches a weak verb that is not leading'` and the `toHaveLength(1)` assertion in `careerSuggestions.test.ts`.
- [ ] **Every suggestion carries a raw span and a rule-tagged evidence entry** — `careerAmplifyRegistry.test.ts` → `'anchors every suggestion to raw text that still matches'`.
- [ ] **Repeated analysis is byte-identical** — `careerAmplifyRegistry.test.ts` → `'produces byte-identical output across runs'`.
- [ ] **All suggestions remain `requiresUserApproval: true`** — same test.
- [ ] **`career-ats` packet upheld** — no OCR path touched, no new skills invented, ids content-derived (`makeSuggestionId` only).
- [ ] Manual smoke on the real page: `npm run dev`, open `/career` (dev server on :5173 — `npm run preview` does not serve this route reliably), paste a résumé with `Responsible for managing the release process.` and three `Led ...` bullets, and confirm the panel shows quantification inputs with Accept disabled until filled.
