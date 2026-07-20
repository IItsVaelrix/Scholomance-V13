/**
 * Component Vocabulary - Open UI + WAI-ARIA definitions
 * 
 * Provides established anatomy, states, roles, and interaction expectations
 * for common UI components. This is the canonical reference for what each
 * component type means and how it should behave.
 * 
 * @module compose/vocabulary
 */

import type { ComponentSchema, ComponentRole } from '../schema/ComponentSchema';
import { schemaRegistry } from '../schema/ComponentSchema';

/**
 * Button component vocabulary
 * Interactive element that triggers an action
 */
export const buttonSchema: ComponentSchema = {
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
  }
};

/**
 * Checkbox component vocabulary
 * Toggle input with three states: unchecked, checked, indeterminate
 */
export const checkboxSchema: ComponentSchema = {
  id: 'compose:checkbox',
  name: 'Checkbox',
  role: 'checkbox',
  initialState: {
    disabled: false,
    focused: false,
    selected: false,
    required: false
  },
  anatomy: {
    id: 'root',
    role: 'checkbox',
    interactive: true,
    visible: true,
    children: [
      {
        id: 'indicator',
        role: 'icon',
        interactive: false,
        visible: true
      },
      {
        id: 'label',
        role: 'text',
        interactive: false,
        visible: true
      }
    ]
  },
  events: ['change', 'focus', 'blur', 'keydown'],
  accessibility: {
    ariaRole: 'checkbox',
    ariaAttributes: ['aria-checked', 'aria-disabled', 'aria-required'],
    keyboard: [
      'Space: toggles the checkbox'
    ],
    announcements: ['Checked', 'Unchecked', 'Indeterminate']
  }
};

/**
 * Switch component vocabulary
 * Toggle input with on/off states
 */
export const switchSchema: ComponentSchema = {
  id: 'compose:switch',
  name: 'Switch',
  role: 'switch',
  initialState: {
    disabled: false,
    focused: false,
    selected: false,
    required: false
  },
  anatomy: {
    id: 'root',
    role: 'switch',
    interactive: true,
    visible: true,
    children: [
      {
        id: 'track',
        role: 'container',
        interactive: false,
        visible: true
      },
      {
        id: 'thumb',
        role: 'icon',
        interactive: false,
        visible: true
      },
      {
        id: 'label',
        role: 'text',
        interactive: false,
        visible: true
      }
    ]
  },
  events: ['change', 'focus', 'blur', 'keydown'],
  accessibility: {
    ariaRole: 'switch',
    ariaAttributes: ['aria-checked', 'aria-disabled', 'aria-required'],
    keyboard: [
      'Space: toggles the switch'
    ],
    announcements: ['On', 'Off']
  }
};

/**
 * Tabs component vocabulary
 * Tabbed interface with tab list and panels
 */
export const tabsSchema: ComponentSchema = {
  id: 'compose:tabs',
  name: 'Tabs',
  role: 'tabs',
  initialState: {
    index: 0,
    disabled: false
  },
  anatomy: {
    id: 'root',
    role: 'tabs',
    interactive: false,
    visible: true,
    children: [
      {
        id: 'list',
        role: 'tablist',
        interactive: true,
        visible: true,
        children: [
          {
            id: 'tab',
            role: 'tab',
            interactive: true,
            visible: true
          }
        ]
      },
      {
        id: 'panel',
        role: 'tabpanel',
        interactive: false,
        visible: true
      }
    ]
  },
  events: ['change', 'focus', 'keydown'],
  accessibility: {
    ariaRole: 'tablist',
    ariaAttributes: ['aria-selected', 'aria-controls', 'aria-labelledby'],
    keyboard: [
      'ArrowLeft: move to previous tab',
      'ArrowRight: move to next tab',
      'Home: move to first tab',
      'End: move to last tab',
      'Enter/Space: activate focused tab'
    ],
    announcements: ['Tab selected']
  }
};

/**
 * Dialog component vocabulary
 * Modal or non-modal overlay
 */
export const dialogSchema: ComponentSchema = {
  id: 'compose:dialog',
  name: 'Dialog',
  role: 'dialog',
  initialState: {
    expanded: false,
    disabled: false
  },
  anatomy: {
    id: 'root',
    role: 'dialog',
    interactive: true,
    visible: true,
    children: [
      {
        id: 'backdrop',
        role: 'container',
        interactive: true,
        visible: true
      },
      {
        id: 'content',
        role: 'container',
        interactive: false,
        visible: true,
        children: [
          {
            id: 'header',
            role: 'heading',
            interactive: false,
            visible: true
          },
          {
            id: 'body',
            role: 'container',
            interactive: false,
            visible: true
          },
          {
            id: 'footer',
            role: 'container',
            interactive: false,
            visible: true
          }
        ]
      }
    ]
  },
  events: ['open', 'close', 'escape'],
  accessibility: {
    ariaRole: 'dialog',
    ariaAttributes: ['aria-modal', 'aria-labelledby', 'aria-describedby'],
    keyboard: [
      'Escape: closes the dialog',
      'Tab: cycles focus within dialog'
    ],
    announcements: ['Dialog opened', 'Dialog closed']
  }
};

/**
 * Input component vocabulary
 * Text input field
 */
