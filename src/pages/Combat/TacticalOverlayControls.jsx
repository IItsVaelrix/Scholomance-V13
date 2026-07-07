import React, { useState, useCallback } from 'react';

/**
 * TacticalOverlayControls — Toggle panel for tactical board overlays.
 *
 * Controls which overlay layers are visible per PDR §18.3:
 * - Movement range
 * - Enemy threat zones
 * - Spell range
 * - Premium tiles highlight
 * - School tiles highlight
 * - Line-of-sight
 *
 * Does not show everything at once by default (PDR §18.3).
 *
 * @param {Object} props
 * @param {Object} props.activeOverlays - Current overlay state { movement, threat, spell, premium, school, lineOfSight }.
 * @param {Function} props.onToggleOverlay - Callback: (overlayKey) => void.
 * @param {boolean} [props.compact] - Whether to show compact mode.
 * @param {boolean} [props.disabled] - Whether controls are disabled.
 */
export default function TacticalOverlayControls({
  activeOverlays = {},
  onToggleOverlay,
  compact = false,
  disabled = false,
}) {
  const [expanded, setExpanded] = useState(!compact);

  const toggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleToggle = useCallback((key) => {
    if (disabled || !onToggleOverlay) return;
    onToggleOverlay(key);
  }, [disabled, onToggleOverlay]);

  const overlayOptions = [
    {
      key: 'movement',
      label: 'Movement',
      shortLabel: 'Mv',
      icon: '⟐',
      description: 'Show reachable tiles for selected unit.',
      colorHint: 'rgba(66, 133, 244, 0.6)',
      hotkey: 'M',
    },
    {
      key: 'threat',
      label: 'Enemy Threat',
      shortLabel: 'Th',
      icon: '⚡',
      description: 'Show tiles threatened by enemies.',
      colorHint: 'rgba(234, 67, 53, 0.6)',
      hotkey: 'T',
    },
    {
      key: 'spell',
      label: 'Spell Range',
      shortLabel: 'Sp',
      icon: '◇',
      description: 'Show tiles within spell casting range.',
      colorHint: 'rgba(251, 188, 4, 0.6)',
      hotkey: 'S',
    },
    {
      key: 'premium',
      label: 'Premium Tiles',
      shortLabel: 'Pr',
      icon: '★',
      description: 'Highlight rune, anchor, and null tiles.',
      colorHint: 'rgba(204, 136, 255, 0.6)',
      hotkey: 'P',
    },
    {
      key: 'school',
      label: 'School Tiles',
      shortLabel: 'Sc',
      icon: '◆',
      description: 'Highlight fire, void, sonic, ice, and holy tiles.',
      colorHint: 'rgba(34, 170, 204, 0.6)',
      hotkey: 'O',
    },
    {
      key: 'lineOfSight',
      label: 'Line of Sight',
      shortLabel: 'LS',
      icon: '◎',
      description: 'Show line-of-sight from selected unit.',
      colorHint: 'rgba(52, 168, 83, 0.6)',
      hotkey: 'L',
    },
  ];

  return (
    <div
      className={`tactical-overlay-controls ${compact ? 'tactical-overlay-controls--compact' : ''}`}
      role="toolbar"
      aria-label="Tactical board overlay controls"
    >
      {/* Toggle button for compact mode */}
      {compact && (
        <button
          className="tactical-overlay-controls__expand-btn"
          onClick={toggleExpand}
          aria-expanded={expanded}
          aria-label="Toggle overlay controls"
          title="Toggle tactical overlays"
        >
          <span className="tactical-overlay-controls__expand-icon">
            {expanded ? '◁' : '▷'}
          </span>
          <span className="tactical-overlay-controls__expand-label">
            Overlays
          </span>
        </button>
      )}

      {/* Overlay toggles */}
      {expanded && (
        <div className="tactical-overlay-controls__grid">
          {overlayOptions.map(opt => {
            const isActive = !!activeOverlays[opt.key];
            return (
              <button
                key={opt.key}
                className={`tactical-overlay-controls__btn ${isActive ? 'tactical-overlay-controls__btn--active' : ''}`}
                onClick={() => handleToggle(opt.key)}
                disabled={disabled}
                aria-pressed={isActive}
                aria-label={`${isActive ? 'Hide' : 'Show'} ${opt.label} overlay`}
                title={`${opt.label} (${opt.hotkey})\n${opt.description}`}
              >
                <span
                  className="tactical-overlay-controls__btn-indicator"
                  style={{
                    backgroundColor: isActive ? opt.colorHint : 'transparent',
                    borderColor: opt.colorHint,
                  }}
                />
                <span className="tactical-overlay-controls__btn-icon">
                  {opt.icon}
                </span>
                <span className="tactical-overlay-controls__btn-label">
                  {compact ? opt.shortLabel : opt.label}
                </span>
                <span className="tactical-overlay-controls__btn-hotkey">
                  {opt.hotkey}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Hook for managing tactical overlay state.
 * Returns current overlay state and toggle function.
 *
 * @returns {{ overlays: Object, toggleOverlay: Function, resetOverlays: Function }}
 */
export function useTacticalOverlays() {
  const [overlays, setOverlays] = useState({
    movement: false,
    threat: false,
    spell: false,
    premium: false,
    school: false,
    lineOfSight: false,
  });

  const toggleOverlay = useCallback((key) => {
    setOverlays(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const resetOverlays = useCallback(() => {
    setOverlays({
      movement: false,
      threat: false,
      spell: false,
      premium: false,
      school: false,
      lineOfSight: false,
    });
  }, []);

  return { overlays, toggleOverlay, resetOverlays };
}
