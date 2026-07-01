// hydrate() — attach reactivity to server-rendered HTML (closes the isomorphic loop).
//
// .toHTML() embeds <!--sx:w-->...<!--/sx:w--> around when() regions,
// <!--sx:m-->...<!--/sx:m--> around match() regions,
// <!--sx:r-->...<!--/sx:r--> around errorBoundary() regions,
// and <!--sx:e--><!--sx:i:KEY-->item<!--/sx:e--> for each() regions so the
// hydrator can find existing nodes and wire effects to them — no DOM rebuild,
// no flash.
//
//   // server
//   const html = App().toHTML();
//   // client
//   hydrate(App(), document.getElementById("root")!);

import { effect, createRoot, computed, untrack, onCleanup } from "../reactive/index";
import type { SxNode, SxChild, DynamicChild } from "./types";
import { applyProps, applyModifiers, buildElement, removeUndeclaredAttributes } from "./render";
import { decodeHydrationKey } from "./security";

const ELEMENT = 1;
const TEXT = 3;
const COMMENT = 8;

const isSxNode = (v: unknown): v is SxNode =>
  typeof v === "object" && v !== null && "tag" in v && "modifiers" in v;

const isDynamic = (v: unknown): v is DynamicChild =>
  typeof v === "object" && v !== null && "kind" in v;

const markerKeyMatches = (actual: string | number, marker: string): boolean => {
  const actualKey = String(actual);
  return actualKey === decodeHydrationKey(marker) || actualKey === marker;
};

// ---- cursor ---------------------------------------------------------------

const makeCursor = (parent: Node) => {
  const snap = Array.from(parent.childNodes); // static snapshot
  let i = 0;

  return {
    peek: (): ChildNode | null => snap[i] ?? null,
    advance: (): ChildNode | null => snap[i++] ?? null,

    skipComment(data: string): Comment | null {
      if (snap[i]?.nodeType === COMMENT && (snap[i] as Comment).data === data) {
        return snap[i++] as Comment;
      }
      return null;
    },

    collectUntilComment(data: string): { nodes: ChildNode[]; close: Comment | null } {
      const nodes: ChildNode[] = [];
      let close: Comment | null = null;
      while (i < snap.length) {
        const n = snap[i];
        if (n.nodeType === COMMENT && (n as Comment).data === data) {
          close = n as Comment;
          i++;
          break;
        }
        nodes.push(snap[i++]!);
      }
      return { nodes, close };
    },
  };
};

type Cursor = ReturnType<typeof makeCursor>;

// ---- element hydration ----------------------------------------------------

/** Wire reactive bindings to an EXISTING element — never calls createElement. */
const hydrateElement = (node: SxNode, el: HTMLElement): void => {
  removeUndeclaredAttributes(el, node.props);
  applyProps(el, node.props);
  const hasText = applyModifiers(el, node.modifiers);
  if (!hasText) visitChildren(node.children, el);
};

const visitChildren = (children: SxChild, parent: HTMLElement): void => {
  const cursor = makeCursor(parent);
  visit(children, parent, cursor);
  let stale: ChildNode | null;
  while ((stale = cursor.advance())) stale.parentNode?.removeChild(stale);
};

type HydrationRegion = {
  anchor: Comment;
  branchNodes: ChildNode[];
};

const claimRegion = (
  parent: HTMLElement,
  cursor: Cursor,
  openData: string,
  closeData: string,
  anchorData: string,
): HydrationRegion | null => {
  const openComment = cursor.skipComment(openData);
  if (!openComment) return null;

  const { nodes: branchNodes, close: closeComment } = cursor.collectUntilComment(closeData);
  const anchorBefore = cursor.peek();

  parent.removeChild(openComment);
  if (closeComment) parent.removeChild(closeComment);

  const anchor = document.createComment(anchorData);
  parent.insertBefore(anchor, anchorBefore ?? null);

  return { anchor, branchNodes };
};

