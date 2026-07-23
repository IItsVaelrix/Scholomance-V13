// IMMUNE_ALLOW: LING-0F03
// src/pages/DivWand/components/VoxelScenePortal.jsx
import { memo, useMemo } from 'react';

import {
  createVoxelVolume, cellIndex, getCellMaterialId, isCellOccupied, setCellMaterial, ENERGY_TYPES,
  generateFibonacciSeeds, generateVectorizedTextSeeds,
  propagate, assignMaterial,
  applyHollownessAMP,
  runBiomeCoherenceAMP,
  collectFaces,
  renderFacesToSVG,
  worldRenderOptions, seedsToLightPoints,
} from '../../../lib/codex/pixelbrain.js';

function runVoxelPipeline(volumeSize, seedCfg, text) {
  const SIZE = volumeSize;
  const volume = createVoxelVolume(SIZE, SIZE, SIZE);

  // Step 1-2: Generate seeds
  let rawSeeds;
  if (text) {
    rawSeeds = generateVectorizedTextSeeds(text, volume, {
      gravityOptions: { steps: seedCfg.gravitySteps ?? 6 },
    });
  } else {
    rawSeeds = generateFibonacciSeeds(
      { iterations: seedCfg.iterations ?? 6, scale: seedCfg.scale ?? 0.75 },
      volume,
      { energyType: ENERGY_TYPES.STRUCTURAL, initialEnergy: seedCfg.initialEnergy ?? 0.5 }
    );
  }

  // Remap { vx, vy, vz } → { x, y, z } for propagate
  const seeds = rawSeeds.map(s => ({ x: s.vx, y: s.vy, z: s.vz, energy: s.energy, energyType: s.energyType }));

  // Step 3: Propagate energy field
  const field = propagate(seeds, SIZE, SIZE, SIZE, {
    decay: seedCfg.decay ?? 0.15,
    iterations: seedCfg.propagationIterations ?? 3,
  });

  // Step 4: Assign materials
  for (let y = 0; y < SIZE; y++) {
    for (let z = 0; z < SIZE; z++) {
      for (let x = 0; x < SIZE; x++) {
        const energy = field.energyAt(x, y, z);
        volume.energyField[cellIndex(volume, x, y, z)] = energy;
        setCellMaterial(volume, x, y, z, assignMaterial(energy));
      }
    }
  }

  // Step 5: HollownessAMP
  applyHollownessAMP(volume, seedCfg.hollowIterations ?? 3);

  // Step 6: BiomeCoherenceAMP - wrap field to cell-object API
  runBiomeCoherenceAMP(volume, {
    energyAt: (cell) => field.energyAt(cell.x, cell.y, cell.z),
  });

  // Step 7: Collect faces
  const rawFaces = collectFaces(
    volume,
    (x, y, z) => getCellMaterialId(volume, x, y, z),
    (x, y, z) => isCellOccupied(volume, x, y, z)
  );

  // Remap faceType → type for SVG renderer
  const faces = rawFaces.map(f => ({ ...f, type: f.faceType }));

  // Step 8: Render SVG - shared world look (AO + antialias) with a soft glow
  // cued from the energy seeds.
  return renderFacesToSVG(faces, worldRenderOptions(seedsToLightPoints(seeds, { size: SIZE })));
}

export const VoxelScenePortal = memo(function VoxelScenePortal({ node }) {
  const seed       = node.props?.seed       ?? {};
  const volumeSize = node.props?.volumeSize ?? 32;
  const text       = node.props?.text       ?? null;
  const seedKey    = JSON.stringify(seed);

  const svgString = useMemo(
    () => runVoxelPipeline(volumeSize, seed, text),
    // seedKey serializes seed object for stable identity comparison
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seedKey, volumeSize, text]
  );

  const layoutStyle = {
    width:  node.layout?.width  != null ? `${node.layout.width}px`  : '100%',
    height: node.layout?.height != null ? `${node.layout.height}px` : '300px',
    overflow: 'hidden',
  };

  return (
    <div
      id={node.id}
      className="div-node div-voxel-scene"
      style={layoutStyle}
      dangerouslySetInnerHTML={{ __html: svgString }}
    />
  );
});
