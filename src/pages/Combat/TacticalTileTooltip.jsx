import React, { useState, useRef, useEffect } from 'react';
import {
  formatModifierLines,
  formatSpellBonusLine,
  getBattleTileDefinition,
} from '../../game/combat/tacticalTileDefinitions.js';

/**
 * TacticalTileTooltip — Hover tooltip for battle tiles.
 *
 * Displays tile type, modifier, movement cost, threatened-by list,
 * line-of-sight status, and spell bonus per PDR §18.1.
 */
export default function TacticalTileTooltip({
  tile = null,
  threatMap = null,
  mousePosition = null,
  visible = false,
  inline = false,
  getTileDefinition = getBattleTileDefinition,
}) {
  const tooltipRef = useRef(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (inline || !visible || !mousePosition || !tooltipRef.current) return;

    const rect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = mousePosition.x + 16;
    let y = mousePosition.y - 8;

    if (x + rect.width > viewportWidth - 8) {
      x = mousePosition.x - rect.width - 16;
    }
    if (y + rect.height > viewportHeight - 8) {
      y = viewportHeight - rect.height - 8;
    }
    if (y < 8) y = 8;

    setAdjustedPosition({ x, y });
  }, [visible, mousePosition, tile]);

  if (!visible || !tile) return null;

  const tileDef = getTileDefinition ? getTileDefinition(tile.terrain) : null;
  const modifier = tile.modifier;
  const control = tile.control;
  const threatenedBy = control?.threatenedBy || [];
  const modifierLines = formatModifierLines(modifier || tileDef?.modifier);
  const spellBonusLine = formatSpellBonusLine(modifier || tileDef?.modifier);
  const movementCost = tile.movementCost ?? tileDef?.movementCost ?? 1;

  const tileLabel = modifier?.label || tileDef?.label || formatTerrainName(tile.terrain);
  const tileGlyph = tileDef?.glyph || tile.visual?.glyph || '';
  const tileColor = tileDef?.colorHint || tile.visual?.colorHint || '#4a4a5a';

  const dangerEntry = threatMap?.controlledTiles?.find(
    (entry) => entry.x === tile.x && entry.y === tile.y,
  );

  return (
    <div
      ref={tooltipRef}
      className={`tactical-tile-tooltip${inline ? ' tactical-tile-tooltip--inline' : ''}`}
      style={inline ? {
        position: 'relative',
        background: 'none',
        border: 'none',
        borderTop: '1px solid var(--combat-hud-border, rgba(255, 255, 255, 0.1))',
        padding: '12px 0 0 0',
        marginTop: '12px',
        boxShadow: 'none',
        backdropFilter: 'none',
      } : {
        position: 'fixed',
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 'var(--z-system, 9000)',
        pointerEvents: 'none',
      }}
      role="tooltip"
      aria-live="polite"
    >
      <div className="tactical-tile-tooltip__header">
        <span
          className="tactical-tile-tooltip__glyph"
          style={{ color: tileColor }}
        >
          {tileGlyph}
        </span>
        <span className="tactical-tile-tooltip__name">
          {tileLabel}
        </span>
      </div>

      {modifierLines.length > 0 && (
        <div className="tactical-tile-tooltip__modifiers">
          {modifierLines.map((line, i) => (
            <div key={i} className="tactical-tile-tooltip__modifier-line">
              {line}
            </div>
          ))}
        </div>
      )}

      {spellBonusLine && (
        <div className="tactical-tile-tooltip__info">
          <span className="tactical-tile-tooltip__label">Spell bonus:</span>
          <span className="tactical-tile-tooltip__value">{spellBonusLine}</span>
        </div>
      )}

      <div className="tactical-tile-tooltip__info">
        <span className="tactical-tile-tooltip__label">Movement:</span>
        <span className="tactical-tile-tooltip__value">
          {tile.walkable ? `${movementCost} point${movementCost > 1 ? 's' : ''}` : 'Impassable'}
        </span>
      </div>

      {tile.z !== undefined && tile.z !== 0 && (
        <div className="tactical-tile-tooltip__info">
          <span className="tactical-tile-tooltip__label">Elevation:</span>
          <span className="tactical-tile-tooltip__value">Level {tile.z}</span>
        </div>
      )}

      {tile.blocksLineOfSight && (
        <div className="tactical-tile-tooltip__warning">
          Blocks line of sight
        </div>
      )}

      {dangerEntry && (
        <div className="tactical-tile-tooltip__info">
          <span className="tactical-tile-tooltip__label">Danger score:</span>
          <span className="tactical-tile-tooltip__value">{Math.round(dangerEntry.dangerScore)}</span>
        </div>
      )}

      {threatenedBy.length > 0 && (
        <div className="tactical-tile-tooltip__threat">
          <span className="tactical-tile-tooltip__label">Threatened by:</span>
          {threatenedBy.map((entityName, i) => (
            <span key={i} className="tactical-tile-tooltip__threat-name">
              {entityName}
            </span>
          ))}
        </div>
      )}

      {control?.controlledBy && (
        <div className="tactical-tile-tooltip__control">
          <span className="tactical-tile-tooltip__label">Controlled by:</span>
          <span className={`tactical-tile-tooltip__control-value tactical-tile-tooltip__control-value--${control.controlledBy}`}>
            {control.controlledBy}
          </span>
        </div>
      )}
    </div>
  );
}

function formatTerrainName(terrain) {
  if (!terrain) return 'Unknown';
  return terrain
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}