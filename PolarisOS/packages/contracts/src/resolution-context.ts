/**
 * ResolutionContext — deterministic metadata for event production.
 *
 * The pure resolver MUST NOT invent wall-clock time or random IDs.
 * All identity and temporal metadata is supplied by the caller
 * (the runtime/persistence boundary).
 *
 * Event IDs are derived from stable inputs:
 *   hash(worldId + commandId + eventIndex + rulesetVersion)
 *
 * This guarantees: same state + same command + same ruleset = same complete event record.
 */

import { z } from "zod";

export const ResolutionContextSchema = z.object({
  /** Pre-allocated deterministic event IDs for this resolution batch */
  eventIds: z.array(z.string()).min(1),
  /** ISO-8601 timestamp assigned by the application boundary */
  occurredAt: z.string().datetime(),
  /** Next sequence number in the global event ledger */
  startingSequence: z.number().int().nonnegative(),
  /** World revision that will result from applying these events */
  startingWorldRevision: z.number().int().nonnegative(),
});
export type ResolutionContext = z.infer<typeof ResolutionContextSchema>;

/**
 * Derive a deterministic event ID from stable inputs.
 * No Date.now(). No Math.random(). Pure function.
 */
export function deriveEventId(
  worldId: string,
  commandId: string,
  eventIndex: number,
  rulesetVersion: string,
): string {
  // Simple deterministic hash — no crypto dependency needed for IDs
  const input = `${worldId}:${commandId}:${eventIndex}:${rulesetVersion}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `evt_${hex}_${commandId}_${eventIndex}`;
}

/**
 * Build a full ResolutionContext for a command batch.
 * Called by the runtime boundary, never by the pure resolver.
 */
export function buildResolutionContext(
  worldId: string,
  commandId: string,
  rulesetVersion: string,
  eventCount: number,
  startingSequence: number,
  startingWorldRevision: number,
  occurredAt?: string,
): ResolutionContext {
  const eventIds = Array.from({ length: eventCount }, (_, i) =>
    deriveEventId(worldId, commandId, i, rulesetVersion),
  );

  return {
    eventIds,
    occurredAt: occurredAt ?? new Date().toISOString(),
    startingSequence,
    startingWorldRevision,
  };
}
