// @vitest-environment jsdom
/**
 * mountDomPlan tests (Task 4) — the generated DOM plan mounts to stable
 * semantic elements with attachment hosts, and a recovery shell appears when
 * the plan is missing/invalid.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mountDomPlan } from "../../src/ui/mountDomPlan.js";
import type { DomPlanNode } from "../../src/ui/mountDomPlan.js";
import { polarisConsoleDomPlan } from "../../src/generated/polaris-console.dom-plan.js";

const plan = polarisConsoleDomPlan as unknown as DomPlanNode;

describe("mountDomPlan", () => {
  let target: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    target = document.createElement("div");
    target.id = "app";
    document.body.appendChild(target);
  });

  it("mounts the stable semantic landmarks", () => {
    const mounted = mountDomPlan(document, target, plan);
    const root = mounted.root;
    expect(root.querySelector("header#polaris-system-header")).not.toBeNull();
    expect(root.querySelector("main#polaris-workspace")).not.toBeNull();
    expect(root.querySelector("aside#polaris-bearing-rail")).not.toBeNull();
    expect(root.querySelector("ol#polaris-chronicle-log")?.getAttribute("aria-live")).toBe("polite");
    expect(root.querySelector("form#polaris-command-conduit")).not.toBeNull();
  });

  it("creates aria-hidden attachment hosts for every visual slot", () => {
    const mounted = mountDomPlan(document, target, plan);
    const hosts = mounted.root.querySelectorAll("[data-attachment-slot]");
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of Array.from(hosts)) {
      expect(host.getAttribute("aria-hidden")).toBe("true");
      expect(host.getAttribute("data-visual-id")).toBeTruthy();
    }
    expect(mounted.attachmentHosts.length).toBe(hosts.length);
  });

  it("indexes every node by id", () => {
    const mounted = mountDomPlan(document, target, plan);
    expect(mounted.byId.get("polaris-command-input")).toBeDefined();
    expect(mounted.byId.get("polaris-scene-altar")).toBeDefined();
    expect(mounted.byId.get("polaris-command-input")?.tagName.toLowerCase()).toBe("input");
  });

  it("sets data-compose-kind and inline layout intent", () => {
    const mounted = mountDomPlan(document, target, plan);
    const workspace = mounted.byId.get("polaris-workspace");
    expect(workspace?.getAttribute("data-compose-kind")).toBe("container");
    expect(workspace?.style.display).toBe("grid");
  });

  it("never serializes server data via innerHTML", () => {
    const hostile: DomPlanNode = {
      tag: "div",
      id: "x",
      attrs: {},
      style: {},
      children: [],
      attachmentSlots: [],
      text: "<img src=x onerror=alert(1)>",
    };
    const mounted = mountDomPlan(document, target, hostile);
    expect(mounted.root.querySelector("img")).toBeNull();
    expect(mounted.root.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("renders a recovery shell when the plan is invalid", () => {
    const broken = { tag: "<<<bad>>>", id: "x" } as unknown as DomPlanNode;
    const mounted = mountDomPlan(document, target, broken);
    expect(mounted.root.tagName.toLowerCase()).toBe("main");
    expect(mounted.root.getAttribute("data-recovery")).toBe("true");
  });
});
