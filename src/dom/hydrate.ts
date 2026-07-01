// hydrate() — attach reactivity to server-rendered HTML (closes the isomorphic loop).
//
// .toHTML() embeds <!--sx:w-->...<!--/sx:w--> around when() regions and
// <!--sx:e--><!--sx:i:KEY-->item<!--/sx:e--> for each() regions so the hydrator
// can find existing nodes and wire effects to them — no DOM rebuild, no flash.
//
//   // server
//   const html = App().toHTML();
//   // client
//   hydrate(App(), document.getElementById("root")!);

import { effect, createRoot, computed, untrack, onCleanup } from "../reactive/index";
import type { SxNode, SxChild, DynamicChild } from "./types";
import { applyProps, applyModifiers, buildElement } from "./render";
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
  applyProps(el, node.props);
  const hasText = applyModifiers(el, node.modifiers);
  if (!hasText) visitChildren(node.children, el);
};

const visitChildren = (children: SxChild, parent: HTMLElement): void => {
  visit(children, parent, makeCursor(parent));
};

const visit = (child: SxChild, parent: HTMLElement, cursor: Cursor): void => {
  if (child === null || child === undefined || child === false || child === true) return;

  if (Array.isArray(child)) {
    for (const c of child) visit(c, parent, cursor);
    return;
  }

  if (typeof child === "string" || typeof child === "number") {
    // Static text — consume the text node, no effect needed.
    if (cursor.peek()?.nodeType === TEXT) cursor.advance();
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
    else hydrateEach(child, parent, cursor);
    return;
  }

  if (isSxNode(child)) {
    const n = cursor.peek();
    if (n?.nodeType === ELEMENT && (n as Element).tagName.toLowerCase() === child.tag) {
      cursor.advance();
      hydrateElement(child, n as HTMLElement);
    } else {
      // Tag mismatch — build fresh and insert before the next DOM node.
      const newEl = buildElement(child);
      parent.insertBefore(newEl, n ?? null);
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
  const openComment = cursor.skipComment("sx:w");

  if (!openComment) {
    // No SSR marker — fresh reactive region.
    freshWhen(child, parent, cursor.peek());
    return;
  }

  const { nodes: branchNodes, close: closeComment } = cursor.collectUntilComment("/sx:w");
  const anchorBefore =
    closeComment ??
    branchNodes[branchNodes.length - 1]?.nextSibling ??
    openComment.nextSibling;

  // Replace the sx:w / /sx:w comments with a stable region anchor.
  parent.removeChild(openComment);
  const anchor = document.createComment("when");
  parent.insertBefore(anchor, anchorBefore);
  if (closeComment) parent.removeChild(closeComment);

  const visible = computed(() => child.condition());
  let firstRun = true;

  effect(() => {
    const show = visible();
    untrack(() => {
      if (firstRun) {
        firstRun = false;
        const branchEl = branchNodes.find((n) => n.nodeType === ELEMENT) as
          | HTMLElement
          | undefined;
        if (show && branchEl) {
          const desc = child.truthy();
          if (branchEl.tagName.toLowerCase() === desc.tag) {
            // SSR matches — hydrate in place (wire internal reactivity).
            hydrateElement(desc, branchEl);
            onCleanup(() => branchEl.remove());
            return;
          }
        } else if (!show && !branchEl) {
          // SSR was empty and condition is still false — nothing to do.
          return;
        }
        // Mismatch: discard stale SSR content, fall through to fresh build.
        for (const n of branchNodes) n.parentNode?.removeChild(n);
      }
      // Normal reactive update (runs after first flip too).
      const branch = show ? child.truthy() : child.falsy?.();
      const el = branch ? buildElement(branch) : null;
      if (el) parent.insertBefore(el, anchor);
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
                hydrateElement(child.renderItem(list[idx], idx), itemEl);
                return d;
              })
            : () => {};
        prev.set(actualKey, { el: itemEl, dispose });
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
    if (existing && existing.tagName.toLowerCase() === node.tag) {
      el = existing;
      hydrateElement(node, el);
    } else {
      // No SSR child or tag mismatch — fall back to a fresh render.
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
