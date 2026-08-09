# Nervous System v1 — Adjudicated Semantic Hubs — Design — 2026-08-09

**Status:** approved design, not implemented.
**Scope:** retrofit the hub layer that already exists; prove or refute the premise before building a graph.

---

## 1. What already exists

Three of the five layers the nervous-system proposal describes are already in the
tree. Naming them precisely matters, because v1 is mostly *connective tissue and
verification*, not new machinery.

| Layer | Exists as | State |
|---|---|---|
| Curated hubs | `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/*.capability.json` | 4 domains: `career-ats`, `divtube-cockpit`, `phonology`, `pixel-art-direction` |
| Hub → file binding | the `surfaces` glob list in each capability | present |
| Delivery to agents | intent-match injection hook | already fires per task |
| Physical localization | Telescope | shipped |
| Implementation verification | Microscope, Eval lens | shipped |
| Semantic adjudication | `codex/core/semantic-calculus/kind.ts` + the `cleri-gate` pattern | shipped |
| **Typed bridges between hubs** | — | **absent** |
| **Verification of hub claims** | — | **absent** |
| **Routing / traversal** | — | **absent** |

A capability entry is shaped:

```json
{
  "need":      "semantic SEO / niche match scoring of titles & content (0-100)",
  "canonical": "TurboQuantService (tui/services/turboquant_service.py) — …",
  "path":      "divtube_downloader/tui/services/turboquant_service.py",
  "evidence":  "degrades gracefully (self.available == False) when Node is unavailable …",
  "forbidden": ["re-implementing scoring in Python — the engine is the Node microservice", …]
}
```

### The hole this design exists to close

Nothing verifies a capability against reality. There is no existence check on
`path` anywhere in the capability system. `contradictions.py` detects
*gene-versus-gene* conflicts — two genes disagreeing with each other — not
*gene-versus-repo* drift.

The curated layer therefore **cannot currently fail**. If a canonical module were
renamed tomorrow, the capability would keep confidently routing every agent to it,
and the injection hook would keep asserting it with full authority.

That is this repository's named recurring pathology (see
`project-checks-that-cannot-fail`) sitting inside the system the proposal wants to
expand — and myelination would amplify it, because a frequently-traversed stale
edge becomes a *cheap, high-priority, confidently wrong* route.

---

## 2. The failure being fixed

Selected as the dominant costs, in order:

1. **Confidently stale guidance** — authoritative-looking assertions that used to be true.
2. **Wrong entry point** — the agent reviews the file it was handed and misses the one that decides the outcome.
3. **Context burn** — too many calls to locate the relevant neighbourhood.

**Blast radius is explicitly not a v1 goal.** It appeared in the original
proposal but was not selected; it is a downstream benefit once bridges exist.

### Measured instances (2026-08-09 session)

- **Wrong entry point.** A review of `grimoire/extrapolation-simulation.js` missed that
  the run's outcome was decided in `scripts/cyclotron-extrapolation-simulation.mjs`,
  where the purity bar sat at `1.000` and made the gate arithmetically unpassable.
  A `feeds` / `consumed-by` bridge routes there in one hop.
- **Untracked dependency.** `tool_service.py` referenced `code_lens.py` while
  `code_lens.py` was untracked, so `HEAD` imported a module it did not contain.
- **Candidate drift.** The `divtube-cockpit` gene tells callers to resolve node via
  `harness_tools` rather than hardcode a path; `resolve_node_bin_dir()` itself carries a
  pinned `/home/deck/.nvm/versions/node/v20.20.2/bin` preference. It is guarded by an
  existence check and falls through to `NVM_BIN`, a glob and `shutil.which`, so this is a
  defensible fallback rather than a proven violation — it is exactly the class of tension a
  sweep should surface for a human to rule on, and precisely the class nothing checks today.

---

## 3. Architecture

### 3.1 Two files, one direction of writing

```
scdna/capabilities/<domain>.capability.json                      claims + assertions
                                                                 — never machine-written

docs/superpowers/evidence/2026-08-09-nervous-sweep-<domain>.md   kinds + evidence
docs/superpowers/evidence/2026-08-09-nervous-sweep-index.md      census
                                                                 — never hand-written
```

The generated side is written **per domain plus an index**. One hardcoded output
path is how the construction autopsy erased the tables that justified the compound
family: a receipt the next run overwrites is not a receipt.

