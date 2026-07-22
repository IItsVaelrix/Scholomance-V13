import { useState } from 'react';
import './ConstellationPage.css';
import ConstellationBackdrop from './ConstellationBackdrop.jsx';
import ConstellationSearch from './ConstellationSearch.jsx';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';

export default function ConstellationPage() {
  const reducedMotion = usePrefersReducedMotion();
  const [submittedQuery, setSubmittedQuery] = useState(null);
  const mode = submittedQuery != null ? 'submitted' : 'idle';

  const handleSubmit = (query) => {
    setSubmittedQuery(query);
  };

  return (
    <div
      id="constellation-stage"
      className={`constellation-stage${mode === 'submitted' ? ' constellation-stage--submitted' : ''}`}
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
        {submittedQuery != null ? (
          <div id="constellation-result-shell">
            <h2>Phrase Identity</h2>
          </div>
        ) : null}
      </div>
    </div>
  );
}
