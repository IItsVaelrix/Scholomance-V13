// Event emitter for progression events
const eventListeners = new Map();

export function emitXPEvent(event, data) {
  if (eventListeners.has(event)) {
    eventListeners.get(event).forEach(callback => callback(data));
  }
}

/**
 * @deprecated Use useXPEventListener in React components to avoid memory leaks.
 * Low-level event registration.
 * Manually subscribe to a progression event.
 *
 * @param {string} event The event name.
 * @param {function} callback The callback to fire.
 * @returns {function} An unsubscribe function to clean up the listener.
 */
export function onXPEvent(event, callback) {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, []);
  }
  eventListeners.get(event).push(callback);
  return () => {
    const listeners = eventListeners.get(event);
    if (!listeners) return;
    const idx = listeners.indexOf(callback);
    if (idx > -1) listeners.splice(idx, 1);
  };
}
