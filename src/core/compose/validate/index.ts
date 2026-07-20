/**
 * Validation Layer - axe-core + Playwright + compiler rules
 * 
 * Accessibility, visual snapshots, structural invariants, and regression checks.
 * 
 * @module compose/validate
 */

import type { ComponentSchema, ComponentInstance } from '../schema/ComponentSchema';
import type { SceneGraph, SceneNode } from '../scene';

/**
 * Validation severity
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Validation issue - a problem found during validation
 */
export type ValidationIssue = {
  /** Unique issue identifier */
  id: string;
  /** Issue severity */
  severity: ValidationSeverity;
  /** Issue category */
  category: 'accessibility' | 'structure' | 'visual' | 'performance' | 'contract';
  /** Human-readable message */
  message: string;
  /** Affected element ID */
  elementId?: string;
  /** Suggested fix */
  suggestion?: string;
  /** WCAG criterion (for accessibility issues) */
  wcag?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
};

/**
 * Validation result - outcome of a validation run
 */
export type ValidationResult = {
  /** Whether validation passed (no errors) */
  passed: boolean;
  /** All issues found */
  issues: ValidationIssue[];
  /** Validation timestamp */
  timestamp: number;
  /** Validation duration (ms) */
  duration: number;
};

/**
 * Validation rule - a single validation check
 */
export type ValidationRule = {
  /** Rule identifier */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Rule category */
  category: ValidationIssue['category'];
  /** Default severity */
  severity: ValidationSeverity;
  /** Validation function */
  validate: (context: ValidationContext) => ValidationIssue[];
};

/**
 * Validation context - data available to validation rules
 */
export type ValidationContext = {
  /** Component schema being validated */
  schema?: ComponentSchema;
  /** Component instance being validated */
  instance?: ComponentInstance;
  /** Scene graph being validated */
  scene?: SceneGraph;
  /** DOM element (for DOM-based validation) */
  element?: HTMLElement;
  /** Custom data */
  data?: Record<string, unknown>;
};

/**
 * Validation engine - runs validation rules
 */
export class ValidationEngine {
  private rules: ValidationRule[] = [];

  /**
   * Register a validation rule
   */
  registerRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  /**
   * Run all validation rules
   */
  validate(context: ValidationContext): ValidationResult {
    const start = performance.now();
    const issues: ValidationIssue[] = [];

    for (const rule of this.rules) {
      const ruleIssues = rule.validate(context);
      issues.push(...ruleIssues);
    }

    const duration = performance.now() - start;
    const passed = !issues.some(i => i.severity === 'error');

    return {
      passed,
      issues,
      timestamp: Date.now(),
      duration
    };
  }

  /**
   * Get all registered rules
   */
  getRules(): ValidationRule[] {
    return [...this.rules];
  }
}

/**
 * Built-in validation rules
 */

/**
 * Rule: Component must have accessible name
 */
export const accessibleNameRule: ValidationRule = {
  id: 'compose:accessible-name',
  name: 'Accessible Name',
  description: 'Interactive components must have an accessible name',
  category: 'accessibility',
  severity: 'error',
  validate: (ctx) => {
    const issues: ValidationIssue[] = [];
    
    if (ctx.schema && ctx.schema.anatomy.interactive) {
      const hasLabel = ctx.schema.anatomy.label || 
                       ctx.schema.accessibility?.ariaAttributes?.includes('aria-label');
      
      if (!hasLabel) {
        issues.push({
          id: 'compose:accessible-name-1',
          severity: 'error',
          category: 'accessibility',
          message: `Component ${ctx.schema.id} is interactive but has no accessible name`,
          elementId: ctx.schema.id,
          suggestion: 'Add a label or aria-label attribute',
          wcag: '4.1.2'
        });
      }
    }
    
    return issues;
  }
};

/**
 * Rule: Component must support keyboard interaction
 */
export const keyboardInteractionRule: ValidationRule = {
  id: 'compose:keyboard-interaction',
  name: 'Keyboard Interaction',
  description: 'Interactive components must support keyboard interaction',
  category: 'accessibility',
  severity: 'error',
  validate: (ctx) => {
    const issues: ValidationIssue[] = [];
    
    if (ctx.schema && ctx.schema.anatomy.interactive) {
      const hasKeyboard = ctx.schema.accessibility?.keyboard && 
                          ctx.schema.accessibility.keyboard.length > 0;
      
      if (!hasKeyboard) {
        issues.push({
          id: 'compose:keyboard-interaction-1',
          severity: 'error',
          category: 'accessibility',
          message: `Component ${ctx.schema.id} is interactive but has no keyboard interaction defined`,
          elementId: ctx.schema.id,
          suggestion: 'Define keyboard interaction patterns in the accessibility section',
          wcag: '2.1.1'
        });
      }
    }
    
    return issues;
  }
};

