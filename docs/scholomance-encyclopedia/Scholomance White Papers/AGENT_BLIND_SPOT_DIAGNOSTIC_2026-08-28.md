# Agent Blind-Spot Diagnostic — 2026-08-28

> **Update, same day.** All twelve sites in §7's remediation table are fixed, TDD'd, and committed (`785c417f` for the 7 `steamdeck_brain` sites, `f523e00c` for the 6 `divtube_downloader` sites — 13 counted there because the wire-protocol fix for `gateway.py`'s snapshot rippled into `protocol.py` and `event_hub.py` as one unit). Every fix preserves the original fail-open/fail-safe behavior (a broken history backend still doesn't crash a turn; a broken snapshot provider still doesn't break a reconnect) and adds only the missing distinction: a caller can now tell "confirmed absent" from "could not confirm," either via a distinct exception (`DictionaryUnavailable`, `EvidenceLookupError`) or a logged warning, or — for the highest-severity site, the phone-facing snapshot — an explicit `degraded: bool` on the wire. §7 below is preserved as originally written, describing the state at diagnosis time; treat it as history, not a live TODO list.

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-DIAG-AGENT-BLIND-SPOT-2026-08-28`

## What This Is

A directed self-test: use the Vaelrix ForceField brain network — repaired and verified reachable earlier today (`VERDICT-2026-08-28-VAELRIX-FORCEFIELD-BRAIN-NETWORK-FULL-CLOSURE.md`) — to try to surface flawed logic in my own reasoning that I would not catch by simply re-reading my own work. Not a demonstration. Real tool calls, real findings, one real negative result, and one real bug pattern discovered and reproduced by hand once the tool's own limits became clear.

**Auditor:** `claude`, same-session self-audit, immediately following the Brain Network closure work.

---

## 1. Method

The premise: a model reviewing its own code shares the blind spots that produced it. An external tool that gathers *evidence* rather than *opinions* has a chance of surfacing something a self-review would rationalize past — but only if the tool's own evidence-gathering is itself sound, which was worth testing rather than assuming, given today's earlier finding that this same brain network had been silently non-functional for months.

Three real queries were run against the live network (`direct_brain.forcefield_ask`, deterministic mode — the only mode that exists):

1. *"risk assessment of the changes I made to amplifier_registry.py and the brain activationSignals fixes today"*
2. *"is it safe to swallow exceptions and return None or empty results silently in the brains I wrote"*
3. *"critique the test suite I wrote today for the forcefield brain fixes"*

And one direct, single-brain call:

4. `run_specific_brain("CODE_BRAIN", "bare except Exception swallowing errors and returning None as if nothing was found")`

---

## 2. First Result: An Anomaly, Investigated, Not Papered Over

The first run of queries 1–3, executed in a single Python process immediately after this session's commits landed, returned **empty findings for all three** — no DETERMINISM_BRAIN entry, no RISK_BRAIN entry, nothing, despite both being expected to fire unconditionally or via an obvious keyword match.

This was not accepted at face value. Re-running the identical three queries in a fresh process produced full, correct results (CODE_BRAIN evidence, RISK_BRAIN's honest "no keyword match" disclaimer, DETERMINISM_BRAIN's unconditional pass) on the first attempt, and remained correct on a further identical retry immediately after. The anomaly did not reproduce.

**Disposition:** flagged, not resolved. Given the volume of module reloading, sqlite connection caching (`_scholomance_dict.py`'s module-level `_connection_cache`), and freshly-edited `.pyc` files in the seconds immediately following a commit, a transient first-run race is the most likely explanation, but this was not proven — only the non-reproducibility was. Recorded here rather than silently retried until it went away, which is exactly the discipline the rest of this report is about.

---

## 3. Second Result: The Tool's Own Blind Spot (a Negative Finding)

Query 4 — asking CODE_BRAIN directly, in plain language, to find "bare except Exception swallowing errors and returning None" — did not find it. It returned six independent single-word ripgrep hits (`bare`, `except`, `Exception`, `swallowing`, `errors`, `returning`), each capped at 3 example files, dominated by generic matches across hundreds of files project-wide. None of the six new files this session actually wrote the pattern into appeared in the truncated output.

This is a genuine, useful negative result, not a failure to hide: **CODE_BRAIN tokenizes a query into independent keywords and ripgreps each one separately** (confirmed by reading `code_brain.py`'s `_extract_keywords`/`_ripgrep_keyword`). It has no concept of a multi-line structural pattern (`try: ... except Exception: return None`) and no way to correlate "except" appearing near "return None" a few lines later. It can find *words*. It cannot find *shapes*.

This matters beyond this one test. It means: **the brain network is not, and cannot currently be, a substitute for a structural code-quality reviewer.** It is a fast, real, evidence-grounded keyword-and-fact retriever. Treating its silence on a query as "nothing's there" would be exactly the anti-pattern this report goes on to describe.

---

## 4. Third Result: The Actual Finding, Found By Hand, Then Proven

Once it was clear the tool couldn't find a structural pattern by query alone, the natural next step was to look directly — the same move CODE_BRAIN's own scoring logic exists to avoid needing, but which a human (or a synthesizing agent) still has to make when the retrieval layer's reach runs out.

Direct inspection of every file changed in today's brain-network repair work found the same shape, six times:

| File | Function | Pattern |
|---|---|---|
| `_scholomance_dict.py` | `_connection()` | `except Exception: ... return None` |
| `_scholomance_dict.py` | `ipa_for_word()` | `except Exception: return None` |
| `_scholomance_dict.py` | `rhyme_for_word()` | `except Exception: return None` |
| `lore_brain.py` | `_quote_term_definition()` | `except Exception: continue` |
| `architecture_brain.py` | `_quote_law()` | `except Exception: return None` |
| `ui_brain.py` | `_quote_design_system()` | `except Exception: return None` |
| `pixel_brain.py` | `_read_manifest()` | `except Exception: return None` |

Every one collapses two different truths into the same return value: *"I looked, and there genuinely is nothing"* and *"something broke while I was looking, so I don't actually know."* A caller receiving `None` cannot tell which happened.

**This is structurally the same bug as the one this entire session started by finding and fixing** — `DETERMINISM_BRAIN` reporting an identical false "no stable seed" warning on every call regardless of query content, a check that could never distinguish signal from a constant. The direction is inverted (a constant false positive vs. a collapsed false negative) but the failure mode is the same: the system's silence, or its noise, does not carry the information a caller needs to trust it.

### 4.1 Proof, Not Assertion

A broken database connection was simulated (the real-world equivalent: a lock contention, a corrupted page, a permissions error — all things that actually happen to a 233MB sqlite file on a shared machine):

```
ipa_for_word() with a genuinely broken connection: None
ipa_for_word() with a real, legitimate out-of-vocabulary word: None
```

Identical. Traced one layer up, to what a caller actually sees:

```
PHONEME_BRAIN's finding, with the connection broken:
"Approximate (letter-based) vowel/consonant ratio: 31%/69% — no words found
in the dictionary; real ARPAbet data unavailable for this text."
```

That sentence makes a claim about the *text* ("real ARPAbet data unavailable for this text") when the true cause has nothing to do with the text at all — it is a claim manufactured to explain a symptom whose real cause was never observed. This is not a hypothetical edge case; it is the exact sentence any caller would have received, worded as if it were informative, while being actively wrong about why.

### 4.2 This Is Not a One-Off — It Recurs Across the Whole Session

Checked against every commit from this session, not just today's:

| Commit | Feature | Silent-collapse sites |
|---|---|---|
| `27d55bf4` (earlier today) | Adaptive tool recommender / prompt caching | 4 (`_history.record` swallowed; `similar_task_tool_counts` failure → indistinguishable `{}`; tool selection failure → silent full-catalog fallback with no signal; `record_usage` swallowed) |
| `399822ba` (today) | Six brains reconnected to real data | 6 (table above) |
| `129cd3c3` (earlier today) | Mobile agent tool selection | 1 (`_task_tools`'s recommender call: any failure silently narrows to core tools only, no signal) |
| `7b1dcd47` (earlier today) | Mobile companion live-state reporting | 1 (`snapshot_provider()` failure silently reports `{"state": "idle"}` — a genuine host-side error would be indistinguishable from the phone's perspective from an actually-idle host) |

**Fourteen `except Exception:` blocks were added by this author across the session; at least twelve of them collapse "legitimately nothing" and "something is broken" into the same observable output**, with no log line, no distinct return shape, no signal a caller could act on.

The last row is worth sitting with. Earlier this session, a real production symptom was investigated: *"coding partner mode started a task but never did anything with it, and worse, I couldn't click on the task and see what the agent was doing."* That investigation found a different, real cause (a disconnected `controller`, not this). But the `snapshot_provider()` fallback above is structurally the exact shape that produces "everything looks idle, nothing looks wrong, and there is no way to tell from the outside" — the same *class* of symptom, sitting in code written the same day. This report does not claim it caused that specific incident; it was not re-verified against that incident's actual root cause. It is reported because the structural resemblance is real and because not reporting a near-miss for the sake of a cleaner narrative would be its own instance of the pattern this paper is about.

---

## 5. Root-Cause Hypothesis

The question worth asking is not "was this a mistake" — fourteen instances in one session settles that — but *why it kept happening after the general principle was already, explicitly, in hand.*

Two facts make this pointed rather than generic:

1. **The correct pattern already existed, unedited, in the very package these fixes were written into.** `amplifier_executor.py`'s `run_amplifiers()` — code this session read carefully and did not touch — already converts a brain's exception into a visible `AmplifierResult(summary=f"Brain execution failed: {exc}", findings=[f"Execution error: {exc}"])`, never a silent `None`. The right answer was sitting one file away from every quote-helper written today.
2. **This session's own words state the general principle directly.** `RISK_BRAIN`'s docstring, quoted and praised in this session's own Verdict: *"Silence is not safety... an ALL-CLEAR and never was one."* That sentence is exactly the diagnosis for `_scholomance_dict.py`'s `except Exception: return None`. It was written, understood, and applied to *someone else's* code, in the same file tree, the same day, without the same lens turning back on the code being written to fix it.

The likely mechanism: this session was pattern-matching on the *specific shape* of the bugs it went looking for — a constant literal (`DETERMINISM_BRAIN`), a filename-only glob (`PIXEL_BRAIN`), a hardcoded score (`RISK_BRAIN`'s prior version) — and correctly eliminated each one. But the actual defect class those bugs belonged to is broader: *any place where a "nothing found" result and a "the mechanism to find it broke" result are observably identical.* Fixing the instances that were being looked for, without re-deriving the general principle behind them and checking new code against it, is a known failure mode in exactly the terms this project's own memory already names it: fixture (and fix) authorship inherits the author's blind spots. The fixes did not inherit the bug being fixed. They inherited the narrower lens used to find it.

---

## 6. What This Means Going Forward

**For the brain network:** it is a real, verified, evidence-gathering tool for *words and facts* — dictionary lookups, packet checksums, keyword-scoped ripgrep hits, real project-doc quotes. It is measurably not yet capable of finding a structural anti-pattern from a plain-language description of one; that requires either a smarter retrieval layer (AST-aware search, not word-bag ripgrep) or a synthesizing reasoner reading the raw evidence with judgment — which, per this session's own architecture decision, is deliberately the calling agent's job, not the brain network's. That division of labor held up under this test. It is worth knowing precisely where it holds.

**For this author:** treat "I already fixed the bug shaped like X" as evidence that governs nothing about new code being written in the same sitting, in the same domain, under the same time pressure. The check that would have caught this — *does every new `except` clause distinguish "confirmed absent" from "could not confirm"* — is cheap, mechanical, and was not run, because the working attention was on the six brains' domain logic, not on the plumbing being written to reach it.

---

## 7. Recommendations (as originally written — all now implemented, see update note at top)

This report describes what was found. It does not fix it — that is a separate decision, not bundled into a diagnostic.

| Site | Fix shape | Cost |
|---|---|---|
| `_scholomance_dict.py` (3 sites) | Return a tagged result (`{"found": False}` vs `{"error": ...}`) instead of a bare `None` for both cases; callers already branch on truthiness, so this requires touching 2 call sites in `phoneme_brain.py`/`rhyme_brain.py` too | ~2 hours |
| `lore_brain.py`, `architecture_brain.py`, `ui_brain.py` quote-helpers (3 sites) | Same shape; findings should say "citation lookup failed" distinctly from "no citation exists" | ~1 hour |
| `prompt_service.py` adaptive-recommender fallbacks (4 sites) | At minimum, log the swallowed exception once (not silently); consider whether "fall back to full catalog" vs "fall back to core-only" should itself be a tested, deliberate choice rather than an incidental side effect of two different call sites independently choosing different fallbacks | ~2 hours |
| `mobile_coding_adapter.py` `_task_tools` (1 site) | Same as above | ~30 min |
| Mobile companion `snapshot_provider()` fallback (1 site) | Distinguish "host reports idle" from "host status unreachable" at the wire-protocol level, not just the Python fallback — this is user-facing and the highest-severity of the twelve | ~2-4 hours, needs the Android side too |

This was the state at the time of diagnosis, when nothing above had been implemented — it was reported first, not silently repaired, the same standard this report applied to everything else. All of it was implemented same-day once explicitly requested; see the update note at the top of this document for the commits.

---

*Diagnostic rendered 2026-08-28, immediately following `VERDICT-2026-08-28-VAELRIX-FORCEFIELD-BRAIN-NETWORK-FULL-CLOSURE.md`.*

*— `claude`*