const adoptOrDiscardRegion = (
  branchNodes: ChildNode[],
  branch: SxNode | undefined,
): HTMLElement | null => {
  const branchEl = branchNodes.find((node) => node.nodeType === ELEMENT) as
    | HTMLElement
    | undefined;

  if (!branch) {
    if (branchNodes.length === 0) return null;
  } else if (
    branchEl &&
    branchEl.tagName.toLowerCase() === branch.tag &&
    branchNodes.length === 1
  ) {
    // Tag matches — adopt it; hydrateElement reconciles attrs/text/children.
    // (A byte-exact outerHTML===serialize() gate would wrongly reject void
    // elements and escaped text, degrading adoption to a full rebuild.)
    return branchEl;
  }

  for (const node of branchNodes) node.parentNode?.removeChild(node);
  return null;
};

const visit = (child: SxChild, parent: HTMLElement, cursor: Cursor): void => {
  if (child === null || child === undefined || child === false || child === true) return;

  if (Array.isArray(child)) {
    for (const c of child) visit(c, parent, cursor);
    return;
  }

  if (typeof child === "string" || typeof child === "number") {
    const nextText = String(child);
    const n = cursor.peek();
    if (n?.nodeType === TEXT) {
      const textNode = cursor.advance() as Text;
      if (textNode.data !== nextText) textNode.data = nextText;
    } else {
      parent.insertBefore(document.createTextNode(nextText), n ?? null);
    }
    return;
  }

  if (typeof child === "function") {
    // Reactive text — adopt the existing text node (or create one on mismatch).
    const read = child as () => SxChild;
    const n = cursor.peek();
    let textNode: Text;
    if (n?.nodeType === TEXT) {
      textNode = cursor.advance() as Text;
    } else {
      textNode = document.createTextNode("");
      parent.insertBefore(textNode, n ?? null);
    }
    effect(() => {
      const v = read();
      textNode.data =
        v === null || v === undefined || v === false || v === true ? "" : String(v);
    });
    return;
  }

  if (isDynamic(child)) {
    if (child.kind === "when") hydrateWhen(child, parent, cursor);
    else if (child.kind === "each") hydrateEach(child, parent, cursor);
    else if (child.kind === "match") hydrateMatch(child, parent, cursor);
    else if (child.kind === "portal") hydratePortal(child);
    else if (child.kind === "error") hydrateError(child, parent, cursor);
    return;
  }

  if (isSxNode(child)) {
    const n = cursor.peek();
    if (n?.nodeType === ELEMENT && (n as Element).tagName.toLowerCase() === child.tag) {
      cursor.advance();
      hydrateElement(child, n as HTMLElement);
    } else {
      // Tag mismatch (server/client divergence) — client wins: build fresh in
      // place, and consume+discard the stale SSR node so the cursor stays
      // aligned for the following siblings (otherwise one mismatch cascades).
      const newEl = buildElement(child);
      parent.insertBefore(newEl, n ?? null);
      if (n) {
        cursor.advance();
        parent.removeChild(n);
      }
    }
    return;
  }

  // Raw DOM node or unknown scalar — skip.
  cursor.advance();
};

// ---- when -----------------------------------------------------------------

const hydrateWhen = (
  child: Extract<DynamicChild, { kind: "when" }>,
  parent: HTMLElement,
  cursor: Cursor,
): void => {
  const region = claimRegion(parent, cursor, "sx:w", "/sx:w", "when");

  if (!region) {
    // No SSR marker — fresh reactive region.
    freshWhen(child, parent, cursor.peek());
    return;
  }

  const visible = computed(() => child.condition());
  let firstRun = true;

  effect(() => {
    const show = visible();
    untrack(() => {
      if (firstRun) {
        firstRun = false;
        const desc = show ? child.truthy() : child.falsy?.();
        const branchEl = adoptOrDiscardRegion(region.branchNodes, desc);
        if (desc && branchEl) {
          // SSR matches — hydrate in place (wire internal reactivity).
          hydrateElement(desc, branchEl);
          onCleanup(() => branchEl.remove());
          return;
        }
        if (!desc && region.branchNodes.length === 0) {
          // SSR was empty and condition is still false — nothing to do.
          return;
        }
      }
      // Normal reactive update (runs after first flip too).
      const branch = show ? child.truthy() : child.falsy?.();
      const el = branch ? buildElement(branch) : null;
      if (el) parent.insertBefore(el, region.anchor);
      onCleanup(() => el?.remove());
    });
  });
};

