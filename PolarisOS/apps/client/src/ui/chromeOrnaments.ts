/**
 * chromeOrnaments — populate the arcane console's decorative attachment hosts
 * with SCDL chrome variants (Dual-State Art Pass §7, parent spec §10).
 *
 * The generated DOM plan mounts aria-hidden `[data-attachment-slot]` hosts,
 * each tagged with a rest-variant `data-packet-id` (e.g. "arcane-panel/rest/
 * corners"). This controller resolves the *current* variant for each host from
 * the immutable chrome registry — keyed off the nearest ancestor panel's
 * `data-state` (which PolarisConsoleView maintains) — and injects the variant
 * SVG. Variant switches never shift layout (identical dimensions per family)
 * and are softened by the restrained CSS opacity transition in
 * polaris-console.css (latent ritualism: rest stays dormant).
 *
 * The injected SVG comes only from the build-time registry (trusted, content-
 * hashed) — never from server or user data.
 */

import { selectAttachmentKey } from "../state/selectors.js";
import type { PolarisVisualState } from "../state/PolarisUiState.js";
import type { PolarisChromeRegistry } from "../generated/polaris-chrome.registry.js";

export interface ChromeOrnamentController {
  /** Re-resolve every host from its panel's current data-state. */
  update(): void;
  destroy(): void;
}

interface Binding {
  host: HTMLElement;
  family: string;
  lastKey: string | null;
}

/** Derive the family (`<group>/<part>`) from a rest-variant packet id. */
export function familyFromPacketId(packetId: string): string | null {
  // Packet ids are rest-variant keys: "<group>/rest/<part>".
  const rest = packetId.indexOf("/rest/");
  if (rest < 0) return null;
  const group = packetId.slice(0, rest);
  const part = packetId.slice(rest + "/rest/".length);
  if (group.length === 0 || part.length === 0) return null;
  return `${group}/${part}`;
}

export function createChromeOrnamentController(
  hosts: readonly HTMLElement[],
  registry: PolarisChromeRegistry,
): ChromeOrnamentController {
  const bindings: Binding[] = [];
  for (const host of hosts) {
    const packetId = host.getAttribute("data-packet-id");
    if (packetId === null) continue;
    const family = familyFromPacketId(packetId);
    if (family === null) continue;
    bindings.push({ host, family, lastKey: null });
  }

  function update(): void {
    for (const binding of bindings) {
      const stateHost = binding.host.closest("[data-state]");
      const state = (stateHost?.getAttribute("data-state") ?? "rest") as PolarisVisualState;
      const key = selectAttachmentKey(binding.family, state, registry);
      if (key === null || key === binding.lastKey) continue;
      const variant = registry[key];
      if (variant === undefined) continue;
      // Trusted build-time SVG only — see module note.
      binding.host.innerHTML = variant.svg;
      binding.host.setAttribute("data-chrome-state", variant.state);
      binding.host.setAttribute("data-chrome-family", binding.family);
      binding.host.setAttribute("data-chrome-hash", variant.contentHash);
      binding.lastKey = key;
    }
  }

  return {
    update,
    destroy() {
      for (const binding of bindings) {
        binding.host.innerHTML = "";
        binding.lastKey = null;
      }
    },
  };
}
