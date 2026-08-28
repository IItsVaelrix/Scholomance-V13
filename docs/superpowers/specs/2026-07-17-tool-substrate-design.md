# Design: Capability Packets — retrieval keyed on artifacts, not on words

**Date:** 2026-07-17
**Status:** approved (design); not implemented
**Author:** Claude + Damien
**Supersedes:** nothing. **Extends:** SCDNA (`docs/scholomance-encyclopedia/PDR-archive/SCDNA.pdr.md`)

## 1. Problem

Invention has outrun archeology. The repo holds more capability than anyone can
find, so we rebuild what already exists. Measured examples from the 2026-07-17
session, all in one afternoon:

| rebuilt | already existed |
| --- | --- |
| `_span_weight` char-length heuristic | `CmuPhonemeEngine` → `node_modules/cmudict/lib/cmu/cmudict.0.7a` |
| a spectral-flux onset detector | `codex/server/catalog/sidecar.compiler.js` ("half-wave rectified spectral flux = onset strength") |
| nearly, a resonance compiler | `scripts/compile-resonance.py` |

Plus latent duplication nobody has reconciled: **two aligners**
(`scripts/align_lyrics.py` MMS_FA vs `scripts/align-track.mts` WhisperX);
**three resonance schemas** (`compile-resonance.py` `timeMs`/onset+rms+bpm, vs
`sidecar.compiler.js` `timestampMs`/low-mid-high+energy+pulse, vs a `mock-hash`
fixture); **"gene" overloaded** across two unrelated subsystems (`RetrievalGene`
and `PB-SCDNA-GENE-v1`); and `melismaBonus`, which models sung stretch
orthographically (`/([aeiou])\1{2,}/`) and therefore returns **0 for all 577
words** of a real lyric.

## 2. Why the existing substrate did not prevent this

SCDNA already exists and already targets this: its **G2 is "Reduce repeated
search."** It fires on every prompt via `scripts/scdna-gene-inject.sh` →
`vaelrix_forcefield/scdna/inject.py`. It is not missing. It is unreachable.

Measured, not asserted:

```
distill_query("add '.../Regret V3.mp3'")                        -> ''
distill_query("...spectral analysis + audio ... vocals")        -> 'audio'
distill_query("@codex/core/pixelbrain/scdna-gene-packet.js")    -> 'pixelbrain gene'
```

The detector scores `overlap / len(query_tokens)`. Consequences observed live:

- A prompt that is **only a file path** retrieved `WAND_CHEMICAL_STROKE_PROPAGATION`
  ("treat the stroke formula as a chemical reaction law") — because the path
  contains the token `pixelbrain`.
- The same question **with** an `@path` fires genes; **without** it fires nothing.
  Retrieval keys on the incidental path you mention, not on what you ask.

### 2.1 The load-bearing conclusion

**Coverage is not the binding constraint.** Suppose the ideal gene existed
yesterday: *"word duration comes from CmuPhonemeEngine/cmudict.0.7a — never
hand-roll a vowel counter."* For it to fire, the prompt must contain `phoneme`
or `cmudict`. **Not knowing those words was the failure.** A retriever that
requires you to name the answer cannot reduce repeated search. 13 genes vs 213
is irrelevant when the query distills to `'audio'`.

This refutes the intuition we started with ("coverage first, then retrieval").
Retrieval is primary; coverage is downstream of it.

### 2.2 Root cause: the query is filtered through a closed vocabulary

`distill_query` drops every token not in `_LEXICON_ALL`:

```python
if token in STOPWORDS or token not in _LEXICON_ALL:
    continue
```

`_LEXICON_ALL` is the union of `DOMAIN_LEXICON` — a **hand-maintained closed
vocabulary of ~70 words**. `spectral`, `vocals`, `align`, `duration`, `onset`,
`tempo`, `cmudict` are all absent, so every content word of the real question is
deleted before matching. The retriever cannot *represent* "how should I weight
word durations?", let alone answer it.

The lexicon is not an accident — it is **load-bearing**. The detector scores
`overlap / len(query_tokens)`, so an unfiltered query dilutes to zero and nothing
matches. The lexicon exists to compensate for the scoring. The two cannot be
fixed independently.

Note the irony that proves §2.1: `DOMAIN_LEXICON` **already has a `phoneme`
domain** — `{"phoneme", "syllable", "pronounce", "pronunciation", "sound", "ipa"}`.
The vocabulary knew. There are simply no phoneme-domain genes for it to reach.
Both halves are half-built, and neither is useful alone.

