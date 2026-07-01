// Live DOM construction (Layer 1, browser) — the twin of toHTML().
//
// Builds REAL DOM from a descriptor and wires effects so signals mutate the
// DOM directly. No Virtual DOM, no diff: each reactive binding is an ordinary
// `effect` whose body writes to one node. All effects + event listeners are
// owned by a root scope, so the returned dispose() tears everything down
// deterministically — no reliance on the garbage collector.

import { effect, onCleanup, createRoot, computed, untrack } from "../reactive/index";
import type {
  SxNode,
  SxChild,
  Modifier,
  HtmlProps,
  EventHandler,
  DynamicChild,
} from "./types";
import { isBlockedAttributeName, sanitizeAttributeValue } from "./security";

const isSxNode = (value: unknown): value is SxNode =>
  typeof value === "object" &&
  value !== null &&
  "tag" in value &&
  "modifiers" in value;

const isDynamicChild = (value: unknown): value is DynamicChild =>
  typeof value === "object" && value !== null && "kind" in value;

const setAttribute = (
  el: Element,
  key: string,
  value: string | number | boolean | null,
): void => {
  if (isBlockedAttributeName(key)) {
    if (key.match(/^[A-Za-z_:][A-Za-z0-9_.:-]*$/)) el.removeAttribute(key);
    return;
  }

  // value/checked are live PROPERTIES on form controls, not attributes.
  if (key === "value" && "value" in el) {
    (el as HTMLInputElement).value =
      value === null || value === false ? "" : String(value);
    return;
  }
  if (key === "checked" && "checked" in el) {
    (el as HTMLInputElement).checked = value === true || value === "true";
    return;
  }
  const attrValue = sanitizeAttributeValue(key, value, el.tagName);
  if (attrValue === null) el.removeAttribute(key);
  else el.setAttribute(key, attrValue);
};

export const applyProps = (el: Element, props: HtmlProps): void => {
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "function") {
      const read = value as () => string | number | boolean | null;
      effect(() => setAttribute(el, key, read()));
    } else {
      setAttribute(el, key, value);
    }
  }
};

export const removeUndeclaredAttributes = (el: Element, props: HtmlProps): void => {
  const declared = new Set(Object.keys(props));
  for (const name of el.getAttributeNames()) {
    if (!declared.has(name)) el.removeAttribute(name);
  }
};

/** Returns true if a `text` modifier owns the element's content. */
export const applyModifiers = (el: HTMLElement, modifiers: Modifier[]): boolean => {
  const classMods = modifiers.filter(
    (m): m is Extract<Modifier, { type: "class" | "addClass" }> =>
      m.type === "class" || m.type === "addClass",
  );

  if (classMods.length > 0) {
    // A single effect recomputes the full className from every class modifier.
    effect(() => {
      const classes: string[] = [];
      for (const m of classMods) {
        if (m.type === "class") {
          const c = typeof m.value === "function" ? m.value() : m.value;
          if (c) classes.push(c);
        } else if (m.when()) {
          classes.push(m.name);
        }
      }
      el.className = classes.join(" ");
    });
  }

  let hasText = false;
  for (const m of modifiers) {
    if (m.type === "attr") {
      const value = m.value;
      if (typeof value === "function") {
        const read = value as () => string | number | boolean | null;
        effect(() => setAttribute(el, m.key, read()));
      } else {
        setAttribute(el, m.key, value);
      }
    } else if (m.type === "style") {
      const value = m.value;
      const name = m.name;
      const apply = (v: string | number | null): void => {
        if (v === null || v === "") el.style.removeProperty(name);
        else el.style.setProperty(name, String(v));
      };
      if (typeof value === "function") {
        const read = value as () => string | number | null;
        effect(() => apply(read()));
      } else {
        apply(value);
      }
    } else if (m.type === "text") {
      hasText = true;
      const value = m.value;
      effect(() => {
        el.textContent = String(typeof value === "function" ? value() : value);
      });
    } else if (m.type === "on") {
      const handler = m.handler as EventHandler as EventListener;
      el.addEventListener(m.event, handler);
      onCleanup(() => el.removeEventListener(m.event, handler));
    } else if (m.type === "ref") {
      m.callback(el);
    }
  }

  return hasText;
};

// ---- control flow: dynamic regions (when / each) ----

