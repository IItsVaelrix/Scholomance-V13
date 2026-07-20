# Analyze POS Category Buckets — Design

**Date:** 2026-07-18
**Status:** Approved by Damien (sections 1 and 2 approved in brainstorming session)
**Surface:** IDE Analyze panel (`src/pages/Read/AnalyzePanel.jsx`), backed by
`codex/server/services/lexicalAnalyze.service.js` and
`codex/server/adapters/lexicon.sqlite.adapter.js`.

## Goal

Within each word-bearing Analyze result group, categorize results from a
literary perspective: nouns with nouns, verbs with verbs, etc., alphabetized
within each bucket. The existing channel groups (meaning, related,
oppositions, sound, phrases, literary, symbols, corpus) remain the top-level
structure; POS buckets are sub-structure inside them.

## Decisions (from brainstorming)

1. **Structure:** POS buckets are sub-buckets *inside* the existing channel
   groups. Groups whose items are not words (meaning = definitions,
   corpus = example sentences, literary = devices, phrases = empty) are not
   bucketed.
2. **Ambiguous POS:** a word attested in multiple parts of speech (e.g.
   "stress" noun + verb) is duplicated into each matching bucket. Words with
   no known POS go to an **Unclassified** bucket rendered last.
3. **Approach:** server states POS facts; client arranges buckets.
   The server attaches a `pos` array to word items; `AnalyzePanel` partitions
   and alphabetizes. This keeps the service's "deterministic, read-only
   composition" law: data on the server, presentation in the client.

## Section 1 — Server: POS facts on word items

### Adapter — `codex/server/adapters/lexicon.sqlite.adapter.js`

- `lookupSynonyms`, `lookupAntonyms`, `lookupRelated`, `lookupSymbolsLoose`:
  the SQL adds `l2.pos` to the select list. One lemma can appear in several
  synsets with different POS, so rows are aggregated per lemma into a sorted,
  deduped POS set. Return shape becomes `{ lemma, pos: ['noun','verb'] }`
  per word (`lookupRelated` keeps its `{ broader, narrower, akin }` shape with
  those entries inside; `lookupSymbolsLoose` keeps `via` alongside `pos`).
- `sanitizeLemmaRows` carries the POS set through its dedup (union of POS
  across duplicate rows for the same lemma).
- New `batchLookupPos(words)` for rhyme words: a single prepared statement
  joining the given `word_lower` values against `wordnet_lemma`, returning
  `{ [word]: ['noun', ...] }`. Follows the existing `batchLookupFamilies`
  pattern, including the per-placeholder-count statement cache. Words with no
  WordNet row are absent from the result map (→ Unclassified downstream).

### Service — `codex/server/services/lexicalAnalyze.service.js`

- POS values normalize through the canonical mapper already in use
  (`normalizeLemmaPos` from `codex/core/lexical-analysis/morphology.js`) to
  the set `noun`, `verb`, `adjective`, `adverb`. Unmappable values are dropped
  from the set (never invented).
- Word items in `related`, `oppositions`, `sound` (perfect **and** slant
  rhymes), and `symbols` gain `pos: [...]` (possibly empty).
- `meaning`, `phrases`, `literary`, `corpus` items get **no `pos` field at
  all** — the absence is the client's signal not to bucket that group.
- Item ordering inside `items` is unchanged (e.g. rhymes stay
  corpus-frequency ordered in the contract). Alphabetization is presentation
  and happens client-side only.

## Section 2 — Client: sub-buckets in `AnalyzePanel`

- `ResultGroup` checks whether any item in the group carries a `pos` array.
  If none do, rendering is exactly as today.
- Otherwise it partitions items into a fixed bucket order:
  **Nouns, Verbs, Adjectives, Adverbs, Unclassified.**
  - A multi-POS word is duplicated into each of its buckets.
  - An item with an empty or missing `pos` set goes to Unclassified.
  - Empty buckets are not rendered.
  - Within each bucket, items sort alphabetically by `text`
    (case-insensitive `localeCompare`).
- Each bucket renders as an `h4` subheading (e.g. "Nouns · 7") under the
  existing group `h3`. Item rows are unchanged: source chip, derived chip,
  note tooltip, and the insert/replace/pin actions.
- Pin dedup stays keyed by text, so pinning a duplicated word from two
  buckets yields one pin.
- The group `h3` count remains the number of **distinct** items, not the
  duplicated total.
- List keys become `${group.key}-${bucket}-${item.text}-${index}` so
  duplicated words do not collide.

## Error handling / degradation

- If the lexicon DB is unavailable (`tryConnect()` false), lookups already
  return empty; items simply carry empty `pos` sets and land in Unclassified.
  No new degradation codes are needed.
- `batchLookupPos` with an empty input returns `{}` without touching the DB.

## Testing

- **Adapter tests** (`tests/server/lexicon.sqlite.adapter.test.js`):
  `batchLookupPos` returns POS sets, omits unknown words, handles empty
  input; the four extended lookups return `pos` arrays, including a
  multi-synset lemma yielding a multi-POS set.
- **Service tests** (`tests/server/lexicalAnalyze.service.test.js`): word
  items in related/oppositions/sound/symbols carry normalized `pos`;
  a rhyme word with no WordNet row has `pos: []`; meaning/corpus/literary
  items carry no `pos` field.
- **Component test** (AnalyzePanel): bucket partition, multi-POS
  duplication, alphabetical order within buckets, Unclassified last, empty
  buckets omitted, pos-less groups render unchanged, distinct count in the
  group heading.

## Section 3 — Rename: "Analyze" → "Leximancy" (user-facing copy only)

The feature's display name becomes **Leximancy**. Code identifiers, file
names, routes, contract keys, and test file names keep the `analyze` naming.

Copy to change (name occurrences):
- `src/pages/Read/ToolsSidebar.jsx` — mode button label `Analyze` → `Leximancy`.
- `src/pages/Read/ControlConsole.jsx` — mode segment label `Analyze` → `Leximancy`.
- `src/pages/Read/MobileHexSheet.jsx` — mode label `Analyze` → `Leximancy`.
- `src/pages/Read/AnalyzePanel.jsx` — input placeholder becomes
  "Leximancy: a word or surface form…", input `aria-label` "Leximancy query",
  clear-button `aria-label` "Clear leximancy", pin tray `aria-label`
  "Pinned Leximancy results".
- `tests/visual/lexical-analyze.real.spec.js` — selectors matching the old
  copy (`hasText: 'Analyze'`, `getByLabel('Analyze query')`).

Verb usages stay: the loading button text "Analyzing…" describes the act,
not the feature name. Also untouched (different features / engine status):
the TrueSight engine indicator "Analyzing..." in the `ToolsSidebar.jsx`
footer, ControlConsole engine readouts (`isAnalyzing` = document synthesis),
and `GrimDesignPanel.jsx` "Analyzing...".

## Known trade-off

Perfect rhymes are currently displayed in corpus-frequency order ("rare
beats empty"); alphabetizing inside buckets discards that ranking from the
display. The frequency ordering survives in the contract, so a sort toggle
can be added later without server changes.
