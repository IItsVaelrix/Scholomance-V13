/**
 * Compose-backed Oracle terminal shell — always-on with legacy fallback.
 * SearchPanel keeps all query logic and region markup (tagged in place with
 * data-compose-part="session|prompt|signal|feed"); this shell owns the
 * region landmark, packet provenance, and the scanline atmosphere attachment.
 * Multi-instance safe: packet node ids are never emitted as DOM ids, and the
 * landmark label is suffixed per instance.
 */

import { useMemo, type ReactNode } from 'react';
import {
  createOracleTerminalScene,
  renderSceneToDomSpec,
  validateComposeScene,
} from '../packets';

export type ComposeOracleTerminalProps = {
  /** Variant name (sidebar/rail/floating/…) — styling + data attribute. */
  instance?: string;
  /** Per-mount unique id; keeps the landmark label unique when the same
   *  variant mounts twice (mirrors the oracle-feed label convention). */
  instanceId?: string;
  /** Extra class names forwarded to the shell root (school/loading skins). */
  className?: string;
  /** data-* passthrough for school theming hooks. */
  dataProps?: Record<string, string>;
  /** Decorative terminal hardware layer (beacon, link meter, rune registers). */
  terminalChrome?: ReactNode;
  /** Core panel content with data-compose-part-tagged regions. */
  children: ReactNode;
};

export function ComposeOracleTerminal({
  instance = 'sidebar',
  instanceId,
  className,
  dataProps,
  terminalChrome,
  children,
}: ComposeOracleTerminalProps) {
  const spec = useMemo(() => {
    const scene = createOracleTerminalScene();
    if (!validateComposeScene(scene).ok) return null;
    return { scene, dom: renderSceneToDomSpec(scene) };
  }, []);

  const shellClass = ['oracle-shell', className].filter(Boolean).join(' ');

  if (!spec) {
    return (
      <div className={shellClass} {...dataProps}>
        {terminalChrome}
        <div className="oracle-core-panel">{children}</div>
      </div>
    );
  }

  const hasAtmosphere = spec.dom.attachmentSlots.some(
    (s) => s.slot === 'atmosphere',
  );

  return (
    <div
      className={`${shellClass} oracle-shell--compose`}
      role={spec.dom.attrs.role}
      aria-label={`Lexicon Oracle terminal (${instanceId ?? instance})`}
      data-compose-pilot="oracle-terminal"
      data-compose-scene-id={spec.scene.id}
      data-compose-instance={instance}
      {...dataProps}
    >
      {terminalChrome}
      {hasAtmosphere && (
        <span
          className="oracle-scanline-atmosphere"
          data-compose-slot="atmosphere"
          data-compose-visual="phosphor-scanline"
          aria-hidden="true"
        />
      )}
      <div className="oracle-core-panel">{children}</div>
    </div>
  );
}
