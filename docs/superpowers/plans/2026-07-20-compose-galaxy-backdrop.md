# Compose Galaxy Backdrop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Always-on Compose galaxy backdrop that rotates the static spiral on the compositor while the full photonic storm (lightning, retina bridge, sparkles) paints on a transparent overlay.

**Architecture:** `createGalaxyBackdropScene` + `ComposeGalaxyBackdrop` owns a baked `galaxy-plate` (CSS/WAAPI `transform` rotate at `PATTERN_SPEED`) and a `storm-overlay` slot hosting `StormCanvas` with `skipGalaxyPlate`. Validate-fail falls back to today's single-canvas `StormCanvas`.

**Tech Stack:** React, Compose packets (`PB-UI-SCENE-v1`), Landing CSS, `galaxySim` / `photonicStorm`, Vitest

## Global Constraints

- Always-on — no feature-flag gate on the primary Landing render path
- Full storm retained — lightning, retina bridge, intensity, sparkles
- Plate motion: compositor `transform` only; rebuild bitmap only on resize; DPR ≤ 2
- Angular speed parity with `PATTERN_SPEED` (0.05 rad/s); phase sync with storm clock not required
- `prefers-reduced-motion`: frozen plate; storm `renderStatic`
- Visual identity locked (Hα / OIII / SII / dust + spiral constants)
- Out of scope: combat galaxy, WebGL rewrite, dissolve/nav, intensity defaults
- **Do not auto-commit** unless the user explicitly asks

## File Structure

| File | Responsibility |
|---|---|
| `src/core/compose/migrated/GalaxyBackdrop.ts` | Scene factory, kind/parts, migration registry |
| `src/core/compose/migrated/ComposeGalaxyBackdrop.tsx` | Always-on shell: bake plate, CSS rotate, mount storm overlay / fallback |
| `src/pages/Landing/storm/galaxySim.js` | Export `PATTERN_SPEED`, `bakeGalaxyPlate`, split plate vs sparkle draw |
| `src/pages/Landing/storm/photonicStorm.js` | `skipGalaxyPlate` option; still init/update galaxy + sparkles |
| `src/pages/Landing/StormCanvas.jsx` | Pass `skipGalaxyPlate` into storm |
| `src/pages/Landing/LandingPage.jsx` | Mount `ComposeGalaxyBackdrop` instead of bare `StormCanvas` |
| `src/pages/Landing/LandingPage.css` | Plate/overlay stack + spin keyframes + reduced-motion |
| `src/core/compose/flags.ts` | Tracking-only `compose:migrate:galaxy` |
| `src/core/compose/packets.ts` / `index.ts` | Re-exports |
| `tests/qa/features/fixtures/galaxy-backdrop.pb-ui-scene.v1.json` | Golden |
| `tests/qa/features/compose-galaxy-backdrop-packet.test.ts` | Packet + canonicalize |
| `tests/qa/features/compose-galaxy-backdrop-engine.test.js` | Plate bake + skip-draw |
| `tests/qa/features/compose-galaxy-backdrop-shell.test.tsx` | Shell + Landing wire |

---

### Task 1: Scene packet + golden

**Files:**
- Create: `src/core/compose/migrated/GalaxyBackdrop.ts`
- Create: `tests/qa/features/fixtures/galaxy-backdrop.pb-ui-scene.v1.json`
- Create: `tests/qa/features/compose-galaxy-backdrop-packet.test.ts`
- Modify: `src/core/compose/flags.ts` — add `MIGRATE_GALAXY: 'compose:migrate:galaxy'` (default off; tracking only)
- Modify: `src/core/compose/packets.ts` — export scene APIs
- Modify: `src/core/compose/index.ts` — export scene APIs (+ shell later)

**Interfaces:**
- Consumes: `emitPbUiScene`, `emitPbLayout`, `createComponentDefinition`, `migrationRegistry`, `COMPOSE_FLAGS`
- Produces:
  - `GALAXY_BACKDROP_KIND = 'galaxy-backdrop'`
  - `GALAXY_BACKDROP_ID = 'galaxy-backdrop'`
  - `createGalaxyBackdropDefinition(): ScholComponentDefinitionV1`
  - `createGalaxyBackdropScene(): PbUiSceneV1`
  - `registerGalaxyBackdropMigration(): void`
  - `shouldUseComposeGalaxyBackdrop(): boolean` (tracking only; does not gate render)

