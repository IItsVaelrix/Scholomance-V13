/**
 * ReadChrome — Compose pilot scene factories for the Read IDE chrome.
 * Maps IDEChrome TopBar/StatusBar shells to canonical PB-UI-SCENE-v1 packets.
 *
 * GrimDesign provenance (WILL / HARMONIC, local-codex):
 * the harmonic-seam visual attachment carries the 1600ms breathe glow.
 * Removing every attachment leaves an accessible, operable chrome bar.
 */

import type {
  PbUiSceneV1,
  ScholComponentDefinitionV1,
  NativeDomVisualAttachment,
} from '../schema/packets';
import type { ComponentSchema } from '../schema/ComponentSchema';
import { createComponentDefinition } from '../schema/contracts';
import { emitPbLayout } from '../layout/emit-layout';
import { emitPbUiScene } from '../scene/emit-scene';
import { COMPOSE_FLAGS } from '../flags';
import { migrationRegistry, createMigration } from '../migration';

export const READ_TOP_BAR_KIND = 'read-top-bar';
export const READ_TOP_BAR_ID = 'read-top-bar';
export const READ_STATUS_BAR_KIND = 'read-status-bar';
export const READ_STATUS_BAR_ID = 'read-status-bar';

const TOP_BAR_PARTS = [
  { id: 'identity', label: 'Scroll identity' },
  { id: 'progression', label: 'Progression' },
  { id: 'actions', label: 'Editor actions' },
] as const;

const STATUS_BAR_PARTS = [
  { id: 'vitals', label: 'Analysis vitals' },
  { id: 'position', label: 'Caret position' },
] as const;

const HARMONIC_SEAM_VISUAL_ID = 'harmonic-seam';

function harmonicSeam(): NativeDomVisualAttachment {
  return {
    kind: 'native-dom',
    className: 'grim-harmonic-seam',
    styleTokens: ['ritual-aurora-start', 'ritual-aurora-end', 'ritual-glow'],
    placementSlot: 'seam',
  };
}

export function createReadTopBarDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: READ_TOP_BAR_KIND,
    description: 'Read IDE top chrome — scroll identity, progression, action cluster',
    anatomy: {
      rootRole: 'region',
      parts: [
        {
          id: 'root',
          role: 'region',
          interactive: false,
          visible: true,
          children: TOP_BAR_PARTS.map((p) => ({
            id: p.id,
            role: 'group',
            label: p.label,
            interactive: p.id === 'actions',
            visible: true,
          })),
        },
      ],
      slots: [
        {
          name: 'seam',
          accepts: ['native-dom', 'wand', 'token'],
          required: false,
          maxChildren: 1,
        },
      ],
    },
    states: [],
    events: [],
    accessibility: {
      ariaRole: 'region',
      requiredAttributes: ['aria-label'],
      keyboard: ['Tab: reaches action cluster controls'],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'focusable-controls', required: true },
      { id: 'semantic-text', required: true },
      { id: 'procedural-glow', required: false },
    ],
    defaultLayout: { layoutId: 'read-topbar-flow' },
    defaultVisuals: [{ visualId: HARMONIC_SEAM_VISUAL_ID }],
    provenance: {
      sourceKind: 'migrated',
      sourcePath: 'src/pages/Read/IDEChrome.jsx',
      contentHash: 'scd64:read-top-bar-v1',
      author: 'compose-read-chrome',
      establishedAt: '2026-07-20T00:00:00.000Z',
    },
  };
}

export function createReadStatusBarDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: READ_STATUS_BAR_KIND,
    description: 'Read IDE status chrome — analysis vitals and caret position',
    anatomy: {
      rootRole: 'region',
      parts: [
        {
          id: 'root',
          role: 'region',
          interactive: false,
          visible: true,
          children: STATUS_BAR_PARTS.map((p) => ({
            id: p.id,
            role: 'group',
            label: p.label,
            interactive: false,
            visible: true,
          })),
        },
      ],
      slots: [
        {
          name: 'seam',
          accepts: ['native-dom', 'wand', 'token'],
          required: false,
          maxChildren: 1,
        },
      ],
    },
    states: [],
    events: [],
    accessibility: {
      ariaRole: 'region',
      requiredAttributes: ['aria-label'],
      keyboard: [],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'semantic-text', required: true },
      { id: 'procedural-glow', required: false },
    ],
    defaultLayout: { layoutId: 'read-statusbar-flow' },
    defaultVisuals: [{ visualId: HARMONIC_SEAM_VISUAL_ID }],
    provenance: {
      sourceKind: 'migrated',
      sourcePath: 'src/pages/Read/IDEChrome.jsx',
      contentHash: 'scd64:read-status-bar-v1',
      author: 'compose-read-chrome',
      establishedAt: '2026-07-20T00:00:00.000Z',
    },
  };
}

