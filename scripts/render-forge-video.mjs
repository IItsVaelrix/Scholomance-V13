#!/usr/bin/env node
/**
 * Scholomance Remotion Forge — Export Pipeline (Phase 9)
 *
 * Usage examples:
 *   node scripts/render-forge-video.mjs --packet project.scholovid.json --format mp4 --out video.mp4
 *   node scripts/render-forge-video.mjs --packet project.scholovid.json --format webm --out video.webm
 *   node scripts/render-forge-video.mjs --packet project.scholovid.json --format gif --out anim.gif
 *   node scripts/render-forge-video.mjs --packet project.scholovid.json --format png-sequence --out frames/
 *
 * The packet is the source of truth.
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { format: 'mp4' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--packet' || args[i] === '-p') out.packet = args[++i];
    if (args[i] === '--out' || args[i] === '-o') out.out = args[++i];
    if (args[i] === '--format' || args[i] === '-f') out.format = args[++i].toLowerCase();
    if (args[i] === '--quality') out.quality = parseInt(args[++i], 10);
  }
  return out;
}

const { packet: packetPath, out: outPath, format, quality = 90 } = parseArgs();

if (!packetPath) {
  console.error('Usage: node scripts/render-forge-video.mjs --packet <project.scholovid.json> [--format mp4|webm|gif|png-sequence] [--out path]');
  process.exit(1);
}

const absPacket = resolve(process.cwd(), packetPath);
const project = JSON.parse(readFileSync(absPacket, 'utf8'));

if (project.schema !== 'scholomance.video.project.v1') {
  console.error('Invalid VideoProjectPacket (schema mismatch)');
  process.exit(1);
}

const fps = project.canvas.fps || 30;
const durationInFrames = project.canvas.durationFrames;
const width = project.canvas.width || 1920;
const height = project.canvas.height || 1080;

console.log('Bundling ScholomanceVideoForge...');
const entryPoint = resolve(__dirname, '../src/video/index.ts');
const bundleLocation = await bundle({ entryPoint });

console.log('Selecting composition...');
const composition = await selectComposition({
  serveUrl: bundleLocation,
  id: 'ScholomanceVideoForge',
  inputProps: { project },
});

let outputLocation = outPath || `output/forge-${project.projectId}.${format === 'png-sequence' ? 'zip' : format}`;
outputLocation = resolve(process.cwd(), outputLocation);

console.log(`Rendering ${durationInFrames} frames @ ${fps}fps → ${outputLocation} (format: ${format})`);

if (format === 'png-sequence') {
  // PNG sequence export
  const seqDir = outputLocation.replace(/\.(zip|png)$/, '');
  mkdirSync(seqDir, { recursive: true });
  console.log(`Exporting PNG sequence to ${seqDir}/`);

  // We use renderMedia with imageSequence
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    imageFormat: 'png',
    outputLocation: seqDir,
    inputProps: { project },
    onProgress: (p) => process.stdout.write(`\r${Math.floor(p.progress * 100)}%`),
  });
  console.log(`\nPNG sequence done in ${seqDir}/`);
} else if (format === 'gif') {
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'gif',
    outputLocation,
    inputProps: { project },
    onProgress: (p) => process.stdout.write(`\r${Math.floor(p.progress * 100)}%`),
  });
  console.log(`\nGIF done: ${outputLocation}`);
} else {
  // MP4 / WebM
  const codec = format === 'webm' ? 'vp8' : 'h264';
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec,
    outputLocation,
    inputProps: { project },
    onProgress: (p) => process.stdout.write(`\r${Math.floor(p.progress * 100)}%`),
  });
  console.log(`\n${format.toUpperCase()} done: ${outputLocation}`);
}

// Also write an export manifest (per PDR)
const manifest = {
  exportedAt: new Date().toISOString(),
  packetId: project.projectId,
  title: project.title,
  format,
  fps,
  durationFrames,
  resolution: `${width}x${height}`,
  file: outputLocation,
  canvas: project.canvas,
};
const manifestPath = outputLocation.replace(/\.[^.]+$/, '') + '.manifest.json';
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Manifest: ${manifestPath}`);
