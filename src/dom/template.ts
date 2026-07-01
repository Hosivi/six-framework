// Precompiled-DOM primitives — the COMPILE TARGET for @html (Solid-style).
//
// Instead of building a descriptor and walking it at runtime, the compiler will
// emit: build a static <template> ONCE, clone it per instance, and wire effects
// ONLY at the dynamic holes. These helpers are that runtime. Browser-only.

import { effect, onCleanup } from "../reactive/index";
import {
  isBlockedPropertyName,
  sanitizeAttributeValue,
  sanitizeUrlPropertyValue,
  urlAttributeForProperty,
} from "./security";

/**
 * Build a cloneable template from static HTML — parsed ONCE, then cloned per
 * instance (cloneNode is far cheaper than constructing element-by-element).
 */
export const template = (html: string): (() => Element) => {
  let cached: Element | null = null;
  return () => {
    if (cached === null) {
      const t = document.createElement("template");
      t.innerHTML = html;
      cached = t.content.firstElementChild as Element;
    }
    return cached.cloneNode(true) as Element;
  };
};

/**
 * Reactive insertion at a dynamic hole. Handles, reactively:
 *   - a primitive            -> a (reused) text node, fine-grained
 *   - a DOM node             -> inserted directly (e.g. `cond ? a() : b()` = when)
 *   - an array of the above  -> a list (e.g. `items().map(row)` = each)
 * An anchor comment keeps the insertion point stable among sibling content.
 */
export const insert = (
  parent: Node,
  accessor: () => unknown,
  before: ChildNode | null = null,
): void => {
  let anchor: ChildNode;
  if (before) {
    anchor = before; // insert before an existing marker (e.g. a html`` hole)
  } else {
    anchor = document.createComment("");
    parent.appendChild(anchor);
  }
  let textNode: Text | null = null;
  let nodes: ChildNode[] = [];

  const clearNodes = (): void => {
    for (const n of nodes) n.remove();
    nodes = [];
  };

  effect(() => {
    const value = accessor();

    if (value instanceof Node || Array.isArray(value)) {
      if (textNode) {
        textNode.remove();
        textNode = null;
      }
      clearNodes();
      const items = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (item === null || item === undefined || item === false || item === true) {
          continue;
        }
        const node: ChildNode =
          item instanceof Node ? (item as ChildNode) : document.createTextNode(String(item));
        parent.insertBefore(node, anchor);
        nodes.push(node);
      }
      return;
    }

    // primitive: reuse a single text node (fine-grained)
    clearNodes();
    const str =
      value === null || value === undefined || value === false || value === true
        ? ""
        : String(value);
    if (textNode === null) {
      textNode = document.createTextNode(str);
      parent.insertBefore(textNode, anchor);
    } else {
      textNode.data = str;
    }
  });
};

/** Reactive attribute binding at a dynamic hole. */
export const bindAttr = (
  el: Element,
  name: string,
  accessor: () => string | number | boolean | null,
): void => {
  effect(() => {
    const value = sanitizeAttributeValue(name, accessor(), el.tagName);
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
  });
};

/**
 * Reactive PROPERTY binding at a dynamic hole (lit-html `.prop=${}` form).
 * Unlike an attribute, a property survives user interaction — essential for
 * controlled inputs, where `setAttribute("value", …)` would not update the
 * visible value once the user has typed.
 * Unsafe DOM sinks and event properties are ignored; use @event for listeners.
 */
export const bindProp = (
  el: Element,
  name: string,
  accessor: () => unknown,
): void => {
  if (isBlockedPropertyName(name)) return;
  effect(() => {
    const value = accessor();
    const urlAttrName = urlAttributeForProperty(name);
    if (urlAttrName !== null) {
      const sanitizedUrl = sanitizeUrlPropertyValue(name, value, el.tagName);
      if (sanitizedUrl === null) {
        el.removeAttribute(urlAttrName);
        return;
      }

      if (sanitizedUrl !== undefined) {
        (el as unknown as Record<string, unknown>)[name] = sanitizedUrl.value;
        return;
      }
    }

    (el as unknown as Record<string, unknown>)[name] = value;
  });
};

/** Event binding at a dynamic hole (cleaned up with the owning scope). */
export const bindEvent = (
  el: Element,
  event: string,
  handler: (e: Event) => void,
): void => {
  el.addEventListener(event, handler);
  onCleanup(() => el.removeEventListener(event, handler));
};

/**
 * Elements of a clone in pre-order. The compiler indexes each dynamic hole by
 * its element position, then the generated factory reaches it via this list.
 */
export const walkElements = (root: Element): Element[] => {
  const out: Element[] = [];
  const visit = (el: Element): void => {
    out.push(el);
    for (const child of Array.from(el.children)) visit(child);
  };
  visit(root);
  return out;
};
