export type AssistDeeplinkTab = "amps" | "mutations" | "blueprint" | "finish";

export type CanvasAssistSuggestion = Readonly<{
  id: string;
  kind: "overlay" | "stroke-aid" | "transform" | "deeplink";
  priority: number;
  reason: string;
  baseChecksum: string;
  ampId?: string;
}>;

export type AssistPreviewState = {
  suggestionId: string;
  stale: boolean;
} | null;

type OverlayState = {
  construction: boolean;
  audit: boolean;
};

type CanvasAssistDockProps = {
  suggestions: readonly CanvasAssistSuggestion[];
  activeId: string | null;
  preview: AssistPreviewState;
  relevantCount: number;
  dormantCount: number;
  busy: boolean;
  overlays: OverlayState;
  symmetry: string[];
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  onApply: () => void;
  onDismiss: () => void;
  onDeeplink: (tab: AssistDeeplinkTab) => void;
};

const DEEPLINK_TABS: readonly { tab: AssistDeeplinkTab; label: string }[] = [
  { tab: "amps", label: "Open AMPs" },
  { tab: "mutations", label: "Open Mutations" },
  { tab: "blueprint", label: "Open Blueprint" },
  { tab: "finish", label: "Open Finish" },
];

function titleFor(id: string) {
  return id.replace(/-amp$/, "").replace(/-/g, " ");
}

function tabFor(item: CanvasAssistSuggestion): AssistDeeplinkTab | null {
  if (item.id === "construction-guides") return "blueprint";
  if (item.id === "palette-quantization-amp") return "mutations";
  if (item.kind === "transform") return "mutations";
  if (item.kind === "deeplink") return "amps";
  return null;
}

function overlayPressed(item: CanvasAssistSuggestion, overlays: OverlayState, symmetry: string[]) {
  if (item.id === "construction-guides") return overlays.construction;
  if (item.id === "pixel-audit") return overlays.audit;
  if (item.id === "symmetry-assist") return symmetry.length > 0;
  return false;
}

export function CanvasAssistDock({
  suggestions,
  activeId,
  preview,
  relevantCount,
  dormantCount,
  busy,
  overlays,
  symmetry,
  onSelect,
  onToggle,
  onPreview,
  onApply,
  onDismiss,
  onDeeplink,
}: CanvasAssistDockProps) {
  return (
    <section className="pbs-dock pbs-assist-dock" data-testid="canvas-assist" aria-labelledby="pbs-assist-heading">
      <details open>
        <summary>
          <h3 id="pbs-assist-heading">Assist</h3>
        </summary>
        <p className="pbs-assist-accounting" data-testid="assist-accounting">
          {relevantCount} relevant · {dormantCount} dormant
        </p>
        {suggestions.length ? (
          <ol className="pbs-assist-list">
            {suggestions.map((item) => {
              const active = item.id === activeId;
              const pressed = overlayPressed(item, overlays, symmetry);
              const previewing = preview?.suggestionId === item.id;
              const canApply = previewing && !preview?.stale && !busy;
              const dest = tabFor(item);
              return (
                <li
                  key={item.id}
                  className={active ? "is-active" : undefined}
                  data-assist-id={item.id}
                  data-assist-kind={item.kind}
                >
                  <button
                    type="button"
                    className="pbs-assist-select"
                    aria-pressed={active}
                    onClick={() => onSelect(item.id)}
                  >
                    {titleFor(item.id)}
                  </button>
                  <p className="pbs-assist-reason">{item.reason}</p>
                  <div className="pbs-assist-actions">
                    {item.kind === "overlay" || item.kind === "stroke-aid" ? (
                      <button
                        type="button"
                        className={pressed ? "pbs-button is-active" : "pbs-button"}
                        aria-pressed={pressed}
                        onClick={() => onToggle(item.id)}
                      >
                        {item.kind === "stroke-aid" ? (pressed ? "Disable symmetry" : "Enable symmetry") : pressed ? "Hide overlay" : "Show overlay"}
                      </button>
                    ) : null}
                    {item.kind === "transform" ? (
                      <>
                        <button
                          type="button"
                          className="pbs-button"
                          disabled={busy}
                          onClick={() => onPreview(item.id)}
                        >
                          Preview
                        </button>
                        <button type="button" className="pbs-button is-primary" disabled={!canApply} onClick={onApply}>
                          Apply
                        </button>
                        <button
                          type="button"
                          className="pbs-button"
                          disabled={!previewing || busy}
                          onClick={onDismiss}
                        >
                          Dismiss
                        </button>
                      </>
                    ) : null}
                    {dest ? (
                      <button type="button" className="pbs-button" onClick={() => onDeeplink(dest)}>
                        {dest === "blueprint"
                          ? "Open Blueprint"
                          : dest === "mutations"
                            ? "Open Mutations"
                            : dest === "finish"
                              ? "Open Finish"
                              : "Open AMPs"}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="pbs-note">No relevant Assist on this revision.</p>
        )}
        {preview?.stale ? (
          <p className="pbs-assist-stale" data-testid="assist-stale" role="status" aria-live="polite">
            Proposal is stale. The document changed after Preview; regenerate Preview before Apply.
          </p>
        ) : null}
        {busy ? (
          <p className="pbs-note" role="status">
            Running isolated mutation preview…
          </p>
        ) : null}
        <details className="pbs-assist-dormant">
          <summary>Dormant AMPs</summary>
          <p className="pbs-note">
            Remaining capability stays on AMP Conveyor, Mutation Lab, Blueprint, and Finish. Assist does not duplicate those controls.
          </p>
          <div className="pbs-assist-actions">
            {DEEPLINK_TABS.map((entry) => (
              <button key={entry.tab} type="button" className="pbs-button" onClick={() => onDeeplink(entry.tab)}>
                {entry.label}
              </button>
            ))}
          </div>
        </details>
      </details>
    </section>
  );
}
