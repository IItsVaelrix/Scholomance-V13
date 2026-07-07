import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { exportSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';
import {
  LOOT_CHEST_TIERS,
  transmuteLootChestPacket,
} from '../../../../../codex/core/pixelbrain/loot-chest-composition.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(__dirname, '../../../../../codex/core/pixelbrain/scdl/fixtures/loot_chest/loot_chest.scdl');

function loadFixture() {
  return readFileSync(FIXTURE, 'utf8');
}

describe('SCDL Golden — loot_chest', () => {
  it('compiles successfully with stable packet id', () => {
    const source = loadFixture();
    const run1 = compileSCDL(source);
    const run2 = compileSCDL(source);
    expect(run1.ok).toBe(true);
    expect(run1.packet.id).toBe(run2.packet.id);
    expect(run1.ast.asset).toBe('loot_chest');
    expect(run1.ast.canvas).toEqual({ width: 40, height: 28 });
    expect(run1.framePackets.length).toBe(5);
    expect(run1.frameLoop.frames.map((frame) => frame.label)).toEqual([
      'rest',
      'latch-pop',
      'lid-crack',
      'lid-open',
      'loot-burst',
    ]);
  });

  it('exports png for source and transmuted tiers', () => {
    const result = compileSCDL(loadFixture());
    const sourcePng = exportSCDL(result.packet, ['png'], result.ast);
    expect(sourcePng.png.ok).toBe(true);

    const rarePacket = transmuteLootChestPacket(result.packet, LOOT_CHEST_TIERS.RARE);
    const rarePng = exportSCDL(rarePacket, ['png'], result.ast);
    expect(rarePng.png.ok).toBe(true);
    expect(rarePng.png.output).not.toEqual(sourcePng.png.output);
  });
});