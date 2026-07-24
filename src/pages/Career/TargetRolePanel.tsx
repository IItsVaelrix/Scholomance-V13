import type { CareerGraphAnalysis } from '../../lib/career/graph/contracts';

/**
 * Occupation confirmation + confirmed-role summary (Task 17).
 *
 * Two modes:
 *  - Confirmation (needsConfirmation): the graph retrieved more than the lawful
 *    number of ambiguous families, so missing-skill analysis is PAUSED until the
 *    candidate picks a target role. Renders one button per occupation candidate.
 *  - Summary: shows the confirmed (or top-ranked) target role.
 *
 * Text + icons are used (never color alone) and the section is labelled for
 * assistive tech.
 */
interface TargetRolePanelProps {
  analysis: CareerGraphAnalysis;
  confirmedOccupationId?: string | null;
  needsConfirmation?: boolean;
  onConfirmOccupation?: (conceptId: string) => void;
}

export default function TargetRolePanel({
  analysis,
  confirmedOccupationId,
  needsConfirmation = false,
  onConfirmOccupation,
}: TargetRolePanelProps) {
  if (needsConfirmation) {
    const candidates = analysis.occupations;
    return (
      <section
        className="target-role-panel target-role-panel--confirm"
        aria-label="Confirm target role"
      >
        <h3 className="target-role-heading">
          <span aria-hidden="true">⌖ </span>Confirm target role
        </h3>
        <p className="target-role-note">
          Several occupation families still match this posting. Missing skills are
          paused until you confirm the target role, so gaps are reported against the
          occupation you actually intend.
        </p>
        <ul className="target-role-candidates">
          {candidates.map((c) => (
            <li key={c.conceptId} className="target-role-candidate">
              <button
                type="button"
                className="target-role-candidate-btn"
                onClick={() => onConfirmOccupation?.(c.conceptId)}
              >
                <span className="candidate-label">{c.label}</span>
                <span className="candidate-meta">
                  {c.namespace.toUpperCase()}
                  {c.family ? ` · family ${c.family}` : ''} · {Math.round(c.score * 100)}%
                </span>
              </button>
            </li>
          ))}
          {candidates.length === 0 && (
            <li className="target-role-empty">No occupation candidates were retrieved.</li>
          )}
        </ul>
      </section>
    );
  }

  const confirmed =
    analysis.occupations.find((c) => c.conceptId === confirmedOccupationId) ??
    analysis.occupations[0];

  return (
    <section className="target-role-panel" aria-label="Target role">
      <h3 className="target-role-heading">
        <span aria-hidden="true">⌖ </span>Target role
      </h3>
      {confirmed ? (
        <div className="target-role-confirmed">
          <span className="confirmed-label">{confirmed.label}</span>
          <span className="confirmed-meta">
            {confirmed.conceptId}
            {confirmed.family ? ` · family ${confirmed.family}` : ''}
          </span>
        </div>
      ) : (
        <p className="target-role-note">No occupation was inferred for this posting.</p>
      )}
    </section>
  );
}
