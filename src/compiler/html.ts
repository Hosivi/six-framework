// @html markup compiler (Fase 2, Stage 2) — the Solid-style speed path.
//
// parseHtml: markup -> { static template string, dynamic bindings indexed by
//   element pre-order position }.
// generate:  that result -> TS code that builds the node by CLONING a template
//   once and wiring effects ONLY at the holes.
//
// First slice supports: nested elements, static attributes, dynamic attributes
// `attr={expr}`, events `onEvent={expr}`, and text holes `{expr}` (a hole is
// appended to its parent — put leading static text BEFORE the hole).

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

export type HtmlBinding =
  | { kind: "text"; path: number; expr: string }
  | { kind: "attr"; path: number; name: string; expr: string }
  | { kind: "event"; path: number; event: string; expr: string };

export interface ParsedHtml {
  templateHtml: string;
  bindings: HtmlBinding[];
}

const isName = (ch: string): boolean => /[A-Za-z0-9:_-]/.test(ch);

/** onClick -> click, onKeyDown -> keydown; null if not an event attribute. */
const eventName = (attr: string): string | null =>
  /^on[A-Z]/.test(attr) ? attr.slice(2).toLowerCase() : null;

export const parseHtml = (markup: string): ParsedHtml => {
  const src = markup;
  let i = 0;
  let html = "";
  let counter = 0;
  const bindings: HtmlBinding[] = [];

  const skipWs = (): void => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };

  // src[i] === "{": return the balanced inner expression, advance past "}".
  const readExpr = (): string => {
    const start = i;
    let depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          i++;
          return src.slice(start + 1, i - 1).trim();
        }
      }
    }
    return src.slice(start + 1).trim();
  };

  const parseChildren = (parentIndex: number): void => {
    while (i < src.length) {
      if (src[i] === "<" && src[i + 1] === "/") return; // parent's closing tag
      if (src[i] === "<") {
        parseElement();
        continue;
      }
      if (src[i] === "{") {
        bindings.push({ kind: "text", path: parentIndex, expr: readExpr() });
        continue;
      }
      let text = "";
      while (i < src.length && src[i] !== "<" && src[i] !== "{") {
        text += src[i];
        i++;
      }
      html += text;
    }
  };

  const parseElement = (): void => {
    i++; // skip "<"
    let tag = "";
    while (i < src.length && /[A-Za-z0-9-]/.test(src[i])) {
      tag += src[i];
      i++;
    }
    const index = counter++;
    let staticAttrs = "";

    while (i < src.length) {
      skipWs();
      if (src[i] === ">" || src[i] === "/" || i >= src.length) break;
      let name = "";
      while (i < src.length && isName(src[i])) {
        name += src[i];
        i++;
      }
      if (name === "") break;
      skipWs();
      if (src[i] === "=") {
        i++;
        skipWs();
        if (src[i] === "{") {
          const expr = readExpr();
          const ev = eventName(name);
          if (ev) bindings.push({ kind: "event", path: index, event: ev, expr });
          else bindings.push({ kind: "attr", path: index, name, expr });
        } else if (src[i] === '"' || src[i] === "'") {
          const quote = src[i];
          i++;
          let value = "";
          while (i < src.length && src[i] !== quote) {
            value += src[i];
            i++;
          }
          i++; // closing quote
          staticAttrs += ` ${name}="${value}"`;
        }
      } else {
        staticAttrs += ` ${name}`; // boolean attribute
      }
    }

    const selfClose = src[i] === "/";
    if (selfClose) i++;
    i++; // skip ">"

    html += `<${tag}${staticAttrs}>`;
    if (VOID.has(tag)) return;
    if (selfClose) {
      html += `</${tag}>`;
      return;
    }

    parseChildren(index);
    if (src[i] === "<" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== ">") i++;
      i++; // skip ">"
    }
    html += `</${tag}>`;
  };

  skipWs();
  if (src[i] === "<") parseElement();

  return { templateHtml: html, bindings };
};

/** The import the generated factories need (one per compiled file). */
export const htmlRuntimeImport = (runtime: string): string =>
  `import { template, walkElements, insert, bindAttr, bindEvent } from ${JSON.stringify(runtime)};`;

/** Generate just the template + factory for a parsed @html block (no import). */
export const generateFactory = (name: string, parsed: ParsedHtml): string => {
  const out: string[] = [];
  out.push(`const _t_${name} = template(${JSON.stringify(parsed.templateHtml)});`);
  out.push(`export const ${name} = () => {`);
  out.push(`  const _el = _t_${name}();`);
  if (parsed.bindings.length > 0) out.push(`  const _n = walkElements(_el);`);
  for (const b of parsed.bindings) {
    if (b.kind === "text") {
      out.push(`  insert(_n[${b.path}], () => (${b.expr}));`);
    } else if (b.kind === "attr") {
      out.push(`  bindAttr(_n[${b.path}], ${JSON.stringify(b.name)}, () => (${b.expr}));`);
    } else {
      out.push(`  bindEvent(_n[${b.path}], ${JSON.stringify(b.event)}, ${b.expr});`);
    }
  }
  out.push(`  return _el;`);
  out.push(`};`);
  return out.join("\n");
};

/** Generate a standalone module (import + factory) for a parsed @html block. */
export const generate = (
  name: string,
  parsed: ParsedHtml,
  runtime: string,
): string => `${htmlRuntimeImport(runtime)}\n${generateFactory(name, parsed)}`;

/**
 * Generate an inline IIFE for an `@html{...}` expression. The template is
 * declared elsewhere (hoisted to module scope) and referenced by `templateVar`;
 * the bindings close over the SURROUNDING function scope — i.e. per-instance.
 */
export const generateInlineExpr = (
  parsed: ParsedHtml,
  templateVar: string,
): string => {
  const out: string[] = ["(() => {"];
  out.push(`  const _el = ${templateVar}();`);
  if (parsed.bindings.length > 0) out.push(`  const _n = walkElements(_el);`);
  for (const b of parsed.bindings) {
    if (b.kind === "text") {
      out.push(`  insert(_n[${b.path}], () => (${b.expr}));`);
    } else if (b.kind === "attr") {
      out.push(`  bindAttr(_n[${b.path}], ${JSON.stringify(b.name)}, () => (${b.expr}));`);
    } else {
      out.push(`  bindEvent(_n[${b.path}], ${JSON.stringify(b.event)}, ${b.expr});`);
    }
  }
  out.push("  return _el;");
  out.push("})()");
  return out.join("\n");
};

/** Convenience: parse + generate in one step. */
export const compileHtml = (
  name: string,
  markup: string,
  runtime: string,
): string => generate(name, parseHtml(markup), runtime);
