/**
 * @polaris/defold-bridge — TypeScript bridge for the Defold sovereign runtime.
 *
 * Defold Bridge Design §"Components / defold-bridge":
 *   - wire.ts: SealedScenePacket → Lua-safe JSON (no nulls, explicit counts)
 *   - receipt.ts: parse Defold claims, mint and compare receipts
 *
 * This package is pure TypeScript. It has no Defold, Lua, or WebSocket imports.
 */

export {
  toLuaWire,
  serializeWirePacket,
  assertNoNulls,
} from "./wire.js";
export type {
  LuaWirePacket,
  LuaWireSprite,
  LuaWireHotspot,
  LuaWireText,
} from "./wire.js";

export {
  parseDefoldClaim,
  mintDefoldReceipt,
  crossEngineReceiptsEqual,
} from "./receipt.js";
export type { DefoldRawClaim } from "./receipt.js";
