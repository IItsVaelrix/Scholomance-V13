/**
 * Migration Registry - Component Migration Tracking
 * 
 * Tracks the migration status of components from the old system to the
 * composed component architecture.
 * 
 * @module compose/migration
 */

/**
 * Migration phase
 */
export type MigrationPhase = {
  name: string;
  complete: boolean;
  completedAt?: string;
};

/**
 * Migration status
 */
export type MigrationStatus = 
  | 'not_started'
  | 'in_progress'
  | 'shadow_mode'
  | 'canary'
  | 'migrated'
  | 'rolled_back'
  | 'blocked';

/**
 * Component migration definition
 */
export type ComponentMigration = {
  /** Schema identifier */
  schemaId: string;
  /** Component name */
  componentName: string;
  /** Current migration status */
  status: MigrationStatus;
  /** Migration phases */
  phases: MigrationPhase[];
  /** Owner (agent or team) */
  owner: string;
  /** Feature flag that controls this migration */
  featureFlag: string;
  /** Files that have been migrated */
  migratedFiles: string[];
  /** Files that still need migration */
  pendingFiles: string[];
  /** Issues discovered during migration */
  issues?: string[];
  /** Components this migration depends on */
  dependencies?: string[];
  /** Date migration started */
  startedAt?: string;
  /** Date migration completed */
  completedAt?: string;
  /** Notes */
  notes?: string;
};

/**
 * Migration registry - tracks component migration status
 */
export class MigrationRegistry {
  private migrations = new Map<string, ComponentMigration>();

  /**
   * Clear all migrations (for testing)
   */
  clear(): void {
    this.migrations.clear();
  }

  /**
   * Register a component for migration
   * Supports two signatures:
   * - register(migration: ComponentMigration)
   * - register(id: string, dependencies: string[])
   */
  register(migrationOrId: ComponentMigration | string, dependencies?: string[]): void {
    if (typeof migrationOrId === 'string') {
      // Simple registration with dependencies
      const id = migrationOrId;
      if (this.migrations.has(id)) {
        throw new Error(`Migration for ${id} already registered`);
      }
      this.migrations.set(id, {
        schemaId: id,
        componentName: id,
        status: 'not_started',
        phases: [
          { name: 'schema_proof', complete: false },
          { name: 'behavior_proof', complete: false },
          { name: 'layout_adapter', complete: false },
          { name: 'token_migration', complete: false },
          { name: 'workflow_proof', complete: false },
          { name: 'constraint_spike', complete: false },
          { name: 'rendering_proof', complete: false },
        ],
        owner: 'claude',
        featureFlag: `compose:migrate:${id}`,
        migratedFiles: [],
        pendingFiles: [],
        issues: [],
        dependencies: dependencies || [],
      });
    } else {
      // Full migration object
      if (this.migrations.has(migrationOrId.schemaId)) {
        throw new Error(`Migration for ${migrationOrId.schemaId} already registered`);
      }
      this.migrations.set(migrationOrId.schemaId, migrationOrId);
    }
  }

  /**
   * Check if a migration exists
   */
  has(schemaId: string): boolean {
    return this.migrations.has(schemaId);
  }

  /**
   * Get a migration by schema ID
   */
  get(schemaId: string): ComponentMigration | undefined {
    return this.migrations.get(schemaId);
  }

  /**
   * Update migration status
   */
  updateStatus(schemaId: string, status: MigrationStatus): void {
    const migration = this.migrations.get(schemaId);
    if (migration) {
      migration.status = status;
      if (status === 'in_progress' && !migration.startedAt) {
        migration.startedAt = new Date().toISOString();
      }
      if (status === 'migrated') {
        migration.completedAt = new Date().toISOString();
      }
    }
  }

  /**
   * Update migration phase or status
   * If phaseName matches a known status, updates the status instead.
   */
  updatePhase(
    schemaId: string,
    phaseName: string,
    options: { complete?: boolean; completedAt?: string } = {}
  ): void {
    const migration = this.migrations.get(schemaId);
    if (migration) {
      // If phaseName is a known status, update status
      const statuses: MigrationStatus[] = ['not_started', 'in_progress', 'shadow_mode', 'canary', 'migrated', 'rolled_back', 'blocked'];
      if (statuses.includes(phaseName as MigrationStatus)) {
        migration.status = phaseName as MigrationStatus;
        if (phaseName === 'migrated') {
          migration.completedAt = new Date().toISOString();
        }
        return;
      }

      // Otherwise update the phase
      const phase = migration.phases.find(p => p.name === phaseName);
      if (phase) {
        if (options.complete !== undefined) {
          phase.complete = options.complete;
        }
        if (options.completedAt !== undefined) {
          phase.completedAt = options.completedAt;
        }
      }
    }
  }

  /**
   * Check if a component can be migrated (all dependencies are migrated)
   */
  canMigrate(schemaId: string): boolean {
    const migration = this.migrations.get(schemaId);
    if (!migration) return false;
    
    const deps = migration.dependencies || [];
    return deps.every(dep => {
      const depMigration = this.migrations.get(dep);
      return depMigration?.status === 'migrated';
    });
  }

