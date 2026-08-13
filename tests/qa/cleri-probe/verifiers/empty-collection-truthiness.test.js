import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyCollectionTruthinessVerifier } from "../../../../codex/core/immunity/cleri-probe/verifiers/empty-collection-truthiness.verifier.js";
import {
  HOSTILE_SOURCES,
  assertFamilyGate,
  assertStableAndBounded,
  predicateMap,
  verify,
  verifiedLines
} from "./verifier-harness.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, "../../fixtures/cleri-probe/empty-collection-truthiness");
const read = name => fs.readFileSync(path.join(fixtures, name), "utf8");

const MODULE = "codex/core/constellation/compose.js";

describe("empty collection truthiness verifier", () => {
  it("verifies a bare negation of a lexicon lookup the same function measures by length", () => {
    const result = verify(emptyCollectionTruthinessVerifier, {
      path: MODULE,
      source: `
function atomsFor(token, index, posMap) {
  const known = posMap.get(token);
  const out = [];
  if (known && known.length > 0) known.forEach(tag => out.push(tag));
  if (index > 0 && !known) out.push('PROPN');
  return out;
}
`
    });

    expect(result.verdict).toBe("VERIFIED");
    expect(verifiedLines(result)).toEqual([6]);

    const predicates = predicateMap(result.findings[0]);
    expect(predicates.BINDING_IS_PROVEN_COLLECTION).toBe(true);
    expect(predicates.BINDING_TESTED_BY_BARE_NEGATION).toBe(true);
    expect(predicates.SAME_FUNCTION_TESTS_BINDING_BY_SIZE).toBe(true);
    expect(predicates.SIZE_READ_IN_SAME_GUARD).toBe(false);
    expect(predicates.GUARD_IS_A_NULLISH_BAILOUT).toBe(false);
  });

  it("verifies a bare negation of an array proven by an array-only method", () => {
    const result = verify(emptyCollectionTruthinessVerifier, {
      path: MODULE,
      source: `
function rank(index, query) {
  const matches = index.lookup(query);
  const scored = matches.map(match => match.score);
  const ranked = matches.length >= 3 ? scored : scored.slice(0, 1);
  const notes = [];
  if (!matches) notes.push('empty');
  return { ranked, notes };
}
`
    });
    expect(result.verdict).toBe("VERIFIED");
    expect(verifiedLines(result)).toEqual([7]);
  });

  it("reports one finding per line when a nested test emits several guards", () => {
    const result = verify(emptyCollectionTruthinessVerifier, {
      path: MODULE,
      source: `
function atomsFor(token, index, posMap, isClosedClass) {
  const known = posMap.get(token);
  const out = [];
  if (known && known.length > 0) known.forEach(tag => out.push(tag));
  if (index > 0 || (!known && !isClosedClass)) out.push('PROPN');
  return out;
}
`
    });
    expect(verifiedLines(result)).toEqual([6]);
  });

  describe("counterchecks", () => {
    it("returns NO_FINDING when the same test also reads the length", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: MODULE,
        source: `
function applyChaikin(points) {
  if (!points || points.length < 3) return points ? [...points] : [];
  return points.map(point => ({ ...point }));
}
`
      });
      expect(result.verdict).toBe("NO_FINDING");
    });

    it("returns NO_FINDING when the negation guards a bail-out", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: MODULE,
        source: `
function loadRows(source) {
  const rows = source.query();
  if (!rows) return null;
  if (rows.length === 0) return [];
  return rows.map(row => row.value);
}
`
      });
      expect(result.verdict).toBe("NO_FINDING");
    });

    it("returns NO_FINDING for the repaired optional-length shape", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: MODULE,
        source: `
function atomsFor(token, index, posMap) {
  const known = posMap.get(token);
  const out = [];
  if (known && known.length > 0) known.forEach(tag => out.push(tag));
  if (index > 0 && !known?.length) out.push('PROPN');
  return out;
}
`
      });
      expect(result.verdict).toBe("NO_FINDING");
    });

    it("returns NO_FINDING for an adjacent IMMUNE_ALLOW annotation", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: MODULE,
        source: `
function atomsFor(token, index, posMap) {
  const known = posMap.get(token);
  const out = [];
  if (known && known.length > 0) known.forEach(tag => out.push(tag));
  // IMMUNE_ALLOW: empty-collection-truthiness — posMap never stores an empty row, reviewed 2026-08-13
  if (index > 0 && !known) out.push('PROPN');
  return out;
}
`
      });
      expect(result.verdict).toBe("NO_FINDING");
    });
  });

  describe("what the verifier refuses to prove", () => {
    it("reports nothing for a string, where a bare negation is the right test", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: MODULE,
        source: `
function summarize(text) {
  if (!text && text.length !== 0) return '';
  return text.length > 40 ? text.slice(0, 40) : text;
}
`
      });
      expect(result.verdict).toBe("NO_FINDING");
    });

    it("reports nothing when no test in the function measures the binding", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: MODULE,
        source: `
function atomsFor(token, posMap) {
  const known = posMap.get(token);
  const out = [];
  if (known) known.forEach(tag => out.push(tag));
  if (!known) out.push('PROPN');
  return out;
}
`
      });
      expect(result.verdict).toBe("NO_FINDING");
    });

    it("reports nothing when the size test lives in another function", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: MODULE,
        source: `
const shared = [];

function measure() {
  return shared.length > 0 ? shared.length : 0;
}

function decide(flag) {
  const out = [];
  if (flag && !shared) out.push('PROPN');
  return out;
}
`
      });
      expect(result.verdict).toBe("NO_FINDING");
    });
  });

  describe("corpus fixtures", () => {
    it("verifies every positive in the frozen corpus", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: "tests/qa/fixtures/cleri-probe/empty-collection-truthiness/verified.js",
        source: read("verified.js")
      });
      expect(result.verdict).toBe("VERIFIED");
      expect(verifiedLines(result)).toEqual([15, 27]);
    });

    it("reports no finding for any hard negative in the frozen corpus", () => {
      const result = verify(emptyCollectionTruthinessVerifier, {
        path: "tests/qa/fixtures/cleri-probe/empty-collection-truthiness/hard-negative.js",
        source: read("hard-negative.js")
      });
      expect(result.verdict).toBe("NO_FINDING");
    });

    it("meets its labeled precision gate", () => {
      const score = assertFamilyGate(emptyCollectionTruthinessVerifier);
      expect(score.precision).toBe(1);
      expect(score.recall).toBe(1);
    });
  });

  describe("robustness", () => {
    it("survives hostile and unsupported syntax without throwing", () => {
      for (const hostile of HOSTILE_SOURCES) {
        const result = verify(emptyCollectionTruthinessVerifier, hostile);
        expect(["VERIFIED", "NO_FINDING"]).toContain(result.verdict);
      }
    });

    it("tolerates a candidate with no facts", () => {
      const result = emptyCollectionTruthinessVerifier.verify(
        { path: MODULE, span: null, facts: null },
        { pathologyClass: "EMPTY_COLLECTION_TRUTHINESS" }
      );
      expect(result.verdict).toBe("NO_FINDING");
    });

    it("is byte-identical across 25 repetitions and within its fixture budget", () => {
      assertStableAndBounded(emptyCollectionTruthinessVerifier, {
        path: "tests/qa/fixtures/cleri-probe/empty-collection-truthiness/verified.js",
        source: read("verified.js")
      });
    });
  });
});
