# Design: ConstellationOS Phase-1 Live Engines

**Date:** 2026-07-22
**Status:** draft — awaiting owner review
**Author:** Damien + Claude
**Product PDR:** `docs/scholomance-encyclopedia/PDR-archive/Constellation-OS-PDR.md` (§10 flow, §11 Leximancy, §12 Rhyme Astrology, §15 packet, §16 bytecode, §17 HTTP, §19 modules, §20 Phase 1)
**Predecessor:** `2026-07-22-constellationos-search-chamber-design.md` (shipped the fixture-only chamber this replaces the data source for)
**Scope decision:** Lean Phase-1 page service (owner-selected) — compose the two live engines + genome behind one server route; defer the full §10/§19 core tree (shared token map, AuthorityProfile, fusion) to later phases.

---

## 1. Problem

The ConstellationOS chamber ships four result panels — Phrase Identity, Leximancy Meaning Field, Rhyme Constellation, Phrase Genome — driven entirely by a static fixture (`fixtures/samplePagePacket.js`). PDR §20 Phase 1 ("dual-engine canonical packet") calls for these panels to carry **real** engine output while preserving the packet contract, ambiguity behaviour, and local degradation. This design wires the three analytical channels to their existing authorities without the client ever recomputing linguistic truth.

**Active gene directive — `BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK` (conf 0.98):** the frontend must render backend resonance/phoneme indices only. It must not recompute vowel-family or phoneme truth, must not patch color/visual over missing backend data, and must not bypass the backend resonance gate. This design routes all phoneme/rhyme/sense truth through the server; the client maps confirmed fields and shows "awaiting" for anything a channel did not return.

## 2. Non-goals (this increment)

- The full `codex/core/constellation/*` module tree (evidence, fusion, scoringProfiles, tokenMap) and `AuthorityProfile` (deferred — later phases).
- Unified Atlas graph (§9.6), Literary Device Observatory (§9.4), Author/Corpus resonance (§9.7–9.8), Craft routes (§9.9), Mastery overlay (§9.10).
- `POST /api/constellation/compare` and `/transform` (§17.2–17.3).
- New UI: the result shell renders the same packet fields; no component redesign. Sky/search unchanged.
- Semantic Ballistics / Semantic Calculus integration beyond the sense-margin refusal rule.

## 3. Architecture

Server-authoritative, one route, thin adapters (PDR §10 flow at Phase-1 depth):

```
Nexus submit
  → GET /api/constellation/page?query=&mode=standard
      → constellationPage.service.js  (orchestration + degradation)
          ├─ queryIdentity()       normalize · kind · token/grapheme counts
          ├─ pageBytecode()        COS-PAGE-v1-{fnv1a32(basis)}   (§16)
          ├─ leximancyChannel()    → lexicon/wordLookup adapter → interpretations, near-kin, counterfield, §11.3 refusal
          ├─ rhymeChannel()        → rhyme query engine (word|line) → phonemes, stress, cadence family, exact/slant
          └─ genomeChannel()       → panelAnalysis profiles → syllables, deviceHints, schoolHint
      → ConstellationPhase1Packet  (+ diagnostics.degradedChannels, provenance.engineVersions)
  → useConstellationPage maps response → existing packet shape
  → ConstellationResultShell renders confirmed fields; null → "awaiting"
```

Each channel is independent: one failing throws only its own channel into `degradedChannels`; the rest of the page still renders (PDR §7.8).

### 3.1 Modules

**Core (pure, no I/O — PDR §18 Core law):**
- `codex/core/constellation/queryIdentity.js` — `resolveQueryIdentity(rawQuery): { raw, normalized, kind, tokenCount, graphemeCount }`. `kind` ∈ `word | phrase | line | multiline` from whitespace/newline structure. This is the single normalizer; adapters consume its output, never re-tokenize.
- `codex/core/constellation/pageBytecode.js` — `computePageBytecode(basis): "COS-PAGE-v1-{hex}"`, `fnv1a32` over the §16 basis (normalized query, kind, contract version, engine versions, scoring-profile constants). Excludes request time, cache status, user identity (§16).

**Services (I/O, adapters — PDR §18 Services + §10.3):**
- `codex/server/services/constellation/leximancy.adapter.js` — wraps the lexicon adapter used by `lexicon.routes.js` (`lookup`, `lookupSynonyms`, `lookupAntonyms`, `extractGloss`). Emits `{ status, selectedInterpretationId, interpretations[], nearKin[], counterfield[], warnings[], engineVersion }`.
- `codex/server/services/constellation/rhymeAstrology.adapter.js` — reuses `createRhymeAstrologyQueryEngine` (shared instance with `rhymeAstrology.routes`, same repos — no self-HTTP). Maps `rhymeAstrologyResult` → `{ phonemes, stress, cadenceFamily, exactRhymes[], slantRhymes[], engineVersion } | null`.
- `codex/server/services/constellation/genome.adapter.js` — wraps `panelAnalysis.service` helpers (`buildLineSyllableCounts`, word profiles) + school classifier (`block-school-bridge`/`school-tag-amp`). Emits `{ syllables, devicesHint[], schoolHint | null }`.
- `codex/server/services/constellationPage.service.js` — orchestrates the three channels + identity + bytecode, assembles the packet, records `degradedChannels`/`engineVersions`. Pure composition over adapter outputs.

**Route (PDR §18 Server + §17.1):**
- `codex/server/routes/constellation.routes.js` — `GET /api/constellation/page`, query params `{ query, mode?: 'standard'|'deep', includeCorpus?, includeGrimDesign?, includeMastery? }` (only `query`/`mode` honoured this phase; others accepted and ignored). Rate-limited like the RA route (60/min). Validates `query` (non-empty, grapheme-length cap, control-char reject — §21.7). Registered in the server's route registry alongside `rhymeAstrology.routes`.

