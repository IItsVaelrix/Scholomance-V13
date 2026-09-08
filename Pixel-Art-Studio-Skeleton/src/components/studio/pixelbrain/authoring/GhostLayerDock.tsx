import { useState, useMemo } from "react";
import {
  GHOST_AMP_PRESETS,
  FLAME_ELEMENTS,
} from "@/lib/pixelbrain/canvas-ghost-amps.js";
import { getStudioAmpManifest } from "@/lib/pixelbrain/studio-facade.js";

export type GhostLayerModel = {
  ampId: string;
  ampName: string;
  cells: Array<{ x: number; y: number; color?: string | null; role?: string; label?: string }>;
  visible: boolean;
  opacity: number;
  style: "translucent" | "outline";
  element?: "classic" | "holy" | "icy" | "shadow" | "poison";
  intensity?: "subtle" | "medium" | "intense";
  hintCount: number;
  summary: string;
  baseChecksum: string;
} | null;

export type DetectedAmpItem = {
  ampId: string;
  manifestId?: string;
  name?: string;
  shortName?: string;
  stage?: string;
  order?: number;
  kind?: string;
  reason?: string;
  isGhostSupported?: boolean;
};

export type GhostLayerDockProps = {
  ghostLayer: GhostLayerModel;
  detectedAmps?: readonly DetectedAmpItem[];
  detectedShaders?: readonly any[];
  pipeline?: string | null;
  busy: boolean;
  opacity: number;
  hintStyle: "translucent" | "outline";
  flameElement: "classic" | "holy" | "icy" | "shadow" | "poison";
  ghostIntensity: "subtle" | "medium" | "intense";
  stale: boolean;
  onCallAmp: (ampId: string, options?: { element?: string; intensity?: string }) => void;
  onApplyAll?: (mode?: "layers" | "merge") => void;
  onOpacity: (opacity: number) => void;
  onHintStyle: (style: "translucent" | "outline") => void;
  onFlameElement: (element: "classic" | "holy" | "icy" | "shadow" | "poison") => void;
  onGhostIntensity: (intensity: "subtle" | "medium" | "intense") => void;
  onToggleVisible: () => void;
  onAdopt: () => void;
  onMerge: () => void;
  onDismiss: () => void;
  onRefresh: () => void;
};

function getAmpIcon(manifestId?: string, ampId?: string): string {
  const id = (manifestId || ampId || "").toLowerCase();
  if (id.includes("shadow")) return "🌑";
  if (id.includes("selout")) return "✒️";
  if (id.includes("aa")) return "🔍";
  if (id.includes("sharpness") || id.includes("contrast")) return "⚡";
  if (id.includes("palette")) return "🎨";
  if (id.includes("tonation")) return "🌓";
  if (id.includes("volume")) return "🧊";
  if (id.includes("vector")) return "↗️";
  if (id.includes("geometry")) return "📐";
  if (id.includes("region") || id.includes("fill")) return "🪣";
  if (id.includes("flame")) return "🔥";
  if (id.includes("bevel")) return "🛡️";
  return "✨";
}

