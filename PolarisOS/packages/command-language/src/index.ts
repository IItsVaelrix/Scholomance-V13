/**
 * @polaris/command-language
 *
 * Parses raw player text input into a BoundCommand.
 * Deterministic synonym mapping. No AI. No guessing.
 * PDR §5.5: "The command system must refuse or clarify uncertain interpretation."
 */

export { CommandBinder } from "./CommandBinder.js";
export { SYNONYMS, ACTION_PATTERNS } from "./vocabulary.js";
