export const PHASE_A_STUDIO_TABS = Object.freeze([
  Object.freeze({
    id: "foundry",
    label: "Foundry",
    shortLabel: "Foundry",
    description: "Grow deterministic seamless pixel fields.",
  }),
  Object.freeze({
    id: "amps",
    label: "AMP Conveyor",
    shortLabel: "AMPs",
    description: "Plan, preview, and commit deterministic amplifiers.",
  }),
  Object.freeze({
    id: "mutations",
    label: "Mutation Lab",
    shortLabel: "Mutations",
    description: "Compare isolated candidates before accepting a new revision.",
  }),
  Object.freeze({
    id: "diagnostics",
    label: "Diagnostics",
    shortLabel: "Diagnostics",
    description: "Inspect adapter coverage, receipts, provenance, and faults.",
  }),
]);

const PHASE_A_TAB_IDS = new Set(PHASE_A_STUDIO_TABS.map(({ id }) => id));

export function isStudioTab(value) {
  return typeof value === "string" && PHASE_A_TAB_IDS.has(value);
}

export function normalizeStudioTab(value) {
  return isStudioTab(value) ? value : "foundry";
}
