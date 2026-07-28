/**
 * @polaris/contracts
 *
 * Core domain types and schemas for Polaris OS (Codex Vale).
 * This package is the root of the dependency law:
 *   contracts ← world-kernel ← projectors/adapters ← applications
 *
 * NO infrastructure imports allowed here. Pure types + Zod schemas only.
 */

export * from "./world-state.js";
export * from "./commands.js";
export * from "./events.js";
export * from "./scene-manifest.js";
export * from "./protocol.js";
export * from "./resolution-context.js";
export * from "./transaction.js";
