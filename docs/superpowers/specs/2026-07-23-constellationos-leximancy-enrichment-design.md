# ConstellationOS — Leximancy Meaning Field Enrichment (Phase 1.5)

**Date:** 2026-07-23
**Status:** Design ratified — ready for implementation plan
**Surface:** ConstellationOS Search Chamber (`/constellation`)
**Depends on:** Constellation-OS-PDR §9.2 (Leximancy Meaning Field), §9.3 (Rhyme Constellation), §7.6 (determinism), §7.8 (local degradation)
**Supersedes:** nothing — additive to the shipped Phase-1 live-engine packet

---

## 1. Problem

The shipped result page surfaces roughly a third of the data that already
exists on every lexicon entry. `lookupWord()` returns `etymology`,
`pronunciation` (IPA), `senses[].examples`, `source`/`sourceUrl`, and
`embeddings_tq` on every row; `getCorpusFrequencies()` returns corpus counts;
`lookupRelated()` returns the full WordNet `{broader, narrower, akin}`
hierarchy. The Leximancy panel today shows only senses + flat
synonyms/antonyms.

This is a **surfacing** problem, not a data-acquisition problem. "More data,
with what we have" means threading the already-present fields into the packet
and panel.

## 2. Goal

Turn each result from a definition into an encyclopedia infobox by adding five
enrichments drawn entirely from existing engine outputs, without violating
engine sovereignty (§7.1), evidence-before-explanation (§7.3), determinism
(§7.6), or local degradation (§7.8).

## 3. Scope — the five enrichments

| # | Enrichment | Source (exists today) | Panel |
|---|---|---|---|
| 1 | **Etymology** — origin line | `entry.etymology` | Leximancy Meaning Field |
| 2 | **Lexical rarity** — band + label | `getCorpusFrequencies()` | Leximancy Meaning Field (PDR §9.2 "lexical rarity") |
| 3 | **WordNet hierarchy** — broader / narrower / akin chipsets | `lookupRelated()` → `{broader, narrower, akin}` | Leximancy Meaning Field |
| 4 | **Example sentences** — real usage per sense | `sense.examples` | Leximancy Meaning Field (under selected interpretation) |
| 5 | **IPA pronunciation** — beside ARPABET phonemes | `entry.pronunciation` | Rhyme Constellation |

**Explicitly deferred (YAGNI this pass), noted as clean follow-ups:**
- `embeddings_tq` → true semantic-near via vector similarity (needs a similarity
  index; separate project).
- `lookupSymbolsLoose` → imagery/symbol channel (a distinct concept, PDR §9.5
  imagery density).

## 4. Data shapes (verified against `codex/server/adapters/lexicon.sqlite.adapter.js`)

- `normalizeEntry(row)` already yields
  `{ id, headword, pos, pronunciation, etymology, senses, source, sourceUrl, embeddings_tq }`.
- `senses` is a parsed JSON array; each sense may carry `examples: string[]`
  (as consumed today by `lexicalAnalyze.service.js` corpus group).
- `getCorpusFrequencies(words)` → `Map<word, number>`; **empty Map means "no
  frequency signal available", never "unattested"** (pre-migration DB). Rarity
  must render as `null` in that case, not as band 0.
- `lookupRelated(word, limit)` → `{ broader: Entry[], narrower: Entry[], akin: Entry[] }`,
  each `Entry` carrying `.lemma`.

## 5. Contract changes — `src/pages/Constellation/types.js`

`leximancy` gains:

```js
etymology: string | null,
rarity: { band: number, max: number, label: string } | null,  // null = no freq signal
relations: { broader: string[], narrower: string[], akin: string[] },
// per interpretation:
interpretations: Array<{ id, gloss, confidence, pos, examples: string[] }>
```

`rhymeAstrology` gains:

```js
ipa: string | null,
```

Version bumps so `pageBytecode` changes lawfully:
- `LEXIMANCY_ADAPTER_VERSION` → `lex-adapter-3`
- `RHYME_ADAPTER_VERSION` → `ra-adapter-2`

(pageBytecode basis already includes `engineVersions`, so bumping the adapter
versions is sufficient to re-key the canonical page.)

## 6. Adapter changes

