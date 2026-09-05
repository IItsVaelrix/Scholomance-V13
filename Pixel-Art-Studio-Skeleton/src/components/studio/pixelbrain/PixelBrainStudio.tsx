import { useRef, useState } from "react";
import { Cpu, ShieldCheck } from "lucide-react";
import {
  advanceStandaloneSnapshot,
  appendStudioLedger,
  createStandaloneSnapshot,
  installAcceptedMutation,
} from "@/lib/pixelbrain/studio-state.js";
import { StudioTabBar } from "./StudioTabBar";
import { normalizeStudioTab } from "./studio-tabs.js";
import { AmpConveyor } from "./tabs/AmpConveyor";
import { Diagnostics } from "./tabs/Diagnostics";
import { Foundry } from "./tabs/Foundry";
import { MutationLab } from "./tabs/MutationLab";

type PixelBrainStudioProps = {
  activeTab: string;
  onTabChange: (tab: string) => void;
};

export function PixelBrainStudio({ activeTab, onTabChange }: PixelBrainStudioProps) {
  const tab = normalizeStudioTab(activeTab);
  const [snapshot, setSnapshot] = useState<Record<string, unknown>>(() =>
    createStandaloneSnapshot(),
  );
  const [receipts, setReceipts] = useState<ReadonlyArray<Record<string, unknown>>>(
    Object.freeze([]),
  );
  const [faults, setFaults] = useState<ReadonlyArray<Record<string, unknown>>>(Object.freeze([]));
  const evidenceSequence = useRef(0);

  const recordReceipt = (receipt: Record<string, unknown>) => {
    setReceipts((current) => appendStudioLedger(current, receipt));
  };
  const recordFault = (message: string, kind = "fault") => {
    evidenceSequence.current += 1;
    setFaults((current) =>
      appendStudioLedger(current, {
        at: `${kind}-${evidenceSequence.current}`,
        kind,
        message,
      }),
    );
  };
  const commit = (result: { output: unknown; receipt: Record<string, unknown> }) => {
    try {
      setSnapshot((current) => advanceStandaloneSnapshot(current, result.output, result.receipt));
    } catch (error) {
      recordFault(`PB-STUDIO-SNAPSHOT-FAULT · ${(error as Error).message}`);
    }
  };
  const acceptMutation = (accepted: Record<string, unknown>) => {
    try {
      setSnapshot((current) => installAcceptedMutation(current, accepted));
    } catch (error) {
      recordFault(`PB-STUDIO-SNAPSHOT-FAULT · ${(error as Error).message}`);
    }
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
          <span>IMMUTABLE SNAPSHOT</span>
          <code>{String(snapshot.checksum)}</code>
        </div>
      </header>
      <StudioTabBar activeTab={tab} onSelect={onTabChange} />
      <div id={`pbs-panel-${tab}`} role="tabpanel" aria-labelledby={`pbs-tab-${tab}`} tabIndex={0}>
        {tab === "foundry" && <Foundry />}
        {tab === "amps" && (
          <AmpConveyor
            snapshot={snapshot}
            onCommit={commit}
            onReceipt={recordReceipt}
            onFault={recordFault}
          />
        )}
        {tab === "mutations" && (
          <MutationLab
            snapshot={snapshot}
            onAccept={acceptMutation}
            onReceipt={recordReceipt}
            onFault={recordFault}
            onReject={(message) => recordFault(message, "rejection")}
          />
        )}
        {tab === "diagnostics" && (
          <Diagnostics snapshot={snapshot} receipts={receipts} faults={faults} />
        )}
      </div>
      <footer className="pbs-shell-footer">
        <span>PB-STUDIO-PORT-v1</span>
        <span>browser-local · deterministic · no telemetry</span>
      </footer>
    </main>
  );
}
