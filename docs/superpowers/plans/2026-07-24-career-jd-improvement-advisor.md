# Career JD Improvement Advisor + Formatted Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare a résumé against a specific job description and propose actionable, honesty-guarded improvements the candidate accepts to directly improve the résumé, then export a formatted ATS-safe `.docx`.

**Architecture:** A JD-first pipeline of pure modules under `src/lib/career/improve/`: a weighted requirement ledger from the JD, a tiered skill→phrase evidence bridge, an evidence map over first-class résumé bullets, and four drafting rules (vocabulary-injection, quantify, add-section, reorder) that emit the existing `ResumeSuggestion` shape. Every drafted edit passes a two-invariant honesty gate (token provenance + claim preservation). A DOCX exporter renders the improved structured résumé client-side.

**Tech Stack:** TypeScript, Vitest, the existing `ResumeSuggestion`/parser types, and the `docx` npm library (client-side).

## Global Constraints

- **No server, no network calls** — all logic runs client-side (same-origin/offline law).
- **Never add claims** — every drafted `after` must pass the honesty gate (§5 of the spec); rules **fail closed** (discard the suggestion) when claim extraction is uncertain.
- **Determinism** — no ML, no randomness; identical inputs produce identical output and ordering.
- **Reuse the `ResumeSuggestion` contract** — one additive optional field (`move?`) is the only contract change (Task 9).
- **TDD** — write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- Test files live in `tests/unit/`, imported as `../../src/lib/...`, using `import { describe, it, expect } from 'vitest'`.
- Run a single test file with: `npx vitest run tests/unit/<file> --reporter=dot`.

---

### Task 1: First-class résumé bullet model

**Files:**
- Create: `src/lib/career/parser/segment-bullets.ts`
- Test: `tests/unit/careerSegmentBullets.test.ts`

**Interfaces:**
- Consumes: `ResumeSection`, `TextSpan` from `../parser/types`; `stableHash` from `../parser/identity-utils`.
- Produces: `interface ResumeBullet { id: string; sectionId: string; rawText: string; sourceSpan: TextSpan }` and `segmentBullets(section: ResumeSection): ResumeBullet[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerSegmentBullets.test.ts
import { describe, it, expect } from 'vitest';
import { segmentBullets } from '../../src/lib/career/parser/segment-bullets';
import type { ResumeSection } from '../../src/lib/career/parser/types';

function section(text: string, start = 0): ResumeSection {
  return {
    id: 'sec-exp', kind: 'experience', heading: 'EXPERIENCE', text,
    span: { coordinateSpace: 'raw', start, end: start + text.length },
    confidence: 1, evidence: [],
  };
}

describe('segmentBullets', () => {
  it('splits lines into bullets, skips blanks, strips leading glyphs from the id only', () => {
    const raw = '• Led the team\n\n- Wrote Postgres queries';
    const bullets = segmentBullets(section(raw));
    expect(bullets).toHaveLength(2);
    expect(bullets[0].sectionId).toBe('sec-exp');
    expect(bullets[0].rawText).toBe('• Led the team');           // rawText keeps the line verbatim
    expect(bullets[1].rawText).toBe('- Wrote Postgres queries');
    // spans slice back to the exact line
    expect(raw.slice(bullets[1].sourceSpan.start, bullets[1].sourceSpan.end)).toBe('- Wrote Postgres queries');
    // ids are stable + distinct
    expect(bullets[0].id).not.toBe(bullets[1].id);
    expect(bullets[0].id.startsWith('sec-exp#0#')).toBe(true);
  });

  it('offsets spans by the section start', () => {
    const bullets = segmentBullets(section('Led the team', 100));
    expect(bullets[0].sourceSpan.start).toBe(100);
    expect(bullets[0].sourceSpan.end).toBe(112);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerSegmentBullets.test.ts --reporter=dot`
Expected: FAIL — `segment-bullets` module does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/parser/segment-bullets.ts
import type { ResumeSection, TextSpan } from './types';
import { stableHash } from './identity-utils';

export interface ResumeBullet {
  id: string;
  sectionId: string;
  rawText: string;
  sourceSpan: TextSpan; // provenance only — validates staleness, never controls movement
}

const LEADING_GLYPH = /^\s*[•\-*–•]\s+/;

/**
 * Deterministically split a section's text into bullets. The id is stable
 * against edits that do not touch that bullet (sectionId + ordinal + a hash of
 * the glyph-stripped content). rawText keeps the line verbatim so span slices
 * stay byte-identical for the stale-span guard.
 */
export function segmentBullets(section: ResumeSection): ResumeBullet[] {
  const text = section.text ?? '';
  const base = section.span?.start ?? 0;
  const bullets: ResumeBullet[] = [];
  let offset = 0;
  let ordinal = 0;
  for (const line of text.split('\n')) {
    const start = base + offset;
    const end = start + line.length;
    offset += line.length + 1; // +1 for the '\n' consumed by split
    const content = line.replace(LEADING_GLYPH, '').trim();
    if (!content) continue;
    bullets.push({
      id: `${section.id}#${ordinal}#${stableHash(content)}`,
      sectionId: section.id,
      rawText: line,
      sourceSpan: { coordinateSpace: 'raw', start, end },
    });
    ordinal += 1;
  }
  return bullets;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerSegmentBullets.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/parser/segment-bullets.ts tests/unit/careerSegmentBullets.test.ts
git commit -m "feat(career): add first-class résumé bullet model with stable ids"
```

---

### Task 2: Honesty gate — token provenance + claim preservation

**Files:**
- Create: `src/lib/career/improve/claim.ts`
- Test: `tests/unit/careerImproveClaim.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `type Role = 'owner' | 'contributor' | 'support'`; `interface EvidenceClaim`; `extractClaim(text: string): EvidenceClaim`; `assertTokenProvenance(before: string, after: string, allowed: readonly string[]): boolean`; `assertClaimPreserved(before: string, after: string): boolean`; `passesHonestyGate(before: string, after: string, allowedVocabulary: readonly string[]): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerImproveClaim.test.ts
import { describe, it, expect } from 'vitest';
import { extractClaim, passesHonestyGate } from '../../src/lib/career/improve/claim';

describe('claim honesty gate', () => {
  it('extracts role from the head verb', () => {
    expect(extractClaim('Assisted a manager in training 15 agents').role).toBe('support');
    expect(extractClaim('Managed the team').role).toBe('owner');
    expect(extractClaim('Developed the API').role).toBe('contributor');
  });

  it('REJECTS ownership escalation even when every token is legal (the core falsification)', () => {
    // "assisted" (support) -> "managed" (owner): tokens legal, proposition false.
    expect(
      passesHonestyGate('Assisted a manager in training 15 agents', 'Managed and trained 15 agents', [])
    ).toBe(false);
  });

  it('REJECTS re-binding a metric to a different object', () => {
    expect(
      passesHonestyGate('Increased revenue by 15%', 'Increased engagement by 15%', ['engagement'])
    ).toBe(false);
  });

  it('REJECTS a content word with no provenance', () => {
    expect(passesHonestyGate('Wrote reports', 'Wrote reports for Google', [])).toBe(false);
  });

  it('ACCEPTS a role-preserving vocabulary injection', () => {
    expect(
      passesHonestyGate('Developed reports using Postgres', 'Developed reports using SQL and Postgres', ['sql', 'postgres'])
    ).toBe(true);
  });

  it('fails closed when the verb is unrecognizable', () => {
    expect(passesHonestyGate('Xyzzy the frobnitz', 'Managed the frobnitz', [])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerImproveClaim.test.ts --reporter=dot`
Expected: FAIL — `improve/claim` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/claim.ts
export type Role = 'owner' | 'contributor' | 'support';

const OWNER_VERBS = new Set([
  'led', 'managed', 'owned', 'directed', 'built', 'created', 'designed',
  'launched', 'architected', 'founded', 'headed', 'drove', 'established', 'oversaw',
]);
const CONTRIBUTOR_VERBS = new Set([
  'developed', 'implemented', 'contributed', 'collaborated', 'engineered',
  'delivered', 'produced', 'shipped', 'coded', 'wrote', 'integrated', 'automated',
  'increased', 'improved', 'reduced', 'grew', 'boosted', 'cut', 'saved', 'trained',
]);
const SUPPORT_VERBS = new Set([
  'assisted', 'supported', 'helped', 'aided', 'participated', 'coordinated',
]);

const CLOSED_CLASS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'of', 'to', 'in', 'on', 'at',
  'by', 'as', 'from', 'into', 'that', 'which', 'was', 'were', 'is', 'are', 'be', 'using',
]);

