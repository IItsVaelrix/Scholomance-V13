/**
 * receipt.test.ts — Defold Bridge Design §"Testing / defold-bridge"
 *
 * Covers:
 *   - Receipt minting from Defold claims.
 *   - Receipt comparison detects divergence.
 *   - Malformed claim rejection (never best-effort).
 *   - Cross-engine receipt equality: Pixi vs Defold for one sealed packet.
 */

import { describe, it, expect } from "vitest";
import {
  parseDefoldClaim,
  mintDefoldReceipt,
  crossEngineReceiptsEqual,
  type DefoldRawClaim,
} from "../src/receipt.js";
import { mintReceipt, toResolvedAssetLedgerEntry } from "@polaris/scene-packet";

const SEAL = "plan1:" + "a".repeat(64);

function makeRawClaim(overrides: Partial<DefoldRawClaim> = {}): DefoldRawClaim {
  return {
    seal: SEAL,
    engine: "defold",
    mode: "illustrated",
    resolvedAssets: [
      {
        requestedAssetKey: "entities/lantern",
        source: "GLYPH",
      },
    ],
    ...overrides,
  };
}

describe("parseDefoldClaim", () => {
  it("parses a valid claim", () => {
    const claim = parseDefoldClaim(makeRawClaim());
    expect(claim.seal).toBe(SEAL);
    expect(claim.engine).toBe("defold");
    expect(claim.mode).toBe("illustrated");
    expect(claim.resolvedAssets).toHaveLength(1);
    expect(claim.resolvedAssets[0].source).toBe("GLYPH");
  });

  it("fills null for absent optional asset fields", () => {
    const claim = parseDefoldClaim(makeRawClaim());
    expect(claim.resolvedAssets[0].packetId).toBeNull();
    expect(claim.resolvedAssets[0].packetContentHash).toBeNull();
    expect(claim.resolvedAssets[0].rasterHash).toBeNull();
    expect(claim.resolvedAssets[0].pngRevision).toBeNull();
  });

  it("preserves provided asset facts", () => {
    const claim = parseDefoldClaim(makeRawClaim({
      resolvedAssets: [{
        requestedAssetKey: "entities/lantern",
        source: "PIXELBRAIN",
        packetId: "pkt_1",
        packetContentHash: "pb1:abc",
        rasterHash: "pbr1:def",
      }],
    }));
    expect(claim.resolvedAssets[0].packetId).toBe("pkt_1");
    expect(claim.resolvedAssets[0].packetContentHash).toBe("pb1:abc");
  });

  it("throws on invalid seal", () => {
    expect(() => parseDefoldClaim(makeRawClaim({ seal: "bad" }))).toThrow(/Invalid seal/);
    expect(() => parseDefoldClaim(makeRawClaim({ seal: "" }))).toThrow(/Invalid seal/);
  });

  it("throws on wrong engine", () => {
    expect(() => parseDefoldClaim(makeRawClaim({ engine: "pixi" as "defold" }))).toThrow(/Expected engine/);
  });

  it("throws on invalid mode", () => {
    expect(() => parseDefoldClaim(makeRawClaim({ mode: "bad" as "illustrated" }))).toThrow(/Invalid mode/);
  });

  it("throws on invalid asset source", () => {
    expect(() => parseDefoldClaim(makeRawClaim({
      resolvedAssets: [{ requestedAssetKey: "x", source: "INVALID" }],
    }))).toThrow(/Invalid asset source/);
  });
});

describe("mintDefoldReceipt", () => {
  it("produces a render1: receipt", () => {
    const receipt = mintDefoldReceipt(makeRawClaim());
    expect(receipt.renderHash).toMatch(/^render1:[0-9a-f]{64}$/);
    expect(receipt.engine).toBe("defold");
  });

  it("is deterministic", () => {
    const a = mintDefoldReceipt(makeRawClaim());
    const b = mintDefoldReceipt(makeRawClaim());
    expect(a.renderHash).toBe(b.renderHash);
  });
});

describe("crossEngineReceiptsEqual", () => {
  it("returns true when both engines resolve identical assets in the same mode", () => {
    // Both engines report the same seal, same mode, same resolved assets.
    // The engine field differs (pixi vs defold), so receipts differ by design.
    // Cross-engine equality requires the SAME engine field — this tests the
    // case where both claims use engine="defold" (e.g. two Defold instances).
    const a = mintDefoldReceipt(makeRawClaim());
    const b = mintDefoldReceipt(makeRawClaim());
    expect(crossEngineReceiptsEqual(a, b)).toBe(true);
  });

  it("returns false when resolved assets diverge", () => {
    const a = mintDefoldReceipt(makeRawClaim());
    const b = mintDefoldReceipt(makeRawClaim({
      resolvedAssets: [{ requestedAssetKey: "entities/brazier", source: "GLYPH" }],
    }));
    expect(crossEngineReceiptsEqual(a, b)).toBe(false);
  });

  it("returns false when mode diverges", () => {
    const a = mintDefoldReceipt(makeRawClaim({ mode: "illustrated" }));
    const b = mintDefoldReceipt(makeRawClaim({ mode: "fallback" }));
    expect(crossEngineReceiptsEqual(a, b)).toBe(false);
  });

  it("pixi vs defold with same assets: receipts differ (engine is in the hash)", () => {
    const defoldReceipt = mintDefoldReceipt(makeRawClaim());
    const pixiReceipt = mintReceipt({
      seal: SEAL,
      engine: "pixi",
      mode: "illustrated",
      resolvedAssets: [toResolvedAssetLedgerEntry("entities/lantern", "GLYPH")],
    });
    // Engine field is folded into the hash — pixi ≠ defold by design.
    // This is intentional: the receipt identifies WHICH engine drew it.
    expect(crossEngineReceiptsEqual(defoldReceipt, pixiReceipt)).toBe(false);
  });
});
