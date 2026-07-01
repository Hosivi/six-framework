// The node builder + HTML serializer (Layer 1).
// `createNode` returns a plain descriptor whose chainable methods only
// RECORD intent into `modifiers` — they never touch the DOM. The actual
// construction happens elsewhere (.toHTML now, .into to live DOM later).

import type {
  SxNode,
  SxChild,
  Modifier,
  HtmlProps,
  JsonDescriptor,
  Reactive,
  DynamicChild,
  EventHandler,
} from "./types";
import { render } from "./render";
import { encodeHydrationKey, escapeHTML, sanitizeAttributeValue } from "./security";

export const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

/** Resolve a possibly-reactive value to its current concrete value. */
const resolve = <T>(value: Reactive<T>): T =>
  typeof value === "function" ? (value as unknown as () => T)() : value;

const isSxNode = (value: unknown): value is SxNode =>
  typeof value === "object" &&
  value !== null &&
  "tag" in value &&
  "modifiers" in value;

const isDynamicChild = (value: unknown): value is DynamicChild =>
  typeof value === "object" && value !== null && "kind" in value;

export const createNode = (
  tag: string,
  children?: SxChild,
  props?: HtmlProps,
): SxNode => {
  const modifiers: Modifier[] = [];

  const onEvent =
    (event: string) =>
    (handler: EventHandler): SxNode => {
      modifiers.push({ type: "on", event, handler });
      return node;
    };

  const node: SxNode = {
    tag,
    children: children ?? null,
    props: props ?? {},
    modifiers,

    class(value) {
      modifiers.push({ type: "class", value });
      return node;
    },
    addClass(name, when) {
      modifiers.push({ type: "addClass", name, when });
      return node;
    },
    attr(key, value) {
      modifiers.push({ type: "attr", key, value });
      return node;
    },
    style(name, value) {
      modifiers.push({ type: "style", name, value });
      return node;
    },
    ref(callback) {
      modifiers.push({ type: "ref", callback });
      return node;
    },
    id(value) {
      modifiers.push({ type: "attr", key: "id", value });
      return node;
    },
    text(value) {
      modifiers.push({ type: "text", value });
      return node;
    },
    on(event, handler) {
      modifiers.push({ type: "on", event, handler });
      return node;
    },

    onClick: onEvent("click"),
    onDblClick: onEvent("dblclick"),
    onInput: onEvent("input"),
    onChange: onEvent("change"),
    onSubmit: onEvent("submit"),
    onFocus: onEvent("focus"),
    onBlur: onEvent("blur"),
    onKeyDown: onEvent("keydown"),
    onKeyUp: onEvent("keyup"),
    onMouseEnter: onEvent("mouseenter"),
    onMouseLeave: onEvent("mouseleave"),
    onScroll: onEvent("scroll"),

    into(target) {
      return render(node, target);
    },
    toHTML() {
      return serialize(node);
    },
    toJSON() {
      return toJSON(node);
    },
  };

  return node;
};

interface Collected {
  attrs: Record<string, string>;
  text: string | null;
}

/** Flatten props + modifiers into the final attribute map (class first). */
export const collect = (node: SxNode): Collected => {
  const rest: Record<string, string> = {};
  const classes: string[] = [];
  const styles: string[] = [];
  let text: string | null = null;

  const setAttr = (key: string, value: string | number | boolean | null): void => {
    if (value === null || value === false) return;
    if (key === "class") {
      if (value) classes.unshift(String(value));
      return;
    }
    const attrValue = sanitizeAttributeValue(key, value, node.tag);
    if (attrValue !== null) rest[key] = attrValue;
  };

  for (const [key, value] of Object.entries(node.props)) {
    setAttr(key, resolve(value));
  }

  for (const m of node.modifiers) {
    if (m.type === "class") {
      const c = resolve(m.value);
      if (c) classes.push(c);
    } else if (m.type === "addClass") {
      if (m.when()) classes.push(m.name);
    } else if (m.type === "attr") {
      setAttr(m.key, resolve(m.value));
    } else if (m.type === "style") {
      const v = resolve(m.value);
      if (v !== null && v !== "") styles.push(`${m.name}: ${v}`);
    } else if (m.type === "text") {
      text = String(resolve(m.value));
    }
    // "on" handlers have no HTML representation (SSR has no live events).
  }

  const attrs: Record<string, string> = {};
  if (classes.length > 0) attrs["class"] = classes.join(" ");
  Object.assign(attrs, rest);
  if (styles.length > 0) {
    const inline = styles.join("; ");
    attrs["style"] = attrs["style"] ? `${attrs["style"]}; ${inline}` : inline;
  }

  return { attrs, text };
};

