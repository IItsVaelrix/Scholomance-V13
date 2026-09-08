import { useEffect, useMemo, useRef, useState } from "react";
import { CircleStop, Play, Save, Search } from "lucide-react";
import {
  commitStudioAmpExecution,
  getStudioAmpManifest,
  inspectStudioSupportExecution,
  planStudioAmps,
  previewStudioAmpExecution,
} from "@/lib/pixelbrain/studio-facade.js";
import { ExtensionSelector } from "../ExtensionSelector";

type AmpRecord = {
  ampId: string;
  adapterId: string;
  kind: string;
  order: number;
  summary: string;
  consumerIds: string[];
};

type AmpConveyorProps = {
  snapshot: Record<string, unknown>;
  onCommit: (result: { output: unknown; receipt: Record<string, unknown> }) => void;
  onReceipt: (receipt: Record<string, unknown>) => void;
  onFault: (message: string) => void;
};

function parseArguments(text: string): unknown[] | undefined {
  if (!text.trim()) return undefined;
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("Invocation arguments must be a JSON array.");
  return value;
}

export function AmpConveyor({ snapshot, onCommit, onReceipt, onFault }: AmpConveyorProps) {
  const manifest = useMemo(() => getStudioAmpManifest() as unknown as ReadonlyArray<AmpRecord>, []);
  const executable = useMemo(
    () => manifest.filter(({ kind }) => kind === "runnable" || kind === "runtime-gated"),
    [manifest],
  );
  const supports = useMemo(() => manifest.filter(({ kind }) => kind === "support"), [manifest]);

  const detectedIds = useMemo(() => {
    const raw = ((snapshot.activeAmpIds as string[]) ||
      ((snapshot.detectedAmps as Array<{ manifestId?: string; ampId: string }>) || []).map(
        (a) => a.manifestId || a.ampId,
      ) ||
      []) as string[];
    const manifestSet = new Set(manifest.map((m) => m.ampId));
    return raw.filter((id) => manifestSet.has(id));
  }, [snapshot.activeAmpIds, snapshot.detectedAmps, manifest]);

  const [selectedIds, setSelectedIds] = useState<string[]>(() => (detectedIds.length > 0 ? detectedIds : []));
  const [focusedId, setFocusedId] = useState<string | null>(() => (detectedIds.length > 0 ? detectedIds[0] : null));
  const [argumentText, setArgumentText] = useState("");
  const [result, setResult] = useState<{
    output: unknown;
    receipt: Record<string, unknown>;
  } | null>(null);
  const [status, setStatus] = useState(
    detectedIds.length > 0
      ? `Pre-selected ${detectedIds.length} AMPs detected from source code.`
      : "Select an AMP to inspect its deterministic plan.",
  );

  useEffect(() => {
    if (detectedIds.length > 0 && selectedIds.length === 0) {
      setSelectedIds(detectedIds);
      if (!focusedId) setFocusedId(detectedIds[0]);
      setStatus(
        `Pre-selected ${detectedIds.length} AMPs detected from source code (${(snapshot.pipeline as string) || "pipeline"}).`,
      );
    }
  }, [detectedIds, snapshot.pipeline]);
  const [busy, setBusy] = useState(false);
  const [supportEvidence, setSupportEvidence] = useState<Record<string, unknown> | null>(null);
  const [extensions, setExtensions] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const jobControllerRef = useRef<AbortController | null>(null);

  const planState = useMemo(() => {
    try {
      return {
        plan: planStudioAmps({ snapshotChecksum: snapshot.checksum, selectedIds }),
        error: null,
      };
    } catch (error) {
      return { plan: null, error: error as Error };
    }
  }, [selectedIds, snapshot.checksum]);

  const toggle = (ampId: string) => {
    setFocusedId(ampId);
    setSelectedIds((current) =>
      current.includes(ampId) ? current.filter((id) => id !== ampId) : [...current, ampId],
    );
    setResult(null);
  };

  const run = async (mode: "preview" | "commit") => {
    if (!focusedId || !selectedIds.includes(focusedId) || !planState.plan) return;
    const controller = new AbortController();
    jobControllerRef.current?.abort();
    jobControllerRef.current = controller;
    setBusy(true);
    setProgress(0);
    setStatus(`${mode === "preview" ? "Previewing" : "Committing"} ${focusedId}…`);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const args = parseArguments(argumentText);
      const input = {
        ampId: focusedId,
        snapshot,
        options: {
          ...(args ? { arguments: args } : {}),
          planChecksum: planState.plan.planChecksum,
          signal: controller.signal,
          onProgress: ({ percent }: { percent: number }) => setProgress(percent),
        },
      };
      const next = (
        mode === "preview"
          ? await previewStudioAmpExecution(input)
          : await commitStudioAmpExecution(input)
      ) as { output: unknown; receipt: Record<string, unknown> };
      setResult(next);
      onReceipt(next.receipt);
      setStatus(`${mode === "preview" ? "Preview ready" : "Commit complete"} · ${focusedId}`);
      if (mode === "commit") onCommit(next);
    } catch (error) {
      const message = `PB-STUDIO-EXECUTION-FAULT · ${(error as Error).message}`;
      setResult(null);
      setStatus(message);
      onFault(message);
    } finally {
      if (jobControllerRef.current === controller) jobControllerRef.current = null;
      setBusy(false);
    }
  };

  const commitAllSteps = async () => {
    if (!planState.plan || !planState.plan.steps.length) return;
    const controller = new AbortController();
    jobControllerRef.current?.abort();
    jobControllerRef.current = controller;
    setBusy(true);
    setProgress(0);
    const steps = planState.plan.steps;
    setStatus(`Executing and committing all ${steps.length} conveyor steps…`);
    try {
      let committedCount = 0;
      let currentSnapshot = snapshot;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        setStatus(`[${i + 1}/${steps.length}] Committing ${step.ampId}…`);
        setProgress(Math.round((i / steps.length) * 100));

        const args = parseArguments(argumentText);
        const input = {
          ampId: step.ampId,
          snapshot: currentSnapshot,
          options: {
            ...(args ? { arguments: args } : {}),
            planChecksum: planState.plan.planChecksum,
            signal: controller.signal,
          },
        };

        const next = (await commitStudioAmpExecution(input)) as {
          output: unknown;
          receipt: Record<string, unknown>;
        };

        setResult(next);
        onReceipt(next.receipt);
        onCommit(next);
        committedCount++;

        if (next.output && typeof next.output === "object" && "checksum" in next.output) {
          currentSnapshot = next.output as Record<string, unknown>;
        }
      }

      setProgress(100);
      setStatus(`Successfully committed all ${committedCount} conveyor steps.`);
    } catch (error) {
      const message = `PB-STUDIO-EXECUTION-FAULT · ${(error as Error).message}`;
      setResult(null);
      setStatus(message);
      onFault(message);
    } finally {
      if (jobControllerRef.current === controller) jobControllerRef.current = null;
      setBusy(false);
    }
  };

  return (
    <section className="pbs-panel" aria-labelledby="pbs-amps-title">
      <header className="pbs-section-header">
        <div>
          <p>DETERMINISTIC EXECUTION BENCH</p>
          <h2 id="pbs-amps-title">AMP Conveyor</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {detectedIds.length > 0 ? (
            <button
              type="button"
              className="pbs-button"
              style={{
                fontSize: "0.74rem",
                padding: "2px 8px",
                background: "var(--pbs-accent-bg, rgba(201,162,39,0.15))",
                border: "1px solid var(--pbs-accent, #c9a227)",
                cursor: "pointer",
              }}
              onClick={() => {
                setSelectedIds(detectedIds);
                if (detectedIds.length > 0 && !focusedId) setFocusedId(detectedIds[0]);
                setStatus(`Selected all ${detectedIds.length} source-detected AMPs.`);
              }}
            >
              ✨ Select Source AMPs ({detectedIds.length})
            </button>
          ) : null}
          <code>
            {executable.length} executable · {supports.length} support
          </code>
        </div>
      </header>
      <div className="pbs-conveyor-grid">
        <div className="pbs-plane pbs-amp-list" aria-label="Studio AMP manifest">
          {executable.map((record) => (
            <label key={record.ampId} className={focusedId === record.ampId ? "is-focused" : ""}>
              <input
                type="checkbox"
                checked={selectedIds.includes(record.ampId)}
                onChange={() => toggle(record.ampId)}
                aria-label={record.ampId}
              />
              <span>
                <strong>{record.ampId}</strong>
                <small>{record.summary}</small>
              </span>
              <em data-kind={record.kind}>{record.kind}</em>
            </label>
          ))}
        </div>
        <aside className="pbs-plane pbs-plan">
          <h3>Plan receipt</h3>
          {planState.error ? (
            <div className="pbs-fault" role="alert">
              {planState.error.message}
            </div>
          ) : (
            <>
              <div className="pbs-plan-totals">
                <strong>{planState.plan.steps.length} activated</strong>
                <span>{planState.plan.skipped.length} skipped</span>
              </div>
              <code className="pbs-checksum">{planState.plan.planChecksum}</code>
              <ol>
                {planState.plan.steps.map((step: { ampId: string; order: number }) => (
                  <li key={step.ampId}>
                    <span>{String(step.order).padStart(2, "0")}</span>
                    {step.ampId}
                  </li>
                ))}
              </ol>
            </>
          )}
          <label className="pbs-field">
            <span>Invocation arguments · optional JSON array</span>
            <textarea
              value={argumentText}
              onChange={(event) => setArgumentText(event.target.value)}
              placeholder={'Example: [{"width":32,"height":32,"seed":23063}]'}
              spellCheck={false}
            />
          </label>
          <div className="pbs-actions">
            <button
              className="pbs-button"
              type="button"
              disabled={busy || !focusedId || !planState.plan}
              onClick={() => run("preview")}
            >
              <Play size={15} />
              Preview selected AMP
            </button>
            <button
              className="pbs-button"
              type="button"
              disabled={busy || !focusedId || !planState.plan}
              onClick={() => run("commit")}
            >
              <Save size={15} />
              Commit selected AMP
            </button>
            {planState.plan && planState.plan.steps.length > 1 ? (
              <button
                className="pbs-button is-primary"
                type="button"
                disabled={busy}
                onClick={commitAllSteps}
                title="Execute and commit all activated steps in the conveyor plan at once"
              >
                <Play size={15} />
                ⚡ Commit All ({planState.plan.steps.length}) Steps
              </button>
            ) : null}
            {busy && (
              <button
                className="pbs-button is-danger"
                type="button"
                onClick={() => {
                  jobControllerRef.current?.abort();
                  setStatus("Cancelling Studio job…");
                }}
              >
                <CircleStop size={15} />
                Cancel job
              </button>
            )}
          </div>
          {busy && <progress aria-label="AMP job progress" max="100" value={progress} />}
          <p className="pbs-status" role="status" aria-live="polite">
            {status}
          </p>
          {result?.receipt && (
            <dl className="pbs-receipt">
              <div>
                <dt>Mode</dt>
                <dd>{String(result.receipt.mode)}</dd>
              </div>
              <div>
                <dt>Output</dt>
                <dd>{String(result.receipt.outputChecksum)}</dd>
              </div>
              <div>
                <dt>Base</dt>
                <dd>{String(result.receipt.baseChecksum)}</dd>
              </div>
            </dl>
          )}
        </aside>
      </div>
      <details className="pbs-plane pbs-support">
        <summary>Support substrates · {supports.length} tested consumers</summary>
        {supports.map((record) => (
          <p key={record.ampId}>
            <button
              className="pbs-inline-button"
              type="button"
              onClick={async () =>
                setSupportEvidence(await inspectStudioSupportExecution(record.ampId))
              }
            >
              <Search size={14} />
              Inspect
            </button>
            <strong>{record.ampId}</strong> → {record.consumerIds.join(", ")}
          </p>
        ))}
        {supportEvidence && (
          <code className="pbs-checksum">
            {String(supportEvidence.ampId)} · {String(supportEvidence.outputChecksum)}
          </code>
        )}
      </details>
      <div className="pbs-plane pbs-extensions">
        <h3>Legacy extension selection</h3>
        <ExtensionSelector selectedExtensions={extensions} onChange={setExtensions} />
      </div>
    </section>
  );
}
