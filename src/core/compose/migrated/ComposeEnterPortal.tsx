/**
 * Always-on Compose Enter portal — polished hit target with compositor-friendly motion.
 * Storm canvas and WatercolorDissolve remain outside this shell.
 */

import React, { useMemo, useCallback, useState } from 'react';
import {
  createEnterPortalScene,
  ENTER_PORTAL_ID,
} from './EnterPortal';
import {
  validateComposeScene,
  renderSceneToDomSpec,
  type DomNodeSpec,
} from '../packets';
import { emitPbUiEvent } from '../behavior/emit-event';

export type ComposeEnterPortalProps = {
  onEnter: () => void;
  dissolving?: boolean;
  children: React.ReactNode;
  /** Legacy orb layers when scene validate fails */
  fallback?: React.ReactNode;
};

function findPartSpec(dom: DomNodeSpec, part: string): DomNodeSpec | undefined {
  return dom.children.find((c) => c.id.endsWith(`.${part}`) || c.attrs?.['data-part'] === part);
}

function LegacyEnterPortal({
  onEnter,
  dissolving,
  children,
}: {
  onEnter: () => void;
  dissolving?: boolean;
  children: React.ReactNode;
}) {
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (dissolving) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnter();
      }
    },
    [dissolving, onEnter],
  );

  return (
    <div
      className="portal-gate"
      role="button"
      tabIndex={dissolving ? -1 : 0}
      aria-label="Enter Scholomance"
      aria-disabled={dissolving || undefined}
      onClick={dissolving ? undefined : onEnter}
      onKeyDown={onKeyDown}
      data-compose-portal="false"
    >
      {children}
    </div>
  );
}

export function ComposeEnterPortal({
  onEnter,
  dissolving = false,
  children,
  fallback,
}: ComposeEnterPortalProps) {
  const [pressed, setPressed] = useState(false);

  const { sceneValid, domSpec } = useMemo(() => {
    const scene = createEnterPortalScene();
    const valid = validateComposeScene(scene).ok;
    return {
      sceneValid: valid,
      domSpec: valid ? renderSceneToDomSpec(scene) : null,
    };
  }, []);

  const activate = useCallback(() => {
    if (dissolving) return;
    emitPbUiEvent({
      type: 'PORTAL.ENTER',
      sourceId: ENTER_PORTAL_ID,
      sequence: Date.now(),
    });
    onEnter();
  }, [dissolving, onEnter]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (dissolving) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    },
    [activate, dissolving],
  );

  const onFocus = useCallback(() => {
    emitPbUiEvent({
      type: 'PORTAL.FOCUS',
      sourceId: ENTER_PORTAL_ID,
      sequence: Date.now(),
    });
  }, []);

  if (!sceneValid) {
    return (
      fallback ?? (
        <LegacyEnterPortal onEnter={onEnter} dissolving={dissolving}>
          {children}
        </LegacyEnterPortal>
      )
    );
  }

  const ringsSpec = domSpec ? findPartSpec(domSpec, 'rings') : undefined;
  const contentSpec = domSpec ? findPartSpec(domSpec, 'content') : undefined;

  // Split children: first N decorative layers vs content — Landing passes a fragment of spans + content div
  const childArray = React.Children.toArray(children);
  const contentChild = childArray.find(
    (c) => React.isValidElement(c) && (c.props as { className?: string }).className === 'portal-content',
  );
  const ringChildren = childArray.filter((c) => c !== contentChild);

  return (
    <div
      className={[
        'portal-gate',
        'portal-gate--compose',
        pressed ? 'portal-gate--pressed' : '',
        dissolving ? 'portal-gate--dissolving' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={domSpec?.role ?? 'button'}
      tabIndex={dissolving ? -1 : 0}
      aria-label={domSpec?.attrs['aria-label'] ?? 'Enter Scholomance'}
      aria-disabled={dissolving || undefined}
      id={domSpec?.id ?? ENTER_PORTAL_ID}
      data-compose-portal="true"
      data-compose-scene-id={domSpec?.id}
      onClick={activate}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    >
      <div
        className="portal-gate__rings"
        id={ringsSpec?.id}
        data-compose-part="rings"
        aria-hidden="true"
      >
        {ringChildren}
      </div>
      <div
        className="portal-gate__content-host"
        id={contentSpec?.id}
        data-compose-part="content"
      >
        {contentChild}
      </div>
    </div>
  );
}
