import { useEffect, useRef } from 'react';
import { Trash2, X } from 'lucide-react';

/**
 * Dev slash-command console — isolated from spellweave verse/weave inputs.
 */
export default function CombatCommandsConsole({
  open,
  onOpenChange,
  commandInput,
  onCommandInputChange,
  onSubmit,
  logs,
  onClearLogs,
}) {
  const inputRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, open]);

  const handleKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onOpenChange(false);
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey) return;
    const raw = (event.currentTarget?.value ?? '').trim();
    if (!raw) return;
    event.preventDefault();
    onSubmit(raw);
  };

  if (!open) return null;

  return (
    <div
      className="combat-commands-console"
      role="dialog"
      aria-label="Combat slash command console"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="combat-commands-console__corner combat-commands-console__corner--tl" aria-hidden="true" />
      <span className="combat-commands-console__corner combat-commands-console__corner--tr" aria-hidden="true" />
      <span className="combat-commands-console__corner combat-commands-console__corner--bl" aria-hidden="true" />
      <span className="combat-commands-console__corner combat-commands-console__corner--br" aria-hidden="true" />

      <div className="combat-commands-console__header">
        <div className="combat-commands-console__plate">
          <div className="combat-commands-console__icon-housing" aria-hidden="true">
            <span className="combat-commands-console__icon-glyph">CMD</span>
          </div>
          <div className="combat-commands-console__title-group">
            <span className="combat-commands-console__eyebrow">Scholomance Systems</span>
            <span className="combat-commands-console__label">Directive Console</span>
            <span className="combat-commands-console__serial">SYS-CMD-01 / REV.B</span>
          </div>
        </div>

        <div className="combat-commands-console__status-rail" aria-hidden="true">
          <span className="combat-commands-console__status-lamp" />
          <span className="combat-commands-console__status-copy">ARMED</span>
        </div>

        <div className="combat-commands-console__actions">
          <button
            type="button"
            className="combat-commands-console__action-btn"
            onClick={onClearLogs}
            aria-label="Clear command log"
          >
            <Trash2 size={11} aria-hidden="true" />
            <span>PURGE</span>
          </button>
          <button
            type="button"
            className="combat-commands-console__action-btn combat-commands-console__action-btn--close"
            onClick={() => onOpenChange(false)}
            aria-label="Close command console"
          >
            <X size={12} aria-hidden="true" />
            <span>EXIT</span>
          </button>
        </div>
      </div>

      <div className="combat-commands-console__viewport">
        <div className="combat-commands-console__viewport-label">
          <span>TRACE BUFFER</span>
          <span className="combat-commands-console__viewport-id">BUF-04</span>
        </div>
        <div className="combat-commands-console__log" ref={logRef}>
          <div className="combat-commands-console__grid" aria-hidden="true" />
          {logs.length === 0 ? (
            <div className="combat-commands-console__empty" aria-live="polite">
              <span className="combat-commands-console__prompt">scholo://combat/cmd</span>
              <span className="combat-commands-console__hint">/help — list commands</span>
              <span className="combat-commands-console__hint">/warp polaris — sonic forest</span>
              <span className="combat-commands-console__hint">/warp tutorial — void courtyard</span>
            </div>
          ) : (
            logs.map((log, index) => (
              <div
                key={`${log.ts}-${index}`}
                className={`combat-commands-console__line combat-commands-console__line--${log.type}`}
              >
                <span className="combat-commands-console__ts">[{log.ts}]</span>
                <span className="combat-commands-console__text">{log.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <form
        className="combat-commands-console__form"
        onSubmit={(event) => {
          event.preventDefault();
          const raw = commandInput.trim();
          if (raw) onSubmit(raw);
        }}
      >
        <div className="combat-commands-console__input-label">
          <span>INJECTION LINE</span>
          <span className="combat-commands-console__input-id">IN-01</span>
        </div>
        <label className="combat-commands-console__input-wrap">
          <span className="combat-commands-console__chevron" aria-hidden="true">&gt;</span>
          <input
            ref={inputRef}
            className="combat-commands-console__input"
            value={commandInput}
            onChange={(event) => onCommandInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/warp polaris"
            aria-label="Slash command input"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="combat-commands-console__input-ready" aria-hidden="true">RDY</span>
        </label>
      </form>
    </div>
  );
}