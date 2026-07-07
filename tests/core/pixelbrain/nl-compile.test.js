import { describe, it, expect } from 'vitest';
import { compilePromptToAsset, __test__ } from '../../../codex/core/pixelbrain/nl-compile.js';

describe('NL → PixelBrain compiler (Path 1 spine)', () => {
  it('is deterministic: same prompt → byte-identical checksum (Axioms 5 & 6)', async () => {
    const a = await compilePromptToAsset('a heroic golden sword');
    const b = await compilePromptToAsset('a heroic golden sword');
    expect(a.checksum).toBe(b.checksum);
    expect(a.checksum).toMatch(/^[0-9A-F]{8}$/);
    expect(canonicalEq(a.digest, b.digest)).toBe(true);
  });

  it('produces a canonical asset packet with integer geometry', async () => {
    const { packet, digest } = await compilePromptToAsset('a dark fierce blade');
    expect(packet.kind).toBeDefined();
    for (const c of digest.coordinates) {
      expect(Number.isInteger(c.x)).toBe(true);
      expect(Number.isInteger(c.y)).toBe(true);
    }
  });

  it('keeps the decreed mood tint separate from the authoritative source palette (COLOR_DRAGON)', async () => {
    const { digest } = await compilePromptToAsset('a peaceful blue rune');
    // Authoritative source palette and the single decreed tint are distinct slots.
    expect(Array.isArray(digest.sourcePalette)).toBe(true);
    expect(digest.semanticPalette).toHaveLength(1);
    expect(digest.semanticPalette[0]).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('different prompts generally yield different checksums', async () => {
    const a = await compilePromptToAsset('a heroic golden sword');
    const b = await compilePromptToAsset('a mysterious violet sigil');
    expect(a.checksum).not.toBe(b.checksum);
  });
});

describe('nl-compile checksum primitives', () => {
  it('canonicalize sorts keys (order-independent)', () => {
    expect(__test__.canonicalize({ b: 1, a: 2 })).toBe(__test__.canonicalize({ a: 2, b: 1 }));
  });

  it('fnv1a8Hex matches the white-paper empty-input basis', () => {
    expect(__test__.fnv1a8Hex('')).toBe('811C9DC5');
  });

  it('hslToHex is deterministic and well-formed', () => {
    expect(__test__.hslToHex(45, 0.7, 0.75)).toMatch(/^#[0-9A-F]{6}$/);
    expect(__test__.hslToHex(45, 0.7, 0.75)).toBe(__test__.hslToHex(45, 0.7, 0.75));
  });
});

function canonicalEq(a, b) {
  return __test__.canonicalize(a) === __test__.canonicalize(b);
}
