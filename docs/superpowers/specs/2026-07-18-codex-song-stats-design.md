# CODEx Song Stats Panel — Design Spec

**Date:** 2026-07-18  
**Status:** Draft for review (revision 2 — methodology corrections)  
**Surface:** Read page → CODEx Metrics tool slot  
**Approach:** Greenfield `songStats` engine + new panel UI (full replace of heuristic ledger in that slot)

## Framing

This feature is **not** “three famous methodologies copied into CODEx.” It is:

> Three literature-informed foundations, transformed into **explicit CODEx-native song metrics**.

Every number must remain intellectually traceable to its source formula without false academic attribution.

## Problem

CODEx Metrics (`HeuristicScorePanel`) currently shows a weighted “scholastic heuristic ledger” (~10 bars). That presentation is hard to interpret as song craft and does not surface clear, auditable song-science metrics.

## Goal

Replace CODEx Metrics content with a **Song Stats** panel:

1. **CODEx Rhyme Density** — weighted (\(L^2\)) vowel-sequence density, with Malmi linear baseline as secondary  
2. **CODEx song-level lexical diversity** — unique lemmas per 100 words (inspired by fixed-sample vocabulary comparisons; not Daniels’ surface-form catalogue method)  
3. **Flow Alignment** — SPS + true syncopation (aligned) or stress-displacement proxy (estimated); timing deviation kept separate  

Plus a **Technical Density** composite (not “song quality”).

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Old heuristic ledger in CODEx Metrics | **Full replace** |
| Flow without audio | **Estimated** from text; fidelity labeled; upgrade only when alignment eligibility passes |
| Vocabulary at song scope | Unique lemmas / 100 words as **CODEx lexical diversity** |
| Headline number | Three stats + **Technical Density** composite |
| Composite weights | RD 40% · Vocab 35% · Flow 25% |
| Architecture | Greenfield `songStats`; combat / AnalysisPanel / Visualiser unchanged |

## Non-goals

- Changing combat scoring engines  
- Changing AnalysisPanel literary / heuristic commentary  
- Rewiring Visualiser `songScore` charts  
- Full spaCy/NLTK production lemmatization (lightweight lemma/stem OK for v1)  
- Full Parncutt model beyond the v1 syncopation contract below  
- Claiming composite = artistic quality, emotional impact, or song effectiveness  
- Attributing squared density to Malmi, or lemma-TTR to Daniels’ catalogue study  
- Blending partial alignment with estimated timing in v1  

## Architecture

```
lyrics / AnalyzedDocument (+ optional alignment, beatGrid)
        │
        ▼
┌───────────────────────────┐
│  songStats.engine         │
├───────────────────────────┤
│ rhymeDensity              │
│ uniqueVocabulary          │
│ flowAlignment             │
│ composite (technical_density)
└───────────────────────────┘
        │
        ▼
   SongStatsPanel  (CODEx Metrics slot)
```

### Module placement

- `codex/core/song-stats/` — pure compute  
- `src/components/SongStatsPanel.jsx` (+ CSS)  
- Read wiring: replace `HeuristicScorePanel` in the Metrics slot  

### Result contract

```ts
type Diagnostic = {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
};

type SongStatPillar = {
  id: 'rhyme_density' | 'unique_vocabulary' | 'flow_alignment';
  value: number;
  unit: string;
  secondary?: Record<string, number | string>;
  normalized01: number;
  /**
   * exact = deterministically calculated from supplied text,
   * not guaranteed linguistically infallible.
   */
  fidelity: 'exact' | 'estimated' | 'aligned';
  confidence01: number;
  coverage01: number;
  diagnostics: Diagnostic[];
};

type SongStatsResult = {
  wordCount: number;
  pillars: {
    rhymeDensity: SongStatPillar;
    uniqueVocabulary: SongStatPillar;
    flowAlignment: SongStatPillar;
  };
  composite: {
    label: 'technical_density';
    total0to100: number | null;
    band: 'Godlike' | 'Master' | 'Adept' | 'Neophyte' | null;
    provisional: boolean;
    weights: {
      rhymeDensity: 0.40;
      uniqueVocabulary: 0.35;
      flowAlignment: 0.25;
    };
  };
  meta: {
    engineVersion: 'song-stats-v1';
    calibrationVersion: string;
    sourceFingerprint: string;
    rhymeWindow: number;
    fidelitySummary: 'estimated' | 'aligned';
    assumptions: {
      estimatedBpm: number;
      beatsPerLine: number;
      lineRepresentsBar: boolean;
    };
  };
};
```

