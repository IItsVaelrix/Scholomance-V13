import { useState, useRef, useEffect } from 'react';
import './WordToolTip.css';

/**
 * WordToolTip
 * A grimoire-style accessible tooltip for surfacing Oracle definitions.
 *
 * Props:
 *  - term: string (e.g. "ARCHITECTURE")
 *  - category: string (e.g. "Alchemical Constraint")
 *  - definition: string (the definition text)
 */
export default function WordToolTip({ term, category, definition }) {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef(null);
  const safeTerm = String(term || 'term');
  const tooltipId = `word-tooltip-${safeTerm.replace(/\s+/g, '-').toLowerCase()}`;

  const showTooltip = () => setIsVisible(true);
  const hideTooltip = () => setIsVisible(false);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      hideTooltip();
      triggerRef.current?.focus();
      e.stopPropagation();
    }
  };

  useEffect(() => {
    if (isVisible) {
      const handleGlobalKeyDown = (e) => {
        if (e.key === 'Escape') {
          hideTooltip();
          triggerRef.current?.focus();
        }
      };
      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }
  }, [isVisible]);

  return (
    <span className="word-tooltip-container">
      <button
        ref={triggerRef}
        type="button"
        className="word-tooltip-trigger"
        aria-describedby={tooltipId}
        aria-expanded={isVisible}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onKeyDown={handleKeyDown}
      >
        {term}
      </button>
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="word-tooltip-content"
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
        >
          <div className="word-tooltip-header">
            <span className="word-tooltip-title">{safeTerm}</span>
            <span className="word-tooltip-category">{category}</span>
          </div>
          <div className="word-tooltip-divider" />
          <p className="word-tooltip-body">{definition}</p>
        </div>
      )}
    </span>
  );
}
