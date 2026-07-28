# Polaris OS — Milestone 6: Hardening — Post-Implementation Review

**Date:** 2026-07-28
**Status:** ✅ COMPLETE
**Tests:** 281 passing (33 new: 7 Milestone6Gate integration + 7 DiagnosticLogger + 6 RateLimiter + 8 sanitize + 5 registerPlayer)
**Typecheck:** 0 errors
**Lint:** clean (`eslint . --report-unused-disable-directives --quiet`)
**Browser verification:** desktop + mobile headless-Chromium smoke runs — canvas renders, scenario plays, mobile stacks in PDR §20.2 order, zero console errors

---

## 1. Objective

Implement PDR §25 Milestone 6 (Hardening) and satisfy the P0 security (§21), observability (§22), and QA (§23) requirements that the earlier milestones left implicit. The goal is the Milestone 6 exit criterion:

> **"Every acceptance criterion passes without manual repair."**

Milestones 1–5 proved the causal loop *works*. Milestone 6 proves it *cannot be broken* by the things a live multiplayer service actually encounters: network retries, floods, malformed clients, process crashes, and reconnects — and that every transition is observable through structured records rather than prose.

### Deliverables (PDR §25, Milestone 6)

| Deliverable | Status | Where |
|---|---|---|
| race-condition tests | ✅ | `Milestone6Gate` M6-7 (+ existing `RoomActor` RACE, `Milestone3Gate` M3-2) |
| forced-restart tests | ✅ | `Milestone6Gate` M6-1 (file DB → kill → fresh process → reconnect) |
| duplicate-message handling | ✅ | `GameServer` at-most-once gate + `Milestone6Gate` M6-2 |
| resynchronization tests | ✅ | `Milestone6Gate` M6-3 (reconnect-after-missed-mutations + explicit resync) |
| mobile review | ✅ | `polaris-console.css` §20.2 breakpoint + browser verification |
| protocol validation | ✅ | `Milestone6Gate` M6-4 (invalid JSON / unknown type / oversized) |
| logging | ✅ | `DiagnosticLogger` (§22) + `Milestone6Gate` M6-6 |

Plus two P0 security items from §21 that the deliverables imply:

| §21 requirement | Status | Where |
|---|---|---|
| rate-limit command submission | ✅ | `RateLimiter` + `Milestone6Gate` M6-5 |
| sanitize chat output | ✅ | `sanitize.ts` (defense-in-depth; client already renders `textContent`) |

---

## 2. Critical Architecture Decisions

### 2.1 Duplicate messages: a synchronous at-most-once gate, not a post-hoc cache

The naïve fix — "cache a commandId after it commits, replay the cache on a retry" — has a race. `onCommandSubmit` is async; two identical submissions run their synchronous prefixes before either reaches the first `await`. If the cache is only populated *after* `actor.enqueue` resolves, both duplicates pass the check, both enter the serialized actor, and the second re-derives **identical eventIds** (eventIds are `hash(worldId:commandId:index:ruleset)`) — so the kernel throws `DUPLICATE_EVENT_ID`. That throw propagated as an **unhandled promise rejection**: a client retry could crash the server. This was a real latent bug, not a hypothetical.

**Decision:** the commandId is **claimed synchronously, before the first `await`** (`claimCommand`). On the single-threaded event loop, the first submission's synchronous prefix (rate-limit → dedup-miss → bind → claim) completes before the second submission's prefix starts, so the second sees the claim and short-circuits. The claim holds a `settled` promise; a concurrent duplicate `await`s the original's terminal outcome and **replays it** (accepted → ack + fresh snapshot; refused → cached refusal) instead of re-executing. The slot is kept in a bounded LRU (cap 2048; only *settled* slots are evicted, so an in-flight slot a duplicate is awaiting can never disappear). A `try/catch` around `actor.enqueue` is defense-in-depth: any slipped-through executor failure becomes a clean `INTERNAL_ERROR` refusal + `transaction.failed` log, never a crash (PDR §13.3).

This gives true **at-most-once execution per commandId**, which is exactly what "duplicate messages do not duplicate mutations" (§23) requires.

### 2.2 Structured observability as a single injection point (§22)

§22 mandates a fixed set of diagnostic fields (`requestId, commandId, playerId, worldId, roomId, roomRevision, eventSequence, rulesetVersion`) and a fixed set of events (connection opened/closed, command received/accepted/refused, transaction failed, revision conflict, resync requested, snapshot loaded, event replay completed, scene manifest generated), and forbids diagnostic paths that "depend solely on unstructured log sentences."

