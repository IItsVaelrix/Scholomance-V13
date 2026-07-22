import { memo } from 'react';

const GLYPHS = ['ᛖ', 'ᚱ', 'ᚦ', 'ᚠ'];

const OracleTerminalChrome = memo(function OracleTerminalChrome({
  schoolId = 'VOID',
  isLoading = false,
  linkStrength = 0.72,
  reducedMotion = false,
}) {
  const safeStrength = Math.max(0, Math.min(1, Number(linkStrength) || 0));

  return (
    <div
      className="oracle-terminal-chrome"
      aria-hidden="true"
      data-school={schoolId}
      data-loading={isLoading ? 'true' : 'false'}
      data-motion={reducedMotion ? 'reduced' : 'full'}
    >
      <div className="oracle-aetherlink-grid">
        <div className="oracle-link-beacon" />
        <div className="oracle-link-meter">
          <span style={{ transform: `scaleX(${safeStrength})` }} />
        </div>

        <div className="oracle-glyph-chambers">
          {GLYPHS.map((glyph, index) => (
            <span
              key={glyph}
              className="oracle-glyph-chamber"
              style={{ '--glyph-index': index }}
            >
              {glyph}
            </span>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="oracle-loading-runes">
          <span>ᚠ</span>
          <span>ᚱ</span>
          <span>ᚦ</span>
        </div>
      )}
    </div>
  );
});

export default OracleTerminalChrome;
