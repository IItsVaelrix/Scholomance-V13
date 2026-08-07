# Design: ConstellationOS Poetic Discovery (PLS-backed)

**Date:** 2026-08-07  
**Status:** draft — awaiting owner review (rev 2: hard constraints + plan builder)  
**Author:** Damien + Grok  
**Product PDR:** `docs/scholomance-encyclopedia/PDR-archive/Constellation-OS-PDR.md` (§8.1–8.2 discovery queries, §7.3 evidence, §7.6 determinism, §7.8 local failure)  
**Predecessor:** `2026-07-22-constellationos-live-engines-design.md`, phrase-structure phase (`phraseAnalysis.js` / phase2 packet)  
**Decision:** Approach **2** — Discovery channel that reuses PLS ranker + providers; local-only (no Datamuse)  
**Revision note:** Owner review corrected generators vs constraints vs scorers (esp. hard rhyme), parse operator order, modifier provenance floor, rarity invariant, packet `mode`/`constraints`, enumeration determinism, staged diagnostics, and plan-first implementation order.

---

## 1. Problem

ConstellationOS accepts natural-language inquiries and literary phrases, but the page still behaves like a **single-word dictionary**:

1. **Meta-queries** (e.g. *“Words that resemble darkness but feel more emotional”*) classify as `meta-query` but still run Leximancy on a head token (often the last content word — *emotional*). No ranked poetic hit list is produced.
2. **Literary phrases** keep full query identity but meaning is still a single-anchor gloss, so the plate feels empty of phrase substance.
3. The product thesis (PDR) and placeholders already advertise discovery (*“words that rhyme with gravity but feel spiritual”*), yet the engines never answer in that shape.

The Poetic Language Server (PLS) already implements local generate → score → rank with explainable badges. Constellation does not call it.

**Goal:** Make ConstellationOS feel like a **Google for poetic help** for discovery inquiries, and give literary phrases visible structure — without reinventing ranking or calling the network.

**Architectural distinction (non-negotiable):** this adds a **query channel**, not a new linguistic authority. Ranking remains PLS; lexicon/rhyme engines remain the only generators of truth.

---

## 2. Non-goals (this increment)

- Datamuse / any external HTTP for discovery
- Craft transforms (`make this more VOID…`) or comparison pages
- Full Unified Atlas / Device Observatory / author-era panels
- LLM generation of candidate words
- Client-side recomputation of rankings (gene: engine truth on server)
- Replacing Leximancy for single-word lookups
- Building a full NLP parser or free-form Q&A
- Soft vs hard rhyme language distinction beyond v1 rule (`constraints.rhymeWith !== null` ⇒ hard filter)
- A parallel “ConstellationRanker2” — forbidden

---

## 3. Decision

| Concern | Decision |
|--------|----------|
| Substrate | **Local only** — lexicon (WordNet relations, FTS, rarity) + existing PLS providers/ranker |
| Architecture | New **discovery channel** on the page packet; reuse PLS `rankCandidates` + scorer/generator providers via injected engines |
| Engine hierarchy | `intent → parse → plan → generate → constrain → score → rankCandidates → packet` |
| Not used as-is | Full `PoeticLanguageServer.getCompletions` cursor API (line-completion oriented) |
| Rhyme with hard wording | **Hard candidate constraint** when `constraints.rhymeWith !== null` — not merely a score boost |
| Literary phrases | Surface `phraseStructure` + compound/anchor honesty in the meaning plate; Leximancy still head-anchored but **named** |
| Determinism | Same normalized query + engine versions ⇒ same candidate universe, hit order, and `pageBytecode` |
| Degradation | Discovery failure is local; other channels still render; internal stage recorded |

---

## 4. Architecture

