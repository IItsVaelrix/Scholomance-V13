import { expect, test } from "playwright/test";
import { getStudioAmpManifest } from "../../src/lib/pixelbrain/studio-facade.js";

test("professional Canvas owns a viewport-sized workboard", async ({ page }) => {
  await page.goto("/studio/canvas");
  const viewport = page.getByTestId("canvas-viewport");
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveAttribute("data-renderer", "invalidation");
  const box = await viewport.boundingBox();
  expect(box.width).toBeGreaterThan(500);
  expect(box.height).toBeGreaterThan(360);
});

async function waitForFittedCanvas(page) {
  const canvas = page.getByTestId("pixel-canvas");
  await expect(canvas).toBeVisible();
  let last = null;
  let stable = 0;
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      if (!box || box.width <= 500 || box.height <= 360) return "unmeasured";
      const view = await readView(canvas);
      if (!Number.isFinite(view.zoom) || view.zoom < 1) return "unfitted";
      const signature = `${view.panX},${view.panY},${view.zoom},${Math.round(box.width)}x${Math.round(box.height)}`;
      if (view.panX === 0 && view.panY === 0 && view.zoom === 1) return "default";
      if (signature === last) stable += 1;
      else {
        last = signature;
        stable = 0;
      }
      return stable >= 1 ? "ready" : "settling";
    })
    .toBe("ready");
  return canvas;
}

async function readView(canvas) {
  return {
    panX: Number(await canvas.getAttribute("data-pan-x")),
    panY: Number(await canvas.getAttribute("data-pan-y")),
    zoom: Number(await canvas.getAttribute("data-zoom")),
  };
}

function cellPosition(view, x, y) {
  return {
    x: view.panX + view.zoom * x + view.zoom / 2,
    y: view.panY + view.zoom * y + view.zoom / 2,
  };
}

async function pagePoint(canvas, view, x, y) {
  return canvas.evaluate((node, local) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + local.x, y: rect.top + local.y };
  }, cellPosition(view, x, y));
}

