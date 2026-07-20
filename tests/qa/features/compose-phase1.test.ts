/**
 * Tests for Composed Component Architecture - Phase 1 Completion
 * 
 * Tests for:
 * - Canonical contracts (SCHOL-COMPONENT-DEFINITION-v1)
 * - Feature flags
 * - Migration registry
 * - Migrated Button component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  contractRegistry,
  SCHOL_COMPONENT_DEFINITION_V1,
  createComponentDefinition,
  validateContractVersion,
  type ContractVersion
} from '../../../src/core/compose/schema/contracts';
import {
  featureFlags,
  COMPOSE_FLAGS,
  useFeatureFlag,
  withFeatureFlag,
  type FeatureFlag
} from '../../../src/core/compose/flags';
import {
  migrationRegistry,
  createMigration,
  getMigrationStatusDisplay,
  type ComponentMigration
} from '../../../src/core/compose/migration';
import {
  MigratedButton,
  buttonDefinition,
  registerButtonMigration,
  shouldUseMigratedButton
} from '../../../src/core/compose/migrated/Button';
import type { ComponentSchema } from '../../../src/core/compose/schema/ComponentSchema';

describe('Compose Phase 1 - Canonical Contracts', () => {
  beforeEach(() => {
    contractRegistry.clear();
    // Re-register the default contract
    contractRegistry.register(SCHOL_COMPONENT_DEFINITION_V1);
  });

  describe('Contract Registry', () => {
    it('should have SCHOL-COMPONENT-DEFINITION-v1 registered by default', () => {
      expect(contractRegistry.has('SCHOL-COMPONENT-DEFINITION-v1')).toBe(true);
    });

    it('should retrieve a contract by full name', () => {
      const contract = contractRegistry.get('SCHOL-COMPONENT-DEFINITION-v1');
      expect(contract).toBeDefined();
      expect(contract?.contractId).toBe('SCHOL-COMPONENT-DEFINITION');
      expect(contract?.version).toBe('v1');
      expect(contract?.fullName).toBe('SCHOL-COMPONENT-DEFINITION-v1');
    });

    it('should retrieve active contracts by base ID', () => {
      const active = contractRegistry.getActive('SCHOL-COMPONENT-DEFINITION');
      expect(active).toBeDefined();
      expect(active?.active).toBe(true);
    });

    it('should register a new contract version', () => {
      const v2: ContractVersion = {
        contractId: 'SCHOL-COMPONENT-DEFINITION',
        version: 'v2',
        fullName: 'SCHOL-COMPONENT-DEFINITION-v2',
        schemaUri: 'https://scholomance.dev/schemas/SCHOL-COMPONENT-DEFINITION-v2.json',
        description: 'Version 2',
        establishedDate: '2026-08-01',
        active: false
      };

      contractRegistry.register(v2);
      expect(contractRegistry.has('SCHOL-COMPONENT-DEFINITION-v2')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      expect(() => {
        contractRegistry.register(SCHOL_COMPONENT_DEFINITION_V1);
      }).toThrow('Contract SCHOL-COMPONENT-DEFINITION-v1 already registered');
    });

    it('should get all active contracts', () => {
      const active = contractRegistry.getActiveContracts();
      expect(active.length).toBeGreaterThan(0);
      expect(active.every(c => c.active)).toBe(true);
    });
  });

  describe('Component Definition Creation', () => {
    it('should create a component definition with contract version', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Test Button',
        role: 'button',
        anatomy: { id: 'root', role: 'button', interactive: true, visible: true }
      };

      const definition = createComponentDefinition(schema);
      expect(definition.__contract).toBe('SCHOL-COMPONENT-DEFINITION-v1');
      expect(definition.id).toBe('test:button');
    });

    it('should validate contract version', () => {
      const schema: ComponentSchema = {
        id: 'test:button',
        name: 'Test Button',
        role: 'button',
        anatomy: { id: 'root', role: 'button', interactive: true, visible: true }
      };

      const definition = createComponentDefinition(schema);
      const result = validateContractVersion(definition);
      expect(result.valid).toBe(true);
      expect(result.contract).toBe('SCHOL-COMPONENT-DEFINITION-v1');
    });

    it('should reject schema without contract field', () => {
      const schema = {
        id: 'test:button',
        name: 'Test Button',
        role: 'button',
        anatomy: { id: 'root', role: 'button', interactive: true, visible: true }
      };

      const result = validateContractVersion(schema);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Schema missing __contract field');
    });

    it('should reject schema with wrong contract version', () => {
      const schema = {
        id: 'test:button',
        name: 'Test Button',
        role: 'button',
        anatomy: { id: 'root', role: 'button', interactive: true, visible: true },
        __contract: 'SCHOL-COMPONENT-DEFINITION-v2'
      };

      const result = validateContractVersion(schema);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Expected contract SCHOL-COMPONENT-DEFINITION-v1');
    });
  });
});

describe('Compose Phase 1 - Feature Flags', () => {
  beforeEach(() => {
    featureFlags.clear();
  });

  describe('Feature Flag Manager', () => {
    it('should have all compose flags initialized as disabled', () => {
      expect(featureFlags.isEnabled(COMPOSE_FLAGS.SCHEMA_REGISTRY)).toBe(false);
      expect(featureFlags.isEnabled(COMPOSE_FLAGS.VOCABULARY)).toBe(false);
      expect(featureFlags.isEnabled(COMPOSE_FLAGS.MIGRATE_BUTTON)).toBe(false);
    });

    it('should enable a feature flag', () => {
      featureFlags.enable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      expect(featureFlags.isEnabled(COMPOSE_FLAGS.SCHEMA_REGISTRY)).toBe(true);
    });

    it('should disable a feature flag', () => {
      featureFlags.enable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      featureFlags.disable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      expect(featureFlags.isEnabled(COMPOSE_FLAGS.SCHEMA_REGISTRY)).toBe(false);
    });

    it('should set a feature flag state', () => {
      featureFlags.set(COMPOSE_FLAGS.SCHEMA_REGISTRY, true);
      expect(featureFlags.isEnabled(COMPOSE_FLAGS.SCHEMA_REGISTRY)).toBe(true);
      
      featureFlags.set(COMPOSE_FLAGS.SCHEMA_REGISTRY, false);
      expect(featureFlags.isEnabled(COMPOSE_FLAGS.SCHEMA_REGISTRY)).toBe(false);
    });

    it('should get a feature flag definition', () => {
      const flag = featureFlags.get(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      expect(flag).toBeDefined();
      expect(flag?.id).toBe(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      expect(flag?.name).toBe('Schema Registry');
    });

    it('should get all feature flags', () => {
      const all = featureFlags.getAll();
      expect(all.length).toBeGreaterThan(0);
    });

    it('should get enabled feature flags', () => {
      featureFlags.enable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      featureFlags.enable(COMPOSE_FLAGS.VOCABULARY);
      
      const enabled = featureFlags.getEnabled();
      expect(enabled.length).toBe(2);
      expect(enabled.map(f => f.id)).toContain(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      expect(enabled.map(f => f.id)).toContain(COMPOSE_FLAGS.VOCABULARY);
    });

    it('should notify listeners on flag change', () => {
      const listener = vi.fn();
      featureFlags.subscribe(listener);
      
      featureFlags.enable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ id: COMPOSE_FLAGS.SCHEMA_REGISTRY })
      );
    });

    it('should unsubscribe listeners', () => {
      const listener = vi.fn();
      const unsubscribe = featureFlags.subscribe(listener);
      
      featureFlags.enable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      expect(listener).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      featureFlags.disable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('should enable all flags', () => {
      featureFlags.enableAll();
      const all = featureFlags.getAll();
      expect(all.every(f => f.enabled)).toBe(true);
    });

    it('should disable all flags', () => {
      featureFlags.enableAll();
      featureFlags.disableAll();
      const all = featureFlags.getAll();
      expect(all.every(f => !f.enabled)).toBe(true);
    });
  });

  describe('useFeatureFlag', () => {
    it('should return flag state and re-render on toggle', () => {
      const { result, rerender } = renderHook(() =>
        useFeatureFlag(COMPOSE_FLAGS.SCHEMA_REGISTRY),
      );
      expect(result.current).toBe(false);

      act(() => {
        featureFlags.enable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      });
      rerender();
      expect(result.current).toBe(true);
    });
  });

  describe('withFeatureFlag', () => {
    it('should execute function when flag is enabled', () => {
      featureFlags.enable(COMPOSE_FLAGS.SCHEMA_REGISTRY);
      
      const fn = vi.fn(() => 'result');
      const gated = withFeatureFlag(COMPOSE_FLAGS.SCHEMA_REGISTRY, fn);
      
      const result = gated();
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
    });

    it('should not execute function when flag is disabled', () => {
      const fn = vi.fn(() => 'result');
      const gated = withFeatureFlag(COMPOSE_FLAGS.SCHEMA_REGISTRY, fn);
      
      const result = gated();
      expect(result).toBeUndefined();
      expect(fn).not.toHaveBeenCalled();
    });

    it('should execute fallback when flag is disabled', () => {
      const fn = vi.fn(() => 'new');
      const fallback = vi.fn(() => 'old');
      const gated = withFeatureFlag(COMPOSE_FLAGS.SCHEMA_REGISTRY, fn, fallback);
      
      const result = gated();
      expect(result).toBe('old');
      expect(fn).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });
  });
});

describe('Compose Phase 1 - Migration Registry', () => {
  beforeEach(() => {
    migrationRegistry.clear();
  });

  describe('Migration Registry', () => {
    it('should register a migration', () => {
      const migration: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'not_started',
        phases: [
          { name: 'schema_proof', complete: false },
          { name: 'behavior_proof', complete: false }
        ],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: ['src/components/Button.tsx']
      };

      migrationRegistry.register(migration);
      expect(migrationRegistry.has('compose:button')).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      const migration: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'not_started',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(migration);
      expect(() => migrationRegistry.register(migration)).toThrow(
        'Migration for compose:button already registered'
      );
    });

    it('should update migration status', () => {
      const migration: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'not_started',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(migration);
      migrationRegistry.updateStatus('compose:button', 'in_progress');
      
      const updated = migrationRegistry.get('compose:button');
      expect(updated?.status).toBe('in_progress');
    });

    it('should set completedAt when status becomes migrated', () => {
      const migration: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'not_started',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(migration);
      migrationRegistry.updateStatus('compose:button', 'migrated');
      
      const updated = migrationRegistry.get('compose:button');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should update migration phase', () => {
      const migration: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'in_progress',
        phases: [
          { name: 'schema_proof', complete: false },
          { name: 'behavior_proof', complete: false }
        ],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(migration);
      migrationRegistry.updatePhase('compose:button', 'schema_proof', {
        complete: true,
        completedAt: '2026-07-19T12:00:00Z'
      });
      
      const updated = migrationRegistry.get('compose:button');
      const phase = updated?.phases.find(p => p.name === 'schema_proof');
      expect(phase?.complete).toBe(true);
      expect(phase?.completedAt).toBe('2026-07-19T12:00:00Z');
    });

    it('should get migrations by status', () => {
      const button: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'migrated',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      const checkbox: ComponentMigration = {
        schemaId: 'compose:checkbox',
        componentName: 'Checkbox',
        status: 'in_progress',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_CHECKBOX,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(button);
      migrationRegistry.register(checkbox);
      
      const migrated = migrationRegistry.getByStatus('migrated');
      expect(migrated).toHaveLength(1);
      expect(migrated[0].schemaId).toBe('compose:button');
    });

    it('should get migration progress', () => {
      const button: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'migrated',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      const checkbox: ComponentMigration = {
        schemaId: 'compose:checkbox',
        componentName: 'Checkbox',
        status: 'in_progress',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_CHECKBOX,
        migratedFiles: [],
        pendingFiles: []
      };

      const switch_: ComponentMigration = {
        schemaId: 'compose:switch',
        componentName: 'Switch',
        status: 'not_started',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_SWITCH,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(button);
      migrationRegistry.register(checkbox);
      migrationRegistry.register(switch_);
      
      const progress = migrationRegistry.getProgress();
      expect(progress.total).toBe(3);
      expect(progress.migrated).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.notStarted).toBe(1);
      expect(progress.percentComplete).toBeCloseTo(33.33, 1);
    });

    it('should check if component is migrated', () => {
      const migration: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'migrated',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(migration);
      expect(migrationRegistry.isMigrated('compose:button')).toBe(true);
      expect(migrationRegistry.isMigrated('compose:checkbox')).toBe(false);
    });

    it('should add issues to migration', () => {
      const migration: ComponentMigration = {
        schemaId: 'compose:button',
        componentName: 'Button',
        status: 'in_progress',
        phases: [],
        owner: 'claude',
        featureFlag: COMPOSE_FLAGS.MIGRATE_BUTTON,
        migratedFiles: [],
        pendingFiles: []
      };

      migrationRegistry.register(migration);
      migrationRegistry.addIssue('compose:button', 'Performance regression');
      migrationRegistry.addIssue('compose:button', 'Accessibility issue');
      
      const updated = migrationRegistry.get('compose:button');
      expect(updated?.issues).toHaveLength(2);
      expect(updated?.issues).toContain('Performance regression');
    });
  });

  describe('createMigration helper', () => {
    it('should create a migration record with default phases', () => {
      const schema: ComponentSchema = {
        id: 'compose:button',
        name: 'Button',
        role: 'button',
        anatomy: { id: 'root', role: 'button', interactive: true, visible: true }
      };

      const migration = createMigration(
        schema,
        'claude',
        COMPOSE_FLAGS.MIGRATE_BUTTON,
        ['src/core/compose/migrated/Button.ts'],
        ['src/components/Button.tsx']
      );

      expect(migration.schemaId).toBe('compose:button');
      expect(migration.componentName).toBe('Button');
      expect(migration.status).toBe('not_started');
      expect(migration.phases).toHaveLength(7);
      expect(migration.owner).toBe('claude');
      expect(migration.featureFlag).toBe(COMPOSE_FLAGS.MIGRATE_BUTTON);
      expect(migration.migratedFiles).toContain('src/core/compose/migrated/Button.ts');
      expect(migration.pendingFiles).toContain('src/components/Button.tsx');
    });
  });

  describe('getMigrationStatusDisplay', () => {
    it('should return display info for each status', () => {
      const statuses: Array<ComponentMigration['status']> = [
        'not_started',
        'in_progress',
        'shadow_mode',
        'canary',
        'migrated',
        'rolled_back'
      ];

      for (const status of statuses) {
        const display = getMigrationStatusDisplay(status);
        expect(display.label).toBeDefined();
        expect(display.color).toBeDefined();
        expect(display.icon).toBeDefined();
      }
    });
  });
});

describe('Compose Phase 1 - Migrated Button', () => {
  beforeEach(() => {
    featureFlags.clear();
    migrationRegistry.clear();
  });

  describe('Button Definition', () => {
    it('should have the correct contract version', () => {
      expect(buttonDefinition.__contract).toBe('SCHOL-COMPONENT-DEFINITION-v1');
    });

    it('should have the correct schema structure', () => {
      expect(buttonDefinition.id).toBe('compose:button');
      expect(buttonDefinition.name).toBe('Button');
      expect(buttonDefinition.role).toBe('button');
      expect(buttonDefinition.anatomy.id).toBe('root');
      expect(buttonDefinition.anatomy.role).toBe('button');
    });

    it('should have accessibility requirements', () => {
      expect(buttonDefinition.accessibility).toBeDefined();
      expect(buttonDefinition.accessibility?.ariaRole).toBe('button');
      expect(buttonDefinition.accessibility?.ariaAttributes).toContain('aria-disabled');
    });
  });

  describe('MigratedButton class', () => {
    it('should create a button instance', () => {
      const button = new MigratedButton();
      expect(button).toBeDefined();
      expect(button.getState()).toBeDefined();
    });

    it('should initialize with default state', () => {
      const button = new MigratedButton();
      const state = button.getState();
      
      expect(state.disabled).toBe(false);
      expect(state.focused).toBe(false);
      expect(state.hovered).toBe(false);
      expect(state.pressed).toBe(false);
      expect(state.loading).toBe(false);
    });

    it('should initialize with props', () => {
      const button = new MigratedButton({
        disabled: true,
        loading: true
      });
      
      const state = button.getState();
      expect(state.disabled).toBe(true);
      expect(state.loading).toBe(true);
    });

    it('should handle focus', () => {
      const button = new MigratedButton();
      button.focus();
      
      const state = button.getState();
      expect(state.focused).toBe(true);
    });

    it('should handle blur', () => {
      const button = new MigratedButton();
      button.focus();
      button.blur();
      
      const state = button.getState();
      expect(state.focused).toBe(false);
    });

    it('should handle hover', () => {
      const button = new MigratedButton();
      button.mouseEnter();
      
      const state = button.getState();
      expect(state.hovered).toBe(true);
    });

    it('should handle click', () => {
      const onClick = vi.fn();
      const button = new MigratedButton({ onClick });
      
      button.click();
      expect(onClick).toHaveBeenCalled();
    });

    it('should not handle click when disabled', () => {
      const onClick = vi.fn();
      const button = new MigratedButton({ disabled: true, onClick });
      
      button.click();
      expect(onClick).not.toHaveBeenCalled();
    });

    it('should not handle click when loading', () => {
      const onClick = vi.fn();
      const button = new MigratedButton({ loading: true, onClick });
      
      button.click();
      expect(onClick).not.toHaveBeenCalled();
    });

    it('should handle keyboard interaction', () => {
      const onClick = vi.fn();
      const button = new MigratedButton({ onClick });
      
      button.keyDown('Enter');
      expect(button.getState().pressed).toBe(true);
      
      button.keyUp('Enter');
      expect(button.getState().pressed).toBe(false);
      expect(onClick).toHaveBeenCalled();
    });

    it('should update props', () => {
      const button = new MigratedButton();
      button.setProps({ disabled: true });
      
      const state = button.getState();
      expect(state.disabled).toBe(true);
    });

    it('should get ARIA attributes', () => {
      const button = new MigratedButton({ disabled: true });
      const aria = button.getAriaAttributes();
      
      expect(aria['aria-disabled']).toBe(true);
      expect(aria.role).toBe('button');
    });

    it('should get CSS class names', () => {
      const button = new MigratedButton({
        variant: 'primary',
        size: 'md',
        disabled: true
      });
      
      const classes = button.getClassNames();
      expect(classes).toContain('compose-button');
      expect(classes).toContain('compose-button--primary');
      expect(classes).toContain('compose-button--md');
      expect(classes).toContain('compose-button--disabled');
    });

    it('should destroy and clean up', () => {
      const button = new MigratedButton();
      expect(() => button.destroy()).not.toThrow();
    });
  });

  describe('Button Migration Registration', () => {
    it('should register the button migration', () => {
      registerButtonMigration();
      
      expect(migrationRegistry.has('compose:button')).toBe(true);
      const migration = migrationRegistry.get('compose:button');
      expect(migration?.componentName).toBe('Button');
      expect(migration?.featureFlag).toBe(COMPOSE_FLAGS.MIGRATE_BUTTON);
    });

    it('should not register twice', () => {
      registerButtonMigration();
      expect(() => registerButtonMigration()).not.toThrow();
    });
  });

  describe('shouldUseMigratedButton', () => {
    it('should return false when flag is disabled', () => {
      expect(shouldUseMigratedButton()).toBe(false);
    });

    it('should return true when flag is enabled', () => {
      featureFlags.enable(COMPOSE_FLAGS.MIGRATE_BUTTON);
      expect(shouldUseMigratedButton()).toBe(true);
    });
  });
});
