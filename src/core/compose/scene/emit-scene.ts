import type { PbUiSceneV1, ScholComponentDefinitionV1, UiSceneNode, VisualAttachment, PbLayoutV1 } from '../schema/packets';
import { canonicalizePacket, checksumCanonical } from '../schema/canonicalize';

export type EmitPbUiSceneInput = {
  id: string;
  root: UiSceneNode;
  definitions: Record<string, ScholComponentDefinitionV1>;
  layouts?: Record<string, PbLayoutV1>;
  visuals?: Record<string, VisualAttachment>;
};

/**
 * Emit a PB-UI-SCENE-v1 packet with deterministic sourceChecksum.
 * Checksum covers identity fields excluding the checksum field itself.
 */
export function emitPbUiScene(input: EmitPbUiSceneInput | PbUiSceneV1): PbUiSceneV1 {
  const layouts = input.layouts ?? {};
  const visuals = input.visuals ?? {};
  const identityBody = {
    contract: 'PB-UI-SCENE-v1' as const,
    version: '1.0.0' as const,
    id: input.id,
    root: input.root,
    definitions: input.definitions,
    layouts,
    visuals,
  };

  return {
    ...identityBody,
    sourceChecksum: checksumCanonical(identityBody),
  };
}

/** Re-emit ensuring checksum matches content (idempotent). */
export function rehashScene(scene: PbUiSceneV1): PbUiSceneV1 {
  return emitPbUiScene(scene);
}

export function sceneToCanonicalJson(scene: PbUiSceneV1): string {
  return canonicalizePacket(rehashScene(scene));
}
