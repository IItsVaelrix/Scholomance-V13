/**
 * Lower PB-UI-SCENE-v1 → declarative DOM specs (accessible HTML intent).
 * Does not touch the live document — callers mount as needed.
 */

import type { PbUiSceneV1, UiSceneNode, PbLayoutV1 } from '../schema/packets';
import { lowerFlowToCss } from '../layout/emit-layout';

export type DomNodeSpec = {
  tag: string;
  id: string;
  role?: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  children: DomNodeSpec[];
  text?: string;
  /** Visual attachment hosts (WAND/SCDL) — empty when none */
  attachmentSlots: Array<{ slot: string; visualId: string; kind: string }>;
};

function tagForKind(kind: string, role?: string): string {
  if (kind === 'button' || role === 'button') return 'button';
  if (kind === 'toolbar' || role === 'toolbar') return 'div';
  if (kind === 'input') return 'input';
  return 'div';
}

function lowerNode(
  node: UiSceneNode,
  scene: PbUiSceneV1,
): DomNodeSpec {
  const layout: PbLayoutV1 | undefined = node.layoutRef
    ? scene.layouts[node.layoutRef]
    : undefined;

  let style: Record<string, string> = {};
  if (layout?.mode === 'flow' && layout.flow) {
    style = lowerFlowToCss(layout.flow);
  }

  const attrs: Record<string, string> = {};
  const props = node.props ?? {};
  if (typeof props['aria-label'] === 'string') attrs['aria-label'] = props['aria-label'];
  if (props.disabled === true) attrs.disabled = 'true';
  if (typeof props.orientation === 'string') attrs['aria-orientation'] = props.orientation;
  if (typeof props.label === 'string' && tagForKind(node.kind, node.role) === 'button') {
    // label becomes text content
  }

  const def = scene.definitions[node.kind];
  if (def?.accessibility?.ariaRole) {
    attrs.role = def.accessibility.ariaRole;
  } else if (node.role) {
    attrs.role = node.role;
  }

  const attachmentSlots: DomNodeSpec['attachmentSlots'] = [];
  for (const visualId of node.visualRefs ?? []) {
    const visual = scene.visuals[visualId];
    if (visual) {
      attachmentSlots.push({
        slot: visual.placementSlot,
        visualId,
        kind: visual.kind,
      });
    }
  }

  const children = (node.children ?? []).map((c) => lowerNode(c, scene));

  const text =
    typeof props.label === 'string' ? props.label : undefined;

  return {
    tag: tagForKind(node.kind, node.role),
    id: node.id,
    role: attrs.role,
    attrs,
    style,
    children,
    text,
    attachmentSlots,
  };
}

/**
 * Convert a scene packet into a DOM intent tree.
 * Removing visualRefs / visuals leaves the same semantic tags/roles.
 */
export function renderSceneToDomSpec(scene: PbUiSceneV1): DomNodeSpec {
  return lowerNode(scene.root, scene);
}
