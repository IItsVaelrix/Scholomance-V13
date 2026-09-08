import { useEffect, useMemo, useRef, useState } from "react";
import {
  assistIsStale,
  assistOutputCells,
  auditCanvasPixels,
  selectCanvasAssists,
} from "@/lib/pixelbrain/canvas-assist.js";
import { ZOOM_LADDER, fitViewport, stepZoom } from "@/lib/pixelbrain/canvas-interaction.js";
import {
  countDocumentCells,
  critiqueDocument,
  encodeAsepriteFromDocument,
  encodePng,
  ingestScdlIntoDocument,
  importAsepriteIntoDocument,
  importPngIntoDocument,
  previewConstructionGuides,
} from "@/lib/pixelbrain/studio-authoring-facade.js";
import {
  acceptStudioMutation,
  getStudioAmpManifest,
  proposeStudioMutationExecution,
  rejectStudioMutation,
} from "@/lib/pixelbrain/studio-facade.js";
import { generateGhostHints, isGhostLayerStale } from "@/lib/pixelbrain/canvas-ghost-amps.js";
import { CanvasAssistDock } from "../authoring/CanvasAssistDock";
import { CanvasCommandBar } from "../authoring/CanvasCommandBar";
import { CanvasFeedback, type CanvasFeedbackMessage } from "../authoring/CanvasFeedback";
import { CanvasInspector } from "../authoring/CanvasInspector";
import { GhostLayerDock, type GhostLayerModel } from "../authoring/GhostLayerDock";
import { CanvasStatusBar, type CanvasStatusBarHandle } from "../authoring/CanvasStatusBar";
import { ClassicCanvas } from "../authoring/ClassicCanvas";
import { DocumentBar } from "../authoring/DocumentBar";
import { IndexedPaletteDock } from "../authoring/IndexedPaletteDock";
import { LayerDock } from "../authoring/LayerDock";
import { NativePreview } from "../authoring/NativePreview";
import { PixelCanvas, type CanvasCandidate, type CanvasViewport } from "../authoring/PixelCanvas";
import { ScdlIngestionDialog } from "../authoring/ScdlIngestionDialog";
import { ToolRail } from "../authoring/ToolRail";

function measureWorkboard() {
  const node = document.querySelector<HTMLElement>("[data-testid='canvas-viewport']");
  return { width: node?.clientWidth || 1, height: node?.clientHeight || 1 };
}

function isShortcutBlocked(event: KeyboardEvent) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("dialog")) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable || target.closest("[contenteditable='true']")) return true;
  return false;
}

type CanvasTabProps = {
  document: ReturnType<typeof import("@/lib/pixelbrain/studio-document.js").createDocumentController>;
  revision: number;
  onChange: () => void;
  onFault: (message: string) => void;
  onReceipt?: (receipt: Record<string, unknown>) => void;
  onOpenTab?: (tab: string) => void;
};

type AssistProposal = {
  transaction: { baseChecksum?: string; candidate?: { data?: unknown } };
  receipt: Record<string, unknown>;
};

type AssistPreview = {
  suggestionId: string;
  proposal: AssistProposal;
  cells: Array<{ x: number; y: number; color?: string | null }>;
};

