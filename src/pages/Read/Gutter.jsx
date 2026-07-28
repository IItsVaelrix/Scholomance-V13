import { forwardRef, memo, useRef, useImperativeHandle } from 'react';
import { Z_BASE } from '../../data/stacking_tiers';
import './IDE.css';

// Max syllable bar segments before we just show the number (keeps the gutter tidy).
const MAX_BARS = 8;

// Symmetric line marker - a small filled diamond that replaces the old asymmetric
// ".)" suffix and divides the line number from the syllable bars. Fill/opacity
// come from CSS (.gutter-tick), brightening on the current line.
// Memoized so it never re-renders (and therefore never re-layouts) when rows
// shift or line heights change during typing.
const GutterTick = memo(function GutterTick() {
  return <span className="gutter-tick" aria-hidden="true" />;
});

const Gutter = forwardRef(function Gutter({
  overlayLines = [],
  lineCounts = [],
  contentLineCount = 0,
  topOffset = 0,
  viewportHeight,
  lineHeightPx,
  // Lexical editor API
  totalLines = 0,
  syllablesPerLine = [],
  currentLine = 0,
}, ref) {
  const safeLineHeight = Number.isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx : 24;
  const safeTopOffset = Number.isFinite(topOffset) && topOffset > 0 ? topOffset : 0;

  const trackRef = useRef(null);

  useImperativeHandle(ref, () => ({
    syncScroll(top) {
      if (trackRef.current) {
        trackRef.current.style.transform = `translateY(-${top}px)`;
      }
    },
  }), []);

  const rowStyle = {
    minHeight: `${safeLineHeight}px`,
    height: `${safeLineHeight}px`,
  };

  // Normalize all three input shapes into a single list of rows:
  // { lineNumber (1-based), syllables, blank }.
  let rows = [];
  if (overlayLines.length > 0) {
    const shownRawLines = new Set();
    rows = overlayLines.map((line) => {
      const rawIdx = line.rawLineIndex;
      const isFirstVisualLine = !shownRawLines.has(rawIdx);
      if (isFirstVisualLine) shownRawLines.add(rawIdx);
      return {
        lineNumber: isFirstVisualLine ? rawIdx + 1 : null,
        syllables: isFirstVisualLine ? (Number(lineCounts[rawIdx]) || 0) : 0,
      };
    });
  } else {
    const count = totalLines > 0 ? totalLines : contentLineCount;
    rows = Array.from({ length: count }, (_, i) => ({
      lineNumber: i + 1,
      syllables: Number(syllablesPerLine[i] ?? lineCounts[i]) || 0,
    }));
  }

  const renderSyllables = (n) => {
    if (n <= 0) return null;
    return (
      <span className="syllable-count-mini" title={`${n} syllable${n === 1 ? '' : 's'}`}>
        {n}
      </span>
    );
  };

  return (
    <div
      className="editor-gutter"
      style={{ height: viewportHeight, zIndex: Z_BASE }}
      aria-hidden="true"
    >
      <div
        ref={trackRef}
        className="gutter-track"
        style={safeTopOffset > 0 ? { paddingTop: `${safeTopOffset}px` } : undefined}
      >
        {rows.map((row, i) => {
          const isCurrent = row.lineNumber != null && row.lineNumber === currentLine;
          // Stable key prevents React from remounting rows (and their ticks) when
          // a new line is inserted above and indices shift.
          const key = row.lineNumber != null ? `line-${row.lineNumber}` : `blank-${i}`;
          return (
            <div
              key={key}
              className={`gutter-row${isCurrent ? ' gutter-row--current' : ''}`}
              style={rowStyle}
            >
              <span className="line-number">{row.lineNumber != null ? row.lineNumber : ''}</span>
              {row.lineNumber != null && <GutterTick />}
              {renderSyllables(row.syllables)}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default Gutter;
