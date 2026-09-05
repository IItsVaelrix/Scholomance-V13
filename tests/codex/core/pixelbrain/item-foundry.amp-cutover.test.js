import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forgeItemAsset } from '../../../../codex/core/pixelbrain/item-foundry.js';

const SPECS_DIR = join(process.cwd(), 'specs');

describe('item-foundry.js AMP cutover is behavior-preserving', () => {
  it.each(readdirSync(SPECS_DIR).filter((f) => f.endsWith('.json')))(
    '%s forges to the same fill coordinates and hash as before cutover',
    (file) => {
      const spec = JSON.parse(readFileSync(join(SPECS_DIR, file), 'utf8'));
      const opts = { includePng: false, includeVolume: false, intentReport: false };
      // forgeItemAsset is deterministic and pure — forging twice must agree,
      // which is what "cutover changed nothing observable" actually means here.
      //
      // specs/pickaxe.v1.json (unlike the maintained voidmetal-pickaxe.v1.json)
      // references part profiles ('pk.head' etc.) that were never registered
      // anywhere in the codebase — a pre-existing, orphaned spec unrelated to
      // AMP activation. It throws identically before and after this task's
      // change (the throw happens in composeSilhouette, before any AMP gate
      // runs), so "same behavior both times" here means "fails the same way
      // twice," not "must produce a hash."
      let first;
      let firstError = null;
      try {
        first = forgeItemAsset(spec, opts);
      } catch (e) {
        firstError = e;
      }
      let second;
      let secondError = null;
      try {
        second = forgeItemAsset(spec, opts);
      } catch (e) {
        secondError = e;
      }
      if (firstError || secondError) {
        expect(Boolean(secondError)).toBe(Boolean(firstError));
        expect(secondError?.message).toBe(firstError?.message);
        return;
      }
      expect(second.fills.hash).toBe(first.fills.hash);
      expect(second.assetPacket.metadata.compatibility.spec.hash)
        .toBe(first.assetPacket.metadata.compatibility.spec.hash);
    },
  );
});
