/**
 * Compose packet API — PDR Phase 1 public surface.
 */

export type * from './schema/packets';
export {
  canonicalizePacket,
  checksumCanonical,
  assertNoRuntimeLibraryObjects,
} from './schema/canonicalize';
export { emitPbUiScene, rehashScene, sceneToCanonicalJson } from './scene/emit-scene';
export { emitPbLayout, lowerFlowToCss, lowerCommonToCss, lowerGridToCss } from './layout/emit-layout';
export { emitPbUiEvent } from './behavior/emit-event';
export {
  createScrollEditorToolbarScene,
  createScrollEditorToolbarDefinition,
  SCROLL_EDITOR_TOOLBAR_ID,
  SCROLL_EDITOR_TOOLBAR_KIND,
  TOOLBAR_ACTIONS,
} from './migrated/ScrollEditorToolbar';
export {
  createUpdateLedgerScene,
  createUpdateLedgerDefinition,
  UPDATE_LEDGER_ID,
  UPDATE_LEDGER_KIND,
  registerUpdateLedgerMigration,
} from './migrated/UpdateLedger';
export {
  createEnterPortalScene,
  createEnterPortalDefinition,
  ENTER_PORTAL_ID,
  ENTER_PORTAL_KIND,
  registerEnterPortalMigration,
} from './migrated/EnterPortal';
export {
  createGalaxyBackdropScene,
  createGalaxyBackdropDefinition,
  GALAXY_BACKDROP_ID,
  GALAXY_BACKDROP_KIND,
  registerGalaxyBackdropMigration,
} from './migrated/GalaxyBackdrop';
export {
  createReadTopBarScene,
  createReadTopBarDefinition,
  createReadStatusBarScene,
  createReadStatusBarDefinition,
  READ_TOP_BAR_ID,
  READ_TOP_BAR_KIND,
  READ_STATUS_BAR_ID,
  READ_STATUS_BAR_KIND,
  registerReadChromeMigration,
} from './migrated/ReadChrome';
export {
  createOracleTerminalScene,
  createOracleTerminalDefinition,
  ORACLE_TERMINAL_ID,
  ORACLE_TERMINAL_KIND,
  registerOracleTerminalMigration,
} from './migrated/OracleTerminal';
export {
  createConstellationResultScene,
  createConstellationResultDefinition,
  CONSTELLATION_RESULT_ID,
  CONSTELLATION_RESULT_KIND,
  CONSTELLATION_RESULT_VERSION,
  RESULT_PARTS,
} from './migrated/ConstellationResult';
export { validateComposeScene } from './validate/scene';
export { renderSceneToDomSpec, type DomNodeSpec } from './render/dom-adapter';
