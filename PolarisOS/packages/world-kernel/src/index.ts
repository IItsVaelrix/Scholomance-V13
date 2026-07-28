/**
 * @polaris/world-kernel
 *
 * The authoritative deterministic world simulation kernel.
 *
 * LAW: This package may NOT import:
 *   - Fastify, WebSocket, SQLite, PixiJS, browser APIs, image SDKs, UI
 *
 * It receives state + commands and produces domain events. Pure logic only.
 *   State + Command + Ruleset = Domain Events  (PDR §5.2)
 */

export { WorldKernel } from "./WorldKernel.js";
export { CommandResolver } from "./CommandResolver.js";
export { applyEvents } from "./applyEvents.js";
export { createInitialState, registerPlayer } from "./createInitialState.js";
export type { KernelConfig } from "./WorldKernel.js";
export type { WorldDefinition, RoomDefinition, EntityDefinition } from "./createInitialState.js";
