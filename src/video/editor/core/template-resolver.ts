import type {
  AssetRecord,
  VideoAssetRecord,
  VideoProjectPacketV1,
  VideoProjectPacketV1Like,
  VideoTemplateDefinition,
} from './video-project-packet';

export interface InteractiveContext {
  promptString: (message: string, defaultValue?: string) => string | null;
}

type ResolvedTemplateValue = VideoAssetRecord | string;

function asVideoAsset(
  asset: AssetRecord | VideoAssetRecord,
  kind: VideoAssetRecord['kind'],
): VideoAssetRecord {
  if ('hash' in asset && 'status' in asset) return asset as VideoAssetRecord;
  return {
    id: asset.id,
    kind,
    name: asset.name,
    url: asset.url ?? '',
    hash: `asset:${asset.id}`,
    status: 'ready',
    width: asset.width,
    height: asset.height,
    durationFrames: asset.durationFrames,
    pixelBrainPacket: asset.pixelBrainPacket,
    audioAnalysis: asset.audioAnalysis,
  };
}

function fallbackAsset(
  id: string,
  kind: VideoAssetRecord['kind'],
  url: string,
): VideoAssetRecord {
  return {
    id: `fallback-${id}`,
    kind,
    name: id,
    url,
    hash: `fallback:${kind}:${url}`,
    status: 'ready',
  };
}

export const TemplateResolver = {
  resolveFallbackAudio(project: VideoProjectPacketV1Like): string {
    return project.assets.find((asset) => asset.kind === 'audio')?.url
      || 'https://cdn1.suno.ai/0ff1c2ee-6951-4f65-9204-4cbb2baf16fa.mp3';
  },

  resolveFallbackImage(project: VideoProjectPacketV1Like): string {
    return project.assets.find((asset) => asset.kind === 'image')?.url || '/island_arena.png';
  },

  resolveTemplateAssets(
    template: VideoTemplateDefinition,
    project: VideoProjectPacketV1Like,
    context?: InteractiveContext,
  ): Record<string, ResolvedTemplateValue> {
    const resolved: Record<string, ResolvedTemplateValue> = {};

    for (const requirement of template.requiredAssets ?? []) {
      const asset = project.assets.find((candidate) => candidate.kind === requirement.kind);
      if (asset) {
        resolved[requirement.id] = asVideoAsset(asset, requirement.kind);
        continue;
      }

      const promptedUrl = context?.promptString(`Provide URL for ${requirement.label}:`);
      const fallbackUrl = promptedUrl
        || (requirement.kind === 'audio' ? this.resolveFallbackAudio(project) : null)
        || (requirement.kind === 'image' ? this.resolveFallbackImage(project) : null);
      if (fallbackUrl) {
        resolved[requirement.id] = fallbackAsset(requirement.id, requirement.kind, fallbackUrl);
      }
    }

    for (const placeholder of template.placeholders ?? []) {
      let value: string | null = null;

      if (placeholder.type === 'audio' || placeholder.type === 'video' || placeholder.type === 'image') {
        const asset = project.assets.find((candidate) => candidate.kind === placeholder.type);
        value = asset?.url ?? null;
        if (!value && context) value = context.promptString(`Provide URL for ${placeholder.label}:`);
        if (!value) {
          value = placeholder.type === 'audio'
            ? this.resolveFallbackAudio(project)
            : this.resolveFallbackImage(project);
        }
      } else if (placeholder.type === 'lines') {
        const defaultLines = 'First line\nSecond line\nThird line';
        value = context?.promptString(`Enter lines for ${placeholder.label} (one per line):`, defaultLines)
          ?? defaultLines;
      } else if (placeholder.type === 'color') {
        const defaultColor = '#f1e7c8';
        value = context?.promptString(`Color for ${placeholder.label}:`, defaultColor) ?? defaultColor;
      } else {
        value = context?.promptString(`Value for ${placeholder.label}:`) ?? '';
      }

      if (value !== null) resolved[placeholder.id] = value;
    }

    if (template.placeholders) {
      if (!resolved.audio) resolved.audio = this.resolveFallbackAudio(project);
      if (!resolved.background) resolved.background = this.resolveFallbackImage(project);
      if (!resolved.lines) resolved.lines = 'First line\nSecond line\nThird line';
      if (!resolved.textColor) resolved.textColor = '#f1e7c8';
    }

    if (template.id === 'pixelbrain-showcase' && !resolved.mainAsset) {
      resolved.mainAsset = project.assets.find((asset) => asset.kind === 'pixelbrain')?.id ?? '';
    }

    return resolved;
  },

  applyTemplate(
    template: VideoTemplateDefinition,
    project: VideoProjectPacketV1,
    context?: InteractiveContext,
  ): VideoProjectPacketV1 {
    const resolved = this.resolveTemplateAssets(template, project, context);
    if (template.createProjectPacket) {
      return template.createProjectPacket(resolved as Record<string, VideoAssetRecord>);
    }
    return template.apply?.(resolved, project) ?? project;
  },
};
