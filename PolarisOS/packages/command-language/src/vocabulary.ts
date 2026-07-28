/**
 * vocabulary — closed action vocabulary and deterministic synonym mappings.
 * PDR §26.1: "Begin with a closed action vocabulary and deterministic synonym mappings."
 */

import type { ActionType } from "@polaris/contracts";

/**
 * Maps raw verb tokens to canonical ActionType.
 */
export const SYNONYMS: Record<string, ActionType> = {
  // LOOK
  look: "LOOK",
  l: "LOOK",
  observe: "LOOK",
  // EXAMINE
  examine: "EXAMINE",
  inspect: "EXAMINE",
  x: "EXAMINE",
  "look at": "EXAMINE",
  // MOVE
  go: "MOVE",
  move: "MOVE",
  walk: "MOVE",
  enter: "MOVE",
  exit: "MOVE",
  north: "MOVE",
  south: "MOVE",
  east: "MOVE",
  west: "MOVE",
  n: "MOVE",
  s: "MOVE",
  e: "MOVE",
  w: "MOVE",
  // TAKE
  take: "TAKE",
  grab: "TAKE",
  get: "TAKE",
  "pick up": "TAKE",
  pickup: "TAKE",
  // DROP
  drop: "DROP",
  put: "DROP",
  "put down": "DROP",
  // ACTIVATE
  light: "ACTIVATE",
  activate: "ACTIVATE",
  use: "ACTIVATE",
  turn: "ACTIVATE",
  open: "ACTIVATE",
  close: "ACTIVATE",
  press: "ACTIVATE",
  pull: "ACTIVATE",
  // INVENTORY
  inventory: "INVENTORY",
  inv: "INVENTORY",
  i: "INVENTORY",
  // SAY
  say: "SAY",
  chat: "SAY",
  speak: "SAY",
  shout: "SAY",
};

/**
 * Direction words that imply MOVE with a direction argument.
 */
export const DIRECTION_WORDS: Record<string, string> = {
  north: "north",
  south: "south",
  east: "east",
  west: "west",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  up: "up",
  down: "down",
};

/**
 * Patterns for multi-word verb detection (checked before single-word).
 */
export const ACTION_PATTERNS: Array<{ pattern: RegExp; action: ActionType }> = [
  { pattern: /^(?:pick|grab|take)\s+up\s+(.+)/i, action: "TAKE" },
  { pattern: /^put\s+down\s+(.+)/i, action: "DROP" },
  { pattern: /^look\s+at\s+(.+)/i, action: "EXAMINE" },
];
