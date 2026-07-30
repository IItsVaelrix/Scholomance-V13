/**
 * PolarisOS Stateful Lattice Console — canonical Compose authoring (Task 2).
 *
 * Authors the desktop-first arcane terminal as a PB-UI-SCENE-v1 packet.
 * Intent only: no DOM, React, Pixi, or browser objects. The build adapter
 * (scripts/build-polaris-console-ui.ts) lowers this into a runtime-neutral
 * DOM plan and token CSS for the Polaris client.
 */

import type {
  PbUiSceneV1,
  ScholComponentDefinitionV1,
  UiSceneNode,
  VisualAttachment,
  PbLayoutV1,
} from '../schema/packets';
import { emitPbLayout } from '../layout/emit-layout';
import { emitPbUiScene } from '../scene/emit-scene';

export const POLARIS_CONSOLE_ID = 'polaris-console';

export const COMPONENT_KINDS = [
  'polaris-console-shell',
  'system-header',
  'bearing-rail',
  'scene-altar',
  'chronicle',
  'command-conduit',
  'telemetry-rail',
  'arcane-panel',
] as const;

export type PolarisComponentKind = (typeof COMPONENT_KINDS)[number];

const ESTABLISHED_AT = '2026-07-28T00:00:00.000Z';

interface DefOptions {
  description: string;
  rootRole: string;
  ariaRole: string;
  keyboard?: string[];
  slots?: ScholComponentDefinitionV1['anatomy']['slots'];
  parts?: ScholComponentDefinitionV1['anatomy']['parts'];
}

function makeDefinition(kind: PolarisComponentKind, opts: DefOptions): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind,
    description: opts.description,
    anatomy: {
      rootRole: opts.rootRole,
      parts: opts.parts ?? [{ id: 'root', role: opts.rootRole, visible: true }],
      slots: opts.slots,
    },
    states: [
      {
        name: 'visualState',
        type: 'enum',
        enumValues: [
          'rest',
          'focus',
          'pending',
          'success',
          'warning',
          'corrupted',
          'disconnected',
        ],
        default: 'rest',
        ariaMapping: 'data-state',
      },
    ],
    events: [],
    accessibility: {
      ariaRole: opts.ariaRole,
      keyboard: opts.keyboard ?? [],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    provenance: {
      sourceKind: 'typescript',
      sourcePath: 'src/core/compose/kits/polaris-console.ts',
      contentHash: `scd64:polaris-${kind}`,
      author: 'polaris-console-task2',
      establishedAt: ESTABLISHED_AT,
    },
  };
}

/** The named ArcanePanel decorative parts (§8.8). All aria-hidden at runtime. */
const ARCANE_PANEL_SLOTS: ScholComponentDefinitionV1['anatomy']['slots'] = [
  { name: 'corner-nw', accepts: ['scdl-asset', 'native-dom'], required: false, maxChildren: 1 },
  { name: 'corner-ne', accepts: ['scdl-asset', 'native-dom'], required: false, maxChildren: 1 },
  { name: 'corner-sw', accepts: ['scdl-asset', 'native-dom'], required: false, maxChildren: 1 },
  { name: 'corner-se', accepts: ['scdl-asset', 'native-dom'], required: false, maxChildren: 1 },
  { name: 'divider', accepts: ['scdl-asset', 'native-dom'], required: false, maxChildren: 1 },
  { name: 'seal', accepts: ['scdl-asset', 'native-dom'], required: false, maxChildren: 1 },
  { name: 'state-glyph', accepts: ['scdl-asset', 'native-dom'], required: false, maxChildren: 1 },
];

