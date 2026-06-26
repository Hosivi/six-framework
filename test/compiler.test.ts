import { test, expect } from "bun:test";
import { compileSx } from "../src/compiler/compile";

const FILE = "Card.sx";

test("passthrough when there is no @styles block", () => {
  const src = `export const x = 1;`;
  const { code, css } = compileSx(src, FILE);
  expect(code).toBe(src);
  expect(css).toBe("");
});

test("@styles can appear after the functional code (bottom of file)", () => {
  const src = `const n = div([]).class("card");\n@styles { .card { color: red } }`;
  const { code, css, hash } = compileSx(src, FILE);
  expect(css).toContain(`.card-${hash}`);
  expect(code).toContain(`.class("card-${hash}")`);
  expect(code).not.toContain("@styles");
});

test("ignores @styles appearing inside a string literal", () => {
  const src = `const msg = "uses @styles here";\nconst n = div([]).class("card");\n@styles { .card { color: red } }`;
  const { code, css, hash } = compileSx(src, FILE);
  expect(css).toContain(`.card-${hash}`); // the REAL block was extracted
  expect(code).toContain(`"uses @styles here"`); // the string is untouched
  expect(code).toContain(`.class("card-${hash}")`);
});

test("scopes css selectors with a stable per-file hash", () => {
  const src = `@styles {\n.card { padding: 16px }\n}\nexport const x = 1;`;
  const { css, hash } = compileSx(src, FILE);
  expect(css).toContain(`.card-${hash}`);
  expect(css).not.toContain(".card {");
});

test("hash is deterministic for the same filename", () => {
  const a = compileSx(`@styles { .x { color: red } }\n`, FILE);
  const b = compileSx(`@styles { .x { color: red } }\n`, FILE);
  expect(a.hash).toBe(b.hash);
});

test("rewrites .class() references to scoped names", () => {
  const src = `@styles { .card { padding: 1px } }\nconst n = div([]).class("card");`;
  const { code, hash } = compileSx(src, FILE);
  expect(code).toContain(`.class("card-${hash}")`);
});

test("leaves unknown classes (Tailwind) untouched in .class()", () => {
  const src = `@styles { .card { padding: 1px } }\nconst n = div([]).class("card flex gap-4");`;
  const { code, hash } = compileSx(src, FILE);
  expect(code).toContain(`.class("card-${hash} flex gap-4")`);
});

test("rewrites .addClass() first argument", () => {
  const src = `@styles { .active { color: red } }\nconst n = div([]).addClass("active", () => on());`;
  const { code, hash } = compileSx(src, FILE);
  expect(code).toContain(`.addClass("active-${hash}",`);
});

test("injects a guarded, deduped style element", () => {
  const src = `@styles { .card { padding: 1px } }\nexport const x = 1;`;
  const { code, hash } = compileSx(src, FILE);
  expect(code).toContain(`sx-${hash}`);
  expect(code).toContain("document.createElement");
  expect(code).toContain('typeof document !== "undefined"');
  expect(code).toContain("__SX_STYLES__"); // SSR collection branch
});

test("handles nested braces (@media) and removes the block", () => {
  const src = `@styles {\n.card { color: red }\n@media (min-width: 700px) { .card { color: blue } }\n}\nconst n = 1;`;
  const { css, code } = compileSx(src, FILE);
  expect(css).toContain("@media");
  expect(code).not.toContain("@styles");
});

test("inlines @html blocks as precompiled template factories", () => {
  const src = `@html(Card){ <div>{x()}</div> }\nconst x = () => 1;`;
  const { code } = compileSx(src, FILE, { htmlRuntime: "sx/runtime" });
  expect(code).toContain(`template("<div></div>")`);
  expect(code).toContain(`export const Card = () =>`);
  expect(code).toContain(`from "sx/runtime"`);
  expect(code).not.toContain("@html");
});

test("AST class rewrite ignores .class() inside comments and strings", () => {
  const src = [
    `@styles { .card { color: red } }`,
    `const label = "see .class('card') in docs";`,
    `// kept: div([]).class("card")`,
    `const n = div([]).class("card");`,
  ].join("\n");
  const { code, hash } = compileSx(src, FILE);
  expect(code).toContain(`.class("card-${hash}")`); // the real call is scoped
  expect(code).toContain(`.class('card')`); // string literal untouched
  expect(code).toContain(`// kept: div([]).class("card")`); // comment untouched
});

test("inline @html{...} compiles to an IIFE with a hoisted template", () => {
  const src = `export const C = () => { const n = signal(0); return @html{<span>{n()}</span>}; };`;
  const { code } = compileSx(src, FILE, { htmlRuntime: "sx/runtime" });
  expect(code).toContain(`template("<span></span>")`);
  expect(code).toContain(`(() => {`);
  expect(code).toContain(`insert(_n[0], () => (n()))`);
  expect(code).not.toContain("@html");
});