```
GET /api/constellation/page?query=…
  → constellationPage.service
      ├─ resolveQueryIdentity + analyzePhraseStructure     (existing)
      ├─ leximancy / rhyme / genome / semanticInquiry      (existing)
      └─ discovery channel (NEW; when intent warrants)
            ├─ parseDiscoveryInquiry(identity)             pure core
            ├─ buildDiscoveryPlan(parse)                   pure core
            ├─ expandCandidates(plan, engines)             adapter I/O — GENERATORS
            ├─ applyConstraints(candidates, plan, engines) adapter I/O — CONSTRAINTS
            ├─ score + rankCandidates                      pure + PLS — SCORERS
            └─ packet.discovery
  → ConstellationResultShell renders Discovery Field when present
```

**Three semantics (formal separation):**

| Layer | Role | Must not |
|-------|------|----------|
| **GENERATORS** | Produce possible words from engines | Soft-rank; invent lemmas |
| **CONSTRAINTS** | Remove invalid words (hard evidence required) | “Prefer” or partial credit |
| **SCORERS** | Order surviving words (PLS + discovery pre-scores) | Re-expand the universe |

Server ranks; client renders. No frontend linguistic recomputation.

### 4.1 When discovery runs

| `intent` (from phraseAnalysis) | Discovery |
|--------------------------------|-----------|
| `meta-query` | **Primary** — run and promote in UI |
| `literary` | **Skip** in v1 (structure + anchor honesty only) |
| `word` | Skip |
| `craft-instruction` / `comparison` | Skip |

### 4.2 Modules

**Core (pure, no I/O — PDR §18):**

| Module | Responsibility |
|--------|----------------|
| `codex/core/constellation/discoveryInquiry.js` | Parse meta-query → `{ seeds, relation, modifiers, constraints, modifierSources, … }` |
| `codex/core/constellation/discoveryPlan.js` | `buildDiscoveryPlan(parse)` → generators, constraints, scorerProfile, mode |
| `codex/core/constellation/discoveryWeights.js` | Frozen weight profiles + pre-score constants |
| `codex/core/constellation/discoveryScoring.js` | Pure `modifierFit` / `rarityBoost` with provenance floors |
| Reuse | `src/lib/pls/ranker.js` `rankCandidates`; existing scorer providers where injectable |

**Adapters (I/O at boundary):**

| Module | Responsibility |
|--------|----------------|
| `codex/server/services/constellation/discovery.adapter.js` | Run plan: expand → constrain → score/rank; return channel payload |

**Orchestration:**

- `constellationPage.service.js` — call discovery when `identity.intent === 'meta-query'`; version + staged diagnostics on failure.

**UI:**

- `ConstellationResultShell.jsx` — **Discovery Field** plate; literary **Meaning anchored on “…”** + phrase structure chips.

### 4.3 Inquiry parse (pure)

Input: `identity` (`normalized`, `tokens`, `intent`).

Output shape:

```js
{
  status: 'ok' | 'refuse',
  relation: 'resemble' | 'rhyme' | 'near' | 'opposite' | 'unknown',
  seeds: string[],
  modifiers: string[],
  /** How each modifier was detected — diagnostics / fixtures */
  modifierSources: Array<{ token: string, source: 'span' | 'known-tone' }>,
  constraints: {
    rhymeWith: string | null,
  },
  reasons: string[],
  refusal: string | null,
}
```

**Operator-first parse order (mandatory):**

1. **Detect operators / spans** on the raw token list (do **not** strip first). Operators include: `words`/`word` (meta shell), `rhyme`/`rhymes`, `resemble`/`resembling`/`like`/`near`/`similar`, `opposite`/`antonym`, `but`/`feel`/`feels`/`feeling`/`more`/`less`, `semantically`, `with`, etc.
2. **Extract constraint spans** — e.g. after `rhyme`/`rhymes` + `with` → set `constraints.rhymeWith` to the next content token (`sea`, `gravity`). Hard rhyme wording for v1 is any explicit rhyme-with span; soft language (`rhymier`) is out of scope.
3. **Extract modifier spans** — tokens after `but` / `feel*` / `more` / `less` until next operator or end. Mark `source: 'span'`. Also accept bootstrap **known-tone** vocabulary (`emotional`, `spiritual`, `darker`, `softer`, …) as `source: 'known-tone'` **only as OR**, never as sole authority.
4. **Exclude structural tokens from seed candidacy** — operators, meta shell words, determiners. Rename in code/comments: this is **not** “strip then infer structure.”
5. **Resolve remaining seed candidates** — content tokens not consumed as constraints/modifiers; prefer object of relation spans (token after resemble/near/like, token before but/feel).

