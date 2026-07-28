/**
 * Command contracts — PDR §11
 *
 * Defines the command submission, binding, and resolution types.
 * Commands flow: raw input → bound command → resolution (accepted | refused).
 */

import { z } from "zod";
import type { DomainEvent } from "./events.js";

// --- Action Types (§11.3) ---

export const ActionTypeSchema = z.enum([
  "LOOK",
  "EXAMINE",
  "MOVE",
  "TAKE",
  "DROP",
  "ACTIVATE",
  "INVENTORY",
  "SAY",
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

// --- Client Request (§11.1) ---

export const SubmitCommandMessageSchema = z.object({
  type: z.literal("command.submit"),
  commandId: z.string(),
  playerId: z.string(),
  roomId: z.string(),
  expectedRevision: z.number().int().nonnegative(),
  rawInput: z.string().max(500),
});
export type SubmitCommandMessage = z.infer<typeof SubmitCommandMessageSchema>;

// --- Binding Evidence ---

export const BindingEvidenceSchema = z.object({
  source: z.string(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
});
export type BindingEvidence = z.infer<typeof BindingEvidenceSchema>;

// --- Bound Command (§11.2) ---

export const BoundCommandSchema = z.object({
  commandId: z.string(),
  actorId: z.string(),
  roomId: z.string(),
  action: ActionTypeSchema,
  targetIds: z.array(z.string()),
  arguments: z.record(z.string(), z.unknown()),
  evidence: z.array(BindingEvidenceSchema),
});
export type BoundCommand = z.infer<typeof BoundCommandSchema>;

// --- Resolution (§11.4) ---

export const RefusalReasonSchema = z.enum([
  "INVALID_ACTION",
  "TARGET_NOT_FOUND",
  "TARGET_AMBIGUOUS",
  "TARGET_UNAVAILABLE",
  "REVISION_CONFLICT",
  "PERMISSION_DENIED",
]);
export type RefusalReason = z.infer<typeof RefusalReasonSchema>;

export const CommandAlternativeSchema = z.object({
  entityId: z.string(),
  label: z.string(),
});
export type CommandAlternative = z.infer<typeof CommandAlternativeSchema>;

export type CommandResolution =
  | { accepted: true; events: DomainEvent[] }
  | {
      accepted: false;
      refusal: RefusalReason;
      alternatives?: CommandAlternative[];
    };
