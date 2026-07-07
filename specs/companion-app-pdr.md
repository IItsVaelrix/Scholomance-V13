# Scholomance Companion App — Preliminary Design Review (PDR)

**Status:** DRAFT v0.1  
**Date:** 2026-07-10  
**Author:** Gemini (Backend Coder / Debug Inquisitor)  
**Review Cadence:** CODEx → Claude (UI) → Architect → Vaelrix Auditor

---

## 1. Executive Summary

Scholomance is a ritual-themed language combat universe — a desktop-grade IDE for verse crafting, combat, audio visualization, and agent collaboration. There is currently **no mobile-native experience**. The web app has nascent mobile awareness (bottom nav, haptic hooks, bottom sheets in `src/pages/Read/Mobile*.jsx`) but is fundamentally a desktop IDE.

This PDR proposes a **React Native + Expo companion app** that:
- Shares the existing Fastify API backend (no new backend required)
- Reuses linguistic engine contracts (CODEx schemas, Judiciary, Harkov Model)
- Targets **quick-access mobile workflows**: verse drafting, combat turn submissions, oracle queries, audio playback, and progression tracking
- Is a **companion**, not a replacement — the desktop IDE remains the primary creation environment

---

## 2. Current State Audit

### 2.1 What Exists Today

| Layer | Technology | Mobile Readiness |
|-------|-----------|-----------------|
| Frontend | React 18 + Vite 7 + CSS custom properties | Desktop-only; responsive CSS is incomplete |
| Backend API | Fastify 5, cookie/session auth, Zod validation | Fully REST; mobile-ready with minor additions |
| Auth | Cookie sessions + OAuth (Google, GitHub, Discord) | Cookie-based — needs token auth for native |
| Storage | SQLite (user, dict, corpus, collab) | Server-side only; mobile needs local cache |
| Linguistic Engines | PhonemeEngine, DeepRhyme, 8-heuristic Judiciary | Server-side via API; no client-side inference needed |
| Audio | R2 storage, catalog service, EQ presets | Streaming works; needs adaptive bitrate |
| Combat | Turn-based via REST + WebSocket relay (`scripts/combat-relay.js`) | WebSocket works on mobile; needs reconnection handling |
| Godot Runtime | Native/proton Godot 4.6 | Not portable to mobile without Godot mobile export |
| Agent Layer | MCP bridge, collab control plane | Read-only companion view feasible |

### 2.2 Existing Mobile Fragments

```
src/pages/Read/MobileBottomNav.jsx      — 5-tab bottom nav (Editor, Scrolls, Oracle, Hex, Power)
src/pages/Read/MobileBottomSheet.jsx    — Slide-up bottom sheet
src/pages/Read/MobileHexSheet.jsx       — Hex panel mobile variant
src/pages/Read/MobileWordSheet.jsx      — Word detail mobile variant
src/hooks/useHaptic.ts                  — 8-pattern vibration API (tap, select, toggle, etc.)
```

These are **adaptive components within the web app**, not a standalone native shell.

### 2.3 API Surface (Relevant to Mobile)

All routes are mounted on the existing Fastify server (`codex/server/index.js`):

| Route Module | Key Endpoints | Mobile Relevance |
|-------------|---------------|-----------------|
| `auth.routes.js` | register, login, logout, session | **Critical** — needs token auth |
| `oracle.routes.js` | query, history | High — quick queries |
| `combat.routes.js` | turn submit, board state | High — async turns |
| `wordLookup.routes.js` | phoneme data, rhyme data | Medium — drafting aid |
| `catalog.routes.js` | audio list, stream, upload | High — mobile player |
| `panelAnalysis.routes.js` | full verse analysis | Medium — on-demand |
| `user.persistence.js` | progression, settings, EQ presets | High — sync state |
| `collab.routes.js` | tasks, bugs, agents | Low — read-only |
| `world.routes.js` | QbitWorld, SurfaceWorld | Low — 3D not mobile |
| `corpus.routes.js` | verse examples, search | Low — reference only |

---

## 3. Proposed Architecture

### 3.1 Technology Stack

