import type { TrackScore } from '../songScore';

interface IdentityStripProps {
  score: TrackScore;
  model?: string;
  modelVersion?: string;
}

export function IdentityStrip({ score, model, modelVersion }: IdentityStripProps) {
  const dominant = score.schoolShares[0];
  const pct = dominant ? `${dominant.pct.toFixed(dominant.pct % 1 === 0 ? 0 : 1)}%` : '—';

  return (
    <dl className="bcv-identity">
      <div className="bcv-identity__row">
        <dt>BPM</dt>
        <dd>{score.bpm}</dd>
      </div>
      <div className="bcv-identity__row">
        <dt>Sync</dt>
        <dd>{score.syncMode === 'aligned' ? 'aligned' : 'estimated'}</dd>
      </div>
      <div className="bcv-identity__row">
        <dt>School</dt>
        <dd>
          <span className="bcv-identity__school">{score.dominantSchool}</span>
          <span className="bcv-identity__pct">{pct}</span>
        </dd>
      </div>
      {(model || modelVersion) && (
        <div className="bcv-identity__row">
          <dt>Model</dt>
          <dd>{[model, modelVersion].filter(Boolean).join(' · ')}</dd>
        </div>
      )}
    </dl>
  );
}