const freshWhen = (
  child: Extract<DynamicChild, { kind: "when" }>,
  parent: HTMLElement,
  before: ChildNode | null = null,
): void => {
  const anchor = document.createComment("when");
  parent.insertBefore(anchor, before);
  const visible = computed(() => child.condition());
  effect(() => {
    const show = visible();
    untrack(() => {
      const branch = show ? child.truthy() : child.falsy?.();
      const el = branch ? buildElement(branch) : null;
      if (el) parent.insertBefore(el, anchor);
      onCleanup(() => el?.remove());
    });
  });
};

// ---- each -----------------------------------------------------------------

const hydrateEach = (
  child: Extract<DynamicChild, { kind: "each" }>,
  parent: HTMLElement,
  cursor: Cursor,
): void => {
  const openComment = cursor.skipComment("sx:e");

  type Entry = { el: HTMLElement; dispose: () => void };
  let prev = new Map<string | number, Entry>();
  let anchorBefore: ChildNode | null = cursor.peek();

  if (openComment) {
    const { nodes: regionNodes, close: closeComment } = cursor.collectUntilComment("/sx:e");
    anchorBefore = cursor.peek();

    parent.removeChild(openComment);
    if (closeComment) parent.removeChild(closeComment);

    // Read the current list ONCE (SSR snapshot) to match keys → descriptors.
    const list = untrack(() => child.items());
    let pendingRawKey: string | null = null;

    for (const n of regionNodes) {
      if (n.nodeType === COMMENT) {
        const data = (n as Comment).data;
        if (data.startsWith("sx:i:")) {
          pendingRawKey = data.slice("sx:i:".length);
          parent.removeChild(n);
        }
        continue;
      }
      if (n.nodeType === ELEMENT && pendingRawKey !== null) {
        const itemEl = n as HTMLElement;
        const rawKey = pendingRawKey;
        const idx = list.findIndex((item, i) => markerKeyMatches(child.key(item, i), rawKey));
        const actualKey = idx >= 0 ? child.key(list[idx], idx) : decodeHydrationKey(rawKey);
        const dispose =
          idx >= 0
            ? createRoot((d) => {
                const descriptor = child.renderItem(list[idx], idx);
                if (itemEl.tagName.toLowerCase() !== descriptor.tag) {
                  itemEl.remove();
                  return () => {};
                }
                hydrateElement(descriptor, itemEl);
                return d;
              })
            : () => {};
        if (idx >= 0 && itemEl.parentNode === parent) prev.set(actualKey, { el: itemEl, dispose });
        else itemEl.remove();
        pendingRawKey = null;
      }
    }
  }

  const anchor = document.createComment("each");
  parent.insertBefore(anchor, anchorBefore);

  // Keyed reconciliation — seeded with the hydrated prev map.
  effect(() => {
    const list = child.items();
    untrack(() => {
      const next = new Map<string | number, Entry>();
      const order: Array<string | number> = [];
      list.forEach((item, index) => {
        const k = child.key(item, index);
        order.push(k);
        const existing = prev.get(k);
        if (existing) {
          next.set(k, existing);
          prev.delete(k);
        } else {
          let el!: HTMLElement;
          const dispose = createRoot((d) => {
            el = buildElement(child.renderItem(item, index));
            return d;
          });
          next.set(k, { el, dispose });
        }
      });
      for (const [, entry] of prev) {
        entry.dispose();
        entry.el.remove();
      }
      for (const k of order) {
        const entry = next.get(k);
        if (entry) parent.insertBefore(entry.el, anchor);
      }
      prev = next;
    });
  });

  onCleanup(() => {
    for (const [, entry] of prev) {
      entry.dispose();
      entry.el.remove();
    }
  });
};

