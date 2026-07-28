/**
 * mountDomPlan — mount the generated, runtime-neutral DOM plan into semantic
 * HTML (Task 4). No framework, no innerHTML from data. Decorative attachment
 * slots become aria-hidden spans that a PixelBrain host may later populate.
 */

export interface DomPlanAttachment {
  readonly slot: string;
  readonly visualId: string;
  readonly kind: string;
  readonly packetId?: string;
  readonly tokenPath?: string;
  readonly className?: string;
}

/** Structural mirror of the generated `polarisConsoleDomPlan` node shape. */
export interface DomPlanNode {
  readonly tag: string;
  readonly id: string;
  readonly role?: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly style: Readonly<Record<string, string>>;
  readonly children: readonly DomPlanNode[];
  readonly text?: string;
  readonly attachmentSlots: readonly DomPlanAttachment[];
}

export interface MountedPolarisConsole {
  root: HTMLElement;
  byId: ReadonlyMap<string, HTMLElement>;
  attachmentHosts: readonly HTMLElement[];
}

const VALID_TAG = /^[a-zA-Z][a-zA-Z0-9-]*$/;

function buildNode(
  document: Document,
  node: DomPlanNode,
  byId: Map<string, HTMLElement>,
  attachmentHosts: HTMLElement[],
): HTMLElement {
  if (!node || typeof node.tag !== "string" || !VALID_TAG.test(node.tag)) {
    throw new Error(`Invalid DOM plan node tag: ${String(node?.tag)}`);
  }

  const el = document.createElement(node.tag);
  if (node.id) el.id = node.id;

  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    el.setAttribute(name, value);
  }

  const style = node.style ?? {};
  for (const [prop, value] of Object.entries(style)) {
    (el.style as unknown as Record<string, string>)[prop] = value;
  }

  if (typeof node.text === "string") {
    el.appendChild(document.createTextNode(node.text));
  }

  for (const attachment of node.attachmentSlots ?? []) {
    const host = document.createElement("span");
    host.setAttribute("aria-hidden", "true");
    host.setAttribute("data-attachment-slot", attachment.slot);
    host.setAttribute("data-visual-id", attachment.visualId);
    host.setAttribute("data-attachment-kind", attachment.kind);
    if (attachment.packetId) host.setAttribute("data-packet-id", attachment.packetId);
    el.appendChild(host);
    attachmentHosts.push(host);
  }

  for (const child of node.children ?? []) {
    el.appendChild(buildNode(document, child, byId, attachmentHosts));
  }

  if (node.id) byId.set(node.id, el);
  return el;
}

function buildRecoveryShell(document: Document): HTMLElement {
  const main = document.createElement("main");
  main.setAttribute("data-recovery", "true");
  main.setAttribute("aria-label", "Polaris console unavailable");
  const heading = document.createElement("h1");
  heading.appendChild(document.createTextNode("The console could not be summoned."));
  const detail = document.createElement("p");
  detail.appendChild(
    document.createTextNode(
      "The interface plan failed to materialize. Reload, or consult the diagnostics rail.",
    ),
  );
  main.appendChild(heading);
  main.appendChild(detail);
  return main;
}

/**
 * Mount a DOM plan into `target`. Returns the mounted root, an id index, and
 * the attachment hosts. On any failure the target is given a semantic recovery
 * shell so the page never renders nothing.
 */
export function mountDomPlan(
  document: Document,
  target: HTMLElement,
  plan: DomPlanNode,
): MountedPolarisConsole {
  const byId = new Map<string, HTMLElement>();
  const attachmentHosts: HTMLElement[] = [];

  let root: HTMLElement;
  try {
    root = buildNode(document, plan, byId, attachmentHosts);
  } catch {
    const recovery = buildRecoveryShell(document);
    target.textContent = "";
    target.appendChild(recovery);
    byId.clear();
    attachmentHosts.length = 0;
    return { root: recovery, byId, attachmentHosts };
  }

  target.textContent = "";
  target.appendChild(root);
  return { root, byId, attachmentHosts };
}