**Client (PDR §18 UI):**
- `src/hooks/useConstellationPage.js` — on non-null query, `fetch('/api/constellation/page?query=…')` with an `AbortController` (cancel superseded queries). Success → map JSON to `ConstellationPhase1Packet`. **Fetch failure or non-2xx → fall back to `resolveConstellationFixture(query)`** so the chamber still works offline and the shipped tests stay deterministic. Returns `{ status: 'idle' | 'loading' | 'ready', packet }`; `loading` is a new state the shell may show as a quiet "consulting the engines" line (optional; awaiting states already cover nulls).

### 3.2 Input handling

- **Single token** (`kind: word`): RA mode `word`; Leximancy senses of the word.
- **Phrase / line / multiline**: RA mode `line`; Leximancy interpretations resolved for the **primary content token** — the query's tokens minus a small stopword set, choosing the rarest/last content word as the semantic anchor (PDR examples center on a head word, e.g. `wound` in "the bright wound of morning"). Genome syllables sum across the phrase.
- The chosen anchor token id is recorded so the panel can name which word it interpreted (evidence, not a silent pick).

## 4. Contracts honoured

- **§11.3 semantic refusal:** interpretations always preserved and ranked. `selectedInterpretationId = null`, `status = 'ambiguous'` when `s₁ < MIN_CONFIDENCE` **or** `s₁ − s₂ < MIN_MARGIN`. Both are versioned constants in the leximancy adapter (calibrated against fixtures, feed the bytecode basis). The service never overrides the refusal.
- **§7.3 evidence before explanation:** a channel that returns nothing yields `null`/empty, which the shell renders as "Awaiting engine — …". No invented glosses, rhymes, or school.
- **§7.4 ambiguity is data:** competing interpretations shown, not collapsed.
- **§7.6 determinism:** same normalized query + engine versions + scoring constants ⇒ byte-identical `pageBytecode`. Engine cache state and timing are excluded from the basis.
- **§7.8 failure stays local:** `diagnostics.degradedChannels` lists any channel that failed; the others still render. Whole-request failure (backend down) → client fixture fallback.
- **Gene directive:** the client maps `packet.rhymeAstrology.phonemes` etc. straight from the response and never derives vowel family, stress, or rhyme from the query string.

## 5. Packet shape

Unchanged from `ConstellationPhase1Packet` (`src/pages/Constellation/types.js`) so the shell needs no edits. Fields now populated from engines instead of the frozen fixture; `provenance.engineVersions` reports the real adapter/engine versions; `diagnostics.degradedChannels` reflects live channel health. Extra atlas fields (nearKin/counterfield) are additive and optional — the shell may surface them later without a contract break.

## 6. Testing

- **Core unit** (`tests/qa/features/`): `queryIdentity` (word/phrase/line/multiline, unicode graphemes, punctuation), `pageBytecode` determinism (same input → same hex; version change → different hex; timing excluded).
- **Service unit**: `constellationPage.service` with mocked adapters — resolved, ambiguous (margin under threshold → null selection), and degraded (one adapter throws → listed in `degradedChannels`, others intact).
- **Adapter unit**: leximancy refusal thresholds; rhyme mapping (RA result → panel fields); genome syllable/school mapping. Adapters tested against small fixed engine outputs, not the live index.
- **Route test** (`tests/server/`): `GET /api/constellation/page` returns 200 + packet shape for a known query; rejects empty/oversize/control-char query (§21.7); shape validates.
- **Client** (`tests/qa/features/useConstellationPage.test.js`, extended): fetch success maps fields; fetch failure → fixture fallback (existing assertions preserved); abort on superseded query; deterministic for identical query. Mock `fetch`.
- **Regression:** the existing 14 chamber tests stay green via the fixture-fallback path (they don't hit the network).

## 7. Risks

| Risk | Mitigation |
|---|---|
| Backend `:8080` not running in dev | Client fixture fallback keeps the chamber usable offline; live data appears when the backend is up. Damien tests `localhost:5173` (Vite proxies `/api` → `:8080`). |
| Rhyme engine needs the index/repos loaded | Adapter reuses the same engine instance/repos as `rhymeAstrology.routes`; if unavailable the rhyme channel degrades (not a page failure). |
| Frontend drifting into recomputation | Enforced by the gene directive + review: the hook maps response fields verbatim; no phoneme/vowel logic client-side. |
| Sense-margin thresholds miscalibrated → over/under refusal | Versioned constants + adapter fixtures; thresholds feed the bytecode so a retune is visible. |
| Phrase anchor picks the wrong head word | Anchor token id is recorded and nameable; Phase 1 keeps a documented, deterministic rule (rarest content token) rather than a hidden guess. |

## 8. Success criteria

1. Searching `the bright wound of morning` with the backend up returns real Leximancy senses, real Rhyme Astrology phonemes/stress/rhymes, and a real syllable/school genome — no fixture values.
2. An ambiguous query yields `status: ambiguous`, `selectedInterpretationId: null`, and multiple interpretations (§11.3), not a forced pick.
3. Killing one engine degrades only its panel (its channel in `degradedChannels`, "awaiting" in the UI); the other panels still render.
4. With the backend down, the chamber still renders via the fixture fallback and the 14 existing tests stay green.
5. Identical query + versions ⇒ identical `pageBytecode`.
6. No client-side phoneme/vowel-family computation exists in the diff (gene directive).