// ---- match ----------------------------------------------------------------

const hydrateMatch = (
  child: Extract<DynamicChild, { kind: "match" }>,
  parent: HTMLElement,
  cursor: Cursor,
): void => {
  const region = claimRegion(parent, cursor, "sx:m", "/sx:m", "match");
  const anchor = region?.anchor ?? document.createComment("match");
  if (!region) parent.insertBefore(anchor, cursor.peek() ?? null);

  let firstRun = true;
  effect(() => {
    const active = child.cases.find(([cond]) => cond());
    untrack(() => {
      const branch = active ? active[1]() : child.fallback?.();
      if (firstRun) {
        firstRun = false;
        if (region) {
          const branchEl = adoptOrDiscardRegion(region.branchNodes, branch);
          if (branch && branchEl) {
            hydrateElement(branch, branchEl);
            onCleanup(() => branchEl.remove());
            return;
          }
          if (!branch && region.branchNodes.length === 0) return;
        }
      }
      const el = branch ? buildElement(branch) : null;
      if (el) parent.insertBefore(el, anchor);
      onCleanup(() => el?.remove());
    });
  });
};

// ---- portal ---------------------------------------------------------------

const hydratePortal = (child: Extract<DynamicChild, { kind: "portal" }>): void => {
  // portals have no SSR footprint — mount fresh
  const target = child.target();
  const dispose = createRoot((d) => {
    const el = buildElement(child.children());
    target.appendChild(el);
    onCleanup(() => el.remove());
    return d;
  });
  onCleanup(dispose);
};

// ---- error boundary -------------------------------------------------------

const hydrateError = (
  child: Extract<DynamicChild, { kind: "error" }>,
  parent: HTMLElement,
  cursor: Cursor,
): void => {
  let disposeChild: (() => void) | null = null;
  const region = claimRegion(parent, cursor, "sx:r", "/sx:r", "error");
  const anchor = region?.anchor ?? document.createComment("error");
  if (!region) parent.insertBefore(anchor, cursor.peek() ?? null);
  let firstMount = true;

  const mountBranch = (branch: SxNode): void => {
    disposeChild = createRoot((d) => {
      const adopted = firstMount && region ? adoptOrDiscardRegion(region.branchNodes, branch) : null;
      let el: HTMLElement;

      if (adopted) {
        el = adopted;
        hydrateElement(branch, el);
      } else {
        el = buildElement(branch);
        parent.insertBefore(el, anchor);
      }

      firstMount = false;
      onCleanup(() => el.remove());
      return d;
    });
  };

  const renderFallback = (err: unknown): void => {
    const reset = (): void => {
      disposeChild?.();
      disposeChild = null;
      renderChildren();
    };
    mountBranch(child.fallback(err, reset));
  };

  const renderChildren = (): void => {
    try {
      mountBranch(child.children());
    } catch (err) {
      renderFallback(err);
    }
  };

  renderChildren();
  onCleanup(() => disposeChild?.());
};

// ---- public API -----------------------------------------------------------

/**
 * Attach reactivity to an SSR-rendered HTML tree without rebuilding it.
 * Drop-in replacement for `render()` on the client side.
 *
 *   const dispose = hydrate(App(), document.getElementById("root")!);
 */
export const hydrate = (node: SxNode, target: Element): (() => void) => {
  let el: HTMLElement | null = null;
  const dispose = createRoot((disposeRoot) => {
    const existing = target.firstElementChild as HTMLElement | null;
    const hasSingleRootChild =
      target.childElementCount === 1 && target.firstElementChild === existing && target.children.length === 1;
    if (
      existing &&
      existing.tagName.toLowerCase() === node.tag &&
      hasSingleRootChild
    ) {
      el = existing;
      hydrateElement(node, el);
    } else {
      // No SSR child or tag mismatch — replace stale SSR content with a fresh render.
      while (target.firstChild) target.removeChild(target.firstChild);
      el = buildElement(node);
      target.appendChild(el);
    }
    return disposeRoot;
  });
  return () => {
    dispose();
    el?.remove();
  };
};
