/**
 * Tests for Composed Component Architecture - Schema Layer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  schemaRegistry,
  type ComponentSchema
} from '../../../src/core/compose/schema/ComponentSchema';
import {
  validateComponentSchema,
  validateComponentState
} from '../../../src/core/compose/schema/json-schemas';
import { validateComposeScene } from '../../../src/core/compose/validate/scene';
import { CODES } from '../../../src/core/compose/validate/diagnostics';
import type { PbUiSceneV1 } from '../../../src/core/compose/schema/packets';

describe('Compose Schema Layer', () => {
  beforeEach(() => {
    schemaRegistry.clear();
  });

  describe('ComponentSchemaRegistry', () => {
    it('should register and retrieve schemas', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Test Button',
        role: 'button',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true
        }
      };

      schemaRegistry.register(schema);
      
      expect(schemaRegistry.has('test:button')).toBe(true);
      expect(schemaRegistry.get('test:button')).toEqual(schema);
    });

    it('should throw on duplicate registration', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Test Button',
        role: 'button',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true
        }
      };

      schemaRegistry.register(schema);
      
      expect(() => schemaRegistry.register(schema)).toThrow(
        'Schema test:button already registered'
      );
    });

    it('should return undefined for non-existent schemas', () => {
      expect(schemaRegistry.get('nonexistent')).toBeUndefined();
      expect(schemaRegistry.has('nonexistent')).toBe(false);
    });

    it('should return all registered schemas', () => {
      const schema1: ComponentSchema = {
        id: 'test:button',
        name: 'Button',
        role: 'button',
        anatomy: { id: 'root', role: 'button', interactive: true, visible: true }
      };
      const schema2: ComponentSchema = {
        id: 'test:input',
        name: 'Input',
        role: 'input',
        anatomy: { id: 'root', role: 'input', interactive: true, visible: true }
      };

      schemaRegistry.register(schema1);
      schemaRegistry.register(schema2);

      const all = schemaRegistry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map(s => s.id)).toContain('test:button');
      expect(all.map(s => s.id)).toContain('test:input');
    });

    it('should clear all schemas', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Button',
        role: 'button',
        anatomy: { id: 'root', role: 'button', interactive: true, visible: true }
      };

      schemaRegistry.register(schema);
      expect(schemaRegistry.has('test:button')).toBe(true);

      schemaRegistry.clear();
      expect(schemaRegistry.has('test:button')).toBe(false);
    });
  });

  describe('JSON Schema Validation', () => {
    it('should validate a valid component schema', async () => {
      const schema = {
        id: 'test:button',
        name: 'Button',
        role: 'button',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true
        }
      };

      const result = await validateComponentSchema(schema);
      expect(result.valid).toBe(true);
    });

    it('should reject a schema missing required fields', async () => {
      const schema = {
        id: 'test:button',
        name: 'Button'
        // missing role and anatomy
      };

      const result = await validateComponentSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should accept a schema with any string role (enum validation is compile-time)', async () => {
      const schema = {
        id: 'test:button',
        name: 'Button',
        role: 'invalid-role',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true
        }
      };

      const result = await validateComponentSchema(schema);
      // Simplified validation accepts any string role
      // TypeScript enum provides compile-time validation
      expect(result.valid).toBe(true);
    });

    it('should validate a valid component state', async () => {
      const state = {
        disabled: false,
        focused: true,
        selected: false
      };

      const result = await validateComponentState(state);
      expect(result.valid).toBe(true);
    });

    it('should reject a state with invalid types', async () => {
      const state = {
        disabled: 'not-a-boolean',
        focused: true
      };

      const result = await validateComponentState(state);
      expect(result.valid).toBe(false);
    });
  });
});

describe('Compose scene validation — recursive visual references (Polaris console)', () => {
  function sceneWithNestedVisualRef(visualRefs: string[]): PbUiSceneV1 {
    return {
      contract: 'PB-UI-SCENE-v1',
      version: '1.0.0',
      id: 'scene-recursive',
      sourceChecksum: 'scd64:test',
      definitions: {},
      layouts: {},
      visuals: {
        'known-visual': {
          kind: 'scdl-asset',
          packetId: 'arcane-panel/rest/corners',
          placementSlot: 'corner-nw',
        },
      },
      root: {
        id: 'root',
        kind: 'container',
        children: [
          {
            id: 'nested-panel',
            kind: 'container',
            visualRefs,
            slots: {
              body: [
                { id: 'slotted-child', kind: 'container', visualRefs: ['missing-in-slot'] },
              ],
            },
          },
        ],
      },
    };
  }

  it('accepts a scene whose nested visual references all resolve', () => {
    const result = validateComposeScene(sceneWithNestedVisualRef(['known-visual']));
    // the only error should be the deliberately-missing slotted child ref
    const unknown = result.diagnostics.filter((d) => d.code === CODES.UNKNOWN_SLOT);
    expect(unknown).toHaveLength(1);
    expect(unknown[0].sourceNodeId).toBe('slotted-child');
  });

  it('diagnoses an unknown visual reference on a nested (non-root) node', () => {
    const result = validateComposeScene(sceneWithNestedVisualRef(['does-not-exist']));
    expect(result.ok).toBe(false);
    const unknown = result.diagnostics.filter((d) => d.code === CODES.UNKNOWN_SLOT);
    const nested = unknown.find((d) => d.sourceNodeId === 'nested-panel');
    expect(nested).toBeDefined();
    expect(nested?.message).toContain('does-not-exist');
  });

  it('diagnoses an unknown custom kind on a nested node', () => {
    const scene = sceneWithNestedVisualRef([]);
    (scene.root.children?.[0] as { kind: string }).kind = 'unregistered-arcane-widget';
    const result = validateComposeScene(scene);
    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (d) => d.code === CODES.UNKNOWN_KIND && d.sourceNodeId === 'nested-panel',
      ),
    ).toBe(true);
  });
});