- [x] **Step 1: Write the failing packet test**

```ts
/**
 * Galaxy backdrop PB scene (Compose pilot)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizePacket,
  createGalaxyBackdropScene,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { contractRegistry, PB_UI_SCENE_V1, PB_LAYOUT_V1 } from '../../../src/core/compose/schema/contracts';

const FIXTURE = join(
  process.cwd(),
  'tests/qa/features/fixtures/galaxy-backdrop.pb-ui-scene.v1.json',
);

describe('Galaxy Backdrop PB scene (compose pilot)', () => {
  beforeEach(() => {
    contractRegistry.clear();
    contractRegistry.register(PB_UI_SCENE_V1);
    contractRegistry.register(PB_LAYOUT_V1);
  });

  it('emits PB-UI-SCENE-v1 with galaxy-plate and storm-overlay children', () => {
    const scene = createGalaxyBackdropScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('galaxy-backdrop');
    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'galaxy-backdrop.galaxy-plate',
      'galaxy-backdrop.storm-overlay',
    ]);
    expect(validateComposeScene(scene).ok).toBe(true);
    assertNoRuntimeLibraryObjects(scene);
  });

  it('matches golden after canonicalize', () => {
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const emitted = createGalaxyBackdropScene();
    expect(canonicalizePacket(emitted)).toBe(canonicalizePacket(golden));
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-galaxy-backdrop-packet.test.ts`

Expected: FAIL — `createGalaxyBackdropScene` not exported / module missing

- [x] **Step 3: Implement `GalaxyBackdrop.ts` + flag + exports**

`GalaxyBackdrop.ts` (mirror EnterPortal structure):

```ts
export const GALAXY_BACKDROP_KIND = 'galaxy-backdrop';
export const GALAXY_BACKDROP_ID = 'galaxy-backdrop';

const GALAXY_PARTS = [
  { id: 'galaxy-plate', role: 'presentation' as const, label: 'Static galaxy plate' },
  { id: 'storm-overlay', role: 'presentation' as const, label: 'Photonic storm overlay' },
] as const;

export function createGalaxyBackdropDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: GALAXY_BACKDROP_KIND,
    description: 'Landing full-bleed galaxy plate + storm overlay — compose chrome',
    anatomy: {
      rootRole: 'presentation',
      parts: [
        {
          id: 'root',
          role: 'presentation',
          interactive: false,
          visible: true,
          children: GALAXY_PARTS.map((p) => ({
            id: p.id,
            role: p.role,
            label: p.label,
            interactive: false,
            visible: true,
          })),
        },
      ],
      slots: [],
    },
    states: [{ name: 'reducedMotion', type: 'boolean', default: false }],
    events: [],
    accessibility: {
      ariaRole: 'presentation',
      requiredAttributes: [],
      keyboard: [],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'procedural-glow', required: false },
      { id: 'semantic-text', required: false },
    ],
    defaultLayout: { layoutId: 'galaxy-stack' },
    defaultVisuals: [],
    provenance: {
      sourceKind: 'migrated',
      sourcePath: 'src/pages/Landing/StormCanvas.jsx',
      contentHash: 'scd64:galaxy-backdrop-v1',
      author: 'compose-galaxy-backdrop',
      establishedAt: '2026-07-20T00:00:00.000Z',
    },
  };
}

export function createGalaxyBackdropScene(): PbUiSceneV1 {
  const definition = createGalaxyBackdropDefinition();
  const layout = emitPbLayout({
    mode: 'absolute',
    absolute: { xPx: 0, yPx: 0, widthPx: 1920, heightPx: 1080, zIndex: 0 },
  });
  const root = {
    id: GALAXY_BACKDROP_ID,
    kind: GALAXY_BACKDROP_KIND,
    role: 'presentation',
    props: { 'aria-hidden': 'true', reducedMotion: false },
    state: { reducedMotion: false },
    layoutRef: 'galaxy-stack',
    visualRefs: [],
    children: GALAXY_PARTS.map((p) => ({
      id: `${GALAXY_BACKDROP_ID}.${p.id}`,
      kind: 'container',
      role: p.role,
      props: { part: p.id, label: p.label },
    })),
  };
  return emitPbUiScene({
    id: 'scene:galaxy-backdrop',
    root,
    definitions: { [GALAXY_BACKDROP_KIND]: definition },
    layouts: { 'galaxy-stack': layout },
    visuals: {},
  });
}

export function registerGalaxyBackdropMigration(): void {
  if (migrationRegistry.get('compose:galaxy-backdrop')) return;
  // tracking-only; COMPOSE_FLAGS.MIGRATE_GALAXY — render is always-on
  // ... createMigration like EnterPortal ...
}
```

