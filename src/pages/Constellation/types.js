/**
 * Deprecated type shim — CANONICAL HOME is src/hooks/constellation.types.js.
 *
 * LAW-LAYER-002 repair (2026-08-17): the packet contract moved to src/hooks/
 * (Codex-owned jurisdiction, legally consumable by the UI) so the codex server
 * no longer points upward into src/pages for its schema. This file is kept only
 * as a type-only alias so any straggler reference resolves; new code should
 * import from '../../hooks/constellation.types.js' directly.
 *
 * @typedef {import('../../hooks/constellation.types.js').ConstellationQueryKind} ConstellationQueryKind
 * @typedef {import('../../hooks/constellation.types.js').ConstellationPhase1Packet} ConstellationPhase1Packet
 */
export {};
