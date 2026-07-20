/**
 * GalaxyBackdrop — Compose scene for landing full-bleed galaxy plate + storm overlay.
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

/**
 * Build the canonical PB-UI-SCENE-v1 for the galaxy backdrop.
 */
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
    definitions: {
      [GALAXY_BACKDROP_KIND]: definition,
    },
    layouts: {
      'galaxy-stack': layout,
    },
    visuals: {},
  });
}

export function registerGalaxyBackdropMigration(): void {
  if (migrationRegistry.get('compose:galaxy-backdrop')) return;
  const schema: ComponentSchema = {
    id: 'compose:galaxy-backdrop',
    name: 'Galaxy Backdrop',
    role: 'presentation',
    initialState: { reducedMotion: false },
    anatomy: {
      id: 'root',
      role: 'presentation',
      interactive: false,
      visible: true,
      children: GALAXY_PARTS.map((p) => ({
        id: p.id,
        role: p.role,
        interactive: false,
        visible: true,
      })),
    },
    events: [],
    accessibility: {
      ariaRole: 'presentation',
      ariaAttributes: [],
      keyboard: [],
    },
  };
  const def = createComponentDefinition(schema);
  // Tracking-only flag; render is always-on
  const migration = createMigration(
    def,
    'compose-galaxy-backdrop',
    COMPOSE_FLAGS.MIGRATE_GALAXY,
    [
      'src/core/compose/migrated/GalaxyBackdrop.ts',
    ],
    ['src/pages/Landing/StormCanvas.jsx'],
  );
  migrationRegistry.register(migration);
}

/** Tracking helper — does NOT gate always-on render. */
export function shouldUseComposeGalaxyBackdrop(): boolean {
  return featureFlags.isEnabled(COMPOSE_FLAGS.MIGRATE_GALAXY);
}
