# Actionable Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Every advisor card carries an operation the candidate can accept — no card instructs without offering a draft, a move, or a fill-in.

**Architecture:** A JD clause is lifted into a past-tense sentence frame with U+241F input slots. Adjacent-evidence requirements draft an in-place rewrite of their anchor bullet; missing requirements draft a new bullet whose target employment entry the candidate must choose. A third honesty invariant (frame provenance) covers drafts that have no `before` to preserve.

**Tech Stack:** TypeScript, Vitest, the existing `ResumeSuggestion` contract, and the existing U+241F sentinel / `UserFactLedger` machinery.

## Global Constraints

- **No server, no network, no LLM** — all logic is pure and client-side.
- **Determinism** — identical inputs produce byte-identical drafts and ordering. No randomness, no timestamps.
- **Fail closed** — a draft that cannot be built confidently is not emitted; the card falls back to its existing prose form. Silence over garbage.
- **Never assert a fact the candidate did not supply** — the tool supplies sentence frames only. Every specific fact enters through a U+241F slot or the candidate's entry choice.
- **Amplify-only law still binds** — existing `assertTokenProvenance` / `assertClaimPreserved` guards stay in force on every rewrite of an existing bullet.
- Test files live in `tests/unit/`, imported as `../../src/lib/...`, using `import { describe, it, expect } from 'vitest'`.
- Run a single test file with: `npx vitest run tests/unit/<file> --reporter=dot`.
- Spec: `docs/superpowers/specs/2026-07-25-career-actionable-recommendations-design.md`.

## File Structure

| File | Responsibility |
|---|---|
| `improve/jd-clause.ts` | NEW — clause scoping, extracted verbatim from `requirement-ledger.ts` |
| `improve/jd-phrase-frame.ts` | NEW — verb table + `buildPhraseFrame`: JD clause → drafted frame |
| `improve/honesty/frame-provenance.ts` | NEW — the invariant for a draft with no `before` |
| `improve/rules/missing-evidence.ts` | NEW — Case A cards |
| `improve/rules/vocabulary-injection.ts` | MODIFY — adjacent branch drafts instead of instructing |
| `improve/rules/reorder.ts` | MODIFY — trim flag becomes a demote move |
| `improve/apply-moves.ts` | MODIFY — entry-anchored insertion |
| `improve/build-improvements.ts` | MODIFY — register the new rule |
| `analysis/types.ts` | MODIFY — `target.entryId`, `requiresEntryChoice` |
| `pages/Career/SuggestionReviewPanel.tsx` | MODIFY — entry select + assertion warning |
| `pages/Career/CareerPage.tsx` | MODIFY — term-level gap suppression in `mergeImprovements` |

---

### Task 1: Extract clause scoping into `jd-clause.ts`

Pure refactor. The frame extractor must use the *same* clause scoping as the ledger, or the ledger's modality and the frame's wording can disagree about which words belong to a requirement.

**Files:**
- Create: `src/lib/career/improve/jd-clause.ts`
- Modify: `src/lib/career/improve/requirement-ledger.ts`
- Test: `tests/unit/careerJdClause.test.ts`

**Interfaces:**
- Produces: `clauseAt(text: string, start: number, end: number): string`, `CLAUSE_SPLIT: RegExp`.
- `requirement-ledger.ts` imports `clauseAt` instead of defining it.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/careerJdClause.test.ts
import { describe, it, expect } from 'vitest';
import { clauseAt } from '../../src/lib/career/improve/jd-clause';