/**
 * Rule: Scene nodes must have unique IDs
 */
export const uniqueIdsRule: ValidationRule = {
  id: 'compose:unique-ids',
  name: 'Unique IDs',
  description: 'All scene nodes must have unique identifiers',
  category: 'structure',
  severity: 'error',
  validate: (ctx) => {
    const issues: ValidationIssue[] = [];
    
    if (ctx.scene) {
      const ids = new Set<string>();
      
      function checkNode(node: SceneNode): void {
        if (ids.has(node.id)) {
          issues.push({
            id: `compose:unique-ids-${node.id}`,
            severity: 'error',
            category: 'structure',
            message: `Duplicate node ID: ${node.id}`,
            elementId: node.id,
            suggestion: 'Ensure all node IDs are unique'
          });
        }
        ids.add(node.id);
        
        if (node.children) {
          for (const child of node.children) {
            checkNode(child);
          }
        }
      }
      
      checkNode(ctx.scene.root);
    }
    
    return issues;
  }
};

/**
 * Rule: Scene nodes must have valid dimensions
 */
export const validDimensionsRule: ValidationRule = {
  id: 'compose:valid-dimensions',
  name: 'Valid Dimensions',
  description: 'Scene nodes must have non-negative dimensions',
  category: 'structure',
  severity: 'warning',
  validate: (ctx) => {
    const issues: ValidationIssue[] = [];
    
    if (ctx.scene) {
      function checkNode(node: SceneNode): void {
        if (node.width !== undefined && node.width < 0) {
          issues.push({
            id: `compose:valid-dimensions-${node.id}-width`,
            severity: 'warning',
            category: 'structure',
            message: `Node ${node.id} has negative width: ${node.width}`,
            elementId: node.id,
            suggestion: 'Width must be non-negative'
          });
        }
        
        if (node.height !== undefined && node.height < 0) {
          issues.push({
            id: `compose:valid-dimensions-${node.id}-height`,
            severity: 'warning',
            category: 'structure',
            message: `Node ${node.id} has negative height: ${node.height}`,
            elementId: node.id,
            suggestion: 'Height must be non-negative'
          });
        }
        
        if (node.children) {
          for (const child of node.children) {
            checkNode(child);
          }
        }
      }
      
      checkNode(ctx.scene.root);
    }
    
    return issues;
  }
};

/**
 * Rule: Color contrast must meet WCAG AA
 */
export const colorContrastRule: ValidationRule = {
  id: 'compose:color-contrast',
  name: 'Color Contrast',
  description: 'Text must have sufficient color contrast',
  category: 'accessibility',
  severity: 'warning',
  validate: (ctx) => {
    // Simplified - real implementation would use axe-core
    const issues: ValidationIssue[] = [];
    
    // This is a placeholder - real contrast checking requires color analysis
    // In production, this would integrate with axe-core
    
    return issues;
  }
};

/**
 * Create a validation engine with built-in rules
 */
export function createValidationEngine(): ValidationEngine {
  const engine = new ValidationEngine();
  
  engine.registerRule(accessibleNameRule);
  engine.registerRule(keyboardInteractionRule);
  engine.registerRule(uniqueIdsRule);
  engine.registerRule(validDimensionsRule);
  engine.registerRule(colorContrastRule);
  
  return engine;
}

/**
 * Global validation engine instance
 */
export const validationEngine = createValidationEngine();

/**
 * Validate a component schema
 */
export function validateComponent(schema: ComponentSchema): ValidationResult {
  return validationEngine.validate({ schema });
}

/**
 * Validate a scene graph
 */
export function validateScene(scene: SceneGraph): ValidationResult {
  return validationEngine.validate({ scene });
}

export {
  auditComposeA11y,
  formatA11yAuditSummary,
} from './a11y-audit';

export type {
  A11yAuditOptions,
  A11yAuditResult,
} from './a11y-audit';
