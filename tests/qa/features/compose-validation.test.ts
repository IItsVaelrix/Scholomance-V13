/**
 * Tests for Composed Component Architecture - Validation Layer
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationEngine,
  accessibleNameRule,
  keyboardInteractionRule,
  uniqueIdsRule,
  validDimensionsRule,
  createValidationEngine,
  validateComponent,
  validateScene
} from '../../../src/core/compose/validate';
import type { ComponentSchema } from '../../../src/core/compose/schema/ComponentSchema';
import type { SceneGraph } from '../../../src/core/compose/scene';

describe('Compose Validation Layer', () => {
  describe('ValidationEngine', () => {
    it('should register and run rules', () => {
      const engine = new ValidationEngine();
      
      engine.registerRule({
        id: 'test:rule',
        name: 'Test Rule',
        description: 'A test rule',
        category: 'structure',
        severity: 'error',
        validate: () => []
      });

      const result = engine.validate({});
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should collect issues from rules', () => {
      const engine = new ValidationEngine();
      
      engine.registerRule({
        id: 'test:rule',
        name: 'Test Rule',
        description: 'A test rule',
        category: 'structure',
        severity: 'error',
        validate: () => [{
          id: 'issue-1',
          severity: 'error',
          category: 'structure',
          message: 'Test issue'
        }]
      });

      const result = engine.validate({});
      expect(result.passed).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].message).toBe('Test issue');
    });

    it('should pass when only warnings exist', () => {
      const engine = new ValidationEngine();
      
      engine.registerRule({
        id: 'test:rule',
        name: 'Test Rule',
        description: 'A test rule',
        category: 'structure',
        severity: 'warning',
        validate: () => [{
          id: 'issue-1',
          severity: 'warning',
          category: 'structure',
          message: 'Test warning'
        }]
      });

      const result = engine.validate({});
      expect(result.passed).toBe(true); // Warnings don't fail validation
      expect(result.issues).toHaveLength(1);
    });

    it('should measure validation duration', () => {
      const engine = new ValidationEngine();
      const result = engine.validate({});
      
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeGreaterThan(0);
    });
  });

  describe('accessibleNameRule', () => {
    it('should pass for component with label', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Button',
        role: 'button',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true,
          label: 'Click me'
        }
      };

      const issues = accessibleNameRule.validate({ schema });
      expect(issues).toHaveLength(0);
    });

    it('should pass for component with aria-label', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Button',
        role: 'button',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true
        },
        accessibility: {
          ariaAttributes: ['aria-label']
        }
      };

      const issues = accessibleNameRule.validate({ schema });
      expect(issues).toHaveLength(0);
    });

    it('should fail for interactive component without accessible name', () => {
      const schema: ComponentSchema = {
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

      const issues = accessibleNameRule.validate({ schema });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
      expect(issues[0].category).toBe('accessibility');
      expect(issues[0].wcag).toBe('4.1.2');
    });

    it('should pass for non-interactive component without label', () => {
      const schema: ComponentSchema = {
        id: 'test:container',
        name: 'Container',
        role: 'container',
        anatomy: {
          id: 'root',
          role: 'container',
          interactive: false,
          visible: true
        }
      };

      const issues = accessibleNameRule.validate({ schema });
      expect(issues).toHaveLength(0);
    });
  });

  describe('keyboardInteractionRule', () => {
    it('should pass for component with keyboard support', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Button',
        role: 'button',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true
        },
        accessibility: {
          keyboard: ['Enter: activates']
        }
      };

      const issues = keyboardInteractionRule.validate({ schema });
      expect(issues).toHaveLength(0);
    });

    it('should fail for interactive component without keyboard support', () => {
      const schema: ComponentSchema = {
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

      const issues = keyboardInteractionRule.validate({ schema });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
      expect(issues[0].wcag).toBe('2.1.1');
    });
  });

  describe('uniqueIdsRule', () => {
    it('should pass for scene with unique IDs', () => {
      const scene: SceneGraph = {
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'child1', type: 'rectangle' },
            { id: 'child2', type: 'rectangle' }
          ]
        }
      };

      const issues = uniqueIdsRule.validate({ scene });
      expect(issues).toHaveLength(0);
    });

    it('should fail for scene with duplicate IDs', () => {
      const scene: SceneGraph = {
        root: {
          id: 'root',
          type: 'container',
          children: [
            { id: 'duplicate', type: 'rectangle' },
            { id: 'duplicate', type: 'rectangle' }
          ]
        }
      };

      const issues = uniqueIdsRule.validate({ scene });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('error');
      expect(issues[0].message).toContain('Duplicate node ID');
    });
  });

  describe('validDimensionsRule', () => {
    it('should pass for scene with valid dimensions', () => {
      const scene: SceneGraph = {
        root: {
          id: 'root',
          type: 'container',
          width: 400,
          height: 200,
          children: [
            { id: 'child1', type: 'rectangle', width: 100, height: 50 }
          ]
        }
      };

      const issues = validDimensionsRule.validate({ scene });
      expect(issues).toHaveLength(0);
    });

    it('should warn for negative dimensions', () => {
      const scene: SceneGraph = {
        root: {
          id: 'root',
          type: 'container',
          width: -100,
          height: 200
        }
      };

      const issues = validDimensionsRule.validate({ scene });
      expect(issues).toHaveLength(1);
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].message).toContain('negative width');
    });
  });

  describe('createValidationEngine', () => {
    it('should create engine with built-in rules', () => {
      const engine = createValidationEngine();
      const rules = engine.getRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.find(r => r.id === 'compose:accessible-name')).toBeDefined();
      expect(rules.find(r => r.id === 'compose:keyboard-interaction')).toBeDefined();
      expect(rules.find(r => r.id === 'compose:unique-ids')).toBeDefined();
      expect(rules.find(r => r.id === 'compose:valid-dimensions')).toBeDefined();
    });
  });

  describe('validateComponent', () => {
    it('should validate a component schema', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Button',
        role: 'button',
        anatomy: {
          id: 'root',
          role: 'button',
          interactive: true,
          visible: true,
          label: 'Click me'
        },
        accessibility: {
          keyboard: ['Enter: activates']
        }
      };

      const result = validateComponent(schema);
      expect(result.passed).toBe(true);
    });
  });

  describe('validateScene', () => {
    it('should validate a scene graph', () => {
      const scene: SceneGraph = {
        root: {
          id: 'root',
          type: 'container',
          width: 400,
          height: 200,
          children: [
            { id: 'child1', type: 'rectangle', width: 100, height: 50 }
          ]
        }
      };

      const result = validateScene(scene);
      expect(result.passed).toBe(true);
    });
  });
});
