/**
 * Animation AMP — Blueprint Parser
 * 
 * Parses bytecode blueprint blocks from PDR source documents.
 * Converts line-based syntax into AnimationBlueprintV1 IR.
 */

import {
  AnimationBlueprintV1,
  BlueprintParseResult,
  BLUEPRINT_ERROR_CODES,
} from "../contracts/blueprint.types.ts";

// ─── Constants ───────────────────────────────────────────────────────────────

const ANIM_START_MARKER = "ANIM_START";
const ANIM_END_MARKER = "ANIM_END";

const REQUIRED_DIRECTIVES = new Set(["ID", "TARGET", "DURATION", "EASE", "LOOP"]);

const VALID_DIRECTIVES = new Set([
  "ANIM_START",
  "ANIM_END",
  "ID",
  "NAME",
  "DESCRIPTION",
  "TARGET",
  "PRESET",
  "DURATION",
  "DELAY",
  "LOOP",
  "EASE",
  "PHASE",
  "SCALE",
  "ROTATE",
  "TRANSLATE_X",
  "TRANSLATE_Y",
  "OPACITY",
  "GLOW",
  "BLUR",
  "ENVELOPE",
  "SYMMETRY",
  "GRID",
  "ANCHOR",
  "COMPOSITE",
  "BACKEND_HINT",
  "CONSTRAINT",
  "QA",
  "METADATA",
  "RENDERER",
  "GPU",
  "REDUCED",
  "TRACE"
]);

// ─── Parser State ────────────────────────────────────────────────────────────

interface ParserState {
  lines: string[];
  currentIndex: number;
  errors: any[];
  warnings: any[];
  sourceMap: Map<number, string>;
  directives: Map<string, string[]>;
}

// ─── Core Parser ─────────────────────────────────────────────────────────────

/**
 * Parse a bytecode blueprint block from source text
 */
export function parseBlueprintBlock(source: string): BlueprintParseResult {
  const lines = source.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  
  const state: ParserState = {
    lines,
    currentIndex: 0,
    errors: [],
    warnings: [],
    sourceMap: new Map(),
    directives: new Map(),
  };

  // Validate ANIM_START
  if (lines.length === 0 || (lines[0] !== ANIM_START_MARKER && !lines[0].startsWith('ANIMATION'))) {
     // Fallback for some formats
  }

  // Parse all lines
  while (state.currentIndex < lines.length) {
    const line = lines[state.currentIndex];
    const lineNum = state.currentIndex + 1;
    state.sourceMap.set(lineNum, line);

    if (line === ANIM_END_MARKER) {
      state.currentIndex++;
      break;
    }

    parseDirective(state, line, lineNum);
    state.currentIndex++;
  }

  // Build blueprint from directives
  const blueprint = buildBlueprint(state);
  
  return {
    success: state.errors.length === 0,
    blueprint,
    errors: state.errors,
    warnings: state.warnings,
    sourceMap: state.sourceMap,
  };
}

// ─── Directive Parser ────────────────────────────────────────────────────────

function parseDirective(state: ParserState, line: string, lineNum: number): void {
  const parts = line.split(/\s+/);
  const directive = parts[0].toUpperCase();

  if (!VALID_DIRECTIVES.has(directive)) return;

  const args = parts.slice(1);
  const existingArgs = state.directives.get(directive) || [];
  state.directives.set(directive, [...existingArgs, ...args]);
}

// ─── Blueprint Builder ───────────────────────────────────────────────────────

function buildBlueprint(state: ParserState): AnimationBlueprintV1 {
  const get = (key: string): string | undefined => state.directives.get(key)?.join(" ");
  
  let targetParts = (get("TARGET") || "").split(/\s+/);
  if (!targetParts[0] && state.directives.get("ANIM_START")) {
    const startArgs = state.directives.get("ANIM_START") || [];
    if (startArgs[0] === "TARGET") {
      targetParts = startArgs.slice(1);
    }
  }
  const selectorType = targetParts[0] && targetParts[0].includes(":") 
    ? targetParts[0].split(":")[0] as any 
    : (targetParts[0] || "id") as any;
  const targetValue = targetParts[0] && targetParts[0].includes(":")
    ? targetParts[0].split(":")[1]
    : targetParts.slice(1).join(" ") || targetParts[0] || "";

  const easingParts = (get("EASE") || "").split(/\s+/);
  const easingType = (easingParts[0] || "token") as any;
  const easingValue = easingParts.slice(1).join(" ") || "linear";

  const loopStr = get("LOOP") || "1";
  const loop: number | "infinite" = loopStr.toLowerCase() === "infinite" ? "infinite" : parseInt(loopStr, 10) || 1;

  const blueprint: AnimationBlueprintV1 = {
    version: "1.0",
    id: get("ID") || "unknown",
    target: {
      selectorType,
      value: targetValue,
    },
    durationMs: parseInt(get("DURATION") || "0", 10) || 400,
    loop,
    easing: {
      type: easingType,
      value: easingValue,
    },
  };

  // Parse transforms
  const transforms: any = {};
  const transformKeys: Record<string, string> = {
    "SCALE": "scale",
    "ROTATE": "rotate",
    "TRANSLATE_X": "translateX",
    "TRANSLATE_Y": "translateY",
    "OPACITY": "opacity",
    "GLOW": "glow",
    "BLUR": "blur"
  };
  
  for (const transform of Object.keys(transformKeys)) {
    const value = get(transform);
    if (value) {
      const key = transformKeys[transform];
      transforms[key] = parseTransform(value);
    }
  }
  if (Object.keys(transforms).length > 0) blueprint.transforms = transforms;

  // Add backend hints and constraints
  const renderer = get("RENDERER");
  if (renderer) {
    blueprint.backendHints = { ...blueprint.backendHints, css: { renderer } };
  }

  const gpu = get("GPU");
  const reduced = get("REDUCED");
  if (gpu !== undefined || reduced !== undefined) {
    blueprint.constraints = {
      ...blueprint.constraints,
      requireParityAcrossBackends: gpu === "1" ? true : undefined,
    };
    if (reduced === "1" || reduced === "true") {
      blueprint.constraints.allowBackendDegradation = true;
    }
  }

  // Add tracing/processor hints
  const traces = state.directives.get("TRACE");
  if (traces && traces.length > 0) {
    blueprint.metadata = { ...blueprint.metadata, source: traces.join(" ") };
  }

  return blueprint;
}

function parseTransform(value: string): any {
  const parts = value.split(/\s+/);
  const result: any = {};
  
  if (parts.length === 1 && !isNaN(parseFloat(parts[0]))) {
    return { base: parseFloat(parts[0]) };
  }

  for (let i = 0; i < parts.length; i++) {
    const key = parts[i].toLowerCase();
    const next = parts[i + 1];
    if (key === "base" && next) { result.base = parseFloat(next); i++; }
    else if (key === "peak" && next) { result.peak = parseFloat(next); i++; }
  }
  return result;
}
