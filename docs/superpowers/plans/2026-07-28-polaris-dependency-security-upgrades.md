# Polaris Dependency Security Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every current PolarisOS npm audit finding without using
`npm audit fix --force`, while preserving the 181-test behavior baseline and
the browser rendering gate.

**Architecture:** Migrate the production server, test/build toolchain, and
linter as three independent compatibility boundaries. Use the production-only
audit after Fastify, the relevant functional gates after each migration, and
the full audit only after all three dependency families are current.

**Tech Stack:** Node.js 20.19+, npm workspaces, Fastify 5, WebSocket, Vite 8,
Vitest 4, ESLint 10 flat config, TypeScript, Playwright.

## Global Constraints

- Do not run `npm audit fix --force`.
- Preserve the Polaris server-authority and dependency laws.
- Do not alter the `SceneManifest` schema or contract identity.
- Preserve existing unrelated documentation changes in the dirty worktree.
- Keep the Vite and Vitest development servers bound to localhost in project
  scripts and test configuration.
- The managed checkout exposes `.git` read-only; record verified file changes
  without attempting commits.

---

### Task 1: Fastify 5 Runtime Boundary

**Files:**

- Modify: `PolarisOS/apps/server/package.json`
- Modify: `PolarisOS/package-lock.json`
- Test: `PolarisOS/tests/integration/Milestone3Gate.test.ts`
- Test: `PolarisOS/tests/integration/Milestone4Gate.test.ts`
- Test: `PolarisOS/tests/integration/Milestone5Gate.test.ts`

**Interfaces:**

- Consumes: existing `buildGameServer`, `/health`, `/ws`, and
  `GameServer.start(port, host)` behavior.
- Produces: Fastify `5.10.0` with a compatible
  `@fastify/websocket` `11.3.0` runtime dependency graph.

- [x] **Step 1: Verify the production audit fails**

Run:

```bash
npm audit --omit=dev
```

Expected: non-zero with the Fastify 4 dependency chain through vulnerable
`fast-uri` and `find-my-way`.

- [x] **Step 2: Upgrade only the server runtime family**

Run:

```bash
npm install --workspace=apps/server fastify@5.10.0 @fastify/websocket@11.3.0
```

- [x] **Step 3: Verify the production dependency graph**

Run:

```bash
npm ls fastify @fastify/websocket fast-uri find-my-way
npm audit --omit=dev
```

Expected: Fastify `5.10.0`, WebSocket `11.3.0`, patched transitive packages,
and zero production vulnerabilities.

- [x] **Step 4: Verify server compatibility**

Run:

```bash
npm run test:integration
npm run typecheck
```

Expected: every integration suite passes and TypeScript reports zero errors.

---

### Task 2: Vite 8 and Vitest 4 Toolchain Boundary

**Files:**

- Modify: `PolarisOS/package.json`
- Modify: `PolarisOS/package-lock.json`
- Verify: `PolarisOS/vitest.config.ts`
- Verify: `PolarisOS/playwright.pixelbrain.config.ts`

**Interfaces:**

- Consumes: existing Vite client scripts, Vitest aliases/includes, and
  Playwright localhost web server.
- Produces: Vite `8.1.5`, Vitest `4.1.10`, and a declared Node.js floor of
  `>=20.19.0`.

- [x] **Step 1: Verify the development audit fails**

Run:

```bash
npm audit
```

Expected: non-zero findings through Vite 5, esbuild 0.21, vite-node, and
Vitest 1.

- [x] **Step 2: Upgrade Vite and Vitest together**

Run:

```bash
npm install --save-dev vite@8.1.5 vitest@4.1.10
```

Update the root engine contract:

```json
{
  "engines": {
    "node": ">=20.19.0"
  }
}
```

- [x] **Step 3: Verify the toolchain graph and behavior**

Run:

```bash
npm ls vite vitest vite-node esbuild
npm test
npm run typecheck
npm run build --workspace=apps/client
npm run test:browser:pixelbrain
```

Expected: 181 tests, zero type errors, successful client build, passing
Chromium alpha gate, and no vulnerable Vite/esbuild/Vitest dependency chain.

---

### Task 3: ESLint 10 Flat Configuration

**Files:**

- Modify: `PolarisOS/package.json`
- Modify: `PolarisOS/package-lock.json`
- Create: `PolarisOS/eslint.config.js`
- Modify: `PolarisOS/packages/renderer-pixi/src/PixelBrainAssetResolver.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/PixelBrainTextureCache.ts`
- Modify: `PolarisOS/packages/renderer-pixi/src/renderIdentity.ts`
- Modify: `PolarisOS/packages/world-runtime/src/WorldSession.ts`

**Interfaces:**

- Consumes: TypeScript source files under PolarisOS.
- Produces: a self-contained ESLint 10 flat configuration using
  `@eslint/js@10.0.1`, `typescript-eslint@8.65.0`, and `globals@17.8.0`.

- [x] **Step 1: Preserve the failing lint evidence**

Run:

```bash
npm run lint
```

Expected: the existing five findings in the resolver, texture cache, render
identity, and world session.

- [x] **Step 2: Install the ESLint 10 flat-config family**

Run:

```bash
npm install --save-dev eslint@10.8.0 @eslint/js@10.0.1 typescript-eslint@8.65.0 globals@17.8.0
```

Change the script to:

```json
{
  "lint": "eslint . --report-unused-disable-directives --quiet"
}
```

- [x] **Step 3: Add a Polaris-local flat config**

Create `eslint.config.js` with TypeScript recommended rules, Node and browser
globals, generated/build ignores, the existing underscore argument convention,
and the existing project decision that explicit `any` is allowed.

- [x] **Step 4: Resolve the five existing lint findings without behavior changes**

Use a non-constant loop form, avoid aliasing `this`, remove stale disable
comments, and convert the never-reassigned binding to `const`.

- [x] **Step 5: Verify lint and functional behavior**

Run:

```bash
npm run lint
npm run typecheck
npm test
```

Expected: lint exits zero, TypeScript exits zero, and all 181 tests pass.

---

### Task 4: Final Security and Regression Gate

**Files:**

- Verify: `PolarisOS/package.json`
- Verify: `PolarisOS/package-lock.json`
- Verify: all files changed by Tasks 1–3

**Interfaces:**

- Consumes: all three upgraded dependency families.
- Produces: a zero-finding npm audit and a complete regression record.

- [x] **Step 1: Verify both audit surfaces**

Run:

```bash
npm audit --omit=dev
npm audit
```

Expected: both commands exit zero with zero vulnerabilities.

- [x] **Step 2: Run the complete project battery**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build --workspace=apps/client
npm run test:browser:pixelbrain
```

Expected: every command exits zero.

- [x] **Step 3: Review scope and generated drift**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no unrelated files modified by the
dependency migration.
