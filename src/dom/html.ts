// Tagged template literal: html`...` -> reactive DOM (lit-html style).
//
// Standard JavaScript syntax (no custom file format, no compiler, full editor
// support). The template is parsed ONCE per call site — its `strings` array has
// a stable identity, used as a cache key — then cloned per call and bound only
// at the holes. Same template+clone speed as the .sx @html compiler, but at
// runtime and with zero tooling cost.
//
//   html`<button @click=${inc}>${count}</button>`
//     ${expr}        text/child hole (primitive, node, or array — reactive)
//     attr=${expr}   attribute hole (reactive)
//     @event=${fn}   event hole

import { insert, bindAttr, bindProp, bindEvent } from "./template";

type Hole =
  | { kind: "text"; id: string }
  | { kind: "attr"; id: string; name: string }
  | { kind: "prop"; id: string; name: string }
  | { kind: "event"; id: string; name: string };

interface Compiled {
  template: HTMLTemplateElement;
  holes: Hole[];
}

const cache = new WeakMap<TemplateStringsArray, Compiled>();

// matches a trailing `  name=` / `  @event=` / `  .prop=` just before a hole
const ATTR_TAIL = /\s([@.]?[A-Za-z_][\w-]*)=\s*$/;

const compile = (strings: TemplateStringsArray): Compiled => {
  const holes: Hole[] = [];
  let markup = "";

  // Stateful tag scanner: tracks whether the cursor is inside a `<tag>` ACROSS
  // chunks (a per-chunk `lastIndexOf` heuristic breaks on a tag with two or more
  // holes, where the chunk between them has no `<`/`>`). Quote-aware, so a `>`
  // inside an attribute value does not close the tag.
  let inTag = false;
  let quote = "";
  const scan = (s: string): void => {
    for (let j = 0; j < s.length; j++) {
      const ch = s[j];
      if (inTag) {
        if (quote) {
          if (ch === quote) quote = "";
        } else if (ch === '"' || ch === "'") {
          quote = ch;
        } else if (ch === ">") {
          inTag = false;
        }
      } else if (ch === "<") {
        inTag = true;
      }
    }
  };

  for (let i = 0; i < strings.length; i++) {
    let chunk = strings[i];
    scan(chunk); // advance tag state over this chunk -> state AT the hole
    if (i === strings.length - 1) {
      markup += chunk;
      break;
    }

    const id = `sx${i}`;
    if (inTag) {
      const match = chunk.match(ATTR_TAIL);
      const rawName = match ? match[1] : "";
      if (match) chunk = chunk.slice(0, chunk.length - match[0].length);
      markup += `${chunk} data-${id}`;
      if (rawName.startsWith("@")) {
        holes.push({ kind: "event", id, name: rawName.slice(1) });
      } else if (rawName.startsWith(".")) {
        holes.push({ kind: "prop", id, name: rawName.slice(1) });
      } else {
        holes.push({ kind: "attr", id, name: rawName });
      }
    } else {
      markup += `${chunk}<!--${id}-->`;
      holes.push({ kind: "text", id });
    }
  }

  const template = document.createElement("template");
  template.innerHTML = markup;
  return { template, holes };
};

const findComment = (root: Node, id: string): Comment | null => {
  for (let n = root.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === 8 && (n as Comment).data === id) return n as Comment;
    const found = findComment(n, id);
    if (found) return found;
  }
  return null;
};

/** A value used in a reactive position: call it if it's a function, else wrap. */
const accessorOf = (value: unknown): (() => unknown) =>
  typeof value === "function" ? (value as () => unknown) : () => value;

export const html = (
  strings: TemplateStringsArray,
  ...values: unknown[]
): DocumentFragment => {
  let compiled = cache.get(strings);
  if (!compiled) {
    compiled = compile(strings);
    cache.set(strings, compiled);
  }

  const fragment = compiled.template.content.cloneNode(true) as DocumentFragment;

  compiled.holes.forEach((hole, i) => {
    const value = values[i];
    if (hole.kind === "text") {
      const comment = findComment(fragment, hole.id);
      if (comment && comment.parentNode) {
        insert(comment.parentNode, accessorOf(value), comment);
      }
      return;
    }

    const el = fragment.querySelector(`[data-${hole.id}]`);
    if (!el) return;
    el.removeAttribute(`data-${hole.id}`);
    if (hole.kind === "event") {
      bindEvent(el, hole.name, value as (e: Event) => void);
    } else if (hole.kind === "prop") {
      bindProp(el, hole.name, accessorOf(value));
    } else {
      bindAttr(
        el,
        hole.name,
        accessorOf(value) as () => string | number | boolean | null,
      );
    }
  });

  return fragment;
};
