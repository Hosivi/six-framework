import { test, expect } from "bun:test";
import { parseHtml, generate } from "../src/compiler/html";
import { template, walkElements, insert, bindEvent } from "../src/dom/template";
import { signal } from "../src/reactive/index";

// ---- parser ----

test("parses a static element with a static attribute", () => {
  const { templateHtml, bindings } = parseHtml(`<div class="card"></div>`);
  expect(templateHtml).toBe(`<div class="card"></div>`);
  expect(bindings).toEqual([]);
});

test("text hole -> insert binding at the parent element index", () => {
  const { templateHtml, bindings } = parseHtml(`<h1>{title()}</h1>`);
  expect(templateHtml).toBe(`<h1></h1>`);
  expect(bindings).toEqual([{ kind: "text", path: 0, expr: "title()" }]);
});

test("dynamic attribute -> bindAttr binding (omitted from template)", () => {
  const { templateHtml, bindings } = parseHtml(`<div class={cls()}></div>`);
  expect(templateHtml).toBe(`<div></div>`);
  expect(bindings).toEqual([{ kind: "attr", path: 0, name: "class", expr: "cls()" }]);
});

test("onClick -> event binding named 'click'", () => {
  const { bindings } = parseHtml(`<button onClick={inc}></button>`);
  expect(bindings).toEqual([{ kind: "event", path: 0, event: "click", expr: "inc" }]);
});

test("nested elements get pre-order indices", () => {
  const markup = `<div><button onClick={dec}>-</button><span>{n()}</span><button onClick={inc}>+</button></div>`;
  const { templateHtml, bindings } = parseHtml(markup);
  expect(templateHtml).toBe(
    `<div><button>-</button><span></span><button>+</button></div>`,
  );
  expect(bindings).toEqual([
    { kind: "event", path: 1, event: "click", expr: "dec" },
    { kind: "text", path: 2, expr: "n()" },
    { kind: "event", path: 3, event: "click", expr: "inc" },
  ]);
});

test("keeps leading static text before a trailing hole", () => {
  const { templateHtml, bindings } = parseHtml(`<p>Hola {name()}</p>`);
  expect(templateHtml).toBe(`<p>Hola </p>`);
  expect(bindings).toEqual([{ kind: "text", path: 0, expr: "name()" }]);
});

// ---- codegen ----

test("generate emits a template + factory using the runtime helpers", () => {
  const code = generate("greeting", parseHtml(`<h1>{title()}</h1>`), "sx/runtime");
  expect(code).toContain(`from "sx/runtime"`);
  expect(code).toContain(`template("<h1></h1>")`);
  expect(code).toContain(`export const greeting = () =>`);
  expect(code).toContain(`insert(_n[0], () => (title()))`);
});

// ---- end-to-end: parsed markup -> live working component ----

test("parsed markup renders a live, fine-grained counter", () => {
  const markup = `<div><button onClick={dec}>-</button><span>{n()}</span><button onClick={inc}>+</button></div>`;
  const parsed = parseHtml(markup);

  // Emulate the generated factory by hand (proves parse + runtime together).
  const n = signal(0);
  const handlers: Record<string, () => void> = {
    dec: () => n.update((c) => c - 1),
    inc: () => n.update((c) => c + 1),
  };
  const exprs: Record<string, () => unknown> = { "n()": () => n() };

  const el = template(parsed.templateHtml)();
  const nodes = walkElements(el);
  for (const b of parsed.bindings) {
    if (b.kind === "text") insert(nodes[b.path], exprs[b.expr]);
    else if (b.kind === "event") bindEvent(nodes[b.path], b.event, handlers[b.expr]);
  }

  const host = document.createElement("div");
  host.appendChild(el);
  const span = host.querySelector("span")!;
  const buttons = host.querySelectorAll("button");
  expect(span.textContent).toBe("0");

  (buttons[1] as HTMLButtonElement).click(); // +
  expect(span.textContent).toBe("1");
  (buttons[0] as HTMLButtonElement).click(); // -
  expect(span.textContent).toBe("0");
});
