/**
 * decodeServerMessage — quarantine decoding for inbound WebSocket frames.
 *
 * Never throws. Malformed JSON and schema-invalid payloads are quarantined
 * into a diagnostic so the last valid state is preserved (design §11.1).
 */

import { ServerMessageSchema, type ServerMessage } from "@polaris/contracts";

export type DecodeDiagnosticCode =
  | "POLARIS_PROTOCOL_MALFORMED_JSON"
  | "POLARIS_PROTOCOL_INVALID_MESSAGE";

export type DecodeServerMessageResult =
  | { ok: true; message: ServerMessage }
  | {
      ok: false;
      diagnostic: {
        code: DecodeDiagnosticCode;
        message: string;
      };
    };

export function decodeServerMessage(raw: string): DecodeServerMessageResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      diagnostic: {
        code: "POLARIS_PROTOCOL_MALFORMED_JSON",
        message: err instanceof Error ? err.message : "Unparseable JSON frame",
      },
    };
  }

  const result = ServerMessageSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first ? first.path.join(".") : "(root)";
    return {
      ok: false,
      diagnostic: {
        code: "POLARIS_PROTOCOL_INVALID_MESSAGE",
        message: `Invalid message at ${path}: ${first?.message ?? "schema mismatch"}`,
      },
    };
  }

  return { ok: true, message: result.data };
}
