import { describe, expect, test } from 'vitest';

import {
  createTemplateGrid as createStudioGrid,
  exportToAseprite as exportStudioAseprite,
  importFromAseprite as importStudioAseprite,
} from '../../src/lib/pixelbrain.adapter.js';
import {
  STUDIO_TABS,
  studioHomeForFeature,
} from '../../src/pages/PixelBrain/studio/studio-tabs.js';
import {
  createTemplateGrid as createLegacyGrid,
  exportToAseprite as exportLegacyAseprite,
  importFromAseprite as importLegacyAseprite,
} from '../../codex/core/pixelbrain/template-grid-engine.js';

const EXPECTED_HOMES = Object.freeze({
  TemplateEditor: 'canvas',
  LayerStackPanel: 'canvas',
  IndexedPalettePanel: 'canvas',
  SketchPad: 'blueprint',
  ConstructionGuides: 'blueprint',
  ForgeGatePanel: 'blueprint',
  GrassFoundryPanel: 'foundry',
  UploadSection: 'foundry',
  AnalysisResults: 'foundry',
  ParameterSliders: 'foundry',
  FormulaLibrary: 'foundry',
  DuplicateSection: 'foundry',
  AmpConveyorPanel: 'amps',
  ExtensionSelector: 'amps',
  MutationLabPanel: 'mutations',
  ShaderForgePanel: 'finish',
  ShaderSandbox: 'finish',
  StyleTransmuter: 'finish',
  TextureSelector: 'finish',
  MentorCritiquePanel: 'mentor',
  ReferencePanel: 'mentor',
  LocalLibrary: 'library',
  AsepriteExport: 'library',
  PngExport: 'library',
  RecipeExport: 'library',
  StatusDisplay: 'diagnostics',
  PixelBrainTerminal: 'diagnostics',
  ReceiptLedger: 'diagnostics',
});

describe('PixelBrain legacy-to-Studio parity contract', () => {
  test('gives every flagship surface exactly one named Studio home', () => {
    const allFeatures = STUDIO_TABS.flatMap((tab) => tab.features);
    expect(new Set(allFeatures).size).toBe(allFeatures.length);
    expect(Object.fromEntries(allFeatures.map((feature) => [feature, studioHomeForFeature(feature)])))
      .toEqual(EXPECTED_HOMES);
  });

  test('keeps Canvas Aseprite export/import on the exact legacy engine path', () => {
    const config = { width: 8, height: 8, cellSize: 1, gridType: 'rectangular' };
    const studioPayload = exportStudioAseprite(createStudioGrid(config));
    const legacyPayload = exportLegacyAseprite(createLegacyGrid(config));

    expect(studioPayload).toEqual(legacyPayload);
    expect(importStudioAseprite(studioPayload)).toEqual(importLegacyAseprite(legacyPayload));
  });
});
