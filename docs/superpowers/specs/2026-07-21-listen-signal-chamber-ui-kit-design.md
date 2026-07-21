# Listen Page — Signal Chamber Compose UI Kit Integration Design

**Date:** 2026-07-21  
**Status:** Approved  
**Module:** `src/pages/Listen/`, `src/core/compose/kits/signalChamber.compose.js`

---

## 1. Executive Summary & Objectives

The **Listen Page** (`src/pages/Listen/ListenPage.tsx`) is being upgraded to use the **Scholomance Signal Chamber Compose UI Kit** (`/home/deck/Downloads/signal-chamber-compose-ui-kit.zip`).

This integration declares the redesigned Listen surface through canonical Compose contracts:
- `SCHOL-COMPONENT-DEFINITION-v1` (14 component definitions)
- `PB-UI-SCENE-v1` (Full-page scene factory `createSignalChamberScene()`)
- `PB-LAYOUT-v1` (12 layout intents)
- `SCHOL-TOKEN-SET-v1` (Theme-token contract for 5 school skins)
- Voluntary WAND, SCDL, and native-DOM visual attachments

---

## 2. Architecture & File Placement

1. **Kit Location:** `src/core/compose/kits/signalChamber.compose.js`
2. **Adapter Component:** `src/pages/Listen/ComposeSignalChamberAdapter.tsx`
3. **Listen Page Integration:** `src/pages/Listen/ListenPage.tsx`
4. **Golden Packet:** `tests/qa/features/fixtures/signal-chamber-ui-kit.golden.json`
5. **QA Test Suite:** `tests/qa/features/compose-signal-chamber-kit.test.ts`

---

## 3. Runtime Binding Architecture

Volatile audio and device state from `useAmbientPlayer()` is bound to stable scene keys:
- `listen.transport.mode`: `'playing'` | `'paused'` | `'loading'` | `'standby'`
- `listen.transport.timeLabel`: formatted current track time
- `listen.transport.volume`: normalized volume float (`0.0`–`1.0`)
- `listen.signal.vibration`: normalized volume float
- `listen.signal.entropy`: normalized entropy float (`0.0`–`1.0`)
- `listen.signal.phonemeDensity`: live signal level float
- `listen.output.deviceId`: output sink ID string
- `listen.output.devices`: array of output devices
- `listen.school.active`: active school ID (`SONIC`, `ALCHEMY`, `WILL`, `PSYCHIC`, `VOID`)

Events dispatched by UI components trigger player actions:
- `LISTEN.TRANSPORT.TOGGLE` → `togglePlayPause()`
- `LISTEN.APERTURE.SELECT` → `tuneToSchool(apertureId)`
- `LISTEN.TRANSPORT.VOLUME` → `setVolume(normalizedValue)`
- `LISTEN.FIELD.CHANGE` → `setOutputDevice(deviceId)`

---

## 4. Fallback & Determinism Strategy

- **Schema Fallback:** If `createSignalChamberScene()` fails validation, `ListenPage.tsx` renders the fallback chamber view cleanly without crashing.
- **Golden Verification:** `compose-signal-chamber-kit.test.ts` runs unit tests and golden-packet comparisons to guarantee reference integrity and deterministic rendering.