async function dragLattice(page, canvas, view, from, to, button = "left") {
  const start = await pagePoint(canvas, view, from.x, from.y);
  const end = await pagePoint(canvas, view, to.x, to.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  await page.mouse.move(end.x, end.y, { steps: 1 });
  await page.mouse.up({ button });
  return start;
}

test.describe("drawing contract", () => {
  test("rapid diagonal drag visits 11 cells", async ({ page }, testInfo) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    const status = page.getByTestId("canvas-status");
    await expect(status).toContainText("0 cells");
    const view = await readView(canvas);
    await dragLattice(page, canvas, view, { x: 0, y: 0 }, { x: 10, y: 10 });
    await expect(status).toContainText("11 cells");
    await page.screenshot({ path: testInfo.outputPath("drawing-contract.png"), fullPage: true });
  });

  test("Control+z once after a stroke returns 0 cells", async ({ page }) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    const status = page.getByTestId("canvas-status");
    const view = await readView(canvas);
    await dragLattice(page, canvas, view, { x: 2, y: 2 }, { x: 12, y: 12 });
    await expect(status).toContainText("11 cells");
    await page.keyboard.press("Control+z");
    await expect(status).toContainText("0 cells");
  });

  test("zoom with the pointer over a lattice cell keeps the reported coordinate", async ({ page }) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    const status = page.getByTestId("canvas-status");
    const view = await readView(canvas);
    const target = cellPosition(view, 8, 8);
    await canvas.hover({ position: target });
    await page.mouse.wheel(0, -120);
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-zoom")))
      .not.toBe(view.zoom);
    await canvas.hover({ position: { x: target.x + 1, y: target.y } });
    await canvas.hover({ position: target });
    await expect(status).toContainText("x/y 8/8");
  });

  test("keys E G I B select Eraser Fill Picker Pencil", async ({ page }) => {
    await page.goto("/studio/canvas");
    await waitForFittedCanvas(page);
    await page.keyboard.press("e");
    await expect(page.getByRole("button", { name: /Eraser/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("g");
    await expect(page.getByRole("button", { name: /Fill/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("i");
    await expect(page.getByRole("button", { name: /Picker/ })).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("b");
    await expect(page.getByRole("button", { name: /Pencil/ })).toHaveAttribute("aria-pressed", "true");
  });

  test("right-drag pencil paints background and picker samples it into foreground", async ({ page }) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    const bg = "#336699";
    await page.getByLabel("Background hex").fill(bg);
    await expect(page.getByLabel("Background hex")).toHaveValue(bg);
    await page.evaluate(() => window.scrollTo(0, 0));
    await canvas.evaluate((node) => node.focus());
    const view = await readView(canvas);
    await dragLattice(page, canvas, view, { x: 4, y: 4 }, { x: 6, y: 6 }, "right");
    await page.keyboard.press("i");
    await expect(page.getByRole("button", { name: /Picker/ })).toHaveAttribute("aria-pressed", "true");
    await canvas.click({ position: cellPosition(view, 4, 4) });
    await expect(page.getByLabel("Foreground hex")).toHaveValue(bg);
  });

  test("locked active layer refuses a stroke and reports Layer is locked", async ({ page }) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    const status = page.getByTestId("canvas-status");
    await expect(status).toContainText("0 cells");
    await page.getByRole("button", { name: "Lock Structure" }).click();
    const view = await readView(canvas);
    await dragLattice(page, canvas, view, { x: 9, y: 9 }, { x: 14, y: 14 });
    await expect(status).toContainText("0 cells");
    await expect(status).toContainText("Layer is locked");
  });
});

test.describe("professional workbench", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("compacts chrome so the workboard dominates the 1440x900 frame", async ({ page }, testInfo) => {
    await page.goto("/studio/canvas");
    const heading = page.getByRole("heading", { name: "Canvas & Aseprite" });
    const headingBox = (await heading.boundingBox()) || { height: 0 };
    expect(headingBox.height).toBeLessThan(24);

    const documentBar = page.getByRole("toolbar", { name: "Document commands" });
    const commandBar = page.getByRole("toolbar", { name: "Canvas commands" });
    const tools = page.getByRole("toolbar", { name: "Drawing tools" });
    const inspector = page.getByTestId("canvas-inspector");
    const workboard = page.getByTestId("canvas-viewport");
    await expect(documentBar).toBeVisible();
    await expect(commandBar).toBeVisible();
    await expect(workboard).toBeVisible();
    const docBox = await documentBar.boundingBox();
    const boardBox = await workboard.boundingBox();
    expect(docBox.y + docBox.height).toBeLessThanOrEqual(boardBox.y + 1);
    await expect(documentBar.getByRole("button", { name: "New" })).toBeVisible();
    await expect(documentBar.getByRole("button", { name: "Import" })).toBeVisible();
    await expect(documentBar.getByRole("button", { name: "PNG" })).toBeVisible();
    await expect(documentBar.getByRole("button", { name: "Aseprite" })).toBeVisible();
    await expect(documentBar.getByRole("button", { name: "Undo" })).toHaveCount(0);
    await expect(commandBar.getByRole("button", { name: /Fit/i })).toBeVisible();
    await expect(commandBar.getByRole("button", { name: /Grid/i })).toBeVisible();

    await expect(tools.getByRole("button", { name: /Pencil/ })).toBeVisible();
    await expect(tools.getByRole("button", { name: /Eraser/ })).toBeVisible();
    await expect(tools.getByRole("button", { name: /Fill/ })).toBeVisible();
    await expect(tools.getByRole("button", { name: /Picker/ })).toBeVisible();

    for (const name of ["Layers", "Palette", "Assist", "Preview"]) {
      await expect(inspector.getByRole("heading", { name, exact: true })).toBeVisible();
    }
    await expect(inspector.getByRole("button", { name: /^Apply$/ })).toHaveCount(0);
    await expect(page.locator(".pbs-editor-stage").getByLabel("Native-size preview")).toHaveCount(0);
    await expect(inspector.getByLabel("Native-size preview")).toBeVisible();

    const toolBox = await tools.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    expect(boardBox.width).toBeGreaterThan(toolBox.width + inspectorBox.width);
    await page.screenshot({ path: testInfo.outputPath("workbench-desktop.png") });
  });

  test("layer nested actions and palette swap stay non-color and non-selecting", async ({ page }) => {
    await page.goto("/studio/canvas");
    await waitForFittedCanvas(page);
    const inspector = page.getByTestId("canvas-inspector");
    await expect(inspector.getByRole("listitem").filter({ hasText: "Structure" })).toHaveAttribute("aria-current", "true");
    await inspector.getByRole("button", { name: "Hide Final" }).click();
    await expect(inspector.getByRole("button", { name: "Show Final" })).toBeVisible();
    await expect(inspector.getByRole("listitem").filter({ hasText: "Final" })).toContainText("Hidden");
    await expect(inspector.getByRole("listitem").filter({ hasText: "Structure" })).toHaveAttribute("aria-current", "true");
    await expect(inspector.getByRole("button", { name: "Lock Structure" })).toHaveAttribute("aria-pressed", "false");
    await inspector.getByRole("button", { name: "Lock Structure" }).click();
    await expect(inspector.getByRole("button", { name: "Unlock Structure" })).toHaveAttribute("aria-pressed", "true");
    await expect(inspector.getByRole("listitem").filter({ hasText: "Structure" })).toContainText("Locked");

    await expect(inspector.getByRole("button", { name: /swap foreground and background/i })).toBeVisible();
    await expect(inspector.getByText(/right-click|secondary pencil/i)).toBeVisible();
    await expect(inspector.getByText(/\d+ \/ 32/)).toBeVisible();
  });

  test("narrow layout uses a 44px inspector drawer without page overflow", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/studio/canvas");
    const tools = page.getByRole("toolbar", { name: "Drawing tools" });
    const toolBox = await tools.boundingBox();
    expect(toolBox.width).toBeGreaterThan(toolBox.height);

    const toggle = page.getByRole("button", { name: /Inspector/i });
    await expect(toggle).toBeVisible();
    const toggleBox = await toggle.boundingBox();
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("heading", { name: "Layers" })).toBeHidden();
    await toggle.click();
    await expect(page.getByRole("heading", { name: "Layers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assist" })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBe(overflow.clientWidth);
    await page.screenshot({ path: testInfo.outputPath("workbench-mobile.png") });
  });
});

