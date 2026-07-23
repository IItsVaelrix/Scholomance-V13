/**
 * Compose-backed Read IDE chrome shells — always-on with legacy fallback.
 * Region content stays in the UI-owned host (IDEChrome.jsx); these shells own
 * anatomy, landmarks, layout provenance, and the harmonic-seam attachment.
 */

import { useMemo, type ReactNode } from 'react';
import {
  createReadTopBarScene,
  createReadStatusBarScene,
  renderSceneToDomSpec,
  validateComposeScene,
  type DomNodeSpec,
} from '../packets';

function findPartSpec(dom: DomNodeSpec, part: string): DomNodeSpec | undefined {
  return dom.children.find((child) => child.id.endsWith(`.${part}`));
}

function useChromeDomSpec(create: () => ReturnType<typeof createReadTopBarScene>) {
  return useMemo(() => {
    const scene = create();
    if (!validateComposeScene(scene).ok) return null;
    return { scene, dom: renderSceneToDomSpec(scene) };
    // create is a stable module-level factory
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

function HarmonicSeam({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <span
      className={`grim-harmonic-seam grim-harmonic-seam--${edge}`}
      data-compose-slot="seam"
      data-compose-visual="harmonic-seam"
      aria-hidden="true"
    />
  );
}

export type ComposeReadTopBarProps = {
  identity: ReactNode;
  progression?: ReactNode;
  actions: ReactNode;
};

export function ComposeReadTopBar({
  identity,
  progression,
  actions,
}: ComposeReadTopBarProps) {
  const spec = useChromeDomSpec(createReadTopBarScene);

  if (!spec) {
    return (
      <div className="ide-topbar">
        <div className="ide-topbar-left">{identity}</div>
        <div className="ide-topbar-center">{progression}</div>
        <div className="ide-topbar-right">{actions}</div>
      </div>
    );
  }

  const { dom } = spec;
  const identitySpec = findPartSpec(dom, 'identity');
  const progressionSpec = findPartSpec(dom, 'progression');
  const actionsSpec = findPartSpec(dom, 'actions');
  const hasSeam = dom.attachmentSlots.some((s) => s.slot === 'seam');

  return (
    <div
      className="ide-topbar ide-topbar--compose"
      id={dom.id}
      role={dom.attrs.role}
      aria-label={dom.attrs['aria-label']}
      data-compose-pilot="read-chrome"
      data-compose-scene-id={spec.scene.id}
    >
      <div
        className="ide-topbar-left"
        id={identitySpec?.id}
        data-compose-part="identity"
      >
        {identity}
      </div>
      <div
        className="ide-topbar-center"
        id={progressionSpec?.id}
        data-compose-part="progression"
      >
        {progression}
      </div>
      <div
        className="ide-topbar-right"
        id={actionsSpec?.id}
        data-compose-part="actions"
      >
        {actions}
      </div>
      {hasSeam && <HarmonicSeam edge="bottom" />}
    </div>
  );
}

export type ComposeReadStatusBarProps = {
  vitals: ReactNode;
  position: ReactNode;
};

export function ComposeReadStatusBar({
  vitals,
  position,
}: ComposeReadStatusBarProps) {
  const spec = useChromeDomSpec(createReadStatusBarScene);

  if (!spec) {
    return (
      <div className="ide-statusbar">
        <div className="ide-statusbar-left">{vitals}</div>
        <div className="ide-statusbar-right">{position}</div>
      </div>
    );
  }

  const { dom } = spec;
  const vitalsSpec = findPartSpec(dom, 'vitals');
  const positionSpec = findPartSpec(dom, 'position');
  const hasSeam = dom.attachmentSlots.some((s) => s.slot === 'seam');

  return (
    <div
      className="ide-statusbar ide-statusbar--compose"
      id={dom.id}
      role={dom.attrs.role}
      aria-label={dom.attrs['aria-label']}
      data-compose-pilot="read-chrome"
      data-compose-scene-id={spec.scene.id}
    >
      <div
        className="ide-statusbar-left"
        id={vitalsSpec?.id}
        data-compose-part="vitals"
      >
        {vitals}
      </div>
      <div
        className="ide-statusbar-right"
        id={positionSpec?.id}
        data-compose-part="position"
      >
        {position}
      </div>
      {hasSeam && <HarmonicSeam edge="top" />}
    </div>
  );
}
