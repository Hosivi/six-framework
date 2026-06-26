// Live-DOM tests (happy-dom). Proves the runtime behavior we previously only
// verified via curl + reasoning: fine-grained updates and keyed reconciliation.

import { test, expect } from "bun:test";
import { signal } from "../src/reactive/index";
import { div, span, button, ul, li } from "../src/dom/tags";
import { each } from "../src/dom/control";

test(".into updates ONLY the bound text node (fine-grained)", () => {
  const count = signal(0);
  const host = document.createElement("div");
  div([span(() => String(count()))]).into(host);

  const sp = host.querySelector("span")!;
  expect(sp.textContent).toBe("0");
  const textNode = sp.firstChild;

  count.set(5);
  expect(sp.textContent).toBe("5");
  expect(sp.firstChild).toBe(textNode); // same node — NOT recreated
});

test(".onClick wires a live event", () => {
  const count = signal(0);
  const host = document.createElement("div");
  div([
    span(() => String(count())),
    button("inc").onClick(() => count.update((c) => c + 1)),
  ]).into(host);

  host.querySelector("button")!.click();
  expect(host.querySelector("span")!.textContent).toBe("1");
});

test("each reuses DOM nodes by key (keyed reconciliation)", () => {
  const items = signal([
    { id: 1, t: "a" },
    { id: 2, t: "b" },
  ]);
  const host = document.createElement("div");
  ul(each(items, (i) => li(i.t), (i) => i.id)).into(host);

  const lis = () => Array.from(host.querySelectorAll("li"));
  const firstLi = lis()[0];

  items.update((l) => [...l, { id: 3, t: "c" }]); // append
  expect(lis().map((e) => e.textContent)).toEqual(["a", "b", "c"]);
  expect(lis()[0]).toBe(firstLi); // existing node reused

  items.update((l) => l.filter((x) => x.id !== 2)); // remove middle
  expect(lis().map((e) => e.textContent)).toEqual(["a", "c"]);
  expect(lis()[0]).toBe(firstLi); // STILL the same node
});

test("a raw DOM node composes as a fluent child", () => {
  const host = document.createElement("div");
  const childEl = document.createElement("button");
  childEl.textContent = "x";
  div([span("a"), childEl]).into(host);

  const root = host.querySelector("div")!;
  expect(root.children.length).toBe(2); // span + button
  expect(host.querySelector("button")!.textContent).toBe("x");
});

test("dispose removes the element and stops updates", () => {
  const count = signal(0);
  const host = document.createElement("div");
  const dispose = div([span(() => String(count()))]).into(host);
  expect(host.querySelector("span")!.textContent).toBe("0");

  dispose();
  expect(host.querySelector("span")).toBe(null);
  count.set(9); // must not throw
});
