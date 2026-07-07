import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { renderSceneGraph, framebufferToCoordinates } from '../../../../../codex/core/pixelbrain/scene-graph-renderer.js';

function render(source, options) {
  const r = compileSCDL(source);
  expect(r.ok).toBe(true);
  return renderSceneGraph(r.packet.geometry.sceneGraph, r.packet.canvas, options);
}
const px = (fb, x, y) => fb.pixels[y * fb.width + x];
const hex = v => `#${(v >>> 8).toString(16).padStart(6, '0')}`;

describe('scene-graph forward renderer (geometry)', () => {
  it('integer translation places def cells exactly (fast path)', () => {
    const fb = render(`asset a canvas 16x16
def dot { part p material gold { cell 0 0 #ff0000  cell 1 0 #00ff00 } }
group g at 4 4 { instance dot at 2 3 }
export json`);
    expect(hex(px(fb, 6, 7))).toBe('#ff0000');  // (0,0) + at(2,3) + group(4,4)
    expect(hex(px(fb, 7, 7))).toBe('#00ff00');
    expect(px(fb, 0, 0)).toBe(0);
  });

  it('painter order: later instance paints over earlier', () => {
    const fb = render(`asset a canvas 8x8
def r { part p material gold { rect 0 0 2 2 #ff0000 } }
def b { part p material gold { rect 0 0 2 2 #0000ff } }
group g at 0 0 { instance r at 2 2  instance b at 3 3 }
export json`);
    expect(hex(px(fb, 3, 3))).toBe('#0000ff'); // overlap goes to the later node
    expect(hex(px(fb, 2, 2))).toBe('#ff0000');
  });

  it('rotation is hole-free: rotated disc has no interior gaps', () => {
    for (const theta of [7, 33, 45]) {
      const fb = render(`asset a canvas 40x40
def disc { part p material gold { circle 0 0 radius 8 #ffffff } }
group g at 0 0 { instance disc at 20 20 rotate ${theta} }
export json`);
      // every pixel strictly inside radius 6 of (20,20) must be filled
      for (let y = 15; y <= 25; y++) {
        for (let x = 15; x <= 25; x++) {
          if ((x - 20) ** 2 + (y - 20) ** 2 <= 36) {
            expect(px(fb, x, y), `hole at ${x},${y} theta ${theta}`).not.toBe(0);
          }
        }
      }
    }
  });

  it('scale works both directions', () => {
    const fb = render(`asset a canvas 32x32
def dot { part p material gold { rect 0 0 2 2 #ffffff } }
group g at 0 0 { instance dot at 4 4 scale 3 }
export json`);
    // 2x2 rect scaled 3x → covers world [4,10) x [4,10)
    expect(px(fb, 4, 4)).not.toBe(0);
    expect(px(fb, 9, 9)).not.toBe(0);
    expect(px(fb, 10, 10)).toBe(0);
  });

  it('def symmetry mirrors around LOCAL x=0', () => {
    const fb = render(`asset a canvas 16x16
def wing { part p material gold { symmetry x  cell 2 0 #ffffff } }
group g at 0 0 { instance wing at 8 8 }
export json`);
    expect(px(fb, 10, 8)).not.toBe(0); // +2
    expect(px(fb, 6, 8)).not.toBe(0);  // -2 mirrored
  });

  it('determinism: two renders produce identical bytes', () => {
    const src = `asset a canvas 24x24
def t { part p material gold { circle 0 0 radius 3 #123456 } }
group g at 2 2 { instance t at 5 5 rotate 33 scale 1.3 }
export json`;
    const a = render(src);
    const b = render(src);
    expect(Buffer.from(a.pixels.buffer).equals(Buffer.from(b.pixels.buffer))).toBe(true);
  });

  it('semantics cellIndex carries instance-path sourceOpId', () => {
    const fb = render(`asset a canvas 8x8
def dot { part core material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance dot as d1 at 2 2 }
export json`, { semantics: true });
    const idx = fb.cellIndex[2 * 8 + 2];
    expect(idx.partId).toBe('core');
    expect(idx.sourceOpId).toBe('g/d1/core');
    expect(idx.material).toBe('gold');
  });

  it('framebufferToCoordinates round-trips filled pixels', () => {
    const fb = render(`asset a canvas 4x4
part p material gold { cell 1 2 #aabbcc }
group g at 0 0 { }
export json`);
    expect(framebufferToCoordinates(fb)).toEqual([{ x: 1, y: 2, color: '#aabbcc' }]);
  });
});
