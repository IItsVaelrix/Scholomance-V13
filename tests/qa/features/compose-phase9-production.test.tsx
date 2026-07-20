/**
 * PDR Phase 9 — Production Integration
 *
 * Live IDEChrome TopBar action-cluster swap behind compose:migrate:toolbar.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  featureFlags,
  COMPOSE_FLAGS,
} from '../../../src/core/compose/flags';
import {
  TOOLBAR_ACTIONS,
  shouldUseComposeScrollEditorToolbar,
  registerToolbarMigration,
} from '../../../src/core/compose/migrated/ScrollEditorToolbar';
import {
  resolveVisibleToolbarActions,
  dispatchToolbarEvent,
  mapTopBarPropsToToolbarBridge,
  type ScrollEditorToolbarHandlers,
} from '../../../src/core/compose/migrated/toolbar-bridge';
import { ComposeScrollEditorToolbar } from '../../../src/core/compose/migrated/ComposeScrollEditorToolbar';
import { TopBar } from '../../../src/pages/Read/IDEChrome.jsx';

describe('Compose Phase 9 — toolbar bridge', () => {
  beforeEach(() => {
    featureFlags.clear();
    registerToolbarMigration();
  });

  it('hides edit/new when already editable', () => {
    const visible = resolveVisibleToolbarActions({
      isEditable: true,
      showMinimapControl: true,
      showSettingsControl: true,
      hasEdit: true,
      hasNewScroll: true,
      hasAtmos: true,
      hasFocus: true,
    });
    expect(visible.has('edit')).toBe(false);
    expect(visible.has('new')).toBe(false);
    expect(visible.has('search')).toBe(true);
    expect(visible.has('minimap')).toBe(true);
    expect(visible.has('settings')).toBe(true);
  });

  it('honors minimap/settings control gates', () => {
    const visible = resolveVisibleToolbarActions({
      isEditable: false,
      showMinimapControl: false,
      showSettingsControl: false,
      hasEdit: true,
      hasNewScroll: true,
      hasAtmos: false,
      hasFocus: true,
    });
    expect(visible.has('minimap')).toBe(false);
    expect(visible.has('settings')).toBe(false);
    expect(visible.has('atmos')).toBe(false);
    expect(visible.has('focus')).toBe(true);
    expect(visible.has('edit')).toBe(true);
  });

  it('dispatches TOOLBAR.* events to matching handlers', () => {
    const handlers: ScrollEditorToolbarHandlers = {
      onEdit: vi.fn(),
      onNewScroll: vi.fn(),
      onToggleMinimap: vi.fn(),
      onOpenSearch: vi.fn(),
      onCycleAuroraLevel: vi.fn(),
      onToggleFocus: vi.fn(),
      onSettingsClick: vi.fn(),
    };
    for (const action of TOOLBAR_ACTIONS) {
      expect(dispatchToolbarEvent(action.event, handlers)).toBe(true);
    }
    expect(handlers.onEdit).toHaveBeenCalledOnce();
    expect(handlers.onNewScroll).toHaveBeenCalledOnce();
    expect(handlers.onToggleMinimap).toHaveBeenCalledOnce();
    expect(handlers.onOpenSearch).toHaveBeenCalledOnce();
    expect(handlers.onCycleAuroraLevel).toHaveBeenCalledOnce();
    expect(handlers.onToggleFocus).toHaveBeenCalledOnce();
    expect(handlers.onSettingsClick).toHaveBeenCalledOnce();
  });

  it('maps TopBar props into bridge visibility + handlers', () => {
    const onEdit = vi.fn();
    const onOpenSearch = vi.fn();
    const bridge = mapTopBarPropsToToolbarBridge({
      isEditable: false,
      showMinimapControl: true,
      showSettingsControl: true,
      onEdit,
      onOpenSearch,
      onToggleMinimap: vi.fn(),
      onNewScroll: vi.fn(),
      onCycleAuroraLevel: vi.fn(),
      onToggleFocus: vi.fn(),
      onSettingsClick: vi.fn(),
    });
    expect(bridge.visible.has('edit')).toBe(true);
    expect(bridge.handlers.onEdit).toBe(onEdit);
    expect(bridge.handlers.onOpenSearch).toBe(onOpenSearch);
  });
});

describe('Compose Phase 9 — ComposeScrollEditorToolbar production shell', () => {
  beforeEach(() => {
    featureFlags.clear();
  });

  it('renders nothing when migrate:toolbar is OFF', () => {
    const { container } = render(
      <ComposeScrollEditorToolbar onOpenSearch={vi.fn()} />,
    );
    expect(container.querySelector('[data-compose-pilot]')).toBeNull();
  });

  it('renders visible actions and fires handlers when flag is ON', () => {
    featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
    const onOpenSearch = vi.fn();
    const onEdit = vi.fn();
    render(
      <ComposeScrollEditorToolbar
        isEditable={false}
        showMinimapControl={false}
        showSettingsControl={false}
        onEdit={onEdit}
        onOpenSearch={onOpenSearch}
        includeWandOrnament={false}
      />,
    );

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Minimap' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onOpenSearch).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('shouldUseComposeScrollEditorToolbar tracks the migration flag', () => {
    expect(shouldUseComposeScrollEditorToolbar()).toBe(false);
    featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
    expect(shouldUseComposeScrollEditorToolbar()).toBe(true);
  });
});

describe('Compose Phase 9 — IDEChrome TopBar live swap', () => {
  beforeEach(() => {
    featureFlags.clear();
  });

  it('keeps classic icon buttons when flag is OFF', () => {
    render(
      <TopBar
        title="Test Scroll"
        onOpenSearch={vi.fn()}
        showMinimap={false}
        onToggleMinimap={vi.fn()}
        isEditable={false}
        onEdit={vi.fn()}
        onNewScroll={vi.fn()}
        onSettingsClick={vi.fn()}
        onToggleFocus={vi.fn()}
        focusMode={false}
      />,
    );
    expect(screen.getByLabelText('Open Oracle Search')).toBeInTheDocument();
    expect(screen.queryByTestId('compose-topbar-actions')).toBeNull();
  });

  it('swaps the action cluster for Compose toolbar when flag is ON', () => {
    featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
    const onOpenSearch = vi.fn();
    render(
      <TopBar
        title="Test Scroll"
        onOpenSearch={onOpenSearch}
        showMinimap={false}
        onToggleMinimap={vi.fn()}
        isEditable={false}
        onEdit={vi.fn()}
        onNewScroll={vi.fn()}
        onSettingsClick={vi.fn()}
        onToggleFocus={vi.fn()}
        focusMode={false}
        showMinimapControl={true}
        showSettingsControl={true}
      />,
    );

    expect(screen.getByTestId('compose-topbar-actions')).toBeInTheDocument();
    expect(screen.queryByLabelText('Open Oracle Search')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onOpenSearch).toHaveBeenCalledOnce();
  });
});
