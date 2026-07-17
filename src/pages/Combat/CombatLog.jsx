import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './CombatLog.css'; // Assuming we create a CSS file for CombatLog or just append to CombatPage.css

const COMBAT_LOG_PREFIX = {
  damage: 'DMG',
  heal: 'HEAL',
  cast: 'CAST',
  move: 'MOVE',
  extract: 'EXT',
  wait: 'WAIT',
  system: 'SYS',
  error: 'ERR',
};

function resolveCombatLogPrefix(turn) {
  // Try to derive a type from the turn data
  let type = String(turn?.actionType || turn?.type || turn?.kind || '').toLowerCase();

  // Fallbacks if type is missing
  if (!type) {
    const text = String(turn?.narrativeLog || turn?.commentary || '').toLowerCase();
    if (text.includes('damage') || text.includes('hit')) type = 'damage';
    else if (text.includes('heal') || text.includes('restore')) type = 'heal';
    else if (text.includes('cast') || text.includes('chant')) type = 'cast';
    else if (text.includes('move')) type = 'move';
    else if (text.includes('extract') || text.includes('leyline')) type = 'extract';
    else type = 'system';
  }

  return COMBAT_LOG_PREFIX[type] || 'LOG';
}

/**
 * CombatLog.jsx - CombatLogDrawer
 *
 * Chronicle of combat events. Supports collapse/expand modes so the log
 * supports MUD information density without drowning the battlefield.
 *
 * Modes:
 *   collapsed - shows last 2 entries + fade + toggle button
 *   expanded - full scrollable chronicle (current behavior)
 *
 * Animation sync with board events is preserved from original implementation.
 */

export default function CombatLog({ history = [], isResolving, activeIntent, isCollapsed = false, onToggle, variant = 'panel' }) {
  const [visibleHistory, setVisibleHistory] = useState([]);
  const logRef = useRef(null);

  useEffect(() => {
    if (!activeIntent) {
      setVisibleHistory(history);
    }
  }, [history, activeIntent]);

  useEffect(() => {
    if (logRef.current && !isCollapsed) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleHistory, isResolving, isCollapsed]);

  const displayEntries = isCollapsed
    ? visibleHistory.slice(-2)
    : visibleHistory;

  if (variant === 'mud') {
    return (
      <ol className="combat-mud-log" aria-live="polite" ref={logRef}>
        {displayEntries.map((turn, index) => {
          const prefix = resolveCombatLogPrefix(turn);
          const text = turn?.narrativeLog || turn?.commentary || turn?.message || String(turn || '');

          return (
            <li
              key={turn?.id || `${prefix}-${index}`}
              className={`combat-mud-log__entry combat-mud-log__entry--${prefix.toLowerCase()}`}
            >
              <span className="combat-mud-log__index">
                {String(index + 1).padStart(3, '0')}
              </span>

              <span className="combat-mud-log__prefix">
                {prefix}
              </span>

              <span className="combat-mud-log__text">
                {text}
                {turn?.scoreSummary?.badges?.length > 0 && (
                  <span className="combat-mud-log__badges"> · {turn.scoreSummary.badges.slice(0, 3).join(' · ')}</span>
                )}
                {turn?.damageMap?.[0]?.outcomeLabel === 'crit' && (
                  <span className="combat-mud-log__crit"> *CRIT*</span>
                )}
              </span>
            </li>
          );
        })}
        {isResolving && (
          <li className="combat-mud-log__entry combat-mud-log__entry--system">
             <span className="combat-mud-log__index">---</span>
             <span className="combat-mud-log__prefix">SYS</span>
             <span className="combat-mud-log__text">Awaiting resolution...</span>
          </li>
        )}
      </ol>
    );
  }

  return (
    <div className={`combat-log battle-panel${isCollapsed ? ' is-collapsed' : ''}`}>
      <div className="combat-log-header">
        <span className="combat-log-title">CHRONICLE</span>
        {onToggle && (
          <button
            className="log-toggle-btn"
            onClick={onToggle}
            aria-label={isCollapsed ? 'Expand chronicle' : 'Collapse chronicle'}
            title={isCollapsed ? 'Expand [` key]' : 'Collapse [` key]'}
            type="button"
          >
            {isCollapsed ? '▲ EXPAND' : '▼ COLLAPSE'}
          </button>
        )}
      </div>

      <div className={`log-entries${isCollapsed ? ' log-entries-collapsed' : ''}`} ref={logRef}>
        <AnimatePresence initial={false}>
          {displayEntries.map((turn, i) => (
            <LogEntry
              key={turn.id ?? `${turn.narrativeLog}-${i}`}
              turn={turn}
            />
          ))}
        </AnimatePresence>

        {isResolving && (
          <div className="log-resolving-indicator" aria-label="Resolving">
            <div className="resolving-dot" />
            <div className="resolving-dot" />
            <div className="resolving-dot" />
          </div>
        )}
      </div>

      {isCollapsed && visibleHistory.length > 2 && (
        <div className="log-collapsed-fade" aria-hidden="true" />
      )}
    </div>
  );
}

function LogEntry({ turn }) {
  const timestamp = turn?.timestamp
    ? new Date(turn.timestamp)
    : new Date();
  const badges = Array.isArray(turn?.scoreSummary?.badges)
    ? turn.scoreSummary.badges.slice(0, 4)
    : [];
  const counterTokens = Array.isArray(turn?.counterTokens)
    ? turn.counterTokens.slice(0, 3)
    : [];
  const traceLine = Array.isArray(turn?.explainTrace)
    ? turn.explainTrace
      .slice(0, 2)
      .map((trace) => `${String(trace?.heuristic || '').replaceAll('_', ' ')} ${Math.round(Number(trace?.contribution) || 0)}`)
      .filter(Boolean)
      .join(' · ')
    : '';

  return (
    <motion.div
      className="log-entry"
      data-outcome={turn.damageMap?.[0]?.outcomeLabel}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <span className="log-timestamp">
        [{timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
      </span>
      <span className="log-text">{turn.narrativeLog}</span>
      {turn.commentary && turn.commentary !== turn.narrativeLog && (
        <div className="log-commentary">{turn.commentary}</div>
      )}
      {badges.length > 0 && (
        <div className="log-badges">{badges.join(' · ')}</div>
      )}
      {turn.telegraph?.summary && (
        <div className="log-telegraph">TELEGRAPH: {turn.telegraph.summary}</div>
      )}
      {counterTokens.length > 0 && (
        <div className="log-counter-tokens">COUNTER TOKENS: {counterTokens.join(', ')}</div>
      )}
      {traceLine && (
        <div className="log-traces">TRACES: {traceLine}</div>
      )}
    </motion.div>
  );
}