**Refuse** if no seeds after step 5.

**Modifier law:** detection = position-based span **OR** known-tone vocabulary.  
Example: *“words like winter but more sepulchral”* → seed `winter`, modifier `sepulchral` via span (even if not in tone table).

**Fixture parse:**

| Query | seeds | relation | modifiers | constraints.rhymeWith |
|-------|-------|----------|-----------|------------------------|
| `Words that resemble darkness but feel more emotional` | `['darkness']` | `resemble` | `['emotional']` (span) | `null` |
| `words that rhyme with gravity but feel spiritual` | `['gravity']` | `rhyme` | `['spiritual']` (span) | `gravity` |
| `words semantically near grief that rhyme with sea` | `['grief']` | `near` | `[]` | `sea` |
| `words like winter but more sepulchral` | `['winter']` | `resemble` | `['sepulchral']` (span) | `null` |

Note: for pure rhyme inquiries, the rhyme target may be both seed and `rhymeWith` (e.g. gravity); plan builder decides generator set.

### 4.4 Candidate plan builder (pure)

```js
buildDiscoveryPlan(parse) → {
  mode: 'semantic' | 'rhyme' | 'semantic+rhyme',
  generators: Array<{ type: 'semantic' | 'antonym' | 'rhyme', seed: string }>,
  constraints: Array<{ type: 'rhymeWith', token: string }>,
  scorerProfile: 'semantic' | 'rhyme-forward',
  modifiers: string[],
  seeds: string[],
  relation: string,
}
```

**Plan rules:**

| Parse feature | Plan effect |
|---------------|-------------|
| `relation: resemble` / `near` | Semantic generator(s) on seed(s) |
| `relation: opposite` | Antonym generator on seed(s) |
| `relation: rhyme` | Rhyme generator on `rhymeWith` or seed |
| `constraints.rhymeWith !== null` | **Hard** constraint entry `{ type: 'rhymeWith', token }` — always, independent of relation |
| `modifiers[]` | Ranking attractors only (never generators of the primary universe) |
| rarity | Weak ranking bias only (see §4.7) |

**Mode derivation:**

- generators include semantic/antonym only, no rhyme constraint → `semantic`
- generators include rhyme only, no semantic → `rhyme`
- both semantic generator and rhyme constraint (or rhyme generator + semantic) → `semantic+rhyme`

**Canonical examples:**

| Query | Generators | Constraints | Profile / mode |
|-------|------------|-------------|----------------|
| near grief + rhyme with sea | semantic(`grief`) | rhymeWith(`sea`) | semantic / `semantic+rhyme` |
| rhyme with gravity + feel spiritual | rhyme(`gravity`) | rhymeWith(`gravity`) | rhyme-forward / `rhyme` |
| resemble darkness + emotional | semantic(`darkness`) | — | semantic / `semantic` |

**Why this matters:**  
*“words near grief that rhyme with sea”* is **not** “grief candidates + bonus points for rhyming.” It is **semantic universe ∩ rhyme evidence**, or (if intersection empty) documented empty — never silent fallthrough to unfiltered grief kin.

### 4.5 Generators (local lexicon / rhyme engines only)

Canonical source order (frozen — §7.6):

