# Composed Component Architecture - Migration Guide

## Overview

This guide explains how to migrate existing components to the Composed Component Architecture (CCA). The CCA provides a five-layer architecture for building accessible, composable UI components with clear separation of concerns.

## Architecture Layers

1. **Meaning (Semantic Schema)** - SCDL + JSON Schema 2020-12
2. **Anatomy (Component Vocabulary)** - Open UI + WAI-ARIA
3. **Placement (Layout)** - Taffy + Cassowary
4. **Behavior (State Machines)** - Zag.js + XState
5. **Appearance (Rendering)** - DOM + Skia + WAND

## Canonical Contracts

All data flowing between layers uses canonical contracts with explicit versioning:

- **`SCHOL-COMPONENT-DEFINITION-v1`** - Component semantic definitions
- **`PB-UI-SCENE-v1`** - UI scene graph (`emitPbUiScene` / `createScrollEditorToolbarScene`)
- **`PB-LAYOUT-v1`** - Layout intents (`emitPbLayout` / `lowerFlowToCss`)
- **`PB-UI-EVENT-v1`** - UI events (`emitPbUiEvent`)

**Key Principle:** Canonical packets contain *intent*, not library objects. No DOM nodes, React elements, Zag instances, or XState actors in canonical data.

## Migration Process

### Phase 1: Schema Definition

Create a component schema that conforms to `SCHOL-COMPONENT-DEFINITION-v1`:

```typescript
import { createComponentDefinition } from 'src/core/compose/schema/contracts';

export const myComponentDefinition = createComponentDefinition({
  id: 'compose:my-component',
  name: 'My Component',
  role: 'button', // or appropriate role
  initialState: {
    disabled: false,
    focused: false,
    // ... other state
  },
  anatomy: {
    id: 'root',
    role: 'button',
    interactive: true,
    visible: true,
    children: [
      // ... child parts
    ]
  },
  events: ['click', 'focus', 'blur'],
  accessibility: {
    ariaRole: 'button',
    ariaAttributes: ['aria-disabled'],
    keyboard: ['Enter: activates', 'Space: activates']
  }
});
```

### Phase 2: Register Migration

Register your component in the migration registry:

```typescript
import { migrationRegistry, createMigration } from 'src/core/compose/migration';
import { COMPOSE_FLAGS } from 'src/core/compose/flags';

const migration = createMigration(
  myComponentDefinition,
  'your-name', // owner
  COMPOSE_FLAGS.MIGRATE_MY_COMPONENT, // feature flag
  ['src/core/compose/migrated/MyComponent.ts'], // migrated files
  ['src/components/MyComponent.tsx'] // old files to migrate
);

migrationRegistry.register(migration);
```

### Phase 3: Create Migrated Component

Create the migrated component class:

```typescript
import type { ComponentSchema, ComponentState } from '../schema/ComponentSchema';
import { createComponentDefinition } from '../schema/contracts';
import { createBehaviorService, type BehaviorService } from '../behavior';
import { featureFlags, COMPOSE_FLAGS } from '../flags';
import { validateComponentSchema, validateComponentState } from '../schema/json-schemas';

export class MigratedMyComponent {
  private schema: ComponentSchema;
  private behaviorService: BehaviorService;
  private state: ComponentState;
  private props: Record<string, unknown>;

  constructor(props: Record<string, unknown> = {}) {
    this.schema = myComponentDefinition;
    this.props = props;
    this.state = {
      ...this.schema.initialState,
      // ... initialize from props
    };

    // Create behavior service
    this.behaviorService = createBehaviorService(this.schema, props);
    this.behaviorService.start();

    // Validate
    this.validate();
  }

  private async validate(): Promise<void> {
    const schemaValidation = await validateComponentSchema(this.schema);
    if (!schemaValidation.valid) {
      console.warn('Schema validation failed:', schemaValidation.errors);
    }

    const stateValidation = await validateComponentState(this.state);
    if (!stateValidation.valid) {
      console.warn('State validation failed:', stateValidation.errors);
    }
  }

  getState(): ComponentState {
    return { ...this.state };
  }

  // ... event handlers, prop updates, etc.

  destroy(): void {
    this.behaviorService.stop();
  }
}
```