const mountWhen = (
  child: Extract<DynamicChild, { kind: "when" }>,
  parent: Node,
): void => {
  const anchor = document.createComment("when");
  parent.appendChild(anchor);
  // Memoize the boolean so the branch only re-mounts when it actually flips.
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

const mountEach = (
  child: Extract<DynamicChild, { kind: "each" }>,
  parent: Node,
): void => {
  const anchor = document.createComment("each");
  parent.appendChild(anchor);

  type Entry = { el: HTMLElement; dispose: () => void };
  let prev = new Map<string | number, Entry>();

  effect(() => {
    const list = child.items(); // the only tracked read
    untrack(() => {
      const next = new Map<string | number, Entry>();
      const order: Array<string | number> = [];

      list.forEach((item, index) => {
        const k = child.key(item, index);
        order.push(k);
        const existing = prev.get(k);
        if (existing) {
          next.set(k, existing); // keep — no rebuild
          prev.delete(k);
        } else {
          let el!: HTMLElement;
          const dispose = createRoot((disposeItem) => {
            el = buildElement(child.renderItem(item, index));
            return disposeItem;
          });
          next.set(k, { el, dispose });
        }
      });

      // whatever is left in prev was removed from the list
      for (const [, entry] of prev) {
        entry.dispose();
        entry.el.remove();
      }

      // (re)insert every item in the new order (insertBefore also moves)
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

const mountMatch = (
  child: Extract<DynamicChild, { kind: "match" }>,
  parent: Node,
): void => {
  const anchor = document.createComment("match");
  parent.appendChild(anchor);
  effect(() => {
    const active = child.cases.find(([cond]) => cond());
    untrack(() => {
      const branch = active ? active[1]() : child.fallback?.();
      const el = branch ? buildElement(branch) : null;
      if (el) parent.insertBefore(el, anchor);
      onCleanup(() => el?.remove());
    });
  });
};

const mountPortal = (
  child: Extract<DynamicChild, { kind: "portal" }>,
): void => {
  const target = child.target();
  const dispose = createRoot((d) => {
    const el = buildElement(child.children());
    target.appendChild(el);
    onCleanup(() => el.remove());
    return d;
  });
  onCleanup(dispose);
};

const mountError = (
  child: Extract<DynamicChild, { kind: "error" }>,
  parent: Node,
): void => {
  let disposeChild: (() => void) | null = null;

  const renderFallback = (err: unknown): void => {
    disposeChild = createRoot((d) => {
      const reset = (): void => {
        disposeChild?.();
        disposeChild = null;
        renderChildren();
      };
      const el = buildElement(child.fallback(err, reset));
      parent.appendChild(el);
      onCleanup(() => el.remove());
      return d;
    });
  };

  const renderChildren = (): void => {
    try {
      disposeChild = createRoot((d) => {
        const el = buildElement(child.children());
        parent.appendChild(el);
        onCleanup(() => el.remove());
        return d;
      });
    } catch (err) {
      renderFallback(err);
    }
  };

  renderChildren();
  onCleanup(() => disposeChild?.());
};

// ---- children ----

const mountChild = (child: SxChild, parent: Node): void => {
  if (child === null || child === undefined || child === false || child === true) return;

  if (isDynamicChild(child)) {
    if (child.kind === "when") mountWhen(child, parent);
    else if (child.kind === "each") mountEach(child, parent);
    else if (child.kind === "match") mountMatch(child, parent);
    else if (child.kind === "portal") mountPortal(child);
    else if (child.kind === "error") mountError(child, parent);
    return;
  }

  // A raw DOM node (e.g. an @html component) composes directly.
  if (child instanceof Node) {
    parent.appendChild(child);
    return;
  }

  if (typeof child === "function") {
    // Reactive child. Primitive (text) results are supported here; dynamic
    // node/list children use when()/each().
    const text = document.createTextNode("");
    parent.appendChild(text);
    const read = child as () => SxChild;
    effect(() => {
      const value = read();
      text.data =
        value === null || value === undefined || value === false || value === true
          ? ""
          : String(value);
    });
    return;
  }

  if (Array.isArray(child)) {
    for (const c of child) mountChild(c, parent);
    return;
  }

  if (isSxNode(child)) {
    parent.appendChild(buildElement(child));
    return;
  }

  parent.appendChild(document.createTextNode(String(child)));
};

export const buildElement = (node: SxNode): HTMLElement => {
  const el = document.createElement(node.tag);
  applyProps(el, node.props);
  const hasText = applyModifiers(el, node.modifiers);
  if (!hasText) mountChild(node.children, el);
  return el;
};

/**
 * Mount a descriptor into a live DOM target. Returns a dispose function that
 * removes the element and unsubscribes every effect and listener it created.
 */
export const render = (node: SxNode, target: Element): (() => void) => {
  let el: HTMLElement | null = null;
  const dispose = createRoot((disposeRoot) => {
    el = buildElement(node);
    target.appendChild(el);
    return disposeRoot;
  });
  return () => {
    dispose();
    el?.remove();
  };
};