Keeping machine state out of the curated file prevents hand-editing of adjudications
and keeps sweep diffs readable.

### 3.2 Data flow

```
capability.json (claim + assertion)
      │
      ▼
  nervous-probe.py         fs: path resolves?
                           code_lens: symbol exists? test references it?
                           code_eval: does it return that shape?
      │
      ▼
  evidence JSON            passed | failed | UNCHECKABLE
      │
      ▼
  nervous-gate.mjs         semantic-calculus kind.ts
      │
      ▼
  Do · Probe · Clarify · Hypothesis · Theory
      │
      ▼
  router                   traverses Do/Clarify · flags Hypothesis · Theory routes nothing
```

### 3.3 Why two processes

The prober needs `code_lens` / `code_eval`, which are Python. The calculus is
TypeScript and costs a measured 4.5× startup tax under `tsx` (295 ms → 1320 ms) —
the stated reason `cleri-gate.mjs` is a separate tool rather than a flag on the
probe. v1 follows that existing split rather than inventing a new shape:

> The calculus adjudicates RESULTS; it takes no part in producing them. The probe
> gathers evidence and says what it verified. This says what that warrants — and,
> more importantly, what it does not.
> — `scripts/cleri-gate.mjs`

---

## 4. The assertion vocabulary — the admission policy

A claim is admissible only if it names one of these. Anything not expressible here
deposits as `Theory` and is never routable.

| Assertion | Resolver |
|---|---|
| `path-exists(file)` | `os.path.isfile` |
| `symbol-exists(file, symbol)` | `code_lens.symbols_for_file` |
| `symbol-returns(file, symbol, shape)` | `code_eval.evaluate` |
| `test-references(test, symbol)` | `code_lens._cross_reference` |
| `absent-under(glob, pattern)` | absence check for `forbidden` claims |
| `imports(a, b)` | parse `a`'s import statements and look for `b` |

`imports(a, b)` is resolved **pairwise on demand** — parse one named file, look for
one named target. It does not require and does not build the repo-wide import
graph, which section 11 defers. Only pairs a claim actually names get parsed.

### Bridge types must each be backed by an assertion

| Bridge | Backing assertion |
|---|---|
| `uses`, `depends-on` | `imports(a,b)` or `symbol-exists` |
| `validated-by` | `test-references` |
| `feeds`, `consumed-by` | `imports` reversed, or a named API/event symbol |
| `conceptually-related-to` | **none exists** |

`conceptually-related-to` has no resolver, so it cannot bind. It deposits as a note
beside a hub and never becomes traversable. To make such a relationship routable it
must be restated with a slot that resolves — `shares-contract-with <schema>`,
`co-changed-with <file> in <N> commits`.

---

## 5. Kind mapping

`kind.ts` supplies `Theory · Hypothesis · Clarify · Probe · Do`, with
`DEPOSITING_KINDS = {Theory, Hypothesis}` already meaning "store but never act".

| Kind | Edge meaning | Routing |
|---|---|---|
| `Do` | binds; every required slot resolved | low-cost route |
| `Probe` | bound, read-only — a traversal is itself a Probe | the query kind |
| `Clarify` | binds; one required slot unresolved | routable only after one bounded question |
| `Hypothesis` | does not bind; proposer supplied a candidate | stored; `assertExecutable` throws; never routed as fact |
| `Theory` | nothing bound | deposited; not an edge |

### Traversal cost comes from kind, never from traffic

The original proposal myelinates by verification frequency. That is a
rich-get-richer loop: cheap routes get taken, taken routes get cheaper, and the
weak-but-correct edge needed for a surprising result is buried — the cyclotron case
is exactly such an edge.

Under this design, cost derives from **kind**, and kind is recomputed from fresh
evidence every sweep. Frequency is never an input, so no reinforcement loop can
form, and an edge sliding `Do → Theory` is a reportable event rather than silent rot.

### The chemistry ranks; the calculus decides

Concept chemistry is ordinal, and the standing refutation is that controls set bars,
never constants. Chemistry may rank which candidate hubs surface and in what order.
It must never appear in an admission test. `admit if chemScore > 0.7` would rebuild
the refuted pattern.

---

## 6. `UNCHECKABLE` is not `false`

The single most important rule in this design.

Node missing, file over the size cap, a symbol the JS regex extractor cannot see —
all resolve to **unknown**, which types as `Clarify` (a required slot could not be
resolved). Never `Theory`.

