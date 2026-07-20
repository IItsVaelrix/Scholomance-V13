/**
 * Migrated Button Component
 * 
 * Example of a component fully migrated to the Composed Component Architecture.
 * 
 * @module compose/migrated/Button
 */

import type { ComponentSchema, ComponentState } from '../schema/ComponentSchema';
import { createComponentDefinition, SCHOL_COMPONENT_DEFINITION_V1 } from '../schema/contracts';
import { featureFlags, COMPOSE_FLAGS } from '../flags';
import { migrationRegistry, createMigration } from '../migration';

/**
 * Button component schema (SCHOL-COMPONENT-DEFINITION-v1)
 */
export const buttonDefinition = createComponentDefinition({
  id: 'compose:button',
  name: 'Button',
  role: 'button',
  initialState: {
    disabled: false,
    focused: false,
    hovered: false,
    pressed: false,
    loading: false
  },
  anatomy: {
    id: 'root',
    role: 'button',
    interactive: true,
    visible: true,
    children: [
      {
        id: 'label',
        role: 'text',
        interactive: false,
        visible: true
      },
      {
        id: 'icon',
        role: 'icon',
        interactive: false,
        visible: true
      }
    ]
  },
  events: ['click', 'focus', 'blur', 'keydown', 'keyup'],
  accessibility: {
    ariaRole: 'button',
    ariaAttributes: ['aria-disabled', 'aria-pressed', 'aria-busy'],
    keyboard: [
      'Enter: activates the button',
      'Space: activates the button'
    ],
    announcements: ['Button activated', 'Button disabled']
  },
  propsSchema: {
    type: 'object',
    properties: {
      variant: { type: 'string', enum: ['primary', 'secondary', 'ghost'] },
      size: { type: 'string', enum: ['sm', 'md', 'lg'] },
      disabled: { type: 'boolean' },
      loading: { type: 'boolean' },
      onClick: {}
    }
  }
});

/**
 * Button props interface
 */
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  children?: any;
  icon?: any;
  className?: string;
}

/**
 * Button component state
 */
export interface ButtonState extends ComponentState {
  disabled: boolean;
  focused: boolean;
  hovered: boolean;
  pressed: boolean;
  loading: boolean;
}

/**
 * Migrated Button component
 */
export class MigratedButton {
  private schema: ComponentSchema;
  private state: ButtonState;
  private props: ButtonProps;

  constructor(props: ButtonProps = {}) {
    this.schema = buttonDefinition;
    this.props = props;
    this.state = {
      disabled: props.disabled ?? false,
      focused: false,
      hovered: false,
      pressed: false,
      loading: props.loading ?? false
    };
  }

  /**
   * Get the current state
   */
  getState(): ButtonState {
    return { ...this.state };
  }

  /**
   * Get the component schema
   */
  getSchema(): ComponentSchema {
    return this.schema;
  }

  /**
   * Handle focus event
   */
  focus(): void {
    if (this.state.disabled || this.state.loading) return;
    this.state = { ...this.state, focused: true };
  }

  /**
   * Handle blur event
   */
  blur(): void {
    this.state = { ...this.state, focused: false };
  }

  /**
   * Handle mouse enter
   */
  mouseEnter(): void {
    if (this.state.disabled || this.state.loading) return;
    this.state = { ...this.state, hovered: true };
  }

  /**
   * Handle mouse leave
   */
  mouseLeave(): void {
    this.state = { ...this.state, hovered: false };
  }

  /**
   * Handle mouse down
   */
  mouseDown(): void {
    if (this.state.disabled || this.state.loading) return;
    this.state = { ...this.state, pressed: true };
  }

  /**
   * Handle mouse up
   */
  mouseUp(): void {
    this.state = { ...this.state, pressed: false };
  }

  /**
   * Handle click
   */
  click(): void {
    if (this.state.disabled || this.state.loading) return;
    this.props.onClick?.();
  }

  /**
   * Handle key down
   */
  keyDown(key: string): void {
    if (this.state.disabled || this.state.loading) return;
    if (key === 'Enter' || key === ' ') {
      this.state = { ...this.state, pressed: true };
    }
  }

  /**
   * Handle key up
   */
  keyUp(key: string): void {
    if (this.state.disabled || this.state.loading) return;
    if (key === 'Enter' || key === ' ') {
      this.state = { ...this.state, pressed: false };
      this.click();
    }
  }

  /**
   * Update props
   */
  setProps(props: Partial<ButtonProps>): void {
    this.props = { ...this.props, ...props };
    if ('disabled' in props) {
      this.state = { ...this.state, disabled: props.disabled ?? false };
    }
    if ('loading' in props) {
      this.state = { ...this.state, loading: props.loading ?? false };
    }
  }

  /**
   * Get ARIA attributes
   */
  getAriaAttributes(): Record<string, any> {
    return {
      role: 'button',
      'aria-disabled': this.state.disabled,
      'aria-pressed': this.state.pressed,
      'aria-busy': this.state.loading
    };
  }

  /**
   * Get CSS class names
   */
  getClassNames(): string[] {
    const classes = ['compose-button'];
    
    if (this.props.variant) {
      classes.push(`compose-button--${this.props.variant}`);
    }
    if (this.props.size) {
      classes.push(`compose-button--${this.props.size}`);
    }
    if (this.state.disabled) {
      classes.push('compose-button--disabled');
    }
    if (this.state.loading) {
      classes.push('compose-button--loading');
    }
    if (this.state.focused) {
      classes.push('compose-button--focused');
    }
    if (this.state.hovered) {
      classes.push('compose-button--hovered');
    }
    if (this.state.pressed) {
      classes.push('compose-button--pressed');
    }
    
    return classes;
  }

  /**
   * Destroy and clean up
   */
  destroy(): void {
    // Clean up any resources
    this.state = {
      disabled: false,
      focused: false,
      hovered: false,
      pressed: false,
      loading: false
    };
  }

  /**
   * Render the button (placeholder for actual rendering)
   */
  render(): any {
    return {
      type: 'button',
      props: {
        ...this.getAriaAttributes(),
        disabled: this.state.disabled,
        onClick: () => this.click()
      },
      children: this.props.children
    };
  }
}

/**
 * Register the button migration
 */
let buttonMigrationRegistered = false;

export function registerButtonMigration(): void {
  if (buttonMigrationRegistered) return;
  
  const migration = createMigration(
    'compose:button',
    'Button',
    COMPOSE_FLAGS.MIGRATE_BUTTON,
    []
  );
  
  try {
    migrationRegistry.register(migration);
    buttonMigrationRegistered = true;
  } catch {
    // Already registered, ignore
  }
}

/**
 * Check if the migrated button should be used
 */
export function shouldUseMigratedButton(): boolean {
  return featureFlags.isEnabled(COMPOSE_FLAGS.MIGRATE_BUTTON);
}
