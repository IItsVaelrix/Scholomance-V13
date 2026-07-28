# Polaris OS — Picture-Book MUD

**Working title:** Codex Vale

A persistent multiplayer literary game presented through illustrated storybook scenes, natural-language commands, and shared environmental history.

> The world produces the picture. The picture does not produce the world.

## Architecture

```
contracts          ← pure types + Zod schemas (root of dependency law)
    ↑
world-kernel       ← deterministic simulation (State + Command + Ruleset = Events)
    ↑
projectors         ← narrative-projector, scene-compiler
adapters           ← persistence-sqlite, realtime-protocol, renderer-pixi
    ↑
applications       ← client, server, world-studio
```

**Dependency Law:** The world kernel may NOT import Fastify, WebSocket, SQLite, PixiJS, browser APIs, or UI components.

## Quick Start

```bash
cd PolarisOS
npm install
npm test          # run all kernel + integration tests
npm run typecheck # verify types
```

## Repository Structure

```
PolarisOS/
├── apps/
│   ├── client/           # Vite + PixiJS illustrated client
│   ├── server/           # Fastify + WebSocket authoritative server
│   └── world-studio/     # World editing tools (future)
├── packages/
│   ├── contracts/        # Shared types & Zod schemas
│   ├── world-kernel/     # Deterministic command resolver
│   ├── command-language/ # Raw text → BoundCommand binder
│   ├── narrative-projector/ # Events → prose
│   ├── scene-compiler/   # Room state → SceneManifest
│   ├── realtime-protocol/ # WebSocket message codec
│   ├── persistence-sqlite/ # SQLite WAL adapter
│   ├── renderer-pixi/    # PixiJS scene renderer
│   └── test-harness/     # Shared test fixtures
├── worldpacks/
│   └── shrine-demo/      # MVP world content (3 rooms)
└── tests/
    ├── integration/      # Multi-player scenario tests
    ├── replay/           # Event replay verification
    ├── persistence/      # Restart restoration tests
    └── visual-contracts/ # Scene manifest determinism
```

## MVP Proof

Three rooms, two concurrent players, one shared object, one persistent illustrated world mutation.

1. Two players enter the ruined shrine
2. Both attempt to take the lantern — exactly one succeeds
3. The winner lights the brazier — permanent visual mutation
4. Both disconnect, server restarts
5. Returning player sees correct restored state

## Milestones

| # | Milestone | Status |
|---|-----------|--------|
| 1 | Domain kernel | ✅ Structure + tests |
| 2 | Persistence | 🔲 Schema defined, adapter stubbed |
| 3 | Realtime multiplayer | 🔲 Protocol defined |
| 4 | Scene compiler | ✅ Compiler + determinism tests |
| 5 | Illustrated client | 🔲 Renderer stubbed |
| 6 | Hardening | 🔲 |

## PDR Reference

Full product requirements: `Polaris-OS-Encyclopedia/PDRs/Polaris-OS-PDR.md`
