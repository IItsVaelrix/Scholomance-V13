/**
 * ConstellationSky — Compose scene for the ConstellationOS entry chamber sky.
 *
 * Like GalaxyBackdrop, the packet is the *contract gate*: it declares the
 * backdrop anatomy (nebula field, constellation field, star dust), validates
 * through `validateComposeScene`, and lets the React shell paint the SVG sky.
 * When validation fails the shell falls back to the plain deterministic star
 * field — failure stays local (PDR §7.8).
 */

import type {
  PbUiSceneV1,
  ScholComponentDefinitionV1,
} from '../schema/packets';
import { emitPbLayout } from '../layout/emit-layout';
import { emitPbUiScene } from '../scene/emit-scene';

export const CONSTELLATION_SKY_KIND = 'constellation-sky';
export const CONSTELLATION_SKY_ID = 'constellation-sky';

const SKY_PARTS = [
  { id: 'nebula-field', role: 'presentation' as const, label: 'Galaxy nebula field' },
  { id: 'constellation-field', role: 'presentation' as const, label: 'Named constellations' },
  { id: 'star-dust', role: 'presentation' as const, label: 'Scattered star dust' },
] as const;

export function createConstellationSkyDefinition(): ScholComponentDefinitionV1 {
  return {
    contract: 'SCHOL-COMPONENT-DEFINITION-v1',
    version: '1.0.0',
    kind: CONSTELLATION_SKY_KIND,
    description: 'ConstellationOS entry-chamber sky — nebula + named constellations + dust',
    anatomy: {
      rootRole: 'presentation',
      parts: [
        {
          id: 'root',
          role: 'presentation',
          interactive: false,
          visible: true,
          children: SKY_PARTS.map((p) => ({
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
    defaultLayout: { layoutId: 'constellation-sky-stack' },
    defaultVisuals: [],
    provenance: {
      sourceKind: 'authored',
      sourcePath: 'src/pages/Constellation/ComposeConstellationSky.jsx',
      contentHash: 'scd64:constellation-sky-v1',
      author: 'compose-constellation-sky',
      establishedAt: '2026-07-22T00:00:00.000Z',
    },
  };
}

/** Build the canonical PB-UI-SCENE-v1 for the constellation sky. */
export function createConstellationSkyScene(): PbUiSceneV1 {
  const definition = createConstellationSkyDefinition();

  const layout = emitPbLayout({
    mode: 'absolute',
    absolute: { xPx: 0, yPx: 0, widthPx: 1920, heightPx: 1080, zIndex: 0 },
  });

  const root = {
    id: CONSTELLATION_SKY_ID,
    kind: CONSTELLATION_SKY_KIND,
    role: 'presentation',
    props: { 'aria-hidden': 'true', reducedMotion: false },
    state: { reducedMotion: false },
    layoutRef: 'constellation-sky-stack',
    visualRefs: [],
    children: SKY_PARTS.map((p) => ({
      id: `${CONSTELLATION_SKY_ID}.${p.id}`,
      kind: 'container',
      role: p.role,
      props: { part: p.id, label: p.label },
    })),
  };

  return emitPbUiScene({
    id: 'scene:constellation-sky',
    root,
    definitions: {
      [CONSTELLATION_SKY_KIND]: definition,
    },
    layouts: {
      'constellation-sky-stack': layout,
    },
    visuals: {},
  });
}
