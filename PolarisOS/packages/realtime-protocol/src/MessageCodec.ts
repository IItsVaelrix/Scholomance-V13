/**
 * MessageCodec — serialize/deserialize WebSocket messages with validation.
 */

import { ClientMessageSchema } from "@polaris/contracts";
import type { ClientMessage } from "@polaris/contracts";

export class MessageCodec {
  /**
   * Decode and validate an incoming raw WebSocket message.
   * Throws on invalid messages (PDR §21: reject unknown message types).
   */
  decode(raw: string): ClientMessage {
    const parsed = JSON.parse(raw);
    return ClientMessageSchema.parse(parsed);
  }

  /**
   * Encode a server message for transmission.
   */
  encode(message: unknown): string {
    return JSON.stringify(message);
  }
}
