#!/usr/bin/env node
/**
 * Chalice Embryonic Regeneration — Ontological Art-Direction Pipeline Test
 *
 * Generates a COMPLETELY NEW asset (chalice) using only the embryonic
 * art-direction pipeline. Proves the pipeline can CREATE, not just replay.
 *
 * Usage: node scripts/regen-chalice-embryonic.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const scdlDir  = resolve(repoRoot, 'PolarisOS/worldpacks/shrine-demo/scdl');
const outDir   = resolve(repoRoot, 'PolarisOS/evidence');

// ─── Pipeline imports ────────────────────────────────────────────────────────
const { compileSCDL } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/scdl.compiler.js')
);
const { createArtGenePacket, PROJECTION_ALGO_VERSION, CONFLICT_POLICY_VERSION } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdna-art-gene.js')
);
const { projectGenes } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/passes/project-genes.pass.js')
);
const { computePreviewChecksums } = await import(
  resolve(repoRoot, 'codex/core/pixelbrain/scdna-art-gene-compiler.js')
);

// ─── Step 1: Load embryonic SCDL ─────────────────────────────────────────────
const scdlSource = readFileSync(resolve(scdlDir, 'chalice.scdl'), 'utf8');
console.log('═══ CHALICE EMBRYONIC REGENERATION ═══');
console.log('SCDL source: embryonic geometry skeleton (zero hand-placed cells)');

// ─── Step 2: Load and instantiate art-direction genes ───────────────────────
const genesRaw = JSON.parse(readFileSync(resolve(scdlDir, 'chalice.art-genes.json'), 'utf8'));
const canvas   = genesRaw.canvas;

const genes = genesRaw.genes.map((g) =>
  createArtGenePacket({
    assetId:        genesRaw.assetId,
    geneId:         g.geneId,
    geneType:       'art-direction',
    priority:       g.priority,
    projectionMode: g.projectionMode,
    canvas,
    coordinates:    g.coordinates,
    geometryHints:  g.geometryHints,
    role:           g.role,
    curator:        g.curator,
    rationale:      g.rationale,
  })
);

console.log(`Art genes loaded: ${genes.length}`);
for (const g of genes) {
  console.log(`  [${g.geneId}] priority=${g.priority} mode=${g.projectionMode} coords=${g.coordinates.length} checksum=${g.checksum.slice(0, 24)}…`);
}

// ─── Step 3: Build projection context ───────────────────────────────────────
const projectionContext = {
  canvas,
  compilerVersion:            'scdl-compiler-1.0.0',
  projectionAlgoVersion:      PROJECTION_ALGO_VERSION,
  conflictPolicyVersion:      CONFLICT_POLICY_VERSION,
  paletteRoleMappingVersion:  'chalice-palette-v1',
  sdfByPart:                  {},
};

// ─── Step 4: Project genes (pure, deterministic) ────────────────────────────
const projection = projectGenes(genes, projectionContext);
console.log(`\nProjection: ${projection.cells.length} cells, ${projection.conflicts.length} conflicts`);
console.log(`Projection checksum: ${projection.projectionChecksum.slice(0, 32)}…`);
console.log(`Gene order: ${projection.orderedGeneIds.join(' → ')}`);

// ─── Step 5: Compute preview checksums (§10.6) ─────────────────────────────
const preview = computePreviewChecksums({
  canvas,
  cells: projection.cells,
  paletteRoleMappingVersion: 'chalice-palette-v1',
});
console.log(`\nPreview model checksum:    ${preview.modelChecksum.slice(0, 32)}…`);
console.log(`Preview document checksum: ${preview.documentChecksum.slice(0, 32)}…`);

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'chalice-gene-preview.svg'), preview.svgSource, 'utf8');
console.log('SVG preview written: PolarisOS/evidence/chalice-gene-preview.svg');

// ─── Step 6: Compile SCDL with art genes ────────────────────────────────────
const result = compileSCDL(scdlSource, {
  artGenes: genes,
  artProjectionContext: projectionContext,
});

if (!result.ok) {
  console.error('\nCOMPILATION FAILED:');
  for (const e of result.errors) {
    console.error(`  [${e.severity}] ${e.code}: ${e.message}`);
  }
  process.exit(1);
}

const packet = result.packet;
const geneCells = packet.coords.filter(c => c._gene);
console.log(`\nSCDL compiled OK: ${packet.id}`);
console.log(`Total coords: ${packet.coords.length}, gene-projected: ${geneCells.length}`);
console.log(`Parts: ${packet.parts.map(p => p.id).join(', ')}`);

// ─── Step 7: Write compiled packet ─────────────────────────────────────────
writeFileSync(
  resolve(scdlDir, 'chalice-json.json'),
  JSON.stringify(packet, null, 2) + '\n'
);
console.log('Wrote chalice-json.json');

// ─── Step 8: Render images via vixel-rasterize ─────────────────────────────
const { renderVixel, encodePng } = await import(
  resolve(repoRoot, 'PolarisOS/scripts/vixel-rasterize.mjs')
);

const variants = [
  { name: 'pixel-chalice-4x.png',  scale: 4, mode: 'pixel' },
  { name: 'pixel-chalice-8x.png',  scale: 8, mode: 'pixel' },
  { name: 'vixel-chalice-4x.png',  scale: 4, mode: 'vixel' },
  { name: 'vixel-chalice-8x.png',  scale: 8, mode: 'vixel' },
];

for (const v of variants) {
  const rendered = renderVixel(packet, { scale: v.scale, mode: v.mode });
  const pngBuf = encodePng(rendered);
  writeFileSync(resolve(outDir, v.name), pngBuf);
  console.log(`Wrote ${v.name} (${pngBuf.length} bytes)`);
}

// ─── Step 9: ASCII preview ─────────────────────────────────────────────────
const grid = Array.from({ length: canvas.height }, () =>
  Array(canvas.width).fill('.')
);
for (const c of packet.coords) {
  if (c._gene) grid[c.y][c.x] = '*';
  else grid[c.y][c.x] = '#';
}
console.log('\nASCII preview (# = geometry, * = gene-projected):');
grid.forEach((row, y) => console.log(`  ${String(y).padStart(2)} ${row.join('')}`));

// ─── Step 10: Hole check ───────────────────────────────────────────────────
const occupied = new Set(packet.coords.map(c => `${c.x},${c.y}`));
let holes = 0;
for (let y = 0; y < canvas.height; y++) {
  for (let x = 0; x < canvas.width; x++) {
    if (occupied.has(`${x},${y}`)) continue;
    // BFS to border
    const visited = new Set();
    const queue = [[x, y]];
    let enclosed = true;
    while (queue.length > 0) {
      const [cx, cy] = queue.shift();
      const key = `${cx},${cy}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (cx === 0 || cy === 0 || cx === canvas.width - 1 || cy === canvas.height - 1) {
        enclosed = false;
        break;
      }
      for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < canvas.width && ny >= 0 && ny < canvas.height) {
          if (!occupied.has(`${nx},${ny}`) && !visited.has(`${nx},${ny}`)) {
            queue.push([nx, ny]);
          }
        }
      }
    }
    if (enclosed) holes++;
  }
}
console.log(`\nEnclosed holes: ${holes} ${holes === 0 ? '✓' : '✗ FAIL'}`);

// ─── Step 11: Determinism check ────────────────────────────────────────────
const result2 = compileSCDL(scdlSource, {
  artGenes: genes,
  artProjectionContext: projectionContext,
});
const buf1 = encodePng(renderVixel(packet, { scale: 8, mode: 'vixel' }));
const buf2 = encodePng(renderVixel(result2.packet, { scale: 8, mode: 'vixel' }));
console.log(`Determinism: ${buf1.equals(buf2) ? '✓ PASS' : '✗ FAIL'}`);

console.log('\nDone. The chalice is a NEW asset — never existed before this pipeline run.');
