import { describe, it, expect } from 'vitest';
import { compileCharacterModel } from '../../../src/game/tutorial-forest/scdl/scdlCharacterCompiler.js';
import { compileSCDLV2 } from '../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import {
  ANCIENT_WAYMARKER_SCDL_V2,
  MOSSY_BOULDER_SCDL_V2,
} from '../../../src/game/tutorial-forest/scdl/forestProps.scdl.js';

describe('Tutorial Forest — SCDL V2 Character & Prop Compilation', () => {
  it('compiles original Lotus Wanderer character model from SCDL V2 source', () => {
    const pkg = compileCharacterModel();
    expect(pkg.contract).toBe('SCDL-V2-CHARACTER-PACKAGE');
    expect(pkg.assetId).toBe('lotus_wanderer');
    expect(pkg.canvas).toEqual({ width: 32, height: 48 });
    expect(pkg.scdlResult.ok).toBe(true);

    const coords = pkg.scdlResult.packet.geometry.coordinates;
    expect(coords.length).toBeGreaterThan(400);

    // Verify discrete integer pixel cells (Anti-Vector Invariant)
    for (const c of coords) {
      expect(Number.isInteger(c.x)).toBe(true);
      expect(Number.isInteger(c.y)).toBe(true);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(32);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(48);
      expect(typeof c.color).toBe('string');
      expect(/^#[0-9a-fA-F]{6}$/.test(c.color)).toBe(true);
    }
  });

  it('synthesizes all 6 animation frames for idle and walk cycles', () => {
    const pkg = compileCharacterModel();
    expect(pkg.frames.idle_0).toBeDefined();
    expect(pkg.frames.idle_1).toBeDefined();
    expect(pkg.frames.walk_0).toBeDefined();
    expect(pkg.frames.walk_1).toBeDefined();
    expect(pkg.frames.walk_2).toBeDefined();
    expect(pkg.frames.walk_3).toBeDefined();

    expect(pkg.frames.idle_0.length).toBe(pkg.frames.idle_1.length);
  });

  it('compiles Ancient Waymarker and Mossy Boulder environmental props in SCDL V2', () => {
    const waymarker = compileSCDLV2(ANCIENT_WAYMARKER_SCDL_V2);
    expect(waymarker.ok).toBe(true);
    expect(waymarker.packet.geometry.coordinates.length).toBeGreaterThan(300);

    const boulder = compileSCDLV2(MOSSY_BOULDER_SCDL_V2);
    expect(boulder.ok).toBe(true);
    expect(boulder.packet.geometry.coordinates.length).toBeGreaterThan(200);
  });
});
