export const STUDIO_TABS = Object.freeze([
  Object.freeze({
    id: "canvas",
    label: "Canvas & Aseprite",
    shortLabel: "Canvas",
    description: "Direct pixel editing, layers, palette, and Aseprite round-trips.",
    features: Object.freeze(["TemplateEditor", "LayerStackPanel", "IndexedPalettePanel"]),
  }),
  Object.freeze({
    id: "blueprint",
    label: "Blueprint",
    shortLabel: "Blueprint",
    description: "Reference intake, construction guides, and editable structure.",
    features: Object.freeze(["SketchPad", "ConstructionGuides", "ForgeGatePanel"]),
  }),
  Object.freeze({
    id: "foundry",
    label: "Foundry",
    shortLabel: "Foundry",
    description: "Forge items from governed specifications and inspect their previews.",
    features: Object.freeze([
      "GrassFoundryPanel",
      "UploadSection",
      "AnalysisResults",
      "ParameterSliders",
      "FormulaLibrary",
      "DuplicateSection",
    ]),
  }),
  Object.freeze({
    id: "amps",
    label: "AMP Conveyor",
    shortLabel: "AMPs",
    description: "Plan and run deterministic non-mutation amplifiers.",
    features: Object.freeze(["AmpConveyorPanel", "ExtensionSelector"]),
  }),
  Object.freeze({
    id: "mutations",
    label: "Mutation Lab",
    shortLabel: "Mutations",
    description: "Preview destructive transforms before accepting a new asset revision.",
    features: Object.freeze(["MutationLabPanel"]),
  }),
  Object.freeze({
    id: "finish",
    label: "Material & Finish",
    shortLabel: "Finish",
    description: "Tune materials, shaders, texture, and finishing passes.",
    features: Object.freeze(["ShaderForgePanel", "ShaderSandbox", "StyleTransmuter", "TextureSelector"]),
  }),
  Object.freeze({
    id: "mentor",
    label: "Mentor & Reference",
    shortLabel: "Mentor",
    description: "Critique, reference study, drills, and guided corrections.",
    features: Object.freeze(["MentorCritiquePanel", "ReferencePanel"]),
  }),
  Object.freeze({
    id: "library",
    label: "Library & Export",
    shortLabel: "Library",
    description: "Manage artifacts and export reproducible deliverables.",
    features: Object.freeze(["LocalLibrary", "AsepriteExport", "PngExport", "RecipeExport"]),
  }),
  Object.freeze({
    id: "diagnostics",
    label: "Diagnostics",
    shortLabel: "Diagnostics",
    description: "Inspect gates, execution evidence, provenance, and faults.",
    features: Object.freeze(["StatusDisplay", "PixelBrainTerminal", "ReceiptLedger"]),
  }),
]);

const STUDIO_TAB_IDS = new Set(STUDIO_TABS.map((tab) => tab.id));

export function isStudioTab(value) {
  return typeof value === "string" && STUDIO_TAB_IDS.has(value);
}

export function normalizeStudioTab(value) {
  return isStudioTab(value) ? value : "canvas";
}

export function studioHomeForFeature(feature) {
  return STUDIO_TABS.find((tab) => tab.features.includes(feature))?.id ?? null;
}

/** @deprecated Phase A alias — Canvas is the Phase B default. */
export const PHASE_A_STUDIO_TABS = STUDIO_TABS;
