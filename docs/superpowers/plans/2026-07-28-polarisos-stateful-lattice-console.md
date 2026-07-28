# PolarisOS Stateful Lattice Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current PolarisOS demo page with the approved desktop-first arcane terminal while preserving authoritative server behavior, semantic accessibility, deterministic PixelBrain assets, and the existing Pixi scene renderer.

**Architecture:** Root Compose authors and validates a canonical `PB-UI-SCENE-v1`, then a build adapter emits a runtime-neutral DOM plan and token CSS into the Polaris client. The client validates WebSocket messages into one `PolarisUiState`, projects that state into stable semantic DOM, resolves SCDL variants from the fingerprinted asset registry, and mounts Pixi only inside the Scene Altar. A development-only Photonic bench observes controlled browser renders as pixels, node coordinates, and a row-major lattice.

**Tech Stack:** TypeScript, Vite, Vitest, Playwright, Zod, root Compose packets/adapters, PixelBrain SCDL, PixiJS renderer, Photonic Retina, semantic HTML/CSS.

## Global Constraints

- Treat [the approved design spec](../specs/2026-07-28-polarisos-arcane-terminal-ui-design.md) as authoritative.
- Read and obey `SHARED_PREAMBLE.md`, `VAELRIX_LAW.md`, `SCHEMA_CONTRACT.md`, and `docs/scholomance-encyclopedia/Scholomance LAW/AGENTS.md` before editing.
- Preserve unrelated dirty-worktree changes. Stage only the files listed in each task.
- Register/assign the collaboration task, heartbeat while active, and acquire file locks before editing shared substrates.
- Use semantic search first and cite the result IDs in collaboration notes before lexical fallback.
- Apply TDD in every task: write the named failing test, run it and inspect the expected failure, implement the smallest passing change, then rerun the focused test.
- Compose, SCDL, and Photonic are build/test-time dependencies only. Do not import their compilers or observers into the production browser bundle.
- The server remains authoritative. UI actions submit protocol messages and never mutate room, player, entity, or scene state optimistically.
- Do not hand-edit generated files. Regenerate them through the named build command.
- Keep all decorative SCDL nodes `aria-hidden`; all text and controls remain useful when visual attachments are absent.
- Support `1440×900` and `1280×800` first. Below the Steam Deck breakpoint, retain the command surface and Scene Altar before secondary telemetry.
- Every intermediate commit must leave the semantic shell usable or leave production behavior unchanged.

---

## Task 1: Make the Compose DOM adapter capable of expressing the console

**Files:**

- Modify: `src/core/compose/layout/emit-layout.ts`
- Modify: `src/core/compose/render/dom-adapter.ts`
- Modify: `src/core/compose/validate/scene.ts`
- Modify: `tests/qa/features/compose-phase10-render.test.ts`
- Modify: `tests/qa/features/compose-schema.test.ts`

**Consumes:** `PbLayoutV1`, `GridLayoutIntent`, `CommonLayoutIntent`, `UiSceneNode`, and `VisualAttachment` from `src/core/compose/schema/packets.ts`.

**Produces:** Complete grid/common CSS lowering, recursive visual-reference validation, semantic tag selection, and attachment metadata sufficient for a runtime host.

- [ ] **Step 1: Add failing layout and semantic-lowering tests**

Add focused cases that require:

```ts
expect(lowerGridToCss({
  columns: 'minmax(220px, .8fr) minmax(640px, 2.4fr) minmax(260px, 1fr)',
  rows: '1fr',
  gapPx: [8, 12],
  align: 'stretch',
  justify: 'center',
})).toEqual({
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, .8fr) minmax(640px, 2.4fr) minmax(260px, 1fr)',
  gridTemplateRows: '1fr',
  rowGap: '8px',
  columnGap: '12px',
  alignItems: 'stretch',
  justifyContent: 'center',
});

expect(lowerCommonToCss({
  paddingPx: [4, 8, 12, 16],
  minWidthPx: 220,
  maxHeightPx: 900,
  writingDirection: 'ltr',
})).toMatchObject({
  padding: '4px 8px 12px 16px',
  minWidth: '220px',
  maxHeight: '900px',
  direction: 'ltr',
});
```

Create a scene whose nested `main`, `aside`, `form`, `input`, and `log` nodes assert semantic tags, `data-compose-kind`, and a `scdl-asset` attachment carrying its `packetId`.

- [ ] **Step 2: Run the tests and confirm the red state**

Run:

```bash
npm run ui:render:test
npm run ui:schema:validate
```

Expected: the render test fails because `lowerGridToCss`, `lowerCommonToCss`, semantic tags, and attachment payload fields do not exist; the schema test fails because a missing nested visual reference is not diagnosed.

- [ ] **Step 3: Implement common and grid lowering**

Export these functions from `emit-layout.ts`:

```ts
export function lowerCommonToCss(
  intent: CommonLayoutIntent,
): Record<string, string>;

export function lowerGridToCss(
  intent: GridLayoutIntent,
): Record<string, string>;
```

`lowerCommonToCss` must serialize one-, two-, and four-value box arrays in CSS order and emit only declared constraints. `lowerGridToCss` must map the two-value gap as `[row, column]`. In `dom-adapter.ts`, merge common styles first and mode-specific styles second:

```ts
const common = layout?.common ? lowerCommonToCss(layout.common) : {};
const mode =
  layout?.mode === 'flow' && layout.flow
    ? lowerFlowToCss(layout.flow)
    : layout?.mode === 'grid' && layout.grid
      ? lowerGridToCss(layout.grid)
      : {};
const style = { ...common, ...mode };
```

- [ ] **Step 4: Preserve semantic and attachment intent in `DomNodeSpec`**

Extend the attachment type without introducing live DOM objects:

```ts
export type DomAttachmentSpec = {
  slot: string;
  visualId: string;
  kind: VisualAttachment['kind'];
  packetId?: string;
  tokenPath?: string;
  className?: string;
};
```

Map roles to native tags:

```ts
const ROLE_TAGS: Readonly<Record<string, string>> = {
  banner: 'header',
  main: 'main',
  complementary: 'aside',
  navigation: 'nav',
  region: 'section',
  form: 'form',
  log: 'ol',
};
```

Keep `button` and `input` kind handling authoritative, add `data-compose-kind` to `attrs`, and copy only the discriminated attachment fields that exist on each visual. Pass through this explicit string allowlist from node props: `aria-label`, `aria-live`, `aria-atomic`, `aria-describedby`, `autocomplete`, `inputmode`, `name`, `placeholder`, and `type`. Boolean `disabled` remains separately normalized. Do not serialize arbitrary attributes, implementation objects, or executable callbacks.

