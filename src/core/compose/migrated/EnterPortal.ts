/**
 * EnterPortal — Compose scene for landing twin-gate Enter orb button.
 */

import type {
  PbUiSceneV1,
  ScholComponentDefinitionV1,
} from '../schema/packets';
import type { ComponentSchema } from '../schema/ComponentSchema';
import { createComponentDefinition } from '../schema/contracts';
import { emitPbLayout } from '../layout/emit-layout';
import { emitPbUiScene } from '../scene/emit-scene';
import { featureFlags, COMPOSE_FLAGS } from '../flags';
import { migrationRegistry, createMigration } from '../migration';

export const ENTER_PORTAL_KIND = 'enter-portal-button';
export const ENTER_PORTAL_ID = 'enter-portal-button';

const PORTAL_PARTS = [
  { id: 'hit-target', role: 'button' as const, label: 'Enter hit target' },
  { id: 'rings', role: 'presentation' as const, label: 'Energy rings' },
  { id: 'content', role: 'group' as const, label: 'Portal content' },
] as const;

export function createEnterPortalDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: ENTER_PORTAL_KIND,
    description: 'Landing Enter Scholomance portal orb — compose chrome',
    anatomy: {
      rootRole: 'button',
      parts: [
        {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true,
          children: PORTAL_PARTS.map((p) => ({
            id: p.id,
            role: p.role,
            label: p.label,
            interactive: p.id === 'hit-target',
            visible: true,
          })),
        },
      ],
      slots: [],
    },
    states: [
      { name: 'pressed', type: 'boolean', default: false },
      { name: 'dissolving', type: 'boolean', default: false },
    ],
    events: [
      { type: 'PORTAL.ENTER' },
      { type: 'PORTAL.FOCUS' },
    ],
    accessibility: {
      ariaRole: 'button',
      requiredAttributes: ['aria-label'],
      keyboard: ['Enter: activate', 'Space: activate'],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'focusable-controls', required: true },
      { id: 'semantic-text', required: true },
      { id: 'procedural-glow', required: false },
    ],
    defaultLayout: { layoutId: 'portal-stack' },
    defaultVisuals: [],
    provenance: {
      sourceKind: 'migrated',
      sourcePath: 'src/pages/Landing/LandingPage.jsx',
      contentHash: 'scd64:enter-portal-button-v1',
      author: 'compose-enter-portal',
      establishedAt: '2026-07-20T00:00:00.000Z',
    },
  };
}

/**
 * Build the canonical PB-UI-SCENE-v1 for the Enter portal button.
 */
export function createEnterPortalScene(): PbUiSceneV1 {
  const definition = createEnterPortalDefinition();

  const layout = emitPbLayout({
    mode: 'absolute',
    absolute: {
      xPx: 0,
      yPx: 0,
      widthPx: 440,
      heightPx: 440,
      zIndex: 2,
    },
  });

  const root = {
    id: ENTER_PORTAL_ID,
    kind: ENTER_PORTAL_KIND,
    role: 'button',
    props: {
      'aria-label': 'Enter Scholomance',
      pressed: false,
      dissolving: false,
    },
    state: { pressed: false, dissolving: false },
    layoutRef: 'portal-stack',
    visualRefs: [],
    children: PORTAL_PARTS.map((p) => ({
      id: `${ENTER_PORTAL_ID}.${p.id}`,
      kind: 'container',
      role: p.role,
      props: { part: p.id, label: p.label },
    })),
  };

  return emitPbUiScene({
    id: 'scene:enter-portal-button',
    root,
    definitions: {
      [ENTER_PORTAL_KIND]: definition,
    },
    layouts: {
      'portal-stack': layout,
    },
    visuals: {},
  });
}

export function registerEnterPortalMigration(): void {
  if (migrationRegistry.get('compose:enter-portal')) return;
  const schema: ComponentSchema = {
    id: 'compose:enter-portal',
    name: 'Enter Portal Button',
    role: 'button',
    initialState: { pressed: false, dissolving: false },
    anatomy: {
      id: 'root',
      role: 'button',
      interactive: true,
      visible: true,
      children: PORTAL_PARTS.map((p) => ({
        id: p.id,
        role: p.role,
        interactive: p.id === 'hit-target',
        visible: true,
      })),
    },
    events: ['PORTAL.ENTER', 'PORTAL.FOCUS'],
    accessibility: {
      ariaRole: 'button',
      ariaAttributes: ['aria-label'],
      keyboard: ['Enter', 'Space'],
    },
  };
  const def = createComponentDefinition(schema);
  // Tracking-only flag; render is always-on
  const migration = createMigration(
    def,
    'compose-enter-portal',
    COMPOSE_FLAGS.MIGRATE_BUTTON,
    [
      'src/core/compose/migrated/EnterPortal.ts',
      'src/core/compose/migrated/ComposeEnterPortal.tsx',
    ],
    ['src/pages/Landing/LandingPage.jsx'],
  );
  migrationRegistry.register(migration);
}

/** Tracking helper — does NOT gate always-on render. */
export function shouldUseComposeEnterPortal(): boolean {
  return featureFlags.isEnabled(COMPOSE_FLAGS.MIGRATE_BUTTON);
}