export function GhostLayerDock({
  ghostLayer,
  detectedAmps,
  detectedShaders,
  pipeline,
  busy,
  opacity,
  hintStyle,
  flameElement,
  ghostIntensity,
  stale,
  onCallAmp,
  onApplyAll,
  onOpacity,
  onHintStyle,
  onFlameElement,
  onGhostIntensity,
  onToggleVisible,
  onAdopt,
  onMerge,
  onDismiss,
  onRefresh,
}: GhostLayerDockProps) {
  const [selectedAmpSelect, setSelectedAmpSelect] = useState<string>("");
  const manifest = useMemo(() => getStudioAmpManifest(), []);

  const isFlameActive =
    ghostLayer &&
    (ghostLayer.ampId === "flame" ||
      ghostLayer.ampId === "pixelbrain.flame-tip-amp" ||
      ghostLayer.ampId === "pixelbrain.holyfireMotif");

  return (
    <section
      className="pbs-dock pbs-ghost-dock"
      data-testid="canvas-ghost-layer"
      aria-labelledby="pbs-ghost-heading"
    >
      <details open>
        <summary className="pbs-dock-summary">
          <h3 id="pbs-ghost-heading">Ghost Layers (AMP Hints)</h3>
          {ghostLayer && ghostLayer.visible ? (
            <span className="pbs-ghost-badge">
              {ghostLayer.ampName} ({ghostLayer.hintCount})
            </span>
          ) : (
            <span className="pbs-ghost-badge pbs-ghost-badge--idle">Ready</span>
          )}
        </summary>

        <p className="pbs-ghost-desc">
          AMP algorithms project deterministic ghost overlays directly onto the canvas before baking into permanent layers.
        </p>

        {/* Active Form Shaders Section */}
        {detectedShaders && detectedShaders.length > 0 ? (
          <div style={{ marginBottom: "10px", padding: "6px 8px", background: "rgba(14, 165, 233, 0.08)", border: "1px solid rgba(14, 165, 233, 0.2)", borderRadius: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "#38bdf8", display: "flex", alignItems: "center", gap: "5px" }}>
                <span>🎨</span> Form Shaders Applied ({detectedShaders.length})
              </span>
              <span style={{ fontSize: "0.65rem", color: "var(--pbs-muted, #94a3b8)" }}>Compile-Time Active</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {detectedShaders.map((shader: any) => (
                <span
                  key={shader.shaderId || shader.layerName}
                  className="pbs-ghost-badge"
                  style={{
                    fontSize: "0.68rem",
                    padding: "2px 6px",
                    background: "rgba(14, 165, 233, 0.15)",
                    color: "#e0f2fe",
                    borderColor: "rgba(14, 165, 233, 0.35)",
                  }}
                  title={`${shader.layerName}: ${shader.name || shader.type} (${shader.source})`}
                >
                  {shader.layerName} ({shader.type})
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Detected in Source Code Section */}
        {detectedAmps && detectedAmps.length > 0 ? (
          <div className="pbs-ghost-source-section" style={{ marginBottom: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px", flexWrap: "wrap", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--pbs-accent, #c9a227)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>✨</span> Detected in Source Code ({detectedAmps.length})
                </span>
                {pipeline ? (
                  <span className="pbs-ghost-badge" style={{ fontSize: "0.68rem", textTransform: "uppercase" }}>
                    {pipeline}
                  </span>
                ) : null}
              </div>
              {onApplyAll ? (
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    type="button"
                    className="pbs-button is-primary"
                    style={{
                      fontSize: "0.72rem",
                      padding: "2px 8px",
                      height: "24px",
                      minHeight: "24px",
                      fontWeight: 600,
                    }}
                    title="Apply all detected AMP passes to dedicated layers at once"
                    disabled={busy}
                    onClick={() => onApplyAll("layers")}
                  >
                    ⚡ Apply All ({detectedAmps.length})
                  </button>
                  <button
                    type="button"
                    className="pbs-button"
                    style={{
                      fontSize: "0.72rem",
                      padding: "2px 6px",
                      height: "24px",
                      minHeight: "24px",
                    }}
                    title="Merge all detected AMP recommendations directly into active layer"
                    disabled={busy}
                    onClick={() => onApplyAll("merge")}
                  >
                    🎯 Merge All
                  </button>
                </div>
              ) : null}
            </div>
            <div className="pbs-ghost-preset-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "4px" }}>
              {detectedAmps.map((amp) => {
                const targetId = amp.manifestId || amp.ampId;
                const isActive = ghostLayer?.ampId === targetId || ghostLayer?.ampId === amp.ampId;
                return (
                  <button
                    key={amp.ampId}
                    type="button"
                    className={`pbs-button pbs-ghost-preset-btn ${isActive ? "is-active" : ""}`}
                    title={amp.reason || `${amp.name} (${amp.stage || "AMP"})`}
                    disabled={busy}
                    onClick={() => {
                      onCallAmp(targetId, { intensity: ghostIntensity });
                    }}
                    style={{ padding: "4px 8px", minHeight: "32px", justifyContent: "flex-start", gap: "6px" }}
                  >
                    <span style={{ fontSize: "0.85rem" }}>
                      {getAmpIcon(amp.manifestId, amp.ampId)}
                    </span>
                    <span className="pbs-ghost-preset-name" style={{ fontSize: "0.72rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {amp.shortName || amp.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Quick Presets Grid */}
        <div className="pbs-ghost-preset-grid" aria-label="AMP Ghost Presets">
          {GHOST_AMP_PRESETS.map((preset) => {
            const isActive =
              ghostLayer?.ampId === preset.ampId ||
              (preset.id === "flame" && isFlameActive);
            return (
              <button
                key={preset.id}
                type="button"
                className={`pbs-button pbs-ghost-preset-btn ${isActive ? "is-active" : ""}`}
                title={preset.description}
                disabled={busy}
                onClick={() => {
                  if (preset.id === "flame") {
                    onCallAmp(preset.id, { element: flameElement, intensity: ghostIntensity });
                  } else {
                    onCallAmp(preset.id, { intensity: ghostIntensity });
                  }
                }}
              >
                <span className="pbs-ghost-preset-icon">{preset.icon}</span>
                <span className="pbs-ghost-preset-name">{preset.name}</span>
              </button>
            );
          })}
        </div>

        {/* Full AMP Directory Dropdown */}
        <div className="pbs-ghost-select-row">
          <label htmlFor="pbs-ghost-amp-select" className="sr-only">
            Select AMP from manifest
          </label>
          <select
            id="pbs-ghost-amp-select"
            className="pbs-ghost-select"
            value={selectedAmpSelect}
            disabled={busy}
            onChange={(e) => {
              const id = e.target.value;
              setSelectedAmpSelect(id);
              if (id) {
                onCallAmp(id);
              }
            }}
          >
            <option value="">-- Summon any AMP from Directory ({manifest.length}) --</option>
            {manifest.map((rec) => (
              <option key={rec.ampId} value={rec.ampId}>
                {rec.summary || rec.ampId} [{rec.kind}]
              </option>
            ))}
          </select>
        </div>

        {/* Active Ghost Layer Controls Card */}
        {ghostLayer ? (
          <div className="pbs-ghost-card" data-testid="ghost-active-card">
            <div className="pbs-ghost-card-header">
              <span className="pbs-ghost-card-title">
                {ghostLayer.ampName}
              </span>
              <span className="pbs-ghost-card-count">
                {ghostLayer.hintCount} hint pixels
              </span>
            </div>

            <p className="pbs-ghost-summary">{ghostLayer.summary}</p>

            {/* Flame Element Variations if Flame AMP is active */}
            {isFlameActive ? (
              <div className="pbs-ghost-element-group">
                <span className="pbs-ghost-subheading">Flame Element:</span>
                <div className="pbs-ghost-element-btns">
                  {FLAME_ELEMENTS.map((elem) => (
                    <button
                      key={elem.id}
                      type="button"
                      className={`pbs-button pbs-ghost-elem-btn ${flameElement === elem.id ? "is-active" : ""}`}
                      title={elem.desc}
                      onClick={() => {
                        onFlameElement(elem.id as any);
                        onCallAmp("flame", { element: elem.id, intensity: ghostIntensity });
                      }}
                    >
                      {elem.icon} {elem.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Intensity Level for AMPs with intensity */}
            <div className="pbs-ghost-intensity-group">
              <span className="pbs-ghost-subheading">Intensity:</span>
              <div className="pbs-ghost-toggle-group">
                {(["subtle", "medium", "intense"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className={`pbs-button ${ghostIntensity === lvl ? "is-active" : ""}`}
                    onClick={() => {
                      onGhostIntensity(lvl);
                      onCallAmp(ghostLayer.ampId, { element: flameElement, intensity: lvl });
                    }}
                  >
                    {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Opacity Slider */}
            <div className="pbs-ghost-slider-group">
              <div className="pbs-ghost-slider-header">
                <span className="pbs-ghost-subheading">Ghost Opacity:</span>
                <span className="pbs-ghost-opacity-val">{Math.round(opacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={opacity}
                className="pbs-ghost-slider"
                aria-label="Ghost Layer Opacity"
                onChange={(e) => onOpacity(parseFloat(e.target.value))}
              />
              <div className="pbs-ghost-opacity-presets">
                {[0.25, 0.5, 0.75, 1.0].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className={`pbs-button pbs-button--compact ${Math.abs(opacity - val) < 0.04 ? "is-active" : ""}`}
                    onClick={() => onOpacity(val)}
                  >
                    {Math.round(val * 100)}%
                  </button>
                ))}
              </div>
            </div>

            {/* Hint Style Mode */}
            <div className="pbs-ghost-style-group">
              <span className="pbs-ghost-subheading">Hint Style:</span>
              <div className="pbs-ghost-toggle-group">
                <button
                  type="button"
                  className={`pbs-button ${hintStyle === "translucent" ? "is-active" : ""}`}
                  onClick={() => onHintStyle("translucent")}
                >
                  Ghost Fill
                </button>
                <button
                  type="button"
                  className={`pbs-button ${hintStyle === "outline" ? "is-active" : ""}`}
                  onClick={() => onHintStyle("outline")}
                >
                  Outlines
                </button>
                <button
                  type="button"
                  className={`pbs-button ${ghostLayer.visible ? "is-active" : ""}`}
                  onClick={onToggleVisible}
                >
                  {ghostLayer.visible ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Stale Warning Banner */}
            {stale ? (
              <div className="pbs-assist-stale" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Artwork modified since hints were projected.</span>
                <button
                  type="button"
                  className="pbs-button pbs-button--compact is-primary"
                  onClick={onRefresh}
                >
                  Refresh
                </button>
              </div>
            ) : null}

            {/* Action Buttons: Adopt, Merge, Dismiss */}
            <div className="pbs-ghost-actions">
              <button
                type="button"
                className="pbs-button is-primary"
                title="Create a new dedicated layer containing these ghost recommendation pixels"
                onClick={onAdopt}
              >
                ⚡ Bake to New Layer
              </button>
              <button
                type="button"
                className="pbs-button"
                title="Stamp recommendation pixels directly into active drawing layer"
                onClick={onMerge}
              >
                🎯 Merge to Active Layer
              </button>
              {onApplyAll && detectedAmps && detectedAmps.length > 1 ? (
                <button
                  type="button"
                  className="pbs-button is-primary"
                  title="Apply all detected AMP passes at once across the artwork"
                  disabled={busy}
                  onClick={() => onApplyAll("layers")}
                >
                  ⚡ Apply All ({detectedAmps.length})
                </button>
              ) : null}
              <button
                type="button"
                className="pbs-button"
                onClick={onDismiss}
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : (
          <div className="pbs-ghost-empty">
            <p className="pbs-note">
              Tip: Draw a sword blade or sprite, then click <strong>Flame AMP 🔥</strong> to project fire hints onto a ghost layer.
            </p>
          </div>
        )}

        {busy ? (
          <p className="pbs-note" role="status" style={{ marginTop: "6px" }}>
            Calculating AMP ghost recommendations…
          </p>
        ) : null}
      </details>
    </section>
  );
}
