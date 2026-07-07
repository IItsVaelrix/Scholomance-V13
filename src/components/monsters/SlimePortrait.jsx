import slimePng from './slime.png';
import crimsonOozePng from './crimson-ooze.png';

const SPRITES = {
  slime:        slimePng,
  crimsonOoze:  crimsonOozePng,
};

function hslString(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}
function hslaString(h, s, l, a) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

export default function SlimePortrait({
  name = 'Slime',
  school = 'WILL',
  effectClass = 'TRANSCENDENT',
  rarity = 'INEXPLICABLE',
  h = 356,
  s = 83,
  l = 52,
  variant = 'slime',
  glowRadius = 32,
  transitionMs = 360,
  animationDurationMs = 800,
  children,
  className = '',
}) {
  const spriteSrc = SPRITES[variant] || slimePng;
  const color        = hslString(h, s, l);
  const colorMuted   = hslString(h, s, Math.min(75, l + 15));
  const glowColor    = hslaString(h, s, Math.min(95, l + 20), 0.5);
  const cardBg       = hslaString(h, s, 12, 0.4);
  const borderColor  = hslaString(h, s, Math.min(75, l + 15), 0.85);
  const bodyBorder   = hslaString(h, s, 60, 0.35);
  const scanline     = hslaString(h, s, l, 0.04);

  const cardStyle = {
    background: cardBg,
    border: `1px solid ${borderColor}`,
    color,
    boxShadow: `0 0 ${glowRadius}px ${glowColor}`,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    transition: `color ${transitionMs}ms ease-in-out, box-shadow ${transitionMs}ms ease-in-out, border-color ${transitionMs}ms ease-in-out`,
    animationDuration: `${animationDurationMs}ms`,
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.95rem',
    fontWeight: 400,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  const nameStyle = { fontWeight: 600 };

  const badgeStyle = {
    padding: '0.1rem 0.5rem',
    border: `1px solid ${color}`,
    borderRadius: '999px',
    fontSize: '0.7rem',
    letterSpacing: '0.08em',
  };

  const bodyStyle = {
    position: 'relative',
    width: '100%',
    height: '200px',
    minHeight: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px dashed ${bodyBorder}`,
    borderRadius: '4px',
    overflow: 'hidden',
    isolation: 'isolate',
  };

  const spriteWrapStyle = {
    position: 'relative',
    width: '192px',
    height: '192px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    transformOrigin: 'center',
    animation: `jello-ripple 5.2s cubic-bezier(0.45, 0, 0.55, 1) infinite, jello-skew 5.2s ease-in-out infinite`,
  };

  const spriteStyle = {
    width: '192px',
    height: '192px',
    imageRendering: 'pixelated',
    display: 'block',
    filter: `drop-shadow(0 0 6px ${glowColor})`,
  };

  const scanlineStyle = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: `repeating-linear-gradient(to bottom, ${scanline} 0, ${scanline} 1px, transparent 1px, transparent 3px)`,
    mixBlendMode: 'screen',
    zIndex: 2,
  };

  const metaStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.75rem',
    opacity: 0.85,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  return (
    <div
      className={`slime-portrait ${className}`.trim()}
      style={cardStyle}
      role="region"
      aria-label={`${name} portrait`}
    >
      <header style={headerStyle}>
        <span style={nameStyle}>{name}</span>
        <span style={badgeStyle} aria-label={`Effect class: ${effectClass}`}>
          {effectClass}
        </span>
      </header>

      <div style={bodyStyle} aria-hidden="true">
        <div style={scanlineStyle} />
        <div style={spriteWrapStyle} className="slime-portrait__sprite-wrap">
          <img
            src={spriteSrc}
            alt=""
            aria-hidden="true"
            draggable={false}
            style={spriteStyle}
            className="slime-portrait__sprite"
          />
        </div>
      </div>

      <footer style={metaStyle}>
        <span>{school}</span>
        <span aria-label={`Rarity: ${rarity}`}>{rarity}</span>
        <span aria-label={`Computed color hsl ${h} ${s} percent ${l} percent`}>
          hsl({h}, {s}%, {l}%)
        </span>
      </footer>

      {children}
    </div>
  );
}
