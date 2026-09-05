/**
 * Static Studio AMP dispatch table.
 *
 * Every import and entrypoint is spelled out. Manifest data can select an id,
 * but it can never supply a module path or export name for execution.
 */
export const STUDIO_ADAPTER_DEFINITIONS = Object.freeze({
  'arena-tick.processor': { load: () => import('../../microprocessors/arena/arena-tick.processor.js'), entry: 'arenaTickProcessor' },
  'biome-material.microprocessor': { load: () => import('../amps/biome/biome-material.microprocessor.js'), entry: 'BiomeMaterialMicroprocessor', mode: 'class' },
  'material-resolver': { load: () => import('../amps/biome/material-resolver.js'), entry: 'MaterialResolver', mode: 'support' },
  'fibonacci-field.microprocessor': { load: () => import('../amps/fibonacci/fibonacci-field.microprocessor.js'), entry: 'FibonacciFieldMicroprocessor', mode: 'class' },
  'fibonacci-seed-field': { load: () => import('../amps/fibonacci/fibonacci-seed-field.js'), entry: 'generateFibonacciSeedField', mode: 'support' },
  'iso-tile-geometry.microprocessor': { load: () => import('../amps/geometry/processors/iso-tile-geometry.microprocessor.js'), entry: 'IsoTileGeometryMicroprocessor', mode: 'class' },
  'tile-socket.microprocessor': { load: () => import('../amps/geometry/processors/tile-socket.microprocessor.js'), entry: 'TileSocketMicroprocessor', mode: 'class' },
  'deterministic-noise': { load: () => import('../amps/noise/deterministic-noise.js'), entry: 'createSeededRng', mode: 'support' },
  'noise-mask.microprocessor': { load: () => import('../amps/noise/noise-mask.microprocessor.js'), entry: 'generateNoiseMask' },
  'perlin-field.microprocessor': { load: () => import('../amps/noise/perlin-field.microprocessor.js'), entry: 'PerlinFieldMicroprocessor', mode: 'class' },
  'qbit-snap-profile': { load: () => import('../amps/qbit/qbit-snap-profile.js'), entry: 'canSnapEdges', mode: 'support' },
  'turboquant-layer-snapshot': { load: () => import('../amps/turboquant/turboquant-layer-snapshot.js'), entry: 'TurboQuantCandidateMemorySchema', mode: 'support' },
  'heightmap.microprocessor': { load: () => import('../amps/volume/processors/heightmap.microprocessor.js'), entry: 'generateHeightMap' },
  'volume.microprocessor': { load: () => import('../amps/volume/processors/volume.microprocessor.js'), entry: 'VolumeMicroprocessor', mode: 'class' },
  'biome-coherence-amp': { load: () => import('../biome-coherence-amp.js'), entry: 'runBiomeCoherenceAMP' },
  'chestplate-amp': { load: () => import('../chestplate-amp.js'), entry: 'applyChestplateTemplate' },
  'chestplate-bevel-amp': { load: () => import('../chestplate-bevel-amp.js'), entry: 'applyChestplateBevel' },
  'chestplate-surface-texture-amp': { load: () => import('../chestplate-surface-texture-amp.js'), entry: 'applyChestplateSurfaceTexture' },
  'chunks-seam-amp': { load: () => import('../chunks-seam-amp.js'), entry: 'injectAllBorderEnergies' },
  'coord-symmetry-amp': { load: () => import('../coord-symmetry-amp.js'), entry: 'runCoordSymmetryAmp' },
  'crystal-core-amp': { load: () => import('../crystal-core-amp.js'), entry: 'applyCrystalCore' },
  'facet-amp': { load: () => import('../facet-amp.js'), entry: 'applyFacets' },
  'flame-tip-amp': { load: () => import('../flame-tip-amp.js'), entry: 'applyFlameTipGeometry' },
  'gear-glide-amp': { load: () => import('../gear-glide-amp.js'), entry: 'updateGearGlide' },
  'geometry-amp': { load: () => import('../geometry-amp.js'), entry: 'buildGeometryAmpPayload' },
  'grass-amp': { load: () => import('../grass-amp.js'), entry: 'GrassAMP' },
  'gravity-amp': { load: () => import('../gravity-amp.js'), entry: 'applyGravityAMP' },
  'hair-flow-amp': { load: () => import('../hair-flow-amp.js'), entry: 'generateHairFlowCells' },
  'heraldry-amp': { load: () => import('../heraldry-amp.js'), entry: 'applyHeraldryTemplate' },
  'hollowness-amp': { load: () => import('../hollowness-amp.js'), entry: 'applyHollownessAMP' },
  'holyfire-motif-amp': { load: () => import('../holyfire-motif-amp.js'), entry: 'applyHolyFireMotif' },
  'image-segmentation-amp': { load: () => import('../image-segmentation-amp.js'), entry: 'segmentImage' },
  'jewelry-amp': { load: () => import('../jewelry-amp.js'), entry: 'applyJewelryTemplate' },
  'neighbor-extrapolation-amp': { load: () => import('../neighbor-extrapolation-amp.js'), entry: 'extrapolateNeighbors' },
  'noise-fill-amp': { load: () => import('../noise-fill-amp.js'), entry: 'NoiseFillAMP' },
  'palette-quantization-amp': { load: () => import('../palette-quantization-amp.js'), entry: 'applyPaletteQuantization' },
  'pixel-aa-amp': { load: () => import('../pixel-aa-amp.js'), entry: 'applyPixelAA' },
  'pixel-scale-amp': { load: () => import('../pixel-scale-amp.js'), entry: 'applyXBR2x' },
  'region-fill-amp': { load: () => import('../region-fill-amp.js'), entry: 'applyRegionFills' },
  'scholomance-character-motif-amp': { load: () => import('../scholomance-character-motif-amp.js'), entry: 'applyScholomanceMotifs' },
  'school-tag-amp': { load: () => import('../school-tag-amp.js'), entry: 'applySchoolTagAMP' },
  'sdf-shape-amp': { load: () => import('../sdf-shape-amp.js'), entry: 'SDFShapeAMP' },
  'selout-amp': { load: () => import('../selout-amp.js'), entry: 'applySelout' },
  'shadow-amp': { load: () => import('../shadow-amp.js'), entry: 'buildShadowAmpPayload' },
  'shadow-perception-amp': { load: () => import('../shadow-perception-amp.js'), entry: 'runShadowPerceptionAmp' },
  'shield-rim-amp': { load: () => import('../shield-rim-amp.js'), entry: 'applyShieldRimTemplate' },
  'shield-volume-amp': { load: () => import('../shield-volume-amp.js'), entry: 'applyShieldVolumeTemplate' },
  'sketch-amp': { load: () => import('../sketch-amp.js'), entry: 'runSketchAMP' },
  'square-sharpness-contrast-amp': { load: () => import('../square-sharpness-contrast-amp.js'), entry: 'enhanceSquaresForRender' },
  'symmetry-amp': { load: () => import('../symmetry-amp.js'), entry: 'runSymmetryAmpProcessor' },
  'tonation-amp': { load: () => import('../tonation-amp.js'), entry: 'buildTonationAmpPayload' },
  'vector-amp': { load: () => import('../vector-amp.js'), entry: 'buildVectorAmpPayload' },
  'volume-amp': { load: () => import('../volume-amp.js'), entry: 'buildVolumeAmpPayload' },
  'volume-lift-amp': { load: () => import('../volume-lift-amp.js'), entry: 'liftToVolume' },
});

export async function resolveStudioAmpAdapter(adapterId) {
  const definition = STUDIO_ADAPTER_DEFINITIONS[adapterId];
  if (!definition) throw new Error(`PB-STUDIO-ADAPTER-NOT-REGISTERED: ${adapterId}`);
  const module = await definition.load();
  const entrypoint = module[definition.entry];
  if (entrypoint === undefined) {
    throw new Error(`PB-STUDIO-ENTRYPOINT-MISSING: ${adapterId}.${definition.entry}`);
  }
  return Object.freeze({ ...definition, adapterId, entrypoint });
}
