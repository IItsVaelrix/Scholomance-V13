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
etymology: string | null,          // from the SELECTED interpretation's source entry (§6.1)
rarity: { band: number, max: number, label: string } | null,  // null = no freq signal (§7)
relations: { broader: string[], narrower: string[], akin: string[] },  // sorted, capped (§6.1)
// per interpretation:
interpretations: Array<{ id, gloss, confidence, pos, examples: string[] }>  // examples ≤3, ≤20 words
```

`rhymeAstrology` gains:

```js
ipa: string | null,   // from the selected interpretation's entry; null when unavailable
```

**Empty vs null is contractual (review §4):** a present-but-empty array (`relations.broader: []`,
`interpretations[i].examples: []`) means *the lookup succeeded and found nothing* — a valid
state the UI hides silently. `null` (`etymology`, `rarity`, `ipa`) means *no value / degraded*.
These are never conflated; a **failed** sub-lookup sets its value to empty/null **and** records a
granular `degradedChannels` entry (§9). The UI must not render an error affordance for the empty
case, nor a populated scaffold for the null case.

Version bumps so `pageBytecode` changes lawfully:
- `LEXIMANCY_ADAPTER_VERSION` → `lex-adapter-3`
- `RHYME_ADAPTER_VERSION` → `ra-adapter-2`

(pageBytecode basis already includes `engineVersions`, so bumping the adapter
versions is sufficient to re-key the canonical page.)

## 6. Adapter changes

### 6.1 `constellation/leximancy.adapter.js`

**Entry provenance (review §2 — homograph correctness).** The current adapter
flattens `entries → senses → interpretations`, discarding which entry a sense
came from. To bind etymology/IPA to the *selected meaning* rather than an
arbitrary first row, **preserve the source entry on each interpretation**
(carry `entryId` / a ref through the flatten). Then:

- **Etymology** follows the **selected interpretation's** entry:
  `selectedEntry.etymology ?? topEntry.etymology ?? null`. When `status ==='ambiguous'`
  (no selection), fall back to the top-ranked entry's etymology. Homographs whose
  senses live in **separate entries** thus show the right origin for the selected
  sense. *Known limitation:* if one entry carries multiple pronunciations/origins
  across its senses, we cannot disambiguate below entry granularity — documented,
  not silently wrong. (Entry-vs-sense granularity is unverified in this checkout —
  no lexicon DB present — so the code binds at entry level, the finest the shape
  guarantees.)
- **Examples**: thread each kept sense's `examples`, **`slice(0, 3)`**, each string
  truncated to **≤20 words** (ellipsis) — plain strings, no attribution metadata is
  available from the shape `lexicalAnalyze.service` consumes, so none is claimed.
- **Relations**: `lexiconAdapter.lookupRelated?.(contentToken, 20)` → map `.lemma`
  on broader/narrower/akin. **`slice(0, 10)`** each. Optional-chaining degrades a
  method-less adapter to empty arrays (mirrors the current `lookupSynonyms?.` guard).
  **Ordering (review §2):** the underlying SQL has *no `ORDER BY`* — raw join order
  is deterministic-per-DB but not meaningful. Sort each bucket **by corpus frequency
  descending, then alphabetically**, reusing the same `getCorpusFrequencies` batch
  call (below) extended to cover the related lemmas. This makes relations legible and
  keeps a stable tiebreak.
- **Rarity**: `lexiconAdapter.getCorpusFrequencies?.([contentToken, ...relatedLemmas])`;
  convert the head word's count to a band (§7). Empty Map / missing method →
  `rarity: null` (**not** band 0 — an empty Map means "no signal", per the adapter's
  own contract).

### 6.2 IPA threading (`constellationPage.service.js`)
IPA lives on the lexicon entry but displays in the Rhyme panel. The rhyme adapter
only receives `rhymeQueryEngine`/`rhymeLexiconRepo`, so compute IPA in
`buildConstellationPage` (which has `deps.lexiconAdapter`): read `.pronunciation`
from the **same entry the selected interpretation resolved to** (§6.1 provenance),
falling back to the anchor content-token lookup, then to `null`. Attach as
`rhymeAstrology.ipa`. Guard so a missing entry → `ipa: null`, never a throw. This
keeps IPA and etymology pointing at *one* coherent entry for a given result.

## 7. Rarity banding (the one tunable)

`corpus_freq` is a raw count over the fixed ~115k-sentence corpus. Convert to a
fixed **log-scale** band:

```
freq === 0            → null            (unattested / no signal — do NOT show band 0)
band = clamp(1..9, floor(log10(freq) + 1) mapped into 1..9)
label:  bands 7–9 → "common"
        bands 4–6 → "uncommon"
        bands 1–3 → "rare"