export const inputSchema: ComponentSchema = {
  id: 'compose:input',
  name: 'Input',
  role: 'input',
  initialState: {
    disabled: false,
    focused: false,
    invalid: false,
    required: false,
    readonly: false,
    value: ''
  },
  anatomy: {
    id: 'root',
    role: 'input',
    interactive: true,
    visible: true,
    children: [
      {
        id: 'field',
        role: 'input',
        interactive: true,
        visible: true
      },
      {
        id: 'label',
        role: 'label',
        interactive: false,
        visible: true
      },
      {
        id: 'description',
        role: 'text',
        interactive: false,
        visible: true
      },
      {
        id: 'error',
        role: 'alert',
        interactive: false,
        visible: true
      }
    ]
  },
  events: ['change', 'input', 'focus', 'blur', 'keydown'],
  accessibility: {
    ariaRole: 'textbox',
    ariaAttributes: ['aria-invalid', 'aria-required', 'aria-readonly', 'aria-describedby'],
    keyboard: [
      'All standard text input keys'
    ],
    announcements: ['Invalid input', 'Required field']
  }
};

/**
 * Slider component vocabulary
 * Range input with continuous values
 */
export const sliderSchema: ComponentSchema = {
  id: 'compose:slider',
  name: 'Slider',
  role: 'slider',
  initialState: {
    disabled: false,
    focused: false,
    value: 0,
    readonly: false
  },
  anatomy: {
    id: 'root',
    role: 'slider',
    interactive: true,
    visible: true,
    children: [
      {
        id: 'track',
        role: 'container',
        interactive: false,
        visible: true
      },
      {
        id: 'thumb',
        role: 'icon',
        interactive: true,
        visible: true
      },
      {
        id: 'label',
        role: 'label',
        interactive: false,
        visible: true
      }
    ]
  },
  events: ['change', 'focus', 'blur', 'keydown'],
  accessibility: {
    ariaRole: 'slider',
    ariaAttributes: ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-disabled'],
    keyboard: [
      'ArrowRight/ArrowUp: increase value',
      'ArrowLeft/ArrowDown: decrease value',
      'Home: set to minimum',
      'End: set to maximum',
      'PageUp: increase by large step',
      'PageDown: decrease by large step'
    ],
    announcements: ['Value changed']
  }
};

/**
 * Tooltip component vocabulary
 * Contextual information overlay
 */
/**
 * Toolbar — composite control cluster (Scroll Editor TopBar pilot)
 */
export const toolbarSchema: ComponentSchema = {
  id: 'compose:toolbar',
  name: 'Toolbar',
  role: 'toolbar',
  initialState: {
    disabled: false,
    focused: false,
  },
  anatomy: {
    id: 'root',
    role: 'toolbar',
    interactive: true,
    visible: true,
    children: [
      { id: 'edit', role: 'button', interactive: true, visible: true },
      { id: 'new', role: 'button', interactive: true, visible: true },
      { id: 'minimap', role: 'button', interactive: true, visible: true },
      { id: 'search', role: 'button', interactive: true, visible: true },
      { id: 'atmos', role: 'button', interactive: true, visible: true },
      { id: 'focus', role: 'button', interactive: true, visible: true },
      { id: 'settings', role: 'button', interactive: true, visible: true },
    ],
  },
  events: [
    'TOOLBAR.FOCUS_NEXT',
    'TOOLBAR.FOCUS_PREV',
    'TOOLBAR.EDIT',
    'TOOLBAR.NEW_SCROLL',
    'TOOLBAR.TOGGLE_MINIMAP',
    'TOOLBAR.OPEN_SEARCH',
    'TOOLBAR.CYCLE_ATMOS',
    'TOOLBAR.TOGGLE_FOCUS',
    'TOOLBAR.OPEN_SETTINGS',
  ],
  accessibility: {
    ariaRole: 'toolbar',
    ariaAttributes: ['aria-label', 'aria-orientation', 'aria-disabled'],
    keyboard: [
      'ArrowRight: focus next',
      'ArrowLeft: focus previous',
      'Home: first',
      'End: last',
    ],
    announcements: ['Toolbar focused'],
  },
};

export const tooltipSchema: ComponentSchema = {
  id: 'compose:tooltip',
  name: 'Tooltip',
  role: 'tooltip',
  initialState: {
    expanded: false,
    disabled: false
  },
  anatomy: {
    id: 'root',
    role: 'tooltip',
    interactive: false,
    visible: true,
    children: [
      {
        id: 'trigger',
        role: 'container',
        interactive: true,
        visible: true
      },
      {
        id: 'content',
        role: 'text',
        interactive: false,
        visible: true
      }
    ]
  },
  events: ['mouseenter', 'mouseleave', 'focus', 'blur'],
  accessibility: {
    ariaRole: 'tooltip',
    ariaAttributes: ['aria-describedby'],
    keyboard: [
      'Focus trigger: shows tooltip',
      'Blur trigger: hides tooltip'
    ],
    announcements: []
  }
};

/**
 * Register all vocabulary schemas
 */
export function registerVocabulary(): void {
  const schemas = [
    buttonSchema,
    checkboxSchema,
    switchSchema,
    tabsSchema,
    dialogSchema,
    inputSchema,
    sliderSchema,
    tooltipSchema,
    toolbarSchema,
  ];

  for (const schema of schemas) {
    if (!schemaRegistry.has(schema.id)) {
      schemaRegistry.register(schema);
    }
  }
}

/**
 * Get a vocabulary schema by role
 */
export function getVocabularyByRole(role: ComponentRole): ComponentSchema | undefined {
  const allSchemas = schemaRegistry.getAll();
  return allSchemas.find(s => s.role === role);
}
