import { useEffect, useState } from "react";
import {
  discardLocal,
  encodeAsepriteFromDocument,
  encodePng,
  exportRecipe,
  keepLocally,
  loadStudioLibrary,
  restoreLocal,
} from "@/lib/pixelbrain/studio-authoring-facade.js";

type LibraryProps = {
  document: ReturnType<typeof import("@/lib/pixelbrain/studio-document.js").createDocumentController>;
  onChange: () => void;
  onFault: (message: string) => void;
};

function downloadBytes(bytes: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([typeof bytes === "string" ? bytes : Uint8Array.from(bytes)], { type });
  const link = window.document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function LibraryTab({ document: doc, onChange, onFault }: LibraryProps) {
  const snapshot = doc.getSnapshot();
  const [name, setName] = useState("Untitled glyph");
  const [notice, setNotice] = useState("Keep and download are separate actions.");
  const [library, setLibrary] = useState<any>({ records: [], faults: [] });
  useEffect(() => {
    setLibrary(loadStudioLibrary(window.localStorage));
  }, [snapshot.checksum, notice]);

  return (
    <section className="pbs-panel" aria-labelledby="pbs-library-title">
      <header className="pbs-section-header">
        <div>
          <p>EXPLICIT LOCAL KEEP · DETERMINISTIC EXPORTS</p>
          <h2 id="pbs-library-title">Library & Export</h2>
        </div>
        <code>{library.records.length} records</code>
      </header>
      <div className="pbs-library-grid">
        <div className="pbs-plane">
          <label className="pbs-field">
            <span>Artifact name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Artifact name" />
          </label>
          <div className="pbs-actions">
            <button
              type="button"
              className="pbs-button is-primary"
              onClick={() => {
                const result = keepLocally(window.localStorage, snapshot, { name });
                if (!result.kept) {
                  onFault(result.fault?.message || "PB-STUDIO-LOCAL-STORE");
                  setNotice("Quota write failed. The active document is unchanged.");
                } else {
                  setNotice(`Kept ${name} locally.`);
                }
              }}
            >
              Keep locally
            </button>
            <button
              type="button"
              className="pbs-button"
              onClick={() =>
                downloadBytes(encodePng(snapshot), `${name}.png`, "image/png")
              }
            >
              Download PNG
            </button>
            <button
              type="button"
              className="pbs-button"
              onClick={() =>
                downloadBytes(encodeAsepriteFromDocument(snapshot), `${name}.aseprite`, "application/octet-stream")
              }
            >
              Export Aseprite
            </button>
            <button
              type="button"
              className="pbs-button"
              onClick={() =>
                downloadBytes(
                  JSON.stringify(exportRecipe(snapshot, [...doc.getEvents()]), null, 2),
                  `${name}.recipe.json`,
                  "application/json",
                )
              }
            >
              Export recipe
            </button>
          </div>
          <p className="pbs-status" role="status">
            {notice}
          </p>
        </div>
        <div className="pbs-plane">
          <h3>Session library</h3>
          {library.records.length ? (
            <ul className="pbs-ledger">
              {library.records.map((record: any) => (
                <li key={record.id}>
                  <strong>{record.name}</strong>
                  <span>
                    v{record.version} · {record.width}px
                  </span>
                  <span>
                    {record.version === 2 ? (
                      <>
                        <button
                          type="button"
                          className="pbs-inline-button"
                          onClick={() => {
                            restoreLocal(doc, record);
                            onChange();
                            setNotice(`Restored ${record.name}.`);
                          }}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="pbs-inline-button"
                          onClick={() => {
                            discardLocal(window.localStorage, record.id);
                            setNotice(`Discarded ${record.name}.`);
                          }}
                        >
                          Discard
                        </button>
                      </>
                    ) : (
                      "Phase A grass record left untouched"
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pbs-empty">Nothing kept locally yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
