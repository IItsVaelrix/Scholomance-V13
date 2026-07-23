/**
 * ConstellationResult — Compose scene for the ConstellationOS answer plate.
 *
 * The sky (`ConstellationSky`) is a *presentation* backdrop: it paints atmosphere
 * and its packet is a thin contract gate. The result plate is different — it is
 * the ANSWER, so its packet is a full anatomical contract: every channel the
 * page can speak (meaning / sound / genome / verdict / provenance) is a declared
 * part, every honest refusal (degraded channel, unresolved heteronym, unevidenced
 * pick) is a declared STATE, and the colours are bound to design tokens rather
 * than scattered hex.
 *
 * What this buys that plain React cannot express:
 *  - The presentation anatomy is a sealed PB-UI-SCENE-v1 with a deterministic
 *    sourceChecksum. Same query → same pageBytecode → same sealed presentation,
 *    so the answer's *shape* is golden-testable and regression-proof (Law 6).
 *  - `validateComposeScene` runs BEFORE paint; on failure the shell degrades to
 *    the plain deterministic result markup and the failure stays local (PDR §7.8).
 *  - Degradation is DATA (`state.degraded`), not a banner bolted on after the
 *    fact — the scene says out loud that the sky is partial (PDR §7.3).
 *
 * Nothing here is random: the packet is a pure function of frozen constants, so
 * its checksum never drifts between builds.
 */

import type {
  PbUiSceneV1,
  ScholComponentDefinitionV1,
  UiSceneNode,
  VisualAttachment,
} from '../schema/packets';
import { emitPbLayout } from '../layout/emit-layout';
import { emitPbUiScene } from '../scene/emit-scene';

export const CONSTELLATION_RESULT_KIND = 'constellation-result';
export const CONSTELLATION_RESULT_ID = 'constellation-result';
export const CONSTELLATION_RESULT_VERSION = '1.0.0';

/**
 * The six plates of the answer. Order is load-bearing: identity first (what was
 * asked), meaning second (what it signifies), sound third (how it rings), then
 * genome, verdict, and the provenance seal. The shell renders them in this order
 * and tags each with `data-compose-part`.
 */
export const RESULT_PARTS = [
  {
    id: 'hero-figure',
    role: 'img',
    label: 'Sound-bones constellation figure',
    description:
      'The answer drawn as a constellation — phoneme atoms in syllable rosettes, rarity temperature, seeded lodestar.',
  },
  {
    id: 'masthead',
    role: 'region',
    label: 'Phrase identity plate',
    description: 'The query as asked — kind, intent, scale, and the page seal.',
  },
  {
    id: 'meaning-field',
    role: 'region',
    label: 'Leximancy meaning field',
    description: 'Senses, rarity, etymology, kin and counterfield.',
  },
  {
    id: 'sound-field',
    role: 'region',
    label: 'Rhyme constellation',
    description: 'Phoneme arc, stress, cadence, and rhyme routes.',
  },
  {
    id: 'genome-field',
    role: 'region',
    label: 'Phrase genome',
    description: 'Syllable count, detected devices, dominant school.',
  },
  {
    id: 'verdict-field',
    role: 'region',
    label: 'Semantic verdict',
    description: 'Whether the sense pick was evidenced, and what the evidence killed.',
  },
  {
    id: 'provenance-seal',
    role: 'contentinfo',
    label: 'Provenance seal',
    description: 'Engine versions and the page bytecode that sealed this answer.',
  },
] as const;

export type ConstellationResultPartId = (typeof RESULT_PARTS)[number]['id'];

/**
 * Scene states. Each one is an honest refusal or a hard-won fact, surfaced as
 * data so the renderer can show it without inventing prose:
 *  - reducedMotion: honour the reader's vestibular preference (Law 6 choreography off).
 *  - degraded: at least one channel could not answer — the sky is partial, say so.
 *  - heteronym: the spelling is two words, not one meaning (PDR §7.4).
 *  - evidenced: the sense pick was warranted by context, not defaulted.
 */
const RESULT_STATES = [
  { name: 'reducedMotion', type: 'boolean' as const, default: false },
  { name: 'degraded', type: 'boolean' as const, default: false },
  { name: 'heteronym', type: 'boolean' as const, default: false },
  { name: 'evidenced', type: 'boolean' as const, default: false },
];

/**
 * Token-bound visuals. Colours flow from the design-token system, never raw hex
 * in the scene: gold is the rare "answer", amethyst the hairline, void the scrim.
 */