```
┌─────────────────────────────────────────────────┐
│                Companion App                     │
│  React Native 0.76+ / Expo SDK 52+              │
│  ┌───────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Navigation│ │  State   │ │ Local Storage  │  │
│  │ (expo-    │ │ (Zustand)│ │ (expo-sqlite   │  │
│  │  router)  │ │          │ │  + MMKV)       │  │
│  └───────────┘ └──────────┘ └────────────────┘  │
│  ┌───────────────────────────────────────────┐   │
│  │  Shared Packages (via workspace or copy)  │   │
│  │  - codex/core/schemas/ (Zod schemas)      │   │
│  │  - codex/core/scd64/ (deterministic hash) │   │
│  │  - src/data/schools.js (school constants) │   │
│  │  - src/data/schoolPalettes.js (theming)   │   │
│  └───────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────┘
                       │ HTTPS / WSS
┌──────────────────────▼──────────────────────────┐
│           Existing Fastify Backend               │
│  (No new server required — add token auth +      │
│   push notification service)                     │
└─────────────────────────────────────────────────┘
```

### 3.2 Why React Native / Expo

| Factor | Decision |
|--------|----------|
| **Code sharing** | Zod schemas, SCD64, school data, color palettes, constants all shareable as-is |
| **Team skill** | Existing React + TypeScript expertise transfers directly |
| **Ecosystem** | Expo SDK covers push notifications, SQLite, audio, haptics, OAuth |
| **OTA updates** | `expo-updates` allows JS bundle pushes without app store review |
| **Cross-platform** | iOS + Android from single codebase |
| **Maturity** | Expo SDK 52+ has first-class EAS Build, expo-router (file-based routing) |

### 3.3 Why NOT alternatives

| Alternative | Verdict |
|-------------|---------|
| **PWA** | Insufficient — no push notifications on iOS, no native haptics, no background audio |
| **Capacitor** | Viable fallback but heavier; web-first means fighting mobile UX constantly |
| **Flutter** | Full separate codebase; zero code reuse; team would need Dart |
| **Kotlin/Swift native** | Maximum polish but 2x codebase; no shared logic |
| **Godot mobile export** | Only for the 3D world experience; not the companion workflow |

---

## 4. Feature Set — Phased Delivery

### Phase 1: "Scribe" — Verse Drafting + Oracle (MVP, 6-8 weeks)

```
┌─────────────────────────────────────────┐
│  S C R I B E                            │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Quick Draft                     │    │
│  │  ┌─────────────────────────┐    │    │
│  │  │ Type your verse here... │    │    │
│  │  │                         │    │    │
│  │  └─────────────────────────┘    │    │
│  │  [Save Draft]  [Submit Oracle]  │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │  Live Heuristic Preview         │    │
│  │  SONIC ████████░░ 82%          │    │
│  │  VOID  ██████░░░░ 64%          │    │
│  └─────────────────────────────────┘    │
│                                         │
│  [Editor] [Scrolls] [Oracle] [Profile]  │
└─────────────────────────────────────────┘
```

**Features:**
- Quick verse text editor with school selector
- Real-time heuristic score preview (debounced API calls to `/api/panel-analysis`)
- Scroll list (sync from server, offline cache)
- Oracle terminal (query `/api/oracle`, history with local cache)
- Auth: email/password + OAuth via expo-auth-session
- Local draft storage (expo-sqlite)
- Push notification for Oracle responses

**Backend changes needed:**
1. **Token auth endpoint** — Add `POST /api/auth/token` (email+password → JWT or session token for `Authorization: Bearer` header). Mobile can't rely on cookies.
2. **Push notification token registration** — `POST /api/me/push-token` (Expo push token storage)
3. **Oracle push** — When an async oracle query completes, push to registered device

### Phase 2: "Duelist" — Combat Companion (4-6 weeks)

```
┌─────────────────────────────────────────┐
│  C O M B A T                            │
│  ┌─────────────────────────────────┐    │
│  │  ⚔️  vs Void Lich              │    │
│  │  Turn 4/10  |  HP 78%          │    │
│  │                                 │    │
│  │  ┌─────────────────────────┐   │    │
│  │  │ Your Verse               │   │    │
│  │  │ "darkness folds..."      │   │    │
│  │  └─────────────────────────┘   │    │
│  │  [Submit Turn]                 │    │
│  └─────────────────────────────────┘    │
│  [Active Battles] [History] [Profile]    │
└─────────────────────────────────────────┘
```

