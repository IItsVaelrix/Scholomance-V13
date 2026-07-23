/**
 * Flag-gated React shell for ScrollEditorToolbar pilot (Phase 9 production).
 * Renders DomNodeSpec from PB-UI-SCENE; ornament slots are data-only hosts.
 * Visibility + handlers bridge IDEChrome TopBar without mutating golden scenes.
 */

import React, { useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { useFeatureFlag, COMPOSE_FLAGS } from '../flags';
import {
  createScrollEditorToolbarScene,
  renderSceneToDomSpec,
  type DomNodeSpec,
} from '../packets';
import { emitPbUiEvent } from '../behavior/emit-event';
import {
  collectSceneAttachments,
  mountHybridAttachment,
} from '../render/hybrid-host';
import { TOOLBAR_ACTIONS } from './ScrollEditorToolbar';
import {
  mapTopBarPropsToToolbarBridge,
  dispatchToolbarEvent,
  type ToolbarActionId,
  type ScrollEditorToolbarHandlers,
} from './toolbar-bridge';

const ACTION_EVENTS = Object.fromEntries(
  TOOLBAR_ACTIONS.map((a) => [`${'scroll-editor-toolbar'}.${a.id}`, a.event]),
);

export type ComposeScrollEditorToolbarProps = {
  includeWandOrnament?: boolean;
  /** Optional raw event tap (PB-UI-EVENT type string). */
  onEvent?: (type: string) => void;
  isEditable?: boolean;
  showMinimapControl?: boolean;
  showSettingsControl?: boolean;
  onEdit?: () => void;
  onNewScroll?: () => void;
  onToggleMinimap?: () => void;
  onOpenSearch?: () => void;
  onCycleAuroraLevel?: () => void;
  onToggleFocus?: () => void;
  onSettingsClick?: () => void;
};

function filterDomTree(
  node: DomNodeSpec,
  visible: Set<ToolbarActionId>,
): DomNodeSpec {
  if (node.tag === 'button') {
    const actionId = node.id.split('.').pop() as ToolbarActionId | undefined;
    if (actionId && !visible.has(actionId)) {
      return { ...node, tag: 'span', children: [], text: undefined, attrs: { ...node.attrs, 'aria-hidden': 'true', hidden: 'true' }, style: { display: 'none' } };
    }
  }
  return {
    ...node,
    children: node.children
      .map((child) => filterDomTree(child, visible))
      .filter((child) => !(child.attrs.hidden === 'true')),
  };
}

function AttachmentSlotHost({
  slot,
  hybrid,
  sceneAttachments,
}: {
  slot: DomNodeSpec['attachmentSlots'][number];
  hybrid: boolean;
  sceneAttachments: ReturnType<typeof collectSceneAttachments>;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!hybrid || !ref.current) return;
    const attachment = sceneAttachments.find((a) => a.visualId === slot.visualId);
    if (!attachment) return;
    mountHybridAttachment(ref.current, attachment, {
      widthPx: 20,
      heightPx: 20,
      preferredBackend: 'canvas',
    });
  }, [hybrid, sceneAttachments, slot.visualId]);

  return (
    <span
      ref={ref}
      data-compose-slot={slot.slot}
      data-compose-visual={slot.visualId}
      data-compose-kind={slot.kind}
      aria-hidden="true"
    />
  );
}

const DomTree = memo(function DomTree({
  node,
  onEvent,
  hybrid,
  sceneAttachments,
}: {
  node: DomNodeSpec;
  onEvent?: (type: string) => void;
  hybrid: boolean;
  sceneAttachments: ReturnType<typeof collectSceneAttachments>;
}) {
  // Dynamic tag: the intrinsic-elements union rejects per-tag attrs, so the
  // spec-driven props go through a permissive element type instead.
  const Tag = node.tag as unknown as React.FC<Record<string, unknown>>;
  const style = node.style as React.CSSProperties;
  return (
    <Tag
      id={node.id}
      {...node.attrs}
      style={style}
      {...(node.tag === 'button' ? { type: 'button' } : {})}
      onClick={() => {
        if (node.tag === 'button' && onEvent) {
          const type = ACTION_EVENTS[node.id];
          if (type) onEvent(type);
        }
      }}
    >
      {node.text}
      {node.attachmentSlots.map((slot) => (
        <AttachmentSlotHost
          key={slot.visualId}
          slot={slot}
          hybrid={hybrid}
          sceneAttachments={sceneAttachments}
        />
      ))}
      {node.children.map((child) => (
        <DomTree
          key={child.id}
          node={child}
          onEvent={onEvent}
          hybrid={hybrid}
          sceneAttachments={sceneAttachments}
        />
      ))}
    </Tag>
  );
});

export function ComposeScrollEditorToolbar({
  includeWandOrnament = true,
  onEvent,
  isEditable,
  showMinimapControl = true,
  showSettingsControl = true,
  onEdit,
  onNewScroll,
  onToggleMinimap,
  onOpenSearch,
  onCycleAuroraLevel,
  onToggleFocus,
  onSettingsClick,
}: ComposeScrollEditorToolbarProps) {
  const migrateOn = useFeatureFlag(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
  const masterOn = useFeatureFlag(COMPOSE_FLAGS.ENABLED);
  const hybridRender = useFeatureFlag(COMPOSE_FLAGS.RENDER);
  const enabled = migrateOn || masterOn;

  const { visible, handlers } = useMemo(
    () =>
      mapTopBarPropsToToolbarBridge({
        isEditable,
        showMinimapControl,
        showSettingsControl,
        onEdit,
        onNewScroll,
        onToggleMinimap,
        onOpenSearch,
        onCycleAuroraLevel,
        onToggleFocus,
        onSettingsClick,
      }),
    [
      isEditable,
      showMinimapControl,
      showSettingsControl,
      onEdit,
      onNewScroll,
      onToggleMinimap,
      onOpenSearch,
      onCycleAuroraLevel,
      onToggleFocus,
      onSettingsClick,
    ],
  );

  const scene = useMemo(
    () => createScrollEditorToolbarScene({ includeWandOrnament }),
    [includeWandOrnament],
  );

  const sceneAttachments = useMemo(
    () => collectSceneAttachments(scene),
    [scene],
  );

  const dom = useMemo(() => {
    const full = renderSceneToDomSpec(scene);
    return filterDomTree(full, visible);
  }, [scene, visible]);

  const handleEvent = useCallback(
    (type: string) => {
      emitPbUiEvent({ type, sourceId: 'scroll-editor-toolbar', sequence: Date.now() });
      dispatchToolbarEvent(type, handlers as ScrollEditorToolbarHandlers);
      onEvent?.(type);
    },
    [handlers, onEvent],
  );

  if (!enabled) {
    return null;
  }

  return (
    <div
      className="compose-scroll-editor-toolbar"
      data-compose-pilot="scroll-editor-toolbar"
      data-testid="compose-topbar-actions"
      data-compose-hybrid={hybridRender ? 'on' : 'off'}
    >
      <DomTree
        node={dom}
        onEvent={handleEvent}
        hybrid={hybridRender}
        sceneAttachments={sceneAttachments}
      />
    </div>
  );
}
