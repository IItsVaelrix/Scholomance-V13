/**
 * Domain Event contracts — PDR §12
 *
 * Events are the immutable record of everything that happens in the world.
 * They are append-only and replayable for state reconstruction.
 */

import { z } from "zod";

// --- Event Types (§12.2) ---

export const EventTypeSchema = z.enum([
  "PLAYER_ENTERED_ROOM",
  "PLAYER_LEFT_ROOM",
  "PLAYER_CONNECTED",
  "PLAYER_DISCONNECTED",
  "ENTITY_TAKEN",
  "ENTITY_DROPPED",
  "ENTITY_ACTIVATED",
  "ROOM_FLAG_CHANGED",
  "PLAYER_SPOKE",
  "COMMAND_REFUSED",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

// --- Base Event (§12.1) ---

export const DomainEventSchema = z.object({
  eventId: z.string(),
  worldId: z.string(),
  roomId: z.string().nullable(),
  sequence: z.number().int().nonnegative(),
  worldRevision: z.number().int().nonnegative(),
  eventType: EventTypeSchema,
  actorId: z.string().nullable(),
  payload: z.unknown(),
  rulesetVersion: z.string(),
  occurredAt: z.string().datetime(),
});
export type DomainEvent<TPayload = unknown> = Omit<
  z.infer<typeof DomainEventSchema>,
  "payload"
> & { payload: TPayload };

// --- Payload types ---

export interface PlayerEnteredPayload {
  playerId: string;
  displayName: string;
  fromRoomId: string | null;
}

export interface PlayerLeftPayload {
  playerId: string;
  displayName: string;
  toRoomId: string | null;
}

export interface EntityTakenPayload {
  entityId: string;
  entityName: string;
  fromRoomId: string;
}

export interface EntityDroppedPayload {
  entityId: string;
  entityName: string;
  toRoomId: string;
}

export interface EntityActivatedPayload {
  entityId: string;
  entityName: string;
  activation: string;
}

export interface RoomFlagChangedPayload {
  flagKey: string;
  oldValue: boolean | string | number | null;
  newValue: boolean | string | number;
}

export interface PlayerSpokePayload {
  playerId: string;
  displayName: string;
  message: string;
}

export interface CommandRefusedPayload {
  commandId: string;
  refusal: string;
  rawInput: string;
}