**Features:**
- List active combat sessions
- View board state (simplified grid, opponent stats)
- Compose and submit verses for turn
- Push notification: "Your turn in combat vs X" / "Combat resolved: Victory!"
- Combat log read-only view
- Haptic feedback on turn resolution (existing `useHaptic` patterns ported)

**Backend changes needed:**
1. **Combat push notifications** — Hook into combat resolution to push turn-ready / result events
2. **Mobile-optimized combat state endpoint** — `/api/combat/:id/mobile-state` (reduced payload, no full scene data)

### Phase 3: "Crystal Ball" — Audio Player + Visualizer (4-6 weeks)

```
┌─────────────────────────────────────────┐
│  L I S T E N                            │
│  ┌─────────────────────────────────┐    │
│  │  ♫  Petrichor — Vael Qbit      │    │
│  │  ████████████████░░░  2:34     │    │
│  │                                 │    │
│  │  [◀◀] [▶/❚❚] [▶▶]  🔀 🔁     │    │
│  │                                 │    │
│  │  EQ: ▃ ▄ ▅ ▆ ▇                 │    │
│  └─────────────────────────────────┘    │
│  [Now Playing] [Catalog] [Stations]      │
└─────────────────────────────────────────┘
```

**Features:**
- Stream audio from existing R2 catalog (`/api/catalog/stream/:id`)
- Background audio playback (expo-av + NowPlaying controls)
- EQ presets from user settings (sync `/api/me/eq-presets`)
- Simplified visualizer (CrystalBall-like waveform)
- Scholomance Stations (school-themed curated playlists)
- Offline cache recently played tracks

**Backend changes needed:**
1. **Adaptive bitrate streaming** — Optional: transcode endpoint for mobile-friendly bitrates
2. **HLS support** — Consider HLS segments for reliable mobile streaming

### Phase 4: "Grimoire" — Full Scroll Editor (6-8 weeks)

Mobile-optimized version of the desktop IDE scroll editor (`src/pages/Read/ScrollEditor.jsx`, 82,616 bytes — the largest file in the codebase).

**Features:**
- Rich text editing with phoneme underlay
- Rhyme diagram (simplified mobile version)
- School theme switching
- Truesight analysis on-demand
- Draft → Publish workflow
- Offline editing with sync-on-connect

**Backend changes needed:**
1. **Scroll sync endpoint** — `POST /api/scrolls/sync` (accept batch of offline drafts, resolve conflicts by timestamp)

### Phase 5: "Sanctum" — Profile + Career + Social (4-6 weeks)

- Career progression tree (mobile-adapted from `src/pages/Career/CareerPage.tsx`)
- School level display with sigil animations
- Achievement notifications
- Linked accounts management
- Friend challenges (send combat invite via deep link)

---

## 5. Shared Code Strategy

### 5.1 What Can Be Shared (Zero Modification)

These files are pure data or pure logic with no DOM/React dependencies:

```
src/data/schools.js               — School constants, vowel affinities
src/data/schoolPalettes.js        — CSS variable palette definitions
src/data/progression_constants.js — XP tables, unlock thresholds
src/data/stacking_tiers.js        — Tier definitions
codex/core/combat/                — Combat schemas, scoring logic
codex/core/tokenization/          — Token weight schemas
codex/core/scd64/                 — Deterministic hash functions
codex/core/pixelbrain/            — Bytecode error + health schemas
```

### 5.2 What Needs Mobile Variants

```
src/pages/Read/ScrollEditor.jsx   → apps/companion/src/screens/EditorScreen.tsx
src/pages/Oracle/OraclePage.jsx   → apps/companion/src/screens/OracleScreen.tsx
src/pages/Combat/CombatPage.jsx   → apps/companion/src/screens/CombatScreen.tsx
src/pages/Listen/ListenPage.tsx   → apps/companion/src/screens/ListenScreen.tsx
src/pages/Profile/ProfilePage.jsx → apps/companion/src/screens/ProfileScreen.tsx
src/pages/Career/CareerPage.tsx   → apps/companion/src/screens/CareerScreen.tsx
```

