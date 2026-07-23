/**
 * UpdateLedger — Compose pilot scene factory for landing twin-gate ledger chrome.
 * Maps UpdateLedgerWindow shell to a canonical PB-UI-SCENE-v1 packet.
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

export const UPDATE_LEDGER_KIND = 'update-ledger-window';
export const UPDATE_LEDGER_ID = 'update-ledger-window';

const LEDGER_PARTS = [
  { id: 'header', role: 'banner' as const, label: 'Ledger header' },
  { id: 'boot', role: 'status' as const, label: 'Boot sequence' },
  { id: 'scroll', role: 'region' as const, label: 'Entry list' },
] as const;

export function createUpdateLedgerDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: UPDATE_LEDGER_KIND,
    description: 'Landing Update Ledger — Scholomance chronicle console chrome',
    anatomy: {
      rootRole: 'region',
      parts: [
        {
          id: 'root',
          role: 'region',
          interactive: false,
          visible: true,
          children: LEDGER_PARTS.map((p) => ({
            id: p.id,
            role: p.role,
            label: p.label,
            interactive: p.id === 'scroll',
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
      { name: 'entryCount', type: 'number', default: 0 },
    ],
    events: [
      { type: 'LEDGER.BOOT_COMPLETE' },
      { type: 'LEDGER.ENTRY_FOCUS' },
    ],
    accessibility: {
      ariaRole: 'region',
      requiredAttributes: ['aria-label'],
      keyboard: ['Tab: focus scroll region when entries present'],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'focusable-controls', required: true },
      { id: 'semantic-text', required: true },
      { id: 'procedural-glow', required: false },
    ],
    defaultLayout: { layoutId: 'ledger-flow' },
    defaultVisuals: [{ visualId: 'ledger-wand-ornament' }],
    provenance: {
      sourceKind: 'migrated',
      sourcePath: 'src/pages/Landing/UpdateLedgerWindow.jsx',
      contentHash: 'scd64:update-ledger-window-v1',
      author: 'compose-update-ledger',
      establishedAt: '2026-07-20T00:00:00.000Z',
    },
  };
}

export type UpdateLedgerSceneOptions = {
  entryCount?: number;
  includeWandOrnament?: boolean;
};

/**
 * Build the canonical PB-UI-SCENE-v1 for the Update Ledger compose pilot.
 */
export function createUpdateLedgerScene(
  options: UpdateLedgerSceneOptions = {},
): PbUiSceneV1 {
  const entryCount = options.entryCount ?? 0;
  const includeWand = options.includeWandOrnament === true;
  const definition = createUpdateLedgerDefinition();
  if (!includeWand) {
    definition.defaultVisuals = [];
  }

  const layout = emitPbLayout({
    mode: 'flow',
    flow: {
      direction: 'column',
      gapPx: 12,
      wrap: false,
      align: 'stretch',
      justify: 'start',
    },
  });

  const wand: WandVisualAttachment = {
    kind: 'wand',
    formulaId: 'landing-ledger-rim-sigil',
    role: 'ornament',
    placementSlot: 'ornament',
  };

  const visuals: Record<string, VisualAttachment> = includeWand
    ? { 'ledger-wand-ornament': wand }
    : {};

  const root = {
    id: UPDATE_LEDGER_ID,
    kind: UPDATE_LEDGER_KIND,
    role: 'region',
    props: {
      'aria-label': 'Scholomance Update Ledger',
      entryCount,
    },
    state: { entryCount },
    layoutRef: 'ledger-flow',
    visualRefs: includeWand ? ['ledger-wand-ornament'] : [],
    children: LEDGER_PARTS.map((p) => ({
      id: `${UPDATE_LEDGER_ID}.${p.id}`,
      kind: 'container',
      role: p.role,
      props: { part: p.id, label: p.label },
    })),
  };

  return emitPbUiScene({
    id: 'scene:update-ledger-window',
    root,
    definitions: {
      [UPDATE_LEDGER_KIND]: definition,
    },
    layouts: {
      'ledger-flow': layout,
    },
    visuals,
  });
}

/** Register migration tracking for the Update Ledger pilot (idempotent). */
export function registerUpdateLedgerMigration(): void {
  if (migrationRegistry.get('compose:ledger')) return;
  const schema: ComponentSchema = {
    id: 'compose:ledger',
    name: 'Update Ledger Window',
    role: 'region',
    initialState: { entryCount: 0 },
    anatomy: {
      id: 'root',
      role: 'region',
      interactive: false,
      visible: true,
      children: LEDGER_PARTS.map((p) => ({
        id: p.id,
        role: p.role,
        interactive: p.id === 'scroll',
        visible: true,
      })),
    },
    events: ['LEDGER.BOOT_COMPLETE', 'LEDGER.ENTRY_FOCUS'],
    accessibility: {
      ariaRole: 'region',
      ariaAttributes: ['aria-label'],
      keyboard: ['Tab: focus scroll region'],
    },
  };
  const def = createComponentDefinition(schema);
  const migration = createMigration(
    def,
    'compose-update-ledger',
    COMPOSE_FLAGS.MIGRATE_LEDGER,
    [
      'src/core/compose/migrated/UpdateLedger.ts',
    ],
    ['src/pages/Landing/UpdateLedgerWindow.jsx'],
  );
  migrationRegistry.register(migration);
}

export function shouldUseComposeUpdateLedger(): boolean {
  return featureFlags.isEnabled(COMPOSE_FLAGS.MIGRATE_LEDGER);
}