max = 9   // rendered as "uncommon · 5/9"
```

Thresholds calibrate against the PDR §21.2 difficult-word fixtures (`set`, `saw`,
`leaves`, `bound`, `weather`, …) before merge. The bucket edges are the only value
expected to move; they live as **one versioned constant** in the adapter, not
scattered.

Presentation: **band number + word label** (e.g. `uncommon · 5/9`).

**On corpus-invariance (review §2 — pushback, with reasoning).** The review flags
`log10(freq)` as a §7.6 determinism risk because bands shift if the corpus grows.
This does **not** apply here: the corpus is *baked into the DB* (`rhyme_index.corpus_freq`,
produced offline by `scripts/backfill_rhyme_corpus_freq.js`); it does not grow at
runtime. A corpus change is a DB migration → a **new corpus checksum**, which PDR §16
already includes in the page-bytecode basis — i.e. a *legitimate version event*, not a
determinism break. Within a fixed corpus, `log10(freq)` is byte-stable.

The review's percentile / `freq ÷ total_tokens` alternative is *more portable across
corpora* but is **not buildable "with what we have"**: the adapter exposes per-word
counts only — no corpus total and no frequency distribution — so a percentile needs a
new corpus-side precompute (a `corpus_total` row, or a precomputed rank column). That is
recorded as a **follow-up** (band edges → percentile buckets) for when cross-corpus
portability is actually needed. For this pass we (a) keep log-bands, (b) pin the
band-edge constant's identity to the corpus checksum so a future corpus swap re-keys the
page lawfully, and (c) treat `freq===0` as `null`.

## 8. Rendering — `ConstellationResultShell.jsx`

Information hierarchy matters: five new fields must not flatten the panel (review §1).

- **Rarity pill** in the panel header note: `uncommon · 5/9`.
- **Etymology line**, truncation policy (review §1): render the **first sentence,
  max ~120 chars**; if longer, append `…` and make the full text available via an
  expand affordance (`<details>`/inline toggle) or `title` tooltip — never dump a
  paragraph inline. Hidden entirely when `etymology` is null.
- **Relations — visually differentiated, not three identical chipsets** (review §1).
  Each bucket carries a distinct micro-label/glyph and its own semantics:
  - `↑ broader` (hypernyms) — shown in full (≤10)
  - `↓ narrower` (hyponyms) — shown in full (≤10)
  - `≈ akin` (similar) — **capped at 3 visible** with a `+N more` affordance, since
    "similar" is the noisiest bucket
  A small caption labels the group **"lexical relations"** (review §5) to prevent
  users reading `akin` as true vector-semantic neighbours — that is the deferred
  `embeddings_tq` channel, not this one.
- **Examples** as a short quoted list under the **selected** interpretation only
  (≤3, each ≤20 words per §6.1).
- **Rhyme section**: add an `IPA` row to the existing metrics table beside the
  phoneme row. **Font (review §3):** the IPA cell uses a stack with guaranteed IPA
  coverage — e.g. `"Charis SIL", "Gentium Plus", "Doulos SIL", "Noto Sans", serif` —
  so diacritics don't render as tofu on stock systems. *Glyph-level render failure
  is not detectable in-band*, so there is no "hide on tofu" behaviour; the row is
  hidden only when `ipa` is null/empty (which is detectable). The font stack is the
  mitigation.
- All new blocks are conditional (render nothing on empty/null), so a degraded or
  thin entry never shows an empty scaffold — matching the empty-vs-null contract (§5).

## 9. Determinism & degradation

- All three new lookups (`lookupRelated`, `getCorpusFrequencies`, entry read for
  IPA) are deterministic DB reads with stable freq/length ordering (§7.6).
- Each enrichment is independently guarded. A failure degrades **only** that
  sub-field to empty/null and appends a **granular** `diagnostics.degradedChannels`
  entry (review §3) — `leximancy.relations`, `leximancy.rarity`, `leximancy.etymology`,
  `rhyme.ipa` — not a coarse `leximancy`. The page never collapses (§7.8).
- **Packet-size budget (review §3):** with `examples` ≤3×≤20 words and `relations.*`
  ≤10, the enriched packet must stay within **+15%** of the Phase-1 baseline packet
  size; a determinism/size test asserts the caps hold.
- Same normalized query + same engine versions + same corpus checksum → byte-identical
  packet.

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
  granular `leximancy.relations` degraded note, other fields intact.
- **Homograph disambiguation (review §4):** an entry set where sense A and sense B
  live in different entries with different `etymology`/`pronunciation` → assert the
  **selected** interpretation's entry supplies etymology and IPA, not the first row;
  and that the ambiguous case (no selection) falls back to the top entry.
- **Rarity boundary (review §4):** table-driven counts at each band edge
  (e.g. the freq that maps to band 3 vs band 4, and the largest freq still in band 9)
  → assert exact band + label, guarding the log-mapping against off-by-one.
- **Empty-array vs null (review §4):** a successful `lookupRelated` returning no rows
  → `relations.broader: []` (UI hides, no error); a *thrown* lookup → degraded note.
  Assert the packet distinguishes the two and the shell renders them differently
  (silent-hide vs nothing).
- **Relation ordering (review §2):** given related lemmas with known frequencies,
  assert each bucket is sorted freq-desc then alphabetically (deterministic tiebreak).

## 11. Non-goals

- No new engine, corpus, or DB migration.
- No `embeddings_tq` similarity search this pass.
- No mutation, XP, or persistence (§7.9 unchanged).
- No change to Leximancy's semantic-refusal law or ambiguity handling.

## 12. Review dispositions & follow-ups

Design review (2026-07-23) — dispositions after verification against the adapter:

**Adopted:** entry-provenance binding for etymology/IPA (homograph correctness);
meaningful relation sort (freq-desc → alpha, fixing the no-`ORDER BY` arbitrariness);
explicit caps (`examples` ≤3×≤20 words, `relations.*` ≤10) + packet-size budget;
granular `degradedChannels`; empty-vs-null contract; relation visual differentiation
(↑/↓/≈, akin capped +N) with a "lexical relations" label; etymology truncation; IPA
font stack; homograph / boundary / empty-vs-null / ordering tests.

**Pushed back (with reasoning):**
1. *Rarity is a §7.6 violation* — **rejected.** Corpus is fixed in-DB; a corpus change
   is already a bytecode version event (PDR §16 corpus checksum). Percentile isn't
   buildable with current adapter surface (no corpus total/distribution exposed).
2. *Hide IPA row on render failure* — **not implementable.** Glyph-level tofu isn't
   in-band detectable; font stack is the mitigation, row hidden only on null/empty.
3. *Update the PDR rarity definition* — **no drift.** PDR §9.2 lists "lexical rarity"
   as a field with no formula; nothing to reconcile.

**Follow-ups (out of scope this pass):**
- Corpus-relative rarity (percentile buckets) once a `corpus_total`/rank precompute
  exists — replaces the log-band edges without a UI change.
- `embeddings_tq` → true vector semantic-near channel (distinct from `akin`).
- `lookupSymbolsLoose` → imagery/symbol channel (PDR §9.5).