### 5.3 Monorepo Structure (Proposed)

```
scholomance/
├── apps/
│   ├── web/              # Existing src/ — unchanged
│   └── companion/        # NEW — Expo app
│       ├── app/          # expo-router file-based routes
│       │   ├── (tabs)/
│       │   │   ├── editor.tsx
│       │   │   ├── scrolls.tsx
│       │   │   ├── oracle.tsx
│       │   │   ├── combat.tsx
│       │   │   └── profile.tsx
│       │   ├── _layout.tsx
│       │   └── index.tsx
│       ├── src/
│       │   ├── api/          # API client (shared types)
│       │   ├── stores/       # Zustand stores
│       │   ├── components/   # Mobile-adapted components
│       │   ├── hooks/        # Mobile hooks (haptic, audio, etc.)
│       │   └── theme/        # School theming for RN
│       ├── shared/           # Symlink or workspace ref to root
│       │   ├── codex/core/schemas/
│       │   └── src/data/
│       ├── app.json
│       ├── package.json
│       └── tsconfig.json
├── codex/                # Existing — unchanged
├── src/                  # Existing web app — unchanged
└── package.json          # Root workspace config
```

---

## 6. API Gap Analysis

### 6.1 New Endpoints Required

| Endpoint | Method | Purpose | Phase |
|----------|--------|---------|-------|
| `/api/auth/token` | POST | Email+password → JWT for native auth | P1 |
| `/api/auth/token/refresh` | POST | Refresh expired JWT | P1 |
| `/api/me/push-token` | POST | Register Expo push token | P1 |
| `/api/me/push-token` | DELETE | Unregister on logout | P1 |
| `/api/combat/:id/mobile-state` | GET | Reduced combat payload for mobile | P2 |
| `/api/scrolls/sync` | POST | Batch offline draft sync | P4 |
| `/api/catalog/stream/:id/mobile` | GET | Adaptive bitrate audio stream (optional) | P3 |

### 6.2 Existing Endpoints That Need Mobile Adaptation

| Endpoint | Change |
|----------|--------|
| `/api/auth/login` | Add `?response=token` query param to return JWT instead of setting cookie |
| `/api/panel-analysis` | Add `?fields=quick` for reduced payload (scores only, no full breakdown) |
| `/api/word-lookup/:word` | Add `?mobile=true` for trimmed response |

---

## 7. Offline Strategy

### 7.1 Local Storage

| Storage | Technology | What |
|---------|-----------|------|
| Drafts + scrolls | expo-sqlite | Full scroll content, drafts |
| Auth tokens | expo-secure-store | JWT, refresh token |
| User prefs | MMKV | Theme, EQ, haptic settings |
| Audio cache | expo-file-system | Recently played tracks |
| Combat state | expo-sqlite | Cached board states |
| Oracle history | expo-sqlite | Query/response pairs |

### 7.2 Sync Protocol

```
┌──────────┐         ┌──────────┐
│  Mobile  │         │  Server  │
│  (local  │         │  (source │
│   first) │         │   truth) │
└────┬─────┘         └────┬─────┘
     │                    │
     │  POST /sync        │
     │  {                 │
     │    lastSync: ISO,  │
     │    changes: [...]  │
     │  }                 │
     │───────────────────▶│
     │                    │
     │  {                 │
     │    serverChanges,  │
     │    conflicts: []   │
     │  }                 │
     │◀───────────────────│
     │                    │
```

Conflict resolution: **server wins** for published scrolls, **last-write-wins** for drafts with user confirmation UI for detected conflicts.

---

## 8. Push Notification Architecture

```
┌──────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────┐
│ Fastify  │───▶│  Redis   │───▶│  Expo Push   │───▶│  APNs /  │
│ Server   │    │  Queue   │    │  Service     │    │  FCM     │
└──────────┘    └──────────┘    └──────────────┘    └──────────┘
      │                                                 │
      │  On combat turn / oracle response / etc.        │
      │  → enqueue push job                             │
      └─────────────────────────────────────────────────┘
```

