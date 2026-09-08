import { useMemo } from "react";
import { critiqueDocument } from "@/lib/pixelbrain/studio-authoring-facade.js";

type MentorProps = {
  document: ReturnType<typeof import("@/lib/pixelbrain/studio-document.js").createDocumentController>;
};

export function Mentor({ document: doc }: MentorProps) {
  const snapshot = doc.getSnapshot();
  const critique = useMemo(() => critiqueDocument(snapshot), [snapshot]);

  return (
    <section className="pbs-panel" aria-labelledby="pbs-mentor-title">
      <header className="pbs-section-header">
        <div>
          <p>EVIDENCE-BASED CRITIQUE · NO EXTERNAL MODEL</p>
          <h2 id="pbs-mentor-title">Mentor & Reference</h2>
        </div>
        <code>
          {critique.coordCount} cells · rev {critique.revision}
        </code>
      </header>
      <div className="pbs-mentor-grid">
        <div className="pbs-plane">
          <h3>Diagnosis</h3>
          <ol className="pbs-ledger">
            {critique.steps.map((step) => (
              <li key={step.id}>
                <strong>{step.status}</strong>
                <span>{step.title}</span>
                <code>{step.note}</code>
              </li>
            ))}
          </ol>
        </div>
        <div className="pbs-plane">
          <h3>Next action</h3>
          {critique.nextActions.length ? (
            <ul>
              {critique.nextActions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
          ) : (
            <p className="pbs-empty">No blocking critique. Keep the silhouette honest at 32px.</p>
          )}
          <p className="pbs-note">This panel never calls a remote model. Metrics are computed from the active revision.</p>
        </div>
      </div>
    </section>
  );
}
