/**
 * ScrollEditorToolbar — PDR Phase 1 pilot component definition + scene factory.
 * Maps IDE TopBar action cluster to a canonical toolbar scene.
 */

import type {
  PbUiSceneV1,
  ScholComponentDefinitionV1,
  WandVisualAttachment,
  VisualAttachment,
} from '../schema/packets';
import type { ComponentSchema } from '../schema/ComponentSchema';
import { createComponentDefinition } from '../schema/contracts';
import { emitPbLayout } from '../layout/emit-layout';
import { emitPbUiScene } from '../scene/emit-scene';
import { featureFlags, COMPOSE_FLAGS } from '../flags';
import { migrationRegistry, createMigration } from '../migration';

export const SCROLL_EDITOR_TOOLBAR_KIND = 'toolbar';
export const SCROLL_EDITOR_TOOLBAR_ID = 'scroll-editor-toolbar';

const TOOLBAR_ACTIONS = [
  { id: 'edit', label: 'Edit', event: 'TOOLBAR.EDIT' },
  { id: 'new', label: 'New', event: 'TOOLBAR.NEW_SCROLL' },
  { id: 'minimap', label: 'Minimap', event: 'TOOLBAR.TOGGLE_MINIMAP' },
  { id: 'search', label: 'Search', event: 'TOOLBAR.OPEN_SEARCH' },
  { id: 'atmos', label: 'Atmos', event: 'TOOLBAR.CYCLE_ATMOS' },
  { id: 'focus', label: 'Focus', event: 'TOOLBAR.TOGGLE_FOCUS' },
  { id: 'settings', label: 'Settings', event: 'TOOLBAR.OPEN_SETTINGS' },
] as const;

export function createScrollEditorToolbarDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: SCROLL_EDITOR_TOOLBAR_KIND,
    description: 'Scroll editor top toolbar — IDE chrome action cluster',
    anatomy: {
      rootRole: 'toolbar',
      parts: [
        {
          id: 'root',
          role: 'toolbar',
          interactive: true,
          visible: true,
          children: TOOLBAR_ACTIONS.map((a) => ({
            id: a.id,
            role: 'button',
            label: a.label,
            interactive: true,
            visible: true,
          })),
        },
      ],
      slots: [
        {
          name: 'ornament',
          accepts: ['wand', 'token', 'native-dom'],
          required: false,
          maxChildren: 1,
        },
      ],
    },
    states: [
      { name: 'disabled', type: 'boolean', default: false, ariaMapping: 'aria-disabled' },
      { name: 'orientation', type: 'enum', enumValues: ['horizontal', 'vertical'], default: 'horizontal' },
    ],
    events: [
      { type: 'TOOLBAR.FOCUS_NEXT' },
      { type: 'TOOLBAR.FOCUS_PREV' },
      ...TOOLBAR_ACTIONS.map((a) => ({ type: a.event })),
    ],
    accessibility: {
      ariaRole: 'toolbar',
      requiredAttributes: ['aria-label'],
      keyboard: [
        'ArrowRight: focus next control',
        'ArrowLeft: focus previous control',
        'Home: focus first',
        'End: focus last',
      ],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'focusable-controls', required: true },
      { id: 'semantic-text', required: true },
      { id: 'procedural-glow', required: false },
    ],
    defaultLayout: { layoutId: 'toolbar-flow' },
    defaultVisuals: [{ visualId: 'toolbar-wand-ornament' }],
    provenance: {
      sourceKind: 'migrated',
      sourcePath: 'src/pages/Read/IDEChrome.jsx#TopBar',
      contentHash: 'scd64:scroll-editor-toolbar-v1',
      author: 'compose-phase1',
      establishedAt: '2026-07-19T00:00:00.000Z',
    },
  };
}

export type ToolbarSceneOptions = {
  includeWandOrnament?: boolean;
};

/**
 * Build the canonical PB-UI-SCENE-v1 for the Scroll Editor toolbar pilot.
 */
export function createScrollEditorToolbarScene(
  options: ToolbarSceneOptions = {},
): PbUiSceneV1 {
  const includeWand = options.includeWandOrnament !== false;
  const definition = createScrollEditorToolbarDefinition();
  if (!includeWand) {
    definition.defaultVisuals = [];
  }

  const layout = emitPbLayout({
    mode: 'flow',
    flow: {
      direction: 'row',
      gapPx: 8,
      wrap: false,
      align: 'center',
      justify: 'start',
    },
  });

  const wand: WandVisualAttachment = {
    kind: 'wand',
    formulaId: 'ide-topbar-aurora-sigil',
    role: 'ornament',
    placementSlot: 'ornament',
  };

  const visuals: Record<string, VisualAttachment> = includeWand
    ? { 'toolbar-wand-ornament': wand }
    : {};

  const root = {
    id: SCROLL_EDITOR_TOOLBAR_ID,
    kind: SCROLL_EDITOR_TOOLBAR_KIND,
    role: 'toolbar',
    props: {
      orientation: 'horizontal',
      'aria-label': 'Scroll editor toolbar',
      disabled: false,
    },
    state: { disabled: false },
    layoutRef: 'toolbar-flow',
    visualRefs: includeWand ? ['toolbar-wand-ornament'] : [],
    children: TOOLBAR_ACTIONS.map((a) => ({
      id: `${SCROLL_EDITOR_TOOLBAR_ID}.${a.id}`,
      kind: 'button',
      role: 'button',
      props: { label: a.label, event: a.event },
    })),
  };

  return emitPbUiScene({
    id: 'scene:scroll-editor-toolbar',
    root,
    definitions: {
      [SCROLL_EDITOR_TOOLBAR_KIND]: definition,
    },
    layouts: {
      'toolbar-flow': layout,
    },
    visuals,
  });
}

export { TOOLBAR_ACTIONS };

/** Register migration tracking for the toolbar pilot (idempotent). */
export function registerToolbarMigration(): void {
  if (migrationRegistry.get('compose:toolbar')) return;
  const schema: ComponentSchema = {
    id: 'compose:toolbar',
    name: 'Scroll Editor Toolbar',
    role: 'toolbar',
    initialState: { disabled: false },
    anatomy: {
      id: 'root',
      role: 'toolbar',
      interactive: true,
      visible: true,
      children: TOOLBAR_ACTIONS.map((a) => ({
        id: a.id,
        role: 'button',
        interactive: true,
        visible: true,
      })),
    },
    events: TOOLBAR_ACTIONS.map((a) => a.event),
    accessibility: {
      ariaRole: 'toolbar',
      ariaAttributes: ['aria-label'],
      keyboard: ['ArrowRight: next', 'ArrowLeft: previous'],
    },
  };
  const def = createComponentDefinition(schema);
  const migration = createMigration(
    def,
    'compose-phase1',
    COMPOSE_FLAGS.MIGRATE_TOOLBAR,
    [
      'src/core/compose/migrated/ScrollEditorToolbar.ts',
      'src/core/compose/migrated/ComposeScrollEditorToolbar.tsx',
    ],
    ['src/pages/Read/IDEChrome.jsx'],
  );
  migrationRegistry.register(migration);
}

export function shouldUseComposeScrollEditorToolbar(): boolean {
  return featureFlags.isEnabled(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
}