In `flags.ts` add:

```ts
MIGRATE_GALAXY: 'compose:migrate:galaxy',
```

and register the flag descriptor default `enabled: false`.

Export from `packets.ts`:

```ts
export {
  createGalaxyBackdropScene,
  createGalaxyBackdropDefinition,
  GALAXY_BACKDROP_ID,
  GALAXY_BACKDROP_KIND,
  registerGalaxyBackdropMigration,
} from './migrated/GalaxyBackdrop';
```

- [x] **Step 4: Generate golden fixture**

Run once in Node (or a temporary script) after scene compiles:

```js
import { writeFileSync } from 'node:fs';
import { createGalaxyBackdropScene, canonicalizePacket } from './src/core/compose/packets.ts';
// Prefer: run the packet test with a one-shot write, or:
writeFileSync(
  'tests/qa/features/fixtures/galaxy-backdrop.pb-ui-scene.v1.json',
  JSON.stringify(JSON.parse(canonicalizePacket(createGalaxyBackdropScene()) /* if canonicalize returns string of canonical JSON — match EnterPortal golden style */), null, 2),
);
```

Mirror how the Enter Portal golden was produced: emit scene → canonicalize → write pretty JSON that round-trips `canonicalizePacket(emitted) === canonicalizePacket(golden)`.

- [x] **Step 5: Run tests — expect PASS**

Run: `npx vitest run tests/qa/features/compose-galaxy-backdrop-packet.test.ts`

Expected: PASS (2 tests)

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/core/compose/migrated/GalaxyBackdrop.ts \
  src/core/compose/flags.ts src/core/compose/packets.ts src/core/compose/index.ts \
  tests/qa/features/compose-galaxy-backdrop-packet.test.ts \
  tests/qa/features/fixtures/galaxy-backdrop.pb-ui-scene.v1.json
git commit -m "$(cat <<'EOF'
feat(compose): add galaxy-backdrop scene packet and golden

EOF
)"
```

---

### Task 2: Plate bake + storm skip-galaxy path

**Files:**
- Modify: `src/pages/Landing/storm/galaxySim.js`
- Modify: `src/pages/Landing/storm/photonicStorm.js`
- Modify: `src/pages/Landing/StormCanvas.jsx`
- Create: `tests/qa/features/compose-galaxy-backdrop-engine.test.js`

**Interfaces:**
- Consumes: existing `initGalaxy`, `drawGalaxy` internals
- Produces:
  - `export const PATTERN_SPEED = 0.05` (same value as today)
  - `export function bakeGalaxyPlate(width, height): { canvas: HTMLCanvasElement, centerX: number, centerY: number, patternSpeed: number, state: GalaxyState }`
  - `export function drawGalaxyPlate(ctx, state): void`
  - `export function drawGalaxySparkles(ctx, state): void`
  - `drawGalaxy(ctx, state)` = plate + sparkles (backward compatible)
  - `createPhotonicStorm({ ..., skipGalaxyPlate?: boolean })`
  - `StormCanvas` prop `skipGalaxyPlate?: boolean` (default `false`)

- [x] **Step 1: Write the failing engine tests**

```js
/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import {
  PATTERN_SPEED,
  bakeGalaxyPlate,
  drawGalaxyPlate,
  drawGalaxySparkles,
} from '../../../src/pages/Landing/storm/galaxySim.js';
import { createPhotonicStorm } from '../../../src/pages/Landing/storm/photonicStorm.js';