export function createPolarisConsoleDefinitions(): Record<string, ScholComponentDefinitionV1> {
  return {
    'polaris-console-shell': makeDefinition('polaris-console-shell', {
      description: 'Top-level landmark and state boundary for the arcane terminal.',
      rootRole: 'region',
      ariaRole: 'region',
      slots: ARCANE_PANEL_SLOTS,
    }),
    'system-header': makeDefinition('system-header', {
      description: 'World name, location, and connection seal.',
      rootRole: 'banner',
      ariaRole: 'banner',
      slots: ARCANE_PANEL_SLOTS,
    }),
    'bearing-rail': makeDefinition('bearing-rail', {
      description: 'Exits, nearby entities, and navigation actions.',
      rootRole: 'complementary',
      ariaRole: 'complementary',
      keyboard: ['ArrowDown: next action', 'ArrowUp: previous action'],
      slots: ARCANE_PANEL_SLOTS,
    }),
    'scene-altar': makeDefinition('scene-altar', {
      description: 'Contained render portal for the authoritative Pixi world scene.',
      rootRole: 'region',
      ariaRole: 'region',
      slots: ARCANE_PANEL_SLOTS,
    }),
    chronicle: makeDefinition('chronicle', {
      description: 'Scrollable narrative and diagnostic history.',
      rootRole: 'log',
      ariaRole: 'log',
      slots: ARCANE_PANEL_SLOTS,
    }),
    'command-conduit': makeDefinition('command-conduit', {
      description: 'Persistent command surface: input, suggestions, hints.',
      rootRole: 'form',
      ariaRole: 'form',
      keyboard: ['Enter: submit command', 'ArrowUp: previous history', 'ArrowDown: next history'],
      slots: ARCANE_PANEL_SLOTS,
    }),
    'telemetry-rail': makeDefinition('telemetry-rail', {
      description: 'Selected-entity and session diagnostics.',
      rootRole: 'complementary',
      ariaRole: 'complementary',
      slots: ARCANE_PANEL_SLOTS,
    }),
    'arcane-panel': makeDefinition('arcane-panel', {
      description: 'Shared panel primitive used by rails and the Chronicle.',
      rootRole: 'region',
      ariaRole: 'region',
      slots: ARCANE_PANEL_SLOTS,
      parts: [
        { id: 'header', role: 'header', visible: true },
        { id: 'title', role: 'heading', visible: true },
        { id: 'status', role: 'status', visible: true },
        { id: 'body', role: 'group', visible: true },
        { id: 'footer', role: 'contentinfo', visible: true },
      ],
    }),
  };
}

function workspaceGridLayout(): PbLayoutV1 {
  return emitPbLayout({
    mode: 'grid',
    common: { paddingPx: 12 },
    grid: {
      columns: 'minmax(220px, 0.8fr) minmax(640px, 2.4fr) minmax(260px, 1fr)',
      rows: '1fr',
      gapPx: [12, 12],
      align: 'stretch',
      // No `justify`: grid `justify` lowers to justify-content, whose intent
      // union is distribution-only (no 'stretch'), and gridJustify() defaults
      // to 'start' — so omitting it emits exactly the same CSS. The three
      // minmax() fr tracks already consume the row, making it inert anyway.
    },
  });
}

function centerStackLayout(): PbLayoutV1 {
  return emitPbLayout({
    mode: 'flow',
    common: { minWidthPx: 640 },
    flow: {
      direction: 'column',
      gapPx: 12,
      wrap: false,
      align: 'stretch',
      justify: 'start',
    },
  });
}

function headerLayout(): PbLayoutV1 {
  return emitPbLayout({
    mode: 'flow',
    flow: { direction: 'row', gapPx: 12, wrap: false, align: 'center', justify: 'space-between' },
  });
}

function visuals(): Record<string, VisualAttachment> {
  return {
    'arcane-corners': {
      kind: 'scdl-asset',
      packetId: 'arcane-panel/rest/corners',
      placementSlot: 'corner-nw',
    },
    'arcane-divider': {
      kind: 'scdl-asset',
      packetId: 'arcane-panel/rest/divider',
      placementSlot: 'divider',
    },
    'connection-seal': {
      kind: 'scdl-asset',
      packetId: 'connection/rest/seal',
      placementSlot: 'seal',
    },
    'arcane-state-glyph': {
      kind: 'scdl-asset',
      packetId: 'arcane-panel/rest/state-glyph',
      placementSlot: 'state-glyph',
    },
    'command-sigil': {
      kind: 'scdl-asset',
      packetId: 'command-conduit/rest/sigil',
      placementSlot: 'state-glyph',
    },
  };
}

function systemHeader(): UiSceneNode {
  return {
    id: 'polaris-system-header',
    kind: 'system-header',
    role: 'banner',
    props: { 'aria-label': 'System header' },
    layoutRef: 'polaris-header-flow',
    visualRefs: ['connection-seal'],
    children: [
      { id: 'polaris-system-header.title', kind: 'text', props: { label: 'World' } },
      { id: 'polaris-system-header.location', kind: 'text', props: { label: 'Location' } },
      {
        id: 'polaris-system-header.seal',
        kind: 'container',
        props: { 'aria-label': 'Connection seal' },
      },
    ],
  };
}

