/**
 * Phase 9 — bridge IDEChrome TopBar callbacks ↔ PB-UI-EVENT toolbar acts.
 * Visibility is computed here; canonical scene factories stay golden-stable.
 */

import { TOOLBAR_ACTIONS } from './ScrollEditorToolbar';

export type ToolbarActionId = (typeof TOOLBAR_ACTIONS)[number]['id'];

export type ScrollEditorToolbarHandlers = {
  onEdit?: () => void;
  onNewScroll?: () => void;
  onToggleMinimap?: () => void;
  onOpenSearch?: () => void;
  onCycleAuroraLevel?: () => void;
  onToggleFocus?: () => void;
  onSettingsClick?: () => void;
};

export type ToolbarVisibilityInput = {
  isEditable?: boolean;
  showMinimapControl?: boolean;
  showSettingsControl?: boolean;
  hasEdit?: boolean;
  hasNewScroll?: boolean;
  hasAtmos?: boolean;
  hasFocus?: boolean;
  /** Search is always offered when the host provides a handler (default true). */
  hasSearch?: boolean;
};

const EVENT_TO_HANDLER: Record<string, keyof ScrollEditorToolbarHandlers> = {
  'TOOLBAR.EDIT': 'onEdit',
  'TOOLBAR.NEW_SCROLL': 'onNewScroll',
  'TOOLBAR.TOGGLE_MINIMAP': 'onToggleMinimap',
  'TOOLBAR.OPEN_SEARCH': 'onOpenSearch',
  'TOOLBAR.CYCLE_ATMOS': 'onCycleAuroraLevel',
  'TOOLBAR.TOGGLE_FOCUS': 'onToggleFocus',
  'TOOLBAR.OPEN_SETTINGS': 'onSettingsClick',
};

/**
 * Which toolbar action ids should render for the current TopBar props.
 */
export function resolveVisibleToolbarActions(
  input: ToolbarVisibilityInput,
): Set<ToolbarActionId> {
  const visible = new Set<ToolbarActionId>();
  const showEdit = !input.isEditable && input.hasEdit !== false;
  const showNew = !input.isEditable && input.hasNewScroll !== false;
  const showMinimap = input.showMinimapControl !== false;
  const showSettings = input.showSettingsControl !== false;
  const showAtmos = input.hasAtmos !== false;
  const showFocus = input.hasFocus !== false;
  const showSearch = input.hasSearch !== false;

  for (const action of TOOLBAR_ACTIONS) {
    switch (action.id) {
      case 'edit':
        if (showEdit) visible.add(action.id);
        break;
      case 'new':
        if (showNew) visible.add(action.id);
        break;
      case 'minimap':
        if (showMinimap) visible.add(action.id);
        break;
      case 'search':
        if (showSearch) visible.add(action.id);
        break;
      case 'atmos':
        if (showAtmos) visible.add(action.id);
        break;
      case 'focus':
        if (showFocus) visible.add(action.id);
        break;
      case 'settings':
        if (showSettings) visible.add(action.id);
        break;
      default:
        break;
    }
  }
  return visible;
}

/**
 * Invoke the TopBar handler for a sealed TOOLBAR.* event type.
 * Returns false when no handler is bound (lawful no-op).
 */
export function dispatchToolbarEvent(
  type: string,
  handlers: ScrollEditorToolbarHandlers,
): boolean {
  const key = EVENT_TO_HANDLER[type];
  if (!key) return false;
  const fn = handlers[key];
  if (typeof fn !== 'function') return false;
  fn();
  return true;
}

export type TopBarBridgeProps = {
  isEditable?: boolean;
  showMinimapControl?: boolean;
  showSettingsControl?: boolean;
  onEdit?: () => void;
  onNewScroll?: () => void;
  onToggleMinimap?: () => void;
  onOpenSearch?: () => void;
  onCycleAuroraLevel?: () => void;
  onToggleFocus?: () => void;
  onSettingsClick?: () => void;
};

/**
 * Lower TopBar host props into visibility + handlers for the compose shell.
 */
export function mapTopBarPropsToToolbarBridge(props: TopBarBridgeProps): {
  visible: Set<ToolbarActionId>;
  handlers: ScrollEditorToolbarHandlers;
} {
  const handlers: ScrollEditorToolbarHandlers = {
    onEdit: props.onEdit,
    onNewScroll: props.onNewScroll,
    onToggleMinimap: props.onToggleMinimap,
    onOpenSearch: props.onOpenSearch,
    onCycleAuroraLevel: props.onCycleAuroraLevel,
    onToggleFocus: props.onToggleFocus,
    onSettingsClick: props.onSettingsClick,
  };

  const visible = resolveVisibleToolbarActions({
    isEditable: props.isEditable,
    showMinimapControl: props.showMinimapControl,
    showSettingsControl: props.showSettingsControl,
    hasEdit: typeof props.onEdit === 'function',
    hasNewScroll: typeof props.onNewScroll === 'function',
    hasAtmos: typeof props.onCycleAuroraLevel === 'function',
    hasFocus: typeof props.onToggleFocus === 'function',
    hasSearch: typeof props.onOpenSearch === 'function',
  });

  return { visible, handlers };
}
