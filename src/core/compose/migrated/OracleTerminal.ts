/**
 * OracleTerminal — Compose pilot scene factory for the Lexicon Oracle terminal.
 * Maps the SearchPanel chrome (session / prompt / signal / feed) to a canonical
 * PB-UI-SCENE-v1 packet.
 *
 * GrimDesign provenance (WILL / HARMONIC, local-codex, complexity 4):
 * the phosphor-scanline atmosphere is a removable visual attachment; the
 * terminal stays an accessible, operable console without it.
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

export const ORACLE_TERMINAL_KIND = 'oracle-terminal';
export const ORACLE_TERMINAL_ID = 'oracle-terminal';

const ORACLE_PARTS = [
  { id: 'session', label: 'Session line' },
  { id: 'prompt', label: 'Command prompt' },
  { id: 'signal', label: 'Status line' },
  { id: 'feed', label: 'Terminal output' },
] as const;

const SCANLINE_VISUAL_ID = 'phosphor-scanline';

function phosphorScanline(): NativeDomVisualAttachment {
  return {
    kind: 'native-dom',
    className: 'oracle-scanline-atmosphere',
    styleTokens: ['oracle-school-color', 'oracle-gold'],
    placementSlot: 'atmosphere',
  };
}

export function createOracleTerminalDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: ORACLE_TERMINAL_KIND,
    description:
      'Lexicon Oracle — arcane phosphor terminal: TTY session line, command prompt, statusline, divination feed',
    anatomy: {
      rootRole: 'region',
      parts: [
        {
          id: 'root',
          role: 'region',
          interactive: false,
          visible: true,
          children: ORACLE_PARTS.map((p) => ({
            id: p.id,
            role: 'group',
            label: p.label,
            interactive: p.id === 'prompt' || p.id === 'session',
            visible: true,
          })),
        },
      ],
      slots: [
        {
          name: 'atmosphere',
          accepts: ['native-dom', 'wand', 'token'],
          required: false,
          maxChildren: 1,
        },
      ],
    },
    states: [
      {
        name: 'mode',
        type: 'enum',
        enumValues: ['WORD', 'CORPUS', 'QUERY'],
        default: 'WORD',
      },
    ],
    events: [
      { type: 'ORACLE.RESOLVE' },
      { type: 'ORACLE.MODE_SWITCH' },
      { type: 'ORACLE.CLEAR' },
    ],
    accessibility: {
      ariaRole: 'region',
      requiredAttributes: ['aria-label'],
      keyboard: [
        'Tab: reaches mode tabs, prompt input, and submit',
        'Enter: submits the prompt',
      ],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'focusable-controls', required: true },
      { id: 'semantic-text', required: true },
      { id: 'procedural-glow', required: false },
    ],
    defaultLayout: { layoutId: 'oracle-terminal-flow' },
    defaultVisuals: [{ visualId: SCANLINE_VISUAL_ID }],
    provenance: {
      sourceKind: 'migrated',
      sourcePath: 'src/pages/Read/SearchPanel.jsx',
      contentHash: 'scd64:oracle-terminal-v1',
      author: 'compose-oracle-terminal',
      establishedAt: '2026-07-20T00:00:00.000Z',
    },
  };
}

export type OracleTerminalSceneOptions = {
  includeScanlineAtmosphere?: boolean;
};

/**
 * Build the canonical PB-UI-SCENE-v1 for the Oracle terminal.
 * Query text, results, and link strength are volatile runtime content —
 * excluded from the packet so it stays static and golden-stable.
 */
export function createOracleTerminalScene(
  options: OracleTerminalSceneOptions = {},
): PbUiSceneV1 {
  const includeScanline = options.includeScanlineAtmosphere !== false;
  const definition = createOracleTerminalDefinition();
  if (!includeScanline) {
    definition.defaultVisuals = [];
  }

  const layout = emitPbLayout({
    mode: 'flow',
    flow: {
      direction: 'column',
      gapPx: 0,
      wrap: false,
      align: 'stretch',
      justify: 'start',
    },
  });

  const root = {
    id: ORACLE_TERMINAL_ID,
    kind: ORACLE_TERMINAL_KIND,
    role: 'region',
    props: { 'aria-label': 'Lexicon Oracle terminal' },
    layoutRef: 'oracle-terminal-flow',
    visualRefs: includeScanline ? [SCANLINE_VISUAL_ID] : [],
    children: ORACLE_PARTS.map((p) => ({
      id: `${ORACLE_TERMINAL_ID}.${p.id}`,
      kind: 'container',
      props: { part: p.id, label: p.label },
    })),
  };

  return emitPbUiScene({
    id: 'scene:oracle-terminal',
    root,
    definitions: {
      [ORACLE_TERMINAL_KIND]: definition,
    },
    layouts: {
      'oracle-terminal-flow': layout,
    },
    visuals: includeScanline ? { [SCANLINE_VISUAL_ID]: phosphorScanline() } : {},
  });
}

/** Register migration tracking for the Oracle terminal pilot (idempotent). */
export function registerOracleTerminalMigration(): void {
  if (migrationRegistry.get('compose:oracle-terminal')) return;
  const schema: ComponentSchema = {
    id: 'compose:oracle-terminal',
    name: 'Lexicon Oracle Terminal',
    role: 'region',
    initialState: {},
    anatomy: {
      id: 'root',
      role: 'region',
      interactive: false,
      visible: true,
      children: ORACLE_PARTS.map((p) => ({
        id: p.id,
        role: 'container',
        interactive: p.id === 'prompt' || p.id === 'session',
        visible: true,
      })),
    },
    events: ['ORACLE.RESOLVE', 'ORACLE.MODE_SWITCH', 'ORACLE.CLEAR'],
    accessibility: {
      ariaRole: 'region',
      ariaAttributes: ['aria-label'],
      keyboard: ['Tab: prompt controls', 'Enter: submit'],
    },
  };
  const def = createComponentDefinition(schema);
  const migration = createMigration(
    def,
    'compose-oracle-terminal',
    COMPOSE_FLAGS.MIGRATE_ORACLE,
    ['src/core/compose/migrated/OracleTerminal.ts'],
    ['src/pages/Read/SearchPanel.jsx'],
  );
  migrationRegistry.register(migration);
}
