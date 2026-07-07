import React from 'react';

/**
 * TileInspector.jsx
 *
 * Lightweight panel showing data about the currently cursor-focused tile.
 * Gated by parent/internal logic: only visible when the tile contains a leyline glyph.
 */
export default function TileInspector({ cellLabel, range, occupantEntity, scholarRange, tile }) {
  if (!tile || !tile.hasLeyline) {
    return null;
  }

  const outOfRange = range != null && scholarRange != null && range > scholarRange;
  const starRatingStr = '★'.repeat(tile.leylineStars || 1) + '☆'.repeat(5 - (tile.leylineStars || 1));

  return (
    <div className="tile-inspector-panel" aria-label="Tile inspector">
      <div className="bottom-subpanel-title">LEYLINE GLYPH</div>
      <div className="tile-inspector">
        <div className="inspector-row">
          <span className="inspector-key">COORD</span>
          <span className="inspector-val">{cellLabel || ' - '}</span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">GLYPH TYPE</span>
          <span className="inspector-val">{tile.leylineType ? tile.leylineType.toUpperCase().replace('-', ' ') : ' - '}</span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">AFFINITY</span>
          <span className="inspector-val">{tile.leylineAffinity || ' - '}</span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">HARVEST</span>
          <span className="inspector-val">{starRatingStr}</span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">PHASE</span>
          <span className={`inspector-val phase-${tile.leylinePhase}`}>
            {tile.leylinePhase ? tile.leylinePhase.toUpperCase() : ' - '}
          </span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">DIST</span>
          <span className={`inspector-val${outOfRange ? ' out-of-range' : ''}`}>
            {range ?? ' - '}
          </span>
        </div>
        {occupantEntity && (
          <div className="inspector-row">
            <span className="inspector-key">OCCUPANT</span>
            <span className="inspector-val">{occupantEntity.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
