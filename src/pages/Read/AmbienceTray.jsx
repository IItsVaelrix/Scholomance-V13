import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useAmbienceMixer } from '../../hooks/useAmbienceMixer';

const CHANNEL_META = [
  { id: 'rain', label: 'Rain + Forest Stream' },
];

export default function AmbienceTray({ service }) {
  const { state, setChannelEnabled, setChannelVolume, setMasterVolume, stop } = useAmbienceMixer(service);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        className="ambience-tray__fab"
        aria-label="Open ambient soundscapes"
        title="Ambient soundscapes"
        onClick={() => setCollapsed(false)}
      >
        ♪
      </button>
    );
  }

  return (
    <aside className="ambience-tray" aria-label="Ambient soundscapes">
      <div className="ambience-tray__head">
        <span className="ambience-tray__title">Ambience</span>
        <button
          type="button"
          className="ambience-tray__collapse"
          aria-label="Collapse ambience tray"
          onClick={() => setCollapsed(true)}
        >
          -
        </button>
      </div>

      {CHANNEL_META.map(({ id, label }) => {
        const ch = state.channels[id];
        const isPlaying = state.running && ch.enabled;
        const TransportIcon = isPlaying ? Pause : Play;
        const transportLabel = `${isPlaying ? 'Pause' : 'Play'} ${label}`;
        const handleTransportClick = () => {
          if (isPlaying) {
            void stop();
            return;
          }
          void setChannelEnabled(id, true);
        };

        return (
          <div className="ambience-tray__row" key={id}>
            <button
              type="button"
              className="ambience-tray__transport"
              aria-label={transportLabel}
              aria-pressed={isPlaying}
              title={transportLabel}
              disabled={!ch.available}
              onClick={handleTransportClick}
            >
              <TransportIcon size={16} aria-hidden="true" />
            </button>
            <span className="ambience-tray__label">{label}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={ch.volume}
              disabled={!ch.available}
              aria-label={`${label} volume`}
              onChange={(e) => setChannelVolume(id, Number(e.target.value))}
            />
          </div>
        );
      })}

      <div className="ambience-tray__row ambience-tray__master">
        <span className="ambience-tray__master-label">Master</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={state.master}
          aria-label="Master ambience volume"
          onChange={(e) => setMasterVolume(Number(e.target.value))}
        />
      </div>
    </aside>
  );
}
