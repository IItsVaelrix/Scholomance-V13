import {
  SOURCE_MATERIAL,
  MATERIAL_PALETTES,
  MATERIAL_OPTIONS,
  clamp01,
  hexToRgb,
  luminanceFromRgb,
  resolveMaterialId,
  transmuteMaterialColor,
  transmuteMaterialPalette,
  transmuteMaterialPalettes,
  transmuteMaterialCoordinates,
} from '../../../lib/codex/pixelbrain.js';

export {
  SOURCE_MATERIAL,
  MATERIAL_PALETTES,
  clamp01,
  hexToRgb,
  luminanceFromRgb,
};

export const CHROMATIC_MATERIAL_OPTIONS = MATERIAL_OPTIONS;

export function transmutePaletteColor(hex, material = 'icy_fire') {
  return transmuteMaterialColor(hex, material);
}

export function transmutePixelBrainPalette(sourcePalette, material = 'icy_fire') {
  return transmuteMaterialPalette(sourcePalette, material);
}

export function transmutePixelBrainPalettes(palettes, material = 'icy_fire') {
  return transmuteMaterialPalettes(palettes, material);
}

export function transmutePixelBrainCoordinates(coordinates, material = 'icy_fire') {
  return transmuteMaterialCoordinates(coordinates, material);
}

export function buildChromaticColorMap({ sourcePalette = [], outputPalette = [] } = {}) {
  const map = {};
  sourcePalette.forEach((sourceColor, index) => {
    const outputColor = outputPalette[index];
    if (typeof sourceColor === 'string' && typeof outputColor === 'string') {
      map[sourceColor.toUpperCase()] = outputColor;
      map[sourceColor.toLowerCase()] = outputColor;
    }
  });
  return map;
}

function deriveFlatSourcePalette(sourcePalette, sourcePalettes) {
  if (Array.isArray(sourcePalette) && sourcePalette.length > 0) {
    return sourcePalette;
  }

  const flat = [];
  (Array.isArray(sourcePalettes) ? sourcePalettes : []).forEach((palette) => {
    if (Array.isArray(palette?.colors)) flat.push(...palette.colors);
  });
  return flat;
}

export function buildChromaticTransmutationPayload({
  sourcePalette,
  sourcePalettes,
  sourceCoordinates,
  material = 'icy_fire',
  intent = 'transmute_fire_to_icy_fire',
} = {}) {
  const resolvedMaterial = resolveMaterialId(material);
  const flatSourcePalette = deriveFlatSourcePalette(sourcePalette, sourcePalettes);
  const outputPalette = transmutePixelBrainPalette(flatSourcePalette, resolvedMaterial);
  const outputPalettes = transmutePixelBrainPalettes(sourcePalettes, resolvedMaterial);
  const outputCoordinates = transmutePixelBrainCoordinates(sourceCoordinates, resolvedMaterial);

  return {
    amp: 'chromatic-transmutation',
    version: '0.1.0',
    intent,
    material: resolvedMaterial,
    sourcePalette: flatSourcePalette,
    outputPalette,
    sourcePalettes: Array.isArray(sourcePalettes) ? sourcePalettes : [],
    outputPalettes,
    sourceCoordinates: Array.isArray(sourceCoordinates) ? sourceCoordinates : [],
    outputCoordinates,
    colorMap: buildChromaticColorMap({ sourcePalette: flatSourcePalette, outputPalette }),
  };
}