### Phase 4: Feature Flag

Add a feature flag for your component:

```typescript
// In src/core/compose/flags.ts
export const COMPOSE_FLAGS = {
  // ... existing flags
  MIGRATE_MY_COMPONENT: 'compose:migrate:my-component',
} as const;
```

### Phase 5: Shadow Mode

Run the migrated component in parallel with the old component:

```typescript
import { shouldUseMigratedComponent } from 'src/core/compose/migrated/MyComponent';

function MyComponentWrapper(props: MyComponentProps) {
  if (shouldUseMigratedComponent()) {
    return <MigratedMyComponent {...props} />;
  }
  return <OldMyComponent {...props} />;
}
```

### Phase 6: Canary Rollout

Enable the feature flag for a subset of users:

```typescript
import { featureFlags, COMPOSE_FLAGS } from 'src/core/compose/flags';

// Enable for 10% of users
if (Math.random() < 0.1) {
  featureFlags.enable(COMPOSE_FLAGS.MIGRATE_MY_COMPONENT);
}
```

### Phase 7: Full Rollout

Once validated, enable the flag for all users and remove the old component.

## Migration Checklist

- [ ] Component schema defined with `SCHOL-COMPONENT-DEFINITION-v1`
- [ ] Schema registered in vocabulary
- [ ] Migration registered in migration registry
- [ ] Feature flag created
- [ ] Migrated component class created
- [ ] Behavior machine integrated
- [ ] Validation implemented
- [ ] Tests written (unit + integration)
- [ ] Shadow mode tested
- [ ] Canary rollout successful
- [ ] Full rollout complete
- [ ] Old component removed
- [ ] Feature flag cleaned up

## Testing

### Unit Tests

Test the migrated component in isolation:

```typescript
import { describe, it, expect } from 'vitest';
import { MigratedMyComponent } from 'src/core/compose/migrated/MyComponent';

describe('MigratedMyComponent', () => {
  it('should initialize with default state', () => {
    const component = new MigratedMyComponent();
    const state = component.getState();
    expect(state.disabled).toBe(false);
  });

  it('should handle events', () => {
    const component = new MigratedMyComponent();
    component.click();
    // ... assertions
  });
});
```

### Integration Tests

Test the component in the full architecture:

```typescript
import { describe, it, expect } from 'vitest';
import { migrationRegistry } from 'src/core/compose/migration';
import { featureFlags, COMPOSE_FLAGS } from 'src/core/compose/flags';

describe('MyComponent Migration', () => {
  it('should be registered', () => {
    expect(migrationRegistry.has('compose:my-component')).toBe(true);
  });

  it('should respect feature flag', () => {
    featureFlags.enable(COMPOSE_FLAGS.MIGRATE_MY_COMPONENT);
    expect(shouldUseMigratedMyComponent()).toBe(true);
  });
});
```

## Common Patterns

### Button-like Components

For components that trigger actions (buttons, links, menu items):

```typescript
accessibility: {
  ariaRole: 'button',
  ariaAttributes: ['aria-disabled', 'aria-pressed'],
  keyboard: ['Enter: activates', 'Space: activates']
}
```

### Toggle Components

For components with on/off states (checkboxes, switches):

```typescript
accessibility: {
  ariaRole: 'checkbox',
  ariaAttributes: ['aria-checked', 'aria-disabled'],
  keyboard: ['Space: toggles']
}
```

### Input Components

For components that accept user input (text fields, sliders):

```typescript
accessibility: {
  ariaRole: 'textbox',
  ariaAttributes: ['aria-invalid', 'aria-required', 'aria-disabled'],
  keyboard: ['Tab: focus next', 'Shift+Tab: focus previous']
}
```