### 2.3 Other defects in the gene path

- `INJECT_SCORE_THRESHOLD = 0.35` is **inert** — the detector's hardcoded
  `_BASE_SCORE_MINIMUM` (0.5) dominates. A tuning knob that does nothing, with a
  comment noting it does nothing.
- `except Exception: block = ""` in `inject.py` makes **a crashed retriever and
  an empty corpus byte-identical**, both exit 0.

## 3. Constraints (from the PDR — not negotiable here)

§7 Non-Goals: `Encode every trivial memory`, `Automatically generate genes from
observed behavior`. §7.1: genes are **manually curated**; a gene must be
recurring, high-value, falsifiable, and reviewed; *"detection assists, curation
decides."*

Therefore: **the curation law stands.** No auto-generation. "Codify *all* our
tools" is scoped to what passes the existing bar. The detection half is
explicitly endorsed by the PDR and is what we build.

Today's lessons pass that bar cleanly — "phoneme durations come from
`CmuPhonemeEngine`" is recurring (it happened), high-value (46–63% accuracy on
what it touched), and falsifiable (is the word in cmudict? forbidden drift:
hand-rolled counters). Nobody had written it.

## 4. Architecture

One inversion: **the query is the file being touched, not the words being typed.**
You cannot name what you do not know exists; you *do* touch the files.

```
A. PLUMBING   inject.py — the inert threshold removed or made real; the bare
              except reports instead of swallowing. NOT distill_query: see 4.1.

B. TRIGGER    PreToolUse(Write|Edit) — fires when authoring on a surface.
              tool_input.file_path glob-matched against packet surfaces.

C. PACKETS    capability -> canonical implementation -> forbidden drift.
              PB-SCDNA-GENE-v1 contract shape. Each packet declares its own
              territory, so there is no separate file->domain map to rot.
```

### 4.1 Why `distill_query` is deliberately NOT repaired

An earlier draft of this spec listed "distill_query stops annihilating the query"
as hygiene. That was wrong, and the correction matters:

- It cannot be fixed alone. The closed lexicon compensates for the
  `overlap / len(query_tokens)` scoring (§2.2); removing the filter dilutes every
  query to zero. Fixing it means redesigning the word-based retriever.
- That retriever serves **five agents** (claude, grok, codex, gemini, opencode).
  Its blast radius is the whole multi-agent surface.
- **We are replacing its role, not repairing it.** Rebuilding the path we are
  routing around is scope creep. YAGNI.

The word path stays as-is, known-broken and now documented. If glob-matching
proves too coarse, redesigning it (or adopting `codebase_hybrid_search`) is a
later, separately-scoped decision.

### 4.2 Verified hook contract (spike, 2026-07-17)

Resolved by experiment, because the local docs do not state it:

- `PreToolUse` **CAN** inject via `hookSpecificOutput.additionalContext`. Proven:
  a marker emitted from a `Write|Edit` hook arrived as
  `PreToolUse:Write hook additional context: ...`. Took effect mid-session, no restart.
- `systemMessage` **does NOT reach the model** — the co-emitted marker never arrived.
  It goes to the user. Designing the trigger on it would have silently failed.
- stdin carries: `tool_name`, `tool_input.file_path`, `session_id`,
  `transcript_path`, `cwd`, `permission_mode`.

## 5. Components

1. **Capability packet** — `SCDNA-CAPABILITY-v1`, one per domain, at
   `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/<domain>.capability.json`,
   beside the gene registry (one substrate, not two). Modelled on
   `createSCDNAGenePacket`: named contract, version, canonical sort, frozen,
   deterministic checksum.

   ```json
   { "contract": "SCDNA-CAPABILITY-v1",
     "version": "1.0.0",
     "domain": "phonology",
     "surfaces": ["codex/core/phonology/**", "scripts/align_lyrics.py",
                  "src/pages/Visualiser/AlbumLyrics.tsx"],
     "capabilities": [
       { "need": "word duration / syllable weight",
         "canonical": "CmuPhonemeEngine",
         "path": "node_modules/cmudict/lib/cmu/cmudict.0.7a",
         "coverage": "95-99% of lyric words",
         "forbidden": ["hand-rolled vowel-group counters",
                       "melismaBonus (orthographic; blind to sung stretch)"] }
     ],
     "checksum": "scd64:..." }
   ```

