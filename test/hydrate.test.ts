// Tests for hydrate() — attach reactivity to server-rendered HTML.

import { test, expect } from "bun:test";
import { createRoot, signal } from "../src/reactive/index";
import { div, ul, li, span } from "../src/dom/tags";
import { when, each } from "../src/dom/control";
import { hydrate } from "../src/dom/hydrate";

// Simulate the SSR → client cycle: render to HTML, inject into a DOM node, hydrate.
const ssr = (html: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
};

test("hydrates a reactive text binding without rebuilding the element", () => {
  const count = signal(0);
  const App = () => div(() => String(count())).class("c");

  const host = ssr(App().toHTML());
  const existingEl = host.firstElementChild!;

  createRoot(() => hydrate(App(), host));

  // The SAME element reference must be reused — no DOM rebuild.
  expect(host.firstElementChild).toBe(existingEl);
  expect(existingEl.textContent).toBe("0");

  // Reactivity must be wired: update propagates without re-render.
  count.set(7);
  expect(existingEl.textContent).toBe("7");
});

test("hydrates class bindings reactively", () => {
  const active = signal(false);
  const App = () => div("x").addClass("active", () => active());

  const host = ssr(App().toHTML());
  createRoot(() => hydrate(App(), host));

  expect(host.querySelector("div")?.className).toBe("");
  active.set(true);
  expect(host.querySelector("div")?.className).toBe("active");
});

test("hydrates a when() region — true branch preserved, updates work", () => {
  const show = signal(true);
  const App = () => div(when(() => show(), () => span("yes"), () => span("no")));

  const host = ssr(App().toHTML());
  createRoot(() => hydrate(App(), host));

  expect(host.querySelector("span")?.textContent).toBe("yes");

  show.set(false);
  expect(host.querySelector("span")?.textContent).toBe("no");

  show.set(true);
  expect(host.querySelector("span")?.textContent).toBe("yes");
});

test("hydrates a when() region — false branch (empty) preserved", () => {
  const show = signal(false);
  const App = () => div(when(() => show(), () => span("yes")));

  const host = ssr(App().toHTML());
  createRoot(() => hydrate(App(), host));

  expect(host.querySelector("span")).toBeNull();

  show.set(true);
  expect(host.querySelector("span")?.textContent).toBe("yes");
});

test("hydrates an each() region — existing items preserved, keyed updates work", () => {
  type Item = { id: number; name: string };
  const items = signal<Item[]>([
    { id: 1, name: "A" },
    { id: 2, name: "B" },
  ]);
  const App = () => ul(each(items, (t) => li(t.name), (t) => t.id));

  const host = ssr(App().toHTML());
  const existingLis = Array.from(host.querySelectorAll("li"));

  createRoot(() => hydrate(App(), host));

  // Both existing <li> elements must be reused.
  const hydratedLis = Array.from(host.querySelectorAll("li"));
  expect(hydratedLis[0]).toBe(existingLis[0]);
  expect(hydratedLis[1]).toBe(existingLis[1]);

  // Keyed update: add an item — only new node is created.
  items.update((prev) => [...prev, { id: 3, name: "C" }]);
  expect(host.querySelectorAll("li").length).toBe(3);
  expect(host.querySelectorAll("li")[2].textContent).toBe("C");

  // Remove an item.
  items.update((prev) => prev.filter((t) => t.id !== 1));
  expect(host.querySelectorAll("li").length).toBe(2);
  expect(host.querySelectorAll("li")[0].textContent).toBe("B");
});

test("hydrates direct sibling when() regions at their original position", () => {
  const show = signal(false);
  const App = () => div([span("before"), when(() => show(), () => span("yes")), span("after")]);

  const host = ssr(App().toHTML());
  createRoot(() => hydrate(App(), host));
  const root = host.querySelector("div")!;

  expect(Array.from(root.children).map((child) => child.textContent)).toEqual([
    "before",
    "after",
  ]);

  show.set(true);
  expect(Array.from(root.children).map((child) => child.textContent)).toEqual([
    "before",
    "yes",
    "after",
  ]);
});

test("hydrates direct sibling each() regions at their original position", () => {
  const items = signal([1, 2]);
  const App = () =>
    div([span("before"), each(items, (item) => span(String(item)), (item) => item), span("after")]);

  const host = ssr(App().toHTML());
  createRoot(() => hydrate(App(), host));
  const root = host.querySelector("div")!;

  expect(Array.from(root.children).map((child) => child.textContent)).toEqual([
    "before",
    "1",
    "2",
    "after",
  ]);
});

test("hydrates empty direct sibling each() regions before later population", () => {
  const items = signal<number[]>([]);
  const App = () =>
    div([span("before"), each(items, (item) => span(String(item)), (item) => item), span("after")]);

  const host = ssr(App().toHTML());
  createRoot(() => hydrate(App(), host));
  const root = host.querySelector("div")!;

  expect(Array.from(root.children).map((child) => child.textContent)).toEqual([
    "before",
    "after",
  ]);

  items.set([1, 2]);
  expect(Array.from(root.children).map((child) => child.textContent)).toEqual([
    "before",
    "1",
    "2",
    "after",
  ]);
});

test("falls back to fresh render on tag mismatch", () => {
  const host = document.createElement("div");
  host.innerHTML = "<section>old</section>"; // descriptor says <div>

  createRoot(() => hydrate(div("new"), host));

  // Mismatch: hydrate inserts a fresh <div> (the stale <section> remains).
  expect(host.querySelector("div")?.textContent).toBe("new");
});

test("SSR output contains hydration markers", () => {
  const show = signal(true);
  const html = div(when(() => show(), () => span("x"))).toHTML();
  expect(html).toContain("<!--sx:w-->");
  expect(html).toContain("<!--/sx:w-->");

  const items = signal([1, 2]);
  const listHtml = ul(each(items, (n) => li(String(n)))).toHTML();
  expect(listHtml).toContain("<!--sx:e-->");
  expect(listHtml).toContain("<!--sx:i:0-->");
  expect(listHtml).toContain("<!--/sx:e-->");
});
