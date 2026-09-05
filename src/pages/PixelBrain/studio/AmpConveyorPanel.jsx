import { useMemo, useRef, useState } from 'react';

import {
  commitStudioAmpExecution,
  getStudioAmpManifest,
  inspectStudioSupportExecution,
  planStudioAmps,
  previewStudioAmpExecution,
} from '../../../lib/pixelbrain.adapter.js';
import { ExtensionSelector } from '../components/ExtensionSelector.jsx';

function parseArguments(text) {
  if (!text.trim()) return undefined;
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error('Invocation arguments must be a JSON array.');
  return value;
}

export function AmpConveyorPanel({ snapshot, onCommit = () => {}, onReceipt = () => {} }) {
  const manifest = useMemo(() => getStudioAmpManifest(), []);
  const executable = useMemo(
    () => manifest.filter((record) => record.kind === 'runnable' || record.kind === 'runtime-gated'),
    [manifest],
  );
  const supports = useMemo(() => manifest.filter((record) => record.kind === 'support'), [manifest]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [focusedId, setFocusedId] = useState(null);
  const [argumentText, setArgumentText] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState('Select an AMP to inspect its deterministic plan.');
  const [busy, setBusy] = useState(false);
  const [supportEvidence, setSupportEvidence] = useState(null);
  const [extensions, setExtensions] = useState([]);
  const [progress, setProgress] = useState(0);
  const jobControllerRef = useRef(null);

  const planState = useMemo(() => {
    try {
      return { plan: planStudioAmps({ snapshotChecksum: snapshot?.checksum || 'asset:empty', selectedIds }), error: null };
    } catch (error) {
      return { plan: null, error };
    }
  }, [selectedIds, snapshot?.checksum]);

  const toggle = (ampId) => {
    setFocusedId(ampId);
    setSelectedIds((current) => current.includes(ampId)
      ? current.filter((id) => id !== ampId)
      : [...current, ampId]);
    setResult(null);
  };

  const run = async (mode) => {
    if (!focusedId || !selectedIds.includes(focusedId) || !planState.plan) return;
    const controller = new AbortController();
    jobControllerRef.current?.abort();
    jobControllerRef.current = controller;
    setBusy(true);
    setProgress(0);
    setStatus(`${mode === 'preview' ? 'Previewing' : 'Committing'} ${focusedId}…`);
    try {
      // Yield once so the queued state and Cancel control paint before a
      // synchronous, in-budget adapter begins.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const args = parseArguments(argumentText);
      const input = {
        ampId: focusedId,
        snapshot,
        options: {
          ...(args ? { arguments: args } : {}),
          planChecksum: planState.plan.planChecksum,
          signal: controller.signal,
          onProgress: ({ percent }) => setProgress(percent),
        },
      };
      const next = mode === 'preview'
        ? await previewStudioAmpExecution(input)
        : await commitStudioAmpExecution(input);
      setResult(next);
      onReceipt(next.receipt);
      setStatus(`${mode === 'preview' ? 'Preview ready' : 'Commit complete'} · ${focusedId}`);
      if (mode === 'commit') onCommit(next);
    } catch (error) {
      setResult(null);
      setStatus(`PB-STUDIO-EXECUTION-FAULT · ${error.message}`);
    } finally {
      if (jobControllerRef.current === controller) jobControllerRef.current = null;
      setBusy(false);
    }
  };

  const cancel = () => {
    jobControllerRef.current?.abort();
    setStatus('Cancelling Studio job…');
  };

  return (
    <section className="pb-studio-home pb-amp-conveyor" aria-labelledby="pb-amp-conveyor-title">
      <header className="pb-studio-home-header">
        <div>
          <p className="pb-studio-kicker">Deterministic execution bench</p>
          <h2 id="pb-amp-conveyor-title">AMP Conveyor</h2>
        </div>
        <div className="pb-studio-count">{executable.length} executable · {supports.length} support</div>
      </header>

      <div className="pb-studio-home-grid">
        <div className="pb-studio-card pb-amp-list" aria-label="Studio AMP manifest">
          {executable.map((record) => (
            <label key={record.ampId} htmlFor={`pb-amp-${record.ampId}`} className={`pb-amp-row${focusedId === record.ampId ? ' is-focused' : ''}`}>
              <input
                id={`pb-amp-${record.ampId}`}
                type="checkbox"
                checked={selectedIds.includes(record.ampId)}
                onChange={() => toggle(record.ampId)}
                aria-label={record.ampId}
              />
              <span className="pb-amp-row-copy">
                <strong>{record.ampId}</strong>
                <small>{record.summary}</small>
              </span>
              <span className={`pb-kind-tag pb-kind-${record.kind}`}>{record.kind}</span>
            </label>
          ))}
        </div>

        <aside className="pb-studio-card pb-amp-plan">
          <h3>Plan receipt</h3>
          {planState.error ? (
            <div className="pb-studio-fault" role="alert">{planState.error.message}</div>
          ) : (
            <>
              <div className="pb-plan-totals">
                <strong>{planState.plan.steps.length} activated</strong>
                <span>{planState.plan.skipped.length} skipped</span>
              </div>
              <code className="pb-studio-checksum">{planState.plan.planChecksum}</code>
              <ol className="pb-plan-steps">
                {planState.plan.steps.map((step) => (
                  <li key={step.ampId}><span>{String(step.order).padStart(2, '0')}</span>{step.ampId}</li>
                ))}
              </ol>
            </>
          )}

          <label className="pb-studio-field" htmlFor="pb-amp-arguments">
            <span>Invocation arguments · optional JSON array</span>
            <textarea
              id="pb-amp-arguments"
              value={argumentText}
              onChange={(event) => setArgumentText(event.target.value)}
              placeholder={'Example: [{"width":32,"height":32,"seed":23063}]'}
              spellCheck="false"
            />
          </label>
          <div className="pb-studio-actions">
            <button type="button" className="pb-action-btn" disabled={busy || !focusedId || !planState.plan} onClick={() => run('preview')}>
              Preview selected AMP
            </button>
            <button type="button" className="pb-action-btn primary" disabled={busy || !focusedId || !planState.plan} onClick={() => run('commit')}>
              Commit selected AMP
            </button>
            {busy && <button type="button" className="pb-action-btn danger" onClick={cancel}>Cancel job</button>}
          </div>
          {busy && <progress aria-label="AMP job progress" max="100" value={progress} />}
          <p className="pb-studio-status" role="status" aria-live="polite">{status}</p>
          {result?.receipt && (
            <dl className="pb-receipt">
              <div><dt>Mode</dt><dd>{result.receipt.mode}</dd></div>
              <div><dt>Output</dt><dd>{result.receipt.outputChecksum}</dd></div>
              <div><dt>Base</dt><dd>{result.receipt.baseChecksum}</dd></div>
            </dl>
          )}
        </aside>
      </div>

      <details className="pb-support-substrates">
        <summary>Support substrates · {supports.length} tested consumers</summary>
        {supports.map((record) => (
          <p key={record.ampId}>
            <button type="button" onClick={async () => setSupportEvidence(await inspectStudioSupportExecution(record.ampId))}>Inspect</button>
            {' '}<strong>{record.ampId}</strong> → {record.consumerIds.join(', ')}
          </p>
        ))}
        {supportEvidence && <code className="pb-studio-checksum">{supportEvidence.ampId} · {supportEvidence.outputChecksum}</code>}
      </details>

      <div className="pb-studio-card pb-conveyor-extensions">
        <h3>Legacy extension selection</h3>
        <ExtensionSelector selectedExtensions={extensions} onChange={setExtensions} />
      </div>
    </section>
  );
}