- [ ] **Step 5: Validate kinds and visual references recursively**

Replace the two partial walkers with one recursive walk over both `children` and `slots`. For every node:

```ts
for (const visualRef of node.visualRefs ?? []) {
  if (!scene.visuals[visualRef]) {
    diagnostics.push(diag(
      CODES.UNKNOWN_SLOT,
      'ERROR',
      `Unknown visual attachment: ${visualRef}`,
      { sourceNodeId: node.id },
    ));
  }
}
```

The same walk must check custom kinds against `scene.definitions`.

- [ ] **Step 6: Prove the adapter and commit**

Run:

```bash
npm run ui:render:test
npm run ui:schema:validate
npm run typecheck
```

Expected: all commands exit `0`; existing Compose golden packets remain byte-stable.

Commit only the five Task 1 files:

```bash
git add src/core/compose/layout/emit-layout.ts src/core/compose/render/dom-adapter.ts src/core/compose/validate/scene.ts tests/qa/features/compose-phase10-render.test.ts tests/qa/features/compose-schema.test.ts
git commit -m "feat(compose): lower semantic console layouts"
```

---

## Task 2: Author and generate the canonical Polaris console shell

**Files:**

- Create: `src/core/compose/kits/polaris-console.ts`
- Create: `tokens/compose/polaris-console.tokens.json`
- Create: `scripts/build-polaris-console-ui.ts`
- Create: `tests/qa/features/polaris-console-compose.test.ts`
- Create: `tests/qa/features/fixtures/polaris-console.pb-ui-scene.v1.json`
- Generate: `PolarisOS/apps/client/src/generated/polaris-console.dom-plan.ts`
- Generate: `PolarisOS/apps/client/src/generated/polaris-console.tokens.css`
- Modify: `package.json`
- Modify: `PolarisOS/package.json`

**Consumes:** The adapter produced in Task 1 and the anatomy/tokens from the approved design.

**Produces:** A deterministic `PB-UI-SCENE-v1`, canonical golden, generated DOM plan, and generated CSS variables.

- [ ] **Step 1: Add the failing packet/generator test**

The test must assert this stable root anatomy:

```ts
expect(scene.root.id).toBe('polaris-console');
expect((scene.root.children ?? []).map(({ id }) => id)).toEqual([
  'polaris-system-header',
  'polaris-workspace',
]);
expect(findIds(scene.root)).toEqual(expect.arrayContaining([
  'polaris-bearing-rail',
  'polaris-scene-altar',
  'polaris-chronicle',
  'polaris-command-conduit',
  'polaris-telemetry-rail',
]));
expect(validateComposeScene(scene).ok).toBe(true);
expect(canonicalizePacket(scene)).toBe(canonicalizePacket(golden));
```

Also run the generator twice into a temporary directory and assert byte-identical TypeScript and CSS outputs.

- [ ] **Step 2: Confirm the missing-scene failure**

Run:

```bash
npx vitest run tests/qa/features/polaris-console-compose.test.ts
```

Expected: failure because the scene factory, token file, generator, and generated artifacts do not exist.

- [ ] **Step 3: Author the component definitions and scene**

Export:

```ts
export function createPolarisConsoleScene(): PbUiSceneV1;
```

Use custom component definitions for:

```ts
const COMPONENT_KINDS = [
  'polaris-console-shell',
  'system-header',
  'bearing-rail',
  'scene-altar',
  'chronicle',
  'command-conduit',
  'telemetry-rail',
  'arcane-panel',
] as const;
```

The scene must encode:

- a `banner` header;
- a three-column `main` workspace using the approved grid string;
- left and right `complementary` rails;
- a fluid center stack with Scene Altar, Chronicle, and command `form`;
- stable IDs for every named `ArcanePanel` part;
- `role="log"` for the Chronicle;
- a labeled command `input` and submit `button`;
- named attachment slots for corners, divider, seal, and state glyph;
- no live DOM, React, Pixi, or browser objects.

Use `sourceChecksum` from canonical source inputs rather than a timestamp.

- [ ] **Step 4: Add DTCG-style Polaris tokens**

Create token groups for `surface`, `text`, `state`, `space`, `border`, `font`, `target`, `layout`, `motion`, and `layer`. Required values include:

```json
{
  "surface": {
    "void": { "$type": "color", "$value": "#07090D" },
    "panel": { "$type": "color", "$value": "#10151C" },
    "inset": { "$type": "color", "$value": "#080C11" }
  },
  "state": {
    "focus": { "$type": "color", "$value": "#61D9FF" },
    "pending": { "$type": "color", "$value": "#D8A84D" },
    "success": { "$type": "color", "$value": "#68D391" },
    "warning": { "$type": "color", "$value": "#E0A94B" },
    "corrupted": { "$type": "color", "$value": "#EF5B7A" },
    "disconnected": { "$type": "color", "$value": "#A57586" }
  },
  "layout": {
    "bearing-min": { "$type": "dimension", "$value": "220px" },
    "scene-min": { "$type": "dimension", "$value": "640px" },
    "telemetry-min": { "$type": "dimension", "$value": "260px" }
  }
}
```

Add body, mono, and display font stacks with system fallbacks; no network font request is permitted.

- [ ] **Step 5: Implement the deterministic build adapter**

`build-polaris-console-ui.ts` must:

1. create and validate the scene;
2. throw with formatted diagnostics on any Compose error;
3. call `renderSceneToDomSpec`;
4. emit a TypeScript `as const` DOM plan;
5. flatten token leaves into `--polaris-*` custom properties;
6. sort object keys and token paths before serialization;
7. write only after both outputs have been built successfully.

Expose a testable API:

```ts
export interface BuildPolarisConsoleUiOptions {
  domPlanFile: string;
  tokenCssFile: string;
}

export async function buildPolarisConsoleUi(
  options: BuildPolarisConsoleUiOptions,
): Promise<{ sceneChecksum: string; files: readonly string[] }>;
```

Add scripts:

```json
{
  "polaris:build-console-ui": "tsx scripts/build-polaris-console-ui.ts",
  "build": "npm run build:tokens && npm run generate:compose-themes && npm run polaris:build-console-ui && node scripts/verify-css-tokens.js && node scripts/generate-school-styles.js && npm run build:corpus && npm run build:app"
}
```

and in `PolarisOS/package.json`:

```json
{
  "build:console-ui": "npm --prefix .. run polaris:build-console-ui"
}
```

- [ ] **Step 6: Generate, verify, and commit**

Run:

```bash
npm run polaris:build-console-ui
npx vitest run tests/qa/features/polaris-console-compose.test.ts
npm run ui:schema:validate
npm --prefix PolarisOS run typecheck
```

Expected: all commands exit `0`; a second generator run produces no diff.

