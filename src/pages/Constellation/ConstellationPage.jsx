import { useState } from 'react';
import './ConstellationPage.css';
import ComposeConstellationSky from './ComposeConstellationSky.jsx';
import ConstellationSearch from './ConstellationSearch.jsx';
import ConstellationExperience from './ConstellationExperience.jsx';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { useConstellationPage } from '../../hooks/useConstellationPage.js';

export default function ConstellationPage() {
  const reducedMotion = usePrefersReducedMotion();
  /**
   * A submission is a query AND an attempt number. Holding the query alone made
   * re-asking the same question impossible: `setSubmittedQuery('gravity')` when
   * the state is already `'gravity'` is a React bail-out, so the fetch effect
   * never re-ran and Enter did nothing. That is only invisible while the backend
   * is up — the moment it fails, the reader is handed the offline fixture with
   * no way back, because the only retry affordance on this page is submitting
   * the same words again.
   */
  const [submission, setSubmission] = useState({ query: null, attempt: 0 });
  const { status, packet } = useConstellationPage(submission.query, submission.attempt);
  const mode = submission.query != null ? 'submitted' : 'idle';
  // The sky's deterministic animation is seeded by the resolved page bytecode,
  // so each answered query lights its own lodestar (PDR §7.7). Idle → constant.
  const skyBytecode = packet?.pageBytecode ?? null;

  const handleSubmit = (query) => {
    setSubmission((previous) => ({ query, attempt: previous.attempt + 1 }));
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
      data-status={status}
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
          defaultValue={submission.query ?? ''}
          reducedMotion={reducedMotion}
        />
        {status === 'loading' && packet == null ? (
          <div className="constellation-charting" role="status" aria-live="polite">
            <span className="constellation-charting__glyph" aria-hidden="true">✦</span>
            <span>Charting the literary sky…</span>
          </div>
        ) : null}
        {packet != null ? <ConstellationExperience packet={packet} reducedMotion={reducedMotion} /> : null}
      </div>
    </div>
  );
}
