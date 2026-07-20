# CODEx Song Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Read-page CODEx Metrics heuristic ledger with a Song Stats panel backed by a greenfield `song-stats` engine (CODEx Rhyme Density + Malmi baseline, CODEx Lexical Diversity, estimated/aligned Flow, Technical Density composite).

**Architecture:** Pure compute under `codex/core/song-stats/` consumes `AnalyzedDocument` (+ optional alignment/beatGrid). `SongStatsPanel` replaces `HeuristicScorePanel` in the Read Metrics slot only. Combat scoring and AnalysisPanel stay untouched.

**Tech Stack:** JavaScript (ESM), Vitest, React + Framer Motion (match existing panel patterns), existing `PhonemeEngine` / word `phonetics.phonemes`, `stemWord` from `analysis.pipeline.js`, ARPAbet helpers from `rhyme-astrology/signatures.js`.

**Spec:** `docs/superpowers/specs/2026-07-18-codex-song-stats-design.md`

## Global Constraints

- Framing: literature-informed **CODEx-native** metrics — never attribute \(L^2\) to Malmi or lemma-TTR to Daniels’ catalogue study.
- `engineVersion`: `song-stats-v1`; bump `calibrationVersion` when ceilings/weights change (start `cal-2026-07-18`).
- Composite `label: 'technical_density'`; UI: `Technical Density: {C} · {band}` + tooltip denying artistic quality claims.
- Rhyme: \(RD_M=\sum L/N\), \(RD_C=\sum L^2/N\); stress does not break vowel-identity match; `maxRhymeSpanWords: 1`; count identical-token matches but expose `repetitionContribution`.
- Vocab: \(V=100\times(\#unique\ lemmas)/N\); short-sample warning when \(8\le N<32\).
- Flow: never blend partial alignment; eligibility thresholds required for `aligned`; estimated uses source lines only (90 BPM, 4 beats/line); syncopation ≠ `gridDeviationMs`.
- Short text: \(N<8\) empty; \(8\le N<32\) pillars + `provisional`; `provisional` also when Flow estimated.
- Stale guard: show last-good only when `sourceFingerprint` matches.
- Do not change combat heuristics or AnalysisPanel ledger.

## File Structure

| Path | Responsibility |
|------|----------------|
| `codex/core/song-stats/constants.js` | Windows, ceilings, weights, version strings, eligibility thresholds |
| `codex/core/song-stats/types.js` | JSDoc typedefs for Diagnostic, SongStatPillar, SongStatsResult |
| `codex/core/song-stats/fingerprint.js` | Stable `sourceFingerprint` from inputs |
| `codex/core/song-stats/rhymeDensity.js` | \(RD_M\), \(RD_C\), secondaries |
| `codex/core/song-stats/uniqueVocabulary.js` | Lexical diversity pillar |
| `codex/core/song-stats/flowAlignment.js` | Estimated + aligned flow |
| `codex/core/song-stats/composite.js` | Technical Density + bands + provisional |
| `codex/core/song-stats/index.js` | `computeSongStats(doc, options)` |
| `src/components/SongStatsPanel.jsx` | UI |
| `src/components/SongStatsPanel.css` | Styles (adapt from HeuristicScorePanel palette) |
| `src/pages/Read/ReadPage.jsx` | Wire panel + compute hookup |
| `tests/unit/song-stats/*.test.js` | Unit coverage |
| `tests/components/SongStatsPanel.test.jsx` | Component smoke |

---

### Task 1: Constants, types, fingerprint, empty-state engine shell

**Files:**
- Create: `codex/core/song-stats/constants.js`
- Create: `codex/core/song-stats/types.js`
- Create: `codex/core/song-stats/fingerprint.js`
- Create: `codex/core/song-stats/index.js`
- Test: `tests/unit/song-stats/computeSongStats.empty.test.js`

**Interfaces:**
- Consumes: `AnalyzedDocument` (`allWords`, `lines`, `raw`)
- Produces: `computeSongStats(doc, options?) → SongStatsResult` (empty/short path only in this task)

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest';
import { computeSongStats } from '../../../codex/core/song-stats/index.js';

describe('computeSongStats empty / short', () => {
  it('returns null composite and need_more_lyrics when N < 8', () => {
    const doc = {
      raw: 'one two three',
      lines: [{ text: 'one two three', number: 0, words: [] }],
      allWords: ['one', 'two', 'three'].map((text, i) => ({
        text,
        normalized: text,
        start: i * 4,
        end: i * 4 + text.length,
        phonetics: { phonemes: ['AH0'] },
      })),
      stats: {},
    };
    const result = computeSongStats(doc);
    expect(result.wordCount).toBe(3);
    expect(result.composite.total0to100).toBeNull();
    expect(result.composite.label).toBe('technical_density');
    expect(result.meta.engineVersion).toBe('song-stats-v1');
    expect(result.pillars.rhymeDensity.diagnostics.some((d) => d.code === 'need_more_lyrics')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/song-stats/computeSongStats.empty.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement constants, fingerprint, empty shell**

`constants.js` — export:
`ENGINE_VERSION = 'song-stats-v1'`, `CALIBRATION_VERSION = 'cal-2026-07-18'`, `DEFAULT_RHYME_WINDOW = 24`, `MAX_RHYME_SPAN_WORDS = 1`, `RD_C_CEILING = 2`, `VOCAB_CEILING = 60`, `SPS_CEILING = 8`, `FLOW_SPS_WEIGHT = 0.55`, `FLOW_SYNC_WEIGHT = 0.45`, `WEIGHTS = { rhymeDensity: 0.4, uniqueVocabulary: 0.35, flowAlignment: 0.25 }`, `MIN_WORDS_FOR_STATS = 8`, `MIN_WORDS_FOR_STABLE_COMPOSITE = 32`, `DEFAULT_BPM = 90`, `DEFAULT_BEATS_PER_LINE = 4`, `ALIGNMENT_COVERAGE_MIN = 0.85`, `BEAT_GRID_COVERAGE_MIN = 0.95`.

`fingerprint.js` — `buildSourceFingerprint({ raw, rhymeWindow, alignmentId, beatGridId })` → stable hash string (simple FNV-1a or crypto-free djb2 over JSON of those fields).

`index.js` — `computeSongStats` counts words from `doc.allWords`; if \(N < 8\), return full result shape with zeroed pillars, `need_more_lyrics` diagnostic (severity `warning`), composite null, fingerprint set. Stub pillar builders as placeholders returning zeros (replaced in later tasks).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/song-stats/computeSongStats.empty.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codex/core/song-stats tests/unit/song-stats/computeSongStats.empty.test.js
git commit -m "feat(song-stats): add engine shell and short-text empty state"
```

---

### Task 2: Rhyme density (\(RD_M\) / \(RD_C\))

**Files:**
- Create: `codex/core/song-stats/rhymeDensity.js`
- Modify: `codex/core/song-stats/index.js`
- Test: `tests/unit/song-stats/rhymeDensity.test.js`

**Interfaces:**
- Consumes: words with `phonetics.phonemes` or `deepPhonetics`; `stripStress` / `isVowelPhoneme` from `codex/core/rhyme-astrology/signatures.js`
- Produces: `computeRhymeDensity(words, { rhymeWindow }) → SongStatPillar` with `value = RD_C`, secondary `{ malmiDensity, longestChain, phonemeCoverage, repetitionContribution }`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import { computeRhymeDensity, longestVowelMatchLength } from '../../../codex/core/song-stats/rhymeDensity.js';

describe('rhymeDensity', () => {
  it('matches vowel identity ignoring stress (AH0 vs AH1)', () => {
    expect(longestVowelMatchLength(['AH0', 'IY0'], ['AH1', 'IY1'])).toBe(2);
  });

  it('separates Malmi linear RD_M from CODEx squared RD_C', () => {
    // Craft words where L sequence is [0,1,2] → ΣL=3, ΣL²=0+1+4=5, N=3
    const words = [
      { normalized: 'a', phonetics: { phonemes: ['EY1'] } },
      { normalized: 'day', phonetics: { phonemes: ['D', 'EY1'] } }, // L=1 vs a
      { normalized: 'maybe', phonetics: { phonemes: ['M', 'EY1', 'B', 'IY0'] } }, // L≥1
    ];
    const pillar = computeRhymeDensity(words, { rhymeWindow: 24 });
    expect(pillar.value).toBeCloseTo(pillar.secondary.malmiDensity, 5); // may differ once L>1
    // Force known L by unit-testing scoring helper if needed:
    // expect RD_C !== RD_M when any L >= 2
  });

  it('exposes repetitionContribution for identical tokens', () => {
    const death = { normalized: 'death', phonetics: { phonemes: ['D', 'EH1', 'TH'] } };
    const pillar = computeRhymeDensity([death, death, death, death, death], { rhymeWindow: 24 });
    expect(pillar.secondary.repetitionContribution).toBeGreaterThan(0);
  });
});
```

Add an assertion that when max \(L\ge 2\), `value` (\(RD_C\)) `>` `secondary.malmiDensity` (\(RD_M\)).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/song-stats/rhymeDensity.test.js`  
Expected: FAIL

- [ ] **Step 3: Implement `rhymeDensity.js`**

Algorithm:
1. For each word extract vowel-identity sequence: phonemes where `isVowelPhoneme`, map via `stripStress`.
2. Keep stressed forms only for diagnostics (optional).
3. For index `i`, scan `j` in `[max(0,i-window), i)`:
   - Compute longest common **suffix or contiguous vowel-sequence match** used by Raplyzer-style: longest matching vowel subsequence from the end (or full sequence equality prefix/suffix — implement as longest matching trailing vowel chain / full sequence overlap: longest \(k\) such that last \(k\) vowels of A equal last \(k\) of B, or longest common vowel sequence length between the two arrays — **v1: longest common contiguous vowel subsequence length by comparing sequences as arrays for max equal suffix length**, which is standard for rhyme).
4. Prefer **max equal suffix length** of vowel-identity arrays (rhyme-oriented).
5. Identical `normalized` tokens: still score; accumulate `repetitionLSum` / `totalLSum` → `repetitionContribution`.
6. \(RD_M = \sum L / N\), \(RD_C = \sum L^2 / N\).
7. `normalized01 = clamp(RD_C / RD_C_CEILING)`.
8. `coverage01 = phonemeCoverage`.
9. `fidelity: 'exact'`.
10. If `repetitionContribution > 0.5`, push diagnostic `rhyme_repetition_heavy` severity `info`.

Wire into `computeSongStats` for \(N \ge 8\).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/unit/song-stats/rhymeDensity.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codex/core/song-stats/rhymeDensity.js codex/core/song-stats/index.js tests/unit/song-stats/rhymeDensity.test.js
git commit -m "feat(song-stats): add Malmi RD_M and CODEx RD_C rhyme density"
```

---

### Task 3: Lexical diversity

**Files:**
- Create: `codex/core/song-stats/uniqueVocabulary.js`
- Modify: `codex/core/song-stats/index.js`
- Test: `tests/unit/song-stats/uniqueVocabulary.test.js`

**Interfaces:**
- Consumes: `stemWord` from `codex/core/analysis.pipeline.js`
- Produces: `computeUniqueVocabulary(words) → SongStatPillar` with `value = V`, unit `/100w`, secondary `{ uniqueLemmaCount, surfaceTypeCount, tokenCount }`

- [ ] **Step 1: Write the failing test**

```js
import { describe, expect, it } from 'vitest';
import { computeUniqueVocabulary } from '../../../codex/core/song-stats/uniqueVocabulary.js';

describe('uniqueVocabulary', () => {
  it('computes unique lemmas per 100 words and surface type count', () => {
    const words = ['walk', 'walks', 'walking', 'run', 'ran'].map((text) => ({
      text,
      normalized: text,
    }));
    const pillar = computeUniqueVocabulary(words);
    expect(pillar.unit).toBe('/100w');
    expect(pillar.secondary.tokenCount).toBe(5);
    expect(pillar.secondary.surfaceTypeCount).toBe(5);
    expect(pillar.secondary.uniqueLemmaCount).toBeLessThanOrEqual(5);
    expect(pillar.value).toBeCloseTo((pillar.secondary.uniqueLemmaCount / 5) * 100, 5);
  });

  it('emits vocabulary_sample_small for N in [8, 32)', () => {
    const words = Array.from({ length: 10 }, (_, i) => ({
      text: `word${i}`,
      normalized: `word${i}`,
    }));
    const pillar = computeUniqueVocabulary(words);
    expect(pillar.diagnostics.some((d) => d.code === 'vocabulary_sample_small')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run tests/unit/song-stats/uniqueVocabulary.test.js`

- [ ] **Step 3: Implement** — normalize tokens (≥2 chars), lemma via `stemWord`, \(V = uniqueLemmas/N*100\), `normalized01 = clamp(V/60)`, fidelity `exact`, short-sample diagnostic when `8 <= N < 32`.

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit** — `feat(song-stats): add CODEx song-level lexical diversity`

---

### Task 4: Estimated flow

**Files:**
- Create: `codex/core/song-stats/flowAlignment.js`
- Modify: `codex/core/song-stats/index.js`
- Test: `tests/unit/song-stats/flowAlignment.estimated.test.js`

**Interfaces:**
- Consumes: `doc.lines`, word syllable counts / vowel counts; options `{ bpm, beatsPerLine }`
- Produces: Flow pillar with `fidelity: 'estimated'`, `value = SPS`, secondary `{ stressDisplacementProxy, estimatedDurationSec }`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import { computeFlowAlignment } from '../../../codex/core/song-stats/flowAlignment.js';

describe('flowAlignment estimated', () => {
  it('ignores blank lines and section headings for duration', () => {
    const doc = {
      lines: [
        { text: 'Verse 1', number: 0, words: [] }, // heading pattern
        { text: 'hello world from cadence', number: 1, words: [
          { text: 'hello', normalized: 'hello', syllableCount: 2, phonetics: { phonemes: ['HH','AH0','L','OW1'] }, stressPattern: '01' },
          { text: 'world', normalized: 'world', syllableCount: 1, phonetics: { phonemes: ['W','ER1','L','D'] }, stressPattern: '1' },
          { text: 'from', normalized: 'from', syllableCount: 1, phonetics: { phonemes: ['F','R','AH1','M'] }, stressPattern: '1' },
          { text: 'cadence', normalized: 'cadence', syllableCount: 2, phonetics: { phonemes: ['K','EY1','D','AH0','N','S'] }, stressPattern: '10' },
        ]},
        { text: '', number: 2, words: [] },
        { text: 'another solid lyric line here', number: 3, words: [
          // 5 words × ~1 syl — keep simple
          { text: 'another', normalized: 'another', syllableCount: 3, phonetics: { phonemes: ['AH0','N','AH1','DH','ER0'] }, stressPattern: '010' },
          { text: 'solid', normalized: 'solid', syllableCount: 2, phonetics: { phonemes: ['S','AA1','L','AH0','D'] }, stressPattern: '10' },
          { text: 'lyric', normalized: 'lyric', syllableCount: 2, phonetics: { phonemes: ['L','IH1','R','IH0','K'] }, stressPattern: '10' },
          { text: 'line', normalized: 'line', syllableCount: 1, phonetics: { phonemes: ['L','AY1','N'] }, stressPattern: '1' },
          { text: 'here', normalized: 'here', syllableCount: 1, phonetics: { phonemes: ['HH','IY1','R'] }, stressPattern: '1' },
        ]},
      ],
      allWords: [],
    };
    // Flatten words into allWords in test setup for syllable sum
    doc.allWords = doc.lines.flatMap((l) => l.words);
    const pillar = computeFlowAlignment(doc, { alignment: null, beatGrid: null });
    expect(pillar.fidelity).toBe('estimated');
    expect(pillar.secondary.estimatedDurationSec).toBeCloseTo(2 * 4 * 60 / 90, 5); // 2 lyric bars
    expect(pillar.secondary.stressDisplacementProxy).toBeTypeOf('number');
    expect(pillar.diagnostics.some((d) => d.code === 'estimated_one_bar_per_line')).toBe(true);
  });

  it('does not treat DOM wrap — only source lines matter', () => {
    // Same words one long line vs two lines → different estimatedDurationSec
    // assert durations differ when line breaks differ
  });
});
```

Section heading heuristic v1: line matches `/^(verse|chorus|bridge|intro|outro|hook|section)\b/i` or `^[A-Z][A-Za-z0-9 ]{0,24}$` with no lowercase letters and wordCount ≤ 3 — document chosen rule in code comment; tests use `Verse 1`.

- [ ] **Step 2: Run fail**

- [ ] **Step 3: Implement estimated path**  
  - Count lyric bars = nonempty non-heading lines  
  - \(t_{est} = bars * beatsPerLine * 60 / bpm\)  
  - \(S\) = sum syllableCount (fallback: vowel phoneme count)  
  - SPS = S / t_est  
  - `stressDisplacementProxy`: for each primary-stressed syllable, measure offset from even subdivision within the line; normalize to 0–1  
  - `normalized01 = 0.55 * clamp(SPS/8) + 0.45 * proxy`  
  - Always emit `estimated_one_bar_per_line` info diagnostic in estimated mode  
  - Low confidence when bars < 2 → `estimated_flow_low_confidence`

- [ ] **Step 4: Pass + commit** — `feat(song-stats): add estimated flow with bar-per-line duration`

---

### Task 5: Aligned flow + eligibility

**Files:**
- Modify: `codex/core/song-stats/flowAlignment.js`
- Test: `tests/unit/song-stats/flowAlignment.aligned.test.js`

**Interfaces:**
- Consumes: `alignment` `{ words: [{ startSec, endSec, text }], coverage01 }`, `beatGrid` `{ timesSec: number[], coverage01 }`
- Produces: `fidelity: 'aligned'` only when all eligibility checks pass; secondary includes `syncopationIndex`, `gridDeviationMs`, `pocketBiasMs`, `pocketConsistencyMs`

- [ ] **Step 1: Write failing tests**

```js
it('falls back to estimated when alignmentCoverage01 < 0.85', () => {
  const pillar = computeFlowAlignment(doc, {
    alignment: { coverage01: 0.5, words: [...], activeDurationSeconds: 10, timestampsMonotonic: true },
    beatGrid: { coverage01: 1, timesSec: [...] },
  });
  expect(pillar.fidelity).toBe('estimated');
  expect(pillar.diagnostics.some((d) => d.code === 'alignment_incomplete')).toBe(true);
});

it('computes syncopationIndex separately from gridDeviationMs', () => {
  // eligible alignment fixture → fidelity aligned
  // expect secondary.syncopationIndex and secondary.gridDeviationMs both present
  // expect no stressDisplacementProxy key
});
```

- [ ] **Step 2: Fail → implement eligibility + Sync formula + median deviation**  
  - No blending: if ineligible, call estimated path entirely and append `alignment_incomplete`  
  - Sync as in spec; `gridDeviationMs = median(|t_i - nearest|)*1000`  
  - `pocketBiasMs` = median signed (t_i - nearest)*1000; `pocketConsistencyMs` = MAD or stdev of absolute deviations in ms  

- [ ] **Step 3: Pass + commit** — `feat(song-stats): add aligned flow with syncopation vs deviation split`

---

### Task 6: Composite (Technical Density) + provisional + fingerprint wiring

**Files:**
- Create: `codex/core/song-stats/composite.js`
- Modify: `codex/core/song-stats/index.js`
- Test: `tests/unit/song-stats/composite.test.js`

**Interfaces:**
- Produces: `buildComposite(pillars, { wordCount, flowFidelity }) → composite object`

- [ ] **Step 1: Failing tests**

```js
it('labels composite technical_density and marks provisional for N < 32', () => {
  // 10-word doc with phonemes → provisional true, total0to100 number
});

it('marks provisional when flow is estimated even if N >= 32', () => {
  // mock pillars
});

it('is deterministic for identical inputs', () => {
  const a = computeSongStats(doc);
  const b = computeSongStats(doc);
  expect(a).toEqual(b);
  expect(a.meta.sourceFingerprint).toBe(b.meta.sourceFingerprint);
});
```

- [ ] **Step 2–4: Implement \(C = 100*(0.4 RD_n + 0.35 V_n + 0.25 F_n)\), bands, provisional rule; wire fingerprint of `{ raw, rhymeWindow, alignmentFingerprint, beatGridFingerprint }`**

- [ ] **Step 5: Commit** — `feat(song-stats): add Technical Density composite and provisional rules`

---

### Task 7: SongStatsPanel UI

**Files:**
- Create: `src/components/SongStatsPanel.jsx`
- Create: `src/components/SongStatsPanel.css`
- Test: `tests/components/SongStatsPanel.test.jsx`

**Interfaces:**
- Consumes: `stats: SongStatsResult`, `visible`, `isEmbedded`, `onClose`
- Produces: React panel (no `scoreData.traces`)

- [ ] **Step 1: Component test** — render with fixture `SongStatsResult`; expect text `Technical Density`, `CODEx Rhyme Density`, `Malmi baseline`, `CODEx Lexical Diversity`, `Syncopation proxy` when estimated; expect no `Phoneme Density` / heuristic rank list.

- [ ] **Step 2: Implement panel** — header seal + tooltip; three cards; footer with versions/weights; reuse brass/dark tokens from `HeuristicScorePanel.css` as starting point; Framer Motion bars optional.

- [ ] **Step 3: Pass + commit** — `feat(ui): add SongStatsPanel for CODEx Metrics`

---

### Task 8: Wire Read page + stale-result guard

**Files:**
- Modify: `src/pages/Read/ReadPage.jsx` (all `HeuristicScorePanel` Metrics usages → `SongStatsPanel`)
- Create: `src/hooks/useSongStats.js` (compute from deepAnalysis document + optional alignment; keep lastGood with fingerprint guard)
- Test: `tests/hooks/useSongStats.test.js` (or unit test the guard pure function in `song-stats/staleGuard.js`)

**Interfaces:**
- Consumes: analyzed doc from existing deep analysis path (`deepAnalysis` / document field — inspect ReadPage for actual shape; prefer `deepAnalysis.document` or rebuild via `analyzeText` if only `scoreData` exists)
- Produces: `songStats` state for panel

**Important discovery step (do first in this task):** Grep ReadPage / panel analysis client for where `AnalyzedDocument` lives. If only `scoreData` is available client-side, either:
1. Have server attach `songStats` on analysis response, or  
2. Re-analyze client-side from scroll content via existing analysis entrypoint.

Prefer attaching `songStats` on the server analysis payload if document already exists server-side (`panelAnalysis.service.js`) — add field without removing `scoreData` (combat/power can keep using `scoreData.totalScore` until a later slice). Metrics **panel** must show Song Stats only.

- [ ] **Step 1: Decide wire path (server attach vs client compute) based on code inspection; implement the thinner path that has AnalyzedDocument.**

- [ ] **Step 2: Stale guard**

```js
export function resolveSongStatsDisplay({ computeFailed, lastGood, currentFingerprint, nextResult }) {
  if (!computeFailed) return nextResult;
  if (lastGood?.meta?.sourceFingerprint === currentFingerprint) return lastGood;
  return null; // empty → panel shows stats_compute_failed
}
```

- [ ] **Step 3: Replace Metrics slot UI; keep Power badge using `scoreData.totalScore` for now (out of scope to redefine Power).**

- [ ] **Step 4: Manual sanity — open Read, toggle CODEx Metrics, confirm three cards + Technical Density.**

- [ ] **Step 5: Commit** — `feat(read): wire CODEx Metrics to Song Stats engine`

---

### Task 9: QA checklist regression suite

**Files:**
- Create: `tests/unit/song-stats/qa.checklist.test.js`

- [ ] **Step 1: Encode remaining checklist items as tests** (Malmi vs squared, stress ignore, OOV coverage drop, heading/blank line duration, no chimera blend, eight-word provisional, deterministic).

- [ ] **Step 2: Run** `npx vitest run tests/unit/song-stats`  
Expected: all PASS

- [ ] **Step 3: Commit** — `test(song-stats): lock methodology QA checklist`

---

## Self-Review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| RD_M vs RD_C + Malmi secondary | Task 2 |
| Lexical diversity naming + secondaries + short warning | Task 3 |
| Syncopation ≠ deviation; proxy estimated | Tasks 4–5 |
| Technical Density label/tooltip | Tasks 6–7 |
| Contract fields (confidence, coverage, versions, fingerprint, provisional, assumptions) | Tasks 1, 6 |
| Rhyme stress/variants/repetition/span=1 | Task 2 |
| Estimated duration model + diagnostics | Task 4 |
| Alignment eligibility, no blend | Task 5 |
| Short-text 8 / 32 provisional | Tasks 1, 6 |
| Stale fingerprint guard | Task 8 |
| Panel replace Metrics slot | Tasks 7–8 |
| Combat untouched | Global + Task 8 |

**Gaps closed in plan:** pronunciation variant order documented in Task 2 implementation notes (use word phonetics already on AnalyzedDocument as authoritative; no re-pick by map order). Phrase rhyme deferred via `maxRhymeSpanWords: 1`.
