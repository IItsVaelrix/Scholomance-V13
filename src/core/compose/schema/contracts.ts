/**
 * Canonical Contract Definitions
 * 
 * Defines the official contract names and versions for the Composed Component Architecture.
 * These are the Source of Truth for data shapes flowing between layers.
 * 
 * Per PDR-2026-07-19-COMPOSED-COMPONENT-ARCHITECTURE-V2:
 * - JSON Schema 2020-12 is the source of truth
 * - Canonical packets contain intent, not library objects
 * - Contract names follow the pattern: SCHOL-{NAME}-v{VERSION}
 * 
 * FIX: Contracts are now compile-time constants, not a runtime registry.
 * Canonical contracts are immutable and discoverable. You can't accidentally
 * register a duplicate or forget to register a contract.
 * 
 * @module compose/schema/contracts
 */

import type { ComponentSchema } from './ComponentSchema';

/**
 * Contract version metadata
 */
export interface ContractVersion {
  /** Contract identifier (e.g., 'SCHOL-COMPONENT-DEFINITION') */
  readonly contractId: string;
  /** Version string (e.g., 'v1') */
  readonly version: string;
  /** Full contract name (e.g., 'SCHOL-COMPONENT-DEFINITION-v1') */
  readonly fullName: string;
  /** JSON Schema URI for validation */
  readonly schemaUri: string;
  /** Human-readable description */
  readonly description: string;
  /** Date when this version was established */
  readonly establishedDate: string;
  /** Whether this version is currently active */
  readonly active: boolean;
}

// ─── Canonical Contracts (compile-time constants) ───────────────────────────

/**
 * SCHOL-COMPONENT-DEFINITION-v1
 * 
 * The canonical contract for component semantic definitions.
 * This is the Source of Truth for "what is this thing" before layout, behavior, or rendering.
 */
export const SCHOL_COMPONENT_DEFINITION_V1: ContractVersion = {
  contractId: 'SCHOL-COMPONENT-DEFINITION',
  version: 'v1',
  fullName: 'SCHOL-COMPONENT-DEFINITION-v1',
  schemaUri: 'https://scholomance.dev/schemas/SCHOL-COMPONENT-DEFINITION-v1.json',
  description: 'Component semantic definition - the declarative source of truth for component meaning',
  establishedDate: '2026-07-19',
  active: true,
} as const;

/**
 * PB-UI-SCENE-v1
 * 
 * The canonical contract for UI scene graphs.
 * Defines the spatial arrangement of components with identity derivation.
 */
export const PB_UI_SCENE_V1: ContractVersion = {
  contractId: 'PB-UI-SCENE',
  version: 'v1',
  fullName: 'PB-UI-SCENE-v1',
  schemaUri: 'https://scholomance.dev/schemas/PB-UI-SCENE-v1.json',
  description: 'UI scene graph - spatial arrangement of components with deterministic identity',
  establishedDate: '2026-07-19',
  active: true,
} as const;

/**
 * PB-LAYOUT-v1
 * 
 * The canonical contract for layout intents.
 * Defines how components are placed relative to each other.
 */
export const PB_LAYOUT_V1: ContractVersion = {
  contractId: 'PB-LAYOUT',
  version: 'v1',
  fullName: 'PB-LAYOUT-v1',
  schemaUri: 'https://scholomance.dev/schemas/PB-LAYOUT-v1.json',
  description: 'Layout intent - declarative specification of component placement',
  establishedDate: '2026-07-19',
  active: true,
} as const;

/**
 * PB-UI-EVENT-v1
 * 
 * The canonical contract for UI events.
 * Defines the shape of events flowing through the component system.
 */
export const PB_UI_EVENT_V1: ContractVersion = {
  contractId: 'PB-UI-EVENT',
  version: 'v1',
  fullName: 'PB-UI-EVENT-v1',
  schemaUri: 'https://scholomance.dev/schemas/PB-UI-EVENT-v1.json',
  description: 'UI event - canonical event shape with causal chain tracking',
  establishedDate: '2026-07-19',
  active: true,
} as const;

// ─── Compile-time Contract Map ───────────────────────────────────────────────

/**
 * All canonical contracts as a compile-time constant map.
 * This replaces the runtime ContractRegistry — contracts are immutable
 * and discoverable at compile time.
 */
