/**
 * Aggregate accuracy gate.
 *
 * Every labeled case in the frozen corpus is run through the verifier family
 * that claims it, and through retrieval. A family that produces no findings at
 * all is untested, not precise, and fails here rather than passing silently.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createDefaultRegistry } from "../../../codex/core/immunity/cleri-probe/verifier-registry.js";
import { retrieveCandidates } from "../../../codex/core/immunity/cleri-probe/retrieval.js";
import { compileInvestigationPlan } from "../../../codex/core/immunity/cleri-probe/planner.js";
import {
  AGGREGATE_PRECISION_GATE,
  CORPUS_PREFIX,
  CORPUS_ROOT,
  FAMILY_PRECISION_GATE,
  MANIFEST,
  scoreFamily
} from "./verifiers/verifier-harness.js";

const CANDIDATE_RECALL_GATE = 0.9;

const registry = createDefaultRegistry();
const verifiers = [...registry.verifiers.values()];

const families = [...new Set(MANIFEST.cases.map(item => item.pathologyClass))].sort();

/** One hypothesis per family, phrased the way an operator would phrase it. */
const HYPOTHESES = Object.freeze({
  CONCURRENT_SHARED_STATE_MUTATION: "race condition from concurrent mutation under promise all",
  EMPTY_COLLECTION_TRUTHINESS: "an empty array is truthy so the empty collection branch never fires",
  LEAKED_LISTENER_SUBSCRIPTION: "leaked event listener subscription missing useeffect cleanup",
  SWALLOWED_ERROR: "swallowed error in an empty catch block",
  UNSAFE_EXTERNAL_RESPONSE_ACCESS: "unguarded api response data from fetch",
  UNSEEDED_RANDOMNESS: "unseeded random math random in a deterministic path"
});

function corpusFiles() {
  const paths = [...new Set(MANIFEST.cases.map(item => item.path))].sort();
  return paths.map(relative => ({
    path: `${CORPUS_PREFIX}/${relative}`,
    content: fs.readFileSync(path.join(CORPUS_ROOT, relative), "utf8")
  }));
}

describe("aggregate accuracy gates", () => {
  it("installs a verifier for every labeled family", () => {
    const installed = verifiers.map(verifier => verifier.pathologyClass).sort();
    expect(installed).toEqual(families);
  });

  it("meets the precision gate for every family and in aggregate", () => {
    const scores = verifiers.map(scoreFamily);

    const untested = scores.filter(score => score.precision === null).map(score => score.pathologyClass);
    expect(untested, `families that produced no findings at all are untested: ${untested.join(", ")}`).toEqual([]);

    for (const score of scores) {
      expect(
        score.falsePositives,
        `${score.pathologyClass} verified these hard negatives: ${score.falsePositives.join(", ")}`
      ).toEqual([]);
      expect(
        score.falseNegatives,
        `${score.pathologyClass} missed these labeled positives: ${score.falseNegatives.join(", ")}`
      ).toEqual([]);
      expect(score.precision).toBeGreaterThanOrEqual(FAMILY_PRECISION_GATE);
    }

    const truePositives = scores.reduce((sum, score) => sum + score.truePositives.length, 0);
    const falsePositives = scores.reduce((sum, score) => sum + score.falsePositives.length, 0);
    const aggregate = truePositives / (truePositives + falsePositives);

    expect(aggregate).toBeGreaterThanOrEqual(AGGREGATE_PRECISION_GATE);
  });

  it("nominates the file of every labeled positive in the candidate top set", () => {
    const files = corpusFiles();
    const missed = [];
    let positives = 0;
    let nominated = 0;

    for (const family of families) {
      const plan = compileInvestigationPlan(HYPOTHESES[family], {});
      expect(plan.pathologyClasses, `${family} is unreachable from its hypothesis`).toContain(family);

      const candidates = retrieveCandidates(
        files,
        { hypothesis: HYPOTHESES[family], pathologyClass: family },
        { limit: 50, includeVector: true }
      );
      const nominatedPaths = new Set(candidates.map(candidate => candidate.path));

      for (const item of MANIFEST.cases) {
        if (item.pathologyClass !== family || item.expected !== "VERIFIED") continue;
        positives += 1;
        if (nominatedPaths.has(`${CORPUS_PREFIX}/${item.path}`)) nominated += 1;
        else missed.push(item.id);
      }
    }

    const recall = nominated / positives;
    expect(missed, `retrieval never nominated the files of: ${missed.join(", ")}`).toEqual([]);
    expect(recall).toBeGreaterThanOrEqual(CANDIDATE_RECALL_GATE);
  });

  it("reports a candidate score that is a nomination rank, never a verdict", () => {
    const files = corpusFiles();
    const candidates = retrieveCandidates(
      files,
      { hypothesis: HYPOTHESES.UNSEEDED_RANDOMNESS, pathologyClass: "UNSEEDED_RANDOMNESS" },
      { limit: 50 }
    );

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.score).toBeGreaterThanOrEqual(0);
      expect(candidate.score).toBeLessThanOrEqual(1);
      expect(candidate).not.toHaveProperty("verdict");
    }
  });
});
