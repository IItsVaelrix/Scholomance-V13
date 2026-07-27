import { describe, expect, it } from "vitest";
import {
  createDiagnostic,
  verifyDiagnosticChecksum,
} from "@polaris/pixelbrain-bridge";

describe("PB-ERR-v1 bridge diagnostics", () => {
  it("emits checksum-valid grid-alignment diagnostics", () => {
    const diagnostic = createDiagnostic("INVALID_GRID_ALIGNMENT", "ERROR", {
      packetId: "lantern",
      path: "coordinates[0].snappedX",
      detail: "3 is not aligned to cellSize 2",
    });

    expect(diagnostic.protocol).toBe("PB-ERR-v1");
    expect(diagnostic.bytecode).toMatch(
      /^PB-ERR-v1-COORD-CRIT-IMGPIX-0601-/,
    );
    expect(verifyDiagnosticChecksum(diagnostic.bytecode)).toBe(true);
  });

  it("marks warning diagnostics as WARN", () => {
    const diagnostic = createDiagnostic("COORDINATE_OUT_OF_RANGE", "WARNING", {
      detail: "cell was clipped at the right edge",
    });

    expect(diagnostic.bytecode).toContain("-WARN-");
    expect(verifyDiagnosticChecksum(diagnostic.bytecode)).toBe(true);
  });

  it("detects bytecode tampering", () => {
    const diagnostic = createDiagnostic(
      "PACKET_SCHEMA_INVALID",
      "ERROR",
      { detail: "invalid packet" },
    );

    expect(
      verifyDiagnosticChecksum(`${diagnostic.bytecode.slice(0, -1)}0`),
    ).toBe(false);
  });
});