**Decision:** `apps/server/src/DiagnosticLogger.ts` is the single emission point. It emits `{ ts, level, event, fields }` records to an **injectable sink** (default: a quiet no-op; `consoleDiagnosticSink` emits one JSON line per record). It is application-layer glue with **no domain or infrastructure imports**, it **never throws** (a failing sink is swallowed so observability can never take down the authoritative loop, §13.3), and every §22 event has a typed convenience helper that assigns the correct severity (refused/conflict/violation/rate-limit → `warn`, transaction-failed → `error`). `GameServer` wires it onto every required transition. Tests capture records via the sink and assert both the event coverage and the full field set.

### 2.3 Rate limiting and sanitization are pure, injectable, and boundary-only

`RateLimiter` (per-connection sliding window) and `sanitizeText`/`sanitizeChat` are **pure modules with injectable clocks / total input handling**, so they are unit-testable in isolation and carry no infrastructure. The limiter is checked **before** binding so a flood never reaches the serialized actor; rejected attempts don't consume budget, so a client that backs off recovers as old attempts age out. Sanitization strips non-printable control characters, collapses whitespace, trims, and caps length — but deliberately preserves unicode prose (accents, CJK, emoji). It is **defense-in-depth**: the client already renders every narrative/telemetry string via `textContent` (never `innerHTML`), so HTML/JS injection is neutralized at the render layer; sanitization keeps the *ledger* and *projected prose* clean.

### 2.4 A reconnect must refresh presence, never destroy inventory (kernel bug fix)

`registerPlayer` (the runtime join path used by `proposePlayerJoin`) **unconditionally reset `inventoryIds: []`**. On its own this is invisible in the happy path, but Milestone 6's forced-restart + reconnect test exposed it: after a restart, the ledger replay correctly rebuilds the owner's inventory (`applyEvents` reuses an existing player record), but the moment the owner **reconnected**, the re-join wiped `inventoryIds` — and because `collectVisibleEntities` keys visibility off `player.inventoryIds`, the lantern would *vanish from the owner's own inventory panel*. That violates §5.6 (persistent causality) and §24.13 ("the lantern owner remains correct").

**Decision:** `registerPlayer` now preserves `existing?.inventoryIds ?? []`. A join refreshes presence (`roomId`, `connectionState`); it never destroys what a player carries. A brand-new player still starts empty. Locked in by `packages/world-kernel/tests/registerPlayer.test.ts`, including an end-to-end replay-then-reconnect case.

### 2.5 Mobile layout: `display:contents` flattening + ordered single column (§20.2)

The console was desktop-first (3-column grid) with a 1280px fallback but **no mobile breakpoint** — on a phone the grid stayed cramped and unusable. §20.2 specifies a stacked order: Illustrated Room → Room Description → Narrative Feed → Inventory Drawer → Command Input. The DOM nests scene/chronicle/command *inside* `#polaris-center-stack`, while inventory (`#polaris-bearing-rail`) is a sibling, so the panels can't be reordered by ordering the three top-level children alone.

**Decision:** at `max-width: 720px` the workspace becomes a flex column and `#polaris-center-stack` uses `display: contents` — accessibility-safe because it is a non-semantic `<div>` (only the box dissolves, not the children) — so all five panels become direct flex items and can be `order`-ed exactly per §20.2 (scene 1 → chronicle 2 → inventory 3 → command 4 → telemetry 5), with a `position: sticky` command input so it stays reachable while scrolling.

**Cascade caveat (documented in the CSS):** in this bundle the base layout rules (`#polaris-workspace{display:grid}`, `#polaris-center-stack{display:flex}`, the 1280px `telemetry{position:fixed}`) win the cascade against later *equal-specificity* media overrides — verified empirically via CSSOM (a plain appended override lost; only `!important` won). The three competing `display`/`position` flips are therefore `!important`; `order`/`flex-direction`/`max-height` have no base competitor and need none. This is a legitimate, narrowly-scoped use of `!important` for a breakpoint override.

---

## 3. Verification

### 3.1 `tests/integration/Milestone6Gate.test.ts` (7 tests)

Boots the **real** `GameServer` per scenario and drives real `ws` clients:

