// @vitest-environment jsdom
/**
 * PolarisConsoleView tests (Task 4) — binding PolarisUiState to stable semantic
 * DOM: header, bearing rail actions, Chronicle append-only log, telemetry <dl>,
 * data-state attributes, and disconnect behavior.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createPolarisConsoleView } from "../../src/ui/PolarisConsoleView.js";
import type { DomPlanNode } from "../../src/ui/mountDomPlan.js";
import { polarisConsoleDomPlan } from "../../src/generated/polaris-console.dom-plan.js";
import {
  polarisReducer,
  createInitialPolarisUiState,
  type PolarisAction,
} from "../../src/state/reducer.js";
import type { PolarisUiState } from "../../src/state/PolarisUiState.js";

const plan = polarisConsoleDomPlan as unknown as DomPlanNode;
const ISO = "2026-07-28T00:00:00.000Z";

function envelope(sequence: number) {
  return { worldId: "shrine", roomId: "antechamber", sequence, roomRevision: 3 };
}

function snapshotMessage(sequence: number) {
  return {
    type: "room.snapshot" as const,
    envelope: envelope(sequence),
    room: {
      roomId: "antechamber",
      revision: 3,
      title: "Antechamber",
      descriptionKey: "k",
      exitIds: ["exit-north"],
      occupantIds: ["p1"],
      entityIds: ["lantern"],
      flags: {},
    },
    entities: [
      {
        entityId: "lantern",
        entityType: "object" as const,
        definitionId: "d",
        location: { type: "room" as const, roomId: "antechamber" },
        flags: {},
      },
    ],
    players: [
      {
        playerId: "p1",
        displayName: "Seeker",
        roomId: "antechamber",
        inventoryIds: [],
        connectionState: "connected" as const,
      },
    ],
    sceneManifest: {
      sceneId: "antechamber_rev3",
      roomId: "antechamber",
      roomRevision: 3,
      visualRevision: 3,
      worldId: "shrine",
      backgroundAssetKey: "bg",
      layers: [],
      hotspots: [
        { hotspotId: "h1", entityId: "lantern", label: "Lantern", command: "take lantern", region: { x: 0, y: 0, w: 8, h: 8 }, visible: true },
      ],
      textRegions: [],
      lightingState: "dim",
      ambientEffects: [],
      contractHash: "scd64:abc",
      generatedAt: ISO,
    },
    roomInfo: {
      title: "Antechamber",
      description: "A cold antechamber.",
      exits: { "exit-north": { direction: "north", label: "North" } },
    },
    entityInfo: { lantern: { displayName: "Lantern", description: "Brass." } },
  };
}

function connectedState(...actions: PolarisAction[]): PolarisUiState {
  const base = polarisReducer(createInitialPolarisUiState(), {
    type: "server-message",
    message: snapshotMessage(5) as never,
  });
  return actions.reduce(polarisReducer, base);
}

describe("PolarisConsoleView", () => {
  let target: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("div");
    document.body.appendChild(target);
  });

  it("renders world and room into the header", () => {
    const view = createPolarisConsoleView(document, target, plan);
    view.render(connectedState());
    const header = target.querySelector("header#polaris-system-header");
    expect(header?.textContent).toContain("shrine");
    expect(header?.textContent).toContain("Antechamber");
  });

  it("renders exits and nearby entities as buttons in the bearing rail", () => {
    const view = createPolarisConsoleView(document, target, plan);
    view.render(connectedState());
    const rail = target.querySelector("aside#polaris-bearing-rail");
    const buttons = rail?.querySelectorAll("button") ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain("North"); // exit
  });

  it("appends Chronicle entries as <li> without replacing previous nodes", () => {
    const view = createPolarisConsoleView(document, target, plan);
    const s1 = connectedState({
      type: "server-message",
      message: {
        type: "domain.events",
        envelope: envelope(5),
        events: [
          { eventId: "e5", worldId: "shrine", roomId: "antechamber", sequence: 5, worldRevision: 3, eventType: "ENTITY_TAKEN", actorId: "p1", payload: {}, rulesetVersion: "1", occurredAt: ISO },
        ],
        narrative: ["First line."],
      } as never,
    });
    view.render(s1);
    const log = target.querySelector("ol#polaris-chronicle-log");
    expect(log?.querySelectorAll("li")).toHaveLength(1);
    const firstLi = log?.querySelector("li");

    const s2 = polarisReducer(s1, {
      type: "server-message",
      message: {
        type: "domain.events",
        envelope: envelope(6),
        events: [
          { eventId: "e6", worldId: "shrine", roomId: "antechamber", sequence: 6, worldRevision: 3, eventType: "ENTITY_ACTIVATED", actorId: "p1", payload: {}, rulesetVersion: "1", occurredAt: ISO },
        ],
        narrative: ["Second line."],
      } as never,
    });
    view.render(s2);
    const lis = log?.querySelectorAll("li");
    expect(lis).toHaveLength(2);
    expect(log?.querySelector("li")).toBe(firstLi); // same node, not replaced
  });

  it("renders telemetry label/value data as a <dl>", () => {
    const view = createPolarisConsoleView(document, target, plan);
    view.render(connectedState({ type: "selection", entityId: "lantern" }));
    const telemetry = target.querySelector("aside#polaris-telemetry-rail");
    expect(telemetry?.querySelector("dl")).not.toBeNull();
    expect(telemetry?.textContent).toContain("Lantern");
  });

  it("sets data-state attributes from selectors", () => {
    const view = createPolarisConsoleView(document, target, plan);
    const pending = connectedState({
      type: "input",
      input: { kind: "submit", commandId: "c1", rawInput: "take lantern", submittedAt: 1 },
    });
    view.render(pending);
    const conduit = target.querySelector("form#polaris-command-conduit");
    expect(conduit?.getAttribute("data-state")).toBe("pending");
  });

  it("preserves input and Chronicle on disconnect while disabling world actions", () => {
    const view = createPolarisConsoleView(document, target, plan);
    const withDraft = connectedState({
      type: "input",
      input: { kind: "draft", draft: "light " },
    });
    view.render(withDraft);
    const log = target.querySelector("ol#polaris-chronicle-log");
    const liBefore = log?.querySelectorAll("li").length;

    const disconnected: PolarisUiState = {
      ...withDraft,
      connection: { phase: "disconnected", worldId: "shrine" },
    };
    view.render(disconnected);

    const input = target.querySelector("input#polaris-command-input") as HTMLInputElement | null;
    expect(input?.value).toBe("light "); // draft preserved
    expect(log?.querySelectorAll("li").length).toBe(liBefore); // chronicle preserved

    const railButtons = target.querySelectorAll("aside#polaris-bearing-rail button");
    expect(railButtons.length).toBeGreaterThan(0);
    for (const b of Array.from(railButtons)) {
      expect((b as HTMLButtonElement).disabled).toBe(true);
    }
    expect(target.querySelector("[data-state='disconnected']")).not.toBeNull();
  });

  it("keeps all semantic content present with zero resolved attachment assets", () => {
    const view = createPolarisConsoleView(document, target, plan);
    view.render(connectedState());
    // Attachment hosts exist as empty aria-hidden spans; no asset is mounted.
    const hosts = target.querySelectorAll("[data-attachment-slot]");
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of Array.from(hosts)) {
      expect(host.querySelector("img,canvas,svg")).toBeNull();
    }
    // Semantic content remains fully usable.
    expect(target.querySelector("form#polaris-command-conduit")).not.toBeNull();
    expect(target.querySelector("input#polaris-command-input")).not.toBeNull();
    expect(target.querySelector("ol#polaris-chronicle-log")).not.toBeNull();
  });
});
