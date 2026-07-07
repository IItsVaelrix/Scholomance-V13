import { getCombatGame } from './combatGameBridge.js';
import { transitionToWorldMap } from '../world/worldSceneTransition.js';
import {
  POLARIS_FOREST_MAP_ID,
  resolveWorldMap,
  TUTORIAL_ISLAND_MAP_ID,
  WORLD_MAPS,
} from '../world/worldMapRegistry.js';

/** @typedef {{ ok: boolean, message: string, sideEffects?: string[] }} CombatCommandResult */

/** @type {Readonly<Record<string, string>>} */
export const WARP_ALIASES = Object.freeze({
  polaris: POLARIS_FOREST_MAP_ID,
  forest: POLARIS_FOREST_MAP_ID,
  'polaris-forest': POLARIS_FOREST_MAP_ID,
  'sonic-forest': POLARIS_FOREST_MAP_ID,
  [POLARIS_FOREST_MAP_ID]: POLARIS_FOREST_MAP_ID,
  tutorial: TUTORIAL_ISLAND_MAP_ID,
  courtyard: TUTORIAL_ISLAND_MAP_ID,
  island: TUTORIAL_ISLAND_MAP_ID,
  void: TUTORIAL_ISLAND_MAP_ID,
  [TUTORIAL_ISLAND_MAP_ID]: TUTORIAL_ISLAND_MAP_ID,
});

/**
 * @param {string} input
 * @returns {{ name: string, args: string[], raw: string } | null}
 */
export function parseCombatCommand(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed.startsWith('/')) return null;

  const body = trimmed.slice(1).trim();
  if (!body) return null;

  const [name, ...args] = body.split(/\s+/).filter(Boolean);
  return {
    name: name.toLowerCase(),
    args,
    raw: trimmed,
  };
}

/**
 * @param {string} alias
 */
export function resolveWarpTarget(alias) {
  const key = String(alias ?? '').trim().toLowerCase();
  if (!key) return null;
  return WARP_ALIASES[key] ?? null;
}

/**
 * @param {import('phaser').Game} game
 */
export function resolveActiveWorldMapId(game) {
  for (const map of Object.values(WORLD_MAPS)) {
    if (game.scene?.isActive(map.sceneKey)) {
      return map.id;
    }
  }
  if (game.scene?.isVisible('PolarisForestScene')) {
    return POLARIS_FOREST_MAP_ID;
  }
  return TUTORIAL_ISLAND_MAP_ID;
}

/**
 * @param {string} targetAlias
 * @param {{ onArenaAction?: (action: object) => void }} [context]
 * @returns {CombatCommandResult}
 */
export function executeWarpCommand(targetAlias, context = {}) {
  const targetMapId = resolveWarpTarget(targetAlias);
  if (!targetMapId) {
    return {
      ok: false,
      message: `Unknown warp target "${targetAlias}". Try: polaris, tutorial`,
    };
  }

  const game = getCombatGame();
  if (!game) {
    return { ok: false, message: 'Combat arena is still loading. Try again in a moment.' };
  }

  const targetMap = resolveWorldMap(targetMapId);
  if (!targetMap) {
    return { ok: false, message: `Warp registry missing map "${targetMapId}".` };
  }

  const sourceMapId = resolveActiveWorldMapId(game);
  if (sourceMapId === targetMapId) {
    return { ok: true, message: `Already in ${targetMap.label}.` };
  }

  const ok = transitionToWorldMap(game, targetMapId, context.onArenaAction, {
    sourceMapId,
    entryData: { viaCommand: true, command: 'warp', target: targetMapId },
  });

  if (!ok) {
    return { ok: false, message: `Warp to ${targetMap.label} failed.` };
  }

  if (typeof window !== 'undefined') {
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('request-scene-context'));
    }, 0);
  }

  return {
    ok: true,
    message: `Warped to ${targetMap.label}.`,
    sideEffects: [],
  };
}

/**
 * @returns {CombatCommandResult}
 */
export function executeHelpCommand() {
  return {
    ok: true,
    message: 'Commands: /warp <target> — polaris | tutorial. Example: /warp polaris',
  };
}

/**
 * @param {{ name: string, args: string[] }} command
 * @param {{ onArenaAction?: (action: object) => void }} [context]
 * @returns {CombatCommandResult}
 */
export function executeCombatCommand(command, context = {}) {
  switch (command.name) {
    case 'warp':
      return executeWarpCommand(command.args[0] ?? 'polaris', context);
    case 'help':
    case 'commands':
      return executeHelpCommand();
    default:
      return {
        ok: false,
        message: `Unknown command "/${command.name}". Type /help for a list.`,
      };
  }
}

/**
 * @param {string} input
 * @param {{ onArenaAction?: (action: object) => void }} [context]
 * @returns {CombatCommandResult | null}
 */
export function tryExecuteCombatCommandInput(input, context = {}) {
  const command = parseCombatCommand(input);
  if (!command) return null;
  return executeCombatCommand(command, context);
}