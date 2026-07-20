/**
 * Feature Flag System for Compose Architecture
 * 
 * Controls rollout of the composed component architecture.
 * 
 * @module compose/flags
 */

import { useSyncExternalStore } from 'react';

/**
 * Feature flag definition
 */
export type FeatureFlag = {
  /** Flag identifier */
  id: string;
  /** Flag name (human-readable) */
  name: string;
  /** Flag value */
  value: boolean;
  /** Alias for value - kept in sync */
  enabled: boolean;
  /** Flag description */
  description?: string;
};

/**
 * All compose feature flag names
 */
export const COMPOSE_FLAGS = {
  /** Master switch - enables the entire compose architecture */
  ENABLED: 'compose:enabled',
  /** Shadow mode - run old + new component in parallel */
  SHADOW_MODE: 'compose:shadow-mode',
  /** Schema registry layer */
  SCHEMA_REGISTRY: 'compose:schema',
  /** Vocabulary layer */
  VOCABULARY: 'compose:vocabulary',
  /** Layout layer */
  LAYOUT: 'compose:layout',
  /** Behavior layer */
  BEHAVIOR: 'compose:behavior',
  /** Workflow layer */
  WORKFLOW: 'compose:workflow',
  /** Validation layer */
  VALIDATION: 'compose:validation',
  /** Render layer */
  RENDER: 'compose:render',
  /** Scene layer */
  SCENE: 'compose:scene',
  /** Tokens layer */
  TOKENS: 'compose:tokens',
  /** Per-component migration flags */
  MIGRATE_BUTTON: 'compose:migrate:button',
  MIGRATE_CHECKBOX: 'compose:migrate:checkbox',
  MIGRATE_SWITCH: 'compose:migrate:switch',
  MIGRATE_TABS: 'compose:migrate:tabs',
  MIGRATE_DIALOG: 'compose:migrate:dialog',
  MIGRATE_INPUT: 'compose:migrate:input',
  MIGRATE_SLIDER: 'compose:migrate:slider',
  MIGRATE_TOOLTIP: 'compose:migrate:tooltip',
  MIGRATE_TOOLBAR: 'compose:migrate:toolbar',
  MIGRATE_LEDGER: 'compose:migrate:ledger',
  MIGRATE_GALAXY: 'compose:migrate:galaxy',
} as const;

export type FeatureFlagName = typeof COMPOSE_FLAGS[keyof typeof COMPOSE_FLAGS];

/**
 * Default flag values
 */