1. `synonyms` (`lookupSynonyms`)
2. `related` (broader / narrower / akin — each sub-bucket alphabetical by lemma after fetch)
3. `symbols` (`lookupSymbolsLoose` if present)
4. `fts` (`searchEntries` on seed, optional, last)

For **rhyme** generator type: rhyme engine / lexicon repo members for the rhyme token (deterministic order by token asc after fetch).

**Caps (frozen):** max **40** per source per seed; global unique pool max **80** before constraints; exclude seed lemma; normalize lowercase.

**Every adapter read MUST specify deterministic ordering** (SQL `ORDER BY lemma ASC` or in-adapter sort). Unordered DB rows are a contract violation.

**Dedupe:** first-seen wins for `via` provenance; walk sources in canonical order so `via` prefers synonym over FTS when both fire.

**Modifiers never generate the primary universe.** Modifier attractors are a separate small set used only by scorers (syn/related of modifier lemmas, capped, ordered).

### 4.6 Constraints (hard filters)

Applied **after** generation, **before** scoring.

| Constraint | Pass condition | Fail |
|------------|----------------|------|
| `rhymeWith: T` | Candidate has recoverable rhyme evidence vs `T` (exact or engine-attested slant per existing rhyme authority) | Drop from pool |

**v1 rule:** if `constraints.rhymeWith !== null`, every returned hit **must** satisfy rhyme evidence. Ranking must not reintroduce failed candidates.

If the constrained pool is empty → `status: 'empty'` with warning `constraint.rhymeWith eliminated all candidates` — do not relax the constraint automatically.

**Soft rhyme language** (`rhymier`, `prefer rhymes`) is out of v1; only hard constraint path exists.

### 4.7 Scorers — reuse PLS, don’t invent a second ranker

Wire adapters that inject:

- `dictionaryAPI` façade over `lexiconAdapter`
- Optional `phonemeEngine` / rhyme index when present

**Profiles** (`discoveryWeights.js`):

- `semantic` — synonym-heavy; rhyme weight low (constraint already enforced if present)
- `rhyme-forward` — rhyme weight high among survivors; synonym/modifiers still reweight feel-X inquiries

`prefix` weight is always **0** for discovery.

**Discovery-only pure scorers** (`discoveryScoring.js`):

| Signal | Rule | Provenance floor |
|--------|------|------------------|
| `modifierFit` | Overlap of candidate gloss/related tokens with modifier attractor set (0–1) | **`modifierFit > 0` requires ≥1 recorded evidence path** (e.g. `candidate-gloss:sorrow`, `modifier-related:emotion`). No path ⇒ score 0, no `MODIFIER` badge |
| `rarityBoost` | Capped rarity lift from `corpusFreqToRarity` | **Invariant: if base semantic/relation evidence is 0, `rarityBoost = 0`.** Rarity must never promote a candidate that has no generator provenance |

**Base evidence** = membership in the post-constraint pool with non-empty `via` from a generator. Candidates without `via` are invalid and must not reach scoring.

**Integration rule:** do **not** extend `rankCandidates` score keys in v1. Apply pre-score on generator-side synonym (or primary generator) entry:

```
if (baseEvidence === 0) discard; // should not happen post-constraint
synonymScore' = clamp01(
  synonymScore * (K0 + K1 * modifierFit + K2 * rarityBoost)
)
// K0,K1,K2 frozen in discoveryWeights.js; rarityBoost already 0 when baseEvidence==0
```

Then `rankCandidates` as today.

**Output hits:**

```js
{
  token: string,
  score: number,
  badges: string[],      // only if evidence exists for that badge
  reasons: string[],
  via: string[],
  evidence: Array<{ signal: string, score: number, paths: string[] }>,
}
```

Top **N = 12**. Stable sort: score desc, then token asc.

**Badge law:** no badge without recoverable provenance (same as score contribution).

### 4.8 Literary phrase substance (same increment, smaller)

Does **not** invent phrase embeddings. Does:

