/**
 * NarrativeProjector — deterministic event-to-prose templates.
 * PDR §18: "Domain events are converted into player-readable prose."
 */

import type { DomainEvent } from "@polaris/contracts";

type TemplateFn = (payload: any, event: DomainEvent) => string;

const TEMPLATES: Record<string, TemplateFn> = {
  PLAYER_ENTERED_ROOM: (p) => `${p.displayName} enters the room.`,
  PLAYER_LEFT_ROOM: (p) => `${p.displayName} leaves.`,
  PLAYER_CONNECTED: (p) => `${p.displayName ?? "A player"} has connected.`,
  PLAYER_DISCONNECTED: (p) => `${p.displayName ?? "A player"} has disconnected.`,
  ENTITY_TAKEN: (p) => `${p.actorName ?? "Someone"} takes the ${p.entityName}.`,
  ENTITY_DROPPED: (p) => `${p.actorName ?? "Someone"} drops the ${p.entityName}.`,
  ENTITY_ACTIVATED: (p) => `${p.actorName ?? "Someone"} ${p.activation === "lit" ? "lights" : "activates"} the ${p.entityName}.`,
  ROOM_FLAG_CHANGED: (p) => `The room shifts... (${p.flagKey}: ${p.newValue})`,
  PLAYER_SPOKE: (p) => `${p.displayName} says, "${p.message}"`,
  COMMAND_REFUSED: (p) => `You cannot do that. (${p.refusal})`,
};

export class NarrativeProjector {
  /**
   * Project a domain event into readable prose.
   * Falls back to a generic message for unknown event types.
   */
  project(event: DomainEvent): string {
    const template = TEMPLATES[event.eventType];
    if (!template) {
      return `Something happens. (${event.eventType})`;
    }
    return template(event.payload, event);
  }

  /**
   * Project multiple events into a list of prose lines.
   */
  projectAll(events: DomainEvent[]): string[] {
    return events.map((e) => this.project(e));
  }
}