## Troubleshooting

### Validation Errors

If validation fails, check:
- Schema conforms to `SCHOL-COMPONENT-DEFINITION-v1`
- State matches the schema's `initialState` shape
- Props match the schema's `propsSchema` (if defined)

### Behavior Machine Issues

If the behavior machine doesn't work:
- Ensure `createBehaviorService` is called with the correct schema
- Check that events are being sent correctly
- Verify state transitions are defined in the machine

### Feature Flag Issues

If the feature flag doesn't work:
- Ensure the flag is registered in `COMPOSE_FLAGS`
- Check that `featureFlags.enable()` is called
- Verify `shouldUseMigratedComponent()` returns the expected value

## Phase 9: Production Page Integration

The Scroll Editor TopBar action cluster is the first live page integration.

### What swapped

| Host | Classic path | Compose path (`compose:migrate:toolbar` ON) |
|---|---|---|
| `IDEChrome.TopBar` right cluster | Icon buttons + `FocusModeButton` | `ComposeScrollEditorToolbar` from `PB-UI-SCENE-v1` |

Left (logo/title) and center (progression) stay native. Only the action cluster migrates.

### Bridge contract

```ts
import {
  mapTopBarPropsToToolbarBridge,
  dispatchToolbarEvent,
} from 'src/core/compose/migrated/toolbar-bridge';

// Visibility from host props (isEditable, showMinimapControl, …)
// Events: TOOLBAR.EDIT | NEW_SCROLL | TOGGLE_MINIMAP | OPEN_SEARCH |
//         CYCLE_ATMOS | TOGGLE_FOCUS | OPEN_SETTINGS
```

Do **not** mutate the golden scene factory for visibility — filter at the React shell so Phase 1 packet checksums stay stable.

### Enable / rollback

```ts
featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);  // opt-in
featureFlags.disable(COMPOSE_FLAGS.MIGRATE_TOOLBAR); // instant classic fallback
```

### Tests

`tests/qa/features/compose-phase9-production.test.tsx` — bridge, shell, TopBar swap.

## Phase 10: Advanced Rendering (Skia skipped)

Skia WASM is **not** required. Creative attachments use hybrid DOM hosts + optional Canvas 2D.

```ts
import {
  negotiateRenderer,
  mountHybridAttachment,
  compareSemanticGeometry,
  probeSkiaAdapter,
} from 'src/core/compose/render';

const neg = negotiateRenderer({ preferred: ['skia', 'canvas', 'dom'] });
// neg.selected is never 'skia' — WASM skipped; falls back with PB-RENDER-002

featureFlags.enable(COMPOSE_FLAGS.RENDER); // hybrid paint in toolbar slots
```

Geometry regression compares semantic boxes (`compareSemanticGeometry`), not pixels.

### Tests

`tests/qa/features/compose-phase10-render.test.ts`

## Phase 11: Advanced Validation

```bash
npm run ui:a11y:test
```

- Vitest + jest-axe: `compose-phase11-a11y.test.tsx`
- Playwright axe + snapshot: `tests/visual/compose-toolbar-a11y.spec.js`
- Programmatic: `auditComposeA11y(element)` → `PB-UI-008`

Playwright boot (tests/devtools only):

```js
window.__COMPOSE_FLAGS__ = { 'compose:migrate:toolbar': true };
```

## Update Ledger Pilot (always-on)

The Landing Update Ledger is the second live Compose integration. It ships **without a feature flag** — `UpdateLedgerWindow` always mounts `ComposeUpdateLedger`.

### What swapped

| Host | Classic path | Compose path (default) |
|---|---|---|
| `UpdateLedgerWindow` | DivWand `ledgerShell` (fallback only) | `ComposeUpdateLedger` from `PB-UI-SCENE-v1` |

