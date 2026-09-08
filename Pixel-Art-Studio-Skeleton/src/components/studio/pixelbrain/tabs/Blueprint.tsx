import { useState } from "react";
import {
  applyConstructionGuides,
  evaluateForgeGate,
} from "@/lib/pixelbrain/studio-authoring-facade.js";

type BlueprintProps = {
  document: ReturnType<typeof import("@/lib/pixelbrain/studio-document.js").createDocumentController>;
  onChange: () => void;
  onFault: (message: string) => void;
};

export function Blueprint({ document: doc, onChange, onFault }: BlueprintProps) {
  const snapshot = doc.getSnapshot();
  const [sketch, setSketch] = useState("center cross, concentric rings, radial spokes");
  const liveGate = evaluateForgeGate({ snapshot: doc.getSnapshot() });
  const [gate, setGate] = useState<ReturnType<typeof evaluateForgeGate> | null>(liveGate);

  return (
    <section className="pbs-panel" aria-labelledby="pbs-blueprint-title">
      <header className="pbs-section-header">
        <div>
          <p>STRUCTURE BEFORE INK</p>
          <h2 id="pbs-blueprint-title">Blueprint</h2>
        </div>
        <code>rev {String(snapshot.revision)}</code>
      </header>
      <div className="pbs-blueprint-grid">
        <div className="pbs-plane">
          <h3>Sketch pad</h3>
          <label className="pbs-field">
            <span>Reference notes</span>
            <textarea value={sketch} onChange={(event) => setSketch(event.target.value)} />
          </label>
          <p className="pbs-note">
            Notes stay with the session. Construction geometry writes onto the protected 00_Reference layer.
          </p>
        </div>
        <div className="pbs-plane">
          <h3>Construction guides</h3>
          <button
            type="button"
            className="pbs-button is-primary"
            onClick={() => {
              applyConstructionGuides(doc);
              onChange();
            }}
          >
            Ink construction cross
          </button>
        </div>
        <div className="pbs-plane">
          <h3>Forge Gate</h3>
          <div className="pbs-actions">
            <button
              type="button"
              className="pbs-button is-primary"
              data-testid="forge-gate-run"
              onClick={() => setGate(evaluateForgeGate({ snapshot: doc.getSnapshot() }))}
            >
              Run gate
            </button>
            <button
              type="button"
              className="pbs-button"
              onClick={() => setGate(evaluateForgeGate({ snapshot: doc.getSnapshot(), observedSampling: true }))}
            >
              Probe observed sampling
            </button>
          </div>
          {gate ? (
            <div
              className={gate.verdict === "PASS" ? "pbs-verdict is-pass" : "pbs-verdict is-fail"}
              role="status"
              aria-live="polite"
              data-testid="forge-gate-verdict"
            >
              <strong>{gate.verdict}</strong>
              {gate.family ? <code>{gate.family}</code> : null}
              <ul>
                {gate.findings.map((finding) => (
                  <li key={finding.code}>
                    {finding.reason} · {String(finding.measure)}
                  </li>
                ))}
              </ul>
              {gate.verdict === "PASS" ? (
                <button
                  type="button"
                  className="pbs-button"
                  onClick={() => {
                    doc.setActiveLayer(1);
                    onChange();
                  }}
                >
                  Hand off to Canvas
                </button>
              ) : (
                <button
                  type="button"
                  className="pbs-button"
                  onClick={() => onFault(`${gate.family} · ${gate.findings[0]?.reason || "gate failed"}`)}
                >
                  Record fault
                </button>
              )}
            </div>
          ) : (
            <p className="pbs-empty">Run the gate against the active document.</p>
          )}
        </div>
      </div>
    </section>
  );
}
