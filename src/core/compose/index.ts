/**
 * Composed Component Architecture
 * 
 * A five-layer architecture for building accessible, composable UI components:
 * 1. Meaning (Semantic Schema) - SCDL + JSON Schema 2020-12
 * 2. Anatomy (Component Vocabulary) - Open UI + WAI-ARIA
 * 3. Placement (Layout) - Taffy + Cassowary
 * 4. Behavior (State Machines) - Zag.js + XState
 * 5. Appearance (Rendering) - DOM + Skia + WAND
 * 
 * @module compose
 */

// Schema layer
export type {
  ComponentRole,
  ComponentState,
  ComponentAnatomy,
  ComponentSchema,
  ComponentInstance,
  ComponentSchemaRegistry
} from './schema/ComponentSchema';

export { schemaRegistry } from './schema/ComponentSchema';

export {
  componentRoleSchema,
  componentStateSchema,
  componentAnatomySchema,
  componentSchemaSchema,
  componentInstanceSchema,
  validateSchema,
  validateComponentSchema,
  validateComponentState
} from './schema/json-schemas';

// Vocabulary layer
export {
  buttonSchema,
  checkboxSchema,
  switchSchema,
  tabsSchema,
  dialogSchema,
  inputSchema,
  sliderSchema,
  tooltipSchema,
  toolbarSchema,
  registerVocabulary,
  getVocabularyByRole
} from './vocabulary';

// Layout layer
export type {
  LayoutAlgorithm,
  LayoutIntent,
  Constraint,
  LayoutNode,
  LayoutResult,
  ConstraintViolation
} from './layout';

export {
  TaffyLayoutEngine,
  CassowarySolver,
  LayoutEngine
} from './layout';

// Behavior layer
export type {
  BehaviorContext,
  BehaviorEvent,
  BehaviorTransition,
  BehaviorMachine,
  BehaviorService
} from './behavior';

export {
  createButtonMachine,
  createCheckboxMachine,
  createSwitchMachine,
  createTabsMachine,
  createDialogMachine,
  createBehaviorService
} from './behavior';

// Workflow layer
export type {
  WorkflowEvent,
  WorkflowContext,
  WorkflowState,
  WorkflowAction,
  WorkflowGuard,
  WorkflowTransition,
  WorkflowStateNode,
  WorkflowMachine,
  WorkflowService
} from './workflow';

export {
  createNavigationWorkflow,
  createFormWorkflow,
  createWorkflowService
} from './workflow';

// Token layer
export type {
  TokenType,
  DesignToken,
  TokenGroup,
  DesignTokenDictionary,
  TokenResolver
} from './tokens';

export {
  defaultTokens,
  tokenResolver,
  getToken,
  getAllTokens
} from './tokens';

// Scene layer
export type {
  SceneNodeType,
  Material,
  Transform,
  SceneNode,
  SceneGraph,
  SceneBuilder
} from './scene';

export {
  layoutToScene,
  createSceneBuilder
} from './scene';

// Render layer
export type {
  RenderTarget,
  RenderOptions,
  Renderer
} from './render';

export {
  DOMRenderer,
  CanvasRenderer,
  SkiaStubRenderer,
  VelloStubRenderer,
  createRenderer,
  listRendererBackends,
  negotiateRenderer,
  negotiateSceneCapabilities,
  compareSemanticGeometry,
  mountHybridAttachment,
  collectSceneAttachments,
  probeSkiaAdapter,
  probeVelloAdapter,
  renderSceneToDomSpec,
} from './render';

// Validation layer
export type {
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
  ValidationRule,
  ValidationContext,
  ValidationEngine
} from './validate';

export {
  accessibleNameRule,
  keyboardInteractionRule,
  uniqueIdsRule,
  validDimensionsRule,
  colorContrastRule,
  createValidationEngine,
  validationEngine,
  validateComponent,
  validateScene,
  auditComposeA11y,
  formatA11yAuditSummary,
} from './validate';

// Canonical contracts (SCHOL-COMPONENT-DEFINITION-v1)
export type {
  ContractVersion
} from './schema/contracts';

export {
  SCHOL_COMPONENT_DEFINITION_V1,
  PB_UI_SCENE_V1,
  PB_LAYOUT_V1,
  PB_UI_EVENT_V1,
  contractRegistry,
  createComponentDefinition,
  validateContractVersion
} from './schema/contracts';

