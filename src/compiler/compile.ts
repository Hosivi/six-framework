// The .sx compiler core — a PURE function: (source, filename) -> compiled TS.
//
// Responsibilities (Fase 2, first slice):
//  1. Extract the leading `@styles { ... }` block (brace-matched, @media-safe).
//  2. Scope every class selector with a per-file hash (.card -> .card-<hash>).
//  3. Rewrite `.class("...")` / `.addClass("...", ...)` references to the
//     scoped names — unknown tokens (e.g. Tailwind) are left untouched.
//  4. Append a guarded <style> injection (SSR-safe: skipped when no document).
//
// NOTE: this is a BUILD tool, not framework runtime — it may use Node/Bun.
// It does NOT typecheck .sx files (that needs the language server, later).

import { parseSync } from "oxc-parser";
import {
  parseHtml,
  generateFactory,
  generateInlineExpr,
  htmlRuntimeImport,
} from "./html";

export interface CompileResult {
  /** Transformed TypeScript, ready for the `ts` loader. */
  code: string;
  /** The scoped CSS (also embedded in `code` as a style injection). */
  css: string;
  /** The per-file scope hash. */
  hash: string;
}

/** Deterministic short hash (djb2 -> base36). Stable for a given input. */
const hashName = (input: string): string => {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 33) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).slice(0, 6);
};

