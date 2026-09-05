/**
 * INDEXED PALETTE PANEL
 * System 3: Locked palette, swatches, fg/bg, remap, replace, intensity ratings.
 * Integrates with material-registry + color-intensity-rating-microprocessor via adapter.
 */
import React from 'react';

export function IndexedPalettePanel({
  packet,                 // current PixelBrainAssetPacket (for palettes + provenance)
  fgColor = '#C9A227',
  bgColor = '#111122',
  onColorPick,            // (color, isFg) => void
  onRemap,                // (oldColor, newColor) => void
  onGlobalReplace,        // (oldColor, newColor) => void (global in active layer / selection)
  intensityRatings = {},  // { '#hex': 0.87, ... } from color-intensity-rating-microprocessor
  locked = true,
} = {}) {
  // Derive swatches from packet (prefer material or semantic palette)
  const palettes = packet?.palette || {};
  const sourcePal = palettes.materialPalette || palettes.semanticPalette || palettes.sourcePalette || [];
  const swatches = Array.from(new Set(sourcePal)).slice(0, 32); // cap for UI

  const handleSwatchClick = (color, e) => {
    if (e.shiftKey) {
      if (onGlobalReplace) onGlobalReplace(bgColor, color); // quick global replace using bg as old
    } else {
      if (onColorPick) onColorPick(color, true);
    }
  };

  return (
    <div className="indexed-palette-panel" style={{ border: '1px solid #444', padding: 8, background: '#1a1a2e', color: '#ddd', fontSize: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <strong>INDEXED PALETTE</strong>
        {locked && <span style={{ color: '#4a9', fontSize: 9 }}>LOCKED</span>}
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <div style={{ width: 14, height: 14, background: fgColor, border: '1px solid #fff' }} title="Foreground" />
          <input
            type="color"
            value={fgColor}
            aria-label="Foreground color"
            onChange={(e) => onColorPick && onColorPick(e.target.value, true)}
            style={{ width: 28, height: 18, padding: 0, border: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <div style={{ width: 14, height: 14, background: bgColor, border: '1px solid #666' }} title="Background" />
          <input
            type="color"
            value={bgColor}
            aria-label="Background color"
            onChange={(e) => onColorPick && onColorPick(e.target.value, false)}
            style={{ width: 28, height: 18, padding: 0, border: 'none' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxHeight: 90, overflowY: 'auto' }}>
        {swatches.length > 0 ? (
          swatches
            .filter(c => typeof c === 'string')
            .map((color, i) => {
            const intensity = intensityRatings[color] || 0.5;
            const isFg = color.toLowerCase() === fgColor.toLowerCase();
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={(e) => handleSwatchClick(color, e)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSwatchClick(color, e); }}
                onContextMenu={(e) => { e.preventDefault(); if (onGlobalReplace) onGlobalReplace(fgColor, color); }}
                title={`${color} • intensity ${intensity.toFixed(2)} (click=fg, shift/ctx=replace)`}
                style={{
                  width: 16,
                  height: 16,
                  background: color,
                  border: isFg ? '2px solid #fff' : '1px solid #555',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {intensity > 0.75 && <div style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 4, background: '#ff0', borderRadius: 2 }} />}
              </div>
            );
          })
        ) : (
          <div style={{ color: '#666', fontSize: 10 }}>No palette in packet</div>
        )}
      </div>

      <div style={{ fontSize: 9, marginTop: 4, color: '#888' }}>
        Click swatch = FG • Shift/Right = global replace in active layer
      </div>
    </div>
  );
}
