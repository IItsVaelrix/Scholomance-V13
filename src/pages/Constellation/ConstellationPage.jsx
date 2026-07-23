import { useState } from 'react';
import './ConstellationPage.css';
import ComposeConstellationSky from './ComposeConstellationSky.jsx';
import ConstellationSearch from './ConstellationSearch.jsx';
import ConstellationResultShell from './ConstellationResultShell.jsx';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { useConstellationPage } from '../../hooks/useConstellationPage.js';

export default function ConstellationPage() {
  const reducedMotion = usePrefersReducedMotion();
  const [submittedQuery, setSubmittedQuery] = useState(null);
  const { packet } = useConstellationPage(submittedQuery);
  const mode = submittedQuery != null ? 'submitted' : 'idle';
  // The sky's deterministic animation is seeded by the resolved page bytecode,
  // so each answered query lights its own lodestar (PDR §7.7). Idle → constant.
  const skyBytecode = packet?.pageBytecode ?? null;

  const handleSubmit = (query) => {
    setSubmittedQuery(query);
  };

  return (
    <div
      id="constellation-stage"
      className={[
        'constellation-stage',
        mode === 'submitted' ? 'constellation-stage--submitted' : '',
        !reducedMotion ? 'constellation-stage--animate' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-mode={mode}
    >
      <ComposeConstellationSky reducedMotion={reducedMotion} bytecode={skyBytecode} />
      <div className="constellation-foreground">
        <h1 className="constellation-brand">ConstellationOS</h1>
        {mode === 'idle' ? (
          <p className="constellation-invitation">Ask the sky what language remembers.</p>
        ) : null}
        <ConstellationSearch
          mode={mode}
          onSubmit={handleSubmit}
          defaultValue={submittedQuery ?? ''}
          reducedMotion={reducedMotion}
        />
        {packet != null ? <ConstellationResultShell packet={packet} reducedMotion={reducedMotion} /> : null}
      </div>
    </div>
  );
}