describe('galaxy plate bake + skip path', () => {
  it('exports PATTERN_SPEED and bakes a cached plate', () => {
    expect(PATTERN_SPEED).toBe(0.05);
    const plate = bakeGalaxyPlate(320, 180);
    expect(plate.canvas.width).toBe(320);
    expect(plate.canvas.height).toBe(180);
    expect(plate.centerX).toBe(160);
    expect(plate.centerY).toBeCloseTo(180 * 0.44);
    expect(plate.patternSpeed).toBe(PATTERN_SPEED);
    expect(plate.state.cachedCanvas).toBeTruthy();
  });

  it('skipGalaxyPlate still updates galaxy but paint omits plate blit', () => {
    const storm = createPhotonicStorm({ intensity: 1, variant: 'scene', skipGalaxyPlate: true });
    storm.resize(320, 180);
    storm.update(0.016);
    const calls = { plate: 0, sparkles: 0 };
    // Prefer spy if modules export draw helpers; otherwise assert via paint side-effect:
    // create a mock ctx and ensure drawImage for full plate is not called when skipGalaxyPlate
    const ctx = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fillText: vi.fn(),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      // minimal stubs used by paint
    };
    // attach missing props as needed for cloud/bolt paths
    Object.defineProperty(ctx, 'globalCompositeOperation', { writable: true, value: 'source-over' });
    Object.defineProperty(ctx, 'globalAlpha', { writable: true, value: 1 });
    Object.defineProperty(ctx, 'shadowBlur', { writable: true, value: 0 });
    Object.defineProperty(ctx, 'shadowColor', { writable: true, value: '' });
    Object.defineProperty(ctx, 'lineCap', { writable: true, value: 'round' });
    Object.defineProperty(ctx, 'lineJoin', { writable: true, value: 'round' });
    Object.defineProperty(ctx, 'strokeStyle', { writable: true, value: '' });
    Object.defineProperty(ctx, 'fillStyle', { writable: true, value: '' });
    Object.defineProperty(ctx, 'lineWidth', { writable: true, value: 1 });
    Object.defineProperty(ctx, 'font', { writable: true, value: '' });

    storm.render(ctx);
    // When skipGalaxyPlate: no rotate+drawImage of cached plate
    expect(ctx.rotate).not.toHaveBeenCalled();
    storm.dispose();
  });
});
```

Refine the second test if paint always `save`/`restore` for bolts — the critical assertion is **`ctx.rotate` not called** (plate path) while galaxy state still exists after `update`.

- [x] **Step 2: Run test — expect FAIL**

Run: `npx vitest run tests/qa/features/compose-galaxy-backdrop-engine.test.js`

Expected: FAIL — `PATTERN_SPEED` / `bakeGalaxyPlate` / `skipGalaxyPlate` missing

- [x] **Step 3: Implement galaxySim splits + bake**

```js
export const PATTERN_SPEED = 0.05; // was const PATTERN_SPEED = 0.05

export function bakeGalaxyPlate(width, height) {
  const state = initGalaxy(width, height);
  return {
    canvas: state.cachedCanvas,
    centerX: state.centerX,
    centerY: state.centerY,
    patternSpeed: PATTERN_SPEED,
    state,
  };
}

export function drawGalaxyPlate(ctx, state) {
  if (!state.cachedCanvas) return;
  ctx.save();
  ctx.translate(state.centerX, state.centerY);
  ctx.rotate(state.clock * PATTERN_SPEED);
  ctx.drawImage(state.cachedCanvas, -state.centerX, -state.centerY);
  ctx.restore();
}

