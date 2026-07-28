# Polaris OS — Art Completion & Navigation Pass — Post-Implementation Review

**Date:** 2026-07-28
**Status:** ✅ COMPLETE
**Tests:** 318 passing / 39 files (+7 new direction-movement tests)
**Typecheck:** 0 errors
**Lint:** clean (`eslint . --report-unused-disable-directives --quiet`)
**Browser verification:** headless-Chromium walk-through of all three rooms — distinct illustrated backgrounds, brazier-lighting mutation, zero console errors

---

## 1. Objective

Close the two gaps that stood between "the MVP code is done" and "a player actually *sees* the illustrated world":

1. **The spawn room had no art.** `world.json` spawns players in `forest_path`, but only `ruined_shrine` and `moonlit_clearing` had authored backgrounds. The first thing every player saw was a flat-color fallback.
2. **Players could not navigate between the illustrated rooms.** Direction movement was broken, and even when a move committed, the client never received the destination room's scene.

---

## 2. What was built

### 2.1 Forest Path background art

Authored `worldpacks/shrine-demo/assets-src/forest-background.pixelbrain.json` — a deterministic 50×30 cell (800×480, cellSize 16) PixelBrain packet, `assetKey: "rooms/forest_path/background"`. It depicts a moonlit night forest harmonized with the existing palette: indigo sky gradient, a moon disc + glow, a jagged distant treeline, a winding muddy path receding to a vanishing point, framing bark trunks + overhanging canopy, undergrowth specks, a low mist band, and sparse rain streaks. A seeded mulberry32 PRNG gives per-cell texture while staying fully deterministic.

`npm run build:pixelbrain-assets` validated the packet (`processPixelBrainPacket`), content-hashed it (`pb1:98271bd9…`), wrote it to `apps/client/public/assets/generated/`, and registered `rooms/forest_path/background` in `pixelbrainAssetRegistry.ts`. **All three rooms now have illustrated backgrounds.**

### 2.2 Four bugs found and fixed

| # | Bug | Severity | Root cause | Fix |
|---|---|---|---|---|
| 1 | Direction movement (`go west`) → `TARGET_NOT_FOUND` | High (MVP §6.3) | `exitIds` are **room IDs**; the binder/resolver matched the typed *direction* against room IDs and never consulted the authored direction→room map | Added optional `exitDirections` (direction→roomId) to `RoomState`/`RoomDefinition`; loader populates it from each room's `exits`; `CommandBinder` + `CommandResolver` consult it |
| 2 | Players spawned in the Ruined Shrine, not `forest_path` | Medium | `main.ts` joined a hardcoded `ROOM_ID = "ruined_shrine"`, ignoring the world's `spawnRoomId` | Server now advertises `spawnRoomId` in `connection.ready`; client joins `?room=` override → `spawnRoomId` → fallback |
| 3 | Scene/title never updated after a successful move | High (blocks seeing art) | `broadcastEvents` sends each room's `scene.patch` only to that room's *current* subscribers; a mover stayed subscribed to the **source** room and never received the destination's scene | After a committed MOVE, `GameServer` re-subscribes the mover to the destination and sends its authoritative `room.snapshot` |
| 4 | Two pre-existing test/lint failures (unrelated to art) | Low | (a) registry-completeness test hardcoded a 2-room background allowlist; (b) a Task-4 console test predated the chrome-ornament SVG injection; (c) `build-polaris-chrome.ts` had a useless assignment + unused disable directive | (a) grew the allowlist to all three rooms; (b) asserted no *world* asset (`img/canvas`) while allowing trusted chrome `svg`; (c) removed both |

Bug #1 detail: the schema field is **optional** (`exitDirections: z.record(...).optional()`), so every existing `RoomState` fixture stays valid and `applyEvents` (which mutates rooms in place) preserves it. The binder prefers the direction map, then falls back to room-ID/substring matching (`go shrine` still works).

---

## 3. Verification

- **`packages/command-language/tests/DirectionMovement.test.ts`** (7 new): `createInitialState` carries `exitDirections`; the field is omitted when unauthored; `go east`/bare `west`/`go shrine` bind to the right room ID; a direction-bound MOVE resolves → `PLAYER_LEFT`+`PLAYER_ENTERED` (entered.roomId = destination) → `applyEvents` moves the player and preserves the map; an invalid direction refuses `TARGET_NOT_FOUND`.
- **Full gate:** `tsc --noEmit` 0 errors · `eslint --quiet` clean · `vitest run` **318 passed / 39 files**.
- **Browser (headless Chromium, clean DB):** spawn → **Forest Path** (cool blue `sky (36,45,58)`) → `go east` → **Ruined Shrine** (stone) → `light brazier` → **warm firelight** (`sky (87,60,36)`, +81 mean pixel shift) → `go west` → **Forest Path** → `go west` → **Moonlit Clearing** (silver blue). Pairwise room diffs 37–105; `forest` vs revisited `forest` = 0.19 (deterministic). **Zero console errors.**

---

## 4. Files

**New:** `worldpacks/shrine-demo/assets-src/forest-background.pixelbrain.json` · `apps/client/public/assets/generated/forest-background.pb1-98271bd9….pixelbrain.json` · `packages/command-language/tests/DirectionMovement.test.ts`

**Modified:** `apps/client/src/generated/pixelbrainAssetRegistry.ts` + `generated-file-manifest.json` (regenerated) · `packages/contracts/src/world-state.ts` (`exitDirections`) · `packages/contracts/src/protocol.ts` (`ConnectionReady.spawnRoomId`) · `packages/world-kernel/src/createInitialState.ts` · `packages/world-kernel/src/CommandResolver.ts` · `packages/command-language/src/CommandBinder.ts` · `apps/server/src/loadWorldpack.ts` · `apps/server/src/GameServer.ts` (advertise spawnRoomId; mover re-subscribe + snapshot) · `apps/client/src/main.ts` (join spawnRoomId) · `scripts/tests/pixelbrain-registry-completeness.test.ts` · `apps/client/tests/ui/PolarisConsoleView.test.ts` · `scripts/build-polaris-chrome.ts`

---

## 5. Deferred / known limitations

- **Root clutter:** `PolarisOS/` root still holds prior-session scratch (`art-*.mjs`, `init-t*.png`, `mood-*.png`, `art-verify-*.png`). Left in place (untracked, not authored this pass); candidate for a cleanup sweep.
- **Animated art / broader sprite set:** backgrounds are single static frames; the lit brazier is a separate static sprite, not an animated flame (post-MVP, PDR §7.2 page-turn/ambient).
- **Forest background is procedural-authorial**, not hand-painted PNG; it matches the existing PixelBrain pipeline and drops into the same content-addressed registry.
