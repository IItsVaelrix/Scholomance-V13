/**
 * JSON Schema definitions for component validation
 * 
 * These schemas validate component structure, state, and props
 * at runtime, ensuring type safety and contract compliance.
 * 
 * Note: Simplified validation without full $ref resolution.
 * TypeScript types provide compile-time validation.
 */

import type { JSONSchema7 } from 'json-schema';

/**
 * JSON Schema for ComponentRole validation
 */
export const componentRoleSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ComponentRole',
  description: 'Valid component roles from Open UI + WAI-ARIA vocabulary',
  type: 'string',
  enum: [
    'button', 'link', 'input', 'checkbox', 'radio', 'switch', 'slider',
    'tabs', 'tab', 'tabpanel', 'toolbar', 'menu', 'menuitem', 'dialog', 'alert',
    'tooltip', 'card', 'container', 'heading', 'text', 'image', 'icon',
    'divider', 'spacer', 'list', 'listitem', 'table', 'row', 'cell',
    'form', 'fieldset', 'legend', 'label', 'group', 'region',
    'navigation', 'banner', 'main', 'complementary', 'contentinfo',
    'search', 'custom'
  ]
};

/**
 * JSON Schema for ComponentState validation
 */
export const componentStateSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ComponentState',
  description: 'Valid component state shape',
  type: 'object',
  properties: {
    disabled: { type: 'boolean' },
    focused: { type: 'boolean' },
    hovered: { type: 'boolean' },
    pressed: { type: 'boolean' },
    selected: { type: 'boolean' },
    expanded: { type: 'boolean' },
    loading: { type: 'boolean' },
    invalid: { type: 'boolean' },
    required: { type: 'boolean' },
    readonly: { type: 'boolean' },
    value: {
      oneOf: [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' }
      ]
    },
    index: { type: 'number', minimum: 0 },
    custom: { type: 'object' }
  },
  additionalProperties: false
};

/**
 * JSON Schema for ComponentAnatomy validation
 */
export const componentAnatomySchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ComponentAnatomy',
  description: 'Valid component anatomy (semantic parts)',
  type: 'object',
  required: ['id', 'role'],
  properties: {
    id: { type: 'string', minLength: 1 },
    role: { type: 'string' },
    label: { type: 'string' },
    description: { type: 'string' },
    interactive: { type: 'boolean' },
    visible: { type: 'boolean' },
    children: {
      type: 'array',
      items: { type: 'object' }
    },
    props: { type: 'object' }
  },
  additionalProperties: false
};

/**
 * JSON Schema for ComponentSchema validation
 */
export const componentSchemaSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ComponentSchema',
  description: 'Complete component schema definition',
  type: 'object',
  required: ['id', 'name', 'role', 'anatomy'],
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    role: { type: 'string' },
    initialState: { type: 'object' },
    anatomy: { type: 'object' },
    events: {
      type: 'array',
      items: { type: 'string' }
    },
    propsSchema: { type: 'object' },
    stateSchema: { type: 'object' },
    accessibility: {
      type: 'object',
      properties: {
        ariaRole: { type: 'string' },
        ariaAttributes: {
          type: 'array',
          items: { type: 'string' }
        },
        keyboard: {
          type: 'array',
          items: { type: 'string' }
        },
        announcements: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    metadata: { type: 'object' }
  },
  additionalProperties: false
};

/**
 * JSON Schema for ComponentInstance validation
 */
export const componentInstanceSchema: JSONSchema7 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ComponentInstance',
  description: 'A rendered component instance with state',
  type: 'object',
  required: ['schemaId', 'instanceId', 'state', 'props'],
  properties: {
    schemaId: { type: 'string', minLength: 1 },
    instanceId: { type: 'string', minLength: 1 },
    state: { type: 'object' },
    props: { type: 'object' }
  },
  additionalProperties: false
};

/**
 * Validate a value against a JSON Schema
 * Simplified validation with type checking
 */
export async function validateSchema<T>(
  schema: JSONSchema7,
  data: unknown
): Promise<{ valid: boolean; errors?: string[] }> {
  const errors: string[] = [];
  
  // Check type
  if (schema.type) {
    const actualType = Array.isArray(data) ? 'array' : typeof data;
    if (schema.type === 'object' && actualType !== 'object') {
      errors.push(`Expected object, got ${actualType}`);
    } else if (schema.type === 'string' && actualType !== 'string') {
      errors.push(`Expected string, got ${actualType}`);
    } else if (schema.type === 'number' && actualType !== 'number') {
      errors.push(`Expected number, got ${actualType}`);
    } else if (schema.type === 'boolean' && actualType !== 'boolean') {
      errors.push(`Expected boolean, got ${actualType}`);
    }
  }
  
  // Check required fields
  if (schema.required && typeof data === 'object' && data !== null) {
    const missing = schema.required.filter(key => !(key in data));
    if (missing.length > 0) {
      errors.push(`Missing required fields: ${missing.join(', ')}`);
    }
  }
  
  // Check properties
  if (schema.properties && typeof data === 'object' && data !== null) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data && propSchema && typeof propSchema === 'object') {
        const value = (data as Record<string, unknown>)[key];
        const propType = (propSchema as JSONSchema7).type;
        
        if (propType) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (propType === 'boolean' && actualType !== 'boolean') {
            errors.push(`Property '${key}' expected boolean, got ${actualType}`);
          } else if (propType === 'string' && actualType !== 'string') {
            errors.push(`Property '${key}' expected string, got ${actualType}`);
          } else if (propType === 'number' && actualType !== 'number') {
            errors.push(`Property '${key}' expected number, got ${actualType}`);
          }
        }
      }
    }
  }
  
  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}

/**
 * Validate a component schema definition
 */
export async function validateComponentSchema(
  schema: unknown
): Promise<{ valid: boolean; errors?: string[] }> {
  return validateSchema(componentSchemaSchema, schema);
}

/**
 * Validate a component state object
 */
export async function validateComponentState(
  state: unknown
): Promise<{ valid: boolean; errors?: string[] }> {
  return validateSchema(componentStateSchema, state);
}