2. **Capability compiler** — mirrors `compiler.py`: validate, checksum, commit.
   May reject, warn, or emit; **may not add without approval**. History preserved.

3. **Verifier** — `scripts/verify_capabilities.py`, wired as
   `npm run verify:capabilities` (sibling to `verify:bpm`). Every `path` must
   resolve, or exit 1. A capability claim that cannot be falsified does not ship.

4. **Trigger hook** — `scripts/scdna-capability-inject.sh` → a new module.
   `file_path` → glob match → cadence gate (re-arm after 10 edits) → emit
   `additionalContext`. Never denies. Never silently swallows.

5. **Plumbing repair (A)** — the two defects in §2.3 only. `distill_query` is
   left alone by design (§4.1).

6. **Replay harness** — reads a transcript JSONL, extracts ordered `Write|Edit`
   paths, simulates the hook, and answers: *would the packet have fired before
   the duplication event?*

## 6. Data flow

```
AUTHOR     duplication -> candidate surfaced -> DAMIEN REVIEWS -> validate
           -> checksum -> commit -> history preserved
VERIFY     npm run verify:capabilities -> every path resolves -> exit 1 if not
RETRIEVE   PreToolUse(Write|Edit) -> file_path -> glob match surfaces
           -> cadence gate (RE_ARM_EDITS=10) -> additionalContext -> Claude's turn
REPLAY     transcript JSONL -> ordered paths -> simulate -> assert fired-before
```

Traced against the real failure: editing `scripts/align_lyrics.py` matches
`phonology.surfaces`; the packet lands before the edit; it names
`cmudict.0.7a` and forbids hand-rolled counters. **No one had to type "phoneme".**

A glob match is true or false — it cannot fire on an incidental token the way
`pixelbrain` did. The failure mode becomes *no answer*, not *wrong answer
confidently served*.

## 7. Error handling

- **Never costs work.** Never denies; hard timeout; any failure degrades to
  serving nothing, never to blocking the Edit.
- **Never fails silently.** Internal failure emits
  `additionalContext: "capability retrieval failed: <error>"`, deduped and capped
  per session. This is the direct inversion of `except Exception: block = ""`.
- **Checksum mismatch is refused**, not served — uncurated content wearing a
  curated badge.
- **Dead paths are marked STALE at serve time**, not quietly recommended. The
  hook `stat()`s the path it is about to name. The packet carries the means of
  its own refutation and checks it every time it speaks.

Rationale: the failure class this repo keeps producing is not missing
information, it is **confident wrong information** — a fabricated `bpm: 120`
indistinguishable from a measured one; an interpolated `0.0` laundered into
"measured"; a `melismaBonus` that looks like a stretch model and returns 0. An
ageing capability packet is a machine for producing exactly that.

## 8. Testing

Acceptance is the **replay harness** against the 2026-07-17 transcript: would
`phonology.capability.json` have fired before `_span_weight` was written? It also
settles the **cadence** empirically (fire-once vs fire-always vs re-arm: did it land
before the mistake, and how noisy was it?) rather than by intuition.

Selftests (`--selftest`, dependency-free, per repo convention), each written to
be capable of failing:

- **glob match** — a path outside `surfaces` must not fire (anti-wallpaper).
- **cadence** — quiet on the next edit; re-arms after `RE_ARM_EDITS` (=10). Fire-once
  is refuted by the replay (§10.1) and must not be re-introduced.
- **checksum** — mutate a byte, assert refusal.
- **stale path** — dead path is marked STALE, not served as fact.
- **anti-swallow** — force an exception, assert it reaches `additionalContext`.
  *This test fails against today's behaviour, which is why it is worth writing.*
- **never denies** — malformed stdin produces no `permissionDecision`.

CI: `npm run verify:capabilities`.

### 8.1 What these tests cannot prove

The replay proves the packet **would have been present**. It cannot prove it
**would have been heeded**. Today those came apart, hard:
`WAND_CHEMICAL_STROKE_PROPAGATION` fired **four times** and was acted on zero
times; `TOOL_RULE_SEARCH_BEFORE_ASSUME` fired and said *search before assuming*,
and a syllable counter was hand-rolled next to `cmudict` anyway.

