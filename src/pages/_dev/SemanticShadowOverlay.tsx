/**
 * SEMANTIC CALCULUS — shadow capture overlay (PDR §14 Shadow stage, DEV ONLY).
 *
 * "Shadow: compile+seal+deposit in logs without executing Do. Build the gold
 *  corpus from these real intents."
 *
 * NOTHING HERE EXECUTES. It shows what the compiler WOULD have decided, and
 * captures the intent with the route/selection state it was uttered in.
 *
 * Why an overlay on the real pages instead of a lab harness: the synthetic Phase
 * 0.5 corpus scored kappa 0.159 largely because it captured naked strings. "open
 * it" is unlabelable without knowing what "it" was. Sitting on a real album with a
 * real track selected is the entire point — a harness page would reproduce the
 * exact mistake, because it would have no state either.
 *
 * It reads state from the URL only (useLocation/useParams/useSearchParams), so it
 * touches no page component and cannot break one.
 *
 * The kind comes from codex/core/semantic-calculus/kind.ts — the REAL decision
 * path, not a frontend reimplementation. Vite transpiles the .ts; kind.ts is
 * crypto-free precisely so this is possible (seal.ts is node-only). No COLOR_DRAGON
 * fallback: if the compiler cannot decide, this shows that it could not.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import {
  emptyContext,
  selectKind,
  userUtterance,
} from '../../lib/semantic-calculus/semanticShadow.adapter.ts';
import './SemanticShadowOverlay.css';

type Kind = 'Do' | 'Clarify' | 'Probe' | 'Theory' | 'Hypothesis';

const KIND_HINT: Record<Kind, string> = {
  Do: 'bound + grounded + mutating',
  Clarify: 'bound, a required slot is missing',
  Probe: 'bound + read-only',
  Theory: 'nothing bound — deposits to the theory bank',
  Hypothesis: 'unbound + you supplied a candidate binding',
};

export default function SemanticShadowOverlay() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const [utterance, setUtterance] = useState('');
  const [captured, setCaptured] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  /** Phenotype-first: pressing ✗ records an observed phenotype with no ideal —
   *  a complaint, not a measurement. Phenotypic error = ideal minus observed, so
   *  the ideal has to be captured at the moment you know it. */
  const [correcting, setCorrecting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /** Real state, straight off the URL. This is what the synthetic corpus lacked. */
  const state = useMemo(
    () => ({
      route: location.pathname,
      selection: searchParams.get('track') ?? searchParams.get('word') ?? null,
      panel: searchParams.get('panel') ?? null,
    }),
    [location.pathname, searchParams],
  );

  // Ctrl+; toggles. Chosen because nothing in the app binds it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === ';') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    fetch('/api/semantic-calculus/shadow')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCaptured(d.count))
      .catch(() => {
        /* route is flag-gated off; the overlay stays usable as a live preview */
      });
  }, []);

  /** The REAL decision path. Same function the sealed compiler calls. */
  const decision = useMemo(() => {
    if (!utterance.trim()) return null;
    try {
      // The utterance is USER-trusted; the URL-derived state is user context too.
      // Nothing here is `untrusted` — that partition is for retrieved content, and
      // an empty partition is honest about that (F13).
      const context = { ...emptyContext(), user: { ...state } };
      // F21 — a human is typing into this box. That is the one thing that earns
      // 'user'. When an agent drives this surface it must say derived instead,
      // and the harness — not the agent — supplies the taint.
      return selectKind(userUtterance(utterance), context);
    } catch (err) {
      return { error: (err as Error).message } as const;
    }
  }, [utterance, state]);

  const capture = async (verdict?: 'correct' | 'wrong' | 'unsure', expectedKind?: Kind) => {
    if (!utterance.trim() || !decision || 'error' in decision) return;
    try {
      const res = await fetch('/api/semantic-calculus/shadow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          utterance,
          state,
          clientKind: decision.kind,
          clientLaw: decision.law.decision,
          // P6 — without these the corpus can only ever answer kappa_kind, and a
          // system that classifies well while justifying badly stays invisible.
          clientEpistemic: decision.epistemic,
          clientPhase: decision.phase,
          // F21 — the corpus must record WHO spoke, or it cannot tell a human
          // request from an agent proposal when it is replayed.
          utteranceTrust: decision.utteranceProvenance.trust,
          utteranceTaint: decision.utteranceProvenance.taint,
          verdict,
          expectedKind,
          question: (decision as any).question?.text ?? undefined,
          unresolved: (decision as any).unresolved ?? undefined,
        }),
      });
      if (!res.ok) throw new Error(`capture failed: ${res.status}`);
      const d = await res.json();
      setCaptured((c) => c + 1);
      setFlash(expectedKind ? `logged: should be ${expectedKind}` : 'captured');
      setUtterance('');
      setCorrecting(false);
      setTimeout(() => setFlash(null), 1200);
      return d;
    } catch (err) {
      setFlash(`FAILED: ${(err as Error).message}`);
      setTimeout(() => setFlash(null), 2500);
    }
  };

  if (!open) {
    return (
      <button className="scso-tab" onClick={() => setOpen(true)} title="Semantic Calculus shadow capture — click, or Ctrl + semicolon">
        ◈ shadow · {captured}
      </button>
    );
  }

  const kind = decision && !('error' in decision) ? (decision.kind as Kind) : null;

  return (
    <div className="scso" role="dialog" aria-label="Semantic Calculus shadow capture">
      <div className="scso-head">
        <span className="scso-title">semantic calculus · shadow</span>
        <span className="scso-badge">executes nothing</span>
        <button className="scso-x" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </div>

      <div className="scso-state">
        <code>{state.route}</code>
        {state.selection && <code className="scso-sel">track={state.selection}</code>}
        {state.panel && <code className="scso-sel">panel={state.panel}</code>}
      </div>

      <input
        ref={inputRef}
        className="scso-input"
        value={utterance}
        placeholder="say what you want here…  e.g. open it"
        onChange={(e) => setUtterance(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) capture(undefined);
        }}
      />

      {decision && 'error' in decision && <div className="scso-err">compiler threw: {decision.error}</div>}

      {kind && (
        <div className="scso-out">
          <div className={`scso-kind scso-kind--${kind.toLowerCase()}`}>
            {kind}
            <span className="scso-hint">{KIND_HINT[kind]}</span>
          </div>
          <div className="scso-row">
            <span className="scso-k">law</span>
            <code className={`scso-law scso-law--${(decision as any).law.decision}`}>
              {(decision as any).law.decision}
            </code>
            <span className="scso-rule">{(decision as any).law.ruleIds.join(', ')}</span>
          </div>
          <div className="scso-row">
            <span className="scso-k">bound</span>
            <code>{(decision as any).bound ? (decision as any).formulaId : '— nothing bound'}</code>
          </div>
          {/* The epistemic axis is orthogonal to kind and law: what is MISSING. */}
          <div className="scso-row">
            <span className="scso-k">gap</span>
            <code className={`scso-gap scso-gap--${(decision as any).epistemic.gap}`}>
              {(decision as any).epistemic.gap}
            </code>
            <span className="scso-rule">
              method={(decision as any).epistemic.method}
              {(decision as any).phase !== 'atomic' ? ` · phase=${(decision as any).phase}` : ''}
            </span>
          </div>
          <div className="scso-row">
            <span className="scso-k">warrant</span>
            <code>
              {(decision as any).epistemic.warrantPresent.join(', ') || '— none'}
            </code>
            <span className="scso-rule">
              needs {(decision as any).epistemic.warrantRequired.join(', ')}
            </span>
          </div>
          {(decision as any).question && (
            <div className="scso-why">{(decision as any).question.text}</div>
          )}
          <div className="scso-row">
            <span className="scso-k">would execute</span>
            <code className={(decision as any).kind === 'Do' && (decision as any).law.decision === 'allow' ? 'scso-yes' : 'scso-no'}>
              {(decision as any).kind === 'Do' && (decision as any).law.decision === 'allow' ? 'yes' : 'NO'}
            </code>
          </div>
        </div>
      )}

      {correcting && kind && (
        <div className="scso-ideal">
          <span className="scso-k">should have been</span>
          {(['Do', 'Clarify', 'Probe', 'Theory', 'Hypothesis'] as Kind[])
            .filter((k) => k !== kind)
            .map((k) => (
              <button key={k} className={`scso-ideal-btn scso-kind--${k.toLowerCase()}`}
                onClick={() => capture('wrong', k)}>
                {k}
              </button>
            ))}
          <button className="scso-x" onClick={() => setCorrecting(false)} aria-label="Cancel">×</button>
        </div>
      )}

      <div className="scso-actions">
        <button onClick={() => capture('correct')} disabled={!kind}>✓ right</button>
        <button onClick={() => setCorrecting(true)} disabled={!kind}>✗ wrong…</button>
        <button onClick={() => capture('unsure')} disabled={!kind}>? unsure</button>
        <span className="scso-count">{captured} captured{flash ? ` · ${flash}` : ''}</span>
      </div>

      <p className="scso-foot">
        Mark <b>✗ wrong</b> freely — a disagreement is the finding, not a failure. Every row records
        the route and selection above, which is what the synthetic corpus lacked.
      </p>
    </div>
  );
}
