import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, DatabaseZap } from "lucide-react";
import { getStudioAdapterCoverage, getStudioAmpManifest } from "@/lib/pixelbrain/studio-facade.js";

type DiagnosticsProps = {
  snapshot: Record<string, unknown>;
  receipts: ReadonlyArray<Record<string, unknown>>;
  faults: ReadonlyArray<Record<string, unknown>>;
};

export function Diagnostics({ snapshot, receipts, faults }: DiagnosticsProps) {
  const manifest = useMemo(() => getStudioAmpManifest(), []);
  const coverage = useMemo(() => getStudioAdapterCoverage(), []);
  const covered = manifest.length - coverage.missing.length;
  return (
    <section className="pbs-panel" aria-labelledby="pbs-diagnostics-title">
      <header className="pbs-section-header">
        <div>
          <p>GATES · RECEIPTS · BYTECODE FAULTS</p>
          <h2 id="pbs-diagnostics-title">Diagnostics</h2>
        </div>
        <code data-testid="adapter-coverage">
          {covered} / {manifest.length} covered
        </code>
      </header>
      <div className="pbs-diagnostics-grid">
        <div className="pbs-plane pbs-health">
          <DatabaseZap size={21} aria-hidden="true" />
          <div>
            <h3>Adapter registry</h3>
            <p className={coverage.missing.length === 0 ? "is-good" : "is-bad"}>
              {coverage.missing.length === 0 ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertTriangle size={16} />
              )}
              {covered} / {manifest.length} adapters covered
            </p>
          </div>
          <dl className="pbs-receipt">
            <div>
              <dt>Missing</dt>
              <dd>{coverage.missing.length ? coverage.missing.join(", ") : "NONE"}</dd>
            </div>
            <div>
              <dt>Extra</dt>
              <dd>{coverage.extra.length ? coverage.extra.join(", ") : "NONE"}</dd>
            </div>
          </dl>
        </div>
        <div className="pbs-plane">
          <h3>Current snapshot</h3>
          <dl className="pbs-receipt">
            <div>
              <dt>Checksum</dt>
              <dd>{String(snapshot.checksum)}</dd>
            </div>
            <div>
              <dt>Parent</dt>
              <dd>{String(snapshot.parentChecksum ?? "GENESIS")}</dd>
            </div>
            <div>
              <dt>Last AMP</dt>
              <dd>{String(snapshot.lastAmpId ?? snapshot.mutationAmpId ?? "NONE")}</dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>
                {String(snapshot.width)}×{String(snapshot.height)}
              </dd>
            </div>
          </dl>
          <p className="pbs-note">
            The working draft and evidence remain inside this browser until an explicit export.
          </p>
        </div>
        <div className="pbs-plane">
          <h3>Receipt ledger · {receipts.length} / 20</h3>
          {receipts.length ? (
            <ol className="pbs-ledger">
              {receipts.slice(0, 5).map((receipt, index) => (
                <li key={`${String(receipt.outputChecksum)}-${index}`}>
                  <strong>{String(receipt.mode ?? "mutation")}</strong>
                  <span>{String(receipt.ampId)}</span>
                  <code>{String(receipt.outputChecksum)}</code>
                </li>
              ))}
            </ol>
          ) : (
            <p className="pbs-empty">No AMP receipts yet.</p>
          )}
        </div>
        <div className="pbs-plane">
          <h3>Fault / rejection ledger · {faults.length} / 20</h3>
          {faults.length ? (
            <ol className="pbs-ledger is-faults">
              {faults.slice(0, 5).map((fault, index) => (
                <li key={`${String(fault.at)}-${index}`}>
                  <strong>{String(fault.kind ?? "fault").toUpperCase()}</strong>
                  <span>{String(fault.message)}</span>
                  <code>{String(fault.at)}</code>
                </li>
              ))}
            </ol>
          ) : (
            <p className="pbs-empty">No Studio faults recorded.</p>
          )}
        </div>
      </div>
    </section>
  );
}