const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  [COMPOSE_FLAGS.ENABLED]: { id: COMPOSE_FLAGS.ENABLED, name: 'Enabled', value: false, enabled: false, description: 'Master switch' },
  [COMPOSE_FLAGS.SHADOW_MODE]: { id: COMPOSE_FLAGS.SHADOW_MODE, name: 'Shadow Mode', value: false, enabled: false, description: 'Shadow mode' },
  [COMPOSE_FLAGS.SCHEMA_REGISTRY]: { id: COMPOSE_FLAGS.SCHEMA_REGISTRY, name: 'Schema Registry', value: false, enabled: false, description: 'Schema registry' },
  [COMPOSE_FLAGS.VOCABULARY]: { id: COMPOSE_FLAGS.VOCABULARY, name: 'Vocabulary', value: false, enabled: false, description: 'Vocabulary' },
  [COMPOSE_FLAGS.LAYOUT]: { id: COMPOSE_FLAGS.LAYOUT, name: 'Layout', value: false, enabled: false, description: 'Layout' },
  [COMPOSE_FLAGS.BEHAVIOR]: { id: COMPOSE_FLAGS.BEHAVIOR, name: 'Behavior', value: false, enabled: false, description: 'Behavior' },
  [COMPOSE_FLAGS.WORKFLOW]: { id: COMPOSE_FLAGS.WORKFLOW, name: 'Workflow', value: false, enabled: false, description: 'Workflow' },
  [COMPOSE_FLAGS.VALIDATION]: { id: COMPOSE_FLAGS.VALIDATION, name: 'Validation', value: false, enabled: false, description: 'Validation' },
  [COMPOSE_FLAGS.RENDER]: { id: COMPOSE_FLAGS.RENDER, name: 'Render', value: false, enabled: false, description: 'Render' },
  [COMPOSE_FLAGS.SCENE]: { id: COMPOSE_FLAGS.SCENE, name: 'Scene', value: false, enabled: false, description: 'Scene' },
  [COMPOSE_FLAGS.TOKENS]: { id: COMPOSE_FLAGS.TOKENS, name: 'Tokens', value: false, enabled: false, description: 'Tokens' },
  [COMPOSE_FLAGS.MIGRATE_BUTTON]: { id: COMPOSE_FLAGS.MIGRATE_BUTTON, name: 'Migrate Button', value: false, enabled: false, description: 'Migrate button' },
  [COMPOSE_FLAGS.MIGRATE_CHECKBOX]: { id: COMPOSE_FLAGS.MIGRATE_CHECKBOX, name: 'Migrate Checkbox', value: false, enabled: false, description: 'Migrate checkbox' },
  [COMPOSE_FLAGS.MIGRATE_SWITCH]: { id: COMPOSE_FLAGS.MIGRATE_SWITCH, name: 'Migrate Switch', value: false, enabled: false, description: 'Migrate switch' },
  [COMPOSE_FLAGS.MIGRATE_TABS]: { id: COMPOSE_FLAGS.MIGRATE_TABS, name: 'Migrate Tabs', value: false, enabled: false, description: 'Migrate tabs' },
  [COMPOSE_FLAGS.MIGRATE_DIALOG]: { id: COMPOSE_FLAGS.MIGRATE_DIALOG, name: 'Migrate Dialog', value: false, enabled: false, description: 'Migrate dialog' },
  [COMPOSE_FLAGS.MIGRATE_INPUT]: { id: COMPOSE_FLAGS.MIGRATE_INPUT, name: 'Migrate Input', value: false, enabled: false, description: 'Migrate input' },
  [COMPOSE_FLAGS.MIGRATE_SLIDER]: { id: COMPOSE_FLAGS.MIGRATE_SLIDER, name: 'Migrate Slider', value: false, enabled: false, description: 'Migrate slider' },
  [COMPOSE_FLAGS.MIGRATE_TOOLTIP]: { id: COMPOSE_FLAGS.MIGRATE_TOOLTIP, name: 'Migrate Tooltip', value: false, enabled: false, description: 'Migrate tooltip' },
  [COMPOSE_FLAGS.MIGRATE_TOOLBAR]: { id: COMPOSE_FLAGS.MIGRATE_TOOLBAR, name: 'Migrate Toolbar', value: false, enabled: false, description: 'Migrate scroll editor toolbar' },
  [COMPOSE_FLAGS.MIGRATE_LEDGER]: { id: COMPOSE_FLAGS.MIGRATE_LEDGER, name: 'Migrate Ledger', value: false, enabled: false, description: 'Migrate update ledger window' },
  [COMPOSE_FLAGS.MIGRATE_GALAXY]: { id: COMPOSE_FLAGS.MIGRATE_GALAXY, name: 'Migrate Galaxy', value: false, enabled: false, description: 'Migrate galaxy backdrop' },
};

/**
 * Feature flag manager
 */