// Packet emit API (PDR Phase 1)
export {
  canonicalizePacket,
  assertNoRuntimeLibraryObjects,
  emitPbUiScene,
  emitPbLayout,
  emitPbUiEvent,
  createScrollEditorToolbarScene,
  createScrollEditorToolbarDefinition,
  validateComposeScene,
  renderSceneToDomSpec,
  lowerFlowToCss,
} from './packets';

export type {
  PbUiSceneV1,
  PbLayoutV1,
  PbUiEventV1,
  ScholComponentDefinitionV1,
  DomNodeSpec,
} from './packets';

// Feature flags
export type {
  FeatureFlag,
  FeatureFlagName as ComposeFlagId,
} from './flags';

export {
  COMPOSE_FLAGS,
  syncComposeFlagsFromWindow,
  reapplyComposeFlagOverrides,
  featureFlags,
  useFeatureFlag,
  withFeatureFlag
} from './flags';

// Migration registry
export type {
  MigrationStatus,
  MigrationPhase,
  ComponentMigration
} from './migration';

export {
  migrationRegistry,
  createMigration,
  getMigrationStatusDisplay
} from './migration';

// Migrated components
export {
  MigratedButton,
  buttonDefinition,
  registerButtonMigration,
  shouldUseMigratedButton
} from './migrated/Button';

export type {
  ButtonProps,
  ButtonState
} from './migrated/Button';

export {
  SCROLL_EDITOR_TOOLBAR_ID,
  SCROLL_EDITOR_TOOLBAR_KIND,
  TOOLBAR_ACTIONS,
  registerToolbarMigration,
  shouldUseComposeScrollEditorToolbar,
} from './migrated/ScrollEditorToolbar';

export {
  UPDATE_LEDGER_ID,
  UPDATE_LEDGER_KIND,
  createUpdateLedgerScene,
  createUpdateLedgerDefinition,
  registerUpdateLedgerMigration,
  shouldUseComposeUpdateLedger,
} from './migrated/UpdateLedger';

export {
  ENTER_PORTAL_ID,
  ENTER_PORTAL_KIND,
  createEnterPortalScene,
  createEnterPortalDefinition,
  registerEnterPortalMigration,
  shouldUseComposeEnterPortal,
} from './migrated/EnterPortal';

export {
  GALAXY_BACKDROP_ID,
  GALAXY_BACKDROP_KIND,
  createGalaxyBackdropScene,
  createGalaxyBackdropDefinition,
  registerGalaxyBackdropMigration,
  shouldUseComposeGalaxyBackdrop,
} from './migrated/GalaxyBackdrop';

export {
  ComposeScrollEditorToolbar,
} from './migrated/ComposeScrollEditorToolbar';

export { ComposeEnterPortal } from './migrated/ComposeEnterPortal';
export { ComposeUpdateLedger } from './migrated/ComposeUpdateLedger';
export { ComposeGalaxyBackdrop } from './migrated/ComposeGalaxyBackdrop';
export type { ComposeGalaxyBackdropProps } from './migrated/ComposeGalaxyBackdrop';
export {
  resolveVisibleToolbarActions,
  dispatchToolbarEvent,
  mapTopBarPropsToToolbarBridge,
} from './migrated/toolbar-bridge';

export type {
  ToolbarActionId,
  ScrollEditorToolbarHandlers,
  ToolbarVisibilityInput,
  TopBarBridgeProps,
} from './migrated/toolbar-bridge';

/**
 * Feature flag check
 */
export function isComposeEnabled(): boolean {
  return typeof window !== 'undefined' && 
         (window as any).__COMPOSE_ENABLED__ === true;
}

/**
 * Enable the Compose architecture
 */
export function enableCompose(): void {
  if (typeof window !== 'undefined') {
    (window as any).__COMPOSE_ENABLED__ = true;
  }
}

/**
 * Disable the Compose architecture
 */
export function disableCompose(): void {
  if (typeof window !== 'undefined') {
    (window as any).__COMPOSE_ENABLED__ = false;
  }
}

/**
 * Initialize the Compose architecture
 * Registers vocabulary and sets up global state
 */
export function initCompose(): void {
  if (!isComposeEnabled()) {
    enableCompose();
  }
  
  // Register vocabulary schemas
  const { registerVocabulary } = require('./vocabulary');
  registerVocabulary();
}
