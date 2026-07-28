import type { PbUiSceneV1, UiSceneNode } from '../schema/packets';
import { CODES, type ComposeDiagnostic, diag } from './diagnostics';

const KNOWN_KINDS = new Set([
  'toolbar',
  'button',
  'checkbox',
  'switch',
  'tabs',
  'dialog',
  'input',
  'slider',
  'tooltip',
  'menu',
  'popover',
  'combobox',
  'accordion',
  'text',
  'container',
]);

export type ValidateComposeSceneResult = {
  ok: boolean;
  diagnostics: ComposeDiagnostic[];
};

/**
 * Single recursive walk over both `children` and `slots` that checks
 * duplicate IDs, custom kinds against definitions, and visual references
 * against the scene visual registry.
 */
function walkNode(
  node: UiSceneNode,
  scene: PbUiSceneV1,
  seen: Set<string>,
  definedKinds: Set<string>,
  diagnostics: ComposeDiagnostic[],
): void {
  if (seen.has(node.id)) {
    diagnostics.push(
      diag(CODES.DUPLICATE_ID, 'ERROR', `Duplicate node ID: ${node.id}`, {
        sourceNodeId: node.id,
        recovery: 'Assign unique ids across the scene tree',
      }),
    );
  }
  seen.add(node.id);

  if (!KNOWN_KINDS.has(node.kind) && !definedKinds.has(node.kind)) {
    diagnostics.push(
      diag(CODES.UNKNOWN_KIND, 'ERROR', `Unknown component kind: ${node.kind}`, {
        sourceNodeId: node.id,
        recovery: 'Register a SCHOL-COMPONENT-DEFINITION-v1 for this kind',
      }),
    );
  }

  for (const visualRef of node.visualRefs ?? []) {
    if (!scene.visuals?.[visualRef]) {
      diagnostics.push(
        diag(CODES.UNKNOWN_SLOT, 'ERROR', `Unknown visual attachment: ${visualRef}`, {
          sourceNodeId: node.id,
        }),
      );
    }
  }

  for (const child of node.children ?? []) {
    walkNode(child, scene, seen, definedKinds, diagnostics);
  }
  if (node.slots) {
    for (const slotNodes of Object.values(node.slots)) {
      for (const child of slotNodes) {
        walkNode(child, scene, seen, definedKinds, diagnostics);
      }
    }
  }
}

export function validateComposeScene(scene: PbUiSceneV1): ValidateComposeSceneResult {
  const diagnostics: ComposeDiagnostic[] = [];

  if (scene.contract !== 'PB-UI-SCENE-v1') {
    diagnostics.push(
      diag(CODES.INVALID_INSTANCE, 'ERROR', `Expected PB-UI-SCENE-v1, got ${scene.contract}`),
    );
  }

  const definedKinds = new Set(Object.keys(scene.definitions ?? {}));

  if (scene.root) {
    walkNode(scene.root, scene, new Set(), definedKinds, diagnostics);
  }

  for (const [layoutId, layout] of Object.entries(scene.layouts ?? {})) {
    const modes = ['flow', 'grid', 'absolute', 'overlay', 'constraint'];
    if (!modes.includes(layout.mode)) {
      diagnostics.push(
        diag(CODES.LAYOUT_MODE, 'ERROR', `Unsupported layout mode: ${layout.mode}`, {
          context: { layoutId },
        }),
      );
    }
  }

  return {
    ok: diagnostics.every((d) => d.severity !== 'ERROR'),
    diagnostics,
  };
}