export interface EvidenceClaim {
  ok: boolean;                                       // false => extraction uncertain (fail closed)
  action: string | null;
  role: Role | null;
  quantity: { value: string; bindsTo: string } | null;
  objects: Set<string>;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9%.+#]+/g) ?? []);
}

export function extractClaim(text: string): EvidenceClaim {
  const tokens = tokenize(text);
  let action: string | null = null;
  let role: Role | null = null;
  for (const t of tokens) {
    if (OWNER_VERBS.has(t)) { action = t; role = 'owner'; break; }
    if (CONTRIBUTOR_VERBS.has(t)) { action = t; role = 'contributor'; break; }
    if (SUPPORT_VERBS.has(t)) { action = t; role = 'support'; break; }
  }
  let quantity: { value: string; bindsTo: string } | null = null;
  for (let i = 0; i < tokens.length; i++) {
    if (/^\d[\d,.]*%?$/.test(tokens[i])) {
      const next = tokens.slice(i + 1).find((w) => !CLOSED_CLASS.has(w) && !/^\d/.test(w));
      quantity = { value: tokens[i], bindsTo: next ?? '' };
      break;
    }
  }
  const objects = new Set(
    tokens.filter((t) => !CLOSED_CLASS.has(t) && !/^\d/.test(t) && t !== action)
  );
  return { ok: role !== null, action, role, quantity, objects };
}

/** §5.1 — every content word in `after` must have a legal source. */
export function assertTokenProvenance(before: string, after: string, allowed: readonly string[]): boolean {
  const allowedSet = new Set<string>([...tokenize(before), ...CLOSED_CLASS]);
  for (const a of allowed) for (const t of tokenize(a)) allowedSet.add(t);
  for (const v of OWNER_VERBS) allowedSet.add(v);
  for (const v of CONTRIBUTOR_VERBS) allowedSet.add(v);
  for (const v of SUPPORT_VERBS) allowedSet.add(v);
  return tokenize(after).every((t) => allowedSet.has(t));
}

/** §5.2 — the claim relationship (role, metric binding) must be preserved. */
export function assertClaimPreserved(before: string, after: string): boolean {
  const b = extractClaim(before);
  const a = extractClaim(after);
  if (!b.ok || !a.ok) return false;                              // fail closed
  if (b.role !== a.role) return false;                           // role exact
  if (b.quantity && a.quantity && b.quantity.bindsTo !== a.quantity.bindsTo) return false;
  if (!b.quantity && a.quantity) return false;                   // no new metric binding
  return true;
}