1. Keep Leximancy on head/compound as today.
2. **UI honesty — frozen wording:**  
   **`Meaning anchored on “{anchor}”`**  
   (from `leximancy.anchor` / `lookupToken` / `compoundUsed`). Do not “prettify” this into “the meaning of the phrase.”
3. Phrase Identity / Genome: render `phraseStructure` (roles, compounds, devices, intent) when present.
4. No silent last-word presentation without naming the anchor.

### 4.9 Packet shape (additive)

```js
discovery: null | {
  status: 'resolved' | 'empty' | 'refused' | 'unsupported',
  mode: 'semantic' | 'rhyme' | 'semantic+rhyme',
  relation: string,
  seeds: string[],
  modifiers: string[],
  constraints: {
    rhymeWith: string | null,
  },
  hits: Array<{
    token: string,
    score: number,
    badges: string[],
    reasons: string[],
    via: string[],
    evidence: Array<{ signal: string, score: number, paths: string[] }>,
  }>,
  warnings: string[],
  parse: { reasons: string[], modifierSources: Array<{ token, source }> },
}
```

- `null` when discovery did not run.
- Expose **`constraints` and `mode` on the packet** so the page explains itself without reconstructing the parser.
- `engineVersions.discovery = 'disc-adapter-1'` (bump on behavior change).
- Discovery version participates in `pageBytecode` via `engineVersions`.

### 4.10 Diagnostics & degradation

Public degraded channel name remains: **`discovery`**.

Internal stage (always set when discovery runs or fails):

```js
diagnostics.discovery = {
  stage: 'parse' | 'plan' | 'expand' | 'constrain' | 'rank' | 'ok',
  message: string | null,
}
```

On throw at a stage: push `discovery` to `degradedChannels`, set `diagnostics.discovery.stage` to that stage, leave `discovery` null or partial-safe empty — other channels intact.

### 4.11 UI

**Meta-query:**

1. Masthead: full query + `intent: meta-query` + optional mode chip from `discovery.mode`.
2. **Discovery Field** first analytical plate: ranked hits with score, badges, one reason; empty state if none.
3. Leximancy secondary; if present, still show **Meaning anchored on “…”** so it is not mistaken for the inquiry answer.
4. Rhyme / genome remain when populated.

**Literary phrase:**

- No discovery plate.
- Meaning: **Meaning anchored on “wound”** (etc.).
- Phrase structure chips visible.

**Empty discovery:** “No local kin found for this inquiry” + parse/constraint chips; no invented words.

### 4.12 Dependencies injection

```js
deps = {
  lexiconAdapter,      // required
  rhymeQueryEngine,    // existing — required for rhyme generator/constraint evidence
  rhymeLexiconRepo,    // existing
  phonology,           // existing
  phonemeEngine,       // optional PLS scorers
}
```

If rhyme engines missing and plan has rhyme generator or rhyme constraint → discovery `status: 'empty'` or degraded stage `expand`/`constrain` with explicit warning — never invent rhymes.

---

## 5. Contracts honoured

| Law | How |
|-----|-----|
| §7.3 Evidence before explanation | Hits carry `via`, `reasons`, `evidence[]`; no score/badge without provenance |
| §7.4 Ambiguity is data | Multiple ranked hits; no forced single answer |
| §7.6 Determinism | Pure parse/plan/score; **canonical generator order**; **deterministic SQL/sort on every adapter read**; frozen caps; stable dedupe; tie-break token asc; provider failure → empty that source, not random fill |
| §7.8 Failure stays local | Public `discovery` degraded + internal stage; page remains |
| §7.9 Search does not mutate | Read-only |
| Gene: no frontend linguistic invent | Client maps `packet.discovery` only |
| **Hard rhyme** | `constraints.rhymeWith !== null` ⇒ filter, not soft score |
| **Rarity** | Never rescues zero base evidence |
| **No parallel ranker** | PLS `rankCandidates` only |