**Notification Types:**

| Event | Title | Body | Deep Link |
|-------|-------|------|-----------|
| Combat turn ready | "Your turn!" | "vs Void Lich — Turn 4/10" | `/combat/:id` |
| Combat resolved | "Victory!" | "Defeated Void Lich in 7 turns" | `/combat/:id/result` |
| Oracle response | "The Oracle speaks" | "Your verse analysis is ready" | `/oracle/:queryId` |
| Challenge received | "Duel challenge!" | "Vael Qbit challenges you" | `/combat/invite/:id` |
| School level up | "SONIC Level 5!" | "New abilities unlocked" | `/career` |

---

## 9. Theming & Design System

### 9.1 School Theme Port

The web app uses CSS custom properties extensively (`src/index.css`, 51,492 bytes). For React Native, we port to a `ThemeContext` with school-based palettes:

```typescript
// apps/companion/src/theme/schoolThemes.ts
export const schoolThemes: Record<SchoolId, SchoolTheme> = {
  SONIC: {
    primary: '#FF6B35',
    secondary: '#FFD700',
    background: '#1A0A2E',
    surface: '#2D1B4E',
    text: '#F0E6FF',
    accent: '#00FF88',
  },
  // ... (ported from src/data/schoolPalettes.js)
};
```

### 9.2 Component Adaptation

| Web Component | Mobile Equivalent | Approach |
|--------------|-------------------|----------|
| `ScrollEditor` (82KB) | `EditorScreen` | Ground-up rewrite with same API contracts |
| `OracleTerminalChrome` | `OracleScreen` | Simplified terminal with native TextInput |
| `BattleArena` | `CombatScreen` | Flat list of combat sessions; turn submit modal |
| `ListenPage` (21KB) | `ListenScreen` | expo-av player + mini visualizer |
| `GrimoireSpread` | `GrimoireScreen` | Native FlatList with sigil cards |
| `Navigation` | `expo-router` tabs | File-based routing |

---

## 10. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| ScrollEditor complexity (82KB file, 100+ features) doesn't port cleanly | HIGH | MEDIUM | Start with "Quick Draft" (Phase 1), not full editor. Incrementally add features. |
| Cookie-based auth incompatible with native | HIGH | CERTAIN | Token auth endpoint built in Phase 1 (2-3 days backend work) |
| 160MB SQLite dictionary can't ship on mobile | MEDIUM | HIGH | Dictionary stays server-side via API. Mobile only caches recent lookups (MMKV). |
| Godot 3D scenes not portable | LOW | CERTAIN | Accepted — companion is not a Godot runtime. Optional Phase 6: Godot iOS/Android export for QbitWorld explorer. |
| Offline/online conflict resolution bugs | MEDIUM | MEDIUM | Start with server-authoritative. Add offline as enhancement. |
| Apple App Store rejection (mystical/occult theme) | LOW | LOW | "Ritual" branding is fantasy, not religious. Precedent: thousands of magic-themed games approved. |
| Expo OTA update breaks API contract | MEDIUM | LOW | Strict API versioning. Mobile client sends `X-Client-Version` header. |

---

## 11. Timeline & Staffing

```
Phase 1: SCRIBE         ████████░░░░░░░░  6-8 weeks   1 React Native dev + 0.5 backend
Phase 2: DUELIST        ░░░░░░░░████░░░░  4-6 weeks   1 React Native dev + 0.25 backend
Phase 3: CRYSTAL BALL   ░░░░░░░░░░░░████  4-6 weeks   1 React Native dev (audio expertise)
Phase 4: GRIMOIRE       ░░░░░░░░░░░░░░██  6-8 weeks   2 React Native devs
Phase 5: SANCTUM        ░░░░░░░░░░░░░░░█  4-6 weeks   1 React Native dev
                        ─────────────────
Total:                  24-34 weeks (6-8.5 months) with 1-2 devs
```

**Backend work across all phases:** ~3-4 weeks total (token auth, push notifications, mobile-optimized endpoints).