export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag>;
  private listeners: Array<(flag: FeatureFlag) => void> = [];

  constructor() {
    this.flags = new Map(Object.entries(DEFAULT_FLAGS).map(([k, v]) => [k, { ...v }]));
  }

  /**
   * Clear all flags (for testing)
   */
  clear(): void {
    this.flags = new Map(Object.entries(DEFAULT_FLAGS).map(([k, v]) => [k, { ...v }]));
  }

  /**
   * Check if a flag is enabled
   */
  isEnabled(flag: string): boolean {
    const f = this.flags.get(flag);
    return f?.value ?? false;
  }

  /**
   * Enable a flag
   */
  enable(flag: string): void {
    const f = this.flags.get(flag);
    if (f) {
      f.value = true;
      f.enabled = true;
      this.notifyListeners(f);
    }
  }

  /**
   * Disable a flag
   */
  disable(flag: string): void {
    const f = this.flags.get(flag);
    if (f) {
      f.value = false;
      f.enabled = false;
      this.notifyListeners(f);
    }
  }

  /**
   * Set a flag value
   */
  set(flag: string, value: boolean): void {
    const f = this.flags.get(flag);
    if (f) {
      f.value = value;
      f.enabled = value;
      this.notifyListeners(f);
    }
  }

  /**
   * Get a flag
   */
  get(flag: string): FeatureFlag | undefined {
    return this.flags.get(flag);
  }

  /**
   * Get all flags
   */
  getAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get all enabled flags
   */
  getEnabled(): FeatureFlag[] {
    return Array.from(this.flags.values()).filter(f => f.value);
  }

  /**
   * Enable all flags
   */
  enableAll(): void {
    for (const f of this.flags.values()) {
      f.value = true;
      f.enabled = true;
    }
  }

  /**
   * Disable all flags
   */
  disableAll(): void {
    for (const f of this.flags.values()) {
      f.value = false;
      f.enabled = false;
    }
  }

  /**
   * Subscribe to flag changes
   */
  subscribe(listener: (flag: FeatureFlag) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(flag: FeatureFlag): void {
    for (const listener of this.listeners) {
      listener(flag);
    }
  }

  /**
   * Alias for set() - used by integration tests
   */
  setFlag(flag: string, value: boolean): void {
    this.set(flag, value);
  }

  /**
   * Check if a component has been migrated by checking its migration flag
   */
  isComponentMigrated(componentName: string): boolean {
    const flagName = `compose:migrate:${componentName}`;
    return this.isEnabled(flagName);
  }

  /**
   * Get migration progress summary based on migration flags
   */
  getMigrationProgress(): { migrated: number; total: number } {
    const migrationFlags = [
      COMPOSE_FLAGS.MIGRATE_BUTTON,
      COMPOSE_FLAGS.MIGRATE_CHECKBOX,
      COMPOSE_FLAGS.MIGRATE_SWITCH,
      COMPOSE_FLAGS.MIGRATE_TABS,
      COMPOSE_FLAGS.MIGRATE_DIALOG,
      COMPOSE_FLAGS.MIGRATE_INPUT,
      COMPOSE_FLAGS.MIGRATE_SLIDER,
      COMPOSE_FLAGS.MIGRATE_TOOLTIP,
      COMPOSE_FLAGS.MIGRATE_TOOLBAR,
      COMPOSE_FLAGS.MIGRATE_LEDGER,
      COMPOSE_FLAGS.MIGRATE_GALAXY,
    ];
    const migrated = migrationFlags.filter(f => this.isEnabled(f)).length;
    return { migrated, total: migrationFlags.length };
  }
}

/**
 * Apply `window.__COMPOSE_FLAGS__` overrides (devtools / Playwright).
 * Not a production rollout mechanism — PDR §21.
 */
export function syncComposeFlagsFromWindow(manager: FeatureFlagManager): void {
  if (typeof window === 'undefined') return;
  const overrides = (window as Window & { __COMPOSE_FLAGS__?: Record<string, boolean> })
    .__COMPOSE_FLAGS__;
  if (!overrides || typeof overrides !== 'object') return;
  for (const [id, value] of Object.entries(overrides)) {
    if (typeof value === 'boolean') {
      manager.set(id, value);
    }
  }
}

/**
 * Singleton feature flag manager instance
 */
export const featureFlags = new FeatureFlagManager();

if (typeof window !== 'undefined') {
  syncComposeFlagsFromWindow(featureFlags);
}

/** Convenience for tests/Playwright after mutating `window.__COMPOSE_FLAGS__`. */
export function reapplyComposeFlagOverrides(): void {
  syncComposeFlagsFromWindow(featureFlags);
}

/**
 * React hook for feature flags — subscribes so toggles re-render consumers.
 */
export function useFeatureFlag(flag: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => featureFlags.subscribe(() => onStoreChange()),
    () => featureFlags.isEnabled(flag),
    () => featureFlags.isEnabled(flag),
  );
}

/**
 * Higher-order function for feature flag gating
 * Returns a function that conditionally executes based on flag state
 */
export function withFeatureFlag<T>(
  flag: string, 
  fn: () => T, 
  fallback?: () => T
): () => T | undefined {
  return () => {
    if (featureFlags.isEnabled(flag)) {
      return fn();
    }
    return fallback ? fallback() : undefined;
  };
}