function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  const blob = new Blob([Uint8Array.from(bytes)], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

function cellsFromProposal(proposal: AssistProposal) {
  const candidate = proposal.transaction?.candidate;
  return assistOutputCells(candidate?.data ?? candidate);
}

function ProfessionalCanvas({ document: doc, revision, onChange, onFault, onReceipt, onOpenTab }: CanvasTabProps) {
  const snapshot = doc.getSnapshot() as Record<string, unknown> & {
    layers: Array<{ name: string; visible?: boolean; locked?: boolean; opacity?: number; cells?: unknown[] }>;
    palette: string[];
    width: number;
    height: number;
    gridType: string;
    checksum: string;
  };
  const [spacePan, setSpacePan] = useState(false);
  const [gridVisible, setGridVisible] = useState(true);
  const [viewport, setViewport] = useState<CanvasViewport>({ panX: 0, panY: 0, zoom: 1 });
  const [feedback, setFeedback] = useState<CanvasFeedbackMessage | null>(null);
  const [activeAssistId, setActiveAssistId] = useState<string | null>(null);
  const [overlays, setOverlays] = useState({ construction: false, audit: false });
  const [preview, setPreview] = useState<AssistPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [scdlOpen, setScdlOpen] = useState(false);
  const [ghostLayer, setGhostLayer] = useState<GhostLayerModel>(null);
  const [ghostBusy, setGhostBusy] = useState(false);
  const [ghostOpacity, setGhostOpacity] = useState(0.55);
  const [ghostStyle, setGhostStyle] = useState<"translucent" | "outline">("translucent");
  const [flameElement, setFlameElement] = useState<"classic" | "holy" | "icy" | "shadow" | "poison">("classic");
  const [ghostIntensity, setGhostIntensity] = useState<"subtle" | "medium" | "intense">("medium");
  const importRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<CanvasStatusBarHandle>(null);
  const jobControllerRef = useRef<AbortController | null>(null);

  const announce = (text: string, tone: CanvasFeedbackMessage["tone"] = "info") => {
    setFeedback(text ? { id: `${Date.now()}:${text}`, tone, text } : null);
  };
  const layers = snapshot.layers;
  const active = doc.getActiveLayerIndex();
  const cellCount = useMemo(() => countDocumentCells(snapshot), [snapshot, revision]);
  const locked = layers[active]?.locked === true;
  const symmetry = doc.getGrid().symmetryAxes || [];
  const symmetryKey = symmetry.join(",");
  const manifest = useMemo(() => getStudioAmpManifest() as ReadonlyArray<{ ampId: string; kind: string }>, []);
  // freezeSnapshot omits symmetryAxes; Assist selection needs the live grid axes.
  const assistSnapshot = useMemo(
    () => Object.freeze({ ...snapshot, symmetryAxes: symmetry }),
    [snapshot.checksum, symmetryKey],
  );
  const critique = useMemo(() => critiqueDocument(assistSnapshot), [assistSnapshot]);
  const audit = useMemo(() => auditCanvasPixels(assistSnapshot), [assistSnapshot]);
  const suggestions = useMemo(
    () => selectCanvasAssists({ snapshot: assistSnapshot, critique, manifest }),
    [assistSnapshot, critique, manifest],
  );
  const relevantCount = suggestions.length;
  const dormantCount = manifest.length - relevantCount;
  const stale = preview
    ? assistIsStale({ baseChecksum: preview.proposal.transaction.baseChecksum }, snapshot.checksum)
    : false;
  const ghostStale = useMemo(
    () => isGhostLayerStale(ghostLayer, snapshot.checksum),
    [ghostLayer, snapshot.checksum],
  );
  const guides = overlays.construction ? previewConstructionGuides(snapshot) : [];
  const candidate: CanvasCandidate = preview
    ? { cells: preview.cells, visible: true, mode: "generated-layer" }
    : overlays.audit
      ? {
          cells: audit.isolatedCells.map((cell) => ({ x: cell.x, y: cell.y })),
          visible: true,
          mode: "overlay",
        }
      : null;
  const pendingAssist = preview ? preview.suggestionId : overlays.construction || overlays.audit ? "overlay" : "none";

  useEffect(() => {
    const ids = new Set(suggestions.map((item) => item.id));
    setOverlays((current) => ({
      construction: current.construction && ids.has("construction-guides"),
      audit: current.audit && ids.has("pixel-audit"),
    }));
  }, [suggestions]);

  useEffect(() => () => jobControllerRef.current?.abort(), []);

  const dismissAssist = () => {
    if (!preview) return;
    const current = doc.getSnapshot();
    try {
      const rejected = rejectStudioMutation({
        current,
        transaction: preview.proposal.transaction,
      });
      if (rejected !== current && rejected?.checksum !== current.checksum) {
        onFault("PB-STUDIO-STALE-BASELINE · dismiss identity mismatch");
      }
    } catch (error) {
      const message = (error as Error).message;
      if (!/PB-STUDIO-STALE-BASELINE/.test(message)) onFault(message);
    }
    setPreview(null);
  };

  const previewAssist = async (id: string) => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion || suggestion.kind !== "transform" || !suggestion.ampId) return;
    const controller = new AbortController();
    jobControllerRef.current?.abort();
    jobControllerRef.current = controller;
    setBusy(true);
    setActiveAssistId(id);
    try {
      const current = doc.getSnapshot();
      const proposal = (await proposeStudioMutationExecution({
        ampId: suggestion.ampId,
        snapshot: current,
        options: { signal: controller.signal },
      })) as AssistProposal;
      if (jobControllerRef.current !== controller || controller.signal.aborted) return;
      const cells = cellsFromProposal(proposal);
      onReceipt?.(proposal.receipt);
      setPreview({ suggestionId: id, proposal, cells });
    } catch (error) {
      if (controller.signal.aborted || jobControllerRef.current !== controller) return;
      onFault(`PB-STUDIO-MUTATION-FAULT · ${(error as Error).message}`);
    } finally {
      if (jobControllerRef.current === controller) {
        jobControllerRef.current = null;
        setBusy(false);
      }
    }
  };

  const applyAssist = () => {
    if (!preview) return;
    const current = doc.getSnapshot();
    if (assistIsStale({ baseChecksum: preview.proposal.transaction.baseChecksum }, current.checksum)) {
      announce("Proposal is stale. Regenerate Preview before Apply.", "warning");
      return;
    }
    try {
      const accepted = acceptStudioMutation({
        current,
        transaction: preview.proposal.transaction,
      }) as { data?: unknown; parentChecksum?: string; mutationAmpId?: string };
      doc.installGeneratedOutput(
        accepted.data,
        { ...preview.proposal.receipt, baseChecksum: accepted.parentChecksum },
        { name: `ASSIST/${String(accepted.mutationAmpId)}` },
      );
      setPreview(null);
      onChange();
    } catch (error) {
      onFault((error as Error).message);
      onChange();
    }
  };

  const toggleAssist = (id: string) => {
    setActiveAssistId(id);
    if (id === "construction-guides") {
      setOverlays((current) => ({ ...current, construction: !current.construction }));
      return;
    }
    if (id === "pixel-audit") {
      setOverlays((current) => ({ ...current, audit: !current.audit }));
      return;
    }
    if (id === "symmetry-assist") {
      const axes = doc.getGrid().symmetryAxes || [];
      doc.toggleSymmetry(axes[0] || "vertical");
      onChange();
    }
  };

  const callGhostAmp = async (ampId: string, options?: { element?: string; intensity?: string }) => {
    const elem = (options?.element || flameElement) as "classic" | "holy" | "icy" | "shadow" | "poison";
    const inten = (options?.intensity || ghostIntensity) as "subtle" | "medium" | "intense";
    setGhostBusy(true);
    try {
      const currentSnap = doc.getSnapshot();
      const res = await generateGhostHints(ampId, currentSnap, {
        element: elem,
        intensity: inten,
      });
      setGhostLayer({
        ampId: res.ampId,
        ampName: res.ampName,
        cells: res.cells,
        hintCount: res.hintCount,
        summary: res.summary,
        baseChecksum: res.baseChecksum,
        visible: true,
        opacity: ghostOpacity,
        style: ghostStyle,
        element: elem,
        intensity: inten,
      });
      announce(res.summary, "info");
    } catch (error) {
      onFault(`PB-STUDIO-GHOST-FAULT · ${(error as Error).message}`);
    } finally {
      setGhostBusy(false);
    }
  };

  const adoptGhostToNewLayer = () => {
    if (!ghostLayer || !ghostLayer.cells.length) return;
    try {
      const newLayerName = `${ghostLayer.ampName} Hints`;
      doc.createLayer(newLayerName);
      doc.paint(ghostLayer.cells.map((c) => ({ x: c.x, y: c.y, color: c.color || "#ffaa00" })));
      announce(`Baked ${ghostLayer.cells.length} hint pixels into new layer '${newLayerName}'`, "info");
      setGhostLayer(null);
      onChange();
    } catch (error) {
      onFault((error as Error).message);
    }
  };

  const mergeGhostToActiveLayer = () => {
    if (!ghostLayer || !ghostLayer.cells.length) return;
    if (locked) {
      announce("Layer is locked", "warning");
      return;
    }
    try {
      doc.paint(ghostLayer.cells.map((c) => ({ x: c.x, y: c.y, color: c.color || "#ffaa00" })));
      announce(`Merged ${ghostLayer.cells.length} hint pixels into active layer`, "info");
      setGhostLayer(null);
      onChange();
    } catch (error) {
      onFault((error as Error).message);
    }
  };

  const applyAllDetectedAmps = async (mode: "layers" | "merge" = "layers") => {
    const amps = (snapshot as any)?.detectedAmps || (doc as any).getDetectedAmps?.() || [];
    if (!amps.length) return;
    if (mode === "merge" && locked) {
      announce("Active layer is locked", "warning");
      return;
    }
    setGhostBusy(true);
    announce(
      `Executing and applying all ${amps.length} detected AMP passes (${mode === "merge" ? "merging into active layer" : "baking to new layers"})…`,
      "info",
    );
    try {
      let appliedCount = 0;
      let totalPixels = 0;

      for (const amp of amps) {
        const targetId = amp.manifestId || amp.ampId;
        const currentSnap = doc.getSnapshot();
        const res = await generateGhostHints(targetId, currentSnap, {
          element: flameElement,
          intensity: ghostIntensity,
        });

        if (res && res.cells && res.cells.length > 0) {
          if (mode === "layers") {
            const layerName = `AMP/${amp.shortName || amp.name || targetId}`;
            doc.createLayer(layerName);
            doc.paint(res.cells.map((c: any) => ({ x: c.x, y: c.y, color: c.color || "#ffaa00" })));
          } else {
            doc.paint(res.cells.map((c: any) => ({ x: c.x, y: c.y, color: c.color || "#ffaa00" })));
          }
          appliedCount++;
          totalPixels += res.cells.length;
        }
      }

      setGhostLayer(null);
      onChange();
      announce(
        `Applied all ${appliedCount} active AMP passes (${totalPixels} total hint pixels ${mode === "merge" ? "merged into active layer" : "baked across new layers"}).`,
        "info",
      );
    } catch (error) {
      onFault(`PB-STUDIO-APPLY-ALL-FAULT · ${(error as Error).message}`);
    } finally {
      setGhostBusy(false);
    }
  };

  const refreshGhostHints = () => {
    if (ghostLayer) {
      callGhostAmp(ghostLayer.ampId, { element: flameElement, intensity: ghostIntensity });
    }
  };

  const dismissGhost = () => {
    setGhostLayer(null);
  };

  const toggleGhostVisible = () => {
    setGhostLayer((prev) => (prev ? { ...prev, visible: !prev.visible } : null));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event)) return;
      if (event.key === "Escape") {
        if (preview) {
          event.preventDefault();
          dismissAssist();
          return;
        }
        if (ghostLayer) {
          event.preventDefault();
          dismissGhost();
          return;
        }
      }
      if (event.code === "Space") {
        event.preventDefault();
        setSpacePan(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) doc.redo();
        else doc.undo();
        onChange();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        doc.redo();
        onChange();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "b" || event.key === "B") doc.setTool("paint");
      else if (event.key === "e" || event.key === "E") doc.setTool("erase");
      else if (event.key === "g" || event.key === "G") doc.setTool("fill");
      else if (event.key === "i" || event.key === "I") doc.setTool("pick");
      else if (event.key === "x" || event.key === "X") {
        const fg = doc.getFgColor();
        const bg = doc.getBgColor();
        doc.setFgColor(bg);
        doc.setBgColor(fg);
      } else return;
      onChange();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePan(false);
    };
    const clearSpacePan = () => setSpacePan(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clearSpacePan();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clearSpacePan);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clearSpacePan);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [doc, onChange, preview, ghostLayer]);

  return (
    <section className="pbs-editor pbs-editor--pro" aria-labelledby="pbs-canvas-title">
      <div className="pbs-editor-chrome">
        <h2 id="pbs-canvas-title" className="pbs-editor-title">
          Canvas & Aseprite
        </h2>
        <DocumentBar
          compact
          onNew={() => {
            doc.newDocument();
            onChange();
          }}
          onImport={() => importRef.current?.click()}
          onScdl={() => setScdlOpen(true)}
          onExportPng={() => downloadBytes(encodePng(snapshot), `pixelbrain-${snapshot.width}x${snapshot.height}.png`, "image/png")}
          onExportAseprite={() =>
            downloadBytes(
              encodeAsepriteFromDocument(snapshot),
              `pixelbrain-${snapshot.width}x${snapshot.height}.aseprite`,
              "application/octet-stream",
            )
          }
        />
        <CanvasCommandBar
          tool={doc.getTool()}
          zoom={viewport.zoom}
          gridVisible={gridVisible}
          gridType={String(snapshot.gridType)}
          symmetry={symmetry}
          canUndo={doc.canUndo()}
          canRedo={doc.canRedo()}
          onUndo={() => {
            doc.undo();
            onChange();
          }}
          onRedo={() => {
            doc.redo();
            onChange();
          }}
          onZoomIn={() => {
            const size = measureWorkboard();
            setViewport((current) => stepZoom(current, { x: size.width / 2, y: size.height / 2 }, 1));
          }}
          onZoomOut={() => {
            const size = measureWorkboard();
            setViewport((current) => stepZoom(current, { x: size.width / 2, y: size.height / 2 }, -1));
          }}
          onFit={() => {
            const size = measureWorkboard();
            setViewport(fitViewport({ width: snapshot.width, height: snapshot.height }, size, ZOOM_LADDER, 32));
          }}
          onNative={() => {
            const size = measureWorkboard();
            setViewport({
              zoom: 1,
              panX: (size.width - snapshot.width) / 2,
              panY: (size.height - snapshot.height) / 2,
            });
          }}
          onToggleGrid={() => setGridVisible((value) => !value)}
          onGridType={(value) => {
            doc.setGridType(value);
            onChange();
          }}
          onToggleSymmetry={(axis) => {
            doc.toggleSymmetry(axis);
            onChange();
          }}
        />
      </div>
      <input
        ref={importRef}
        type="file"
        accept=".png,.ase,.aseprite,.scdl,image/png"
        className="sr-only"
        tabIndex={-1}
        aria-label="Import PNG, Aseprite, or SCDL"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const bytes = new Uint8Array(await file.arrayBuffer());
          try {
            if (file.name.endsWith(".ase") || file.name.endsWith(".aseprite")) {
              importAsepriteIntoDocument(doc, bytes);
              onChange();
            } else if (file.name.endsWith(".scdl")) {
              const text = new TextDecoder().decode(bytes);
              const result = ingestScdlIntoDocument(doc, text);
              if (result.ok) {
                const shaderCount = (result as any).detectedShaders?.length || 0;
                announce(
                  `Compiled ${result.assetId} · ${result.receipt.coordinateCount} cells · ${shaderCount} form shaders applied`,
                  "info",
                );
                onChange();
                if (result.primaryDetectedAmp) {
                  const summonTarget = result.primaryDetectedAmp.manifestId || result.primaryDetectedAmp.ampId;
                  callGhostAmp(summonTarget);
                  announce(
                    `Auto-summoned AMP ghost layer: ${result.primaryDetectedAmp.name} (${result.detectedAmps?.length || 0} AMPs detected, ${shaderCount} shaders active)`,
                    "info",
                  );
                }
              } else {
                const first = result.diagnostics[0];
                onFault(`PB-STUDIO-SCDL-COMPILE · ${first?.message || "Compilation failed"}`);
              }
            } else {
              importPngIntoDocument(doc, bytes);
              onChange();
            }
          } catch (error) {
            onFault((error as Error).message);
            onChange();
          }
        }}
      />
      <ScdlIngestionDialog
        open={scdlOpen}
        onOpenChange={setScdlOpen}
        onCompile={(source) => {
          const result = ingestScdlIntoDocument(doc, source);
          if (result.ok) {
            const shaderCount = (result as any).detectedShaders?.length || 0;
            announce(
              `Compiled ${result.assetId} · ${result.receipt.coordinateCount} cells · ${shaderCount} form shaders applied`,
              "info",
            );
            onChange();
            if (result.primaryDetectedAmp) {
              const summonTarget = result.primaryDetectedAmp.manifestId || result.primaryDetectedAmp.ampId;
              callGhostAmp(summonTarget);
              announce(
                `Auto-summoned AMP ghost layer: ${result.primaryDetectedAmp.name} (${result.detectedAmps?.length || 0} AMPs detected, ${shaderCount} shaders active)`,
                "info",
              );
            }
          } else {
            const first = result.diagnostics[0];
            onFault(`PB-STUDIO-SCDL-COMPILE · ${first?.message || "Compilation failed"}`);
          }
          return result;
        }}
      />
      <div className="pbs-editor-body">
        <ToolRail
          tool={doc.getTool()}
          onTool={(tool) => {
            doc.setTool(tool);
            onChange();
          }}
        />
        <div className="pbs-editor-stage">
          <PixelCanvas
            snapshot={snapshot}
            viewport={viewport}
            tool={doc.getTool()}
            fgColor={doc.getFgColor()}
            bgColor={doc.getBgColor()}
            locked={locked}
            spacePan={spacePan}
            gridVisible={gridVisible}
            layerName={layers[active]?.name || "—"}
            guides={guides}
            candidate={candidate}
            ghostLayer={
              ghostLayer && ghostLayer.visible
                ? {
                    cells: ghostLayer.cells,
                    visible: true,
                    opacity: ghostOpacity,
                    ampId: ghostLayer.ampId,
                    ampName: ghostLayer.ampName,
                    style: ghostStyle,
                  }
                : null
            }
            onViewportChange={setViewport}
            onCursor={(cursor) => statusRef.current?.setCursor(cursor)}
            onFeedback={(text) => announce(text, /locked/i.test(text) ? "warning" : "info")}
            onGesture={(cells, mode) => {
              if (!cells.length) return;
              if (locked) {
                announce("Layer is locked", "warning");
                return;
              }
              try {
                announce("");
                if (mode === "erase") doc.erase(cells);
                else if (mode === "background") doc.paint(cells.map((cell) => ({ ...cell, color: doc.getBgColor() })));
                else doc.paint(cells);
                onChange();
              } catch (error) {
                const message = (error as Error).message;
                if (/locked/i.test(message)) announce("Layer is locked", "warning");
                onFault(message);
                onChange();
              }
            }}
            onFill={(x, y) => {
              if (locked) {
                announce("Layer is locked", "warning");
                return;
              }
              try {
                announce("");
                doc.fill(x, y, doc.getFgColor());
                onChange();
              } catch (error) {
                const message = (error as Error).message;
                if (/locked/i.test(message)) announce("Layer is locked", "warning");
                onFault(message);
                onChange();
              }
            }}
            onPick={(_x, _y, hex) => {
              doc.setFgColor(hex);
              onChange();
            }}
          />
          <CanvasFeedback message={feedback} onExpire={() => setFeedback(null)} />
        </div>
        <CanvasInspector
          layers={
            <LayerDock
              layers={layers}
              activeIndex={active}
              onSelect={(index) => {
                doc.setActiveLayer(index);
                onChange();
              }}
              onVisibility={(index) => {
                doc.setLayerVisibility(index, layers[index].visible === false);
                onChange();
              }}
              onLock={(index) => {
                doc.setLayerLocked(index, !layers[index].locked);
                onChange();
              }}
              onOpacity={(index, value) => {
                doc.setLayerOpacityValue(index, value);
                onChange();
              }}
              onRename={(index, name) => {
                try {
                  doc.renameLayer(index, name);
                  onChange();
                } catch (error) {
                  onFault((error as Error).message);
                }
              }}
              onCreate={() => {
                doc.createLayer(`Layer ${layers.length}`);
                onChange();
              }}
              onDuplicate={() => {
                doc.duplicateLayer(active);
                onChange();
              }}
              onDelete={() => {
                try {
                  doc.deleteLayer(active);
                  onChange();
                } catch (error) {
                  onFault((error as Error).message);
                }
              }}
              onReorder={(from, to) => {
                doc.reorderLayers(from, to);
                onChange();
              }}
              onFlatten={() => {
                doc.flatten();
                onChange();
              }}
            />
          }
          palette={
            <IndexedPaletteDock
              heading="Palette"
              palette={snapshot.palette || []}
              fgColor={doc.getFgColor()}
              bgColor={doc.getBgColor()}
              onFg={(color) => {
                doc.setFgColor(color);
                onChange();
              }}
              onBg={(color) => {
                doc.setBgColor(color);
                onChange();
              }}
            />
          }
          ghost={
            <GhostLayerDock
              ghostLayer={ghostLayer}
              detectedAmps={(snapshot as any)?.detectedAmps || (doc as any).getDetectedAmps?.() || []}
              detectedShaders={(snapshot as any)?.detectedShaders || (doc as any).getDetectedShaders?.() || []}
              pipeline={(snapshot as any)?.pipeline || (doc as any).getPipeline?.() || null}
              busy={ghostBusy}
              opacity={ghostOpacity}
              hintStyle={ghostStyle}
              flameElement={flameElement}
              ghostIntensity={ghostIntensity}
              stale={ghostStale}
              onCallAmp={callGhostAmp}
              onApplyAll={applyAllDetectedAmps}
              onOpacity={setGhostOpacity}
              onHintStyle={setGhostStyle}
              onFlameElement={setFlameElement}
              onGhostIntensity={setGhostIntensity}
              onToggleVisible={toggleGhostVisible}
              onAdopt={adoptGhostToNewLayer}
              onMerge={mergeGhostToActiveLayer}
              onDismiss={dismissGhost}
              onRefresh={refreshGhostHints}
            />
          }
          assist={
            <CanvasAssistDock
              suggestions={suggestions}
              activeId={activeAssistId}
              preview={preview ? { suggestionId: preview.suggestionId, stale } : null}
              relevantCount={relevantCount}
              dormantCount={dormantCount}
              busy={busy}
              overlays={overlays}
              symmetry={symmetry}
              onSelect={setActiveAssistId}
              onToggle={toggleAssist}
              onPreview={previewAssist}
              onApply={applyAssist}
              onDismiss={dismissAssist}
              onDeeplink={(tab) => onOpenTab?.(tab)}
            />
          }
          preview={
            <section className="pbs-dock" aria-labelledby="pbs-preview-heading">
              <details open>
                <summary>
                  <h3 id="pbs-preview-heading">Preview</h3>
                </summary>
                <NativePreview snapshot={snapshot} compact />
              </details>
            </section>
          }
        />
      </div>
      <CanvasStatusBar
        ref={statusRef}
        x={null}
        y={null}
        zoom={viewport.zoom}
        color={doc.getFgColor()}
        width={snapshot.width}
        height={snapshot.height}
        gridType={String(snapshot.gridType)}
        layerName={layers[active]?.name || "—"}
        cellCount={cellCount}
        tool={doc.getTool()}
        symmetry={symmetry.length ? symmetry.join(",") : "none"}
        pendingAssist={pendingAssist}
        ghostLabel={ghostLayer && ghostLayer.visible ? `${ghostLayer.ampName} (${Math.round(ghostOpacity * 100)}%)` : undefined}
        feedback={feedback?.text || ""}
      />
    </section>
  );
}

export function Canvas(props: CanvasTabProps) {
  const professionalEnabled = import.meta.env.VITE_PIXELBRAIN_CANVAS_PRO !== "0";
  if (professionalEnabled) return <ProfessionalCanvas {...props} />;
  const { onOpenTab: _onOpenTab, onReceipt: _onReceipt, ...classic } = props;
  return <ClassicCanvas {...classic} />;
}