Commit only Task 2 files:

```bash
git add src/core/compose/kits/polaris-console.ts tokens/compose/polaris-console.tokens.json scripts/build-polaris-console-ui.ts tests/qa/features/polaris-console-compose.test.ts tests/qa/features/fixtures/polaris-console.pb-ui-scene.v1.json PolarisOS/apps/client/src/generated/polaris-console.dom-plan.ts PolarisOS/apps/client/src/generated/polaris-console.tokens.css package.json PolarisOS/package.json
git commit -m "feat(polaris): generate canonical console shell"
```

---

## Task 3: Validate server messages and normalize `PolarisUiState`

**Files:**

- Modify: `PolarisOS/packages/contracts/src/protocol.ts`
- Create: `PolarisOS/packages/contracts/tests/ServerMessageSchema.test.ts`
- Create: `PolarisOS/apps/client/src/protocol/decodeServerMessage.ts`
- Create: `PolarisOS/apps/client/src/state/PolarisUiState.ts`
- Create: `PolarisOS/apps/client/src/state/reducer.ts`
- Create: `PolarisOS/apps/client/src/state/selectors.ts`
- Create: `PolarisOS/apps/client/tests/state/reducer.test.ts`
- Create: `PolarisOS/apps/client/tests/state/selectors.test.ts`
- Modify: `PolarisOS/vitest.config.ts`

**Consumes:** Existing server message shapes from `GameServer.ts` and `SnapshotBuilder.ts`.

**Produces:** A canonical `ServerMessageSchema`, quarantine result, stable client state, and pure selectors.

- [ ] **Step 1: Add failing protocol-contract tests**

Cover every declared server message:

```ts
const types = [
  'connection.ready',
  'room.snapshot',
  'command.accepted',
  'command.refused',
  'domain.events',
  'scene.patch',
  'state.resync.required',
  'server.error',
] as const;

for (const type of types) {
  expect(ServerMessageSchema.safeParse(validFixture(type)).success).toBe(true);
}
expect(ServerMessageSchema.safeParse({
  type: 'room.snapshot',
  envelope: { sequence: -1 },
}).success).toBe(false);
```

Use `RoomStateSchema`, `EntityStateSchema`, `PlayerStateSchema`, `DomainEventSchema`, and `SceneManifestSchema`; do not leave authoritative payloads as `z.unknown()`.

- [ ] **Step 2: Add failing reducer and selector tests**

Tests must prove:

- malformed input returns a quarantine diagnostic and never reaches the reducer;
- `room.snapshot` replaces the authoritative projection;
- `scene.patch` changes scene/entities/players without clearing Chronicle/input;
- duplicate events are idempotent;
- a sequence gap requests resync and preserves the last valid projection;
- selected entity is cleared only when it is no longer visible;
- visual-state selectors return `rest`, `focus`, `pending`, `success`, `warning`, `corrupted`, or `disconnected`;
- available actions derive from exits and visible hotspot commands only.

Add `"apps/*/tests/**/*.test.ts"` to `PolarisOS/vitest.config.ts` so client tests remain part of the normal Polaris test gate rather than relying on CLI-only discovery.

- [ ] **Step 3: Confirm the red state**

Run:

```bash
npm --prefix PolarisOS exec vitest run packages/contracts/tests/ServerMessageSchema.test.ts apps/client/tests/state/reducer.test.ts apps/client/tests/state/selectors.test.ts
```

Expected: imports or assertions fail because the union, decoder, state, reducer, and selectors do not exist.

- [ ] **Step 4: Complete the server message schema**

Add display-only schemas local to `protocol.ts`:

```ts
export const RoomInfoSchema = z.object({
  title: z.string(),
  description: z.string(),
  exits: z.record(z.string(), z.object({
    direction: z.string(),
    label: z.string(),
  })),
  illustration: z.object({
    backgroundAsset: z.string().optional(),
    ambientEffects: z.array(z.string()).optional(),
  }).optional(),
});

export const EntityInfoSchema = z.object({
  displayName: z.string(),
  description: z.string(),
  illustration: z.object({
    asset: z.string().optional(),
    activatedAsset: z.string().optional(),
    layerType: z.string().optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    interactable: z.boolean().optional(),
    hotspotCommand: z.string().optional(),
  }).optional(),
});
```

Define the missing accepted, patch, and resync schemas, include `narrative: z.array(z.string()).optional()` on domain events, then export:

```ts
export const ServerMessageSchema = z.discriminatedUnion('type', [
  ConnectionReadySchema,
  RoomSnapshotSchema,
  CommandAcceptedMessageSchema,
  CommandRefusedMessageSchema,
  DomainEventsMessageSchema,
  ScenePatchMessageSchema,
  StateResyncRequiredMessageSchema,
  ServerErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
```

- [ ] **Step 5: Implement quarantine decoding and the state model**

`decodeServerMessage` must never throw:

```ts
export type DecodeServerMessageResult =
  | { ok: true; message: ServerMessage }
  | {
      ok: false;
      diagnostic: {
        code: 'POLARIS_PROTOCOL_MALFORMED_JSON' | 'POLARIS_PROTOCOL_INVALID_MESSAGE';
        message: string;
      };
    };

export function decodeServerMessage(raw: string): DecodeServerMessageResult;
```

Define `PolarisUiState` with these stable domains:

```ts
export type PolarisVisualState =
  | 'rest' | 'focus' | 'pending' | 'success'
  | 'warning' | 'corrupted' | 'disconnected';

export interface PendingCommand {
  commandId: string;
  rawInput: string;
  submittedAt: number;
  phase: 'pending' | 'timed-out';
}

export interface ChronicleEntry {
  id: string;
  kind: 'narration' | 'command' | 'success' | 'warning' | 'error' | 'system';
  text: string;
  sequence: number | null;
}

export interface AvailableAction {
  id: string;
  label: string;
  command: string;
  source: 'exit' | 'hotspot';
}

export interface UiDiagnostic {
  code: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface PolarisUiState {
  connection: { phase: 'connecting' | 'connected' | 'disconnected'; worldId: string | null };
  envelope: RevisionEnvelope | null;
  room: RoomState | null;
  roomInfo: RoomInfo | null;
  entities: readonly EntityState[];
  players: readonly PlayerState[];
  entityInfo: Readonly<Record<string, EntityInfo>>;
  sceneManifest: SceneManifest | null;
  selectedEntityId: string | null;
  chronicle: readonly ChronicleEntry[];
  availableActions: readonly AvailableAction[];
  pendingCommand: PendingCommand | null;
  latestDiagnostic: UiDiagnostic | null;
  nextExpectedSequence: number | null;
  input: { draft: string; history: readonly string[]; historyIndex: number | null };
  navigationMode: 'keyboard' | 'pointer' | 'controller';
}
```

