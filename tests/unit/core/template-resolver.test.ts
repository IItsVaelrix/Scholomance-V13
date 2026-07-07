import { TemplateResolver } from '../../../src/video/editor/core/template-resolver';
import { VideoTemplateDefinition } from '../../../src/video/editor/core/template-registry';
import { VideoProjectPacketV1Like } from '../../../src/video/editor/core/video-project-packet';

describe('TemplateResolver', () => {
  const mockProject: VideoProjectPacketV1Like = {
    id: 'test-project',
    version: 1,
    timeline: { tracks: [] },
    assets: [
      { id: 'img1', kind: 'image', url: '/test-image.png' },
      { id: 'aud1', kind: 'audio', url: '/test-audio.mp3' },
      { id: 'pb1', kind: 'pixelbrain', url: '' }
    ]
  };

  const emptyProject: VideoProjectPacketV1Like = {
    id: 'test-project',
    version: 1,
    timeline: { tracks: [] },
    assets: []
  };

  const mockTemplate: VideoTemplateDefinition = {
    id: 'test-template',
    name: 'Test',
    description: 'Test template',
    placeholders: [
      { id: 'myAudio', label: 'Audio Track', type: 'audio' },
      { id: 'myImage', label: 'Background', type: 'image' },
      { id: 'myText', label: 'Title', type: 'string' }
    ],
    apply: () => ({} as any)
  };

  it('resolves fallback assets from the project if available', () => {
    const resolved = TemplateResolver.resolveTemplateAssets(mockTemplate, mockProject);
    expect(resolved['myAudio']).toBe('/test-audio.mp3');
    expect(resolved['myImage']).toBe('/test-image.png');
    // myText defaults to empty string if no interactive prompt
    expect(resolved['myText']).toBe('');
  });

  it('uses hardcoded fallbacks if project has no matching assets', () => {
    const resolved = TemplateResolver.resolveTemplateAssets(mockTemplate, emptyProject);
    expect(resolved['myAudio']).toBe('https://cdn1.suno.ai/0ff1c2ee-6951-4f65-9204-4cbb2baf16fa.mp3');
    expect(resolved['myImage']).toBe('/island_arena.png');
  });

  it('uses interactive prompt when context is provided and asset is missing', () => {
    let promptCount = 0;
    const resolved = TemplateResolver.resolveTemplateAssets(mockTemplate, emptyProject, {
      promptString: (msg, def) => {
        promptCount++;
        if (msg.includes('URL for Audio Track')) return '/prompted-audio.mp3';
        if (msg.includes('URL for Background')) return '/prompted-image.png';
        if (msg.includes('Value for Title')) return 'Prompted Text';
        return def || null;
      }
    });

    expect(promptCount).toBe(3);
    expect(resolved['myAudio']).toBe('/prompted-audio.mp3');
    expect(resolved['myImage']).toBe('/prompted-image.png');
    expect(resolved['myText']).toBe('Prompted Text');
  });

  it('skips interactive prompt if asset exists in project', () => {
    let promptCount = 0;
    const resolved = TemplateResolver.resolveTemplateAssets(mockTemplate, mockProject, {
      promptString: (msg, def) => {
        promptCount++;
        if (msg.includes('Value for Title')) return 'Prompted Text';
        return def || null;
      }
    });

    // Only prompts for string, since audio/image exist
    expect(promptCount).toBe(1);
    expect(resolved['myAudio']).toBe('/test-audio.mp3');
    expect(resolved['myImage']).toBe('/test-image.png');
    expect(resolved['myText']).toBe('Prompted Text');
  });

  it('applies special showcase defaults', () => {
    const showcaseTmpl: VideoTemplateDefinition = {
      id: 'pixelbrain-showcase',
      name: 'Showcase',
      description: 'PB Showcase',
      placeholders: [],
      apply: () => ({} as any)
    };

    const resolved = TemplateResolver.resolveTemplateAssets(showcaseTmpl, mockProject);
    expect(resolved['mainAsset']).toBe('pb1');
  });
});