async function paintIsolatedCells(page) {
  const canvas = await waitForFittedCanvas(page);
  const view = await readView(canvas);
  await canvas.click({ position: cellPosition(view, 2, 2) });
  await canvas.click({ position: cellPosition(view, 14, 14) });
  await expect(page.getByTestId("canvas-status")).toContainText("2 cells");
  return canvas;
}

test.describe("Canvas Assist", () => {
  test("transform suggestions expose Preview Apply Dismiss and overlay suggestions do not", async ({ page }, testInfo) => {
    await page.goto("/studio/canvas");
    const inspector = page.getByTestId("canvas-inspector");
    await expect(inspector.getByRole("heading", { name: "Assist", exact: true })).toBeVisible();
    await expect(inspector.getByTestId("assist-accounting")).toBeVisible();
    await expect(inspector.getByRole("button", { name: /^Preview$/ })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: /^Apply$/ })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: /^Dismiss$/ })).toHaveCount(0);

    await paintIsolatedCells(page);
    const transform = inspector.locator('[data-assist-kind="transform"]');
    await expect(transform).toBeVisible();
    await expect(transform.getByRole("button", { name: /^Preview$/ })).toBeVisible();
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeVisible();
    await expect(transform.getByRole("button", { name: /^Dismiss$/ })).toBeVisible();
    await expect(inspector.locator('[data-assist-kind="overlay"] button', { hasText: /^Preview$/ })).toHaveCount(0);
    await expect(inspector.locator('[data-assist-kind="overlay"] button', { hasText: /^Apply$/ })).toHaveCount(0);
    await expect(inspector.locator('[data-assist-kind="overlay"] button', { hasText: /^Dismiss$/ })).toHaveCount(0);

    const checksum = page.locator(".pbs-snapshot-badge code");
    const beforePreview = await checksum.innerText();
    await transform.getByRole("button", { name: /^Preview$/ }).click();
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeEnabled();
    await expect(checksum).toHaveText(beforePreview);
    await page.screenshot({ path: testInfo.outputPath("assist-preview-fitted.png") });
    await page.getByRole("button", { name: "1×" }).click();
    await page.screenshot({ path: testInfo.outputPath("assist-preview-native.png") });
    await transform.getByRole("button", { name: /^Apply$/ }).click();
    await expect(inspector.getByRole("listitem").filter({ hasText: "ASSIST/square-sharpness-contrast" })).toBeVisible();
    await expect(checksum).not.toHaveText(beforePreview);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(inspector.getByRole("listitem").filter({ hasText: "ASSIST/square-sharpness-contrast" })).toHaveCount(0);
    await expect(checksum).toHaveText(beforePreview);
  });

  test("drawing after preview disables stale Apply and explains regeneration", async ({ page }) => {
    await page.goto("/studio/canvas");
    await paintIsolatedCells(page);
    const inspector = page.getByTestId("canvas-inspector");
    const transform = inspector.locator('[data-assist-kind="transform"]');
    await transform.getByRole("button", { name: /^Preview$/ }).click();
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeEnabled();
    const canvas = page.getByTestId("pixel-canvas");
    const view = await readView(canvas);
    await canvas.click({ position: cellPosition(view, 8, 2) });
    await expect(page.getByTestId("canvas-status")).toContainText("3 cells");
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeDisabled();
    await expect(inspector.getByTestId("assist-stale")).toBeVisible();
    await expect(inspector.getByTestId("assist-stale")).toContainText(/regenerat/i);
    await expect(inspector.getByRole("listitem").filter({ hasText: "ASSIST/square-sharpness-contrast" })).toHaveCount(0);
    await transform.getByRole("button", { name: /^Dismiss$/ }).click();
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeDisabled();
    await expect(inspector.getByRole("listitem").filter({ hasText: "ASSIST/square-sharpness-contrast" })).toHaveCount(0);
  });

  test("relevant dormant accounting uses the live manifest length", async ({ page }) => {
    await page.goto("/studio/canvas");
    const accounting = page.getByTestId("assist-accounting");
    await expect(accounting).toHaveText(/\d+ relevant · \d+ dormant/);
    const emptyText = await accounting.innerText();
    const emptyMatch = emptyText.match(/(\d+) relevant · (\d+) dormant/);
    const manifestLength = getStudioAmpManifest().length;
    expect(Number(emptyMatch[1]) + Number(emptyMatch[2])).toBe(manifestLength);
    expect(Number(emptyMatch[1])).toBeGreaterThan(0);

    await paintIsolatedCells(page);
    await expect(accounting).toHaveText(/\d+ relevant · \d+ dormant/);
    const liveText = await accounting.innerText();
    const liveMatch = liveText.match(/(\d+) relevant · (\d+) dormant/);
    expect(Number(liveMatch[1]) + Number(liveMatch[2])).toBe(manifestLength);
    expect(Number(liveMatch[1])).toBeGreaterThanOrEqual(Number(emptyMatch[1]));
  });
});

