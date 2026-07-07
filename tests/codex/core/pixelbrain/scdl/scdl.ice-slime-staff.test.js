import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { exportSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../../../../../codex/core/pixelbrain/scdl/fixtures/ice_slime_staff/ice_slime_staff.scdl');

function loadFixture() {
  return readFileSync(FIXTURE, 'utf8');
}

function pngAlphaStats(buf) {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  let pos = 8;
  const idats = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IDAT') idats.push(data);
  }
  const raw = inflateSync(Buffer.concat(idats));
  let transparent = 0;
  let opaque = 0;
  const stride = 1 + width * 4;
  for (let y = 0; y < height; y += 1) {
    const row = raw.subarray(y * stride + 1, y * stride + 1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const alpha = row[x * 4 + 3];
      if (alpha === 0) transparent += 1;
      else opaque += 1;
    }
  }
  return { width, height, transparent, opaque };
}

describe('SCDL Golden — ice_slime_staff', () => {
  it('compiles successfully with walk frames and transparent PNG export', () => {
    const source = loadFixture();
    const run1 = compileSCDL(source);
    const run2 = compileSCDL(source);
    expect(run1.ok).toBe(true);
    expect(run1.packet.id).toBe(run2.packet.id);
    expect(run1.ast.asset).toBe('IceSlimeStaff');
    expect(run1.ast.canvas).toEqual({ width: 64, height: 128 });
    expect(run1.framePackets.length).toBe(9);
    expect(run1.frameLoop?.loop).toBe('ether');

    const png = exportSCDL(run1.framePackets[0], ['png'], run1.ast);
    expect(png.png.ok).toBe(true);
    const stats = pngAlphaStats(Buffer.from(png.png.output));
    expect(stats.width).toBe(64);
    expect(stats.height).toBe(128);
    expect(stats.transparent).toBeGreaterThan(stats.opaque);
    expect(stats.opaque).toBeGreaterThan(400);
  });
});