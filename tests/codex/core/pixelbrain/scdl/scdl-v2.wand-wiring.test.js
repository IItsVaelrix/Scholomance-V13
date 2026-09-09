import { describe, expect, it } from 'vitest';
import {
  transpileWandToSCDLV2,
  transpileDivWandToSCDLV2,
  compileWandToSCDLV2,
  quantizeToPixelGrid,
  resolveRoleHexColor,
  WAND_BRIDGE_DIAGNOSTICS,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.wand-bridge.js';
import {
  getAmpManifest,
  getAmpAdapter,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.amp-catalog.js';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';
import { forgeCharacterFromWandVector } from '../../../../../codex/core/pixelbrain/character-foundry.js';
import { forgeMapAsset, FORGE_ASSET_CHOICES } from '../../../../../src/lib/pixelbrain/tileForgeMap.adapter.js';

describe('SCDL V2 Wand & DivWand Wiring and Ironclad Pixel Art Gate', () => {
  describe('Wand AMP Substrate Registration & ABI Verification', () => {
    it('registers pixelbrain.wand-stroke in the global AMP catalog with valid checksum', () => {
      const manifest = getAmpManifest('pixelbrain.wand-stroke');
      expect(manifest).not.toBeNull();
      expect(manifest.contract).toBe('PB-AMP-ABI-v1');
      expect(manifest.execution).toBe('COMPILE');
      expect(manifest.stage).toBe('SHAPE_POST');
      expect(manifest.checksum).toBe('ad8a10682d86776a910bfce40962b64aeeed798dae834d91b0f2bcd4a3e65ce2');

      const adapter = getAmpAdapter('pixelbrain.wand-stroke');
      expect(adapter).not.toBeNull();
      expect(typeof adapter.execute).toBe('function');
    });

    it('executes pixelbrain.wand-stroke adapter cleanly in standalone invocation', () => {
      const adapter = getAmpAdapter('pixelbrain.wand-stroke');
      const inputGeometry = {
        kind: 'PATH',
        cells: [
          { x: 12.4, y: 14.8, emphasis: 0.9 },
          { x: 13.1, y: 15.2, emphasis: 0.8 },
        ],
      };
      const res = adapter.execute({ geometry: inputGeometry }, { pixelArtQuantize: true }, { canvas: { width: 32, height: 32 } });
      expect(res.wandStrokeApplied).toBe(true);
      expect(res.pixelArtQuantized).toBe(true);
      expect(res.cells[0].x).toBe(12);
      expect(res.cells[0].y).toBe(15);
      expect(res.cells[1].x).toBe(13);
      expect(res.cells[1].y).toBe(15);
    });
  });

  describe('Pixel Art Ironclad Quantization Gate', () => {
    it('quantizes all float coordinates to discrete integer grid Z^2', () => {
      expect(quantizeToPixelGrid(0.2, 32)).toBe(0);
      expect(quantizeToPixelGrid(15.7, 32)).toBe(16);
      expect(quantizeToPixelGrid(31.9, 32)).toBe(31);
      expect(quantizeToPixelGrid(-5, 32)).toBe(0);
      expect(quantizeToPixelGrid(100, 32)).toBe(31);
      expect(quantizeToPixelGrid(NaN, 32)).toBe(0);
    });

    it('resolves semantic roles and material hints to canonical Scholomance hex colors', () => {
      expect(resolveRoleHexColor('hair')).toBe('#4A3828');
      expect(resolveRoleHexColor('void')).toBe('#1A1A24');
      expect(resolveRoleHexColor('skin_head')).toBe('#F5D0A9');
      expect(resolveRoleHexColor('sigil_glow')).toBe('#00E5FF');
      expect(resolveRoleHexColor('gold_trim')).toBe('#FFD700');
      expect(resolveRoleHexColor('stroke', 'shadow_fire')).toBe('#7C3AED');
      expect(resolveRoleHexColor('unknown_role')).toBe('#4A90E2');
    });
  });

  describe('Wand Transpiler and End-to-End SCDL V2 Compilation', () => {
    it('compiles mathematical_stroke proposals into valid SCDL V2 packages', () => {
      const proposal = {
        name: 'test_stroke',
        role: 'stroke.mathematical',
        coordinateFormula: {
          type: 'mathematical_stroke',
          parameters: {
            cx: 16,
            cy: 16,
            length: 10,
            angle: 45,
            baseWidth: 3,
            widthVariation: 0.2,
            frequency: 0.4,
            density: 1.2,
            n: 12,
          },
        },
      };

      const transpileRes = transpileWandToSCDLV2(proposal, { canvas: { width: 32, height: 32 } });
      expect(transpileRes.ok).toBe(true);
      expect(transpileRes.scdlSource).toContain('SCDL 2');
      expect(transpileRes.scdlSource).toContain('pixelbrain.wand-stroke');
      expect(transpileRes.scdlSource).toContain('CANVAS WIDTH 32 HEIGHT 32');

      const compileRes = compileWandToSCDLV2(proposal, { canvas: { width: 32, height: 32 } });
      expect(compileRes.ok).toBe(true);
      expect(compileRes.bytecode.contract).toBe('SCDL-BC-v2');
      expect(compileRes.package.contract).toBe('SCDL-PACKAGE-v2');
      expect(compileRes.packet.kind).toBe('pixelbrain.asset.v1');
      expect(compileRes.packet.geometry.coordinates.length).toBeGreaterThan(0);

      // Verify every coordinate is a discrete integer (zero fractional subpixels)
      for (const c of compileRes.packet.geometry.coordinates) {
        expect(Number.isInteger(c.x)).toBe(true);
        expect(Number.isInteger(c.y)).toBe(true);
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(32);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeLessThan(32);
      }
    });

    it('compiles composite multi-part proposals with roles and anchors', () => {
      const proposal = {
        name: 'chibi_spellcaster',
        coordinateFormula: {
          type: 'composite',
          children: [
            {
              role: 'head',
              material: 'skin_light',
              formula: {
                type: 'edge_trace',
                tracePath: [
                  { x: 12, y: 6 }, { x: 20, y: 4 }, { x: 28, y: 6 },
                  { x: 30, y: 14 }, { x: 28, y: 20 }, { x: 20, y: 22 },
                  { x: 12, y: 20 }, { x: 10, y: 14 },
                ],
              },
            },
            {
              role: 'body_stroke',
              material: 'void',
              formula: {
                type: 'mathematical_stroke',
                parameters: {
                  cx: 20, cy: 26, length: 12, angle: 90,
                  baseWidth: 4, widthVariation: 0.2, frequency: 0.3,
                  density: 1.5, n: 16,
                },
              },
            },
          ],
        },
      };

      const compileRes = compileWandToSCDLV2(proposal, { canvas: { width: 40, height: 40 } });
      expect(compileRes.ok).toBe(true);
      expect(compileRes.bytecode.programId).toMatch(/^scdlbc_/);
      expect(compileRes.packet.id).toMatch(/^pbasset_/);
      expect(compileRes.packet.geometry.layerSurfaces.length).toBe(2);
      expect(compileRes.roles).toContain('head');
      expect(compileRes.roles).toContain('body_stroke');
    });

    it('is strictly deterministic across repeated compilations of identical proposals', () => {
      const proposal = {
        coordinateFormula: {
          type: 'fibonacci',
          parameters: { iterations: 5, scale: 0.8 },
        },
      };

      const resA = compileWandToSCDLV2(proposal, { canvas: { width: 32, height: 32 } });
      const resB = compileWandToSCDLV2(proposal, { canvas: { width: 32, height: 32 } });

      expect(resA.ok).toBe(true);
      expect(resB.ok).toBe(true);
      expect(resA.bytecode.programId).toBe(resB.bytecode.programId);
      expect(resA.packet.geometry.coordinates).toEqual(resB.packet.geometry.coordinates);
    });
  });

  describe('DivWand Layout to SCDL V2 Frame Compilation', () => {
    it('transpiles and compiles DivWand layout trees into pixel-perfect UI frame assets', () => {
      const divwandNode = {
        id: 'hud_inventory',
        type: 'container',
        role: 'hud_dock',
        width: 64,
        height: 48,
        children: [
          { id: 'header_bar', type: 'element', width: 56, height: 8, x: 4, y: 4 },
          { id: 'action_btn', type: 'button', width: 24, height: 12, x: 20, y: 28 },
        ],
      };

      const res = compileWandToSCDLV2(divwandNode);
      expect(res.ok).toBe(true);
      expect(res.bytecode.contract).toBe('SCDL-BC-v2');
      expect(res.package.contract).toBe('SCDL-PACKAGE-v2');
      expect(res.packet.geometry.layerSurfaces.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Fail-Closed Never-Throws Compiler Contract', () => {
    it('returns structured diagnostics for null or empty proposals without throwing', () => {
      const nullRes = compileWandToSCDLV2(null);
      expect(nullRes.ok).toBe(false);
      expect(nullRes.diagnostics.length).toBeGreaterThan(0);
      expect(nullRes.diagnostics[0].code).toBe(WAND_BRIDGE_DIAGNOSTICS.INVALID_PROPOSAL);

      const emptyRes = compileWandToSCDLV2({});
      expect(emptyRes.ok).toBe(false);
      expect(emptyRes.diagnostics.length).toBeGreaterThan(0);
      expect(emptyRes.diagnostics[0].code).toBe(WAND_BRIDGE_DIAGNOSTICS.EVALUATION_EMPTY);
    });
  });

  describe('Character Foundry & Tile Forge Integration', () => {
    it('forgeCharacterFromWandVector includes compiled SCDL V2 package and bytecode', () => {
      const wandProposal = {
        coordinateFormula: {
          type: 'composite',
          children: [
            {
              role: 'head',
              formula: {
                type: 'edge_trace',
                tracePath: [
                  { x: 14, y: 6 }, { x: 24, y: 4 }, { x: 34, y: 6 },
                  { x: 36, y: 14 }, { x: 34, y: 22 }, { x: 24, y: 24 },
                  { x: 14, y: 22 }, { x: 12, y: 14 },
                ],
              },
            },
            {
              role: 'body',
              formula: {
                type: 'mathematical_stroke',
                parameters: {
                  cx: 24, cy: 30, length: 14, angle: 90,
                  baseWidth: 6, widthVariation: 0.2, frequency: 0.3,
                  density: 1.5, n: 16,
                },
              },
            },
          ],
        },
      };

      const character = forgeCharacterFromWandVector(wandProposal, {
        id: 'vaelrix_wand_model',
        canvas: { width: 48, height: 48 },
      });

      expect(character.vectorSource).toBe('wand');
      expect(character.vectorPaths.length).toBeGreaterThan(0);
      expect(character.scdlOk).toBe(true);
      expect(typeof character.scdlSource).toBe('string');
      expect(character.scdlBytecode.contract).toBe('SCDL-BC-v2');
      expect(character.scdlPacket.kind).toBe('pixelbrain.asset.v1');
    });

    it('Tile Forge forgeMapAsset exposes and generates Wand-driven procedural assets with SCD128 governance', () => {
      const wandChoices = FORGE_ASSET_CHOICES.filter((c) => c.family === 'wand');
      expect(wandChoices.length).toBe(3);
      expect(wandChoices.map((c) => c.id)).toContain('wand_sigil_stone');
      expect(wandChoices.map((c) => c.id)).toContain('wand_foliage_tuft');
      expect(wandChoices.map((c) => c.id)).toContain('wand_spiral_core');

      const sigilAsset = forgeMapAsset({ type: 'wand_sigil_stone', biome: 'void_forest', seed: 42 });
      expect(sigilAsset.id).toMatch(/^asset-[a-f0-9]{64}$/);
      expect(sigilAsset.kind).toBe('prop');
      expect(sigilAsset.width).toBe(48);
      expect(sigilAsset.height).toBe(48);
      expect(sigilAsset.scd128Record).toBeDefined();
      expect(sigilAsset.scd128Record.scd128Wire.length).toBe(128);
      expect(sigilAsset.rgba.length).toBe(48 * 48 * 8);
    });
  });
});