---

## 6. Testing

| Layer | Cases |
|-------|--------|
| Pure parse | Operator-first: darkness/emotional; gravity rhyme+spiritual; grief+sea; winter+sepulchral (unknown modifier as span); refuse empty |
| Plan builder | grief+sea → semantic gen + rhyme constraint + mode `semantic+rhyme`; gravity → rhyme-forward |
| Expansion | Canonical source order; caps; seed excluded; deterministic ordering |
| Constraint | **Hard rhyme:** every hit for grief+sea has rhyme evidence vs sea; empty pool when none pass |
| Scoring | modifierFit requires evidence paths; rarity cannot promote zero-evidence candidate |
| Enumeration determinism | Mock sources return same lemmas in different orders → identical final hits |
| Rank | Fixed inputs → stable order |
| Service | meta-query has discovery; literary `discovery: null`; throw → degraded + stage |
| UI | Hits render; literary shows **Meaning anchored on “…”** |

**Golden fixtures:**

1. *Words that resemble darkness but feel more emotional* — abyss (or evidenced kin) in top hits with reasons.  
2. *words near grief that rhyme with sea* — **all hits rhyme-evidenced vs sea**.  
3. *words like winter but more sepulchral* — seed winter, modifier sepulchral.  
4. Rarity glitter: zero-evidence rare word never outranks evidenced commoner kin.

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Soft score used as fake constraint | Plan builder + hard filter stage + tests that every hit passes rhyme |
| Intersection empty for grief∩sea | Honest empty + warning; no auto-relax |
| Unordered SQLite | Explicit ORDER BY / adapter sort contract |
| Known-tone ontology creep | Span-first modifiers; tone set bootstrap only |
| Parallel ranker drift | Code review: only `rankCandidates` |
| Local WordNet weak for abyss | Multi-source expand + honest empty |

---

## 8. Success criteria

1. *“Words that resemble darkness but feel more emotional”* → discovery hit list (not dictionary page for *emotional*); evidenced kin (e.g. abyss) can rank with reasons when the local graph supports it.  
2. *“words that rhyme with gravity but feel spiritual”* → rhyme universe, spiritual as ranking attractor, rhyme-forward profile.  
3. *“words near grief that rhyme with sea”* → semantic generation from grief, **hard** rhyme filter on sea, every hit evidenced; not “grief list with rhyme bonus.”  
4. Literary *“the bright wound of morning”* → **Meaning anchored on “…”**; phrase structure visible; `discovery: null`.  
5. No network in discovery path.  
6. Identical query + versions → identical candidate enumeration + hit order + `pageBytecode`.  
7. Existing constellation tests green; new fixtures cover parse, plan, constrain, rank, service, shell.

---

## 9. Implementation order

1. Parse + semantic contract fixtures  
2. **Candidate-plan builder** (`buildDiscoveryPlan`) + fixtures  
3. Modifier/rarity pure scorers (provenance floor + rarity invariant)  
4. Adapter expansion (canonical sources, ordered reads)  
5. **Constraint application** (hard rhyme)  
6. PLS rank wiring  
7. Service packet + staged degradation + engineVersions  
8. UI (Discovery Field + literary anchor wording)  
9. Golden integration fixtures (incl. grief∩sea, sepulchral, rarity, enumeration determinism)

---

## 10. Open questions (resolved for v1)

| Question | Resolution |
|----------|------------|
| Network means-like? | **No** |
| Full PLS getCompletions? | **No** — ranker/providers only |
| Discovery on literary? | **No** |
| Soft vs hard rhyme language? | **v1:** `rhymeWith !== null` ⇒ hard only |
| Hit count | **12** |
| Parallel ConstellationRanker? | **Forbidden** |
| Empty after hard constraint? | Honest empty; no auto-relax |
| Literary UI wording | **Meaning anchored on “{token}”** |
