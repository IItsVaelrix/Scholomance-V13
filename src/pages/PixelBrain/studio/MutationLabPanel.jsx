import { useMemo, useRef, useState } from 'react';

import {
  acceptStudioMutation,
  getStudioAmpManifest,
  proposeStudioMutationExecution,
  rejectStudioMutation,
} from '../../../lib/pixelbrain.adapter.js';

function parseArguments(text) {
  if (!text.trim()) return undefined;
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error('Invocation arguments must be a JSON array.');
  return value;
}

export function MutationLabPanel({ snapshot, onAccept = () => {}, onReceipt = () => {} }) {
  const mutations = useMemo(
    () => getStudioAmpManifest().filter((record) => record.kind === 'mutation'),
    [],
  );
  const [ampId, setAmpId] = useState(mutations[0]?.ampId || '');
  const [argumentText, setArgumentText] = useState('');
  const [proposal, setProposal] = useState(null);
  const [status, setStatus] = useState('Immutable baseline is locked. Generate a candidate to compare.');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const jobControllerRef = useRef(null);

  const preview = async () => {
    const controller = new AbortController();
    jobControllerRef.current?.abort();
    jobControllerRef.current = controller;
    setBusy(true);
    setProgress(0);
    setProposal(null);
    setStatus(`Running ${ampId} against an isolated baseline…`);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const args = parseArguments(argumentText);
      const next = await proposeStudioMutationExecution({
        ampId,
        snapshot,
        options: {
          ...(args ? { arguments: args } : {}),
          signal: controller.signal,
          onProgress: ({ percent }) => setProgress(percent),
        },
      });
      setProposal(next);
      onReceipt(next.receipt);
      setStatus(`Candidate ready · ${next.diff.changedBytes ?? 'structural'} changed bytes`);
    } catch (error) {
      setStatus(`PB-STUDIO-MUTATION-FAULT · ${error.message}`);
    } finally {
      if (jobControllerRef.current === controller) jobControllerRef.current = null;
      setBusy(false);
    }
  };

  const accept = () => {
    if (!proposal) return;
    const accepted = acceptStudioMutation({ current: snapshot, transaction: proposal.transaction });
    onAccept({ accepted, receipt: proposal.receipt, diff: proposal.diff });
    setProposal(null);
    setStatus(`Accepted ${ampId} as a new document revision.`);
  };

  const reject = () => {
    if (!proposal) return;
    rejectStudioMutation({ current: snapshot, transaction: proposal.transaction });
    setProposal(null);
    setStatus(`Rejected ${ampId}; baseline checksum is unchanged.`);
  };

  return (
    <section className="pb-studio-home pb-mutation-lab" aria-labelledby="pb-mutation-title">
      <header className="pb-studio-home-header">
        <div>
          <p className="pb-studio-kicker">Isolated branch vehicle</p>
          <h2 id="pb-mutation-title">Mutation Lab</h2>
        </div>
        <div className="pb-studio-count">{mutations.length} mutation AMPs</div>
      </header>

      <div className="pb-studio-home-grid">
        <div className="pb-studio-card">
          <div className="pb-baseline-lock">
            <span aria-hidden="true">◇</span>
            <div><strong>Immutable baseline</strong><code>{snapshot?.checksum || 'asset:empty'}</code></div>
          </div>
          <label className="pb-studio-field" htmlFor="pb-mutation-amp">
            <span>Mutation AMP</span>
            <select id="pb-mutation-amp" aria-label="Mutation AMP" value={ampId} onChange={(event) => { setAmpId(event.target.value); setProposal(null); }}>
              {mutations.map((record) => <option key={record.ampId} value={record.ampId}>{record.ampId}</option>)}
            </select>
          </label>
          <label className="pb-studio-field" htmlFor="pb-mutation-arguments">
            <span>Invocation arguments · optional JSON array</span>
            <textarea
              id="pb-mutation-arguments"
              value={argumentText}
              onChange={(event) => setArgumentText(event.target.value)}
              placeholder={'Example for pixel-scale: [[255,0,0,255],1,1]'}
              spellCheck="false"
            />
          </label>
          <button type="button" className="pb-action-btn primary" disabled={busy || !ampId} onClick={preview}>Generate isolated candidate</button>
          {busy && <><button type="button" className="pb-action-btn danger" onClick={() => { jobControllerRef.current?.abort(); setStatus('Cancelling mutation job…'); }}>Cancel job</button><progress aria-label="Mutation job progress" max="100" value={progress} /></>}
        </div>

        <aside className="pb-studio-card pb-diff-card">
          <h3>Candidate diff</h3>
          {proposal ? (
            <dl className="pb-receipt">
              <div><dt>Changed</dt><dd>{proposal.diff.changed ? 'YES' : 'NO'}</dd></div>
              <div><dt>Changed bytes</dt><dd>{proposal.diff.changedBytes ?? 'structural'}</dd></div>
              <div><dt>Before</dt><dd>{proposal.diff.beforeChecksum}</dd></div>
              <div><dt>After</dt><dd>{proposal.diff.afterChecksum}</dd></div>
            </dl>
          ) : <p className="pb-studio-empty">No candidate exists. The working asset has not changed.</p>}
          <div className="pb-studio-actions">
            <button type="button" className="pb-action-btn" disabled={!proposal} onClick={reject}>Reject candidate</button>
            <button type="button" className="pb-action-btn primary" disabled={!proposal} onClick={accept}>Accept candidate</button>
          </div>
          <p className="pb-studio-status" role="status" aria-live="polite">{status}</p>
        </aside>
      </div>
    </section>
  );
}