| Field | Risk reduced |
|-------|----------------|
| `confidence01` | Distinguishes successful computation from trustworthy computation |
| `coverage01` | Exposes G2P or alignment coverage |
| `engineVersion` | Prevents silent algorithm drift |
| `calibrationVersion` | Makes ceiling tuning reproducible |
| `sourceFingerprint` | Prevents stale results appearing current |
| `provisional` | Marks composites from weak samples or estimated flow |
| `assumptions` | Makes text-derived Flow auditable |

## Formulas

### 1. Rhyme Density — Malmi baseline vs CODEx weighted

Pipeline: `Text → G2P → Vowel Isolation → Sliding-Window → densities`

For each word \(w\), let \(L(w)\) = longest matching **vowel-identity** sequence length vs any preceding word in the window (default **24**, range 16–32).

**Malmi / DopeLearning baseline (linear)** — published measure averages longest nearby match length; reported song scores ~0.9–1.5 use this form:

\[
RD_M = \frac{\sum_w L(w)}{N}
\]

**CODEx weighted density (squared)** — CODEx-native multisyllabic emphasis; **not** attributed to Malmi:

\[
RD_C = \frac{\sum_w L(w)^2}{N}
\]

**Display**

- Headline: **CODEx Rhyme Density**  
- Value: \(RD_C\)  
- Secondary line: **Malmi baseline: {malmiDensity}**  

**Pillar `secondary`:**

```ts
{
  malmiDensity: number;      // RD_M
  longestChain: number;      // max L(w) in song
  phonemeCoverage: number;   // fraction of words with usable G2P
  repetitionContribution: number; // share of ΣL from identical-token matches
}
```

**Composite normalize:** \(RD_n = \mathrm{clamp}(RD_C / 2.0,\ 0..1)\).  
**Coverage:** `coverage01 = phonemeCoverage`.  
**Fidelity:** `exact` (deterministic from text+G2P; not linguistically infallible).

#### Rhyme matching contracts (required)

**Stress handling (v1)**  
- Vowel **identity** controls sequence matching.  
- Stress marks are retained for diagnostics but **do not break** a match.  
- Otherwise `AH0` and `AH1` would be unrelated despite shared vowel identity.

**Pronunciation variants (deterministic, pick first available in order)**  
1. Context-selected pronunciation when available  
2. Existing CODEx authoritative pronunciation  
3. First CMU pronunciation variant  
4. OOV fallback (\(L = 0\) for that word)  

Never select variants by filesystem or insertion order.

**Repeated identical tokens**  
Identical-token matches **are counted** (honest density), but must not be silent:

- Expose `repetitionContribution` in secondary  
- Diagnostic when contribution is high, e.g. `rhyme_repetition_heavy`

**Cross-word / phrase rhymes**  
v1 is **word-level** only:

```ts
maxRhymeSpanWords: 1
```

Describe as **word-level vowel-sequence density**, not complete multisyllabic phrase-rhyme detection. Phrase spans (2–3) are a later upgrade.

### 2. Unique Vocabulary — CODEx song-level lexical diversity

Matt Daniels counted **distinct surface forms** (e.g. pimp / pimps / pimping / pimpin as separate), using the first 35,000 tokens for catalogue comparisons. That is **not** this metric.

**CODEx formula (still useful):**