const RESULT_VISUALS: Record<string, VisualAttachment> = {
  'answer-gold': {
    kind: 'token',
    tokenPath: 'color.answer',
    cssProperty: 'color',
    placementSlot: 'emphasis',
  },
  'hairline-amethyst': {
    kind: 'token',
    tokenPath: 'color.hairline',
    cssProperty: 'border-color',
    placementSlot: 'frame',
  },
  'scrim-void': {
    kind: 'token',
    tokenPath: 'surface.scrim',
    cssProperty: 'background',
    placementSlot: 'backdrop',
  },
  'star-spectral': {
    kind: 'token',
    tokenPath: 'color.spectral',
    cssProperty: 'fill',
    placementSlot: 'figure',
  },
  'hero-glow': {
    kind: 'token',
    tokenPath: 'effect.glow',
    cssProperty: 'filter',
    placementSlot: 'figure',
  },
};

export function createConstellationResultDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: CONSTELLATION_RESULT_KIND,
    description:
      'ConstellationOS answer plate — six sealed channels from identity to provenance.',
    anatomy: {
      rootRole: 'article',
      parts: [
        {
          id: 'root',
          role: 'article',
          interactive: false,
          visible: true,
          children: RESULT_PARTS.map((p) => ({
            id: p.id,
            role: p.role,
            label: p.label,
            description: p.description,
            interactive: false,
            visible: true,
          })),
        },
      ],
      slots: [],
    },
    states: RESULT_STATES,
    events: [],
    accessibility: {
      ariaRole: 'article',
      requiredAttributes: ['aria-labelledby'],
      keyboard: [],
      announcements: ['partial-sky-degradation', 'heteronym-split', 'evidenced-selection'],
      focusRetention: 'none',
      nameFrom: 'author',
    },
    capabilities: [
      { id: 'semantic-text', required: true },
      { id: 'deterministic-choreography', required: false },
      { id: 'procedural-glow', required: false },
    ],
    defaultLayout: { layoutId: 'result-plate-stack' },
    defaultVisuals: Object.keys(RESULT_VISUALS).map((visualId) => ({ visualId })),
    provenance: {
      sourceKind: 'typescript',
      sourcePath: 'src/pages/Constellation/ConstellationResultShell.jsx',
      contentHash: 'scd64:constellation-result-v1',
      author: 'compose-constellation-result',
      establishedAt: '2026-07-23T00:00:00.000Z',
    },
  };
}

/** Build the canonical PB-UI-SCENE-v1 for the result plate. Pure + deterministic. */
export function createConstellationResultScene(): PbUiSceneV1 {
  const definition = createConstellationResultDefinition();

  // The plate reads top-to-bottom as one column; within it, meaning and sound
  // sit side by side on wide viewports (the shell's grid), so we declare both a
  // stack (root) and a two-column grid (the field pair) as layout intents.
  const stack = emitPbLayout({
    mode: 'flow',
    common: { paddingPx: 24 },
    flow: { direction: 'column', gapPx: 0, align: 'stretch', justify: 'start' },
  });
  const fieldGrid = emitPbLayout({
    mode: 'grid',
    grid: { columns: 'repeat(auto-fit, minmax(20rem, 1fr))', gapPx: [32, 40] },
  });

  const initialState: Record<string, boolean> = {};
  for (const s of RESULT_STATES) initialState[s.name] = Boolean(s.default);

  const children: UiSceneNode[] = RESULT_PARTS.map((p) => ({
    id: `${CONSTELLATION_RESULT_ID}.${p.id}`,
    kind: 'container',
    role: p.role,
    props: { part: p.id, label: p.label },
    // The two analysis fields share the grid; everything else stacks full-width.
    layoutRef: p.id === 'meaning-field' || p.id === 'sound-field' ? 'result-field-grid' : undefined,
  }));

  const root: UiSceneNode = {
    id: CONSTELLATION_RESULT_ID,
    kind: CONSTELLATION_RESULT_KIND,
    role: 'article',
    props: { 'aria-labelledby': 'cos-masthead-query', version: CONSTELLATION_RESULT_VERSION },
    state: initialState,
    layoutRef: 'result-plate-stack',
    visualRefs: Object.keys(RESULT_VISUALS),
    children,
  };

  return emitPbUiScene({
    id: 'scene:constellation-result',
    root,
    definitions: {
      [CONSTELLATION_RESULT_KIND]: definition,
    },
    layouts: {
      'result-plate-stack': stack,
      'result-field-grid': fieldGrid,
    },
    visuals: RESULT_VISUALS,
  });
}