Data path unchanged: `parseLedgerEntries` + `src/data/update-ledger.json`.

### Scene factory

```ts
import {
  createUpdateLedgerScene,
  validateComposeScene,
  renderSceneToDomSpec,
} from 'src/core/compose/packets';

const scene = createUpdateLedgerScene({ entryCount: entries.length });
const { ok } = validateComposeScene(scene);
if (!ok) {
  // ComposeUpdateLedger falls back to DivWand ledgerShell automatically
}
```

Anatomy parts: `header`, `boot`, `scroll`. WAND ornament slot exists but is **off by default** on landing (`includeWandOrnament: true` to enable).

### React shell contract

`ComposeUpdateLedger`:

1. Emits scene → validates → `renderSceneToDomSpec`
2. Mounts slot hosts for header / boot / scroll
3. Renders `DigitalRainText` for the title (shared with IDE MatrixTitle mechanics)
4. Runs CLI boot sequence (`> binding chronicle…`, `> entries sealed: N`, `> ready.`)
5. Staggers entry list (Framer Motion; skipped under reduced motion)

On scene validation failure, falls back to existing DivWand `ledgerShell` — do not gate this behind a flag.

### Migration tracking (not rollout)

```ts
import { registerUpdateLedgerMigration } from 'src/core/compose/packets';

registerUpdateLedgerMigration(); // idempotent registry entry
```

`COMPOSE_FLAGS.MIGRATE_LEDGER` is registered for migration bookkeeping only. `shouldUseComposeUpdateLedger()` reflects the flag but the landing host does not consult it.

### Tests

- Packet golden: `tests/qa/features/compose-update-ledger-packet.test.ts`
- Shell + reduced motion: `tests/qa/features/compose-update-ledger-shell.test.tsx`
- Shared rain: `tests/qa/features/digital-rain-text.test.jsx`
- Host regression: `tests/pages/Landing/UpdateLedgerWindow.test.jsx`

## Enter Portal Pilot (always-on)

The Landing Enter orb is the third live Compose integration. It ships **without a feature flag** — `LandingPage` always mounts `ComposeEnterPortal`.

### What swapped

| Host | Classic path | Compose path (default) |
|---|---|---|
| Landing Enter gate | legacy `<div role="button">` orb | `ComposeEnterPortal` from `PB-UI-SCENE-v1` |

Nav/dissolve unchanged: single-enter latch → WatercolorDissolve → `/read`. Storm canvas stays outside the packet.

### Scene factory

```ts
import {
  createEnterPortalScene,
  validateComposeScene,
  renderSceneToDomSpec,
} from 'src/core/compose/packets';

const scene = createEnterPortalScene();
const { ok } = validateComposeScene(scene);
if (!ok) {
  // ComposeEnterPortal falls back to legacy orb markup automatically
}
```

Anatomy parts: `hit-target`, `rings`, `content`. Events: `PORTAL.ENTER`, `PORTAL.FOCUS`.

### React shell contract

`ComposeEnterPortal`:

1. Emits scene → validates → `renderSceneToDomSpec`
2. Mounts slot hosts for rings + content; hit-target is the accessible button
3. Preserves `aria-label="Enter Scholomance"` and dissolving latch
4. Press/focus polish via Landing CSS (`contain`, transform press scale, energy ring)

On scene validation failure, falls back to legacy markup — do not gate behind a flag.

### Migration tracking (not rollout)

```ts
import { registerEnterPortalMigration } from 'src/core/compose/packets';

registerEnterPortalMigration(); // idempotent registry entry
```

### Tests

- Packet golden: `tests/qa/features/compose-enter-portal-packet.test.ts`
- Shell + axe + Landing wire: `tests/qa/features/compose-enter-portal-shell.test.tsx`
- Twin-gate order: `tests/pages/Landing/LandingPage.test.jsx`

## Galaxy Backdrop Pilot (always-on)