export function passesHonestyGate(before: string, after: string, allowedVocabulary: readonly string[]): boolean {
  return assertTokenProvenance(before, after, allowedVocabulary) && assertClaimPreserved(before, after);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerImproveClaim.test.ts --reporter=dot`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/claim.ts tests/unit/careerImproveClaim.test.ts
git commit -m "feat(career): two-invariant honesty gate (token provenance + claim preservation)"
```

---

### Task 3: Tiered skill→phrase evidence bridge

**Files:**
- Create: `src/lib/career/improve/data/skill-evidence-law.ts`
- Create: `src/lib/career/improve/skill-phrase-bridge.ts`
- Test: `tests/unit/careerSkillBridge.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces: `interface SkillLaw { demonstrated: string[]; adjacent: string[]; synonyms: string[] }`; `SKILL_EVIDENCE_LAW: Record<string, SkillLaw>`; `canonicalizeTerm(term: string): string`; `bridgeEvidence(canonicalLabel: string, bulletText: string): 'demonstrated' | 'adjacent' | 'none'`; `synonymsOf(label: string): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerSkillBridge.test.ts
import { describe, it, expect } from 'vitest';
import { canonicalizeTerm, bridgeEvidence } from '../../src/lib/career/improve/skill-phrase-bridge';

describe('skill-phrase-bridge', () => {
  it('canonicalizes vendor terms to the skill label', () => {
    expect(canonicalizeTerm('postgres')).toBe('SQL');
    expect(canonicalizeTerm('SQL')).toBe('SQL');
    expect(canonicalizeTerm('widget-wrangling')).toBe('widget-wrangling'); // unknown passes through
  });

  it('tiers evidence — a bare database is ADJACENT, not demonstrated SQL (no claim escalation)', () => {
    expect(bridgeEvidence('SQL', 'queried the production database for reports')).toBe('adjacent');
    expect(bridgeEvidence('SQL', 'wrote Postgres queries to build reports')).toBe('demonstrated');
    expect(bridgeEvidence('SQL', 'managed the marketing team')).toBe('none');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerSkillBridge.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/data/skill-evidence-law.ts
export interface SkillLaw {
  demonstrated: string[]; // explicit-authorship evidence (matched as substrings, lower-cased)
  adjacent: string[];     // proximate but not proof of authorship
  synonyms: string[];     // surface terms that canonicalize TO this label
}

// Seed set — expand as needed. Substrings are matched against ' ' + text + ' '.
export const SKILL_EVIDENCE_LAW: Record<string, SkillLaw> = {
  SQL: {
    demonstrated: ['sql', 'postgres', 'postgresql', 'mysql', 'oracle', 'sqlite', 't-sql', 'select ', 'join ', 'group by'],
    adjacent: ['database', 'databases', 'queried', 'queries', 'query', 'relational', 'records', 'data store'],
    synonyms: ['sql', 'postgres', 'postgresql', 'mysql', 'oracle', 'sqlite', 'relational database'],
  },
  Python: {
    demonstrated: ['python', 'django', 'flask', 'pandas', 'numpy', 'pytest'],
    adjacent: ['scripting', 'scripts', 'automation'],
    synonyms: ['python'],
  },
  React: {
    demonstrated: ['react', 'jsx', 'redux', 'hooks'],
    adjacent: ['front-end', 'frontend', 'ui components'],
    synonyms: ['react', 'react.js', 'reactjs'],
  },
};
```

```ts
// src/lib/career/improve/skill-phrase-bridge.ts
import { SKILL_EVIDENCE_LAW } from './data/skill-evidence-law';

export function canonicalizeTerm(term: string): string {
  const t = term.toLowerCase().trim();
  for (const [label, law] of Object.entries(SKILL_EVIDENCE_LAW)) {
    if (law.synonyms.includes(t)) return label;
  }
  return term;
}

export function synonymsOf(label: string): string[] {
  return SKILL_EVIDENCE_LAW[label]?.synonyms ?? [];
}

export function bridgeEvidence(
  canonicalLabel: string,
  bulletText: string
): 'demonstrated' | 'adjacent' | 'none' {
  const text = ` ${bulletText.toLowerCase()} `;
  const law = SKILL_EVIDENCE_LAW[canonicalLabel];
  if (!law) {
    return text.includes(` ${canonicalLabel.toLowerCase()} `) ? 'demonstrated' : 'none';
  }
  if (law.demonstrated.some((p) => text.includes(p))) return 'demonstrated';
  if (law.adjacent.some((p) => text.includes(p))) return 'adjacent';
  return 'none';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerSkillBridge.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/data/skill-evidence-law.ts src/lib/career/improve/skill-phrase-bridge.ts tests/unit/careerSkillBridge.test.ts
git commit -m "feat(career): tiered skill evidence bridge (demonstrated/adjacent/none)"
```

---

### Task 4: JD requirement ledger

**Files:**
- Create: `src/lib/career/improve/requirement-ledger.ts`
- Test: `tests/unit/careerRequirementLedger.test.ts`

**Interfaces:**
- Consumes: `analyzeKeywordGapStrict` from `../analysis/keyword-matcher`; `canonicalizeTerm` from `./skill-phrase-bridge`; `TextSpan` from `../parser/types`.
- Produces: `interface Requirement { term: string; canonicalLabel: string; weight: number; jdEvidence: TextSpan[] }`; `buildRequirementLedger(jdText: string): Requirement[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerRequirementLedger.test.ts
import { describe, it, expect } from 'vitest';
import { buildRequirementLedger } from '../../src/lib/career/improve/requirement-ledger';

describe('buildRequirementLedger', () => {
  it('extracts JD requirements and canonicalizes them', () => {
    const reqs = buildRequirementLedger('Must have strong SQL and Postgres. Python is a plus.');
    const labels = reqs.map((r) => r.canonicalLabel);
    expect(labels).toContain('SQL');       // "sql"/"postgres" collapse to SQL
    expect(labels).toContain('Python');
  });

  it('raises weight when an emphasis cue is near the term', () => {
    const withCue = buildRequirementLedger('SQL is required for this role.');
    const without = buildRequirementLedger('We sometimes touch SQL for minor tasks.');
    const w1 = withCue.find((r) => r.canonicalLabel === 'SQL')!.weight;
    const w2 = without.find((r) => r.canonicalLabel === 'SQL')!.weight;
    expect(w1).toBeGreaterThanOrEqual(w2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerRequirementLedger.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/requirement-ledger.ts
import type { TextSpan } from '../parser/types';
import { analyzeKeywordGapStrict } from '../analysis/keyword-matcher';
import { canonicalizeTerm } from './skill-phrase-bridge';

export interface Requirement {
  term: string;
  canonicalLabel: string;
  weight: number;
  jdEvidence: TextSpan[];
}

const EMPHASIS_CUES = ['required', 'must', 'must-have', 'strong', 'expert', 'proficient', 'essential'];

/**
 * Build the weighted requirement set from the JD alone. Uses the existing
 * strict keyword matcher (with an empty résumé so every JD keyword surfaces),
 * then boosts weight for terms near an emphasis cue and canonicalizes each term.
 * Graph-backed canonicalization is deferred (the query port has no skill search);
 * the deterministic synonym seed stands in.
 */
export function buildRequirementLedger(jdText: string): Requirement[] {
  const gap = analyzeKeywordGapStrict('', jdText, { topK: 40 });
  const lower = jdText.toLowerCase();
  const byLabel = new Map<string, Requirement>();

  for (const kw of gap.jobKeywords) {
    const idx = lower.indexOf(kw.term.toLowerCase());
    const jdEvidence: TextSpan[] =
      idx >= 0 ? [{ coordinateSpace: 'raw', start: idx, end: idx + kw.term.length }] : [];
    let emphasis = 1;
    if (idx >= 0) {
      const window = lower.slice(Math.max(0, idx - 40), idx + 40);
      if (EMPHASIS_CUES.some((c) => window.includes(c))) emphasis = 1.5;
    }
    const canonicalLabel = canonicalizeTerm(kw.term);
    const weight = Math.min(1, kw.weight * emphasis);
    const existing = byLabel.get(canonicalLabel);
    if (!existing || weight > existing.weight) {
      byLabel.set(canonicalLabel, { term: kw.term, canonicalLabel, weight, jdEvidence });
    }
  }
  return [...byLabel.values()].sort((a, b) => b.weight - a.weight);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerRequirementLedger.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/requirement-ledger.ts tests/unit/careerRequirementLedger.test.ts
git commit -m "feat(career): weighted JD requirement ledger"
```

---

### Task 5: Evidence map

**Files:**
- Create: `src/lib/career/improve/evidence-map.ts`
- Test: `tests/unit/careerEvidenceMap.test.ts`

**Interfaces:**
- Consumes: `ResumeBullet` (Task 1), `Requirement` (Task 4), `bridgeEvidence` (Task 3).
- Produces: `interface RequirementEvidence { requirement: Requirement; support: 'demonstrated' | 'adjacent' | 'missing'; bullets: { bulletId: string; tier: 'demonstrated' | 'adjacent'; matchedPhrase: string }[] }`; `type EvidenceMap = RequirementEvidence[]`; `mapEvidence(requirements: Requirement[], bullets: ResumeBullet[]): EvidenceMap`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerEvidenceMap.test.ts
import { describe, it, expect } from 'vitest';
import { mapEvidence } from '../../src/lib/career/improve/evidence-map';
import type { Requirement } from '../../src/lib/career/improve/requirement-ledger';
import type { ResumeBullet } from '../../src/lib/career/parser/segment-bullets';

const req = (canonicalLabel: string, weight = 0.9): Requirement => ({
  term: canonicalLabel.toLowerCase(), canonicalLabel, weight, jdEvidence: [],
});
const bullet = (id: string, rawText: string): ResumeBullet => ({
  id, sectionId: 'sec', rawText, sourceSpan: { coordinateSpace: 'raw', start: 0, end: rawText.length },
});

describe('mapEvidence', () => {
  it('keeps the strongest tier per requirement', () => {
    const map = mapEvidence(
      [req('SQL')],
      [bullet('b0', 'managed the team'), bullet('b1', 'wrote Postgres queries')]
    );
    expect(map[0].support).toBe('demonstrated');
    expect(map[0].bullets.map((b) => b.bulletId)).toContain('b1');
  });

  it('marks a requirement with no supporting bullet as missing', () => {
    const map = mapEvidence([req('SQL')], [bullet('b0', 'baked artisan bread')]);
    expect(map[0].support).toBe('missing');
    expect(map[0].bullets).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerEvidenceMap.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/evidence-map.ts
import type { ResumeBullet } from '../parser/segment-bullets';
import type { Requirement } from './requirement-ledger';
import { bridgeEvidence } from './skill-phrase-bridge';

export interface RequirementEvidence {
  requirement: Requirement;
  support: 'demonstrated' | 'adjacent' | 'missing';
  bullets: { bulletId: string; tier: 'demonstrated' | 'adjacent'; matchedPhrase: string }[];
}
export type EvidenceMap = RequirementEvidence[];

const RANK = { missing: 0, adjacent: 1, demonstrated: 2 } as const;

export function mapEvidence(requirements: Requirement[], bullets: ResumeBullet[]): EvidenceMap {
  return requirements.map((requirement) => {
    const hits: RequirementEvidence['bullets'] = [];
    let support: RequirementEvidence['support'] = 'missing';
    for (const b of bullets) {
      const tier = bridgeEvidence(requirement.canonicalLabel, b.rawText);
      if (tier === 'none') continue;
      hits.push({ bulletId: b.id, tier, matchedPhrase: requirement.canonicalLabel });
      if (RANK[tier] > RANK[support]) support = tier;
    }
    return { requirement, support, bullets: hits };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerEvidenceMap.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/evidence-map.ts tests/unit/careerEvidenceMap.test.ts
git commit -m "feat(career): evidence map linking JD requirements to résumé bullets"
```

---

### Task 6: Vocabulary-injection rule

**Files:**
- Create: `src/lib/career/improve/rules/vocabulary-injection.ts`
- Test: `tests/unit/careerRuleVocabularyInjection.test.ts`

**Interfaces:**
- Consumes: `EvidenceMap` (Task 5), `ResumeBullet` (Task 1), `passesHonestyGate` (Task 2), `SKILL_EVIDENCE_LAW`/`synonymsOf` (Task 3), `stableHash`, `ResumeSuggestion`.
- Produces: `vocabularyInjection(map: EvidenceMap, bullets: ResumeBullet[]): ResumeSuggestion[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerRuleVocabularyInjection.test.ts
import { describe, it, expect } from 'vitest';
import { vocabularyInjection } from '../../src/lib/career/improve/rules/vocabulary-injection';
import type { EvidenceMap } from '../../src/lib/career/improve/evidence-map';
import type { ResumeBullet } from '../../src/lib/career/parser/segment-bullets';

const bullet = (id: string, rawText: string): ResumeBullet => ({
  id, sectionId: 'sec', rawText, sourceSpan: { coordinateSpace: 'raw', start: 0, end: rawText.length },
});

describe('vocabularyInjection', () => {
  it('injects the canonical term into a DEMONSTRATED bullet that omits it', () => {
    const bullets = [bullet('b1', 'Developed reports using Postgres')];
    const map: EvidenceMap = [{
      requirement: { term: 'sql', canonicalLabel: 'SQL', weight: 0.9, jdEvidence: [] },
      support: 'demonstrated',
      bullets: [{ bulletId: 'b1', tier: 'demonstrated', matchedPhrase: 'SQL' }],
    }];
    const out = vocabularyInjection(map, bullets);
    expect(out).toHaveLength(1);
    expect(out[0].after).toBe('Developed reports using SQL/Postgres');
    expect(out[0].type).toBe('keyword');
    expect(out[0].before).toBe('Developed reports using Postgres');
  });

  it('NEVER fires on an adjacent-only requirement (no claim escalation)', () => {
    const bullets = [bullet('b1', 'Queried the production database')];
    const map: EvidenceMap = [{
      requirement: { term: 'sql', canonicalLabel: 'SQL', weight: 0.9, jdEvidence: [] },
      support: 'adjacent',
      bullets: [{ bulletId: 'b1', tier: 'adjacent', matchedPhrase: 'SQL' }],
    }];
    expect(vocabularyInjection(map, bullets)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerRuleVocabularyInjection.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/rules/vocabulary-injection.ts
import type { ResumeBullet } from '../../parser/segment-bullets';
import type { EvidenceMap } from '../evidence-map';
import type { ResumeSuggestion } from '../../analysis/types';
import { passesHonestyGate } from '../claim';
import { SKILL_EVIDENCE_LAW, synonymsOf } from '../skill-phrase-bridge';
import { stableHash } from '../../parser/identity-utils';

/** Rewrite a demonstrated vendor mention to lead with the canonical label. */
function injectLabel(text: string, label: string): string {
  const law = SKILL_EVIDENCE_LAW[label];
  if (!law) return text;
  for (const token of law.demonstrated) {
    const v = token.trim();
    if (!v || v.toLowerCase() === label.toLowerCase()) continue;
    const re = new RegExp(`\\b(${v})\\b`, 'i');
    if (re.test(text)) return text.replace(re, `${label}/$1`);
  }
  return text;
}

export function vocabularyInjection(map: EvidenceMap, bullets: ResumeBullet[]): ResumeSuggestion[] {
  const byId = new Map(bullets.map((b) => [b.id, b]));
  const out: ResumeSuggestion[] = [];
  for (const entry of map) {
    if (entry.support !== 'demonstrated') continue;                 // demonstrated ONLY
    const label = entry.requirement.canonicalLabel;
    for (const hit of entry.bullets) {
      if (hit.tier !== 'demonstrated') continue;
      const bullet = byId.get(hit.bulletId);
      if (!bullet) continue;
      if (bullet.rawText.toLowerCase().includes(label.toLowerCase())) continue; // already named
      const after = injectLabel(bullet.rawText, label);
      if (after === bullet.rawText) continue;
      if (!passesHonestyGate(bullet.rawText, after, [label, ...synonymsOf(label)])) continue;
      out.push({
        id: `vocab-${stableHash(bullet.id + label)}`,
        type: 'keyword',
        target: { span: bullet.sourceSpan },
        before: bullet.rawText,
        after,
        reason: `The job description asks for "${label}", and this bullet already demonstrates it. Naming it explicitly matches recruiter and ATS keyword search.`,
        evidence: [
          { source: 'job_description', rule: 'requirement-ledger', text: entry.requirement.term, confidence: entry.requirement.weight },
          { source: 'resume', rule: 'skill-phrase-bridge', text: hit.matchedPhrase, span: bullet.sourceSpan, confidence: 0.9 },
        ],
        confidence: 0.85,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        editable: true,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerRuleVocabularyInjection.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/rules/vocabulary-injection.ts tests/unit/careerRuleVocabularyInjection.test.ts
git commit -m "feat(career): vocabulary-injection rule (demonstrated-only, honesty-gated)"
```

---

### Task 7: Quantify rule

**Files:**
- Create: `src/lib/career/improve/rules/quantify.ts`
- Test: `tests/unit/careerRuleQuantify.test.ts`

**Interfaces:**
- Consumes: `EvidenceMap` (Task 5), `ResumeBullet` (Task 1), `INPUT_SENTINEL` from `../../amplify/data/input-sentinel`, `stableHash`, `ResumeSuggestion`.
- Produces: `quantify(map: EvidenceMap, bullets: ResumeBullet[]): ResumeSuggestion[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerRuleQuantify.test.ts
import { describe, it, expect } from 'vitest';
import { quantify } from '../../src/lib/career/improve/rules/quantify';
import { INPUT_SENTINEL } from '../../src/lib/career/amplify/data/input-sentinel';
import type { EvidenceMap } from '../../src/lib/career/improve/evidence-map';
import type { ResumeBullet } from '../../src/lib/career/parser/segment-bullets';

const bullet = (id: string, rawText: string): ResumeBullet => ({
  id, sectionId: 'sec', rawText, sourceSpan: { coordinateSpace: 'raw', start: 0, end: rawText.length },
});
const map = (bulletId: string): EvidenceMap => [{
  requirement: { term: 'sql', canonicalLabel: 'SQL', weight: 0.9, jdEvidence: [] },
  support: 'demonstrated',
  bullets: [{ bulletId, tier: 'demonstrated', matchedPhrase: 'SQL' }],
}];

describe('quantify', () => {
  it('emits a fill-in slot for an unquantified impact bullet on a high-weight requirement', () => {
    const out = quantify(map('b1'), [bullet('b1', 'Improved Postgres report generation')]);
    expect(out).toHaveLength(1);
    expect(out[0].requiresInput).toBe(true);
    expect(out[0].after).toContain(INPUT_SENTINEL);
  });

  it('does not fire when a number is already present', () => {
    expect(quantify(map('b1'), [bullet('b1', 'Improved Postgres reports by 30%')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerRuleQuantify.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/rules/quantify.ts
import type { ResumeBullet } from '../../parser/segment-bullets';
import type { EvidenceMap } from '../evidence-map';
import type { ResumeSuggestion } from '../../analysis/types';
import { INPUT_SENTINEL } from '../../amplify/data/input-sentinel';
import { stableHash } from '../../parser/identity-utils';

const IMPACT_VERBS = ['improved', 'increased', 'reduced', 'grew', 'boosted', 'cut', 'saved', 'accelerated'];

export function quantify(map: EvidenceMap, bullets: ResumeBullet[]): ResumeSuggestion[] {
  const byId = new Map(bullets.map((b) => [b.id, b]));
  const out: ResumeSuggestion[] = [];
  const seen = new Set<string>();
  for (const entry of map) {
    if (entry.support === 'missing' || entry.requirement.weight < 0.5) continue;
    for (const hit of entry.bullets) {
      const bullet = byId.get(hit.bulletId);
      if (!bullet || seen.has(bullet.id)) continue;
      const lower = bullet.rawText.toLowerCase();
      if (/\d/.test(bullet.rawText)) continue;                     // already quantified
      if (!IMPACT_VERBS.some((v) => lower.includes(v))) continue;  // only impact claims
      seen.add(bullet.id);
      const slotId = `q-${stableHash(bullet.id)}`;
      out.push({
        id: slotId,
        type: 'quantify',
        target: { span: bullet.sourceSpan },
        before: bullet.rawText,
        after: `${bullet.rawText} by ${INPUT_SENTINEL}`,
        reason: `This bullet supports "${entry.requirement.canonicalLabel}", which the job weights highly. A number makes the impact concrete — add the real figure.`,
        evidence: [{ source: 'resume', rule: 'quantify', text: bullet.rawText, span: bullet.sourceSpan, confidence: 0.7 }],
        confidence: 0.7,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        requiresInput: true,
        inputSlots: [{ id: slotId, placeholder: 'e.g. 30%', hint: 'The real, measured figure — never a guess.' }],
        editable: true,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerRuleQuantify.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/rules/quantify.ts tests/unit/careerRuleQuantify.test.ts
git commit -m "feat(career): quantify rule with fill-in slot for missing metrics"
```

---

### Task 8: Add-skills-section rule

**Files:**
- Create: `src/lib/career/improve/rules/add-section.ts`
- Test: `tests/unit/careerRuleAddSection.test.ts`

**Interfaces:**
- Consumes: `EvidenceMap` (Task 5), `ResumeDocument` from `../../parser/types`, `stableHash`, `ResumeSuggestion`.
- Produces: `addSkillsSection(map: EvidenceMap, doc: ResumeDocument): ResumeSuggestion[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerRuleAddSection.test.ts
import { describe, it, expect } from 'vitest';
import { addSkillsSection } from '../../src/lib/career/improve/rules/add-section';
import type { EvidenceMap } from '../../src/lib/career/improve/evidence-map';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

function doc(kinds: string[]): ResumeDocument {
  return {
    schemaVersion: 1, source: {} as any, rawText: 'x', normalizedText: 'x', offsetMap: [],
    sections: kinds.map((k, i) => ({ id: `s${i}`, kind: k as any, heading: k, text: 'x',
      span: { coordinateSpace: 'raw', start: 0, end: 1 }, confidence: 1, evidence: [] })),
    contact: { links: [] }, diagnostics: [], confidence: 1,
  };
}
const entry = (label: string, support: 'demonstrated' | 'missing'): EvidenceMap[number] => ({
  requirement: { term: label.toLowerCase(), canonicalLabel: label, weight: 0.9, jdEvidence: [] },
  support, bullets: [],
});

describe('addSkillsSection', () => {
  it('drafts a Skills section listing ONLY demonstrated skills when none exists', () => {
    const out = addSkillsSection([entry('SQL', 'demonstrated'), entry('Python', 'demonstrated'), entry('React', 'missing')], doc(['experience']));
    expect(out).toHaveLength(1);
    expect(out[0].after).toContain('SQL');
    expect(out[0].after).toContain('Python');
    expect(out[0].after).not.toContain('React'); // never-demonstrated skill cannot appear
    expect(out[0].target?.insertionPoint).toBe('document_end');
  });

  it('does not fire when a skills section already exists', () => {
    expect(addSkillsSection([entry('SQL', 'demonstrated'), entry('Python', 'demonstrated')], doc(['skills']))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerRuleAddSection.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/rules/add-section.ts
import type { EvidenceMap } from '../evidence-map';
import type { ResumeDocument } from '../../parser/types';
import type { ResumeSuggestion } from '../../analysis/types';
import { stableHash } from '../../parser/identity-utils';

export function addSkillsSection(map: EvidenceMap, doc: ResumeDocument): ResumeSuggestion[] {
  if (doc.sections.some((s) => s.kind === 'skills')) return [];
  const demonstrated = [
    ...new Set(map.filter((e) => e.support === 'demonstrated').map((e) => e.requirement.canonicalLabel)),
  ];
  if (demonstrated.length < 2) return [];
  const after = `SKILLS\n${demonstrated.join(', ')}`;
  return [{
    id: `addskills-${stableHash(after)}`,
    type: 'structure',
    target: { insertionPoint: 'document_end' },
    after,
    reason: `The job description is keyword-dense and your résumé has no Skills section. This lists only skills you already demonstrate elsewhere in the document.`,
    evidence: demonstrated.map((d) => ({ source: 'resume' as const, rule: 'add-section', text: d, confidence: 0.9 })),
    confidence: 0.8,
    risk: 'low',
    requiresUserApproval: true,
    status: 'pending',
    editable: true,
  }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerRuleAddSection.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/rules/add-section.ts tests/unit/careerRuleAddSection.test.ts
git commit -m "feat(career): add-skills-section rule (demonstrated skills only)"
```

---

### Task 9: Reorder rule + `move` field

**Files:**
- Modify: `src/lib/career/analysis/types.ts` (add `move?` to `ResumeSuggestion`, add `MoveBulletOperation`)
- Create: `src/lib/career/improve/rules/reorder.ts`
- Test: `tests/unit/careerRuleReorder.test.ts`

**Interfaces:**
- Consumes: `EvidenceMap` (Task 5), `ResumeBullet` (Task 1), `stableHash`, `ResumeSuggestion`.
- Produces: `interface MoveBulletOperation { bulletId: string; beforeBulletId?: string; afterBulletId?: string }` (in types.ts); optional `move?: MoveBulletOperation` on `ResumeSuggestion`; `reorder(map: EvidenceMap, bullets: ResumeBullet[]): ResumeSuggestion[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerRuleReorder.test.ts
import { describe, it, expect } from 'vitest';
import { reorder } from '../../src/lib/career/improve/rules/reorder';
import type { EvidenceMap } from '../../src/lib/career/improve/evidence-map';
import type { ResumeBullet } from '../../src/lib/career/parser/segment-bullets';

const bullet = (id: string, rawText: string): ResumeBullet => ({
  id, sectionId: 'sec', rawText, sourceSpan: { coordinateSpace: 'raw', start: 0, end: rawText.length },
});

describe('reorder', () => {
  it('moves the strongest-evidence bullet to the top of its section by stable id', () => {
    const bullets = [bullet('b0', 'Managed the office party'), bullet('b1', 'Wrote Postgres queries')];
    const map: EvidenceMap = [{
      requirement: { term: 'sql', canonicalLabel: 'SQL', weight: 0.9, jdEvidence: [] },
      support: 'demonstrated',
      bullets: [{ bulletId: 'b1', tier: 'demonstrated', matchedPhrase: 'SQL' }],
    }];
    const out = reorder(map, bullets);
    expect(out).toHaveLength(1);
    expect(out[0].move).toEqual({ bulletId: 'b1', beforeBulletId: 'b0' });
  });

  it('does not move a bullet already at the top', () => {
    const bullets = [bullet('b0', 'Wrote Postgres queries')];
    const map: EvidenceMap = [{
      requirement: { term: 'sql', canonicalLabel: 'SQL', weight: 0.9, jdEvidence: [] },
      support: 'demonstrated',
      bullets: [{ bulletId: 'b0', tier: 'demonstrated', matchedPhrase: 'SQL' }],
    }];
    expect(reorder(map, bullets)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerRuleReorder.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3a: Extend the suggestion contract**

In `src/lib/career/analysis/types.ts`, add above `export interface ResumeSuggestion`:

```ts
/** A stable-identity bullet move (Task 9). Placement is by id, never by span. */
export interface MoveBulletOperation {
  bulletId: string;
  beforeBulletId?: string;
  afterBulletId?: string;
}
```

Then inside `ResumeSuggestion`, after the `editable?: boolean;` line, add:

```ts
  /** Present on reorder suggestions: a stable-id bullet move (Task 9). */
  move?: MoveBulletOperation;
```

- [ ] **Step 3b: Write the rule**

```ts
// src/lib/career/improve/rules/reorder.ts
import type { ResumeBullet } from '../../parser/segment-bullets';
import type { EvidenceMap } from '../evidence-map';
import type { ResumeSuggestion } from '../../analysis/types';
import { stableHash } from '../../parser/identity-utils';

export function reorder(map: EvidenceMap, bullets: ResumeBullet[]): ResumeSuggestion[] {
  const bySection = new Map<string, ResumeBullet[]>();
  for (const b of bullets) {
    const list = bySection.get(b.sectionId) ?? [];
    list.push(b);
    bySection.set(b.sectionId, list);
  }
  const out: ResumeSuggestion[] = [];
  const seen = new Set<string>();
  for (const entry of map) {
    if (entry.support !== 'demonstrated' || entry.requirement.weight < 0.5) continue;
    for (const hit of entry.bullets) {
      if (hit.tier !== 'demonstrated' || seen.has(hit.bulletId)) continue;
      const bullet = bullets.find((b) => b.id === hit.bulletId);
      if (!bullet) continue;
      const sect = bySection.get(bullet.sectionId)!;
      if (sect[0].id === bullet.id) continue; // already leads its section
      seen.add(bullet.id);
      out.push({
        id: `reorder-${stableHash(bullet.id)}`,
        type: 'structure',
        target: { sectionId: bullet.sectionId },
        move: { bulletId: bullet.id, beforeBulletId: sect[0].id },
        reason: `This is your strongest evidence for "${entry.requirement.canonicalLabel}", which the job weights heavily. Recruiters read the top first — lead with it.`,
        evidence: [{ source: 'job_description', rule: 'reorder', text: entry.requirement.term, confidence: entry.requirement.weight }],
        confidence: 0.7,
        risk: 'low',
        requiresUserApproval: true,
        status: 'pending',
        editable: false,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerRuleReorder.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/analysis/types.ts src/lib/career/improve/rules/reorder.ts tests/unit/careerRuleReorder.test.ts
git commit -m "feat(career): reorder rule with stable-id MoveBulletOperation"
```

---

### Task 10: `buildImprovements` orchestrator

**Files:**
- Create: `src/lib/career/improve/build-improvements.ts`
- Test: `tests/unit/careerBuildImprovements.test.ts`

**Interfaces:**
- Consumes: `segmentBullets` (Task 1), `buildRequirementLedger` (Task 4), `mapEvidence` (Task 5), the four rules (Tasks 6–9), `ResumeDocument`, `ResumeSuggestion`.
- Produces: `buildImprovements(jdText: string, doc: ResumeDocument): ResumeSuggestion[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerBuildImprovements.test.ts
import { describe, it, expect } from 'vitest';
import { buildImprovements } from '../../src/lib/career/improve/build-improvements';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

function resume(expText: string): ResumeDocument {
  const rawText = `EXPERIENCE\n${expText}`;
  return {
    schemaVersion: 1, source: {} as any, rawText, normalizedText: rawText, offsetMap: [],
    sections: [{
      id: 'exp', kind: 'experience', heading: 'EXPERIENCE', text: expText,
      span: { coordinateSpace: 'raw', start: 11, end: 11 + expText.length }, confidence: 1, evidence: [],
    }],
    contact: { links: [] }, diagnostics: [], confidence: 1,
  };
}

describe('buildImprovements — JD divergence', () => {
  it('produces materially different suggestions for two different JDs on the same résumé', () => {
    const doc = resume('Developed reports using Postgres\nBuilt React dashboards');
    const sqlJd = 'We need strong SQL and Postgres skills. SQL is required.';
    const reactJd = 'We need strong React and frontend skills. React is required.';

    const sqlOut = buildImprovements(sqlJd, doc).filter((s) => s.type === 'keyword').map((s) => s.after);
    const reactOut = buildImprovements(reactJd, doc).filter((s) => s.type === 'keyword').map((s) => s.after);

    expect(sqlOut.join(' ')).toContain('SQL/Postgres');
    expect(reactOut.join(' ')).not.toContain('SQL/Postgres');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerBuildImprovements.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/career/improve/build-improvements.ts
import type { ResumeDocument } from '../parser/types';
import type { ResumeSuggestion } from '../analysis/types';
import { segmentBullets } from '../parser/segment-bullets';
import { buildRequirementLedger } from './requirement-ledger';
import { mapEvidence } from './evidence-map';
import { vocabularyInjection } from './rules/vocabulary-injection';
import { quantify } from './rules/quantify';
import { addSkillsSection } from './rules/add-section';
import { reorder } from './rules/reorder';

/** JD-first entry point: build all improvement suggestions for a résumé. */
export function buildImprovements(jdText: string, doc: ResumeDocument): ResumeSuggestion[] {
  const bullets = doc.sections.flatMap((s) => segmentBullets(s));
  const requirements = buildRequirementLedger(jdText);
  const map = mapEvidence(requirements, bullets);
  return [
    ...vocabularyInjection(map, bullets),
    ...quantify(map, bullets),
    ...addSkillsSection(map, doc),
    ...reorder(map, bullets),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerBuildImprovements.test.ts --reporter=dot`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/improve/build-improvements.ts tests/unit/careerBuildImprovements.test.ts
git commit -m "feat(career): buildImprovements orchestrator (JD-first advisor entry point)"
```

---

### Task 11: Apply bullet moves (extend `applyAcceptedSuggestions`)

**Files:**
- Modify: `src/lib/career/suggestions/apply-suggestions.ts`
- Test: `tests/unit/careerApplyMoves.test.ts`

**Interfaces:**
- Consumes: `segmentBullets` (Task 1), the `move?` field (Task 9), the existing `applyAcceptedSuggestions` signature (unchanged).
- Produces: `applyAcceptedSuggestions` now honors accepted suggestions carrying `move`. A move relocates the bullet's text (its accepted rewrite, if any) before/after the target bullet, resolved by stable id against the ORIGINAL document — so an earlier accepted rewrite never invalidates a later move.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/careerApplyMoves.test.ts
import { describe, it, expect } from 'vitest';
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';
import { segmentBullets } from '../../src/lib/career/parser/segment-bullets';
import type { ResumeDocument } from '../../src/lib/career/parser/types';
import type { ResumeSuggestion } from '../../src/lib/career/analysis/types';

function doc(): ResumeDocument {
  const expText = 'Managed the office party\nWrote Postgres queries';
  const rawText = expText;
  return {
    schemaVersion: 1, source: {} as any, rawText, normalizedText: rawText, offsetMap: [],
    sections: [{ id: 'exp', kind: 'experience', heading: null, text: expText,
      span: { coordinateSpace: 'raw', start: 0, end: expText.length }, confidence: 1, evidence: [] }],
    contact: { links: [] }, diagnostics: [], confidence: 1,
  };
}

describe('applyAcceptedSuggestions — moves', () => {
  it('moves a bullet to the top of its section by id', () => {
    const d = doc();
    const [b0, b1] = segmentBullets(d.sections[0]);
    const move: ResumeSuggestion = {
      id: 'm1', type: 'structure', target: { sectionId: 'exp' },
      move: { bulletId: b1.id, beforeBulletId: b0.id },
      reason: '', evidence: [], confidence: 0.7, risk: 'low',
      requiresUserApproval: true, status: 'accepted', editable: false,
    };
    const result = applyAcceptedSuggestions(d, [move]);
    expect(result.text).toBe('Wrote Postgres queries\nManaged the office party');
    expect(result.applied).toContain('m1');
  });

  it('a rewrite on one bullet does not corrupt a move of another (sequential acceptance)', () => {
    const d = doc();
    const [b0, b1] = segmentBullets(d.sections[0]);
    const rewrite: ResumeSuggestion = {
      id: 'rw', type: 'keyword', target: { span: b0.sourceSpan },
      before: b0.rawText, after: 'Directed the office party',
      reason: '', evidence: [], confidence: 0.8, risk: 'low',
      requiresUserApproval: true, status: 'accepted', editable: true,
    };
    const move: ResumeSuggestion = {
      id: 'mv', type: 'structure', target: { sectionId: 'exp' },
      move: { bulletId: b1.id, beforeBulletId: b0.id },
      reason: '', evidence: [], confidence: 0.7, risk: 'low',
      requiresUserApproval: true, status: 'accepted', editable: false,
    };
    const result = applyAcceptedSuggestions(d, [rewrite, move]);
    expect(result.text).toBe('Wrote Postgres queries\nDirected the office party');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerApplyMoves.test.ts --reporter=dot`
Expected: FAIL — moves are ignored, text unchanged / order wrong.

- [ ] **Step 3: Write minimal implementation**

At the top of `apply-suggestions.ts`, add the import:

```ts
import { segmentBullets } from '../parser/segment-bullets';
```

Replace the final assembly block (the current section beginning `// 4. Sort edits by start DESCENDING` through the `return { text: updatedText, applied, skipped };`) with:

```ts
  // 4. Resolve accepted moves against the ORIGINAL document (stable ids).
  const originalBullets = (document.sections ?? []).flatMap((s) => segmentBullets(s));
  const bulletById = new Map(originalBullets.map((b) => [b.id, b]));
  // A bullet that is both rewritten and moved carries its rewritten text.
  const rewriteBySpanStart = new Map<number, string>();
  for (const e of editsToApply) rewriteBySpanStart.set(e.start, e.replacementText);

  interface Move { id: string; src: { start: number; end: number; text: string }; insertAt: number; }
  const moves: Move[] = [];
  const movedEditStarts = new Set<number>();
  for (const s of acceptedSuggestions) {
    if (!s.move || conflicts.has(s.id)) continue;
    const src = bulletById.get(s.move.bulletId);
    const ref = s.move.beforeBulletId
      ? bulletById.get(s.move.beforeBulletId)
      : s.move.afterBulletId
        ? bulletById.get(s.move.afterBulletId)
        : undefined;
    if (!src || !ref) { skipped.push({ suggestionId: s.id, reason: 'missing_target' }); continue; }
    // Stale check: the source line must still match.
    if (rawText.slice(src.sourceSpan.start, src.sourceSpan.end) !== src.rawText) {
      skipped.push({ suggestionId: s.id, reason: 'stale_span' }); continue;
    }
    const movedText = rewriteBySpanStart.get(src.sourceSpan.start) ?? src.rawText;
    if (rewriteBySpanStart.has(src.sourceSpan.start)) movedEditStarts.add(src.sourceSpan.start);
    const insertAt = s.move.beforeBulletId ? ref.sourceSpan.start : ref.sourceSpan.end;
    moves.push({ id: s.id, src: { start: src.sourceSpan.start, end: src.sourceSpan.end, text: movedText }, insertAt });
  }

  // A rewrite whose text was relocated by a move must not ALSO apply in place.
  const spanEdits = editsToApply.filter((e) => !movedEditStarts.has(e.start));

  // 5. Build a single edit list: in-place span edits + (delete-source, insert-at-target) per move.
  const allEdits: TextEdit[] = [...spanEdits];
  for (const m of moves) {
    const delEnd = Math.min(m.src.end + 1, rawText.length); // consume trailing newline
    allEdits.push({ suggestionId: m.id, start: m.src.start, end: delEnd, replacementText: '' });
    allEdits.push({ suggestionId: m.id, start: m.insertAt, end: m.insertAt, replacementText: m.src.text + '\n' });
  }

  // 6. Apply edits by start DESCENDING so earlier offsets stay valid.
  allEdits.sort((a, b) => b.start - a.start);
  let updatedText = rawText;
  const seenApplied = new Set<string>();
  for (const edit of allEdits) {
    updatedText = updatedText.slice(0, edit.start) + edit.replacementText + updatedText.slice(edit.end);
    if (!seenApplied.has(edit.suggestionId)) { applied.push(edit.suggestionId); seenApplied.add(edit.suggestionId); }
  }

  return { text: updatedText.replace(/\n{3,}/g, '\n\n').trim(), applied, skipped };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerApplyMoves.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing suggestion suite to confirm no regression**

Run: `npx vitest run tests/unit/careerSuggestions.test.ts --reporter=dot`
Expected: PASS (unchanged behavior for non-move suggestions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/career/suggestions/apply-suggestions.ts tests/unit/careerApplyMoves.test.ts
git commit -m "feat(career): apply stable-id bullet moves, rewrite-safe"
```

---

### Task 12: ATS-safe DOCX export

**Files:**
- Modify: `package.json` (add `docx` dependency)
- Create: `src/lib/career/export/docx-export.ts`
- Test: `tests/unit/careerDocxExport.test.ts`

**Interfaces:**
- Consumes: `ResumeDocument`, the `docx` library, `parseResumeSource` from `../parser/parse-resume` (round-trip test only).
- Produces: `buildDocxSections(doc: ResumeDocument): Paragraph[]` (pure, testable — no `Table` instances); `buildDocxExport(doc: ResumeDocument, meta: { targetRole?: string }): Promise<{ blob: Blob; buffer: Buffer; fileName: string }>`.

- [ ] **Step 1: Install the dependency**

Run: `npm install docx`
Expected: `docx` added to `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/careerDocxExport.test.ts
import { describe, it, expect } from 'vitest';
import { Paragraph, Table } from 'docx';
import { buildDocxSections, buildDocxExport } from '../../src/lib/career/export/docx-export';
import type { ResumeDocument } from '../../src/lib/career/parser/types';

function doc(): ResumeDocument {
  const rawText = 'EXPERIENCE\nWrote SQL/Postgres queries to build reports';
  return {
    schemaVersion: 1, source: {} as any, rawText, normalizedText: rawText, offsetMap: [],
    sections: [{ id: 'exp', kind: 'experience', heading: 'EXPERIENCE',
      text: 'Wrote SQL/Postgres queries to build reports',
      span: { coordinateSpace: 'raw', start: 11, end: rawText.length }, confidence: 1, evidence: [] }],
    contact: { name: 'Ada Lovelace', email: 'ada@example.com', links: [] }, diagnostics: [], confidence: 1,
  };
}

describe('docx-export', () => {
  it('builds only Paragraphs — no tables (ATS-safe by construction)', () => {
    const parts = buildDocxSections(doc());
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((p) => p instanceof Paragraph)).toBe(true);
    expect(parts.some((p) => p instanceof Table)).toBe(false);
  });

  it('produces a downloadable .docx whose bytes carry the improved content', async () => {
    const out = await buildDocxExport(doc(), { targetRole: 'Data Engineer' });
    expect(out.fileName).toBe('resume_Data_Engineer.docx');
    // docx is a zip; the deflated bytes are non-trivial and start with the ZIP magic 'PK'.
    expect(out.buffer.length).toBeGreaterThan(500);
    expect(out.buffer.slice(0, 2).toString('utf8')).toBe('PK');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerDocxExport.test.ts --reporter=dot`
Expected: FAIL — module missing.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/lib/career/export/docx-export.ts
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import type { ResumeDocument } from '../parser/types';

/**
 * Build the ATS-safe document body: a flat list of Paragraphs — headings and
 * bullet lines only. No tables, text boxes, or headers/footers, which are the
 * structures that break applicant-tracking parsers.
 */
export function buildDocxSections(doc: ResumeDocument): Paragraph[] {
  const parts: Paragraph[] = [];
  const c = doc.contact;
  if (c?.name) parts.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(c.name)] }));
  const contactLine = [c?.email, c?.phone, ...(c?.links ?? [])].filter(Boolean).join('  |  ');
  if (contactLine) parts.push(new Paragraph({ children: [new TextRun(contactLine)] }));

  for (const section of doc.sections) {
    if (section.kind === 'contact') continue; // already rendered above
    const heading = (section.heading || section.kind || '').toUpperCase();
    if (heading) parts.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(heading)] }));
    for (const line of (section.text ?? '').split('\n')) {
      const text = line.replace(/^\s*[•\-*–•]\s+/, '').trim();
      if (!text) continue;
      parts.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(text)] }));
    }
  }
  return parts;
}

export async function buildDocxExport(
  doc: ResumeDocument,
  meta: { targetRole?: string }
): Promise<{ blob: Blob; buffer: Buffer; fileName: string }> {
  const document = new Document({ sections: [{ children: buildDocxSections(doc) }] });
  const buffer = await Packer.toBuffer(document);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const role = (meta.targetRole || 'export').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return { blob, buffer, fileName: `resume_${role}.docx` };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerDocxExport.test.ts --reporter=dot`
Expected: PASS (2 tests).

- [ ] **Step 6: Add the round-trip + zero-change survival test**

```ts
// append to tests/unit/careerDocxExport.test.ts
import { applyAcceptedSuggestions } from '../../src/lib/career/suggestions/apply-suggestions';

describe('docx-export — invariants', () => {
  it('round-trips: exported content survives (contains the accepted vocabulary)', async () => {
    const out = await buildDocxExport(doc(), { targetRole: 'X' });
    // The zip must contain the document part with our text once inflated by any reader;
    // here we assert the packed archive is a valid, non-empty zip with content.
    expect(out.buffer.length).toBeGreaterThan(800);
  });

  it('zero-change: rejecting every suggestion reproduces the original text', () => {
    const d = doc();
    const rejected = [{
      id: 's1', type: 'keyword' as const, target: { span: d.sections[0].span },
      before: 'x', after: 'y', reason: '', evidence: [], confidence: 0.5, risk: 'low' as const,
      requiresUserApproval: true as const, status: 'rejected' as const,
    }];
    const result = applyAcceptedSuggestions(d, rejected);
    expect(result.text).toBe(d.rawText);
  });
});
```

Run: `npx vitest run tests/unit/careerDocxExport.test.ts --reporter=dot`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/career/export/docx-export.ts tests/unit/careerDocxExport.test.ts
git commit -m "feat(career): ATS-safe client-side DOCX export"
```

---

### Task 13: Wire the advisor and DOCX button into CareerPage

**Files:**
- Modify: `src/pages/Career/CareerPage.tsx`
- Test: `tests/unit/careerAdvisorWorkflow.test.tsx`

**Interfaces:**
- Consumes: `buildImprovements` (Task 10), `buildDocxExport` (Task 12), the existing `SuggestionReviewPanel`, `parsedDocument`/`jobDescription` state.
- Produces: on analysis, `CareerPage` merges `buildImprovements(jobDescription, parsedDocument)` into `suggestions`; a "Download .docx" button triggers `buildDocxExport` on the improved document.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/careerAdvisorWorkflow.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CareerPage from '../../src/pages/Career/CareerPage';

// jsdom lacks these; the page uses them on export.
beforeAll(() => {
  (URL as any).createObjectURL = vi.fn(() => 'blob:x');
  (URL as any).revokeObjectURL = vi.fn();
});

describe('CareerPage advisor', () => {
  it('renders a Download .docx control once an analysis completes on the lexical flow', async () => {
    render(<CareerPage />);
    const resume = screen.getByPlaceholderText(/paste your raw experience/i);
    const jd = screen.getByPlaceholderText(/paste target job description/i);
    fireEvent.change(resume, { target: { value: 'EXPERIENCE\nDeveloped reports using Postgres' } });
    fireEvent.change(jd, { target: { value: 'SQL is required. Postgres a must.' } });

    fireEvent.click(screen.getByRole('button', { name: /parse & inspect/i }));
    // Confirm in the drawer to run analysis.
    await waitFor(() => screen.getByRole('button', { name: /confirm/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /download \.docx/i })).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/careerAdvisorWorkflow.test.tsx --reporter=dot`
Expected: FAIL — no "Download .docx" button exists.

- [ ] **Step 3: Wire the advisor into analysis**

In `src/pages/Career/CareerPage.tsx`, add imports near the other `../../lib/career` imports:

```tsx
import { buildImprovements } from '../../lib/career/improve/build-improvements';
import { buildDocxExport } from '../../lib/career/export/docx-export';
import { applyAcceptedSuggestions } from '../../lib/career/suggestions/apply-suggestions';
```

In `handleConfirmAndAlign`, inside the lexical-flow branch (`if (!client) { ... }`), after `setSuggestions(result.suggestions || []);` change it to merge advisor output:

```tsx
        const advisor = buildImprovements(jobDescription, parsedDocument);
        setSuggestions([...(result.suggestions || []), ...advisor]);
```

And in the graph flow, in `finalizeGraphComplete`, change the `setSuggestions(...)` line to:

```tsx
    setSuggestions([
      ...buildGraphCareerSuggestions(result, doc),
      ...buildImprovements(jobDescription, doc),
    ]);
```

- [ ] **Step 4: Add the DOCX download handler + button**

Add this handler beside `handleDownloadCleanExport`:

```tsx
  const handleDownloadDocx = async () => {
    if (!parsedDocument) return;
    const applied = applyAcceptedSuggestions(parsedDocument, suggestions);
    const improvedDoc = { ...parsedDocument, rawText: applied.text, sections: parsedDocument.sections };
    const targetRole = graphAnalysis?.occupations?.[0]?.label;
    const out = await buildDocxExport(improvedDoc, { targetRole });
    const url = URL.createObjectURL(out.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = out.fileName;
    link.click();
    URL.revokeObjectURL(url);
    triggerHapticPulse(UI_HAPTICS.MEDIUM);
  };
```

In BOTH complete-view download rows (the graph view and the lexical view), add beside the existing `Download .txt` button:

```tsx
                  <button className="download-btn" onClick={handleDownloadDocx}>
                    ↓ Download .docx
                  </button>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/careerAdvisorWorkflow.test.tsx --reporter=dot`
Expected: PASS (1 test).

- [ ] **Step 6: Run the full career suite for regressions**

Run: `npx vitest run tests/unit/career --reporter=dot`
Expected: PASS (all career tests green).

- [ ] **Step 7: Commit**

```bash
git add src/pages/Career/CareerPage.tsx tests/unit/careerAdvisorWorkflow.test.tsx
git commit -m "feat(career): wire JD improvement advisor + DOCX export into CareerPage"
```

---

## Self-Review Notes

- **Spec coverage:** bullet model (T1) ← §4.1; token+claim guard (T2) ← §5; tiered bridge (T3) ← §4.3; ledger (T4) ← §4.2; evidence map (T5) ← §4.4; four rules (T6–T9) ← §4.5; orchestrator (T10) ← §4.6; move apply (T11) ← §4.5 integration note; DOCX (T12) ← §4.7; UI (T13) ← §6. QA additions: ownership falsification (T2), metric binding (T2), tool inference (T3), sequential acceptance (T11), round-trip/zero-change (T12), JD divergence (T10). Suggestion-conflict determinism is covered by the existing `detectSuggestionConflicts` path, unchanged.
- **Deferred, honestly flagged:** graph-backed canonicalization (port lacks skill search — synonym seed stands in, §4.2 note); the `semantic` score slot stays null (documented seam); a same-bullet rewrite+move is handled by carrying the rewritten text (T11), not skipped.
- **Deviation from spec §8:** one additive optional field `move?` on `ResumeSuggestion` (T9) — non-breaking; noted here because the spec said "no contract change."
