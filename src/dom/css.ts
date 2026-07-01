// css — scoped styles from a plain object (functional CSS-in-JS, no string blob).
//
// Returns a scoped className and registers the rule (browser <head> or SSR
// registry). Keys are CSS properties (camelCase → kebab-case); a key whose value
// is a nested object is a nested selector:
//   "&"-bearing key  -> "&:hover"        => .sx-xxx:hover
//   ":"/"["-prefixed  -> ":hover"        => .sx-xxx:hover
//   anything else     -> ".child" / "p"  => .sx-xxx .child   (descendant)
//
//   const card = css({
//     background: "white",
//     padding: "1rem",
//     ":hover": { boxShadow: "0 2px 8px rgba(0,0,0,.1)" },
//   });
//   div("...").class(card);   // card === "sx-a3f9"

import { registerStyle } from "./styles";

export type CSSValue = string | number;

export interface CSSObject {
  [property: string]: CSSValue | CSSObject;
}

/** Deterministic short hash (djb2 → base36) — stable, so equal objects dedup. */
const hash = (input: string): string => {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(h, 33) + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36).slice(0, 6);
};

/** camelCase → kebab-case, leaving CSS custom properties (--x) untouched. */
const kebab = (prop: string): string =>
  prop.startsWith("--") ? prop : prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** Resolve a nested key into a full selector relative to `parent`. */
const nestedSelector = (parent: string, key: string): string => {
  if (key.includes("&")) return key.replace(/&/g, parent);
  if (key.startsWith(":") || key.startsWith("[")) return parent + key;
  return `${parent} ${key}`;
};

/** Serialize `obj` into CSS rule text under `selector` (own decls + nested rules). */
const serialize = (selector: string, obj: CSSObject): string => {
  let declarations = "";
  let nested = "";
  for (const key in obj) {
    const value = obj[key];
    if (value !== null && typeof value === "object") {
      nested += serialize(nestedSelector(selector, key), value);
    } else {
      declarations += `${kebab(key)}:${value};`;
    }
  }
  return (declarations ? `${selector}{${declarations}}` : "") + nested;
};

/**
 * Build a scoped className from a style object. Equal objects produce the same
 * class (deduped) and the rule is registered exactly once.
 * Trusted-code API: sanitize untrusted CSS data before calling css().
 */
export const css = (styles: CSSObject): string => {
  const className = `sx-${hash(JSON.stringify(styles))}`;
  registerStyle(className, serialize(`.${className}`, styles));
  return className;
};
