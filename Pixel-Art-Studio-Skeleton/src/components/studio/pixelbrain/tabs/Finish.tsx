import { useEffect, useMemo, useState } from "react";
import {
  applyFinishShader,
  previewFinishWebGL,
  transmuteStyle,
} from "@/lib/pixelbrain/studio-authoring-facade.js";

type FinishProps = {
  document: ReturnType<typeof import("@/lib/pixelbrain/studio-document.js").createDocumentController>;
  onChange: () => void;
  onFault: (message: string) => void;
};

const SCHOOLS = ["VOID", "SONIC", "PSYCHIC", "ALCHEMY", "WILL"];
const STYLES = ["none", "gameboy", "nes", "vga"];

export function Finish({ document: doc, onChange, onFault }: FinishProps) {
  const snapshot = doc.getSnapshot();
  const [schoolId, setSchoolId] = useState("VOID");
  const [styleId, setStyleId] = useState("gameboy");
  const [mode, setMode] = useState("mass");
  const [webgl, setWebgl] = useState<string>("WebGL preview idle");
  useEffect(() => {
    try {
      const canvas = window.document.createElement("canvas");
      const gl = canvas.getContext("webgl");
      previewFinishWebGL(gl);
      setWebgl("WebGL preview ready");
    } catch (error) {
      setWebgl((error as Error).message);
    }
  }, []);
  const transmuted = useMemo(
    () => transmuteStyle(snapshot, { schoolId, styleId }),
    [snapshot, schoolId, styleId],
  );
  const shaded = useMemo(
    () => applyFinishShader(snapshot, { mode, schoolId }),
    [snapshot, mode, schoolId],
  );

  return (
    <section className="pbs-panel" aria-labelledby="pbs-finish-title">
      <header className="pbs-section-header">
        <div>
          <p>DETERMINISTIC FINISH · NO WALL CLOCK</p>
          <h2 id="pbs-finish-title">Material & Finish</h2>
        </div>
        <code>{transmuted.checksum}</code>
      </header>
      <div className="pbs-finish-grid">
        <div className="pbs-plane">
          <label className="pbs-field">
            <span>School</span>
            <select aria-label="School" value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
              {SCHOOLS.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <label className="pbs-field">
            <span>Style</span>
            <select aria-label="Style" value={styleId} onChange={(event) => setStyleId(event.target.value)}>
              {STYLES.map((id) => (
                <option key={id}>{id}</option>
              ))}
            </select>
          </label>
          <label className="pbs-field">
            <span>Shader</span>
            <select aria-label="Shader" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="mass">Mass</option>
              <option value="cylinder">Cylinder</option>
            </select>
          </label>
          <button
            type="button"
            className="pbs-button"
            onClick={() => {
              try {
                const canvas = document.createElement("canvas");
                const gl = canvas.getContext("webgl");
                previewFinishWebGL(gl);
                setWebgl("WebGL preview ready");
              } catch (error) {
                const message = (error as Error).message;
                setWebgl(message);
                onFault(message);
              }
            }}
          >
            Probe WebGL preview
          </button>
          <p className="pbs-status" role="status" data-testid="finish-webgl">
            {webgl}
          </p>
        </div>
        <div className="pbs-plane">
          <h3>Transmutation</h3>
          <p className="pbs-note">
            {transmuted.cells.length} cells · {transmuted.algorithmId} · {transmuted.styleId}
          </p>
          <button
            type="button"
            className="pbs-button is-primary"
            onClick={() => {
              doc.installGeneratedOutput(
                { coordinates: transmuted.cells },
                { baseChecksum: snapshot.checksum, ampId: "finish-transmute", outputChecksum: transmuted.checksum },
                { name: `Finish/${styleId}` },
              );
              onChange();
            }}
          >
            Use transmutation in Canvas
          </button>
        </div>
        <div className="pbs-plane">
          <h3>Shader export</h3>
          <p className="pbs-note">
            {shaded.cells.length} shaded cells · {shaded.mode}
          </p>
          <button
            type="button"
            className="pbs-button is-primary"
            onClick={() => {
              doc.installGeneratedOutput(
                { coordinates: shaded.cells },
                { baseChecksum: snapshot.checksum, ampId: "finish-shader", outputChecksum: shaded.checksum },
                { name: `Finish/${mode}` },
              );
              onChange();
            }}
          >
            Use shader in Canvas
          </button>
        </div>
      </div>
    </section>
  );
}