export type ReadChromeSceneOptions = {
  includeHarmonicSeam?: boolean;
};

/**
 * Build the canonical PB-UI-SCENE-v1 for the Read top bar.
 * Volatile values (title text, XP) are runtime React children, not packet state.
 */
export function createReadTopBarScene(
  options: ReadChromeSceneOptions = {},
): PbUiSceneV1 {
  const includeSeam = options.includeHarmonicSeam !== false;
  const definition = createReadTopBarDefinition();
  if (!includeSeam) {
    definition.defaultVisuals = [];
  }

  const layout = emitPbLayout({
    mode: 'flow',
    flow: {
      direction: 'row',
      gapPx: 12,
      wrap: false,
      align: 'center',
      justify: 'space-between',
    },
  });

  const root = {
    id: READ_TOP_BAR_ID,
    kind: READ_TOP_BAR_KIND,
    role: 'region',
    props: { 'aria-label': 'Scroll editor chrome' },
    layoutRef: 'read-topbar-flow',
    visualRefs: includeSeam ? [HARMONIC_SEAM_VISUAL_ID] : [],
    children: TOP_BAR_PARTS.map((p) => ({
      id: `${READ_TOP_BAR_ID}.${p.id}`,
      kind: 'container',
      props: { part: p.id, label: p.label },
    })),
  };

  return emitPbUiScene({
    id: 'scene:read-top-bar',
    root,
    definitions: {
      [READ_TOP_BAR_KIND]: definition,
    },
    layouts: {
      'read-topbar-flow': layout,
    },
    visuals: includeSeam ? { [HARMONIC_SEAM_VISUAL_ID]: harmonicSeam() } : {},
  });
}

/**
 * Build the canonical PB-UI-SCENE-v1 for the Read status bar.
 * Ln/Col/syllable text is volatile runtime content — excluded from the packet.
 */
export function createReadStatusBarScene(
  options: ReadChromeSceneOptions = {},
): PbUiSceneV1 {
  const includeSeam = options.includeHarmonicSeam !== false;
  const definition = createReadStatusBarDefinition();
  if (!includeSeam) {
    definition.defaultVisuals = [];
  }

  const layout = emitPbLayout({
    mode: 'flow',
    flow: {
      direction: 'row',
      gapPx: 16,
      wrap: false,
      align: 'center',
      justify: 'space-between',
    },
  });

  const root = {
    id: READ_STATUS_BAR_ID,
    kind: READ_STATUS_BAR_KIND,
    role: 'region',
    props: { 'aria-label': 'Editor status' },
    layoutRef: 'read-statusbar-flow',
    visualRefs: includeSeam ? [HARMONIC_SEAM_VISUAL_ID] : [],
    children: STATUS_BAR_PARTS.map((p) => ({
      id: `${READ_STATUS_BAR_ID}.${p.id}`,
      kind: 'container',
      props: { part: p.id, label: p.label },
    })),
  };

  return emitPbUiScene({
    id: 'scene:read-status-bar',
    root,
    definitions: {
      [READ_STATUS_BAR_KIND]: definition,
    },
    layouts: {
      'read-statusbar-flow': layout,
    },
    visuals: includeSeam ? { [HARMONIC_SEAM_VISUAL_ID]: harmonicSeam() } : {},
  });
}

/** Register migration tracking for the Read chrome pilot (idempotent). */
export function registerReadChromeMigration(): void {
  if (migrationRegistry.get('compose:read-chrome')) return;
  const schema: ComponentSchema = {
    id: 'compose:read-chrome',
    name: 'Read IDE Chrome',
    role: 'region',
    initialState: {},
    anatomy: {
      id: 'root',
      role: 'region',
      interactive: false,
      visible: true,
      children: [...TOP_BAR_PARTS, ...STATUS_BAR_PARTS].map((p) => ({
        id: p.id,
        role: 'container',
        interactive: p.id === 'actions',
        visible: true,
      })),
    },
    events: [],
    accessibility: {
      ariaRole: 'region',
      ariaAttributes: ['aria-label'],
      keyboard: ['Tab: reaches action cluster controls'],
    },
  };
  const def = createComponentDefinition(schema);
  const migration = createMigration(
    def,
    'compose-read-chrome',
    COMPOSE_FLAGS.MIGRATE_READ_CHROME,
    ['src/core/compose/migrated/ReadChrome.ts'],
    ['src/pages/Read/IDEChrome.jsx'],
  );
  migrationRegistry.register(migration);
}
