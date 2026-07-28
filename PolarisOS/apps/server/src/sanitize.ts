/**
 * sanitize — defensive text normalization for player-authored content (PDR §21).
 *
 * PDR §21 (P0 security): "sanitize chat output." Player-supplied text (chat
 * messages, and by extension any free-form command argument) flows into the
 * append-only event ledger, into projected prose, and out to every room
 * subscriber. We normalize it at the server boundary so the ledger never stores
 * control-character garbage and prose stays clean.
 *
 * NOTE: The client renders all narrative/telemetry text via `textContent`
 * (never innerHTML), so HTML/JS injection is already neutralized at the render
 * layer. This module is defense-in-depth: it strips non-printable control
 * characters, collapses whitespace runs, trims, and enforces a hard length cap.
 * It does NOT mangle legitimate unicode prose (accents, CJK, emoji survive).
 */

/**
 * Control characters we strip. We keep tab (0x09), newline (0x0A), and carriage
 * return (0x0D) so multi-line input is preserved, then collapse all whitespace
 * runs to a single space. Everything else in C0/C1 + DEL is removed.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export interface SanitizeOptions {
  /** Hard maximum length after normalization. Defaults to 1000 (chat cap). */
  maxLength?: number;
}

/**
 * Normalize player-authored text:
 *   1. strip non-printable control characters
 *   2. collapse whitespace runs (incl. newlines) to single spaces
 *   3. trim leading/trailing whitespace
 *   4. enforce a hard length cap
 *
 * Pure and total: always returns a string, never throws.
 */
export function sanitizeText(input: unknown, options: SanitizeOptions = {}): string {
  const maxLength = options.maxLength ?? 1000;
  if (typeof input !== "string") return "";
  return input.replace(CONTROL_CHARS, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Sanitize a chat message specifically (PDR §21 "sanitize chat output").
 * Chat is capped at 1000 chars to match the protocol schema (chat.send.message).
 */
export function sanitizeChat(input: unknown): string {
  return sanitizeText(input, { maxLength: 1000 });
}
