import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceStandaloneSnapshot,
  appendStudioLedger,
  createStandaloneSnapshot,
  installAcceptedMutation,
} from "../src/lib/pixelbrain/studio-state.js";

test("standalone state starts from a frozen browser-local snapshot", () => {
  const snapshot = createStandaloneSnapshot();
  assert.equal(snapshot.width, 32);
  assert.equal(snapshot.height, 32);
  assert.equal(snapshot.source, "standalone-browser");
  assert.match(snapshot.checksum, /^studio-output1:/);
  assert.ok(Object.isFrozen(snapshot));
});

test("a commit advances snapshot lineage without mutating the previous snapshot", () => {
  const current = createStandaloneSnapshot();
  const receipt = Object.freeze({
    contract: "PB-STUDIO-AMP-RECEIPT-v1",
    ampId: "grass-amp",
    baseChecksum: current.checksum,
    outputChecksum: "studio-output1:next",
  });
  const next = advanceStandaloneSnapshot(current, { coordinates: [{ x: 1, y: 1 }] }, receipt);
  assert.notEqual(next, current);
  assert.equal(next.parentChecksum, current.checksum);
  assert.equal(next.checksum, receipt.outputChecksum);
  assert.equal(next.lastAmpId, "grass-amp");
  assert.equal(current.parentChecksum, undefined);
  assert.throws(
    () => advanceStandaloneSnapshot(current, {}, { ...receipt, baseChecksum: "stale" }),
    /STALE-BASELINE/,
  );
});

test("accepted mutations install the candidate and preserve lineage", () => {
  const current = createStandaloneSnapshot();
  const accepted = Object.freeze({
    checksum: "studio-output1:mutation",
    parentChecksum: current.checksum,
    mutationAmpId: "symmetry-amp",
    data: { coordinates: [{ x: 3, y: 3 }] },
  });
  const installed = installAcceptedMutation(current, accepted);
  assert.equal(installed.checksum, accepted.checksum);
  assert.equal(installed.parentChecksum, current.checksum);
  assert.equal(installed.width, current.width);
  assert.equal(installed.height, current.height);
  assert.ok(Object.isFrozen(installed));
});

test("receipt and fault ledgers are immutable newest-first rings capped at 20", () => {
  let ledger = Object.freeze([]);
  for (let index = 0; index < 25; index += 1) {
    const before = ledger;
    ledger = appendStudioLedger(ledger, { index });
    assert.notEqual(ledger, before);
    assert.ok(Object.isFrozen(ledger));
  }
  assert.equal(ledger.length, 20);
  assert.equal(ledger[0].index, 24);
  assert.equal(ledger[19].index, 5);
});