export function drawGalaxySparkles(ctx, state) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    if (p.type !== 'sparkle') continue;
    ctx.fillStyle = p.color || '#fff';
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
    ctx.beginPath();
    ctx.arc(p.x + state.centerX, p.y + state.centerY, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawGalaxy(ctx, state) {
  if (state.cachedCanvas) {
    drawGalaxyPlate(ctx, state);
    drawGalaxySparkles(ctx, state);
  } else {
    drawGalaxyLayers(ctx, state, true);
  }
}
```

- [x] **Step 4: Implement photonicStorm + StormCanvas skip**

In `createPhotonicStorm`:

```js
skipGalaxyPlate: Boolean(options.skipGalaxyPlate),
```

In `paint`:

```js
if (state.galaxy) {
  if (!state.skipGalaxyPlate) {
    drawGalaxyPlate(ctx, state.galaxy);
  }
  drawGalaxySparkles(ctx, state.galaxy);
}
```

Import `drawGalaxyPlate` / `drawGalaxySparkles` instead of (or in addition to) `drawGalaxy`.

`StormCanvas.jsx`:

```jsx
export default function StormCanvas({
  intensity = 1,
  variant = "scene",
  className = "",
  debug = false,
  onStrike,
  skipGalaxyPlate = false,
}) {
  // ...
  const storm = createPhotonicStorm({
    intensity,
    variant,
    debug,
    skipGalaxyPlate,
    onStrike: (telemetry) => onStrikeRef.current?.(telemetry),
  });
  // dependency array includes skipGalaxyPlate
}
```

- [x] **Step 5: Run engine tests — expect PASS**

Run: `npx vitest run tests/qa/features/compose-galaxy-backdrop-engine.test.js`

Expected: PASS

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/pages/Landing/storm/galaxySim.js \
  src/pages/Landing/storm/photonicStorm.js \
  src/pages/Landing/StormCanvas.jsx \
  tests/qa/features/compose-galaxy-backdrop-engine.test.js
git commit -m "$(cat <<'EOF'
feat(landing): bake galaxy plate and skip canvas plate blit

EOF
)"
```

---

### Task 3: ComposeGalaxyBackdrop shell + Landing wire

**Files:**
- Create: `src/core/compose/migrated/ComposeGalaxyBackdrop.tsx`
- Modify: `src/pages/Landing/LandingPage.jsx`
- Modify: `src/pages/Landing/LandingPage.css`
- Modify: `src/core/compose/index.ts` — export shell
- Create: `tests/qa/features/compose-galaxy-backdrop-shell.test.tsx`

**Interfaces:**
- Consumes: `createGalaxyBackdropScene`, `validateComposeScene`, `renderSceneToDomSpec`, `bakeGalaxyPlate`, `PATTERN_SPEED`, `StormCanvas`
- Produces: `ComposeGalaxyBackdrop(props: { intensity?: number; debug?: boolean; variant?: 'scene'; className?: string; onStrike?: Function })`

- [x] **Step 1: Write failing shell + Landing tests**

```tsx
/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../src/pages/Landing/StormCanvas.jsx', () => ({
  default: (props: { skipGalaxyPlate?: boolean; className?: string }) => (
    <canvas
      data-testid="storm"
      data-skip-galaxy-plate={String(Boolean(props.skipGalaxyPlate))}
      className={props.className}
    />
  ),
}));
vi.mock('../../../src/pages/Landing/WatercolorDissolve.jsx', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dissolve">{children}</div>
  ),
}));

import { ComposeGalaxyBackdrop } from '../../../src/core/compose/migrated/ComposeGalaxyBackdrop';
import LandingPage from '../../../src/pages/Landing/LandingPage.jsx';

afterEach(cleanup);

describe('ComposeGalaxyBackdrop', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion') ? false : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it('mounts plate + storm overlay with skipGalaxyPlate', () => {
    const { container } = render(
      <ComposeGalaxyBackdrop className="portal-storm" intensity={1.4} />,
    );
    const root = container.querySelector('[data-compose-galaxy="true"]');
    expect(root).toBeTruthy();
    expect(container.querySelector('.galaxy-plate')).toBeTruthy();
    expect(screen.getByTestId('storm').getAttribute('data-skip-galaxy-plate')).toBe('true');
  });

  it('disables plate spin under reduced motion', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { container } = render(<ComposeGalaxyBackdrop />);
    const plate = container.querySelector('.galaxy-plate');
    expect(plate?.classList.contains('galaxy-plate--static')).toBe(true);
  });
});

describe('LandingPage compose galaxy', () => {
  it('uses compose galaxy backdrop and keeps twin-gate controls', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(document.querySelector('[data-compose-galaxy="true"]')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter Scholomance' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Scholomance Update Ledger' })).toBeTruthy();
  });
});
```

- [x] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/qa/features/compose-galaxy-backdrop-shell.test.tsx`

Expected: FAIL — module / selector missing

- [x] **Step 3: Implement `ComposeGalaxyBackdrop.tsx`**

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createGalaxyBackdropScene,
  GALAXY_BACKDROP_ID,
} from './GalaxyBackdrop';
import { validateComposeScene, renderSceneToDomSpec } from '../packets';
import { bakeGalaxyPlate, PATTERN_SPEED } from '../../../pages/Landing/storm/galaxySim.js';
import StormCanvas from '../../../pages/Landing/StormCanvas.jsx';

export type ComposeGalaxyBackdropProps = {
  intensity?: number;
  debug?: boolean;
  variant?: 'scene';
  className?: string;
  onStrike?: (telemetry: unknown) => void;
};

function periodSeconds(speed: number) {
  return (Math.PI * 2) / speed;
}

export function ComposeGalaxyBackdrop({
  intensity = 1,
  debug = false,
  variant = 'scene',
  className = '',
  onStrike,
}: ComposeGalaxyBackdropProps) {
  const plateRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  const { sceneValid } = useMemo(() => {
    const scene = createGalaxyBackdropScene();
    return { sceneValid: validateComposeScene(scene).ok };
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(Boolean(mq?.matches));
    sync();
    mq?.addEventListener?.('change', sync);
    return () => mq?.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!sceneValid) return undefined;
    const host = hostRef.current;
    const canvas = plateRef.current;
    if (!host || !canvas) return undefined;

    const dprCap = Math.min(window.devicePixelRatio || 1, 2);

    function bake() {
      const rect = host.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));
      const w = Math.max(1, Math.round(cssW * dprCap));
      const h = Math.max(1, Math.round(cssH * dprCap));
      const plate = bakeGalaxyPlate(w, h);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(plate.canvas, 0, 0);
      const ox = (plate.centerX / w) * 100;
      const oy = (plate.centerY / h) * 100;
      canvas.style.transformOrigin = `${ox}% ${oy}%`;
      canvas.style.animationDuration = `${periodSeconds(PATTERN_SPEED)}s`;
    }

    bake();
    const ro = new ResizeObserver(bake);
    ro.observe(host);
    return () => ro.disconnect();
  }, [sceneValid]);

  if (!sceneValid) {
    return (
      <StormCanvas
        className={className || 'portal-storm'}
        variant={variant}
        intensity={intensity}
        debug={debug}
        onStrike={onStrike}
        skipGalaxyPlate={false}
      />
    );
  }

  return (
    <div
      ref={hostRef}
      className={`compose-galaxy-backdrop ${className}`.trim()}
      data-compose-galaxy="true"
      aria-hidden="true"
    >
      <div className="compose-galaxy-backdrop__plate-host" data-part="galaxy-plate">
        <canvas
          ref={plateRef}
          className={`galaxy-plate${reducedMotion ? ' galaxy-plate--static' : ''}`}
        />
      </div>
      <div className="compose-galaxy-backdrop__storm-host" data-part="storm-overlay">
        <StormCanvas
          className="portal-storm-overlay"
          variant={variant}
          intensity={intensity}
          debug={debug}
          onStrike={onStrike}
          skipGalaxyPlate
        />
      </div>
    </div>
  );
}
```

Note: `renderSceneToDomSpec` may be used optionally for slot hosts (like EnterPortal); if DomSpec wiring is preferred for consistency, mount hosts from DomSpec children with `data-part` attrs — either approach is fine as long as parts `galaxy-plate` and `storm-overlay` exist.

- [x] **Step 4: Landing CSS**

Add (near `.portal-storm`):

```css
.compose-galaxy-backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  contain: strict;
}

.compose-galaxy-backdrop__plate-host,
.compose-galaxy-backdrop__storm-host,
.portal-storm-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.galaxy-plate {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0.85;
  will-change: transform;
  contain: layout paint;
  animation-name: galaxy-plate-spin;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  /* duration set inline from PATTERN_SPEED */
}

.galaxy-plate--static {
  animation: none !important;
}

@keyframes galaxy-plate-spin {
  from { transform: rotate(0rad); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .galaxy-plate {
    animation: none !important;
  }
}
```

Keep `.portal-storm` rules for fallback single canvas. Overlay canvas should be transparent (no opaque clear background CSS).

- [x] **Step 5: Wire LandingPage**

```jsx
import { ComposeGalaxyBackdrop } from "../../core/compose/migrated/ComposeGalaxyBackdrop";
// remove direct StormCanvas import if unused

// replace:
// <StormCanvas className="portal-storm" variant="scene" intensity={1.4} debug={STORM_DEBUG} />
// with:
<ComposeGalaxyBackdrop className="portal-storm" variant="scene" intensity={1.4} debug={STORM_DEBUG} />
```

Export shell from `index.ts`.

- [x] **Step 6: Run shell + twin-gate + packet + engine**

Run:

```bash
npx vitest run \
  tests/qa/features/compose-galaxy-backdrop-packet.test.ts \
  tests/qa/features/compose-galaxy-backdrop-engine.test.js \
  tests/qa/features/compose-galaxy-backdrop-shell.test.tsx \
  tests/pages/Landing/LandingPage.test.jsx
```

Expected: all PASS

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/core/compose/migrated/ComposeGalaxyBackdrop.tsx \
  src/core/compose/index.ts \
  src/pages/Landing/LandingPage.jsx \
  src/pages/Landing/LandingPage.css \
  tests/qa/features/compose-galaxy-backdrop-shell.test.tsx
git commit -m "$(cat <<'EOF'
feat(compose): always-on galaxy backdrop plate + storm overlay

EOF
)"
```

---

### Task 4: Docs + spec status

**Files:**
- Modify: `src/core/compose/README.md` — add Galaxy Backdrop pilot section (always-on)
- Modify: `src/core/compose/MIGRATION_GUIDE.md` — Enter Portal–style always-on note
- Modify: `docs/superpowers/specs/2026-07-20-compose-galaxy-backdrop-design.md` — Status → Implemented
- Modify: this plan — check task boxes when done

- [x] **Step 1: Update README** after Enter Portal section:

```md
## Galaxy Backdrop Pilot: ✅ Always-on Compose

