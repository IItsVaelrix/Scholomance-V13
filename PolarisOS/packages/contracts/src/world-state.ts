/**
 * World State contracts — PDR §10
 *
 * Defines the authoritative world state shape.
 * The server owns all world truth. Clients never mutate these directly.
 */

import { z } from "zod";

// --- Flags ---

export const FlagValueSchema = z.union([z.boolean(), z.string(), z.number()]);
export type FlagValue = z.infer<typeof FlagValueSchema>;

export const FlagsSchema = z.record(z.string(), FlagValueSchema);
export type Flags = z.infer<typeof FlagsSchema>;

// --- Entity ---

export const EntityTypeSchema = z.enum(["object", "environment", "character"]);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntityLocationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("room"), roomId: z.string() }),
  z.object({ type: z.literal("inventory"), playerId: z.string() }),
]);
export type EntityLocation = z.infer<typeof EntityLocationSchema>;

export const EntityStateSchema = z.object({
  entityId: z.string(),
  entityType: EntityTypeSchema,
  definitionId: z.string(),
  location: EntityLocationSchema,
  flags: FlagsSchema,
});
export type EntityState = z.infer<typeof EntityStateSchema>;

// --- Room ---

export const RoomStateSchema = z.object({
  roomId: z.string(),
  revision: z.number().int().nonnegative(),
  title: z.string(),
  descriptionKey: z.string(),
  exitIds: z.array(z.string()),
  /**
   * Direction → destination roomId map (e.g. `{ west: "forest_path" }`),
   * authored via each room's `exits`. Optional for backward compatibility with
   * fixtures that predate it; the command binder/resolver treat absence as `{}`.
   * Lets direction commands ("go west") resolve deterministically (PDR §6.3,
   * §26.1) without the client ever authoring movement targets.
   */
  exitDirections: z.record(z.string(), z.string()).optional(),
  occupantIds: z.array(z.string()),
  entityIds: z.array(z.string()),
  flags: FlagsSchema,
});
export type RoomState = z.infer<typeof RoomStateSchema>;

// --- Player ---

export const ConnectionStateSchema = z.enum(["connected", "disconnected"]);
export type ConnectionState = z.infer<typeof ConnectionStateSchema>;

export const PlayerStateSchema = z.object({
  playerId: z.string(),
  displayName: z.string(),
  roomId: z.string(),
  inventoryIds: z.array(z.string()),
  connectionState: ConnectionStateSchema,
});
export type PlayerState = z.infer<typeof PlayerStateSchema>;

// --- World ---

export const WorldStateSchema = z.object({
  worldId: z.string(),
  revision: z.number().int().nonnegative(),
  rulesetVersion: z.string(),
  rooms: z.record(z.string(), RoomStateSchema),
  players: z.record(z.string(), PlayerStateSchema),
  entities: z.record(z.string(), EntityStateSchema),
});
export type WorldState = z.infer<typeof WorldStateSchema>;
