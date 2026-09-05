import { useMemo, useRef, useState } from "react";
import { Check, CircleStop, GitCompareArrows, LockKeyhole, X } from "lucide-react";
import {
  acceptStudioMutation,
  getStudioAmpManifest,
  proposeStudioMutationExecution,
  rejectStudioMutation,
} from "@/lib/pixelbrain/studio-facade.js";

type MutationProposal = {
  transaction: Record<string, unknown>;
  receipt: Record<string, unknown>;
  diff: Record<string, unknown>;
};

type MutationLabProps = {
  snapshot: Record<string, unknown>;
  onAccept: (accepted: Record<string, unknown>, receipt: Record<string, unknown>) => void;
  onReceipt: (receipt: Record<string, unknown>) => void;
  onFault: (message: string) => void;
  onReject: (message: string) => void;
};

function parseArguments(text: string): unknown[] | undefined {
  if (!text.trim()) return undefined;
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("Invocation arguments must be a JSON array.");
  return value;
}

export function MutationLab({
  snapshot,
  onAccept,
  onReceipt,
  onFault,
  onReject,
}: MutationLabProps) {
  const mutations = useMemo(
    () =>
      (getStudioAmpManifest() as unknown as ReadonlyArray<{ ampId: string; kind: string }>).filter(
        ({ kind }) => kind === "mutation",
      ),
    [],
  );
  const [ampId, setAmpId] = useState(mutations[0]?.ampId ?? "");
  const [argumentText, setArgumentText] = useState("");
  const [proposal, setProposal] = useState<MutationProposal | null>(null);
  const [status, setStatus] = useState(
    "Immutable baseline is locked. Generate a candidate to compare.",
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const jobControllerRef = useRef<AbortController | null>(null);

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
      const next = (await proposeStudioMutationExecution({
        ampId,
        snapshot,
        options: {
          ...(args ? { arguments: args } : {}),
          signal: controller.signal,
          onProgress: ({ percent }: { percent: number }) => setProgress(percent),
        },
      })) as MutationProposal;
      setProposal(next);
      onReceipt(next.receipt);
      setStatus(
        `Candidate ready · ${String(next.diff.changedBytes ?? "structural")} changed bytes`,
      );
    } catch (error) {
      const message = `PB-STUDIO-MUTATION-FAULT · ${(error as Error).message}`;
      setStatus(message);
      onFault(message);
    } finally {
      if (jobControllerRef.current === controller) jobControllerRef.current = null;
      setBusy(false);
    }
  };

  const accept = () => {
    if (!proposal) return;
    const accepted = acceptStudioMutation({ current: snapshot, transaction: proposal.transaction });
    onAccept(accepted, proposal.receipt);
    setProposal(null);
    setStatus(`Accepted ${ampId} as a new document revision.`);
  };

  const reject = () => {
    if (!proposal) return;
    rejectStudioMutation({ current: snapshot, transaction: proposal.transaction });
    setProposal(null);
    const message = `Rejected ${ampId}; baseline checksum is unchanged.`;
    setStatus(message);
    onReject(message);
  };

  return (
    <section className="pbs-panel" aria-labelledby="pbs-mutations-title">
      <header className="pbs-section-header">
        <div>
          <p>ISOLATED BRANCH VEHICLE</p>
          <h2 id="pbs-mutations-title">Mutation Lab</h2>
        </div>
        <code>{mutations.length} mutation AMPs</code>
      </header>
      <div className="pbs-mutation-grid">
        <div className="pbs-plane pbs-mutation-controls">
          <div className="pbs-baseline">
            <LockKeyhole size={19} aria-hidden="true" />
            <div>
              <strong>Immutable baseline</strong>
              <code className="pbs-checksum">{String(snapshot.checksum)}</code>
            </div>
          </div>
          <label className="pbs-field">
            <span>Mutation AMP</span>
            <select
              aria-label="Mutation AMP"
              value={ampId}
              onChange={(event) => {
                setAmpId(event.target.value);
                setProposal(null);
              }}
            >
              {mutations.map((record) => (
                <option key={record.ampId} value={record.ampId}>
                  {record.ampId}
                </option>
              ))}
            </select>
          </label>
          <label className="pbs-field">
            <span>Invocation arguments · optional JSON array</span>
            <textarea
              value={argumentText}
              onChange={(event) => setArgumentText(event.target.value)}
              placeholder={"Example for pixel-scale: [[255,0,0,255],1,1]"}
              spellCheck={false}
            />
          </label>
          <button
            className="pbs-button is-primary"
            type="button"
            disabled={busy || !ampId}
            onClick={preview}
          >
            <GitCompareArrows size={16} />
            Generate isolated candidate
          </button>
          {busy && (
            <>
              <button
                className="pbs-button is-danger"
                type="button"
                onClick={() => {
                  jobControllerRef.current?.abort();
                  setStatus("Cancelling mutation job…");
                }}
              >
                <CircleStop size={15} />
                Cancel job
              </button>
              <progress aria-label="Mutation job progress" max="100" value={progress} />
            </>
          )}
        </div>
        <aside className="pbs-plane pbs-diff">
          <h3>Candidate diff</h3>
          {proposal ? (
            <dl className="pbs-receipt">
              <div>
                <dt>Changed</dt>
                <dd>{proposal.diff.changed ? "YES" : "NO"}</dd>
              </div>
              <div>
                <dt>Changed bytes</dt>
                <dd>{String(proposal.diff.changedBytes ?? "structural")}</dd>
              </div>
              <div>
                <dt>Before</dt>
                <dd>{String(proposal.diff.beforeChecksum)}</dd>
              </div>
              <div>
                <dt>After</dt>
                <dd>{String(proposal.diff.afterChecksum)}</dd>
              </div>
            </dl>
          ) : (
            <p className="pbs-empty">No candidate exists. The working asset has not changed.</p>
          )}
          <div className="pbs-actions">
            <button className="pbs-button" type="button" disabled={!proposal} onClick={reject}>
              <X size={15} />
              Reject candidate
            </button>
            <button
              className="pbs-button is-primary"
              type="button"
              disabled={!proposal}
              onClick={accept}
            >
              <Check size={15} />
              Accept candidate
            </button>
          </div>
          <p className="pbs-status" role="status" aria-live="polite">
            {status}
          </p>
        </aside>
      </div>
    </section>
  );
}