**This design fixes reachability, which is provably broken. It does not fix
attention, which is unproven either way.** Short tables, firing at the moment of
authorship, and explicit forbidden-drift lines are hedges against wallpaper, not
guarantees. The real verdict is longitudinal: does duplication recur once the
packets exist? That is a question for the next session that touches phonology,
not for a test suite.

## 9. Scope

**In:** the three layers; one seed packet (`phonology`) drawn from today's
measured evidence; the verifier; the replay harness.

**Out:** auto-generated genes (PDR non-goal); **repairing `distill_query` or the
detector's scoring** (§4.1 — replaced, not repaired); reconciling the two aligners
or three resonance schemas (the packets *document* the split; deciding a winner is
a separate call); renaming the overloaded "gene" (noted, not fixed); semantic /
embedding retrieval (`codebase_hybrid_search` exists — a later option if
glob-matching proves too coarse); authoring phoneme-domain genes for the existing
word path (cheap and independent — a candidate follow-up, not this plan).

## 10.1 Outcome (recorded 2026-07-17, after implementation)

**Implemented and live.** Commits `d03ba68c..76a11a66` on V13. 237 tests pass;
`verify:capabilities` and `verify:bpm` both exit 0.

**Acceptance criterion met.** Replay of session `56188e89`: first hit **edit #14**
(`scripts/align_lyrics.py`), the `_span_weight` duplication **edit #51**, gap **37
edits**. `RE_ARM_EDITS = 10` serves at #14/#33/#51 — landing on the duplication.

**Verified live in the same session as the mistake.** Editing `align_lyrics.py`
injected the phonology table, containing verbatim:

> DO NOT: hand-rolling a vowel-group syllable counter — 'strength' is 1 syllable
> and 7 phonemes

delivered without anyone typing "phoneme". The next edit to the same file was
silent (re-arm holds); an off-surface write was silent (anti-wallpaper).

**The corpus is alive — a plan defect found in execution.** The pinned transcript
is the session doing the work: it grew 7.25MB→8.11MB and 74→84 edits *while the
plan ran*. The plan said "treat any deviation as a bug in your extractor, not as
new truth" — wrong. Only the past gap (#14/#51) is stable. Running the project
mutates the corpus that accepts it.

**Defects the review loop caught in this project's own code** (each verified live,
not argued):
- `capability_inject.main()` raised `AttributeError` on a non-dict `tool_input`,
  and the shim's `exit 0` masked it — the module written to invert
  `except Exception: block = ""` had reproduced it at the shell level.
- `replay_capabilities` whitelisted `NotebookEdit` but read `input["file_path"]`;
  NotebookEdit's schema uses `notebook_path`, so every one was silently dropped —
  a notebook-only domain would have got a confident, wrong NO HIT.
- `scan_bpm.declared_bpm_for` matched a **commented-out** `//  bpm: 0` in
  `maze-screensaver.ts`, which shares a track id with `polarity.ts` (real 93).
  `Path.glob` is filesystem-ordered, so which won was luck, and `period_for(0)`
  raises — `npm run verify:bpm` would have crashed non-deterministically elsewhere.

**§8.1 stands, unresolved by any of this.** Every result above proves the packet is
PRESENT. None proves it will be HEEDED. `WAND_CHEMICAL_STROKE_PROPAGATION` fired
four times in this session and was acted on zero times. Reachability is fixed and
measured; attention is not. The verdict is longitudinal: does duplication recur in
the next session that touches phonology?

## 10. Open questions

1. ~~**Dedupe cadence**~~ — **ANSWERED by replay, 2026-07-17.** Session
   `56188e89`: 74 edits, 14 on phonology surfaces, first hit **#14**, the
   `_span_weight` duplication **#51**. Fire-once is **refuted** — it serves 37
   edits early, during a task about anchor rules, and is long stale by the moment
   it exists to prevent. Fire-always lands but serves 14×. A **re-arm window of
   10 edits** serves at #14/#33/#51: three times, and it lands on the
   duplication. `RE_ARM_EDITS = 10`. Re-measure with
   `scripts/replay_capabilities.py` before changing it.
   *The guess in the design review ("fire-once may land hours early") was right,
   and would have shipped anyway had the harness not been run first.*
2. **Which domains after `phonology`** — candidates: `resonance` (three schemas),
   `alignment` (two aligners), `visualiser-pacing` (bpm seeds the fingerprint).
3. **Does `verify:capabilities` block CI or only warn** on a dead path?