- ✅ `createGalaxyBackdropScene()` → `PB-UI-SCENE-v1` (`kind: galaxy-backdrop`)
- ✅ Parts: `galaxy-plate`, `storm-overlay`
- ✅ Shell: `ComposeGalaxyBackdrop` — compositor plate rotate + full storm overlay (`skipGalaxyPlate`)
- ✅ Fallback: single-canvas `StormCanvas` if validate fails
```

- [x] **Step 2: Update MIGRATION_GUIDE** with host table, scene factory snippet, tests list

- [x] **Step 3: Spec status → Implemented**

- [ ] **Step 4: Commit (only if user asked)**

---

## Spec Coverage (self-review)

| Spec requirement | Task |
|---|---|
| `createGalaxyBackdropScene` / kind / parts | Task 1 |
| Always-on shell on Landing | Task 3 |
| Plate CSS/WAAPI rotate @ `PATTERN_SPEED` | Task 2–3 |
| Full storm + `skipGalaxyPlate` | Task 2–3 |
| Bake on resize only, DPR ≤ 2 | Task 3 |
| Reduced-motion frozen plate | Task 3 |
| Fallback single canvas | Task 3 |
| Packet / engine / shell / twin-gate tests | Tasks 1–3 |
| README + MIGRATION_GUIDE | Task 4 |
| Out of scope combat/WebGL/flags | Honored (tracking flag only) |

**Placeholder scan:** none intentional.  
**Type consistency:** `skipGalaxyPlate` boolean; `GALAXY_BACKDROP_*` ids; `bakeGalaxyPlate(width, height)` return shape used by shell.