async function focusedName(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "";
    const labelled = el.getAttribute("aria-label");
    if (labelled) return labelled;
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  });
}

async function outlineStyle(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const width = Number.parseFloat(cs.outlineWidth) || 0;
    return {
      style: cs.outlineStyle,
      width,
      color: cs.outlineColor,
      visible: cs.outlineStyle !== "none" && width > 0,
    };
  });
}

async function tokenColor(page, name) {
  return page.evaluate((token) => {
    const raw = getComputedStyle(document.body).getPropertyValue(token).trim();
    const probe = document.createElement("span");
    probe.style.color = raw;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, name);
}

async function escapeDefaultPrevented(page) {
  return page.evaluate(() => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test.describe("accessibility and responsive", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("keyboard tab order visits document commands, tools, then the canvas", async ({ page }) => {
    await page.goto("/studio/canvas");
    await waitForFittedCanvas(page);
    await page.getByRole("toolbar", { name: "Document commands" }).getByRole("button", { name: "New" }).focus();
    const order = [];
    for (let i = 0; i < 20; i += 1) {
      order.push(await focusedName(page));
      await page.keyboard.press("Tab");
    }
    expect(order[0]).toMatch(/New/);
    expect(order[1]).toMatch(/^Import$/);
    expect(order).not.toContain("Import PNG or Aseprite");
    const pencil = order.findIndex((name) => /Pencil/i.test(name));
    const canvas = order.findIndex((name) => /Pixel canvas/i.test(name));
    expect(pencil).toBeGreaterThan(3);
    expect(canvas).toBeGreaterThan(pencil);
  });

  test("keyboard focus is visible on tools and the canvas", async ({ page }, testInfo) => {
    await page.goto("/studio/canvas");
    await waitForFittedCanvas(page);
    const ring = await tokenColor(page, "--color-ring");
    await page.getByRole("button", { name: /Pencil/ }).focus();
    await page.keyboard.press("Tab");
    const eraser = page.getByRole("button", { name: /Eraser/ });
    await expect(eraser).toBeFocused();
    const eraserOutline = await outlineStyle(eraser);
    expect(eraserOutline.visible).toBe(true);
    expect(eraserOutline.color).toBe(ring);
    await page.getByRole("button", { name: /Picker/ }).focus();
    await page.keyboard.press("Tab");
    const canvas = page.getByTestId("pixel-canvas");
    await expect(canvas).toBeFocused();
    const canvasOutline = await outlineStyle(canvas);
    expect(canvasOutline.visible).toBe(true);
    expect(canvasOutline.color).toBe(ring);
    await page.screenshot({ path: testInfo.outputPath("a11y-desktop-focus.png") });
  });

  test("tools expose aria-pressed and the canvas description names size zoom tool layer", async ({ page }, testInfo) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    const pencil = page.getByRole("button", { name: /Pencil/ });
    const eraser = page.getByRole("button", { name: /Eraser/ });
    await expect(pencil).toHaveAttribute("aria-pressed", "true");
    await expect(eraser).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("e");
    await expect(eraser).toHaveAttribute("aria-pressed", "true");
    await expect(pencil).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("b");
    await expect(pencil).toHaveAttribute("aria-pressed", "true");
    const view = await readView(canvas);
    await expect(canvas).toHaveAccessibleDescription(new RegExp(`160\\s*×\\s*144`));
    await expect(canvas).toHaveAccessibleDescription(new RegExp(`${view.zoom}\\s*×`));
    await expect(canvas).toHaveAccessibleDescription(/Pencil/);
    await expect(canvas).toHaveAccessibleDescription(/Structure/);
    await page.screenshot({ path: testInfo.outputPath("a11y-desktop.png") });
  });

  test("status live region announces locked and stale copy", async ({ page }) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    const status = page.getByTestId("canvas-status");
    await expect(status.locator("[aria-live='polite']")).toHaveCount(1);
    await page.getByRole("button", { name: "Lock Structure" }).click();
    const view = await readView(canvas);
    await dragLattice(page, canvas, view, { x: 9, y: 9 }, { x: 14, y: 14 });
    await expect(status).toContainText("Layer is locked");
    await expect(status.locator("[aria-live='polite']")).toContainText("Layer is locked");
    await expect(page.getByTestId("canvas-feedback").locator("[aria-live='polite']")).toContainText("Layer is locked");
    await page.getByRole("button", { name: "Unlock Structure" }).click();

    await paintIsolatedCells(page);
    const inspector = page.getByTestId("canvas-inspector");
    const transform = inspector.locator('[data-assist-kind="transform"]');
    await transform.getByRole("button", { name: /^Preview$/ }).click();
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeEnabled();
    await canvas.click({ position: cellPosition(await readView(canvas), 8, 2) });
    await expect(inspector.getByTestId("assist-stale")).toHaveAttribute("aria-live", "polite");
    await expect(inspector.getByTestId("assist-stale")).toContainText(/regenerat/i);
  });

  test("Escape only preventDefault when a stroke or assist preview is active", async ({ page }) => {
    await page.goto("/studio/canvas");
    const canvas = await waitForFittedCanvas(page);
    expect(await escapeDefaultPrevented(page)).toBe(false);

    const view = await readView(canvas);
    const start = await pagePoint(canvas, view, 3, 3);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    expect(await escapeDefaultPrevented(page)).toBe(true);
    await page.mouse.up();
    await expect(page.getByTestId("canvas-status")).toContainText("0 cells");

    await paintIsolatedCells(page);
    const transform = page.getByTestId("canvas-inspector").locator('[data-assist-kind="transform"]');
    await transform.getByRole("button", { name: /^Preview$/ }).click();
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeEnabled();
    expect(await escapeDefaultPrevented(page)).toBe(true);
    await expect(transform.getByRole("button", { name: /^Apply$/ })).toBeDisabled();
  });

  test("reduced motion removes Canvas feedback transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/studio/canvas");
    await waitForFittedCanvas(page);
    const motion = await page.getByTestId("canvas-feedback").evaluate((el) => {
      const cs = getComputedStyle(el);
      return { property: cs.transitionProperty, duration: cs.transitionDuration, transform: cs.transform };
    });
    expect(motion.property).toBe("none");
  });

  test("narrow inspector drawer keeps Assist Apply reachable without overflow", async ({ page }, testInfo) => {
    const uncaught = [];
    page.on("pageerror", (error) => uncaught.push(error.message));
    await page.goto("/studio/canvas");
    await paintIsolatedCells(page);
    await page.setViewportSize({ width: 390, height: 844 });
    const toggle = page.getByRole("button", { name: /Inspector/i });
    await expect(toggle).toBeVisible();
    expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await toggle.click();
    const inspector = page.getByTestId("canvas-inspector");
    await expect(inspector.getByRole("heading", { name: "Assist" })).toBeVisible();
    const transform = inspector.locator('[data-assist-kind="transform"]');
    await transform.getByRole("button", { name: /^Preview$/ }).click();
    const apply = transform.getByRole("button", { name: /^Apply$/ });
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeEnabled();
    const applyBox = await apply.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    expect(applyBox.y).toBeGreaterThanOrEqual(inspectorBox.y - 1);
    expect(applyBox.y + applyBox.height).toBeLessThanOrEqual(inspectorBox.y + inspectorBox.height + 1);
    expect(applyBox.y + applyBox.height).toBeLessThanOrEqual(844);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBe(overflow.clientWidth);
    expect(uncaught).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("a11y-mobile.png") });
  });
});
