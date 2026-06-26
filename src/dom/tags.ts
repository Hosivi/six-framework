// HTML tags as named TypeScript functions (Layer 1).
// Each tag is its own export so bundlers tree-shake what you don't import.
// Signature: tag(children?, props?) — children first, props second.

import { createNode } from "./node";
import type { SxChild, HtmlProps, SxNode } from "./types";

const tag =
  (name: string) =>
  (children?: SxChild, props?: HtmlProps): SxNode =>
    createNode(name, children, props);

// Structure
export const div = tag("div");
export const span = tag("span");
export const p = tag("p");
export const section = tag("section");
export const article = tag("article");
export const header = tag("header");
export const footer = tag("footer");
export const main = tag("main");
export const nav = tag("nav");
export const aside = tag("aside");

// Headings
export const h1 = tag("h1");
export const h2 = tag("h2");
export const h3 = tag("h3");
export const h4 = tag("h4");
export const h5 = tag("h5");
export const h6 = tag("h6");

// Inline text
export const strong = tag("strong");
export const em = tag("em");
export const a = tag("a");
export const code = tag("code");
export const pre = tag("pre");
export const label = tag("label");

// Forms
export const button = tag("button");
export const input = tag("input");
export const select = tag("select");
export const option = tag("option");
export const textarea = tag("textarea");
export const form = tag("form");

// Lists & tables
export const ul = tag("ul");
export const ol = tag("ol");
export const li = tag("li");
export const table = tag("table");
export const tr = tag("tr");
export const td = tag("td");
export const th = tag("th");

// Media
export const img = tag("img");

// Escape hatch — custom elements, SVG, or a dynamic tag name.
// (Addresses the "named tags only" gap: web components / SVG still work.)
export const el = (name: string, children?: SxChild, props?: HtmlProps): SxNode =>
  createNode(name, children, props);