export const CANONICAL_CONTRACTS = {
  'SCHOL-COMPONENT-DEFINITION-v1': SCHOL_COMPONENT_DEFINITION_V1,
  'PB-UI-SCENE-v1': PB_UI_SCENE_V1,
  'PB-LAYOUT-v1': PB_LAYOUT_V1,
  'PB-UI-EVENT-v1': PB_UI_EVENT_V1,
} as const;

/**
 * Type-level map of contract names to their versions
 */
export type CanonicalContractMap = typeof CANONICAL_CONTRACTS;

/**
 * Union of all canonical contract names
 */
export type CanonicalContractName = keyof CanonicalContractMap;

/**
 * Type alias for the canonical component definition contract
 */
export type SCHOL_COMPONENT_DEFINITION_V1 = ComponentSchema;

// ─── Runtime Contract Registry ───────────────────────────────────────────────

/**
 * Contract registry - runtime registry for managing contract versions.
 * Initialized with canonical contracts, but allows registration of new versions
 * for testing and extensibility.
 */
export class ContractRegistry {
  private contracts = new Map<string, ContractVersion>();

  constructor() {
    // Initialize with canonical contracts
    this.register(SCHOL_COMPONENT_DEFINITION_V1);
    this.register(PB_UI_SCENE_V1);
    this.register(PB_LAYOUT_V1);
    this.register(PB_UI_EVENT_V1);
  }

  /**
   * Clear all registered contracts (for testing)
   */
  clear(): void {
    this.contracts.clear();
  }

  /**
   * Register a contract version
   */
  register(contract: ContractVersion): void {
    if (this.contracts.has(contract.fullName)) {
      throw new Error(`Contract ${contract.fullName} already registered`);
    }
    this.contracts.set(contract.fullName, contract);
  }

  /**
   * Check if a contract is registered
   */
  has(fullName: string): boolean {
    return this.contracts.has(fullName);
  }

  /**
   * Get a contract by full name
   */
  get(fullName: string): ContractVersion | undefined {
    return this.contracts.get(fullName);
  }

  /**
   * Get the active version of a contract by base ID
   */
  getActive(contractId: string): ContractVersion | undefined {
    for (const contract of this.contracts.values()) {
      if (contract.contractId === contractId && contract.active) {
        return contract;
      }
    }
    return undefined;
  }

  /**
   * Get all registered contracts
   */
  getAll(): ContractVersion[] {
    return Array.from(this.contracts.values());
  }

  /**
   * Get all active contracts
   */
  getActiveContracts(): ContractVersion[] {
    return Array.from(this.contracts.values()).filter(c => c.active);
  }
}

/**
 * Singleton contract registry instance
 */
export const contractRegistry = new ContractRegistry();

/**
 * Check if an object is a valid ContractVersion
 */
export function isContractVersion(contract: unknown): contract is ContractVersion {
  if (typeof contract !== 'object' || contract === null) {
    return false;
  }
  const c = contract as Record<string, unknown>;
  return (
    typeof c.contractId === 'string' &&
    typeof c.version === 'string' &&
    typeof c.fullName === 'string' &&
    typeof c.schemaUri === 'string' &&
    typeof c.description === 'string' &&
    typeof c.establishedDate === 'string' &&
    typeof c.active === 'boolean'
  );
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Helper to create a versioned component definition
 * Ensures the contract version is attached to the schema
 */
export function createComponentDefinition(
  schema: ComponentSchema,
  contractVersion: ContractVersion = SCHOL_COMPONENT_DEFINITION_V1
): ComponentSchema & { __contract: string } {
  return {
    ...schema,
    __contract: contractVersion.fullName
  };
}

/**
 * Validate that a schema conforms to a specific contract version
 */
export function validateContractVersion(
  schema: unknown,
  expectedContract: string = SCHOL_COMPONENT_DEFINITION_V1.fullName
): { valid: boolean; contract?: string; error?: string } {
  if (typeof schema !== 'object' || schema === null) {
    return { valid: false, error: 'Schema must be an object' };
  }

  const schemaObj = schema as Record<string, unknown>;
  const contract = schemaObj.__contract as string | undefined;

  if (!contract) {
    return { valid: false, error: 'Schema missing __contract field' };
  }

  if (contract !== expectedContract) {
    return { valid: false, contract, error: `Expected contract ${expectedContract}, got ${contract}` };
  }

  return { valid: true, contract };
}
