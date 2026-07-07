import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { exportSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../codex/core/pixelbrain/scdl/fixtures'
);

describe('graph exports + forest_map fixture', () => {
  const source = readFileSync(join(FIXTURES, 'forest_map/forest_map.scdl'), 'utf8');

  it('forest_map compiles clean into a scene-graph packet', () => {
    const r = compileSCDL(source);
    expect(r.ok).toBe(true);
    expect(r.packet.geometry.mode).toBe('scene-graph');
    expect(r.packet.id).toMatch(/^pbasset_[0-9a-f]{8}$/);
  });

  it('json export is compact; png/svg/phaser rasterize; aseprite defers to PR-3', () => {
    const r = compileSCDL(source);
    const out = exportSCDL(r.packet, ['json', 'png', 'svg', 'phaser', 'aseprite'], r.ast);
    expect(out.json.ok).toBe(true);
    expect(out.json.output.length).toBeLessThan(100_000);
    expect(JSON.parse(out.json.output).geometry.sceneGraph.contract).toBe('PB-SCENE-GRAPH-v1');

    expect(out.png.ok).toBe(true);
    expect(out.png.output.slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    expect(out.svg.ok).toBe(true);
    expect(out.svg.output).toContain('<rect');

    expect(out.phaser.ok).toBe(true);
    expect(JSON.parse(out.phaser.output).pixels.length).toBeGreaterThan(0);

    expect(out.aseprite.ok).toBe(false);
    expect(String(out.aseprite.output)).toMatch(/PR-3/);
  });

  it('flat packets still export identically (routing untouched)', () => {
    const r = compileSCDL('asset flat canvas 4x4\npart p material gold { cell 1 1 #aabbcc }\nexport json');
    const out = exportSCDL(r.packet, ['svg', 'png'], r.ast);
    expect(out.svg.output).toContain('fill="#aabbcc"');
    expect(out.png.ok).toBe(true);
  });

  it('perf gate: 512x288 with 100 instances — compile < 1s, packet < 100 KB', () => {
    const defs = `def tree {
  part trunk material bark { rect -1 0 3 10 #26180E }
  part canopy material pine_needle { circle 0 -4 radius 6 #14301E }
}`;
    const instances = Array.from({ length: 100 }, (_, i) =>
      `  instance tree at ${(i * 37) % 480 + 10} ${(i * 13) % 200 + 40} rotate ${(i * 7) % 360} scale ${1 + (i % 5) / 10}`
    ).join('\n');
    const src = `asset big_map canvas 512x288\n${defs}\ngroup all at 0 0 {\n${instances}\n}\nexport json`;

    const t0 = performance.now();
    const r = compileSCDL(src);
    const elapsed = performance.now() - t0;
    expect(r.ok).toBe(true);
    expect(elapsed).toBeLessThan(1000);
    expect(JSON.stringify(r.packet).length).toBeLessThan(100_000);
  });
});
