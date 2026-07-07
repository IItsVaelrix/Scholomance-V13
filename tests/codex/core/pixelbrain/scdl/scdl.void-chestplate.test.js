/**
 * SCDL Golden Test — void_chestplate
 *
 * This is the regression test. It compiles the canonical void_chestplate
 * fixture twice and asserts:
 *   1. The compile succeeds
 *   2. The packet ID is stable across runs (determinism law)
 *   3. The packet shape matches the expected SCDL-AST-v1 contract
 *   4. Exports produce valid JSON, SVG, and Phaser configs
 */

import { describe, it, expect } from 'vitest';
import { readFileSync }   from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }  from 'node:url';
import { compileSCDL }    from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { exportSCDL }     from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';
import { emitLattice }    from '../../../../../codex/core/pixelbrain/scdl/scdl.lattice-emitter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../../../../../codex/core/pixelbrain/scdl/fixtures/void_chestplate.scdl');

function loadFixture() {
  return readFileSync(FIXTURE, 'utf8');
}

describe('SCDL Golden — void_chestplate', () => {
  it('fixture file exists and is readable', () => {
    expect(() => loadFixture()).not.toThrow();
    expect(loadFixture().length).toBeGreaterThan(0);
  });

  it('compiles successfully', () => {
    const source = loadFixture();
    const result = compileSCDL(source);
    expect(result.ok).toBe(true);
    expect(result.packet).toBeTruthy();
  });

  it('has no ERROR-severity errors', () => {
    const result = compileSCDL(loadFixture());
    const errors = result.errors.filter(e => e.isError && e.isError());
    expect(errors).toHaveLength(0);
  });

  it('produces stable packet ID across two compiles (determinism law)', () => {
    const source = loadFixture();
    const run1 = compileSCDL(source);
    const run2 = compileSCDL(source);
    expect(run1.packet.id).toBe(run2.packet.id);
  });

  it('AST matches expected structure', () => {
    const result = compileSCDL(loadFixture());
    const ast = result.ast;
    expect(ast.contract).toBe('SCDL-AST-v1');
    expect(ast.asset).toBe('void_chestplate');
    expect(ast.canvas).toEqual({ width: 64, height: 64 });
    expect(Object.keys(ast.palette)).toContain('void0');
    expect(Object.keys(ast.palette)).toContain('gold2');
    expect(Object.keys(ast.palette)).toContain('cyan2');
    expect(ast.parts.some(p => p.id === 'torso')).toBe(true);
    expect(ast.parts.some(p => p.id === 'gem')).toBe(true);
  });

  it('torso part has trace intent and fill', () => {
    const result = compileSCDL(loadFixture());
    const torso = result.ast.parts.find(p => p.id === 'torso');
    expect(torso).toBeTruthy();
    const hasTrace = torso.intentOps.some(o => o.op === 'trace');
    expect(hasTrace).toBe(true);
    expect(torso.fillColor).toBe('#05060D');
  });

  it('gem part has glow descriptor (hint)', () => {
    const result = compileSCDL(loadFixture());
    const gem = result.ast.parts.find(p => p.id === 'gem');
    expect(gem?.noiseDescriptors?.length).toBeGreaterThan(0);
    expect(gem.noiseDescriptors[0].type).toBe('glow');
  });

  it('symmetry x expands to mirrored cells on torso', () => {
    const result = compileSCDL(loadFixture());
    const torso = result.ast.parts.find(p => p.id === 'torso');
    expect(torso._symmetryApplied).toBe('vertical');
  });

  it('exports json — valid JSON', () => {
    const result = compileSCDL(loadFixture());
    const exports = exportSCDL(result.packet, ['json'], result.ast);
    expect(exports.json.ok).toBe(true);
    const packet = JSON.parse(exports.json.output);
    expect(packet.kind).toBe('pixelbrain.asset.v1');
    expect(packet.id).toBe(result.packet.id);
  });

  it('exports svg — contains <rect> elements', () => {
    const result = compileSCDL(loadFixture());
    const exports = exportSCDL(result.packet, ['svg'], result.ast);
    expect(exports.svg.ok).toBe(true);
    expect(exports.svg.output).toContain('<svg');
    expect(exports.svg.output).toContain('<rect');
  });

  it('exports phaser — valid config with pixels array', () => {
    const result = compileSCDL(loadFixture());
    const exports = exportSCDL(result.packet, ['phaser'], result.ast);
    expect(exports.phaser.ok).toBe(true);
    const config = JSON.parse(exports.phaser.output);
    expect(config.type).toBe('scdl-phaser-v1');
    expect(config.key).toBe('void_chestplate');
    expect(Array.isArray(config.pixels)).toBe(true);
    // gem cell at (31,18)
    const gemPixel = config.pixels.find(p => p.x === 31 && p.y === 18);
    expect(gemPixel).toBeTruthy();
    expect(gemPixel.color).toBe(0x00E5FF);
    expect(config.palette).toMatchObject({
      void0: 0x05060D,
      gold2: 0xD8B84C,
      cyan2: 0x00E5FF,
    });
  });

  it('exports png — valid PNG bytes', () => {
    const result = compileSCDL(loadFixture());
    const exports = exportSCDL(result.packet, ['png'], result.ast);
    expect(exports.png.ok).toBe(true);
    expect(exports.png.mimeType).toBe('image/png');
    expect(exports.png.output).toBeInstanceOf(Uint8Array);
    expect(Array.from(exports.png.output.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('lattice emitter produces pixelbrain.asset.v1 shape', () => {
    const result = compileSCDL(loadFixture());
    const lattice = emitLattice(result.packet, result.ast);
    expect(lattice.kind).toBe('pixelbrain.asset.v1');
    expect(lattice.canvas).toEqual({ width: 64, height: 64 });
    expect(lattice.scdlSource).toBe('SCDL-AST-v1');
    expect(Array.isArray(lattice.geometry.coordinates)).toBe(true);
  });

  it('regression: packet ID is stable across multiple compiles', () => {
    const source = loadFixture();
    const ids = Array.from({ length: 3 }, () => compileSCDL(source).packet.id);
    expect(new Set(ids).size).toBe(1);
  });
});