/** Find `keyword` at code level, skipping comments and string literals. */
const findAtCodeLevel = (source: string, keyword: string): number => {
  const n = source.length;
  let i = 0;
  while (i < n) {
    const two = source.slice(i, i + 2);
    if (two === "//") {
      const nl = source.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (two === "/*") {
      const close = source.indexOf("*/", i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      i = j;
      continue;
    }
    if (source.startsWith(keyword, i)) return i;
    i++;
  }
  return -1;
};

/** Pull out the first `@styles { ... }` block via brace matching. */
const extractStyles = (
  source: string,
): { css: string | null; rest: string } => {
  const start = findAtCodeLevel(source, "@styles");
  if (start === -1) return { css: null, rest: source };

  const open = source.indexOf("{", start);
  if (open === -1) return { css: null, rest: source };

  let depth = 0;
  let i = open;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return { css: null, rest: source };

  const css = source.slice(open + 1, i);
  const rest = source.slice(0, start) + source.slice(i + 1);
  return { css, rest };
};

/** Scope `.class` selectors with the hash; collect the class names found. */
const scopeCss = (
  css: string,
  hash: string,
): { scoped: string; classes: Set<string> } => {
  const classes = new Set<string>();
  const scoped = css.replace(/\.([A-Za-z_][\w-]*)/g, (_match, name: string) => {
    classes.add(name);
    return `.${name}-${hash}`;
  });
  return { scoped, classes };
};

/** Map every known token in a class string to its scoped name. */
const scopeClassList = (
  list: string,
  classes: Set<string>,
  hash: string,
): string =>
  list
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (classes.has(token) ? `${token}-${hash}` : token))
    .join(" ");

/** Regex fallback: rewrite .class("...") / .addClass("...", ...) references. */
const rewriteCodeRegex = (
  code: string,
  classes: Set<string>,
  hash: string,
): string => {
  const withClass = code.replace(
    /\.class\(\s*(["'])([^"']*)\1/g,
    (_m, quote: string, content: string) =>
      `.class(${quote}${scopeClassList(content, classes, hash)}${quote}`,
  );
  return withClass.replace(
    /\.addClass\(\s*(["'])([^"']*)\1/g,
    (_m, quote: string, content: string) =>
      `.addClass(${quote}${classes.has(content) ? `${content}-${hash}` : content}${quote}`,
  );
};

type AstNode = { type?: string; start?: number; end?: number; [key: string]: unknown };

const walkAst = (node: unknown, visit: (n: AstNode) => void): void => {
  if (!node || typeof node !== "object") return;
  const n = node as AstNode;
  if (typeof n.type === "string") visit(n);
  for (const key in n) {
    const value = n[key];
    if (Array.isArray(value)) value.forEach((child) => walkAst(child, visit));
    else if (value && typeof value === "object") walkAst(value, visit);
  }
};

/**
 * AST-based class rewrite (robust): only real `.class("...")` / `.addClass("...")`
 * calls are scoped — occurrences inside comments or strings are left untouched.
 */
const rewriteClassRefsAst = (
  code: string,
  classes: Set<string>,
  hash: string,
): string => {
  const result = parseSync("module.ts", code);
  if (result.errors.length > 0) throw new Error("oxc parse error");

  const edits: Array<{ start: number; end: number; text: string }> = [];
  walkAst(result.program, (n) => {
    if (n.type !== "CallExpression") return;
    const callee = n.callee as AstNode | undefined;
    if (!callee || callee.type !== "MemberExpression" || callee.computed) return;
    const property = callee.property as AstNode | undefined;
    const prop = property?.name;
    const arg = (n.arguments as AstNode[] | undefined)?.[0];
    if (!arg || arg.type !== "Literal" || arg.start === undefined || arg.end === undefined) return;
    const value = arg.value;
    if (typeof value !== "string") return;

    const quote = code[arg.start];
    if (prop === "class") {
      const scoped = scopeClassList(value, classes, hash);
      edits.push({ start: arg.start, end: arg.end, text: `${quote}${scoped}${quote}` });
    } else if (prop === "addClass") {
      const scoped = classes.has(value) ? `${value}-${hash}` : value;
      edits.push({ start: arg.start, end: arg.end, text: `${quote}${scoped}${quote}` });
    }
  });

  edits.sort((a, b) => b.start - a.start); // apply right-to-left to keep offsets valid
  let out = code;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
};

/** Rewrite class references via AST; fall back to regex if parsing fails. */
const rewriteClasses = (code: string, classes: Set<string>, hash: string): string => {
  try {
    return rewriteClassRefsAst(code, classes, hash);
  } catch {
    return rewriteCodeRegex(code, classes, hash);
  }
};

// Dual-path style injection:
//  - browser: append a deduped <style> to <head>
//  - SSR (no document): register into globalThis.__SX_STYLES__ for collection
const styleInjection = (css: string, hash: string): string => {
  const id = JSON.stringify(`sx-${hash}`);
  const cssJson = JSON.stringify(css);
  return (
    `\n// sx scoped styles (${hash})\n` +
    `{\n` +
    `  const __id = ${id};\n` +
    `  const __css = ${cssJson};\n` +
    `  if (typeof document !== "undefined") {\n` +
    `    if (!document.getElementById(__id)) {\n` +
    `      const __el = document.createElement("style");\n` +
    `      __el.id = __id;\n` +
    `      __el.textContent = __css;\n` +
    `      document.head.appendChild(__el);\n` +
    `    }\n` +
    `  } else {\n` +
    `    const __g = globalThis;\n` +
    `    (__g["__SX_STYLES__"] || (__g["__SX_STYLES__"] = new Map())).set(__id, __css);\n` +
    `  }\n` +
    `}\n`
  );
};

/** Match the block starting at the "{" at `open`; return [inner, closeIndex]. */
const braceMatch = (s: string, open: number): [string, number] => {
  let depth = 0;
  let j = open;
  for (; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return [s.slice(open + 1, j), j];
};

interface HtmlResult {
  code: string;
  found: boolean;
  hoist: string[]; // module-level template decls for inline @html{...}
}

/**
 * Expand @html directives:
 *   @html(name){ markup }  -> top-level factory (module-level / singleton state)
 *   @html{ markup }        -> inline IIFE (per-instance: closes over local scope)
 */
const compileHtmlBlocks = (source: string): HtmlResult => {
  const n = source.length;
  let out = "";
  let i = 0;
  let found = false;
  const hoist: string[] = [];
  let counter = 0;

  while (i < n) {
    const two = source.slice(i, i + 2);

    // Skip comments and strings verbatim so a "@html" inside them is ignored.
    if (two === "//") {
      const nl = source.indexOf("\n", i);
      const end = nl === -1 ? n : nl;
      out += source.slice(i, end);
      i = end;
      continue;
    }
    if (two === "/*") {
      const close = source.indexOf("*/", i + 2);
      const end = close === -1 ? n : close + 2;
      out += source.slice(i, end);
      i = end;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      out += source.slice(i, j);
      i = j;
      continue;
    }

    if (source.startsWith("@html", i)) {
      let k = i + "@html".length;
      while (k < n && /\s/.test(source[k])) k++;

      if (source[k] === "(") {
        const parenEnd = source.indexOf(")", k);
        const braceOpen = source.indexOf("{", parenEnd);
        const name = source.slice(k + 1, parenEnd).trim();
        const [markup, end] = braceMatch(source, braceOpen);
        out += generateFactory(name, parseHtml(markup));
        i = end + 1;
        found = true;
        continue;
      }
      if (source[k] === "{") {
        const [markup, end] = braceMatch(source, k);
        const tvar = `_t_html${counter++}`;
        const parsed = parseHtml(markup);
        hoist.push(`const ${tvar} = template(${JSON.stringify(parsed.templateHtml)});`);
        out += generateInlineExpr(parsed, tvar);
        i = end + 1;
        found = true;
        continue;
      }

      out += "@html"; // not a directive (e.g. @htmlFoo)
      i += "@html".length;
      continue;
    }

    out += ch;
    i++;
  }

  return { code: out, found, hoist };
};

export const compileSx = (
  source: string,
  filename: string,
  options: { htmlRuntime?: string } = {},
): CompileResult => {
  const runtime = options.htmlRuntime ?? "sx/runtime";
  const hash = hashName(filename);

  // 1. @html directives -> precompiled template factories / inline IIFEs
  const html = compileHtmlBlocks(source);
  const preamble = html.found
    ? htmlRuntimeImport(runtime) +
      "\n" +
      (html.hoist.length > 0 ? html.hoist.join("\n") + "\n" : "")
    : "";

  // 2. @styles block -> scoped CSS + class rewrite + style injection
  const { css, rest } = extractStyles(html.code);
  if (css === null) {
    return { code: preamble + html.code, css: "", hash };
  }
  const { scoped, classes } = scopeCss(css, hash);
  const body = rewriteClasses(rest, classes, hash) + styleInjection(scoped, hash);
  return { code: preamble + body, css: scoped, hash };
};
