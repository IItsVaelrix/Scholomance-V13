import { readFileSync, writeFileSync } from 'node:fs';

const PATH = '/home/deck/Downloads/Scholomance-V12-main/codex/core/pixelbrain/aseprite-binary-codec.js';
let code = readFileSync(PATH, 'utf8');

if (!code.includes('inflateSync')) {
  code = code.replace(
    "export const ASEPRITE_BINARY_CODEC_VERSION = '0.1.0';",
    "import { inflateSync } from 'node:zlib';\nexport const ASEPRITE_BINARY_CODEC_VERSION = '0.1.0';"
  );
}

const target = `  const celType = readUInt16LE(buffer, offset + 7);
  if (celType !== 0) return { offset: chunkEnd };

  const width = readUInt16LE(buffer, offset + 16);
  const height = readUInt16LE(buffer, offset + 18);
  const pixelsOffset = offset + 20;`;

const replacement = `  const celType = readUInt16LE(buffer, offset + 7);
  if (celType !== 0 && celType !== 2) return { offset: chunkEnd };

  const width = readUInt16LE(buffer, offset + 16);
  const height = readUInt16LE(buffer, offset + 18);
  let pixelsOffset = offset + 20;
  
  let pixelData;
  if (celType === 2) {
    const compressed = buffer.subarray(pixelsOffset, chunkEnd);
    pixelData = inflateSync(compressed);
  } else {
    pixelData = buffer.subarray(pixelsOffset, chunkEnd);
  }`;

if (code.includes('if (celType !== 0) return { offset: chunkEnd };')) {
  code = code.replace(target, replacement);
}

const loopTarget = `      const idx = pixelsOffset + ((py * width + px) * 4);
      const alpha = readUInt8(buffer, idx + 3);
      if (alpha === 0) continue;
      layer.cells.push({
        x: x + px,
        y: y + py,
        color: rgbaToHex(readUInt8(buffer, idx), readUInt8(buffer, idx + 1), readUInt8(buffer, idx + 2)),`;

const loopReplacement = `      const idx = ((py * width + px) * 4);
      const alpha = pixelData[idx + 3];
      if (alpha === 0) continue;
      layer.cells.push({
        x: x + px,
        y: y + py,
        color: rgbaToHex(pixelData[idx], pixelData[idx + 1], pixelData[idx + 2]),`;

code = code.replace(loopTarget, loopReplacement);

writeFileSync(PATH, code);
console.log('Patched aseprite-binary-codec.js');
