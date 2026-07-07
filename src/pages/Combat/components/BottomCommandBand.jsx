import ActionBar from './ActionBar.jsx';
import ActionHintStrip from './ActionHintStrip.jsx';

/**
 * BottomCommandBand.jsx
 *
 * The main interaction spine. Replaces the plain text action console.
 * Stacks ActionBar (tactical command buttons) + ActionHintStrip (context metadata).
 *
 * World-law connection: the bottom band is the ritual command threshold  -
 * the point where the scholar's intent becomes a declared action.
 */
export default function BottomCommandBand({ selectedAction, onActionSelect, isDisabled, movesRemaining, canExtract, variant = 'default' }) {
  return (
    <div className={`bottom-command-band bottom-command-band--${variant}`} role="region" aria-label="Command band">
      <ActionBar
        selectedAction={selectedAction}
        onActionSelect={onActionSelect}
        isDisabled={isDisabled}
        canExtract={canExtract}
        movesRemaining={movesRemaining}
      />
      <ActionHintStrip
        selectedAction={selectedAction}
        movesRemaining={movesRemaining}
      />
    </div>
  );
}