function bearingRail(): UiSceneNode {
  return {
    id: 'polaris-bearing-rail',
    kind: 'bearing-rail',
    role: 'complementary',
    props: { 'aria-label': 'Bearing rail' },
    visualRefs: ['arcane-corners', 'arcane-divider'],
    children: [
      {
        id: 'polaris-bearing-rail.exits',
        kind: 'container',
        role: 'navigation',
        props: { 'aria-label': 'Exits' },
      },
      {
        id: 'polaris-bearing-rail.nearby',
        kind: 'container',
        props: { 'aria-label': 'Nearby entities' },
      },
      {
        id: 'polaris-bearing-rail.actions',
        kind: 'container',
        props: { 'aria-label': 'Navigation actions' },
      },
    ],
  };
}

function sceneAltar(): UiSceneNode {
  return {
    id: 'polaris-scene-altar',
    kind: 'scene-altar',
    role: 'region',
    props: { 'aria-label': 'Scene altar' },
    visualRefs: ['arcane-corners', 'arcane-state-glyph'],
    children: [
      { id: 'polaris-scene-altar.title', kind: 'text', props: { label: 'Scene' } },
      {
        id: 'polaris-scene-altar.host',
        kind: 'container',
        props: { 'aria-label': 'World render host' },
      },
      { id: 'polaris-scene-altar.status', kind: 'text', props: { label: 'Scene status' } },
    ],
  };
}

function chronicle(): UiSceneNode {
  return {
    id: 'polaris-chronicle',
    kind: 'chronicle',
    role: 'log',
    props: { 'aria-label': 'Chronicle', 'aria-live': 'polite', 'aria-atomic': 'false' },
    visualRefs: ['arcane-corners', 'arcane-divider'],
    children: [
      {
        id: 'polaris-chronicle-log',
        kind: 'container',
        role: 'log',
        props: { 'aria-live': 'polite' },
      },
    ],
  };
}

function commandConduit(): UiSceneNode {
  return {
    id: 'polaris-command-conduit',
    kind: 'command-conduit',
    role: 'form',
    props: { 'aria-label': 'Command conduit' },
    visualRefs: ['command-sigil'],
    children: [
      {
        id: 'polaris-command-input',
        kind: 'input',
        props: {
          'aria-label': 'Command',
          placeholder: 'cast a command…',
          type: 'text',
          name: 'command',
          autocomplete: 'off',
        },
      },
      { id: 'polaris-command-submit', kind: 'button', props: { label: 'Cast' } },
      {
        id: 'polaris-command-hints',
        kind: 'container',
        props: { 'aria-label': 'Command hints' },
      },
    ],
  };
}

function telemetryRail(): UiSceneNode {
  return {
    id: 'polaris-telemetry-rail',
    kind: 'telemetry-rail',
    role: 'complementary',
    props: { 'aria-label': 'Telemetry rail' },
    visualRefs: ['arcane-corners', 'arcane-divider'],
    children: [
      {
        id: 'polaris-telemetry-rail.selected',
        kind: 'container',
        props: { 'aria-label': 'Selected entity' },
      },
      {
        id: 'polaris-telemetry-rail.session',
        kind: 'container',
        props: { 'aria-label': 'Session diagnostics' },
      },
    ],
  };
}

function workspace(): UiSceneNode {
  return {
    id: 'polaris-workspace',
    kind: 'container',
    role: 'main',
    props: { 'aria-label': 'Workspace' },
    layoutRef: 'polaris-workspace-grid',
    children: [
      bearingRail(),
      {
        id: 'polaris-center-stack',
        kind: 'container',
        props: { 'aria-label': 'Center stack' },
        layoutRef: 'polaris-center-flow',
        children: [sceneAltar(), chronicle(), commandConduit()],
      },
      telemetryRail(),
    ],
  };
}

/**
 * Build the canonical PB-UI-SCENE-v1 for the Polaris Stateful Lattice Console.
 * Deterministic: sourceChecksum is derived from canonical content, not time.
 */
export function createPolarisConsoleScene(): PbUiSceneV1 {
  const root: UiSceneNode = {
    id: POLARIS_CONSOLE_ID,
    kind: 'polaris-console-shell',
    role: 'region',
    props: { 'aria-label': 'Polaris console' },
    children: [systemHeader(), workspace()],
  };

  return emitPbUiScene({
    id: 'scene:polaris-console',
    root,
    definitions: createPolarisConsoleDefinitions(),
    layouts: {
      'polaris-workspace-grid': workspaceGridLayout(),
      'polaris-center-flow': centerStackLayout(),
      'polaris-header-flow': headerLayout(),
    },
    visuals: visuals(),
  });
}