export const serializeChild = (child: SxChild): string => {
  if (child === null || child === undefined || child === false || child === true) {
    return "";
  }
  if (typeof child === "function") return serializeChild(child());
  if (Array.isArray(child)) return child.map(serializeChild).join("");
  if (isDynamicChild(child)) {
    const wrapRegion = (open: string, close: string, branch?: SxNode): string =>
      `<!--${open}-->${branch ? serialize(branch) : ""}<!--${close}-->`;
    if (child.kind === "when") {
      const branch = child.condition() ? child.truthy() : child.falsy?.();
      // Wrap in markers so the client hydrator can find the region boundary.
      return wrapRegion("sx:w", "/sx:w", branch);
    }
    if (child.kind === "each") {
      // Each item is preceded by <!--sx:i:KEY--> so the hydrator can adopt existing nodes.
      const parts = child.items().map((item, i) => {
        const k = encodeHydrationKey(String(child.key(item, i)));
        return `<!--sx:i:${k}-->${serialize(child.renderItem(item, i))}`;
      });
      return `<!--sx:e-->${parts.join("")}<!--/sx:e-->`;
    }
    if (child.kind === "match") {
      const active = child.cases.find(([cond]) => cond());
      const branch = active ? active[1]() : child.fallback?.();
      return wrapRegion("sx:m", "/sx:m", branch);
    }
    if (child.kind === "portal") return "";
    if (child.kind === "error") {
      try {
        return wrapRegion("sx:r", "/sx:r", child.children());
      } catch (err) {
        return wrapRegion("sx:r", "/sx:r", child.fallback(err, () => {}));
      }
    }
    return "";
  }
  // Trusted escape hatch: raw DOM nodes serialize via outerHTML for composition.
  // Do not pass user-authored DOM here unless it has already been sanitized.
  if (typeof child === "object" && child !== null && "nodeType" in child) {
    const node = child as { outerHTML?: string };
    return typeof node.outerHTML === "string" ? node.outerHTML : "";
  }
  if (isSxNode(child)) return serialize(child);
  return escapeHTML(child);
};

export const serializeAttrs = (attrs: Record<string, string>): string =>
  Object.entries(attrs)
    .map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${escapeHTML(v)}"`))
    .join("");

export const serialize = (node: SxNode): string => {
  const { attrs, text } = collect(node);
  const attrStr = serializeAttrs(attrs);

  if (VOID_ELEMENTS.has(node.tag)) {
    return `<${node.tag}${attrStr} />`;
  }

  const inner = text !== null ? escapeHTML(text) : serializeChild(node.children);
  return `<${node.tag}${attrStr}>${inner}</${node.tag}>`;
};

const collectJSONChildren = (
  child: SxChild,
  out: Array<JsonDescriptor | string>,
): void => {
  if (child === null || child === undefined || child === false || child === true) return;
  if (typeof child === "function") {
    collectJSONChildren(child(), out);
    return;
  }
  if (Array.isArray(child)) {
    for (const c of child) collectJSONChildren(c, out);
    return;
  }
  if (isDynamicChild(child)) {
    if (child.kind === "when") {
      const branch = child.condition() ? child.truthy() : child.falsy?.();
      if (branch) out.push(toJSON(branch));
    } else if (child.kind === "each") {
      child.items().forEach((item, i) => out.push(toJSON(child.renderItem(item, i))));
    } else if (child.kind === "match") {
      const active = child.cases.find(([cond]) => cond());
      const branch = active ? active[1]() : child.fallback?.();
      if (branch) out.push(toJSON(branch));
    } else if (child.kind === "error") {
      try {
        out.push(toJSON(child.children()));
      } catch {
        // silently skip on error in JSON serialization
      }
    }
    // portal: no JSON contribution
    return;
  }
  if (isSxNode(child)) {
    out.push(toJSON(child));
    return;
  }
  out.push(String(child));
};

export const toJSON = (node: SxNode): JsonDescriptor => {
  const { attrs, text } = collect(node);
  const children: Array<JsonDescriptor | string> = [];
  if (text !== null) children.push(text);
  else collectJSONChildren(node.children, children);
  return { tag: node.tag, attrs, children };
};