The Landing storm galaxy is the fourth live Compose integration. It ships **without a feature flag** — `LandingPage` always mounts `ComposeGalaxyBackdrop`.

### What swapped

| Host | Classic path | Compose path (default) |
|---|---|---|
| Landing storm backdrop | single-canvas `StormCanvas` (fallback only) | `ComposeGalaxyBackdrop` from `PB-UI-SCENE-v1` |

Twin gates (Enter orb + Update Ledger) and WatercolorDissolve stay outside the packet.

### Scene factory

```ts
import {
  createGalaxyBackdropScene,
  validateComposeScene,
} from 'src/core/compose/packets';

const scene = createGalaxyBackdropScene();
const { ok } = validateComposeScene(scene);
if (!ok) {
  // ComposeGalaxyBackdrop falls back to full StormCanvas automatically
}
```

Anatomy parts: `galaxy-plate`, `storm-overlay`. Plate rotates via CSS `@keyframes` at `PATTERN_SPEED`; storm overlay uses `StormCanvas` with `skipGalaxyPlate`.

### React shell contract

`ComposeGalaxyBackdrop`:

1. Emits scene → validates → mounts plate + storm overlay hosts
2. Bakes galaxy bitmap on resize only (DPR capped ≤ 2)
3. Rotates plate with compositor `transform` (frozen under reduced motion)
4. Mounts `StormCanvas` with `skipGalaxyPlate` for lightning / sparkles / retina bridge

On scene validation failure, falls back to full single-canvas `StormCanvas` — do not gate behind a flag.

### Migration tracking (not rollout)

```ts
import { registerGalaxyBackdropMigration } from 'src/core/compose/packets';

registerGalaxyBackdropMigration(); // idempotent registry entry
```

`COMPOSE_FLAGS.MIGRATE_GALAXY` is registered for migration bookkeeping only. `shouldUseComposeGalaxyBackdrop()` reflects the flag but the landing host does not consult it.

### Tests

- Packet golden: `tests/qa/features/compose-galaxy-backdrop-packet.test.ts`
- Engine (plate bake + skip-draw): `tests/qa/features/compose-galaxy-backdrop-engine.test.js`
- Shell + reduced motion + Landing wire: `tests/qa/features/compose-galaxy-backdrop-shell.test.tsx`

## Resources

- **PDR:** `docs/scholomance-encyclopedia/PDR-archive/PDR-2026-07-19-COMPOSED-COMPONENT-ARCHITECTURE-V2.md`
- **Example:** `src/core/compose/migrated/Button.ts`
- **Toolbar pilot:** `src/core/compose/migrated/ComposeScrollEditorToolbar.tsx`
- **Ledger pilot:** `src/core/compose/migrated/ComposeUpdateLedger.tsx`, `UpdateLedger.ts`
- **Enter portal:** `src/core/compose/migrated/ComposeEnterPortal.tsx`, `EnterPortal.ts`
- **Galaxy backdrop:** `src/core/compose/migrated/ComposeGalaxyBackdrop.tsx`, `GalaxyBackdrop.ts`
- **Tests:** `tests/qa/features/compose-phase1.test.ts`, `compose-phase9-production.test.tsx`, `compose-update-ledger-packet.test.ts`, `compose-update-ledger-shell.test.tsx`, `compose-enter-portal-packet.test.ts`, `compose-enter-portal-shell.test.tsx`, `compose-galaxy-backdrop-packet.test.ts`, `compose-galaxy-backdrop-engine.test.js`, `compose-galaxy-backdrop-shell.test.tsx`
- **Contracts:** `src/core/compose/schema/contracts.ts`
- **Flags:** `src/core/compose/flags.ts`
- **Migration:** `src/core/compose/migration.ts`

## Support

For questions or issues:
- Check the PDR for architectural decisions
- Review the Button migration as a reference implementation
- Run the test suite to verify your implementation
- Consult the feature flag system for rollout control
