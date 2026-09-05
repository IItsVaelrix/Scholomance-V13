import { createStudioAssetSnapshot } from "./studio-facade.js";

export const STUDIO_LEDGER_LIMIT = 20;

export function createStandaloneSnapshot() {
  return createStudioAssetSnapshot(
    {
      width: 32,
      height: 32,
      gridType: "rectangular",
      cellSize: 1,
      palette: [],
      layers: [],
    },
    "standalone-browser",
  );
}

export function advanceStandaloneSnapshot(current, output, receipt) {
  if (!current?.checksum || receipt?.baseChecksum !== current.checksum) {
    throw new Error("PB-STUDIO-STALE-BASELINE");
  }
  if (!receipt?.outputChecksum) {
    throw new Error("PB-STUDIO-OUTPUT-CHECKSUM-REQUIRED");
  }
  return Object.freeze({
    ...current,
    data: output,
    parentChecksum: current.checksum,
    checksum: receipt.outputChecksum,
    lastAmpId: receipt.ampId,
  });
}

export function installAcceptedMutation(current, accepted) {
  if (!current?.checksum || accepted?.parentChecksum !== current.checksum) {
    throw new Error("PB-STUDIO-STALE-BASELINE");
  }
  return Object.freeze({ ...current, ...accepted });
}

export function appendStudioLedger(ledger, entry) {
  return Object.freeze(
    [Object.freeze({ ...entry }), ...(ledger || [])].slice(0, STUDIO_LEDGER_LIMIT),
  );
}