Collapsing "checked and false" into "could not check" is the failure `cleri-gate`
was built to catch, where a bare `NO VERIFIED FINDINGS` header reads as a clean bill
of health but means "these verifier families proved nothing over the retrieved
candidates". Collapsed one way the sweep reports live guidance as dead; collapsed
the other, dead guidance as healthy.

**An absent edge types as `Theory` — "nothing bound" — never as "these systems are
unrelated."** The graph must be able to say *I don't know*.

---

## 7. Routing

`route(question)` returns top-k hubs, each with entry-point files, the kind of each
edge, and the specific assertions that passed — the answer carries its own warrant.

**No spreading activation in v1.** k-hop traversal with an explicit budget. Concrete
v1 defaults, all caller-overridable and all reported in the result so a truncated
answer is visibly truncated:

| Budget | Default |
|---|---|
| hubs returned (`k`) | 3 |
| hops from the seed hub | 2 |
| entry-point files per hub | 5 |

The budget is the stop condition, and is also the context-economy lever. Unbounded
activation either lights the whole repo or is silently truncated by a threshold
nobody can see.

---

## 8. Failure modes

| Condition | Behaviour |
|---|---|
| Prober cannot run at all (no node, no `.venv`) | distinct non-zero exit, whole sweep marked `UNCHECKABLE`; must never emit "all healthy" after checking nothing |
| `surfaces` glob matches zero files | the hub types `Theory` — a finding, not an error |
| `symbol-returns` target is not purity-declared | `UNCHECKABLE`; a verification pass must not trigger side effects. Uses the existing `declaredPure` flag |
| `forbidden` entry is prose with no mechanical pattern | types `Hypothesis` — still injected as guidance, marked non-executable, not claimed as verified |

**Expect the first sweep to reclassify most `forbidden` prose downward to
`Hypothesis`.** That is correct and honest, but it visibly changes what the injection
hook asserts, so it is called out here rather than discovered afterwards.

---

## 9. Testing

TDD throughout, with real-repository ground truth as `test_code_lens.py` already
does it rather than toy fixtures.

Required tests:

- real path + real symbol → `Do`
- path deleted → `Theory`
- **resolver could not run → `Clarify`, not `Theory`** — the collapse test; the single most important test in the suite
- absence claim with no mechanical pattern → `Hypothesis`, and `assertExecutable` throws on it
- same tree swept twice → identical adjudication
- meta-test: corrupt a capability in a temp copy, sweep, assert the corruption is detected

The verifier must be shown failing before it is trusted to pass.

---

## 10. Success criteria

**Primary — the first sweep is a falsification experiment, not a build.**
It produces a kind census over the four existing capabilities. If any entry that
currently reads as authoritative guidance types `Theory`, the premise is confirmed
and the rest of the design is worth building. If none do, stale guidance is not the
dominant failure, and the remainder should not be built. Cost of learning this: one
script.

**Secondary — this session's own failure as the benchmark.**
`route("why did the extrapolation slate produce zero nuclei")` must surface
`scripts/cyclotron-extrapolation-simulation.mjs`, not only
`grimoire/extrapolation-simulation.js`. That is the wrong-entry-point failure
actually made, so it is the one worth passing.

---

## 11. Not in v1

- Spreading activation
- Myelination and traversal-cost tuning
- The repo-wide derived import graph (revisit once `route()` exists and its misses are visible)
- Blast radius
- A proposal API — agent proposal is "edit `capability.json`; the sweep admits or rejects". No API until the sweep has proven it catches drift.
- CI gating. v1 reports and exits 0. Gating on absolute state would fail the build on accumulated drift on day one and be switched off; once a baseline exists, gate on **regression** (`Do` → `Theory`), which is the signal that matters.

---

## 12. Deliverables

```
scripts/nervous-probe.py                          claims → evidence JSON
scripts/nervous-gate.mjs                          evidence → kinds + report
codex/core/nervous/assertions.py                  vocabulary + resolvers (pure)
codex/core/nervous/router.py                      route(question) → hubs, bounded
docs/superpowers/evidence/2026-08-09-nervous-sweep-<domain>.md   per domain
docs/superpowers/evidence/2026-08-09-nervous-sweep-index.md      census
tests/…                                           per section 9
```

Capability files gain a `verification` block per claim. The `SCDNA-CAPABILITY-v1`
contract becomes `v2`; the checksum field is retained and recomputed.
