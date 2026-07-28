/**
 * @polaris/realtime-protocol
 *
 * WebSocket message serialization, validation, and envelope helpers.
 * Adapters layer — may import contracts but NOT kernel internals.
 */

export { MessageCodec } from "./MessageCodec.js";
export { ConnectionRegistry } from "./ConnectionRegistry.js";
export type { Connection, SendFn } from "./ConnectionRegistry.js";
