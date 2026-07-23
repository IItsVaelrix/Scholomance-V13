/**
 * Integration Tests for Composed Component Architecture
 * 
 * Tests the full pipeline: schema → behavior → layout → render → validate
 * 
 * FIX: These tests verify that all layers work together correctly.
 * Previously, each layer was tested in isolation but never as a pipeline.
 * 
 * @module compose-integration
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createComponentDefinition, CANONICAL_CONTRACTS, validateContractVersion } from '../../../src/core/compose/schema/contracts';
import { createBehaviorService, createButtonMachine, BehaviorService } from '../../../src/core/compose/behavior';
import { LayoutEngine, CSSLoweringEngine, type LayoutNode } from '../../../src/core/compose/layout';
import { QbitLatticeGrid, createLatticeForLayout, layoutSeedsFromNodes } from '../../../src/core/compose/layout/qbit-lattice';
import { TokenResolver, DEFAULT_TOKENS_DTCG, isDTCGToken, legacyToDTCG, dictionaryToDTCG } from '../../../src/core/compose/tokens';
import { ValidationEngine } from '../../../src/core/compose/validate';
import { FeatureFlagManager } from '../../../src/core/compose/flags';
import { MigrationRegistry, createMigration } from '../../../src/core/compose/migration';
import type { ComponentSchema } from '../../../src/core/compose/schema/ComponentSchema';

describe('Compose Integration - Full Pipeline', () => {
  let buttonSchema: ComponentSchema;

  beforeEach(() => {
    buttonSchema = {
      id: 'test:button',
      name: 'Test Button',
      role: 'button',
      anatomy: {
        id: 'root',
        role: 'button',
        interactive: true,
        visible: true,
      },
    };
  });

  describe('Schema → Behavior → Layout → Validate pipeline', () => {
    it('should process a button through the full pipeline', () => {
      // 1. Schema: Create a versioned component definition
      const definition = createComponentDefinition(buttonSchema);
      expect(definition.__contract).toBe('SCHOL-COMPONENT-DEFINITION-v1');

      // 2. Validate contract version
      const contractCheck = validateContractVersion(definition);
      expect(contractCheck.valid).toBe(true);

      // 3. Behavior: Create a behavior service
      const behavior = createBehaviorService(buttonSchema);
      expect(behavior).toBeInstanceOf(BehaviorService);
      expect(behavior.getState().disabled).toBe(false);

      // 4. Send events through the behavior machine
      behavior.send({ type: 'focus' });
      expect(behavior.getState().focused).toBe(true);

      behavior.send({ type: 'pointerdown' });
      expect(behavior.getState().pressed).toBe(true);

      behavior.send({ type: 'pointerup' });
      expect(behavior.getState().pressed).toBe(false);

      // 5. Layout: Compute layout for the button
      const layoutEngine = new LayoutEngine();
      const layoutRoot: LayoutNode = {
        id: 'button-container',
        intent: { algorithm: 'flex', direction: 'row', gap: 8, padding: 16 },
        children: [
          { id: 'button', intent: { algorithm: 'block' } },
        ],
      };

      const layoutResult = layoutEngine.compute(layoutRoot, 400, 200);
      expect(layoutResult.success).toBe(true);
      expect(layoutResult.root.width).toBe(400);
      expect(layoutResult.root.height).toBe(200);

      // 6. CSS Lowering: Convert layout to CSS
      expect(layoutResult.css).toBeDefined();
      expect(layoutResult.css!.size).toBeGreaterThan(0);
      
      const containerCSS = layoutResult.css!.get('button-container');
      expect(containerCSS).toBeDefined();
      expect(containerCSS!.display).toBe('flex');
      expect(containerCSS!.flexDirection).toBe('row');
      expect(containerCSS!.gap).toBe('8px');
      expect(containerCSS!.padding).toBe('16px');

      // 7. QBIT Lattice: Build coordinate grid
      expect(layoutResult.lattice).toBeDefined();
      expect(layoutResult.lattice).toBeInstanceOf(QbitLatticeGrid);
      expect(layoutResult.lattice!.width).toBeGreaterThan(0);
      expect(layoutResult.lattice!.height).toBeGreaterThan(0);

      // 8. Validate: Check accessibility
      const validator = new ValidationEngine();
      const validationResult = validator.validate(
        { role: 'button', 'aria-label': 'Test' } as unknown as HTMLElement,
        buttonSchema
      );
      expect(validationResult).toBeDefined();
    });

    it('should maintain canonical contract through the pipeline', () => {
      const definition = createComponentDefinition(buttonSchema);
      
      // Contract should be present and correct
      expect(definition.__contract).toBe('SCHOL-COMPONENT-DEFINITION-v1');
      
      // Should be a known canonical contract
      expect('SCHOL-COMPONENT-DEFINITION-v1' in CANONICAL_CONTRACTS).toBe(true);
    });
  });

  describe('QBIT Lattice Integration', () => {
    it('should build a lattice grid from layout nodes', () => {
      const grid = createLatticeForLayout(400, 200, 8);
      expect(grid.width).toBe(50); // 400 / 8
      expect(grid.height).toBe(25); // 200 / 8

      // Create seeds from layout nodes (cellSize=8 to convert pixel→lattice coords)
      const seeds = layoutSeedsFromNodes([
        { id: 'btn1', x: 10, y: 10, width: 100, height: 40, interactive: true },
        { id: 'btn2', x: 200, y: 10, width: 100, height: 40, interactive: true, focused: true },
      ], 8);

      expect(seeds).toHaveLength(2);
      expect(seeds[1].energy).toBe(1.0); // Focused = max energy
      expect(seeds[0].energy).toBe(0.7); // Interactive = high energy

      // Propagate energy
      grid.propagate(seeds);

      // Check that energy was propagated
      const focusedSeed = seeds[1];
      const energyAtFocus = grid.energyAt(focusedSeed.coord);
      expect(energyAtFocus).toBeGreaterThan(0);

      // Check material assignment
      const materialAtFocus = grid.materialAt(focusedSeed.coord);
      expect(materialAtFocus).toBeGreaterThan(0);
    });

    it('should compute gradients for spatial relationships', () => {
      const grid = new QbitLatticeGrid(20, 20, 1);
      
      // Single seed in the center
      grid.propagate([{
        coord: { x: 10, y: 10, z: 0 },
        energy: 1.0,
        radius: 8,
        attenuation: 'gaussian',
      }]);

      // Gradient should point toward the seed
      const gradient = grid.gradientAt({ x: 5, y: 10, z: 0 });
      expect(gradient.gx).toBeGreaterThan(0); // Energy increases toward center
    });

    it('should convert between lattice and pixel coordinates', () => {
      const grid = new QbitLatticeGrid(50, 25, 1);
      
      const pixel = grid.toPixelCoord({ x: 25, y: 12, z: 0 }, 400, 200);
      expect(pixel.px).toBe(200); // 25 * (400/50)
      expect(pixel.py).toBe(96);  // 12 * (200/25)

      const lattice = grid.fromPixelCoord(200, 96, 400, 200);
      expect(lattice.x).toBe(25);
      expect(lattice.y).toBe(12);
    });
  });

  describe('CSS Lowering Integration', () => {
    it('should lower flex layout to CSS', () => {
      const lowering = new CSSLoweringEngine('relative');
      const engine = new LayoutEngine();
      
      const root: LayoutNode = {
        id: 'container',
        intent: { algorithm: 'flex', direction: 'row', justify: 'between', align: 'center', gap: 16 },
        children: [
          { id: 'left', intent: { algorithm: 'block' } },
          { id: 'right', intent: { algorithm: 'block' } },
        ],
      };

      const result = engine.compute(root, 800, 100);
      const css = engine.getAllCSS(result);

      expect(css['container'].display).toBe('flex');
      expect(css['container'].flexDirection).toBe('row');
      expect(css['container'].justifyContent).toBe('space-between');
      expect(css['container'].alignItems).toBe('center');
      expect(css['container'].gap).toBe('16px');
    });

    it('should lower grid layout to CSS', () => {
      const engine = new LayoutEngine();
      
      const root: LayoutNode = {
        id: 'grid',
        intent: { algorithm: 'grid', columns: '3' },
        children: [
          { id: 'cell1', intent: { algorithm: 'block' } },
          { id: 'cell2', intent: { algorithm: 'block' } },
          { id: 'cell3', intent: { algorithm: 'block' } },
        ],
      };

      const result = engine.compute(root, 600, 300);
      const css = engine.getAllCSS(result);

      expect(css['grid'].display).toBe('grid');
      expect(css['grid'].gridTemplateColumns).toBe('repeat(3, 1fr)');
    });

    it('should support absolute positioning strategy', () => {
      const lowering = new CSSLoweringEngine('absolute');
      const engine = new LayoutEngine();
      
      const root: LayoutNode = {
        id: 'root',
        intent: { algorithm: 'flex', direction: 'row' },
        children: [
          { id: 'child', intent: { algorithm: 'block' } },
        ],
      };

      const result = engine.compute(root, 400, 200);
      const cssMap = lowering.lower(result);
      
      const childCSS = cssMap.get('child');
      expect(childCSS).toBeDefined();
      expect(childCSS!.position).toBe('absolute');
    });
  });

  describe('DTCG Token Integration', () => {
    it('should resolve DTCG tokens', () => {
      const resolver = new TokenResolver(DEFAULT_TOKENS_DTCG);
      
      const primary500 = resolver.resolve('{color.primary.500}');
      expect(primary500).toBe('#3b82f6');

      const spacingMd = resolver.resolve('{spacing.md}');
      expect(spacingMd).toBe('16px');
    });

    it('should detect DTCG format automatically', () => {
      const resolver = new TokenResolver(DEFAULT_TOKENS_DTCG);
      const all = resolver.resolveAll();
      
      expect(Object.keys(all).length).toBeGreaterThan(0);
      expect(all['color.primary.500']).toBe('#3b82f6');
    });

    it('should convert between legacy and DTCG formats', () => {
      const legacyDict = {
        color: {
          primary: {
            value: '#3b82f6',
            type: 'color' as const,
            description: 'Primary color',
          },
        },
      };

      const dtcg = dictionaryToDTCG(legacyDict);
      expect(isDTCGToken(dtcg.color.primary)).toBe(true);
      expect((dtcg.color.primary as any).$value).toBe('#3b82f6');
    });
  });

  describe('Feature Flag + Migration Integration', () => {
    it('should gate component migration behind feature flags', () => {
      const flags = new FeatureFlagManager();
      
      // Initially disabled
      expect(flags.isEnabled('compose:enabled')).toBe(false);
      expect(flags.isComponentMigrated('button')).toBe(false);

      // Enable master switch
      flags.setFlag('compose:enabled', true);
      expect(flags.isEnabled('compose:shadow-mode')).toBe(false);

      // Enable button migration
      flags.setFlag('compose:migrate:button', true);
      expect(flags.isComponentMigrated('button')).toBe(true);
      expect(flags.isComponentMigrated('checkbox')).toBe(false);

      // Check progress
      const progress = flags.getMigrationProgress();
      expect(progress.migrated).toBe(1);
      expect(progress.total).toBe(13);
    });

    it('should track migration dependencies', () => {
      const registry = new MigrationRegistry();

      // Register components with dependencies
      registry.register('button', []);
      registry.register('tabs', ['button']); // Tabs depends on button
      registry.register('dialog', ['button']);

      // Button can migrate first (no deps)
      expect(registry.canMigrate('button')).toBe(true);
      expect(registry.canMigrate('tabs')).toBe(false); // Button not migrated yet

      // Migrate button
      registry.updatePhase('button', 'migrated');

      // Now tabs can migrate
      expect(registry.canMigrate('tabs')).toBe(true);
      expect(registry.canMigrate('dialog')).toBe(true);
    });

    it('should detect circular dependencies', () => {
      const registry = new MigrationRegistry();

      registry.register('a', ['b']);
      registry.register('b', ['c']);
      registry.register('c', ['a']); // Circular!

      const cycles = registry.detectCircularDependencies();
      expect(cycles.length).toBeGreaterThan(0);
    });

    it('should compute correct migration order', () => {
      const registry = new MigrationRegistry();

      registry.register('button', []);
      registry.register('checkbox', []);
      registry.register('tabs', ['button']);
      registry.register('dialog', ['button', 'checkbox']);

      const order = registry.getMigrationOrder();
      
      // Button and checkbox should come before tabs and dialog
      const buttonIdx = order.indexOf('button');
      const checkboxIdx = order.indexOf('checkbox');
      const tabsIdx = order.indexOf('tabs');
      const dialogIdx = order.indexOf('dialog');

      expect(buttonIdx).toBeLessThan(tabsIdx);
      expect(buttonIdx).toBeLessThan(dialogIdx);
      expect(checkboxIdx).toBeLessThan(dialogIdx);
    });
  });

  describe('Cross-layer Error Handling', () => {
    it('should handle invalid events gracefully', () => {
      const behavior = createBehaviorService(buttonSchema);
      
      // Invalid event should be rejected with a warning (not throw)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      behavior.send({ type: 'invalid_event' });
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();

      // State should be unchanged
      expect(behavior.getState().focused).toBe(false);
    });

    it('should handle missing token references', () => {
      const resolver = new TokenResolver(DEFAULT_TOKENS_DTCG);
      
      expect(() => resolver.resolve('{nonexistent.token}')).toThrow(
        'Token reference not found'
      );
    });

    it('should handle empty layout trees', () => {
      const engine = new LayoutEngine();
      const root: LayoutNode = {
        id: 'empty',
        intent: { algorithm: 'flex' },
      };

      const result = engine.compute(root, 400, 200);
      expect(result.success).toBe(true);
      expect(result.root.width).toBe(400);
    });
  });
});