- **M6-1 forced restart** — commit `take lantern` + `light brazier` to an on-disk SQLite file, terminate the process, boot a **brand-new** server on the same file (fresh in-memory session that *must* replay the ledger), and assert: (a) the restored session state has the lantern in the owner's inventory + the brazier lit, independent of any client; (b) the owner reconnects and her snapshot still shows the lantern held + warm firelight (§24.13–15); (c) the replay/snapshot log fired on boot.
- **M6-2 duplicate idempotency** — submit the *same* commandId twice; assert exactly **one** `ENTITY_TAKEN` is ever broadcast, the duplicate is logged with `duplicate: true`, and `/health` still answers (no unhandled rejection).
- **M6-3 resynchronization** — a player disconnects, misses two mutations, reconnects, and converges to the true state; an explicit `state.resync.request` returns a snapshot whose sequence is ≥ the prior and is logged (§5.4, §17.4).
- **M6-4 protocol validation** — malformed JSON, an unknown message type, and an oversized `rawInput` (>500) each yield `server.error`, every one is logged as `protocol.violation`, and the server stays alive (§21).
- **M6-5 rate limiting** — with a tight budget (3 / 5 s), an 8-command flood yields exactly 3 accepted + ≥5 `RATE_LIMITED` refusals, a `rate.limited` log, and a healthy server (§21).
- **M6-6 logging** — a connect + accepted + refused + snapshot scenario emits every required §22 event, and the accepted-command record carries the full diagnostic field set.
- **M6-7 race condition** — two concurrent takes: exactly one winner, one refusal, one synchronized `ENTITY_TAKEN` observed identically by both clients (§14.2).

### 3.2 Unit tests (26)

`DiagnosticLogger` (7), `RateLimiter` (6, injectable clock), `sanitize` (8), `registerPlayer` reconnect preservation (5).

### 3.3 Browser smoke (desktop + mobile)

Headless Chromium against the live server + built client:
- **Desktop (1440×900):** WebGL canvas renders, `take lantern` advances the chronicle, **zero console errors**.
- **Mobile (390×844):** panels stack in §20.2 order (scene → narrative → inventory → command), single column, **zero console errors**. Evidence: `polaris-m6-desktop.png`, `polaris-m6-mobile.png`.

### 3.4 Full gate

`npx tsc --noEmit` → 0 errors · `eslint . --quiet` → clean · `vitest run` → **281 passed / 35 files**.

---

## 4. Bugs found and fixed

| Bug | Severity | Fix |
|---|---|---|
| Client retry of a committed commandId re-derived duplicate eventIds → kernel throw → **unhandled promise rejection (server crash)** | High | Synchronous at-most-once gate (§2.1) + executor `try/catch` |
| `registerPlayer` wiped inventory on every re-join → reconnecting owner **lost the lantern** from their inventory panel | High | Preserve `existing.inventoryIds` (§2.4) |
| No mobile breakpoint → cramped/unusable phone layout (§20.2) | Medium | `max-width:720px` ordered single column (§2.5) |
| No structured logging (§22), no rate limiting (§21), no chat sanitization (§21) | Medium | `DiagnosticLogger`, `RateLimiter`, `sanitize` |

---

## 5. Acceptance-criteria coverage (§24)

All 15 functional acceptance criteria and every engineering criterion are exercised by the automated gates without manual database editing: two independent clients connect/enter/observe each other (M3/M6-7), the lantern race resolves to exactly one owner (M3-2/M6-7), the brazier lights and both clients update (M3-3/M5-3), the server restarts and a reconnecting client sees the correct restored owner + lit brazier + matching manifest (M6-1), kernel/integration/persistence tests pass, no client mutation path exists, no AI service is required, manifests are deterministic (M4/M5), events are replayable (M2/M6-1), and persistence survives a forced restart (M6-1).

---

## 6. Deferred / known limitations (post-MVP)

- **Codified Playwright e2e spec:** the browser verification is a manual smoke script (run ad hoc), not a `vitest`/CI-wired Playwright spec. Wiring it into `npm test` belongs to a dedicated e2e task.
- **Real PNG art:** the renderer still draws procedural glyphs; authored assets drop in without projection changes (M5 §2.3).
- **`fallbackVisible` cosmetic:** the Scene Altar's text-fallback sibling reports as present in headless runs even when the canvas renders; it does not intercept interaction or affect play. Pre-existing (untouched by M6); flagged for a Scene Altar polish pass.
- **Rate-limit scope:** applied to `command.submit`; chat is sanitized but not separately throttled (lower risk; the actor is serialized regardless).
- **Temporary identities:** `connection.identify` still trusts a client-claimed `playerId` (PDR §21 permits temporary MVP identities); session-issued identity is a post-MVP auth task.

---

## 7. Files

**New:** `apps/server/src/{DiagnosticLogger,RateLimiter,sanitize}.ts` · `apps/server/tests/{DiagnosticLogger,RateLimiter,sanitize}.test.ts` · `tests/integration/Milestone6Gate.test.ts` · `packages/world-kernel/tests/registerPlayer.test.ts`

**Modified:** `apps/server/src/GameServer.ts` (logging, at-most-once gate, rate limit, sanitization, defensive catch) · `packages/world-kernel/src/createInitialState.ts` (`registerPlayer` preserves inventory) · `apps/client/src/styles/polaris-console.css` (§20.2 mobile breakpoint)
