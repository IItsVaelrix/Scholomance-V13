import { useRef, useState } from "react";
import { Cpu, ShieldCheck } from "lucide-react";
import { createDocumentController } from "@/lib/pixelbrain/studio-document.js";
import { evaluateForgeGate } from "@/lib/pixelbrain/studio-authoring-facade.js";
import { StudioTabBar } from "./StudioTabBar";
import { normalizeStudioTab } from "./studio-tabs.js";
import { AmpConveyor } from "./tabs/AmpConveyor";
import { Blueprint } from "./tabs/Blueprint";
import { Canvas } from "./tabs/Canvas";
import { Diagnostics } from "./tabs/Diagnostics";
import { Finish } from "./tabs/Finish";
import { Foundry } from "./tabs/Foundry";
import { LibraryTab } from "./tabs/Library";
import { Mentor } from "./tabs/Mentor";
import { MutationLab } from "./tabs/MutationLab";

type PixelBrainStudioProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

export function PixelBrainStudio({ activeTab, onTabChange }: PixelBrainStudioProps) {
  const tab = normalizeStudioTab(activeTab);
  const controllerRef = useRef<ReturnType<typeof createDocumentController> | null>(null);
  if (!controllerRef.current) controllerRef.current = createDocumentController();
  const controller = controllerRef.current;
  const [, setTick] = useState(0);
  const bump = () => setTick((value) => value + 1);
  const snapshot = controller.getSnapshot() as Record<string, unknown>;
  const receipts = controller.getReceipts() as ReadonlyArray<Record<string, unknown>>;
  const faults = controller.getFaults() as ReadonlyArray<Record<string, unknown>>;
  const events = controller.getEvents() as ReadonlyArray<Record<string, unknown>>;
  const [gate, setGate] = useState<ReturnType<typeof evaluateForgeGate> | null>(null);

  const recordFault = (message: string, kind = "fault") => {
    controller.recordFault({
      family: message.startsWith("PB-STUDIO-") ? message.split(" · ")[0] : "PB-STUDIO-EDITOR-INPUT",
      message,
      kind,
      at: `fault-${controller.getRevision()}`,
    } as never);
    bump();
  };

  const recordReceipt = (receipt: Record<string, unknown>) => {
    controller.recordReceipt(receipt);
    bump();
  };

  return (
    <main className="pbs-shell">
      <header className="pbs-shell-header">
        <div className="pbs-brand">
          <span className="pbs-brand-mark">
            <Cpu size={18} aria-hidden="true" />
          </span>
          <div>
            <p>SWARD / PIXELBRAIN</p>
            <h1>Studio</h1>
          </div>
        </div>
        <div className="pbs-snapshot-badge">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>REV {String(snapshot.revision ?? 0)}</span>
          <code>{String(snapshot.checksum)}</code>
        </div>
      </header>
      <StudioTabBar activeTab={tab} onSelect={onTabChange} />
      <div id={`pbs-panel-${tab}`} role="tabpanel" aria-labelledby={`pbs-tab-${tab}`} tabIndex={0}>
        {tab === "canvas" && (
          <Canvas
            document={controller}
            revision={Number(snapshot.revision ?? 0)}
            onChange={bump}
            onFault={recordFault}
            onReceipt={recordReceipt}
            onOpenTab={onTabChange}
          />
        )}
        {tab === "blueprint" && (
          <Blueprint
            document={controller}
            onChange={() => {
              setGate(evaluateForgeGate({ snapshot: controller.getSnapshot() }));
              bump();
            }}
            onFault={recordFault}
          />
        )}
        {tab === "foundry" && (
          <Foundry
            onUseInCanvas={(result, mode) => {
              const payload = {
                field: result.field,
                palette: result.palette,
                width: result.width,
                height: result.height,
              };
              if (mode === "document") {
                controller.newDocument({ width: result.width, height: result.height });
                controller.installGeneratedOutput(
                  payload,
                  {
                    baseChecksum: controller.getSnapshot().checksum,
                    ampId: "grass",
                    outputChecksum: `grass-${result.diagnostics.seed}`,
                  },
                  { name: "Foundry/Sward" },
                );
              } else {
                controller.installGeneratedOutput(
                  payload,
                  { baseChecksum: controller.getSnapshot().checksum, ampId: "grass", outputChecksum: `grass-${result.diagnostics.seed}` },
                  { name: "Foundry/Sward" },
                );
              }
              bump();
            }}
          />
        )}
        {tab === "amps" && (
          <AmpConveyor
            snapshot={snapshot}
            onCommit={(result) => {
              try {
                controller.installGeneratedOutput(result.output, result.receipt, {
                  name: `AMP/${String(result.receipt.ampId)}`,
                });
              } catch (error) {
                recordFault((error as Error).message);
              }
              bump();
            }}
            onReceipt={recordReceipt}
            onFault={recordFault}
          />
        )}
        {tab === "mutations" && (
          <MutationLab
            snapshot={snapshot}
            onAccept={(accepted, receipt) => {
              try {
                controller.installGeneratedOutput(accepted, {
                  ...(receipt || {}),
                  baseChecksum: accepted.parentChecksum,
                  ampId: accepted.mutationAmpId,
                  outputChecksum: accepted.checksum,
                }, { name: `MUT/${String(accepted.mutationAmpId || "mutation")}` });
              } catch (error) {
                recordFault((error as Error).message);
              }
              bump();
            }}
            onReceipt={recordReceipt}
            onFault={recordFault}
            onReject={(message) => recordFault(message, "rejection")}
          />
        )}
        {tab === "finish" && <Finish document={controller} onChange={bump} onFault={recordFault} />}
        {tab === "mentor" && <Mentor document={controller} />}
        {tab === "library" && <LibraryTab document={controller} onChange={bump} onFault={recordFault} />}
        {tab === "diagnostics" && (
          <Diagnostics snapshot={snapshot} receipts={receipts} faults={faults} events={events} gate={gate} />
        )}
      </div>
      <footer className="pbs-shell-footer">
        <span>PB-STUDIO-PORT-v2</span>
        <span>browser-local · deterministic · no telemetry</span>
      </footer>
    </main>
  );
}