Keep reducer inputs explicit (`server-message`, `protocol-error`, `connection`, `input`, `selection`, `command-timeout`) and return new immutable state without browser APIs.

- [ ] **Step 6: Implement selectors, prove, and commit**

Export:

```ts
export function selectConsoleState(state: PolarisUiState): PolarisVisualState;
export function selectComponentState(
  component: 'shell' | 'scene' | 'chronicle' | 'command' | 'telemetry',
  state: PolarisUiState,
): PolarisVisualState;
export function selectVisibleEntities(state: PolarisUiState): readonly EntityView[];
export function selectInventory(state: PolarisUiState, playerId: string): readonly EntityView[];
export function selectAttachmentKey(
  family: string,
  state: PolarisVisualState,
  registry: Readonly<Record<string, unknown>>,
): string | null;
```

Attachment resolution order is exact state, then `rest`, then `null`.

Run:

```bash
npm --prefix PolarisOS exec vitest run packages/contracts/tests/ServerMessageSchema.test.ts apps/client/tests/state
npm --prefix PolarisOS run typecheck
```

Expected: all commands exit `0`.

Commit:

```bash
git add PolarisOS/packages/contracts/src/protocol.ts PolarisOS/packages/contracts/tests/ServerMessageSchema.test.ts PolarisOS/apps/client/src/protocol/decodeServerMessage.ts PolarisOS/apps/client/src/state PolarisOS/apps/client/tests/state PolarisOS/vitest.config.ts
git commit -m "feat(polaris): normalize validated client state"
```

---

## Task 4: Mount the semantic shell and bind state without a framework

**Files:**

- Create: `PolarisOS/apps/client/src/ui/mountDomPlan.ts`
- Create: `PolarisOS/apps/client/src/ui/PolarisConsoleView.ts`
- Create: `PolarisOS/apps/client/src/styles/polaris-console.css`
- Create: `PolarisOS/apps/client/tests/ui/mountDomPlan.test.ts`
- Create: `PolarisOS/apps/client/tests/ui/PolarisConsoleView.test.ts`
- Modify: `PolarisOS/apps/client/index.html`
- Modify: `PolarisOS/apps/client/src/main.ts`
- Modify: `PolarisOS/package.json`
- Modify: `PolarisOS/package-lock.json`

**Consumes:** Generated DOM plan/tokens from Task 2 and `PolarisUiState`/selectors from Task 3.

**Produces:** Stable semantic DOM, panel renderers, responsive layout, and a thin bootstrap.

- [ ] **Step 1: Write failing pure DOM-plan tests**

Add `jsdom@^28.0.0` as a Polaris dev dependency, mark both test files with `// @vitest-environment jsdom`, and do not add React. Assert:

```ts
expect(root.querySelector('header#polaris-system-header')).not.toBeNull();
expect(root.querySelector('main#polaris-workspace')).not.toBeNull();
expect(root.querySelector('aside#polaris-bearing-rail')).not.toBeNull();
expect(root.querySelector('ol#polaris-chronicle-log')?.getAttribute('aria-live')).toBe('polite');
expect(root.querySelector('form#polaris-command-conduit')).not.toBeNull();
expect(root.querySelectorAll('[data-attachment-slot]').length).toBeGreaterThan(0);
```

Add a recovery-shell test for a missing or invalid generated plan.

- [ ] **Step 2: Write failing state-binding tests**

Given a connected snapshot state, assert:

- header contains world and room;
- exits and nearby entities are lists of buttons;
- Chronicle entries append as `<li>` nodes without replacing previous nodes;
- Telemetry uses a `<dl>` for label/value data;
- `data-state` attributes match selectors;
- disconnect preserves input and Chronicle while disabling world actions;
- rendering with zero attachment hosts leaves all semantic content present.

- [ ] **Step 3: Confirm the red state**

Run:

```bash
npm --prefix PolarisOS install --save-dev jsdom@^28.0.0
npm --prefix PolarisOS exec vitest run apps/client/tests/ui/mountDomPlan.test.ts apps/client/tests/ui/PolarisConsoleView.test.ts
```

Expected: failure because the mount and view modules do not exist.

- [ ] **Step 4: Implement the generated-plan host**

Expose:

```ts
export interface MountedPolarisConsole {
  root: HTMLElement;
  byId: ReadonlyMap<string, HTMLElement>;
  attachmentHosts: readonly HTMLElement[];
}

export function mountDomPlan(
  document: Document,
  target: HTMLElement,
  plan: DomNodeSpec,
): MountedPolarisConsole;
```

Requirements:

- create native elements from `tag`;
- set IDs, safe attributes, inline layout intent, and `data-compose-kind`;
- create a child `span` for each attachment with `aria-hidden="true"`, `data-attachment-slot`, and `data-visual-id`;
- never set `innerHTML` from server data;
- if mounting fails, replace the target with a `main`, connection status, text scene region, Chronicle log, and labeled command form.

- [ ] **Step 5: Implement state bindings**

`PolarisConsoleView` owns references and incremental projections:

```ts
export interface PolarisConsoleView {
  render(previous: PolarisUiState | null, next: PolarisUiState): void;
  focusCommand(): void;
  destroy(): void;
}

export function createPolarisConsoleView(
  mounted: MountedPolarisConsole,
  callbacks: {
    onCommand(rawInput: string): void;
    onAction(command: string): void;
    onSelectEntity(entityId: string): void;
    onReconnect(): void;
  },
): PolarisConsoleView;
```

Update only changed regions. Preserve the command input DOM node and its value across connection renders. Use text nodes for all protocol-derived strings.

- [ ] **Step 6: Build the desktop-first CSS**

Import generated tokens first, then `polaris-console.css`. Reuse layout principles from DivWand, Wand, and PhotonicBridgeLab without importing their page components.

Required rules:

