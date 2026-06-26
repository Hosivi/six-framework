import { test, expect } from "bun:test";
import { signal } from "../src/reactive/index";
import { div, ul, li, span } from "../src/dom/tags";
import { when, each } from "../src/dom/control";

test("when: renders the active branch in HTML", () => {
  const ok = signal(true);
  const node = div([when(() => ok(), () => span("yes"), () => span("no"))]);
  expect(node.toHTML()).toBe(`<div><span>yes</span></div>`);
  ok.set(false);
  expect(node.toHTML()).toBe(`<div><span>no</span></div>`);
});

test("when: no falsy branch renders nothing", () => {
  const ok = signal(false);
  const node = div([when(() => ok(), () => span("yes"))]);
  expect(node.toHTML()).toBe(`<div></div>`);
});

test("each: renders a keyed list in HTML", () => {
  const items = signal([
    { id: 1, name: "Lima" },
    { id: 2, name: "Cusco" },
  ]);
  const node = ul(each(items, (c) => li(c.name), (c) => c.id));
  expect(node.toHTML()).toBe(`<ul><li>Lima</li><li>Cusco</li></ul>`);
  items.set([{ id: 3, name: "Piura" }]);
  expect(node.toHTML()).toBe(`<ul><li>Piura</li></ul>`);
});

test("each: empty list renders nothing", () => {
  const items = signal<{ id: number; name: string }[]>([]);
  const node = ul(each(items, (c) => li(c.name), (c) => c.id));
  expect(node.toHTML()).toBe(`<ul></ul>`);
});

test("named events register an 'on' modifier", () => {
  const node = div("x").onClick(() => {});
  expect(node.modifiers.some((m) => m.type === "on" && m.event === "click")).toBe(true);
});
