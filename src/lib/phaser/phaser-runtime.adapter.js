let runtimePromise;

// PixelBrain render adapters consume a Phaser Scene but do not import Phaser
// themselves. Re-export them from this boundary so UI callers have one lawful
// entry point for Phaser-backed behavior.
export {
  createPixelBrainAnimation,
  createPixelBrainTexture,
  validatePixelBrainPhaserAsset,
} from './pixelbrain-phaser.adapter.js';

/**
 * Ensures Phaser is only loaded once per session and only when requested.
 * Returns the Phaser runtime object.
 */
export function loadPhaserRuntime() {
  runtimePromise ??= import('phaser').then((module) => module.default ?? module);
  return runtimePromise;
}

/**
 * Abort-safe Phaser game mount factory.
 * Owns the Phaser lifecycle completely.
 * 
 * @param {Object} args
 * @param {HTMLElement} args.parent - The DOM element to attach the canvas to.
 * @param {Function[]} args.buildScenes - Array of scene factory functions `(Phaser) => Phaser.Scene`
 * @param {Object} args.config - Phaser game config overrides
 * @param {AbortSignal} args.signal - React lifecycle cancellation signal
 * @returns {Promise<{ game: Phaser.Game, destroy: () => void } | null>}
 */
export async function mountPhaserGame({
  parent,
  buildScenes,
  config = {},
  signal,
}) {
  const Phaser = await loadPhaserRuntime();

  // Guard 1: unmounted while Phaser was still loading — nothing was built yet.
  if (signal?.aborted) {
    return null;
  }

  const scenes = buildScenes.map((buildScene) => buildScene(Phaser));

  const game = new Phaser.Game({
    ...config,
    parent,
    scene: scenes,
  });

  // Idempotent teardown shared by the abort listener and the returned destroy(), so a
  // normal unmount (which calls both abort() and destroy()) never double-destroys the game.
  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    signal?.removeEventListener?.('abort', destroy);

    // Phaser's Config keeps a strong reference to the parent DOM element, and destroy()
    // never clears it. Canvases left behind in Phaser's module-global CanvasPool keep the
    // game — and therefore its Config — reachable, so that stale `config.parent` pins the
    // mount div, its whole React subtree (the combat HUD), and the WebGL canvas for the
    // life of the page. Phaser's destroy is deferred to the next game step, so we cut the
    // reference on the DESTROY event rather than immediately.
    game.events?.once?.('destroy', () => {
      if (game.config) {
        game.config.parent = null;
        game.config.canvas = null;
      }
    });

    game.destroy(true);
  };

  // Guard 2: the race the hosts cannot close. If the signal aborted in the microtask gap
  // between constructing the game and here, the host's cleanup already ran (its
  // runtimeHandle was still undefined, so it could not destroy) and its post-await
  // `aborted` check will early-return WITHOUT destroying. The adapter owns the lifecycle,
  // so it tears down now — and otherwise registers a listener to catch an abort that lands
  // after we return but before the host wires its cleanup.
  if (signal?.aborted) {
    destroy();
    return null;
  }
  signal?.addEventListener?.('abort', destroy, { once: true });

  return { game, destroy };
}