```css
.polaris-console {
  min-height: 100dvh;
  overflow: hidden;
  background: var(--polaris-surface-void);
  color: var(--polaris-text-primary);
}

#polaris-workspace {
  display: grid;
  grid-template-columns:
    minmax(var(--polaris-layout-bearing-min), .8fr)
    minmax(var(--polaris-layout-scene-min), 2.4fr)
    minmax(var(--polaris-layout-telemetry-min), 1fr);
  min-height: 0;
}

@media (max-width: 1280px) {
  #polaris-workspace {
    grid-template-columns: minmax(210px, .72fr) minmax(0, 2fr);
  }
  #polaris-telemetry-rail {
    position: fixed;
    inset: auto 0 0 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

Use `:focus-visible`, minimum `44px` action targets, internal panel scrolling, `image-rendering: pixelated`, and text overflow rules that do not hide action labels.

- [ ] **Step 7: Thin `index.html` and `main.ts`, then verify**

`index.html` becomes only metadata plus:

```html
<div id="app" aria-busy="true"></div>
<script type="module" src="/src/main.ts"></script>
```

`main.ts` imports styles, mounts the plan, creates state/view/transport, and registers teardown. Move all rendering helpers out of `main.ts`.

Run:

```bash
npm --prefix PolarisOS exec vitest run apps/client/tests/ui
npm --prefix PolarisOS run build --workspace=apps/client
npm --prefix PolarisOS run typecheck
```

Expected: tests and build exit `0`; `main.ts` contains bootstrap wiring rather than panel markup.

Commit:

```bash
git add PolarisOS/apps/client/index.html PolarisOS/apps/client/src/main.ts PolarisOS/apps/client/src/ui PolarisOS/apps/client/src/styles/polaris-console.css PolarisOS/apps/client/tests/ui PolarisOS/package.json PolarisOS/package-lock.json
git commit -m "feat(polaris): mount semantic lattice console"
```

---

## Task 5: Rehouse Pixi inside the Scene Altar with an explicit fallback

**Files:**

- Create: `PolarisOS/apps/client/src/ui/SceneAltarController.ts`
- Create: `PolarisOS/apps/client/tests/ui/SceneAltarController.test.ts`
- Modify: `PolarisOS/apps/client/src/ui/PolarisConsoleView.ts`
- Modify: `PolarisOS/apps/client/src/main.ts`
- Modify: `PolarisOS/apps/client/src/styles/polaris-console.css`

**Consumes:** Existing `PixiSceneRenderer`, `SceneManifest`, and the `polaris-scene-altar-render-host`.

**Produces:** A bounded Pixi portal with text fallback, status reporting, and teardown.

- [ ] **Step 1: Add failing controller tests**

Use a fake renderer port:

```ts
export interface SceneRendererPort {
  renderScene(manifest: SceneManifest): Promise<unknown>;
  readonly isFallback: boolean;
  destroy(): void;
}
```

Prove:

- a new contract hash renders once;
- the same contract hash does not rerender;
- rejected render activates text fallback and emits `POLARIS_SCENE_RENDER_FAILED`;
- forced `mode=text` starts in fallback;
- destroy is idempotent.

- [ ] **Step 2: Run the focused test and confirm failure**

```bash
npm --prefix PolarisOS exec vitest run apps/client/tests/ui/SceneAltarController.test.ts
```

Expected: failure because the controller does not exist.

- [ ] **Step 3: Implement the controller**

Expose:

```ts
export function createSceneAltarController(options: {
  renderer: SceneRendererPort;
  renderHost: HTMLElement;
  fallbackHost: HTMLElement;
  statusHost: HTMLElement;
  onDiagnostic(diagnostic: UiDiagnostic): void;
}): {
  render(manifest: SceneManifest | null): Promise<void>;
  setForcedTextMode(enabled: boolean): void;
  destroy(): void;
};
```

The text fallback must be ordinary DOM generated from the manifest title/description/entity-label text regions and remain hidden only while illustrated output is healthy. `setForcedTextMode(true)` skips renderer calls and exposes that fallback; constructing `PixiSceneRenderer` with its existing `fallbackMode` option remains the adapter-level path for permanent text mode. Hotspot callbacks still submit commands through the command callback; they never alter state directly.

- [ ] **Step 4: Integrate and verify**

Give the render host a bounded aspect ratio based on `SCENE_WIDTH`/`SCENE_HEIGHT`, isolate overflow, and ensure canvas does not cover header/status/fallback nodes.

Run:

```bash
npm --prefix PolarisOS exec vitest run apps/client/tests/ui/SceneAltarController.test.ts apps/client/tests/ui/PolarisConsoleView.test.ts
npm --prefix PolarisOS run build --workspace=apps/client
```

Expected: all commands exit `0`.

Commit:

```bash
git add PolarisOS/apps/client/src/ui/SceneAltarController.ts PolarisOS/apps/client/tests/ui/SceneAltarController.test.ts PolarisOS/apps/client/src/ui/PolarisConsoleView.ts PolarisOS/apps/client/src/main.ts PolarisOS/apps/client/src/styles/polaris-console.css
git commit -m "feat(polaris): contain pixi in scene altar"
```

---

## Task 6: Compile SCDL UI families into the immutable asset registry

**Files:**

- Modify: `PolarisOS/scripts/build-pixelbrain-assets.ts`
- Modify: `PolarisOS/scripts/tests/build-pixelbrain-assets.test.ts`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/arcane-terminal.assets.json`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/arcane-panel-rest-corners.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/arcane-panel-focus-corners.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/arcane-panel-warning-corners.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/arcane-panel-corrupted-corners.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/command-conduit-rest-sigil.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/command-conduit-pending-sigil.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/command-conduit-success-sigil.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/command-conduit-warning-sigil.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/command-conduit-corrupted-sigil.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/connection-rest-seal.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/connection-success-seal.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/connection-warning-seal.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/connection-corrupted-seal.scdl`
- Create: `PolarisOS/worldpacks/shrine-demo/assets-src/connection-disconnected-seal.scdl`
- Create: `PolarisOS/apps/client/src/ui/PixelBrainAttachmentHost.ts`
- Create: `PolarisOS/apps/client/tests/ui/PixelBrainAttachmentHost.test.ts`
- Modify: `PolarisOS/apps/client/src/ui/PolarisConsoleView.ts`
- Generate: `PolarisOS/apps/client/src/generated/pixelbrainAssetRegistry.ts`
- Generate: `PolarisOS/apps/client/public/assets/generated/*`

**Consumes:** Root `compileSCDL`/`exportSCDL`, Compose attachment packet IDs, existing `processPixelBrainPacket`, and the fingerprinted registry.

**Produces:** Deterministic SCDL packet/SVG assets and a DOM attachment host with CSS fallback.

- [ ] **Step 1: Add failing SCDL manifest/build tests**

The manifest is an explicit map:

```json
{
  "version": 1,
  "assets": [
    {
      "source": "arcane-panel-rest-corners.scdl",
      "assetKey": "arcane-panel/rest/corners",
      "family": "arcane-panel/corners",
      "state": "rest",
      "anchor": [0, 0]
    }
  ]
}
```

Tests must require:

- every source compiles with `compileSCDL(source, { strict: true })`;
- each manifest key is unique;
- all members of a family have the same canvas width/height and anchor;
- packet JSON and SVG names contain deterministic hashes;
- a second build is byte-identical;
- one invalid SCDL source aborts before registry emission.

- [ ] **Step 2: Add failing attachment-host tests**

Prove:

- exact-state registry key is selected;
- missing exact state falls back to `rest`;
- missing family adds `data-attachment-status="missing"`, keeps CSS geometry, and emits one diagnostic per key;
- decorative elements are `aria-hidden` with empty `alt`;
- display dimensions are whole numbers.

- [ ] **Step 3: Confirm the red state**

Run:

```bash
npm --prefix PolarisOS exec vitest run scripts/tests/build-pixelbrain-assets.test.ts apps/client/tests/ui/PixelBrainAttachmentHost.test.ts
```

Expected: manifest/SCDL and attachment cases fail.

- [ ] **Step 4: Extend the asset builder without duplicating SCDL**

Import the root public API only:

```ts
import { compileSCDL, exportSCDL } from '../../codex/core/pixelbrain/scdl/index.js';
```

Add:

```ts
export interface ScdlAssetManifestEntry {
  source: string;
  assetKey: string;
  family: string;
  state: 'rest' | 'focus' | 'pending' | 'success' | 'warning' | 'corrupted' | 'disconnected';
  anchor: readonly [number, number];
}
```

For each manifest entry:

1. resolve source beneath `sourceDir` and reject path escape;
2. compile in strict mode;
3. process the emitted packet through `processPixelBrainPacket`;
4. export SVG from the same packet;
5. hash SVG bytes as `svg1:<sha256>`;
6. emit normalized packet JSON plus SVG;
7. add `svgUrl`, `expectedSvgHash`, `family`, `state`, `width`, `height`, and `anchor` to the generated registry.

Existing `.pixelbrain.json` inputs and PNG behavior must remain unchanged.

- [ ] **Step 5: Author the static SCDL variants**

Use only supported SCDL operations. Keep the role palette identical across files and dimensions identical within each family. Visual rules:

- panel corners: symmetrical brass frame, cyan focus accent, amber warning nick, magenta corruption fracture;
- command sigil: centered execution mark with distinct still silhouettes for pending/success/warning/corrupted;
- connection seal: legible whole-pixel state mark; disconnected must differ in shape as well as color.

Do not use reserved transform, boolean, instancing, animation, or glow operations.

- [ ] **Step 6: Implement the runtime attachment host**

Expose:

```ts
export function createPixelBrainAttachmentHost(options: {
  hosts: readonly HTMLElement[];
  registry: PixelBrainAssetRegistry;
  onDiagnostic(diagnostic: UiDiagnostic): void;
}): {
  render(componentStates: Readonly<Record<string, PolarisVisualState>>): void;
  destroy(): void;
};
```

Each host derives its family from the rest-state `packetId`, selects state/rest/null, and mounts an `<img decoding="async" alt="" aria-hidden="true">` using `svgUrl`. Replace `src` only when the resolved key changes. On failure, remove the image and retain the host's CSS border/corner fallback.

- [ ] **Step 7: Build, verify, and commit source plus generated outputs**

Run:

```bash
npm --prefix PolarisOS run build:pixelbrain-assets
npm --prefix PolarisOS exec vitest run scripts/tests/build-pixelbrain-assets.test.ts apps/client/tests/ui/PixelBrainAttachmentHost.test.ts
npm --prefix PolarisOS run typecheck
npm --prefix PolarisOS run build --workspace=apps/client
```

Expected: all commands exit `0`; rerunning the asset build produces no diff.

Stage the manifest, named SCDL sources, builder/test, host/test, integration file, generated registry, generated manifest, and only the newly generated hashed assets. Inspect `git diff --cached --name-only` before committing.

```bash
git commit -m "feat(polaris): compile arcane SCDL attachments"
```

---

## Task 7: Add deterministic command, reconnect, focus, and controller behavior

**Files:**

- Create: `PolarisOS/apps/client/src/protocol/PolarisTransport.ts`
- Create: `PolarisOS/apps/client/src/ui/CommandController.ts`
- Create: `PolarisOS/apps/client/src/ui/NavigationController.ts`
- Create: `PolarisOS/apps/client/tests/protocol/PolarisTransport.test.ts`
- Create: `PolarisOS/apps/client/tests/ui/CommandController.test.ts`
- Create: `PolarisOS/apps/client/tests/ui/NavigationController.test.ts`
- Modify: `PolarisOS/apps/client/src/state/reducer.ts`
- Modify: `PolarisOS/apps/client/src/ui/PolarisConsoleView.ts`
- Modify: `PolarisOS/apps/client/src/main.ts`

**Consumes:** Validated messages, `PolarisUiState`, client message contracts, and semantic action elements.

**Produces:** Explicit transport lifecycle, pending/timeout/retry state, command history, and predictable keyboard/controller traversal.

- [ ] **Step 1: Add failing transport tests with a fake WebSocket and fake clock**

Prove:

- open sends `connection.identify`;
- `connection.ready` sends `room.join`;
- raw messages pass through `decodeServerMessage`;
- malformed messages emit `protocol-error` without changing the socket lifecycle;
- close schedules one reconnect with capped delay;
- reconnect preserves draft/history/Chronicle through reducer events;
- no command is replayed on reconnect.

- [ ] **Step 2: Add failing command and navigation tests**

Command cases:

- whitespace-only input is refused locally;
- submit creates one command ID, sends once, records history, and sets pending;
- matching accepted/refused clears pending with success/corrupted Chronicle output;
- unrelated command response does not clear pending;
- 8,000 ms timeout changes phase to `timed-out` and exposes retry;
- retry requires a user action and creates a new command ID.

Navigation cases:

- `Tab` retains native document order;
- Arrow/D-pad traversal moves within the current rail/action group;
- `Escape` closes the telemetry drawer and restores prior focus;
- `/` focuses the command input unless another editable control owns focus;
- pointer, keyboard, and controller input update `navigationMode`.

- [ ] **Step 3: Confirm the red state**

```bash
npm --prefix PolarisOS exec vitest run apps/client/tests/protocol/PolarisTransport.test.ts apps/client/tests/ui/CommandController.test.ts apps/client/tests/ui/NavigationController.test.ts
```

Expected: failures because the three controllers do not exist.

- [ ] **Step 4: Implement transport behind a narrow port**

Expose:

```ts
export interface PolarisTransport {
  connect(): void;
  send(message: ClientMessage): boolean;
  reconnectNow(): void;
  destroy(): void;
}

export function createPolarisTransport(options: {
  url: string;
  playerId: string;
  roomId: string;
  onEvent(event: PolarisUiEvent): void;
  createSocket?: (url: string) => WebSocketLike;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
}): PolarisTransport;
```

Reconnect delays are `2s`, `4s`, `8s`, then capped at `10s`; a successful `connection.ready` resets the attempt count. `destroy()` cancels the timer and closes the current socket.

- [ ] **Step 5: Implement command lifecycle**

Expose:

```ts
export function createCommandController(options: {
  now: () => number;
  schedule: (callback: () => void, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
  send: (message: ClientMessage) => boolean;
  dispatch: (event: PolarisUiEvent) => void;
  getState: () => PolarisUiState;
  playerId: string;
  roomId: string;
}): {
  submit(rawInput: string): void;
  retry(): void;
  destroy(): void;
};
```

Use an incrementing session counter plus timestamp for IDs. Send `expectedRevision` from the current envelope. Echo the command to Chronicle, but never change authoritative entities/room/scene.

- [ ] **Step 6: Implement accessible navigation and visible status**

Use native buttons and inputs first. Roving focus applies only inside elements marked `data-navigation-group`; do not override normal Tab behavior. Add text labels for every state:

```ts
const STATE_LABELS = {
  rest: 'Ready',
  focus: 'Focused',
  pending: 'Awaiting the Vale',
  success: 'Confirmed',
  warning: 'Attention required',
  corrupted: 'Command rejected',
  disconnected: 'Disconnected',
} as const;
```

The Chronicle is the polite live log; connection errors use a separate `role="status"` unless immediate action is required.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm --prefix PolarisOS exec vitest run apps/client/tests/protocol apps/client/tests/ui/CommandController.test.ts apps/client/tests/ui/NavigationController.test.ts apps/client/tests/state
npm --prefix PolarisOS run typecheck
npm --prefix PolarisOS run build --workspace=apps/client
```

Expected: all commands exit `0`.

Commit:

```bash
git add PolarisOS/apps/client/src/protocol PolarisOS/apps/client/src/ui/CommandController.ts PolarisOS/apps/client/src/ui/NavigationController.ts PolarisOS/apps/client/src/state/reducer.ts PolarisOS/apps/client/src/ui/PolarisConsoleView.ts PolarisOS/apps/client/src/main.ts PolarisOS/apps/client/tests/protocol PolarisOS/apps/client/tests/ui/CommandController.test.ts PolarisOS/apps/client/tests/ui/NavigationController.test.ts
git commit -m "feat(polaris): add resilient ritual controls"
```

---

## Task 8: Build the controlled browser fixtures and Photonic observation bench

**Files:**

- Create: `PolarisOS/apps/client/src/testing/fixture-main.ts`
- Create: `PolarisOS/tests/browser/polaris-console-fixture.html`
- Create: `PolarisOS/tests/browser/fixtures/consoleStates.ts`
- Create: `PolarisOS/tests/browser/PolarisConsole.spec.ts`
- Modify: `PolarisOS/playwright.pixelbrain.config.ts`
- Modify: `PolarisOS/package.json`
- Modify: `PolarisOS/package-lock.json`
- Create: `scripts/polaris-observation/observation-lattice.mjs`
- Create: `scripts/polaris-observation/run.mjs`
- Create: `tests/photonic-retina/polaris-console-observation.test.js`
- Create: `tests/photonic-retina/fixtures/polaris-console-thresholds.json`
- Create: `tests/photonic-retina/fixtures/polaris-console-baselines.json`
- Modify: `package.json`

**Consumes:** The production mount/view/controllers, Playwright screenshots and DOM geometry, and root Photonic Retina.

**Produces:** Deterministic UI state fixtures, accessibility/geometry coverage, and design-time pixels/coordinates/lattice diagnostics.

- [ ] **Step 1: Add failing browser coverage**

The fixture entrypoint must import the same generated plan, CSS, mount, view, attachment host, and Scene Altar controller used by production, but inject fixture state and a fake renderer/transport.

For both `1440×900` and `1280×800`, test:

- connected/rest;
- focus traversal;
- command pending;
- command success;
- warning;
- corrupted/rejected;
- disconnected;
- missing attachment;
- Pixi text fallback;
- reduced motion.

Assertions include:

```ts
await expect(page.locator('#polaris-scene-altar')).toBeVisible();
await expect(page.locator('#polaris-command-input')).toBeEditable();
expect(await page.evaluate(
  () => document.documentElement.scrollWidth <= window.innerWidth,
)).toBe(true);
expect(await page.locator('[data-clipped="true"]').count()).toBe(0);
expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
```

Use explicit bounding-box assertions for the Scene Altar minimum, side-rail target sizes, and viewport containment. Add `@axe-core/playwright@^4.11.3` to Polaris dev dependencies and preserve pre-existing lockfile changes.

- [ ] **Step 2: Add failing row-major observation tests**

Define:

```js
export function buildObservationLattice({
  rgba,
  width,
  height,
  nodes,
  cols = 32,
  rows = 20,
});

export function compareObservationLattices(baseline, candidate, thresholds);
```

Tests must prove:

```js
expect(cellIndex({ row: 3, col: 7, cols: 32 })).toBe(103);
expect(report.changedCellCount).toBe(
  report.changedMask.filter(Boolean).length,
);
expect(report.changedMask).toHaveLength(32 * 20);
```

The test must fail if code attempts to map Retina compressed vector indices back to screen cells.

- [ ] **Step 3: Confirm both red states**

Run:

```bash
npm --prefix PolarisOS run test:browser:console
npx vitest run tests/photonic-retina/polaris-console-observation.test.js
```

Expected: browser script/fixture and observation modules are missing.

- [ ] **Step 4: Implement deterministic browser capture**

For each state/viewport, write under `/tmp/polaris-console-observations`:

- `<viewport>/<state>.png`;
- `<viewport>/<state>.nodes.json`;
- one `manifest.json` sorted by viewport then state.

Node records are:

```ts
export interface ComposeNodeCapture {
  id: string;
  role: string | null;
  emphasis: 'primary' | 'secondary' | 'diagnostic';
  rect: { x: number; y: number; width: number; height: number };
}
```

Capture only visible `[id][data-compose-kind]` nodes. Round geometry to whole CSS pixels. The test may write temporary observation artifacts, but committed baselines update only when `POLARIS_UPDATE_OBSERVATIONS=1`.

- [ ] **Step 5: Implement the Photonic adapter**

`run.mjs` must:

1. read the capture manifest;
2. decode PNG to RGBA using root `sharp`;
3. send raster bytes through Photonic source kind `pixels`;
4. send node centers/bounds through `coordinates`;
5. build the uncompressed `32×20` coarse lattice in row-major order;
6. send that lattice through Photonic source kind `lattice`;
7. compare spatial masks using the uncompressed lattice arrays;
8. use Retina packets only as deterministic fingerprints/diagnostics;
9. report clipped/collapsed nodes, unexpected geometry drift, missing expected changes, and excessive attention coverage by severity;
10. exit nonzero when committed thresholds are exceeded.

Baseline records contain only stable fingerprints, expected changed-cell ranges, geometry tolerances, and diagnostic ceilings—never browser paths or timestamps.

- [ ] **Step 6: Add scripts and establish baselines**

Add to Polaris:

```json
{
  "test:browser:console": "playwright test --config playwright.pixelbrain.config.ts tests/browser/PolarisConsole.spec.ts"
}
```

Install the declared browser-test dependency:

```bash
npm --prefix PolarisOS install --save-dev @axe-core/playwright@^4.11.3
```

Add to root:

```json
{
  "polaris:observe": "npm --prefix PolarisOS run test:browser:console && node scripts/polaris-observation/run.mjs /tmp/polaris-console-observations",
  "polaris:observe:update": "POLARIS_UPDATE_OBSERVATIONS=1 npm run polaris:observe"
}
```

Run the update once, inspect screenshots manually, then rerun without the update flag.

- [ ] **Step 7: Verify and commit**

Run:

```bash
npm --prefix PolarisOS run test:browser:console
npx vitest run tests/photonic-retina/polaris-console-observation.test.js
npm run polaris:observe
```

Expected: all commands exit `0`; reports cover both viewports and all controlled states; no production bundle contains Photonic imports.

Commit:

```bash
git add PolarisOS/apps/client/src/testing/fixture-main.ts PolarisOS/tests/browser/polaris-console-fixture.html PolarisOS/tests/browser/fixtures/consoleStates.ts PolarisOS/tests/browser/PolarisConsole.spec.ts PolarisOS/playwright.pixelbrain.config.ts PolarisOS/package.json PolarisOS/package-lock.json scripts/polaris-observation tests/photonic-retina/polaris-console-observation.test.js tests/photonic-retina/fixtures/polaris-console-thresholds.json tests/photonic-retina/fixtures/polaris-console-baselines.json package.json
git commit -m "test(polaris): add photonic console observation"
```

---

## Task 9: Run the complete verification gate and document operation

**Files:**

- Create: `PolarisOS/docs/STATEFUL_LATTICE_CONSOLE.md`
- Modify: `PolarisOS/README.md`
- Modify: `Polaris-OS-Encyclopedia/Bug Reports/*` only if verification exposes a new reproducible defect and the repository bug-report law requires a report

**Consumes:** All prior tasks.

**Produces:** Operator documentation, complete evidence, and a clean handoff.

- [ ] **Step 1: Document the runtime and build boundaries**

The document must include exact commands:

```bash
npm run polaris:build-console-ui
npm --prefix PolarisOS run build:pixelbrain-assets
npm --prefix PolarisOS run dev:server
npm --prefix PolarisOS run dev:client
npm --prefix PolarisOS run test:browser:console
npm run polaris:observe
```

Explain:

- server port `3100` is WebSocket/API, not the Vite page;
- the player page comes from the client URL printed by Vite;
- Compose/SCDL regeneration rules;
- `?mode=text` Pixi fallback;
- observation artifact location;
- how to update baselines intentionally;
- how disconnect, malformed message, missing asset, and timeout recovery behave.

- [ ] **Step 2: Run focused and full gates**

Run:

```bash
npm run polaris:build-console-ui
npm --prefix PolarisOS run build:pixelbrain-assets
npm run ui:render:test
npm run ui:schema:validate
npx vitest run tests/qa/features/polaris-console-compose.test.ts tests/photonic-retina/polaris-console-observation.test.js
npm --prefix PolarisOS test
npm --prefix PolarisOS run typecheck
npm --prefix PolarisOS run lint
npm --prefix PolarisOS run build
npm --prefix PolarisOS run test:browser:pixelbrain
npm --prefix PolarisOS run test:browser:console
npm run polaris:observe
```

Expected: every command exits `0`.

- [ ] **Step 3: Inspect generated drift and bundle boundaries**

Run:

```bash
git status --short
git diff --check
rg -n "photonic-retina|compileSCDL|renderSceneToDomSpec" PolarisOS/apps/client/dist
```

Expected:

- `git diff --check` is silent;
- a second Compose/SCDL build creates no diff;
- the `rg` command returns no matches from the production client bundle;
- no unrelated worktree paths are staged.

- [ ] **Step 4: Perform the manual acceptance pass**

At `1440×900` and `1280×800`, verify:

1. command input is persistent and reachable;
2. Scene Altar is the dominant center region;
3. Bearing Rail remains readable;
4. Telemetry becomes a drawer at the narrow breakpoint;
5. Chronicle appends without stealing focus;
6. keyboard and controller traversal reach every action;
7. each visual state has text/shape distinction, not color alone;
8. zoom to 200% retains command access;
9. disabling images leaves a complete semantic interface;
10. `?mode=text` exposes the text scene;
11. disconnect preserves draft and Chronicle;
12. retry requires an explicit user action.

- [ ] **Step 5: File a bug report only for a newly observed defect**

If a new reproducible defect appears, create a separate report in `Polaris-OS-Encyclopedia/Bug Reports` with:

- observed/expected behavior;
- exact command and URL;
- environment and commit;
- reproduction steps;
- relevant logs/screenshots;
- affected paths;
- verification status.

Do not reopen or duplicate the already-fixed worldpack/client-port reports.

- [ ] **Step 6: Commit documentation and record verification**

Commit only documentation and any required new report:

```bash
git add PolarisOS/docs/STATEFUL_LATTICE_CONSOLE.md PolarisOS/README.md
git commit -m "docs(polaris): document lattice console workflow"
```

If a bug report was required, stage it explicitly and use a separate `docs(bug): ...` commit.

Record the exact successful commands, commit hashes, browser viewport matrix, Photonic report path, and any accepted limitations in the collaboration task result before marking it done and releasing all locks.

---

## Completion Criteria

- The production client mounts the generated Compose anatomy and contains no runtime Compose compiler.
- All incoming server messages are validated; malformed messages preserve the last valid state.
- The shell remains semantic and usable with SCDL disabled and with Pixi in text mode.
- Commands cover submit, accept, refuse, timeout, explicit retry, disconnect, and reconnect without optimistic world mutation or automatic replay.
- SCDL sources compile deterministically into fingerprinted packet/SVG assets; state-family geometry does not shift.
- Desktop and Steam Deck fixtures pass accessibility, geometry, visual, and Photonic checks.
- Photonic spatial comparisons use uncompressed row-major lattice indices; compressed Retina vectors remain fingerprints only.
- Generated files reproduce without drift, full verification is green, documentation is current, and unrelated worktree changes remain untouched.
