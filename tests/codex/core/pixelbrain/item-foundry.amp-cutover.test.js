import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forgeItemAsset } from '../../../../codex/core/pixelbrain/item-foundry.js';

const SPECS_DIR = join(process.cwd(), 'specs');

// Golden values captured by actually running `forgeItemAsset` against every
// real spec on the CURRENT (post-cutover, already extensively
// differential-tested) state of item-foundry.js — NOT invented. Frozen here
// so this test proves "forging today produces the same output cutover always
// produced," not merely "forging twice today agrees with itself" (which the
// previous version of this test proved, and which is true even of a bug that
// reproduces identically both times).
//
// Regenerate only if a real, intentional pipeline behavior change lands and
// this test is the one flagging it: re-run `forgeItemAsset` on every
// `specs/*.json` with `{ includePng: false, includeVolume: false,
// intentReport: false }`, confirm the new values are expected, then update
// this table.
const GOLDEN = {
  'axiom-staff.v1.json': { fillsHash: 'fnv1a_cf54e42a', specHash: 'fnv1a_9901770b' },
  'claymore-holy-fire.json': { fillsHash: 'fnv1a_b2041fce', specHash: 'fnv1a_091be050' },
  'claymore-v1.json': { fillsHash: 'fnv1a_ca38d4ae', specHash: 'fnv1a_3693ff24' },
  'ice-slime-staff.v1.json': { fillsHash: 'fnv1a_bcba8c50', specHash: 'fnv1a_db2e9af2' },
  'loot-chest.v1.json': { fillsHash: 'fnv1a_6660319f', specHash: 'fnv1a_47e8ecdd' },
  'nightmare-sword.json': { fillsHash: 'fnv1a_d6ad86c3', specHash: 'fnv1a_acb2ff87' },
  // Pre-existing broken spec (unregistered `pk.*` part profiles) — the
  // maintained `voidmetal-pickaxe.v1.json` is the real pickaxe. Throws in
  // composeSilhouette, before any AMP gate runs, so it gets a golden error
  // message instead of golden hashes.
  'pickaxe.v1.json': { error: 'Part profile "pk.head" is not registered. Call registerPartProfile() or use a built-in.' },
  'scimitar.hd.v1.json': { fillsHash: 'fnv1a_22c7eb04', specHash: 'fnv1a_7cde379c' },
  'scimitar.hd.v2-lit.json': { fillsHash: 'fnv1a_6058cfd1', specHash: 'fnv1a_3414f999' },
  'slime-staff.v1.json': { fillsHash: 'fnv1a_455feefd', specHash: 'fnv1a_8f98762b' },
  'void-chestplate-arcane-v1.json': { fillsHash: 'fnv1a_3081d8af', specHash: 'fnv1a_2781111a' },
  'void-chestplate-sovereign-v2.json': { fillsHash: 'fnv1a_b1e628fe', specHash: 'fnv1a_43dda173' },
  'voidmetal-ice-staff.v1.json': { fillsHash: 'fnv1a_8138b729', specHash: 'fnv1a_1fc12855' },
  'voidmetal-pickaxe-3d.v1.json': { fillsHash: 'fnv1a_4f657220', specHash: 'fnv1a_433e6324' },
  'voidmetal-pickaxe-pdr.v1.json': { fillsHash: 'fnv1a_4f657220', specHash: 'fnv1a_791bc3e8' },
  'voidmetal-pickaxe.v1.json': { fillsHash: 'fnv1a_19b24ddd', specHash: 'fnv1a_50b0ee88' },
};

describe('item-foundry.js AMP cutover is behavior-preserving', () => {
  const specFiles = readdirSync(SPECS_DIR).filter((f) => f.endsWith('.json'));

  it('the golden table above covers every spec file in specs/ (no silent gaps)', () => {
    expect(new Set(specFiles)).toEqual(new Set(Object.keys(GOLDEN)));
  });

  it.each(specFiles)(
    '%s forges to the golden fill/spec hash captured before this fix wave',
    (file) => {
      const golden = GOLDEN[file];
      expect(golden, `no golden entry for ${file} — add one`).toBeDefined();

      const spec = JSON.parse(readFileSync(join(SPECS_DIR, file), 'utf8'));
      const opts = { includePng: false, includeVolume: false, intentReport: false };

      if (golden.error) {
        expect(() => forgeItemAsset(spec, opts)).toThrow(golden.error);
        return;
      }

      const result = forgeItemAsset(spec, opts);
      expect(result.fills.hash).toBe(golden.fillsHash);
      expect(result.assetPacket.metadata.compatibility.spec.hash).toBe(golden.specHash);
    },
  );
});
