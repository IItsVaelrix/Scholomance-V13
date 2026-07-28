/**
 * Realtime Protocol contracts — PDR §17
 *
 * Defines the WebSocket message shapes for client ↔ server communication.
 */

import { z } from "zod";
import { RoomStateSchema, EntityStateSchema, PlayerStateSchema } from "./world-state.js";
import { DomainEventSchema } from "./events.js";
import { SceneManifestSchema } from "./scene-manifest.js";

// --- Revision Envelope (§17.3) ---

export const RevisionEnvelopeSchema = z.object({
  worldId: z.string(),
  roomId: z.string(),
  sequence: z.number().int().nonnegative(),
  roomRevision: z.number().int().nonnegative(),
});
export type RevisionEnvelope = z.infer<typeof RevisionEnvelopeSchema>;

// --- Client Messages (§17.1) ---

export const ConnectionIdentifySchema = z.object({
  type: z.literal("connection.identify"),
  playerId: z.string(),
  token: z.string().optional(),
});

export const RoomJoinSchema = z.object({
  type: z.literal("room.join"),
  playerId: z.string(),
  roomId: z.string(),
});

export const StateResyncRequestSchema = z.object({
  type: z.literal("state.resync.request"),
  playerId: z.string(),
  roomId: z.string(),
  lastSequence: z.number().int().nonnegative(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  ConnectionIdentifySchema,
  RoomJoinSchema,
  z.object({
    type: z.literal("command.submit"),
    commandId: z.string(),
    playerId: z.string(),
    roomId: z.string(),
    expectedRevision: z.number().int().nonnegative(),
    rawInput: z.string().max(500),
  }),
  z.object({
    type: z.literal("chat.send"),
    playerId: z.string(),
    roomId: z.string(),
    message: z.string().max(1000),
  }),
  StateResyncRequestSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// --- Display-only catalogs (non-authoritative convenience fields) ---

export const RoomInfoSchema = z.object({
  title: z.string(),
  description: z.string(),
  exits: z.record(
    z.string(),
    z.object({
      direction: z.string(),
      label: z.string(),
    }),
  ),
  illustration: z
    .object({
      backgroundAsset: z.string().optional(),
      ambientEffects: z.array(z.string()).optional(),
    })
    .optional(),
});
export type RoomInfo = z.infer<typeof RoomInfoSchema>;

export const EntityInfoSchema = z.object({
  displayName: z.string(),
  description: z.string(),
  illustration: z
    .object({
      asset: z.string().optional(),
      activatedAsset: z.string().optional(),
      layerType: z.string().optional(),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      interactable: z.boolean().optional(),
      hotspotCommand: z.string().optional(),
    })
    .optional(),
});
export type EntityInfo = z.infer<typeof EntityInfoSchema>;

// --- Server Messages (§17.2) ---

export const ServerMessageTypeSchema = z.enum([
  "connection.ready",
  "room.snapshot",
  "command.accepted",
  "command.refused",
  "domain.events",
  "scene.patch",
  "state.resync.required",
  "server.error",
]);
export type ServerMessageType = z.infer<typeof ServerMessageTypeSchema>;

export const ConnectionReadySchema = z.object({
  type: z.literal("connection.ready"),
  playerId: z.string(),
  worldId: z.string(),
  serverTime: z.string().datetime(),
});

export const RoomSnapshotSchema = z.object({
  type: z.literal("room.snapshot"),
  envelope: RevisionEnvelopeSchema,
  room: RoomStateSchema.nullable(),
  entities: z.array(EntityStateSchema),
  players: z.array(PlayerStateSchema),
  sceneManifest: SceneManifestSchema.nullable(),
  roomInfo: RoomInfoSchema.optional(),
  entityInfo: z.record(z.string(), EntityInfoSchema).optional(),
});

export const CommandAcceptedMessageSchema = z.object({
  type: z.literal("command.accepted"),
  commandId: z.string(),
  envelope: RevisionEnvelopeSchema,
});

export const CommandRefusedMessageSchema = z.object({
  type: z.literal("command.refused"),
  commandId: z.string(),
  refusal: z.string(),
  alternatives: z.array(z.object({ entityId: z.string(), label: z.string() })).optional(),
});

export const DomainEventsMessageSchema = z.object({
  type: z.literal("domain.events"),
  envelope: RevisionEnvelopeSchema,
  events: z.array(DomainEventSchema),
  narrative: z.array(z.string()).optional(),
});

export const ScenePatchMessageSchema = z.object({
  type: z.literal("scene.patch"),
  envelope: RevisionEnvelopeSchema,
  sceneManifest: SceneManifestSchema.nullable(),
  entities: z.array(EntityStateSchema),
  players: z.array(PlayerStateSchema),
  entityInfo: z.record(z.string(), EntityInfoSchema).optional(),
});

export const StateResyncRequiredMessageSchema = z.object({
  type: z.literal("state.resync.required"),
  envelope: RevisionEnvelopeSchema,
  reason: z.string().optional(),
});

export const ServerErrorMessageSchema = z.object({
  type: z.literal("server.error"),
  code: z.string(),
  message: z.string(),
});

export const ServerMessageSchema = z.discriminatedUnion("type", [
  ConnectionReadySchema,
  RoomSnapshotSchema,
  CommandAcceptedMessageSchema,
  CommandRefusedMessageSchema,
  DomainEventsMessageSchema,
  ScenePatchMessageSchema,
  StateResyncRequiredMessageSchema,
  ServerErrorMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type ConnectionReady = z.infer<typeof ConnectionReadySchema>;
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export type CommandAcceptedMessage = z.infer<typeof CommandAcceptedMessageSchema>;
export type CommandRefusedMessage = z.infer<typeof CommandRefusedMessageSchema>;
export type DomainEventsMessage = z.infer<typeof DomainEventsMessageSchema>;
export type ScenePatchMessage = z.infer<typeof ScenePatchMessageSchema>;
export type StateResyncRequiredMessage = z.infer<typeof StateResyncRequiredMessageSchema>;
export type ServerErrorMessage = z.infer<typeof ServerErrorMessageSchema>;
