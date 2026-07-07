import { VideoTemplateDefinition } from './template-registry';
import { VideoProjectPacketV1Like } from './video-project-packet';

export interface InteractiveContext {
  promptString: (message: string, defaultValue?: string) => string | null;
}

export const TemplateResolver = {
  resolveFallbackAudio(project: VideoProjectPacketV1Like): string {
    return project.assets.find(a => a.kind === 'audio')?.url || 'https://cdn1.suno.ai/0ff1c2ee-6951-4f65-9204-4cbb2baf16fa.mp3';
  },

  resolveFallbackImage(project: VideoProjectPacketV1Like): string {
    return project.assets.find(a => a.kind === 'image')?.url || '/island_arena.png';
  },

  resolveTemplateAssets(
    template: VideoTemplateDefinition,
    project: VideoProjectPacketV1Like,
    context?: InteractiveContext
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const ph of template.placeholders) {
      let val: any = null;
      
      if (ph.type === 'audio' || ph.type === 'video' || ph.type === 'image') {
        const asset = project.assets.find(a => a.kind === ph.type);
        if (asset) {
          val = asset.url;
        } else if (context) {
          val = context.promptString(`Provide URL for ${ph.label}:`);
        } else {
          val = ph.type === 'audio' ? this.resolveFallbackAudio(project) : this.resolveFallbackImage(project);
        }
      } else if (ph.type === 'lines') {
        const defaultLines = 'First line\nSecond line\nThird line';
        val = context ? context.promptString(`Enter lines for ${ph.label} (one per line):`, defaultLines) : defaultLines;
      } else if (ph.type === 'color') {
        const defaultColor = '#f1e7c8';
        val = context ? context.promptString(`Color for ${ph.label}:`, defaultColor) : defaultColor;
      } else {
        val = context ? context.promptString(`Value for ${ph.label}:`) : '';
      }

      if (val !== null) resolved[ph.id] = val;
    }

    // Fallback for hardcoded fields expected by legacy templates if not explicitly declared in placeholders
    if (!resolved['audio']) resolved['audio'] = this.resolveFallbackAudio(project);
    if (!resolved['background']) resolved['background'] = this.resolveFallbackImage(project);
    if (!resolved['lines']) resolved['lines'] = 'First line\nSecond line\nThird line';
    if (!resolved['textColor']) resolved['textColor'] = '#f1e7c8';
    
    // PixelBrain showcase specific fallback
    if (template.id === 'pixelbrain-showcase' && !resolved['mainAsset']) {
      resolved['mainAsset'] = (project.assets.find(a => a.kind === 'pixelbrain') as any)?.id;
    }

    return resolved;
  }
};
