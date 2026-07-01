// Regression tests for hydration node adoption — void elements and escaped text
// must be ADOPTED (same DOM node reused), not rebuilt. A byte-exact
// outerHTML===serialize() gate silently fails these and degrades hydration to a
// full rebuild (flash, lost DOM state) — the opposite of hydrate()'s promise.

import { test, expect } from "bun:test";
import { createRoot, signal } from "../src/reactive/index";
import { div, span, img, input, p } from "../src/dom/tags";
import { hydrate } from "../src/dom/hydrate";

const ssr = (html: string): HTMLElement => {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
};

test("adopts a void element (img) instead of rebuilding it", () => {
  const App = () => div([img(undefined, { src: "/logo.png", alt: "logo" })]);

  const host = ssr(App().toHTML());
  const existingImg = host.querySelector("img")!;

  createRoot(() => hydrate(App(), host));

  // The SAME <img> node must be reused — not rebuilt.
  expect(host.querySelector("img")).toBe(existingImg);
});

test("adopts an element whose text contains an apostrophe", () => {
  const App = () => div([span("it's a test")]);

  const host = ssr(App().toHTML());
  const existingSpan = host.querySelector("span")!;

  createRoot(() => hydrate(App(), host));

  expect(host.querySelector("span")).toBe(existingSpan);
  expect(host.querySelector("span")?.textContent).toBe("it's a test");
});

test("adopts the root element even when it contains a void child", () => {
  const App = () => div([input(undefined, { type: "text", value: "hi" })]);

  const host = ssr(App().toHTML());
  const existingRoot = host.firstElementChild!;
  const existingInput = host.querySelector("input")!;

  createRoot(() => hydrate(App(), host));

  // Root adoption must not fall back to a full rebuild (which would replace both).
  expect(host.firstElementChild).toBe(existingRoot);
  expect(host.querySelector("input")).toBe(existingInput);
});

test("adopts every sibling when a void element sits between them", () => {
  const App = () =>
    div([span("before"), img(undefined, { src: "/x.png" }), span("after")]);

  const host = ssr(App().toHTML());
  const spans = Array.from(host.querySelectorAll("span"));
  const theImg = host.querySelector("img")!;

  createRoot(() => hydrate(App(), host));

  const spansAfter = Array.from(host.querySelectorAll("span"));
  expect(spansAfter[0]).toBe(spans[0]);
  expect(spansAfter[1]).toBe(spans[1]);
  expect(host.querySelector("img")).toBe(theImg);
});

test("adopted void element still wires reactive attributes", () => {
  const srcSig = signal("/a.png");
  const App = () => div([img(undefined, { src: () => srcSig() })]);

  const host = ssr(App().toHTML());
  const existingImg = host.querySelector("img")!;

  createRoot(() => hydrate(App(), host));

  expect(host.querySelector("img")).toBe(existingImg);
  srcSig.set("/b.png");
  expect(existingImg.getAttribute("src")).toBe("/b.png");
});
