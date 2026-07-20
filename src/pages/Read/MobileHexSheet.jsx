import MobileBottomSheet from './MobileBottomSheet.jsx';
import { SCHOOLS } from '../../data/schools.js';
import { ANALYSIS_MODES } from '../../lib/truesight/compiler/analysisModes.js';
import { useHaptic } from '../../hooks/useHaptic.ts';

const ANALYSIS_MODE_LIST = [
  { id: ANALYSIS_MODES.NONE,      label: 'None'      },
  { id: ANALYSIS_MODES.ASTROLOGY, label: 'Astrology' },
  { id: ANALYSIS_MODES.RHYME,     label: 'Rhyme'     },
  { id: ANALYSIS_MODES.ANALYZE,   label: 'Leximancy' },
  { id: ANALYSIS_MODES.VOWEL,     label: 'Vowel'     },
];

function Toggle({ label, value, onToggle, haptic }) {
  return (
    <div className="ide-hex-row">
      <span className="ide-hex-row-label">{label}</span>
      <button
        type="button"
        className={`settings-toggle${value ? ' settings-toggle--on' : ''}`}
        aria-pressed={value}
        onClick={() => { haptic('toggle'); onToggle(); }}
      >
        {value ? 'On' : 'Off'}
      </button>
    </div>
  );
}

export default function MobileHexSheet({
  isOpen, onClose,
  isTruesight, onToggleTruesight,
  isLatticeGrid, onToggleLatticeGrid,
  isPredictive, onTogglePredictive,
  mirrored, onToggleMirrored,
  analysisMode, onModeChange,
  selectedSchool, onSchoolChange,
  schoolList,
  hapticEnabled, onToggleHaptic,
}) {
  const { haptic } = useHaptic(hapticEnabled);

  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose}>
      <div className="ide-hex-sheet">
        <section className="ide-hex-section">
          <h3 className="ide-hex-section-title">Optics</h3>
          <Toggle label="Truesight"    value={isTruesight}   onToggle={onToggleTruesight}  haptic={haptic} />
          <Toggle label="WordToolTip" value={isLatticeGrid} onToggle={onToggleLatticeGrid} haptic={haptic} />
          <Toggle label="Symmetrical"  value={mirrored}       onToggle={onToggleMirrored}   haptic={haptic} />
          <Toggle label="Predictive"   value={isPredictive}  onToggle={onTogglePredictive} haptic={haptic} />
        </section>

        <section className="ide-hex-section">
          <h3 className="ide-hex-section-title">Analysis</h3>
          <div className="ide-hex-mode-row">
            {ANALYSIS_MODE_LIST.map(m => (
              <button
                key={m.id}
                type="button"
                className={`ide-hex-mode-btn${analysisMode === m.id ? ' active' : ''}`}
                onClick={() => { haptic('tap'); onModeChange(m.id); }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </section>

        <section className="ide-hex-section">
          <h3 className="ide-hex-section-title">School</h3>
          <div className="ide-hex-school-grid">
            {schoolList.map(school => {
              const meta = SCHOOLS[school.id];
              return (
                <button
                  key={school.id}
                  type="button"
                  className={`ide-hex-school-chip${selectedSchool === school.id ? ' active' : ''}`}
                  style={{ '--chip-color': meta?.color }}
                  onClick={() => { haptic('tap'); onSchoolChange(school.id); }}
                >
                  <span className="ide-hex-school-glyph">{meta?.glyph}</span>
                  <span className="ide-hex-school-name">{meta?.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="ide-hex-section">
          <h3 className="ide-hex-section-title">Feel</h3>
          <Toggle label="Haptic Feedback" value={hapticEnabled} onToggle={onToggleHaptic} haptic={haptic} />
        </section>
      </div>
    </MobileBottomSheet>
  );
}