---

## 12. Decision Points (For Review)

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | Monorepo structure | (A) New `/apps/companion` in this repo, (B) Separate repo | **A** — shared schemas stay in sync automatically |
| D2 | State management | (A) Zustand, (B) Redux Toolkit, (C) React Context | **A** — lightweight, matches web hooks pattern |
| D3 | Routing | (A) expo-router, (B) React Navigation | **A** — file-based routing, convention over configuration |
| D4 | Auth token format | (A) JWT, (B) Simple opaque token in DB | **A** — stateless, standard, works with expo-auth-session |
| D5 | Audio streaming | (A) HLS, (B) Direct MP3/AAC stream, (C) expo-av direct URL | **B then A** — direct streaming for MVP, HLS for reliability |
| D6 | Offline-first or server-first | (A) Offline-first with sync, (B) Server-first with cache | **B for MVP** — simpler, fewer conflict bugs; add offline in P4 |
| D7 | Shared code mechanism | (A) pnpm workspace `*` references, (B) Copied/symlinked files, (C) Published npm package | **A** — workspaces are native to the monorepo |
| D8 | Push notification service | (A) Expo Push (free), (B) OneSignal, (C) Firebase Cloud Messaging direct | **A** — free, first-party, sufficient for our scale |

---

## 13. Open Questions

1. **Combat relay architecture** — The current `scripts/combat-relay.js` uses WebSockets. Should the mobile app connect directly to this relay, or should combat be poll-based on mobile for battery efficiency?

2. **Godot mobile companion** — Should we invest in a Godot iOS/Android export of the Combat scene for a richer combat experience? This would be a Phase 6+ effort.

3. **DivTube downloader on mobile?** — The `divtube_downloader/` subsystem currently runs server-side. Should the companion app allow triggering YouTube analysis from mobile?

4. **Collab agent access** — Should the companion app allow interacting with the collab control plane (MCP bridge), or is that strictly desktop?

5. **App Store presence** — Do we want to publish as "Scholomance" or a different companion brand? The term has existing cultural associations (World of Warcraft, Romanian folklore).

6. **Monetization** — Is the companion app free with the web app, or a separate purchase/subscription?

---

## 14. Appendix A — Key Files Referenced

| File | Purpose |
|------|---------|
| `codex/server/index.js` (1,446 lines) | Fastify server entry, all route registration |
| `src/main.jsx` | Client router, all page registrations |
| `src/App.jsx` | Root component, providers, motion system |
| `src/pages/Read/ScrollEditor.jsx` (82,616 bytes) | Primary verse editor — largest file |
| `src/pages/Combat/CombatPage.jsx` (20,775 bytes) | Combat UI |
| `src/pages/Listen/ListenPage.tsx` (21,119 bytes) | Audio player page |
| `src/pages/Oracle/OraclePage.jsx` (497 bytes) | Oracle entry (lightweight wrapper) |
| `src/hooks/useHaptic.ts` | 8-pattern vibration API |
| `src/data/schools.js` | School constants, vowel affinities |
| `src/data/schoolPalettes.js` | Color palette definitions |
| `codex/server/routes/auth.routes.js` (17,181 bytes) | Auth endpoints |
| `codex/server/routes/combat.routes.js` (1,490 bytes) | Combat endpoints |
| `codex/server/services/wordLookup.service.js` (32,801 bytes) | Word lookup engine |
| `scripts/combat-relay.js` | WebSocket combat relay |

---

## 15. Appendix B — GODOT Mobile Spike (Phase 6 Deferred)

If we later want the full 3D Combat arena on mobile, Godot 4.6 supports iOS and Android export targets. The existing `godot_project/scenes/Combat/CombatPage.tscn` would need:

- Touch input remapping (from keyboard/mouse)
- Mobile HUD overlay
- Reduced shader complexity for mobile GPUs
- Asset compression (ETC2/ASTC textures)

This is a deferred exploration — not part of the companion app MVP.

---

*End of PDR. Next step: architecture review by CODE brain, Claude UI feasibility assessment, Vaelrix determinism audit of shared schemas.*
