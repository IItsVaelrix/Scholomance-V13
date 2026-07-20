import { Img, Video } from 'remotion';
import type { VideoProjectPacketV1, TimelineClip } from '../core/video-project-packet';

interface ClipRendererProps {
  clip: TimelineClip;
  project: VideoProjectPacketV1;
  frame: number; // global frame
}

/**
 * ClipRenderer — renders the source content for a clip.
 * Phase 3: Accurate source rendering + basic trimming.
 */
export function ClipRenderer({ clip, project, frame: _frame }: ClipRendererProps) {
  const asset = project.assets.find((a) => a.id === clip.assetId);

  // Source trimming support
  const sourceStart = clip.sourceStartFrame ?? 0;

  const baseStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  switch (clip.kind) {
    case 'solid':
      return (
        <div
          style={{
            ...baseStyle,
            background: (clip.metadata?.color as string) || '#111111',
          }}
        />
      );

    case 'image':
      if (asset?.url) {
        return (
          <Img
            src={asset.url}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        );
      }
      return <div style={baseStyle}>IMAGE</div>;

    case 'video':
      if (asset?.url) {
        return (
          <Video
            src={asset.url}
            startFrom={sourceStart}
            // endAt is relative to source; we let Sequence control duration
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        );
      }
      return <div style={baseStyle}>VIDEO</div>;

    case 'text':
      return (
        <div
          style={{
            ...baseStyle,
            fontFamily: 'Georgia, serif',
            fontSize: (clip.metadata?.fontSize as number) || 64,
            fontWeight: 700,
            color: (clip.metadata?.color as string) || '#f1e7c8',
            textAlign: 'center',
            padding: 40,
            whiteSpace: 'pre-wrap',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}
        >
          {String(clip.metadata?.text || 'TEXT')}
        </div>
      );

    case 'pixelbrain':
      return (
        <div
          style={{
            ...baseStyle,
            background: 'radial-gradient(circle at 50% 50%, #1a1a2e 0%, #050505 70%)',
            border: '2px solid #334155',
            color: '#94a3b8',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 26,
            letterSpacing: '0.06em',
          }}
        >
          PIXELBRAIN
          <div style={{ fontSize: 13, opacity: 0.55, marginTop: 6 }}>
            {asset?.name || clip.assetId || 'layer'}
          </div>
        </div>
      );

    case 'audio':
      // Visual representation only. Real audio is mounted at root.
      return (
        <div
          style={{
            ...baseStyle,
            opacity: 0.2,
            fontSize: 18,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '2px',
          }}
        >
          ♪ AUDIO
        </div>
      );

    case 'template':
      if (clip.metadata?.templateType === 'win98-window') {
        return (
          <div
            style={{
              ...baseStyle,
              background: '#c0c0c0',
              borderTop: '2px solid #ffffff',
              borderLeft: '2px solid #ffffff',
              borderRight: '2px solid #808080',
              borderBottom: '2px solid #808080',
              padding: '2px',
              width: '600px',
              height: '400px',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Pixelated, "MS Sans Serif", sans-serif',
              boxShadow: '4px 4px 0 rgba(0,0,0,0.5)',
            }}
          >
            {/* Title Bar */}
            <div style={{
              background: 'linear-gradient(to right, #000080, #1084d0)',
              color: 'white',
              padding: '2px 4px',
              fontSize: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <b>Media Player - Visualizer</b>
              <div style={{ background: '#c0c0c0', color: 'black', width: '14px', height: '14px', textAlign: 'center', lineHeight: '12px', border: '1px solid #ffffff', borderBottomColor: '#808080', borderRightColor: '#808080' }}>x</div>
            </div>
            
            {/* Window Content */}
            <div style={{
              flex: 1,
              background: '#000000',
              margin: '8px',
              borderTop: '2px solid #808080',
              borderLeft: '2px solid #808080',
              borderRight: '2px solid #ffffff',
              borderBottom: '2px solid #ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#00ff00',
              position: 'relative',
              overflow: 'hidden'
            }}>
               {/* A fake 3D hallway / visualizer could be placed here.
                   For now, we render a liminal retro grid / wireframe horizon */}
               <div style={{
                 position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: '#00ff00', opacity: 0.5
               }} />
               <div style={{
                 position: 'absolute', top: '50%', bottom: 0, left: 0, right: 0,
                 background: 'repeating-linear-gradient(0deg, transparent, transparent 10px, #00ff0033 11px), repeating-linear-gradient(90deg, transparent, transparent 20px, #00ff0033 21px)',
                 transform: 'perspective(200px) rotateX(60deg)',
               }} />
               <h2 style={{ zIndex: 1, textShadow: '0 0 10px #00ff00' }}>{String(clip.metadata?.text || 'PLAYING...')}</h2>
            </div>
            
            {/* Fake Controls */}
            <div style={{ display: 'flex', gap: '8px', padding: '0 8px 8px' }}>
              <div style={{ width: '30px', height: '20px', background: '#c0c0c0', border: '1px solid #ffffff', borderBottomColor: '#808080', borderRightColor: '#808080' }} />
              <div style={{ flex: 1, height: '20px', background: '#ffffff', border: '1px solid #808080', borderBottomColor: '#ffffff', borderRightColor: '#ffffff' }} />
            </div>
          </div>
        );
      }
      return <div style={baseStyle}>TEMPLATE: {String(clip.metadata?.templateType)}</div>;

    default:
      return <div style={baseStyle}>{clip.kind.toUpperCase()}</div>;
  }
}
