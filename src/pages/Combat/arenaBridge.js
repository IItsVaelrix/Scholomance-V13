/**
 * Wires the React host to the Phaser arena scene's tile events.
 *
 * Why this exists: scenes passed through the Phaser game config are queued in
 * the SceneManager's `_pending` list and are only moved into the keyed
 * registry during `bootQueue`, which runs on the game's `ready` event. So
 * `game.scene.getScene(key)` returns `null` synchronously right after
 * `new Phaser.Game(...)`. Wiring listeners at that moment silently attaches
 * nothing — right-click then emits `tile-inspect` into the void and the
 * inspect tooltip never renders. Defer the wiring to `ready`, matching the
 * working IDEAmbientCanvas / SigilChamber pattern.
 *
 * Pure and Phaser-free so the boot-race contract stays unit-testable.
 *
 * @param {object} game - Phaser.Game instance.
 * @param {string} sceneKey - Registered scene key, e.g. 'CombatArenaScene'.
 * @param {(action: object) => void} handler - Receives arena action payloads.
 */
export function bridgeArenaScene(game, sceneKey, handler) {
  const wire = () => {
    const scene = game?.scene?.getScene?.(sceneKey);
    if (!scene?.events) return false;

    // Drop any prior listeners so a hot reload / remount can't double-fire.
    scene.events.off('tile-inspect');
    scene.events.off('tile-interact');
    scene.events.off('tile-error');
    scene.events.off('obelisk-discovery');
    scene.events.off('obelisk-loot');
    scene.events.off('combat-loot');
    scene.events.off('combat-chest-spawn');
    scene.events.off('obelisk-reject');
    scene.events.off('sentinel-defeated');
    scene.events.off('sentinel-aggro');
    scene.events.off('combat-victory');
    scene.events.off('portal-unsealed');
    scene.events.off('portal-warden-spawn');
    scene.events.off('sentinel-ability');
    scene.events.off('battle-board-compiled');
    scene.events.off('polaris-teleport-start');
    scene.events.off('polaris-forest-ready');
    scene.events.off('tile-gather');
    scene.events.on('tile-inspect', handler);
    scene.events.on('tile-interact', handler);
    scene.events.on('tile-error', handler);
    scene.events.on('tile-gather', handler);
    scene.events.on('obelisk-discovery', handler);
    scene.events.on('obelisk-loot', handler);
    scene.events.on('combat-loot', handler);
    scene.events.on('combat-chest-spawn', handler);
    scene.events.on('obelisk-reject', handler);
    scene.events.on('sentinel-defeated', handler);
    scene.events.on('sentinel-aggro', handler);
    scene.events.on('combat-victory', handler);
    scene.events.on('portal-unsealed', handler);
    scene.events.on('portal-warden-spawn', handler);
    scene.events.on('sentinel-ability', handler);
    scene.events.on('battle-board-compiled', handler);
    scene.events.on('polaris-teleport-start', handler);
    scene.events.on('polaris-forest-ready', handler);
    return true;
  };

  const scheduleWire = () => {
    if (wire()) return;
    game?.events?.once?.('step', scheduleWire);
  };

  if (game?.isRunning) {
    // Already past boot (fast remount) — the scene is in the registry now.
    scheduleWire();
  } else {
    game?.events?.once?.('ready', scheduleWire);
  }
}
