# Analyze UI + Retrieval — Design

**Date:** 2026-07-18
**Branch:** `feat/lexical-graph-foundation`
**Depends on:** [Lexical Graph Foundation](2026-07-18-lexical-graph-foundation-design.md) (storage + read-only adapter — shipped)
**Follow-on slice of:** that design's deferred "Analyze retrieval" + "Analyze UI".

## Goal

Turn the Read IDE **Analyze** mode from the current draft-heuristics report into a
**submit-only poetic search engine** over the lexical graph + legacy dictionary.
The writer queries a word / phrase / concept and gets organized, **evidence-backed**
possibilities they can act on (insert, replace selection, pin) without leaving the editor.

## Non-goals

- Not typing-triggered. **Search runs on submit only** (Enter / Search button) — a
  standing UI law for this surface.
- Not replacing **Lexicon Oracle** (definitions/synonyms/rhyme families authority). Analyze
  *pairs* with it; the Oracle panel stays.
- Not ingesting phrases/motifs/allusions (still deferred). Not building runtime device detectors.
- Not touching the **Astrology** mode, which reuses the current `AnalysisPanel` via
  `surfaceMode="astrology"`.

## Data reality (measured 2026-07-18, `scholomance_dict.sqlite`)

The overlay tables are **not yet migrated in this DB**; only the legacy layer is populated.
This is the ground truth the retrieval is built against — no group renders data it does not have.

| Group | Source | Status |
|---|---|---|
| Meaning | legacy `entry.senses_json` (123,611 rows: glosses + examples) | strong |
| Related language | `wordnet_rel`: `similar` (23k), `hypernym`/`hyponym` (93k), `mero_*`/`holo_*`, `also`, `entails`, `causes`, `attribute` | strong |
| Sound | `rhyme_index` (123,611) | strong |
| Literary techniques | `literary_device` overlay — **10 seeded devices** (after migrate + seed-devices) | real, small |
| Corpus examples | device `examples_json` + WordNet gloss `examples` | partial (flagged by origin) |
| Symbols (loose) | `wordnet_rel`: `has_domain_topic`/`domain_topic` (6946), `exemplifies`/`is_exemplified_by` (1667), `domain_region` (1349) | loose, **flagged low-confidence** |
| Craft actions | UI actions over any result | n/a (not data) |
| **Oppositions** | **no antonym data exists** — WordNet carries no antonym relation; `entry.senses_json` has only `glosses`+`examples` | **honest-empty** |
| **Phrases** | phrase ingest deferred | **honest-empty** |

**Honest-empty** groups render a labeled placeholder ("No antonym source ingested yet",
"Phrase ingest not yet available") — never fabricated results. They light up when their
source is ingested, with no UI change.

## Architecture

A single vertical slice: **data prep → service → route → panel.**

### 1. Data prep (one-time, offline)
Run the existing CLI against `scholomance_dict.sqlite`:
```
node scripts/lexical-graph.mjs migrate      --db scholomance_dict.sqlite --timestamp <ISO>
node scripts/lexical-graph.mjs seed-devices  --db scholomance_dict.sqlite --timestamp <ISO>
```
(Words/rhyme/WordNet are already present; `mirror`/`embed-devices` are **not** required for
retrieval — devices are read directly from `literary_device`, words from the legacy tables.)

### 2. `analyzeService` — `codex/server/services/lexicalAnalyze.service.js`
Pure composition layer. Input: `{ query, context? }`. Output: `AnalyzeResult` (groups below).
- Reads **words** from legacy tables (`entry`, `entry_fts`, `rhyme_index`, `wordnet_*`) via a
  small read-only accessor (mirrors `lexicon.sqlite.adapter.js` patterns; **read-only**, never writes).
- Reads **devices** from the `lexicalGraph` adapter (`getLiteraryDevice`, `listLiteraryDevices`,
  `searchFts`, `listRelations`).
- Every result item carries `{ text, source, sourceUrl?, confidence, derived?, note? }`.
  `derived: true` + `note` mark loose/bridged results (Symbols, gloss examples).
- Never fabricates: a group with no rows returns `{ items: [], emptyReason }`.

### 3. Route — `codex/server/routes/lexicalAnalyze.routes.js`
`POST /api/lexical/analyze`, body `{ query: string (1..80), context?: {...} }`, zod-validated.
Submit-only (no GET-on-keystroke path). Reuses the panelAnalysis route conventions: request
timeout, in-memory LRU cache keyed by normalized query (Redis optional, same env flags style).
Mounted alongside `panelAnalysis.routes.js`.

### 4. UI — `src/pages/Read/AnalyzePanel.jsx` (+ `.css`)
Rendered in the existing right-panel slot when Analyze mode is active
(`isAnalyzeMode`); Astrology mode keeps the current `AnalysisPanel`. Structure:
- **Query bar** — text input + Search button. Enter submits. Shows last-submitted query and a
  clear button. Loading + error states. No fetch on keystroke.
- **Result groups** — one collapsible section per group, in the design's order: Meaning ·
  Related language · Oppositions · Sound · Phrases · Literary techniques · Symbols ·
  Corpus examples. Each item shows its text, a source chip, and a confidence/`derived` marker.
- **Craft actions** per item: **Insert** (at cursor), **Replace** (current selection), **Pin**
  (adds to a session pin list at the panel top). Wired through the same editor handles the
  existing panel uses (`currentLineText`, editor insert/replace API).
- Honest-empty groups render the labeled placeholder.

## Result contract (shape)

```ts
interface AnalyzeItem {
  text: string;
  source: string;          // 'wordnet:similar' | 'rhyme_index' | 'device:examples' | 'entry:gloss' | ...
  sourceUrl?: string;      // provenance where the row carries one
  confidence: number;      // 0..1
  derived?: boolean;       // true for loose/bridged (Symbols, gloss examples)
  note?: string;           // why it's derived / caveat
  ref?: { kind: 'word' | 'device'; id: string }; // for follow-up navigation
}
interface AnalyzeGroup { key: string; label: string; items: AnalyzeItem[]; emptyReason?: string; }
interface AnalyzeResult { query: string; canonical: string; groups: AnalyzeGroup[]; generatedAt: string; }
```

## Error handling
- DB missing / overlay not migrated → service returns groups it can (legacy-backed) and marks
  device-backed groups `emptyReason: 'device overlay not migrated'`. Never 500 on missing overlay.
- Query empty/too long → 400 from route (zod).
- Service timeout → route returns partial groups already computed + a `timedOut: true` flag; UI
  shows what arrived.

## Testing
- **Service unit tests** (`tests/server/lexicalAnalyze.service.test.js`): against a fixture DB —
  each group maps to its source; honest-empty groups return `emptyReason`; `derived` flags set on
  loose sources; no group fabricates rows.
- **Route test**: zod rejection, cache hit path, missing-overlay degradation.
- **UI**: submit-only (no fetch on keystroke — assert), empty-group placeholders render, craft
  actions call the editor handles. Verify headed against the real Read IDE Analyze mode.

## Follow-ups (out of scope here)
- Antonym source ingest → lights up **Oppositions**.
- Phrase/motif/symbol/allusion ingest → **Phrases** + upgrades **Symbols** from loose to typed.
- `mirror` + `embed-devices` for unified TurboQuant semantic ranking across words + devices.
- Oracle cutover onto the unified graph.
