import { readFileSync, writeFileSync } from 'node:fs';
import { importAsepriteBinaryToFoundryAsset, exportFoundryToAsepriteBinary, decodeFoundryAsepriteBinary, importAsepriteToFoundryAsset } from '../codex/core/pixelbrain/foundry-aseprite-bridge.js';
import { runCoordSymmetryAmp } from '../codex/core/pixelbrain/coord-symmetry-amp.js';

async function main() {
  const inputPath = '/home/deck/Downloads/Scholomance-V12-main/docs/references/BARREL.aseprite';
  console.log(`Reading ${inputPath}...`);
  const buffer = readFileSync(inputPath);
  
  const decoded = decodeFoundryAsepriteBinary(buffer);
  console.log('Decoded frames:', decoded?.frames?.length);
  if (decoded?.frames?.length > 0) {
    console.log('Layers in frame 0:', decoded.frames[0].layers?.length);
    if (decoded.frames[0].layers?.length > 0) {
      console.log('Cells in layer 0:', decoded.frames[0].layers[0].cells?.length);
    }
  }
  
  const foundryAsset = importAsepriteToFoundryAsset(decoded);
  const packet = foundryAsset.assetPacket;
  const { width, height } = packet.canvas;
  console.log(`Canvas: ${width}x${height}`);
  console.log('Keys in packet:', Object.keys(packet));
  console.log('Geometry:', Object.keys(packet.geometry || {}));
  console.log('Source:', Object.keys(packet.source || {}));
  const coordinates = packet.geometry?.coordinates || packet.coordinates || packet.geometry?.cells || [];
  console.log(`Extracted Coordinates length: ${coordinates?.length}`);
  
  // Create symmetry input
  const symmetryInput = {
    assetId: 'barrel',
    coordinates: coordinates,
    dimensions: { width, height },
    symmetry: { type: 'vertical', axis: { x: width / 2 } },
    transformMode: 'canonicalize',
    overlapPolicy: 'prefer-original'
  };
  
  const result = runCoordSymmetryAmp(symmetryInput);
  console.log(`Transformed coordinates: ${result.transformedCount}`);
  
  // Re-export
  const morphedFoundry = {
    assetPacket: {
      ...packet,
      geometry: {
        ...packet.geometry,
        coordinates: result.coordinates
      },
      coordinates: result.coordinates // In case bridge uses this
    }
  };
  
  const asepriteBinary = exportFoundryToAsepriteBinary(morphedFoundry);
  writeFileSync(inputPath, Buffer.from(asepriteBinary));
  console.log('Successfully refined BARREL.aseprite with vertical symmetry scan.');
}

main().catch(console.error);