\[
V = \frac{\#\ \text{unique lemmas}}{N} \times 100
\]

Note: \(V = 100 \times TTR_{\text{lemma}}\) — somewhat sensitive to song length; a 100-word verse and a 900-word song do not have equal opportunity to avoid reuse.

**Documentation lineage (allowed):**  
Inspired by fixed-sample vocabulary comparisons such as Matt Daniels’ hip-hop vocabulary study, adapted for song-scale analysis.

**UI label:** **CODEx Lexical Diversity** (not “Daniels unique vocabulary”).

**Pillar `secondary`:**

```ts
{
  uniqueLemmaCount: number;
  surfaceTypeCount: number;
  tokenCount: number;
}
```

**Composite normalize:** \(V_n = \mathrm{clamp}(V / 60,\ 0..1)\).  
**Lemmatizer miss:** fall back to normalized surface token as lemma.  
**Short-sample diagnostic** (when \(8 \le N < 32\), severity `warning`):

```ts
{
  code: 'vocabulary_sample_small',
  message: 'Vocabulary diversity may be inflated by the short sample.',
  severity: 'warning',
}
```

**Fidelity:** `exact`.

### 3. Flow Alignment — syncopation ≠ grid deviation

#### Alignment eligibility (all must pass for `aligned`)

```ts
alignmentCoverage01 >= 0.85
beatGridCoverage01 >= 0.95
timestampsMonotonic === true
activeDurationSeconds > 0
```

If any fails: `fidelity = 'estimated'`, diagnostic `alignment_incomplete`.  
**Do not blend** partial aligned data with estimated data in v1.

#### Estimated mode (`fidelity: 'estimated'`)

Text cannot establish true onset timing or silence at a stronger beat.

**Duration model (deterministic):**

- Nonempty lyric line = one bar (`lineRepresentsBar: true`)  
- Section headings excluded  
- Blank lines do not add duration  
- DOM wrapping never changes line count (use source line breaks only)  
- \(t_{est} = \text{bars} \times \text{beatsPerLine} \times 60 / \text{BPM}\)  
- Defaults: **90 BPM**, **4 beats/line**  

**SPS:** \(S / t_{est}\)  
**Proxy (not syncopation):** `stressDisplacementProxy` — stress placement vs even line subdivision grid  

**UI may render:** `Syncopation proxy: 0.61`  
**Secondary must include** estimated duration (seconds) so reformatting source lines is auditable.

**Diagnostics (as applicable):**

- `estimated_one_bar_per_line`  
- `line_structure_irregular`  
- `estimated_flow_low_confidence`  

#### Aligned mode (`fidelity: 'aligned'`)

**True syncopation (v1):**

\[
Sync = \frac{\sum_i stress_i \cdot weakness_i \cdot displaced_i}{\sum_i stress_i}
\]

Where:

- \(stress_i\) = syllable stress weight  
- \(weakness_i = 1 - metricalStrength_i\)  
- \(displaced_i = 1\) when the next stronger metrical position lacks an onset within the tolerance window  

**Timing deviation (separate — not labeled syncopation):**

\[
Deviation = \mathrm{median}(\lvert t_i - t_{\text{nearest subdivision}}\rvert)
\]

**Aligned `secondary`:**

```ts
{
  syncopationIndex: number;
  gridDeviationMs: number;      // Deviation in ms
  pocketBiasMs: number;
  pocketConsistencyMs: number;
}
```

**Estimated `secondary`:**

```ts
{
  stressDisplacementProxy: number;
  estimatedDurationSec: number;
  gridDeviationMs?: never; // omit; do not fake
}
```

**Display:** primary **SPS** (`value`); syncopation **or** proxy in secondary; fidelity chip.  
**Pillar normalize:** \(F_n = 0.55 \cdot SPS_n + 0.45 \cdot SyncOrProxy_n\) with \(SPS_n = \mathrm{clamp}(SPS / 8.0,\ 0..1)\).  
Note: faster delivery raises Technical Density by design — that is why the composite is **not** “song quality.”

**meta.fidelitySummary:** mirrors Flow fidelity.

### 4. Composite = Technical Density

\[
C = 100 \times (0.40\,RD_n + 0.35\,V_n + 0.25\,F_n)
\]

**Internal label:** `technical_density`  
**UI wording:** `Technical Density: 82 · Master`  
**Tooltip:**  
> Measures technical concentration, not artistic quality, emotional impact, or song effectiveness.

Rewards rhyme mass, less lexical repetition, faster delivery, and more stress displacement / syncopation — **not** general song quality. A controlled 4 SPS performance cannot outscore an equally syncopated 8 SPS performance on Flow’s contribution; that is intentional for this seal.

**Bands:**

| Band | Range |
|------|-------|
| Godlike | ≥ 90 |
| Master | ≥ 75 |
| Adept | ≥ 60 |
| Neophyte | < 60 |

`band` is `null` when `total0to100` is `null`.

### Short-text policy

```ts
const MIN_WORDS_FOR_STATS = 8;
const MIN_WORDS_FOR_STABLE_COMPOSITE = 32;
```

| Word count | Behavior |
|------------|----------|
| \(N < 8\) | Empty state; pillars “—”; `composite.total0to100 = null`; `need_more_lyrics` |
| \(8 \le N < 32\) | Pillars render; `composite.provisional = true`; vocab short-sample warning as applicable |
| \(N \ge 32\) | Normal result; `provisional = false` unless Flow is `estimated` (still mark provisional when Flow estimated) |

**Provisional rule:** `provisional = true` if \(N < 32\) **or** Flow `fidelity === 'estimated'`.

## UI

**Chrome:** Tool name **CODEx Metrics**; subtitle **Song Stats**.

**Layout:**

1. **Header** — `Technical Density: {C} · {band}` (or “—”); provisional badge when set; tooltip as above; fidelity note when Flow estimated  
2. **Three stat cards:**  
   - **CODEx Rhyme Density** — \(RD_C\); secondary Malmi baseline  
   - **CODEx Lexical Diversity** — \(V\) `/100w`; secondary lemma/surface/token counts  
   - **Flow** — SPS; syncopation index **or** syncopation proxy; fidelity chip; never label grid deviation as syncopation  
3. **Footer** — word count · window · weights 40/35/25 · engine/calibration versions · top diagnostic  

**Removed:** genre profile; old heuristic list.

**Embedded:** Compact Technical Density + three minis; expand for full cards.

**A11y:** `aria-label="CODEx Song Stats"`.

## Data flow

1. `computeSongStats(doc, { alignment?, beatGrid?, rhymeWindow? })` → `SongStatsResult` with `sourceFingerprint` of inputs.  
2. `SongStatsPanel` renders result.  
3. Alignment passed only when eligibility thresholds pass → Flow `aligned`; else full `estimated` path.

## Error handling

| Case | Behavior |
|------|----------|
| \(N < 8\) | Empty + `need_more_lyrics` |
| G2P OOV | \(L=0\); lowers `phonemeCoverage` / `coverage01` |
| Lemmatizer miss | Normalized token as lemma |
| Alignment incomplete | Full estimated path; `alignment_incomplete` |
| Compute throw | Identity-guarded last-good only |

**Stale-result guard:**

```ts
if (computeFailed) {
  if (lastGood?.sourceFingerprint === currentSourceFingerprint) {
    show(lastGood);
  } else {
    showEmptyState('stats_compute_failed');
  }
}
```

Never show an old result against newly edited lyrics without a visible stale/error state.

## Testing / QA checklist

- [ ] Malmi baseline uses \(L\), not \(L^2\)  
- [ ] CODEx weighted density uses \(L^2\)  
- [ ] Repeated identical words cannot silently inflate RD (expose `repetitionContribution`)  
- [ ] Stress mismatch does not break vowel-identity match (snapshot-tested)  
- [ ] Pronunciation variants resolve deterministically  
- [ ] OOV-heavy fixtures lower phoneme coverage  
- [ ] Section headers do not count as lyric lines  
- [ ] Blank lines do not increase estimated duration  
- [ ] Visual wrapping does not affect Flow  
- [ ] Reformatting source line breaks produces documented diagnostic  
- [ ] Grid deviation is not labeled syncopation  
- [ ] Partial alignment never enters aligned mode  
- [ ] Stale calculations cannot overwrite newer text  
- [ ] Composite constants include a calibration version  
- [ ] Eight-word fixtures are provisional, not authoritative  
- [ ] All results deterministic across repeated runs  
- [ ] Component: three cards + Technical Density seal; fidelity chip when estimated  
- [ ] Regression: CODEx Metrics no longer renders old heuristic ledger  

## Rollout

- Behind existing Metrics toggle  
- Swap Read wiring `HeuristicScorePanel` → `SongStatsPanel`  
- Combat scoring unchanged  

## Constants (`calibrationVersion` must bump when these change)

| Constant | v1 default |
|----------|------------|
| `engineVersion` | `song-stats-v1` |
| `calibrationVersion` | `cal-2026-07-18` |
| Rhyme window | 24 |
| `maxRhymeSpanWords` | 1 |
| \(RD_C\) normalize ceiling | 2.0 |
| Vocab normalize ceiling | 60 unique lemmas / 100w |
| Flow blend | 0.55 SPS · 0.45 Sync/proxy |
| Estimated pacing | 90 BPM · 4 beats/line · line = bar |
| SPS normalize ceiling | 8.0 syl/s |
| Alignment coverage min | 0.85 |
| Beat grid coverage min | 0.95 |
| `MIN_WORDS_FOR_STATS` | 8 |
| `MIN_WORDS_FOR_STABLE_COMPOSITE` | 32 |
| Composite weights | 0.40 / 0.35 / 0.25 |

Do not silently change weights or ceilings without a spec update and `calibrationVersion` bump.
