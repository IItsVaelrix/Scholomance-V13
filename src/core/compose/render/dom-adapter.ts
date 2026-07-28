/**
 * Lower PB-UI-SCENE-v1 → declarative DOM specs (accessible HTML intent).
 * Does not touch the live document — callers mount as needed.
 */

import type {
  PbUiSceneV1,
  UiSceneNode,
  PbLayoutV1,
  VisualAttachment,
} from '../schema/packets';
import { lowerFlowToCss, lowerCommonToCss, lowerGridToCss } from '../layout/emit-layout';

export type DomAttachmentSpec = {
  slot: string;
  visualId: string;
  kind: VisualAttachment['kind'];
  packetId?: string;
  tokenPath?: string;
  className?: string;
};

export type DomNodeSpec = {
  tag: string;
  id: string;
  role?: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  children: DomNodeSpec[];
  text?: string;
  /** Visual attachment hosts (WAND/SCDL) — empty when none */
  attachmentSlots: DomAttachmentSpec[];
};

/** Landmark roles map to native semantic tags. */
const ROLE_TAGS: Readonly<Record<string, string>> = {
  banner: 'header',
  main: 'main',
  complementary: 'aside',
  navigation: 'nav',
  region: 'section',
  form: 'form',
  log: 'ol',
};

/** Explicit string attribute allowlist passed through from node props. */
const ATTR_ALLOWLIST = [
  'aria-label',
  'aria-live',
  'aria-atomic',
  'aria-describedby',
  'autocomplete',
  'inputmode',
  'name',
  'placeholder',
  'type',
] as const;

function tagForKind(kind: string, role?: string): string {
  // button and input kinds are authoritative over role mapping
  if (kind === 'button' || role === 'button') return 'button';
  if (kind === 'input') return 'input';
  if (role && ROLE_TAGS[role]) return ROLE_TAGS[role];
  if (kind === 'toolbar' || role === 'toolbar') return 'div';
  return 'div';
}

function copyAttachmentFields(
  visualId: string,
  visual: VisualAttachment,
): DomAttachmentSpec {
  const spec: DomAttachmentSpec = {
    slot: visual.placementSlot,
    visualId,
    kind: visual.kind,
  };
  if (visual.kind === 'scdl-asset') spec.packetId = visual.packetId;
  if (visual.kind === 'token') spec.tokenPath = visual.tokenPath;
  if (visual.kind === 'native-dom' && visual.className) spec.className = visual.className;
  return spec;
}

function lowerNode(node: UiSceneNode, scene: PbUiSceneV1): DomNodeSpec {
  const layout: PbLayoutV1 | undefined = node.layoutRef
    ? scene.layouts[node.layoutRef]
    : undefined;

  // Merge common styles first, mode-specific styles second.
  const common = layout?.common ? lowerCommonToCss(layout.common) : {};
  const mode =
    layout?.mode === 'flow' && layout.flow
      ? lowerFlowToCss(layout.flow)
      : layout?.mode === 'grid' && layout.grid
        ? lowerGridToCss(layout.grid)
        : {};
  const style: Record<string, string> = { ...common, ...mode };

  const attrs: Record<string, string> = {};
  const props = node.props ?? {};

  // Pass through only the explicit string allowlist.
  for (const name of ATTR_ALLOWLIST) {
    const value = props[name];
    if (typeof value === 'string') attrs[name] = value;
  }

  // Boolean disabled is normalized separately.
  if (props.disabled === true) attrs.disabled = 'true';
  if (typeof props.orientation === 'string') attrs['aria-orientation'] = props.orientation;

  // Record the compose kind for runtime hosts / diagnostics.
  attrs['data-compose-kind'] = node.kind;

  const def = scene.definitions[node.kind];
  if (def?.accessibility?.ariaRole) {
    attrs.role = def.accessibility.ariaRole;
  } else if (node.role) {
    attrs.role = node.role;
  }

  const attachmentSlots: DomAttachmentSpec[] = [];
  for (const visualId of node.visualRefs ?? []) {
    const visual = scene.visuals[visualId];
    if (visual) {
      attachmentSlots.push(copyAttachmentFields(visualId, visual));
    }
  }

  const children = (node.children ?? []).map((c) => lowerNode(c, scene));

  const text = typeof props.label === 'string' ? props.label : undefined;

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