  /**
   * Detect circular dependencies in the migration graph
   */
  detectCircularDependencies(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (id: string, path: string[]): void => {
      if (inStack.has(id)) {
        // Found a cycle
        const cycleStart = path.indexOf(id);
        cycles.push(path.slice(cycleStart));
        return;
      }
      if (visited.has(id)) return;

      visited.add(id);
      inStack.add(id);
      path.push(id);

      const migration = this.migrations.get(id);
      const deps = migration?.dependencies || [];
      for (const dep of deps) {
        dfs(dep, [...path]);
      }

      inStack.delete(id);
    };

    for (const id of this.migrations.keys()) {
      if (!visited.has(id)) {
        dfs(id, []);
      }
    }

    return cycles;
  }

  /**
   * Get topologically sorted migration order
   */
  getMigrationOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) return; // Circular dependency, skip

      visiting.add(id);

      const migration = this.migrations.get(id);
      const deps = migration?.dependencies || [];
      for (const dep of deps) {
        visit(dep);
      }

      visiting.delete(id);
      visited.add(id);
      order.push(id);
    };

    for (const id of this.migrations.keys()) {
      visit(id);
    }

    return order;
  }

  /**
   * Get migrations by status
   */
  getByStatus(status: MigrationStatus): ComponentMigration[] {
    return Array.from(this.migrations.values()).filter(m => m.status === status);
  }

  /**
   * Get progress summary
   */
  getProgress(): {
    total: number;
    migrated: number;
    inProgress: number;
    blocked: number;
    notStarted: number;
    percentComplete: number;
  } {
    const all = Array.from(this.migrations.values());
    const migrated = all.filter(m => m.status === 'migrated').length;
    const inProgress = all.filter(m => m.status === 'in_progress').length;
    const blocked = all.filter(m => m.status === 'blocked').length;
    const notStarted = all.filter(m => m.status === 'not_started').length;
    const percentComplete = all.length > 0 ? (migrated / all.length) * 100 : 0;

    return {
      total: all.length,
      migrated,
      inProgress,
      blocked,
      notStarted,
      percentComplete,
    };
  }

  /**
   * Check if a component is migrated
   */
  isMigrated(schemaId: string): boolean {
    const migration = this.migrations.get(schemaId);
    return migration?.status === 'migrated';
  }

  /**
   * Add an issue to a migration
   */
  addIssue(schemaId: string, description: string): void {
    const migration = this.migrations.get(schemaId);
    if (migration) {
      if (!migration.issues) {
        migration.issues = [];
      }
      migration.issues.push(description);
    }
  }

  /**
   * Get all migrations
   */
  getAll(): ComponentMigration[] {
    return Array.from(this.migrations.values());
  }
}

/**
 * Singleton migration registry instance
 */
export const migrationRegistry = new MigrationRegistry();

/**
 * Helper to create a component migration
 * Accepts either a ComponentSchema object or a schemaId string as first arg
 */
export function createMigration(
  schemaOrId: { id: string; name: string } | string,
  ownerOrFlag: string,
  featureFlagOrMigrated?: string | string[],
  migratedOrPending?: string[],
  pendingFiles?: string[]
): ComponentMigration {
  // Support both signatures:
  // createMigration(schema, owner, featureFlag, migratedFiles, pendingFiles)
  // createMigration(schemaId, componentName, featureFlag, owner)
  let schemaId: string;
  let componentName: string;
  let owner: string;
  let featureFlag: string;
  let migratedFiles: string[];
  let pending: string[];

  if (typeof schemaOrId === 'string') {
    // Legacy signature: (schemaId, componentName, featureFlag, owner)
    schemaId = schemaOrId;
    componentName = ownerOrFlag;
    featureFlag = (featureFlagOrMigrated as string) || '';
    owner = (migratedOrPending as string) || 'claude';
    migratedFiles = [];
    pending = [];
  } else {
    // New signature: (schema, owner, featureFlag, migratedFiles, pendingFiles)
    schemaId = schemaOrId.id;
    componentName = schemaOrId.name;
    owner = ownerOrFlag;
    featureFlag = (featureFlagOrMigrated as string) || '';
    migratedFiles = (migratedOrPending as string[]) || [];
    pending = pendingFiles || [];
  }

  return {
    schemaId,
    componentName,
    status: 'not_started',
    phases: [
      { name: 'schema_proof', complete: false },
      { name: 'behavior_proof', complete: false },
      { name: 'layout_adapter', complete: false },
      { name: 'token_migration', complete: false },
      { name: 'workflow_proof', complete: false },
      { name: 'constraint_spike', complete: false },
      { name: 'rendering_proof', complete: false },
    ],
    owner,
    featureFlag,
    migratedFiles,
    pendingFiles: pending,
    issues: [],
  };
}

/**
 * Migration status display info
 */
export type MigrationStatusDisplay = {
  label: string;
  color: string;
  icon: string;
};

/**
 * Get migration status display info
 */
export function getMigrationStatusDisplay(status: string): MigrationStatusDisplay {
  const displays: Record<string, MigrationStatusDisplay> = {
    not_started: { label: 'Not Started', color: 'gray', icon: '⚪' },
    in_progress: { label: 'In Progress', color: 'yellow', icon: '🟡' },
    shadow_mode: { label: 'Shadow Mode', color: 'blue', icon: '🔵' },
    canary: { label: 'Canary', color: 'purple', icon: '🟣' },
    migrated: { label: 'Migrated', color: 'green', icon: '🟢' },
    rolled_back: { label: 'Rolled Back', color: 'red', icon: '🔴' },
    blocked: { label: 'Blocked', color: 'red', icon: '🔴' },
  };
  
  return displays[status] ?? { label: status, color: 'gray', icon: '⚪' };
}
