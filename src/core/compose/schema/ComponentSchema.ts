/**
 * Composed Component Architecture - Semantic Schema Layer
 * 
 * Defines the TypeScript contracts for component semantics using SCDL + JSON Schema 2020-12.
 * This is the source of truth for "what is this thing" before layout, behavior, or rendering.
 * 
 * @module compose/schema
 */

import type { JSONSchema7 } from 'json-schema';

/**
 * Component role - maps to Open UI + WAI-ARIA concepts
 * Defines the semantic purpose and interaction expectations
 */
export type ComponentRole =
  | 'button'
  | 'link'
  | 'input'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'slider'
  | 'tabs'
  | 'tab'
  | 'tabpanel'
  | 'toolbar'
  | 'menu'
  | 'menuitem'
  | 'dialog'
  | 'alert'
  | 'tooltip'
  | 'card'
  | 'container'
  | 'heading'
  | 'text'
  | 'image'
  | 'icon'
  | 'divider'
  | 'spacer'
  | 'list'
  | 'listitem'
  | 'table'
  | 'row'
  | 'cell'
  | 'form'
  | 'fieldset'
  | 'legend'
  | 'label'
  | 'group'
  | 'region'
  | 'navigation'
  | 'banner'
  | 'main'
  | 'complementary'
  | 'contentinfo'
  | 'search'
  | 'custom';

/**
 * Component state - finite set of interaction states
 * Maps to WAI-ARIA states and properties
 */
export type ComponentState = {
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Whether the component is focused */
  focused?: boolean;
  /** Whether the component is hovered */
  hovered?: boolean;
  /** Whether the component is pressed/active */
  pressed?: boolean;
  /** Whether the component is selected/checked */
  selected?: boolean;
  /** Whether the component is expanded (for collapsibles) */
  expanded?: boolean;
  /** Whether the component is loading */
  loading?: boolean;
  /** Whether the component is invalid (for form inputs) */
  invalid?: boolean;
  /** Whether the component is required (for form inputs) */
  required?: boolean;
  /** Whether the component is readonly (for form inputs) */
  readonly?: boolean;
  /** Current value (for inputs, sliders, etc.) */
  value?: string | number | boolean;
  /** Current index (for tabs, carousels, etc.) */
  index?: number;
  /** Custom state properties */
  custom?: Record<string, unknown>;
};

/**
 * Component anatomy - semantic parts that make up the component
 * Maps to WAI-ARIA parts and Open UI anatomy
 */
export type ComponentAnatomy = {
  /** Unique identifier for this part */
  id: string;
  /** Semantic role of this part */
  role: ComponentRole;
  /** Label for accessibility */
  label?: string;
  /** Description for accessibility */
  description?: string;
  /** Whether this part is interactive */
  interactive?: boolean;
  /** Whether this part is visible */
  visible?: boolean;
  /** Child parts */
  children?: ComponentAnatomy[];
  /** Custom properties */
  props?: Record<string, unknown>;
};

/**
 * Component schema - complete semantic definition
 * This is the SCDL-inspired declarative source of truth
 */
export type ComponentSchema = {
  /** Unique identifier for this component type */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic role */
  role: ComponentRole;
  /** Initial state */
  initialState?: ComponentState;
  /** Component anatomy */
  anatomy: ComponentAnatomy;
  /** Supported events */
  events?: string[];
  /** JSON Schema for props validation */
  propsSchema?: JSONSchema7;
  /** JSON Schema for state validation */
  stateSchema?: JSONSchema7;
  /** Accessibility requirements */
  accessibility?: {
    /** ARIA role */
    ariaRole?: string;
    /** Required ARIA attributes */
    ariaAttributes?: string[];
    /** Keyboard interaction patterns */
    keyboard?: string[];
    /** Screen reader announcements */
    announcements?: string[];
  };
  /** Custom metadata */
  metadata?: Record<string, unknown>;
};

/**
 * Component instance - a rendered component with state
 */
export type ComponentInstance = {
  /** Reference to the schema */
  schemaId: string;
  /** Unique instance identifier */
  instanceId: string;
  /** Current state */
  state: ComponentState;
  /** Props passed to this instance */
  props: Record<string, unknown>;
  /** DOM element reference (when rendered) */
  element?: HTMLElement;
};

/**
 * Schema registry - manages component schemas
 */
export class ComponentSchemaRegistry {
  private schemas = new Map<string, ComponentSchema>();

  /**
   * Register a component schema
   */
  register(schema: ComponentSchema): void {
    if (this.schemas.has(schema.id)) {
      throw new Error(`Schema ${schema.id} already registered`);
    }
    this.schemas.set(schema.id, schema);
  }

  /**
   * Get a component schema by ID
   */
  get(id: string): ComponentSchema | undefined {
    return this.schemas.get(id);
  }

  /**
   * Check if a schema is registered
   */
  has(id: string): boolean {
    return this.schemas.has(id);
  }

  /**
   * Get all registered schemas
   */
  getAll(): ComponentSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Clear all schemas (for testing)
   */
  clear(): void {
    this.schemas.clear();
  }
}

/**
 * Global schema registry instance
 */
export const schemaRegistry = new ComponentSchemaRegistry();