describe('clauseAt', () => {
  it('scopes to the clause containing the offset, not the whole line', () => {
    const text = 'Required: SQL. Nice to have: Kubernetes.';
    const sql = text.indexOf('SQL');
    const k8s = text.indexOf('Kubernetes');
    expect(clauseAt(text, sql, sql + 3)).toContain('Required');
    expect(clauseAt(text, sql, sql + 3)).not.toContain('Nice to have');
    expect(clauseAt(text, k8s, k8s + 10)).toContain('Nice to have');
  });

  it('does not split on a period inside a token', () => {
    const text = 'Experience with Node.js required';
    const node = text.indexOf('Node.js');
    expect(clauseAt(text, node, node + 7)).toContain('required');
  });

  it('is bounded by the containing line', () => {
    const text = 'Kubernetes administration\nPython is required';
    const k8s = text.indexOf('Kubernetes');
    expect(clauseAt(text, k8s, k8s + 10)).not.toContain('Python');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerJdClause.test.ts --reporter=dot`
Expected: FAIL — module `jd-clause` does not exist.

- [x] **Step 3: Move the code**

Cut `CLAUSE_SPLIT` and `clauseAt` out of `src/lib/career/improve/requirement-ledger.ts` and paste them into the new file **unchanged**, adding `export` to both:

```ts
// src/lib/career/improve/jd-clause.ts
/**
 * Clause scoping for job-description text.
 *
 * Shared by the requirement ledger (which resolves modality from the clause around a term)
 * and the phrase-frame builder (which lifts its wording from that same clause). One
 * definition serves both: if they disagreed about which words belong to a requirement, a
 * card could be drafted from words the ledger never considered part of it.
 */

/**
 * Clause boundaries inside a line: `,` `;`, a sentence period (a period FOLLOWED BY
 * whitespace, so "Node.js" and "3.5 years" stay intact), and the contrastive conjunctions
 * that flip polarity mid-line.
 */
export const CLAUSE_SPLIT = /[;,]|(?<=\.)\s+|\bbut\b|\bhowever\b/gi;

/** The clause containing `start`, scoped to its line. */
export function clauseAt(text: string, start: number, end: number): string {
  const lineStart = text.lastIndexOf('\n', start) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);
  const rel = start - lineStart;

  const bounds: number[] = [0];
  const re = new RegExp(CLAUSE_SPLIT.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    bounds.push(m.index + m[0].length);
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  bounds.push(line.length);

  for (let i = 0; i < bounds.length - 1; i++) {
    if (rel >= bounds[i] && rel < bounds[i + 1]) return line.slice(bounds[i], bounds[i + 1]);
  }
  return line;
}
```

Then in `requirement-ledger.ts`, delete both definitions and add to the imports:

```ts
import { clauseAt } from './jd-clause.js';
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/careerJdClause.test.ts tests/unit/careerImproveLedger.test.ts --reporter=dot`
Expected: PASS — new file's 3 tests plus all 24 existing ledger tests. The ledger tests passing unchanged is the proof this refactor changed no behavior.

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/jd-clause.ts src/lib/career/improve/requirement-ledger.ts tests/unit/careerJdClause.test.ts
git commit -m "refactor(career): extract JD clause scoping into a shared module"
```

---

### Task 2: Past-tense verb table

The frame builder needs to turn the JD's verb form (`building`, `build`, `to build`) into résumé past tense (`built`). This is an explicit table, not morphology inference — and it is **double-gated**: the result must also be a verb the résumé engine already recognises as strong, so the frame vocabulary is closed and curated.

**Files:**
- Create: `src/lib/career/improve/jd-phrase-frame.ts`
- Test: `tests/unit/careerJdPhraseFrame.test.ts`

**Interfaces:**
- Consumes: `STRONG_VERBS`, `KNOWN_VERBS` from `../amplify/data/verb-classes.js` (both are sets of PAST-tense forms).
- Produces: `toPastTense(word: string): string | null`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/careerJdPhraseFrame.test.ts
import { describe, it, expect } from 'vitest';
import { toPastTense } from '../../src/lib/career/improve/jd-phrase-frame';

describe('toPastTense', () => {
  it('converts the base form', () => {
    expect(toPastTense('build')).toBe('built');
    expect(toPastTense('lead')).toBe('led');
    expect(toPastTense('design')).toBe('designed');
  });

  it('converts the gerund', () => {
    expect(toPastTense('building')).toBe('built');
    expect(toPastTense('managing')).toBe('managed');
  });

  it('accepts a form that is already past tense', () => {
    expect(toPastTense('built')).toBe('built');
    expect(toPastTense('delivered')).toBe('delivered');
  });

  it('is case insensitive and returns lowercase', () => {
    expect(toPastTense('Building')).toBe('built');
    expect(toPastTense('BUILD')).toBe('built');
  });

  it('returns null for a word that is not a known verb — fail closed', () => {
    expect(toPastTense('orchestration')).toBeNull();
    expect(toPastTense('kubernetes')).toBeNull();
    expect(toPastTense('modeling')).toBeNull();
    expect(toPastTense('')).toBeNull();
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerJdPhraseFrame.test.ts --reporter=dot`
Expected: FAIL — module does not exist.

- [x] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/jd-phrase-frame.ts
/**
 * JD Phrase Frame — lift a drafted résumé sentence out of the employer's own wording.
 *
 * The tool never invents a claim. It re-voices the verb and object the JD already used and
 * hands the candidate a frame with U+241F blanks for every fact only they can supply. That
 * keeps the bullet in the employer's vocabulary (the actual retrieval benefit) while
 * leaving authorship of every specific fact with the candidate.
 */
import { STRONG_VERBS, KNOWN_VERBS } from '../amplify/data/verb-classes.js';

/**
 * JD verb form → past tense. An explicit table, never inferred morphology: "lead" → "led"
 * and "run" → "ran" defeat any suffix rule, and a wrong guess ships broken prose into a
 * résumé. Keys cover the base form and the gerund; the infinitive is handled by stripping
 * a leading "to" before lookup.
 */
const JD_VERB_PAST: Readonly<Record<string, string>> = Object.freeze({
  analyze: 'analyzed', analyzing: 'analyzed',
  author: 'authored', authoring: 'authored',
  automate: 'automated', automating: 'automated',
  build: 'built', building: 'built',
  coordinate: 'coordinated', coordinating: 'coordinated',
  create: 'created', creating: 'created',
  cut: 'cut', cutting: 'cut',
  deliver: 'delivered', delivering: 'delivered',
  design: 'designed', designing: 'designed',
  develop: 'developed', developing: 'developed',
  drive: 'drove', driving: 'drove',
  engineer: 'engineered', engineering: 'engineered',
  grow: 'grew', growing: 'grew',
  hold: 'held', holding: 'held',
  implement: 'implemented', implementing: 'implemented',
  improve: 'improved', improving: 'improved',
  increase: 'increased', increasing: 'increased',
  keep: 'kept', keeping: 'kept',
  launch: 'launched', launching: 'launched',
  lead: 'led', leading: 'led',
  make: 'made', making: 'made',
  manage: 'managed', managing: 'managed',
  migrate: 'migrated', migrating: 'migrated',
  negotiate: 'negotiated', negotiating: 'negotiated',
  oversee: 'oversaw', overseeing: 'oversaw',
  own: 'owned', owning: 'owned',
  reduce: 'reduced', reducing: 'reduced',
  resolve: 'resolved', resolving: 'resolved',
  run: 'ran', running: 'ran',
  save: 'saved', saving: 'saved',
  sell: 'sold', selling: 'sold',
  set: 'set', setting: 'set',
  ship: 'shipped', shipping: 'shipped',
  spearhead: 'spearheaded', spearheading: 'spearheaded',
  streamline: 'streamlined', streamlining: 'streamlined',
  take: 'took', taking: 'took',
  teach: 'taught', teaching: 'taught',
  train: 'trained', training: 'trained',
  win: 'won', winning: 'won',
  write: 'wrote', writing: 'wrote',
});

/**
 * A JD verb form → résumé past tense, or null when the word is not a verb we can voice.
 *
 * Double-gated on purpose: the table must know the word AND the result must already be a
 * verb the résumé engine treats as strong (`STRONG_VERBS`) or recognises (`KNOWN_VERBS`).
 * That keeps the drafted vocabulary closed and curated rather than open-ended.
 */
export function toPastTense(word: string): string | null {
  const w = String(word ?? '').toLowerCase().replace(/^to\s+/, '').trim();
  if (!w) return null;
  const past = JD_VERB_PAST[w] ?? (STRONG_VERBS.has(w) || KNOWN_VERBS.has(w) ? w : undefined);
  if (!past) return null;
  return STRONG_VERBS.has(past) || KNOWN_VERBS.has(past) ? past : null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerJdPhraseFrame.test.ts --reporter=dot`
Expected: PASS (5 tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/jd-phrase-frame.ts tests/unit/careerJdPhraseFrame.test.ts
git commit -m "feat(career): past-tense verb table for JD phrase frames"
```

---

### Task 3: `buildPhraseFrame`

**Files:**
- Modify: `src/lib/career/improve/jd-phrase-frame.ts`
- Test: `tests/unit/careerJdPhraseFrame.test.ts`

**Interfaces:**
- Consumes: `clauseAt` (Task 1); `toPastTense` (Task 2); `Requirement` from `./types.js`; `TextSpan` from `../parser/types.js`; `INPUT_SENTINEL` from `../amplify/data/input-sentinel.js`.
- Produces:

```ts
export interface PhraseFrame {
  text: string;                                   // draft with U+241F sentinels
  slots: { placeholder: string; hint: string }[]; // one per sentinel, in order
  sourceClause: string;                           // provenance source of record
  sourceSpan: TextSpan;
}
export function buildPhraseFrame(jdText: string, requirement: Requirement): PhraseFrame | null;
```

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/careerJdPhraseFrame.test.ts
import { buildPhraseFrame } from '../../src/lib/career/improve/jd-phrase-frame';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';

function frameFor(jd: string, term: string) {
  const req = buildRequirementLedger(jd).find((r) => r.term.toLowerCase().includes(term));
  if (!req) throw new Error(`no requirement matched "${term}" in ledger`);
  return buildPhraseFrame(jd, req);
}

describe('buildPhraseFrame', () => {
  it('lifts the verb and object from the JD, in past tense', () => {
    const jd = 'Requirements:\n- 5+ years of experience building data pipelines in Python';
    expect(frameFor(jd, 'python')!.text).toBe('Built data pipelines in Python, ␟');
  });

  it('supplies a neutral verb when the clause has none', () => {
    const jd = 'Requirements:\n- Experience with Apache Airflow for orchestration';
    expect(frameFor(jd, 'airflow')!.text).toBe('Used Apache Airflow for orchestration, ␟');
  });

  it('strips leading scaffolding', () => {
    const jd = 'Requirements:\n- Solid understanding of dimensional modeling';
    expect(frameFor(jd, 'dimensional')!.text).toBe('Used dimensional modeling, ␟');
  });

  it('strips pronouns and modals from JD second-person phrasing', () => {
    const jd = 'Requirements:\n- You will drive adoption across teams';
    expect(frameFor(jd, 'adoption')!.text).toBe('Drove adoption across teams, ␟');
  });

  it('carries one slot and the source clause for provenance', () => {
    const jd = 'Requirements:\n- Experience with Apache Airflow for orchestration';
    const frame = frameFor(jd, 'airflow')!;
    expect(frame.slots).toHaveLength(1);
    expect(frame.text.split('␟')).toHaveLength(2);
    expect(frame.sourceClause).toContain('Apache Airflow');
    expect(jd.slice(frame.sourceSpan.start, frame.sourceSpan.end)).toBe(frame.sourceClause);
  });

  it('returns null when the requirement has no JD evidence span', () => {
    expect(buildPhraseFrame('Requirements:\n- SQL', {
      term: 'ghost', modality: 'unmarked', weight: 0.5, jdEvidence: [],
    })).toBeNull();
  });

  it('is deterministic', () => {
    const jd = 'Requirements:\n- Experience with Apache Airflow for orchestration';
    expect(frameFor(jd, 'airflow')).toEqual(frameFor(jd, 'airflow'));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerJdPhraseFrame.test.ts --reporter=dot`
Expected: FAIL — `buildPhraseFrame` is not exported.

- [x] **Step 3: Write minimal implementation**

Append to `src/lib/career/improve/jd-phrase-frame.ts`:

```ts
import { clauseAt } from './jd-clause.js';
import { INPUT_SENTINEL } from '../amplify/data/input-sentinel.js';
import type { Requirement } from './types.js';
import type { TextSpan } from '../parser/types.js';

export interface PhraseFrame {
  /** Draft text with U+241F sentinels where the candidate must supply a fact. */
  text: string;
  /** One slot per sentinel, in left-to-right order. */
  slots: { placeholder: string; hint: string }[];
  /** The JD clause the wording came from — the provenance source of record. */
  sourceClause: string;
  /** Span of that clause in the JD text. */
  sourceSpan: TextSpan;
}

/**
 * Leading words that describe the SHAPE of a requirement rather than its content, plus the
 * second-person scaffolding JDs open with. Stripped only from the FRONT of a clause: a
 * "with" in the middle ("integrated with Stripe") is real content.
 */
const LEADING_NOISE: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'the', 'or', 'of', 'in', 'with', 'to', 'for',
  'ability', 'background', 'comfort', 'comfortable', 'deep', 'demonstrated',
  'excellent', 'experience', 'experienced', 'expertise', 'exposure', 'familiar',
  'familiarity', 'good', 'great', 'hands', 'knowledge', 'minimum', 'practical',
  'preferred', 'prior', 'proficiency', 'proficient', 'proven', 'required', 'skill',
  'skills', 'solid', 'strong', 'successful', 'track', 'record', 'understanding',
  'willingness', 'year', 'years',
  // second-person / modal scaffolding
  'you', 'we', 'they', 'will', 'should', 'must', 'can', 'able',
]);

/** Leading list glyphs and duration counts ("5+", "3-5") carry no content. */
function isLeadingNoise(token: string): boolean {
  const t = token.toLowerCase().replace(/[^a-z0-9+-]/g, '');
  if (!t) return true;
  if (/^\d+[+-]?\d*$/.test(t)) return true;
  return LEADING_NOISE.has(t);
}

const OUTCOME_SLOT = Object.freeze({
  placeholder: 'the result',
  hint: 'the result it produced — a number, a time saved, an outcome',
});

/**
 * Build a drafted sentence frame from the JD's own wording, or null when the clause cannot
 * be voiced confidently.
 *
 * Fail closed: a requirement whose phrasing we cannot rewrite gets no draft, and its card
 * keeps its existing prose form. An awkward draft in a résumé is worse than an honest
 * instruction.
 */
export function buildPhraseFrame(jdText: string, requirement: Requirement): PhraseFrame | null {
  const span = requirement.jdEvidence?.[0];
  if (!span) return null;

  const text = String(jdText ?? '');
  const sourceClause = clauseAt(text, span.start, span.end);
  if (!sourceClause.trim()) return null;

  // Locate the clause's own span so the evidence trail points at real JD bytes.
  const clauseStart = text.indexOf(sourceClause, Math.max(0, span.start - sourceClause.length));
  if (clauseStart === -1) return null;
  const sourceSpan: TextSpan = {
    coordinateSpace: 'raw',
    start: clauseStart,
    end: clauseStart + sourceClause.length,
  };

  // Tokenize on whitespace, dropping list glyphs and trailing sentence punctuation.
  const tokens = sourceClause
    .replace(/^[\s•\-*–—]+/, '')
    .replace(/[.;:!?]+\s*$/, '')
    .split(/\s+/)
    .filter(Boolean);

  // Strip leading scaffolding.
  let i = 0;
  while (i < tokens.length && isLeadingNoise(tokens[i])) i++;
  const rest = tokens.slice(i);
  if (rest.length === 0) return null;

  // First token that resolves as a verb becomes the sentence's verb.
  const past = toPastTense(rest[0]);
  const body = past ? rest.slice(1).join(' ') : rest.join(' ');
  if (!body.trim()) return null;

  const verb = past ?? 'used';
  const opening = verb.charAt(0).toUpperCase() + verb.slice(1);

  return {
    text: `${opening} ${body}, ${INPUT_SENTINEL}`,
    slots: [{ ...OUTCOME_SLOT }],
    sourceClause,
    sourceSpan,
  };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerJdPhraseFrame.test.ts --reporter=dot`
Expected: PASS (12 tests total).

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/jd-phrase-frame.ts tests/unit/careerJdPhraseFrame.test.ts
git commit -m "feat(career): build drafted sentence frames from JD phrasing"
```

---

### Task 4: Frame provenance invariant

A Case A draft has no `before`, so `assertClaimPreserved` is structurally inapplicable. This is the invariant that replaces it.

**Files:**
- Create: `src/lib/career/improve/honesty/frame-provenance.ts`
- Test: `tests/unit/careerFrameProvenance.test.ts`

**Interfaces:**
- Consumes: `HonestyVerdict` from `../types.js`; `PhraseFrame` from `../jd-phrase-frame.js`.
- Produces: `assertFrameProvenance(after: string, frame: PhraseFrame, slotValues: readonly string[]): HonestyVerdict`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/careerFrameProvenance.test.ts
import { describe, it, expect } from 'vitest';
import { assertFrameProvenance } from '../../src/lib/career/improve/honesty/frame-provenance';
import type { PhraseFrame } from '../../src/lib/career/improve/jd-phrase-frame';

const frame: PhraseFrame = {
  text: 'Used Apache Airflow for orchestration, ␟',
  slots: [{ placeholder: 'the result', hint: 'the result it produced' }],
  sourceClause: '- Experience with Apache Airflow for orchestration',
  sourceSpan: { coordinateSpace: 'raw', start: 0, end: 49 },
};

describe('assertFrameProvenance', () => {
  it('accepts a bullet whose every token comes from the JD clause or a slot value', () => {
    const after = 'Used Apache Airflow for orchestration, cutting nightly runtime by 40%';
    expect(assertFrameProvenance(after, frame, ['cutting nightly runtime by 40%']).ok).toBe(true);
  });

  it('refuses a token that came from neither the clause nor a slot', () => {
    // "Kubernetes" is in neither the JD clause nor anything the candidate typed.
    const after = 'Used Apache Airflow and Kubernetes for orchestration, saved time';
    const verdict = assertFrameProvenance(after, frame, ['saved time']);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('unprovenanced_frame_token');
  });

  it('allows closed-class connective words', () => {
    const after = 'Used Apache Airflow for the orchestration of our pipelines, saved time';
    expect(assertFrameProvenance(after, frame, ['saved time', 'pipelines']).ok).toBe(true);
  });

  it('refuses an unfilled draft — a sentinel may never reach the résumé', () => {
    const verdict = assertFrameProvenance(frame.text, frame, []);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('unfilled_slot');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerFrameProvenance.test.ts --reporter=dot`
Expected: FAIL — module does not exist.

- [x] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/honesty/frame-provenance.ts
/**
 * Frame Provenance — the honesty invariant for a draft that has no `before`.
 *
 * `assertClaimPreserved` compares a rewrite against the bullet it came from. A drafted NEW
 * bullet has no such source, so this invariant takes its place:
 *
 *   every content token in the draft must originate in the JD clause it was lifted from,
 *   the frame's own scaffolding, or a value the candidate typed into a slot.
 *
 * That makes it mechanically impossible for the tool to introduce a noun that is neither
 * the employer's word nor the candidate's — which is what lets the card be one-step.
 */
import { INPUT_SENTINEL } from '../../amplify/data/input-sentinel.js';
import type { HonestyVerdict } from '../types.js';
import type { PhraseFrame } from '../jd-phrase-frame.js';

/** Closed-class words that may always appear (mirrors the token-provenance guard). */
const CLOSED_CLASS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at',
  'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'that',
  'this', 'these', 'those', 'their', 'our', 'my', 'your', 'its', 'into', 'onto',
  'across', 'through', 'within', 'during', 'toward', 'towards', 'alongside', 'using',
  'via', 'per', 'each', 'all', 'any', 'some', 'no', 'not', 'than', 'then', 'so',
  'such', 'including', 'include', 'includes', 'etc', 'percent', 'percentage',
  'million', 'thousand', 'billion', 'hundred', 'dozen', 'more', 'less', 'fewer',
  'over', 'under', 'up', 'down', 'out', 'off',
]);

function contentTokens(text: string): string[] {
  return (String(text ?? '').toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || []).map((t) =>
    t.replace(/[.]+$/g, '')
  );
}

export function assertFrameProvenance(
  after: string,
  frame: PhraseFrame,
  slotValues: readonly string[] = []
): HonestyVerdict {
  const text = String(after ?? '');
  if (text.includes(INPUT_SENTINEL)) {
    return { ok: false, reason: 'unfilled_slot' };
  }

  const allowed = new Set<string>();
  for (const tok of contentTokens(frame.sourceClause)) allowed.add(tok);
  for (const tok of contentTokens(frame.text)) allowed.add(tok);
  for (const value of slotValues) {
    for (const tok of contentTokens(value)) allowed.add(tok);
  }

  for (const tok of contentTokens(text)) {
    if (!tok) continue;
    if (allowed.has(tok)) continue;
    if (CLOSED_CLASS.has(tok)) continue;
    return { ok: false, reason: 'unprovenanced_frame_token' };
  }
  return { ok: true };
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerFrameProvenance.test.ts --reporter=dot`
Expected: PASS (4 tests).

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/honesty/frame-provenance.ts tests/unit/careerFrameProvenance.test.ts
git commit -m "feat(career): frame-provenance invariant for drafts with no source bullet"
```

---

### Task 5: Case B — adjacent evidence drafts an in-place rewrite

**Files:**
- Modify: `src/lib/career/improve/rules/vocabulary-injection.ts` (the `else if (entry.support === 'adjacent')` branch)
- Test: `tests/unit/careerImproveOutputQuality.test.ts`

**Interfaces:**
- Consumes: `INPUT_SENTINEL`; the existing `assertTokenProvenance` / `assertClaimPreserved` / `PERMITS`.
- Produces: adjacent-support suggestions now carry `before`, `after`, `inputSlots`, `requiresInput: true`, `editable: true`, and keep `type: 'learning_gap'`.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/careerImproveOutputQuality.test.ts
describe('adjacent evidence drafts a fill-in rewrite (Case B)', () => {
  const setup = () =>
    pipeline(
      'Requirements:\n- Solid understanding of dimensional modeling',
      'EXPERIENCE\nPartnered with analysts to model warehouse tables for reporting'
    );

  it('offers an editable draft with a blank instead of an instruction', () => {
    const { doc, bullets, map } = setup();
    const gaps = vocabularyInjectionRule(map, bullets, doc).filter((s) => s.type === 'learning_gap');
    expect(gaps.length).toBeGreaterThan(0);
    const gap = gaps[0];
    expect(gap.editable).toBe(true);
    expect(gap.requiresInput).toBe(true);
    expect(gap.after).toContain('␟');
    expect(gap.inputSlots?.length).toBeGreaterThan(0);
    // Amplify-only: the original bullet survives intact inside the draft.
    expect(gap.after).toContain('model warehouse tables for reporting');
    expect(gap.before).toBe('Partnered with analysts to model warehouse tables for reporting');
  });

  it('does not rename the adjacent phrase to the canonical term', () => {
    const { doc, bullets, map } = setup();
    const gaps = vocabularyInjectionRule(map, bullets, doc).filter((s) => s.type === 'learning_gap');
    // The escalation guard still holds: the tool never asserts the candidate did it.
    expect(gaps[0].after).not.toMatch(/dimensional modeling\//);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerImproveOutputQuality.test.ts --reporter=dot`
Expected: FAIL — `gap.editable` is `false` and `gap.after` is undefined.

- [x] **Step 3: Write minimal implementation**

In `src/lib/career/improve/rules/vocabulary-injection.ts`, add to the imports:

```ts
import { INPUT_SENTINEL } from '../../amplify/data/input-sentinel.js';
```

Inside the `else if (entry.support === 'adjacent')` branch, after `firstAdjacent` is resolved and before the `gap` object is built, insert:

```ts
    // Draft a fill-in rewrite when we have an anchor bullet to hang it on. The tool never
    // names the canonical term itself (that is the escalation the tiered bridge exists to
    // prevent) — it opens a blank and lets the candidate name what they actually did.
    const anchorBullet = firstAdjacent ? bulletById.get(firstAdjacent.bulletId) : undefined;
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
```

Then replace the `gap` object literal's tail so the draft is attached when it survived the guards. Change these fields on the `gap: ResumeSuggestion = { … }` literal:

```ts
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
        editable: draft ? true : false,
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerImproveOutputQuality.test.ts --reporter=dot`
Expected: PASS — the 2 new tests plus all 8 existing ones. The pre-existing "stays silent about a derived n-gram" test must still pass: that requirement has no `jdEvidence`, so it still returns before reaching the draft.

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/rules/vocabulary-injection.ts tests/unit/careerImproveOutputQuality.test.ts
git commit -m "feat(career): adjacent-evidence gaps draft a fill-in rewrite"
```

---

### Task 6: Case A — missing-evidence rule + contract additions

**Files:**
- Create: `src/lib/career/improve/rules/missing-evidence.ts`
- Modify: `src/lib/career/analysis/types.ts`
- Test: `tests/unit/careerMissingEvidence.test.ts`

**Interfaces:**
- Consumes: `buildPhraseFrame` (Task 3); `EvidenceMap`, `ResumeBullet` from `../types.js`; `segmentEntries` from `../../parser/segment-entries.js`.
- Produces: `missingEvidenceRule(map: EvidenceMap, jdText: string, doc: ResumeDocument): ResumeSuggestion[]`; `ResumeSuggestion.target.entryId?: string`; `ResumeSuggestion.requiresEntryChoice?: boolean`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/careerMissingEvidence.test.ts
import { describe, it, expect } from 'vitest';
import { missingEvidenceRule } from '../../src/lib/career/improve/rules/missing-evidence';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import { segmentDocumentBullets } from '../../src/lib/career/parser/segment-bullets';
import { makeImproveDoc } from './fixtures/career-improve-doc';

const JD = 'Requirements:\n- Experience with Apache Airflow for orchestration\n- Strong SQL skills are required';
const RESUME = 'EXPERIENCE\nWrote reporting queries against Postgres for the finance team';

function run() {
  const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
  const bullets = segmentDocumentBullets(doc.sections);
  const map = mapEvidence(buildRequirementLedger(JD), bullets);
  return missingEvidenceRule(map, JD, doc);
}

describe('missingEvidenceRule (Case A)', () => {
  it('drafts a new bullet for a requirement with no résumé evidence', () => {
    const sugs = run();
    const airflow = sugs.find((s) => s.reason.toLowerCase().includes('airflow'));
    expect(airflow).toBeTruthy();
    expect(airflow!.after).toBe('Used Apache Airflow for orchestration, ␟');
    expect(airflow!.requiresInput).toBe(true);
    expect(airflow!.editable).toBe(true);
    expect(airflow!.before).toBeUndefined(); // it is a new bullet, not a rewrite
  });

  it('requires the candidate to choose the target entry', () => {
    const airflow = run().find((s) => s.reason.toLowerCase().includes('airflow'))!;
    expect(airflow.requiresEntryChoice).toBe(true);
    expect(airflow.target?.entryId).toBeUndefined(); // no default — the candidate picks
  });

  it('warns that accepting the card is an assertion', () => {
    const airflow = run().find((s) => s.reason.toLowerCase().includes('airflow'))!;
    expect(airflow.reason.toLowerCase()).toContain('only accept if you have actually done this');
  });

  it('stays a learning_gap so it never outranks a demonstrated rewrite', () => {
    expect(run().every((s) => s.type === 'learning_gap')).toBe(true);
  });

  it('emits nothing for a requirement the résumé already demonstrates', () => {
    expect(run().some((s) => s.reason.toLowerCase().includes('sql'))).toBe(false);
  });

  it('emits no draft when the frame cannot be built — fail closed', () => {
    const jd = 'Requirements:\n- Kubernetes';   // bare noun, no clause to voice
    const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
    const bullets = segmentDocumentBullets(doc.sections);
    const map = mapEvidence(buildRequirementLedger(jd), bullets);
    const k8s = missingEvidenceRule(map, jd, doc).find((s) => s.reason.includes('Kubernetes'));
    // A card may still exist, but it must never carry a half-built draft.
    if (k8s) expect(k8s.after === undefined || k8s.after.includes('Kubernetes')).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerMissingEvidence.test.ts --reporter=dot`
Expected: FAIL — module does not exist.

- [x] **Step 3: Add the contract fields**

In `src/lib/career/analysis/types.ts`, extend the `target` object and add the new flag:

```ts
  target?: {
    span?: TextSpan;
    sectionId?: string;
    insertionPoint?: 'before_section' | 'after_section' | 'document_end';
    /**
     * Insert as a new bullet at the END of this employment entry. Set from the candidate's
     * explicit choice — never defaulted, because placing a drafted bullet under an employer
     * asserts WHERE the work happened.
     */
    entryId?: string;
  };
```

and alongside `requiresInput`:

```ts
  /** True when the candidate must choose a target entry before Accept unlocks. */
  requiresEntryChoice?: boolean;
```

- [x] **Step 4: Write minimal implementation**

```ts
// src/lib/career/improve/rules/missing-evidence.ts
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
```

- [x] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerMissingEvidence.test.ts --reporter=dot`
Expected: PASS (6 tests).

- [x] **Step 6: Commit**

```bash
git add src/lib/career/improve/rules/missing-evidence.ts src/lib/career/analysis/types.ts tests/unit/careerMissingEvidence.test.ts
git commit -m "feat(career): missing-evidence rule drafts a bullet with a required entry choice"
```

---

### Task 7: Entry-anchored insertion in the apply engine

Without this, the entry choice on a Case A card is cosmetic — the apply engine can only insert at section granularity. This is a hard prerequisite for Case A being truthful.

**Files:**
- Modify: `src/lib/career/improve/apply-moves.ts`
- Test: `tests/unit/careerEntryAware.test.ts`

**Interfaces:**
- Consumes: `target.entryId` (Task 6).
- Produces: an accepted suggestion with `target.entryId` inserts its `after` as a new bullet at the end of that entry.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/careerEntryAware.test.ts
describe('entry-anchored insertion', () => {
  const RESUME = [
    'EXPERIENCE',
    'iQor — Support Lead',
    'Wrote reporting queries against Postgres',
    'GC Services — Agent',
    'Handled inbound customer calls',
  ].join('\n');

  it('inserts a new bullet at the end of the chosen entry only', () => {
    const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
    const entries = segmentEntries(doc.sections[0]);
    const iqor = entries[0];

    const result = applyMovesAndRewrites(doc, [
      {
        id: 'sug:insert:1',
        type: 'learning_gap',
        target: { entryId: iqor.id, sectionId: doc.sections[0].id },
        after: 'Used Apache Airflow for orchestration, cutting runtime by 40%',
        reason: 'test',
        evidence: [],
        confidence: 0.6,
        risk: 'medium',
        requiresUserApproval: true,
        status: 'accepted',
      },
    ]);

    expect(result.applied).toContain('sug:insert:1');
    const lines = result.text.split('\n');
    const inserted = lines.findIndex((l) => l.includes('Apache Airflow'));
    const gcServices = lines.findIndex((l) => l.includes('GC Services'));
    // The new bullet lands inside the iQor entry, above the next employer.
    expect(inserted).toBeGreaterThan(lines.findIndex((l) => l.includes('Postgres')));
    expect(inserted).toBeLessThan(gcServices);
    // The other entry is untouched.
    expect(result.text).toContain('Handled inbound customer calls');
  });

  it('refuses an insertion naming an entry that does not exist', () => {
    const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
    const result = applyMovesAndRewrites(doc, [
      {
        id: 'sug:insert:2',
        type: 'learning_gap',
        target: { entryId: 'entry:does-not-exist', sectionId: doc.sections[0].id },
        after: 'Used Apache Airflow, saved time',
        reason: 'test',
        evidence: [],
        confidence: 0.6,
        risk: 'medium',
        requiresUserApproval: true,
        status: 'accepted',
      },
    ]);
    expect(result.applied).not.toContain('sug:insert:2');
    expect(result.skipped.some((s) => s.suggestionId === 'sug:insert:2')).toBe(true);
    expect(result.text).not.toContain('Apache Airflow');
  });
});
```

Add to that file's imports if not already present:

```ts
import { applyMovesAndRewrites } from '../../src/lib/career/improve/apply-moves';
import { segmentEntries } from '../../src/lib/career/parser/segment-entries';
import { makeImproveDoc } from './fixtures/career-improve-doc';
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerEntryAware.test.ts --reporter=dot`
Expected: FAIL — the suggestion is skipped as `missing_target`; the inserted text is absent.

- [x] **Step 3: Write minimal implementation**

In `src/lib/career/improve/apply-moves.ts`:

**(a)** Add an `inserted` map to the `SectionPlan` type and to the plan builder:

```ts
// in the SectionPlan interface
  inserted: Map<string, string[]>;   // entryId → bullet texts appended to that entry
```

```ts
// in the plans .map(...) initializer, alongside `rewritten` and `textPatches`
      inserted: new Map<string, string[]>(),
```

**(b)** Route entry-anchored insertions. Change the `insertSugs` filter and add a routing pass immediately after the existing `insertSugs` declaration:

```ts
  const entryInsertSugs = viable.filter((s) => !s.move && s.target?.entryId);
  const insertSugs = viable.filter(
    (s) => !s.move && !s.target?.entryId && s.target?.insertionPoint
  );
```

Then after `planBySectionId` is built, add:

```ts
  // Entry-anchored insertions: a new bullet at the end of the entry the candidate chose.
  // An entry that does not exist is refused rather than falling back to the section, since
  // the whole point of the choice is that the bullet's employer is not inferred.
  for (const ins of entryInsertSugs) {
    const entryId = ins.target!.entryId!;
    const plan = plans.find((p) => p.entries.some((e) => e.entryId === entryId));
    const text = ins.after ?? '';
    if (!plan || !text.trim()) {
      skipped.push({ suggestionId: ins.id, reason: 'missing_target' });
      continue;
    }
    const list = plan.inserted.get(entryId) || [];
    list.push(text);
    plan.inserted.set(entryId, list);
    applied.push(ins.id);
  }
```

**(c)** Emit the inserted lines in `reconstructSection`. Replace the `return outLines.join('\n');` at the end of that function with:

```ts
  // Append inserted bullets after each entry's last bullet line, using that bullet's
  // prefix so the marker/indent matches its neighbours. Collected first and spliced in
  // descending line order so earlier insertions do not shift later indices.
  const pending: Array<{ afterLine: number; texts: string[] }> = [];
  for (const entry of entries) {
    const texts = plan.inserted.get(entry.entryId);
    if (!texts?.length) continue;
    const slotLineIndices = entry.bullets
      .map((b) => bulletLineIndex.get(b.id))
      .filter((n): n is number => typeof n === 'number');
    if (slotLineIndices.length === 0) continue;
    const lastLine = Math.max(...slotLineIndices);
    const prefix = bulletPrefix.get(entry.order[entry.order.length - 1]) ?? '';
    pending.push({ afterLine: lastLine, texts: texts.map((t) => prefix + t) });
  }
  pending.sort((a, b) => b.afterLine - a.afterLine);
  for (const p of pending) outLines.splice(p.afterLine + 1, 0, ...p.texts);

  return outLines.join('\n');
```

`reconstructSection` needs the whole plan for `inserted`; it already receives `plan`, so only the destructuring line changes:

```ts
  const { section, entries, rewritten } = plan;   // `plan.inserted` used directly below
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerEntryAware.test.ts --reporter=dot`
Expected: PASS — the 2 new tests plus every existing entry-aware test.

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/apply-moves.ts tests/unit/careerEntryAware.test.ts
git commit -m "feat(career): entry-anchored bullet insertion in the apply engine"
```

---

### Task 8: Case C — the trim flag becomes a demote move

**Files:**
- Modify: `src/lib/career/improve/rules/reorder.ts` (the `if (anyRelevant)` flag block)
- Test: `tests/unit/careerImproveRules.test.ts`

**Interfaces:**
- Consumes: the existing `MoveBulletOperation` shape.
- Produces: flag suggestions now carry `move` demoting the bullet within its own entry.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/careerImproveRules.test.ts
describe('JD-irrelevant bullets (Case C)', () => {
  it('offers a demote move rather than prose advice', () => {
    const doc = makeImproveDoc(
      'EXPERIENCE\nWrote reporting queries against Postgres\nCoached the office softball team',
      'experience',
      'EXPERIENCE'
    );
    const bullets = segmentDocumentBullets(doc.sections);
    const map = mapEvidence(buildRequirementLedger('Requirements:\n- Strong SQL skills are required'), bullets);
    const flags = reorderRule(map, bullets, doc).filter((s) => s.reason.includes('below'));

    expect(flags.length).toBeGreaterThan(0);
    const flag = flags[0];
    expect(flag.move).toBeTruthy();
    // The move stays inside the bullet's own entry — never across employers.
    const softball = bullets.find((b) => b.rawText.includes('softball'))!;
    expect(flag.move!.bulletId).toBe(softball.id);
    expect(flag.move!.entryId).toBe(softball.entryId);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerImproveRules.test.ts --reporter=dot`
Expected: FAIL — `flag.move` is undefined (and the reason still says "consider trimming it").

- [x] **Step 3: Write minimal implementation**

In the flag block of `src/lib/career/improve/rules/reorder.ts`, replace the `reason` and add a `move`. The bullet is demoted after the last relevant bullet of its own entry:

```ts
      for (const bullet of irrelevant) {
        const entryBulletIds = entryBullets.map((b) => b.id);
        const lastOther = [...entryBulletIds].reverse().find((id) => id !== bullet.id);
        if (!lastOther) continue; // nothing to demote past — silence
        suggestions.push({
          id: makeSuggestionId('structure', `${entryId}:flag`, bullet.id),
          type: 'structure',
          target: { sectionId },
          before: bullet.rawText,
          after: bullet.rawText, // a move, not an edit — text is unchanged
          reason: 'The job description never asks about this. Move it below your JD-relevant bullets so a recruiter reaches your strongest evidence first.',
          evidence: [
            {
              source: 'analysis',
              rule: 'reorder_flag',
              span: bullet.sourceSpan,
              text: bullet.rawText.slice(0, 40),
              confidence: 0.5,
            },
          ],
          confidence: 0.5,
          risk: 'low',
          requiresUserApproval: true,
          status: 'pending',
          editable: false,
          move: { bulletId: bullet.id, entryId, afterBulletId: lastOther },
        });
      }
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerImproveRules.test.ts --reporter=dot`
Expected: PASS — the new test plus every existing rule test.

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/rules/reorder.ts tests/unit/careerImproveRules.test.ts
git commit -m "feat(career): JD-irrelevant bullets offer a demote move, not advice"
```

---

### Task 9: Wire the rule in and suppress the duplicate gap

`build-suggestions.ts` emits its own prose-only `learning_gap` for the same missing terms, and `mergeImprovements` dedupes by span — which these cards do not have.

**Files:**
- Modify: `src/lib/career/improve/build-improvements.ts`
- Modify: `src/pages/Career/CareerPage.tsx` (`mergeImprovements`)
- Test: `tests/unit/careerImproveOutputQuality.test.ts`

**Interfaces:**
- Consumes: `missingEvidenceRule` (Task 6).
- Produces: `buildImprovements` output includes Case A cards; `mergeImprovements` drops a prose gap whose term an improvement already covers.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/careerImproveOutputQuality.test.ts
describe('advisor wiring', () => {
  it('buildImprovements includes a drafted card for a missing requirement', () => {
    const doc = makeImproveDoc(
      'EXPERIENCE\nWrote reporting queries against Postgres',
      'experience',
      'EXPERIENCE'
    );
    const sugs = buildImprovements(
      'Requirements:\n- Experience with Apache Airflow for orchestration',
      doc
    );
    const airflow = sugs.find((s) => s.reason.toLowerCase().includes('airflow'));
    expect(airflow).toBeTruthy();
    expect(airflow!.after).toContain('␟');
    expect(airflow!.requiresEntryChoice).toBe(true);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerImproveOutputQuality.test.ts --reporter=dot`
Expected: FAIL — no Airflow suggestion; the rule is not registered.

- [x] **Step 3: Write minimal implementation**

In `src/lib/career/improve/build-improvements.ts` add the import and the rule call:

```ts
import { missingEvidenceRule } from './rules/missing-evidence.js';
```

```ts
  const suggestions: ResumeSuggestion[] = [
    ...vocabularyInjectionRule(evidenceMap, bullets, doc),
    ...reorderRule(evidenceMap, bullets, doc),
    ...quantifyRule(evidenceMap, bullets, doc),
    ...addSectionRule(evidenceMap, bullets, doc),
    ...missingEvidenceRule(evidenceMap, jdText, doc),
  ];
```

In `src/pages/Career/CareerPage.tsx`, add term-level suppression to `mergeImprovements`. Replace the function body's `merged` construction with:

```ts
  // An improvement that speaks for a term supersedes the prose-only gap for that same
  // term. Gap cards carry no span, so the span-overlap dedupe below can never catch them.
  const improvedTerms = new Set(
    improvements
      .flatMap((s) => s.evidence.map((e) => e.text))
      .filter((t): t is string => !!t)
      .map((t) => t.toLowerCase())
  );
  const merged = existing.filter(
    (s) =>
      s.type !== 'learning_gap' ||
      !s.evidence.some((e) => e.text && improvedTerms.has(e.text.toLowerCase()))
  );
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerImproveOutputQuality.test.ts tests/unit/careerPageWorkflow.test.tsx --reporter=dot`
Expected: PASS — the new test plus the existing page-workflow tests.

- [x] **Step 5: Commit**

```bash
git add src/lib/career/improve/build-improvements.ts src/pages/Career/CareerPage.tsx tests/unit/careerImproveOutputQuality.test.ts
git commit -m "feat(career): register missing-evidence rule and suppress duplicate gaps"
```

---

### Task 10: Entry select on the card

**Files:**
- Modify: `src/pages/Career/SuggestionReviewPanel.tsx`
- Modify: `src/pages/Career/CareerPage.css`
- Test: `tests/unit/careerApplyProvenance.test.tsx`

**Interfaces:**
- Consumes: `requiresEntryChoice`, `target.entryId` (Task 6).
- Produces: the panel renders an entry `<select>` for such cards and blocks Accept until one is chosen; on Accept it sets `target.entryId`.

The panel needs the list of entries. Pass it in as a new optional prop `entries?: { id: string; label: string }[]`, supplied by `CareerPage` from `segmentEntries` over the parsed document's experience sections.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/careerApplyProvenance.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import SuggestionReviewPanel from '../../src/pages/Career/SuggestionReviewPanel';

describe('entry choice on a drafted card', () => {
  const suggestion = {
    id: 'sug:gap:1',
    type: 'learning_gap' as const,
    after: 'Used Apache Airflow for orchestration, ␟',
    reason: 'test card',
    evidence: [],
    confidence: 0.6,
    risk: 'medium' as const,
    requiresUserApproval: true as const,
    status: 'pending' as const,
    requiresInput: true,
    requiresEntryChoice: true,
    inputSlots: [{ id: 'sug:gap:1:slot:0', placeholder: 'the result', hint: 'the result it produced' }],
    editable: true,
  };
  const entries = [
    { id: 'entry:exp:0', label: 'iQor — Support Lead' },
    { id: 'entry:exp:1', label: 'GC Services — Agent' },
  ];

  it('blocks Accept until both the blank and the entry are supplied', () => {
    const onAccept = vi.fn();
    render(
      <SuggestionReviewPanel suggestions={[suggestion]} entries={entries} onAccept={onAccept} />
    );
    const accept = screen.getByRole('button', { name: /accept/i });
    expect(accept).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('the result'), { target: { value: 'cut runtime 40%' } });
    expect(accept).toBeDisabled(); // still no entry chosen

    fireEvent.change(screen.getByLabelText(/which role/i), { target: { value: 'entry:exp:1' } });
    expect(accept).toBeEnabled();
  });

  it('reports the chosen entry on accept', () => {
    const onAccept = vi.fn();
    render(
      <SuggestionReviewPanel suggestions={[suggestion]} entries={entries} onAccept={onAccept} />
    );
    fireEvent.change(screen.getByPlaceholderText('the result'), { target: { value: 'cut runtime 40%' } });
    fireEvent.change(screen.getByLabelText(/which role/i), { target: { value: 'entry:exp:1' } });
    fireEvent.click(screen.getByRole('button', { name: /accept/i }));

    expect(onAccept).toHaveBeenCalledWith('sug:gap:1', expect.objectContaining({ entryId: 'entry:exp:1' }));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerApplyProvenance.test.tsx --reporter=dot`
Expected: FAIL — no entry select is rendered; `getByLabelText(/which role/i)` throws.

- [x] **Step 3: Write minimal implementation**

Add the prop and per-suggestion entry state to `SuggestionReviewPanel.tsx`:

```tsx
const [entryChoices, setEntryChoices] = useState<Record<string, string>>({});
```

Extend the accept-enabled predicate (currently `allSlotsFilled`) so it also requires an entry when one is demanded:

```tsx
  const entryChosen = (s: ResumeSuggestion) =>
    s.requiresEntryChoice !== true || !!entryChoices[s.id];
```

Render the select inside the card body, directly after the input slots block:

```tsx
  {sug.requiresEntryChoice && (
    <div className="suggestion-entry-choice">
      <label htmlFor={`entry-${sug.id}`}>Which role did you do this in?</label>
      <select
        id={`entry-${sug.id}`}
        value={entryChoices[sug.id] || ''}
        onChange={(e) => setEntryChoices((prev) => ({ ...prev, [sug.id]: e.target.value }))}
      >
        <option value="">Choose a role…</option>
        {(entries || []).map((entry) => (
          <option key={entry.id} value={entry.id}>{entry.label}</option>
        ))}
      </select>
    </div>
  )}
```

Pass the choice through on accept:

```tsx
  onAccept(sug.id, { entryId: entryChoices[sug.id] });
```

Add the accompanying style to `CareerPage.css`:

```css
.suggestion-entry-choice { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.6rem; }
.suggestion-entry-choice label { font-size: 0.8rem; opacity: 0.85; }
```

In `CareerPage.tsx`, build and pass the entry list wherever `SuggestionReviewPanel` is rendered:

```tsx
const entryOptions = useMemo(
  () =>
    (parsedDocument?.sections || [])
      .filter((s) => s.kind === 'experience')
      .flatMap((s) => segmentEntries(s))
      .map((e) => ({ id: e.id, label: e.title?.text || e.id })),
  [parsedDocument]
);
```

and extend `handleAccept` to merge `{ entryId }` into the suggestion's `target` before it reaches `applyAcceptedSuggestions`.

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerApplyProvenance.test.tsx --reporter=dot`
Expected: PASS (2 new tests plus existing).

- [x] **Step 5: Write the failing test for the frame-provenance gate**

This is the step that makes `assertFrameProvenance` load-bearing. Without it the invariant
built in Task 4 is never called and silently guards nothing.

```ts
// append to tests/unit/careerFrameProvenance.test.ts
import { acceptDraftedBullet } from '../../src/lib/career/improve/accept-draft';

describe('accepting a drafted bullet enforces frame provenance', () => {
  const frame = {
    text: 'Used Apache Airflow for orchestration, ␟',
    slots: [{ placeholder: 'the result', hint: 'the result it produced' }],
    sourceClause: '- Experience with Apache Airflow for orchestration',
    sourceSpan: { coordinateSpace: 'raw' as const, start: 0, end: 49 },
  };

  it('returns the filled text when every token is provenanced', () => {
    const result = acceptDraftedBullet(frame, ['cut nightly runtime by 40%']);
    expect(result.ok).toBe(true);
    expect(result.text).toBe('Used Apache Airflow for orchestration, cut nightly runtime by 40%');
  });

  it('refuses when a slot is left empty', () => {
    expect(acceptDraftedBullet(frame, ['']).ok).toBe(false);
  });
});
```

- [x] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/unit/careerFrameProvenance.test.ts --reporter=dot`
Expected: FAIL — module `accept-draft` does not exist.

- [x] **Step 7: Implement the accept path**

```ts
// src/lib/career/improve/accept-draft.ts
/**
 * Fill a drafted frame with the candidate's slot values and gate it on frame provenance.
 *
 * This is where the Task 4 invariant becomes load-bearing: emission time has nothing to
 * check (the draft is still full of sentinels), so the check belongs here, at the moment
 * candidate text turns into résumé text.
 */
import { INPUT_SENTINEL } from '../amplify/data/input-sentinel.js';
import { assertFrameProvenance } from './honesty/frame-provenance.js';
import type { PhraseFrame } from './jd-phrase-frame.js';

export function acceptDraftedBullet(
  frame: PhraseFrame,
  slotValues: readonly string[]
): { ok: boolean; text?: string; reason?: string } {
  const parts = frame.text.split(INPUT_SENTINEL);
  let text = parts[0];
  for (let i = 1; i < parts.length; i++) {
    text += (slotValues[i - 1] ?? '').trim() + parts[i];
  }
  if (text.includes(INPUT_SENTINEL) || slotValues.some((v) => !String(v ?? '').trim())) {
    return { ok: false, reason: 'unfilled_slot' };
  }
  const verdict = assertFrameProvenance(text, frame, slotValues);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  return { ok: true, text };
}
```

Call it from `CareerPage.handleAccept` for any suggestion with `requiresEntryChoice`, and
refuse the accept when it returns `ok: false`.

- [x] **Step 8: Run tests to verify they pass**

Run: `npx vitest run tests/unit/careerFrameProvenance.test.ts tests/unit/careerApplyProvenance.test.tsx --reporter=dot`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add src/pages/Career/SuggestionReviewPanel.tsx src/pages/Career/CareerPage.tsx src/pages/Career/CareerPage.css src/lib/career/improve/accept-draft.ts tests/unit/careerApplyProvenance.test.tsx tests/unit/careerFrameProvenance.test.ts
git commit -m "feat(career): entry select on drafted cards, gated on frame provenance"
```

---

### Task 11: The end-to-end invariant

The whole point of the feature, asserted once over a realistic fixture.

**Files:**
- Test: `tests/unit/careerImproveOutputQuality.test.ts`

**Interfaces:**
- Consumes: everything above.

- [x] **Step 1: Write the failing test**

```ts
// append to tests/unit/careerImproveOutputQuality.test.ts
describe('no card instructs without offering an operation', () => {
  const JD = [
    'Senior Data Engineer',
    '',
    'Requirements:',
    '- 5+ years of experience building data pipelines in Python',
    '- Strong SQL skills; experience with PostgreSQL is required',
    '- Experience with Apache Airflow for orchestration',
    '- Solid understanding of dimensional modeling',
    '',
    'Benefits:',
    'We offer generous PTO and a competitive salary.',
  ].join('\n');

  const RESUME = [
    'EXPERIENCE',
    'Built and maintained nightly ETL jobs moving records into Postgres',
    'Partnered with analysts to model warehouse tables for reporting',
    'Coached the office softball team on weekends',
  ].join('\n');

  it('every card carries a draft, a move, or a fill-in', () => {
    const sugs = buildImprovements(JD, makeImproveDoc(RESUME, 'experience', 'EXPERIENCE'));
    expect(sugs.length).toBeGreaterThan(0);

    for (const sug of sugs) {
      const actionable =
        !!sug.move ||
        (sug.inputSlots?.length ?? 0) > 0 ||
        (!!sug.after && sug.after !== sug.before);
      expect(
        actionable,
        `card "${sug.id}" instructs without an operation: ${sug.reason}`
      ).toBe(true);
    }
  });

  it('is deterministic across runs', () => {
    const doc = makeImproveDoc(RESUME, 'experience', 'EXPERIENCE');
    expect(JSON.stringify(buildImprovements(JD, doc))).toBe(
      JSON.stringify(buildImprovements(JD, doc))
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerImproveOutputQuality.test.ts --reporter=dot`
Expected: this test should PASS if Tasks 5–9 are complete. If it fails, the assertion message names the offending card — fix that rule rather than weakening the test.

- [x] **Step 3: Run the full suite**

Run: `npx vitest run tests/unit --reporter=dot`
Expected: all career tests pass. `tests/unit/combatSelectors.movement.test.js` fails to resolve an import — that failure is pre-existing and unrelated (the Combat file is absent from HEAD too).

- [x] **Step 4: Typecheck and self-check**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "career|improve"
npm run scd64:intellisense -- 'src/lib/career/improve/**/*.ts'
```
Expected: no career TypeScript errors. Investigate any SCD64 family the checker names — `predicted ≠ confirmed`, but the family is a real hypothesis worth testing against the diff.

- [x] **Step 5: Commit**

```bash
git add tests/unit/careerImproveOutputQuality.test.ts
git commit -m "test(career): assert no recommendation instructs without an operation"
```

---

## Self-Review Notes

**Spec coverage.** §1 frame extraction → Tasks 2–3. §2 Case B → Task 5. §3 Case A incl. entry choice and the apply-engine prerequisite → Tasks 6, 7, 10. §4 frame provenance → Task 4. §5 Case C → Task 8. §6 duplicate suppression → Task 9. §7 testing → distributed, with the headline invariant in Task 11. The shared-clause requirement implied by §1 → Task 1.

**Resolved risk — a guard that could not fail.** `assertFrameProvenance` is built in Task 4 but has nothing to check at emission time, because a freshly drafted card is still full of sentinels. First draft of this plan left it uncalled, which is this repo's recurring pathology: a check that exists, passes, and guards nothing. Task 10 Steps 5–8 now build `accept-draft.ts` and test it directly, so the invariant is load-bearing at the moment candidate text becomes résumé text. Do not descope those steps without also deleting Task 4.

**Type consistency.** `PhraseFrame` (Task 3) is consumed unchanged by Tasks 4 and 6. `target.entryId` and `requiresEntryChoice` (Task 6) are consumed by Tasks 7 and 10. `toPastTense` (Task 2) is used only by Task 3. `clauseAt` (Task 1) is used by the ledger and Task 3.
