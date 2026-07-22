import { useState } from 'react';
import './ConstellationPage.css';
import ConstellationBackdrop from './ConstellationBackdrop.jsx';
import ConstellationSearch from './ConstellationSearch.jsx';
import ConstellationResultShell from './ConstellationResultShell.jsx';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { useConstellationPage } from '../../hooks/useConstellationPage.js';

export default function ConstellationPage() {
  const reducedMotion = usePrefersReducedMotion();
  const [submittedQuery, setSubmittedQuery] = useState(null);
  const { packet } = useConstellationPage(submittedQuery);
  const mode = submittedQuery != null ? 'submitted' : 'idle';

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
      <ConstellationBackdrop reducedMotion={reducedMotion} />
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
        {packet != null ? <ConstellationResultShell packet={packet} /> : null}
      </div>
    </div>
  );
}
