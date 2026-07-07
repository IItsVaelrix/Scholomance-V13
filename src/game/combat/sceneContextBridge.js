/**
 * Browser bridge for authoritative scene-context snapshots.
 *
 * HUD hints may lag; cast/attack authority must not. Phaser answers
 * `request-scene-context` synchronously on the next event turn.
 */

/** @type {import('./weave-scene-targets.js').SceneContextSnapshot | null} */
let latestSceneContext = null;

/**
 * @param {import('./weave-scene-targets.js').SceneContextSnapshot | null} snapshot
 */
export function setLatestSceneContext(snapshot) {
  latestSceneContext = snapshot || null;
}

export function peekSceneContext() {
  return latestSceneContext;
}

/**
 * Ask Phaser for a fresh registry snapshot before cast resolution.
 * Falls back to the last known snapshot if the arena is not mounted.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<import('./weave-scene-targets.js').SceneContextSnapshot | null>}
 */
export function requestSceneContext({ timeoutMs = 32 } = {}) {
  if (typeof window === 'undefined') {
    return Promise.resolve(latestSceneContext);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (snapshot) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('scene-context-state', onResponse);
      if (snapshot) latestSceneContext = snapshot;
      resolve(snapshot ?? latestSceneContext);
    };

    const onResponse = (event) => finish(event?.detail ?? null);
    window.addEventListener('scene-context-state', onResponse);
    window.dispatchEvent(new CustomEvent('request-scene-context'));
    window.setTimeout(() => finish(latestSceneContext), timeoutMs);
  });
}

export function installSceneContextBridge() {
  if (typeof window === 'undefined') return () => {};
  const onSnapshot = (event) => {
    if (event?.detail) latestSceneContext = event.detail;
  };
  window.addEventListener('scene-context-state', onSnapshot);
  return () => window.removeEventListener('scene-context-state', onSnapshot);
}