### 6.1 `constellation/leximancy.adapter.js`
- Capture `entry.etymology` from the **selected** entry (first kept entry when
  ambiguous) → `etymology`.
- Thread each kept sense's `examples` (bounded, e.g. ≤3 per interpretation) onto
  the interpretation object.
- Call `lexiconAdapter.lookupRelated?.(contentToken, 20)`; map `.lemma` on each
  of broader/narrower/akin → `relations`. Optional-chaining degrades an adapter
  without the method to empty arrays (mirrors current `lookupSynonyms?.` guard).
- Call `lexiconAdapter.getCorpusFrequencies?.([contentToken])`; convert the raw
  count to a rarity band (§7). Empty Map → `rarity: null`.

### 6.2 IPA threading (`constellationPage.service.js`)
IPA lives on the lexicon entry, but is a **phonetic** value shown in the Rhyme
panel. The rhyme adapter only receives `rhymeQueryEngine`/`rhymeLexiconRepo`, so
compute IPA in `buildConstellationPage` (which already has `deps.lexiconAdapter`):
look up the anchor content token, read `.pronunciation`, attach as
`rhymeAstrology.ipa`. Guard so a missing entry → `ipa: null`, not a throw.

## 7. Rarity banding (the one tunable)

`corpus_freq` is a raw count over the ~115k-sentence corpus. Convert to a fixed
**log-scale** band so the mapping is deterministic and versioned with the
adapter:

```
freq === 0            → null            (unattested / no signal — do NOT show band 0)
band = clamp(1..9, floor(log10(freq) + 1) mapped into 1..9)
label:  bands 7–9 → "common"
        bands 4–6 → "uncommon"
        bands 1–3 → "rare"
max = 9   // rendered as "uncommon · 5/9"
```

Thresholds are calibrated against the PDR §21.2 difficult-word fixtures
(`set`, `saw`, `leaves`, `bound`, `weather`, …) before merge. The exact bucket
edges are the only value expected to move; they live as a single versioned
constant in the adapter, not scattered.

Presentation: **band number + word label** (e.g. `uncommon · 3/9`).

## 8. Rendering — `ConstellationResultShell.jsx`

- **Leximancy section**: add an etymology line and a rarity pill to the panel
  header note (e.g. `uncommon · 5/9`); add three `<Chips>` — `broader` (tone `kin`), `narrower`
  (tone `kin`), `akin` (tone `kin`) — beneath the existing near-kin/counterfield;
  render `examples` as a short quoted list under the selected interpretation.
- **Rhyme section**: add an `IPA` row to the existing metrics table beside the
  phoneme row.
- All new blocks are conditional (render nothing when null/empty), so a degraded
  or thin entry never shows an empty scaffold.

## 9. Determinism & degradation

- All three new lookups (`lookupRelated`, `getCorpusFrequencies`, entry read for
  IPA) are deterministic DB reads with stable freq/length ordering (§7.6).
- Each enrichment is independently guarded. A failure degrades **only** that
  sub-field to empty/null and appends to `diagnostics.degradedChannels`; the
  page never collapses (§7.8), matching the existing per-channel try/catch.
- Same normalized query + same engine versions → byte-identical packet.

## 10. Testing (TDD — write first)

- `tests/qa/features/constellation-leximancy-adapter.test.js`: fixtures carrying
  `etymology`, `senses[].examples`, `lookupRelated` output, and a
  `getCorpusFrequencies` Map → assert `etymology`, `relations`, per-interpretation
  `examples`, and each rarity band/label boundary (including `freq===0 → null`
  and empty-Map → null).
- Packet-shape test: new fields present and typed; version strings bumped.
- Determinism test: same query twice → deep-equal packet (incl. `pageBytecode`).
- `constellation-page.test.jsx` / result-shell: renders the new chipsets, rarity
  pill, etymology line, examples, and IPA row; renders nothing when empty.
- Degradation test: a `lookupRelated` that throws → `relations` empty +
  `degradedChannels` note, other fields intact.

## 11. Non-goals

- No new engine, corpus, or DB migration.
- No `embeddings_tq` similarity search this pass.
- No mutation, XP, or persistence (§7.9 unchanged).
- No change to Leximancy's semantic-refusal law or ambiguity handling.
