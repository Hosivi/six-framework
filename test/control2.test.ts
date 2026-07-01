import { test, expect } from "bun:test";
import { signal } from "../src/reactive/index";
import { createRoot } from "../src/reactive/index";
import { div, span, p } from "../src/dom/tags";
import { match, index as indexList, portal, errorBoundary, each } from "../src/dom/control";

// ---- match ----------------------------------------------------------------

test("match: renders the first truthy case in HTML (SSR)", () => {
  const node = div([
    match(
      [
        [() => false, () => span("nope")],
        [() => true, () => span("yes")],
      ],
      () => span("fallback"),
    ),
  ]);
  expect(node.toHTML()).toBe(`<div><!--sx:m--><span>yes</span><!--/sx:m--></div>`);
});

test("match: renders fallback when no case matches (SSR)", () => {
  const node = div([
    match(
      [
        [() => false, () => span("nope")],
        [() => false, () => span("also nope")],
      ],
      () => span("fallback"),
    ),
  ]);
  expect(node.toHTML()).toBe(`<div><!--sx:m--><span>fallback</span><!--/sx:m--></div>`);
});

test("match: renders nothing when no case matches and no fallback (SSR)", () => {
  const node = div([
    match([
      [() => false, () => span("nope")],
    ]),
  ]);
  expect(node.toHTML()).toBe(`<div><!--sx:m--><!--/sx:m--></div>`);
});

test("match: switches case reactively (live DOM)", () => {
  const choice = signal(0);
  const host = document.createElement("div");

  div([
    match([
      [() => choice() === 0, () => span("zero")],
      [() => choice() === 1, () => span("one")],
    ]),
  ]).into(host);

  expect(host.querySelector("span")?.textContent).toBe("zero");

  choice.set(1);
  expect(host.querySelector("span")?.textContent).toBe("one");
});

// ---- index ----------------------------------------------------------------

test("index: renders items using array index as key (live DOM)", () => {
  const items = signal(["a", "b", "c"]);
  const host = document.createElement("div");

  div([indexList(items, (item) => span(item))]).into(host);

  const spans = Array.from(host.querySelectorAll("span"));
  expect(spans.map((s) => s.textContent)).toEqual(["a", "b", "c"]);
});

test("index: SSR output matches each() with explicit index key", () => {
  const items = signal(["x", "y"]);

  const withIndex = div([indexList(items, (item) => span(item))]);
  const withEach = div([each(items, (item) => span(item), (_item, i) => i)]);

  expect(withIndex.toHTML()).toBe(withEach.toHTML());
});

// ---- portal ---------------------------------------------------------------

test("portal: mounts children in target, NOT in parent (live DOM)", () => {
  const target = document.createElement("div");
  const host = document.createElement("div");
  document.body.appendChild(target);
  document.body.appendChild(host);

  div([portal(target, () => span("teleported"))]).into(host);

  // The portal content should be in target, not in the div inside host
  expect(target.querySelector("span")?.textContent).toBe("teleported");
  // The host div itself has no span
  expect(host.querySelector("span")).toBe(null);

  document.body.removeChild(target);
  document.body.removeChild(host);
});

test("portal: cleans up portal content when scope disposes", () => {
  const target = document.createElement("div");
  const host = document.createElement("div");
  document.body.appendChild(target);
  document.body.appendChild(host);

  const dispose = div([portal(target, () => span("teleported"))]).into(host);

  expect(target.querySelector("span")?.textContent).toBe("teleported");

  dispose();
  expect(target.querySelector("span")).toBe(null);

  document.body.removeChild(target);
  document.body.removeChild(host);
});

// ---- errorBoundary --------------------------------------------------------

test("errorBoundary: renders children normally when no error (SSR)", () => {
  const node = div([
    errorBoundary(
      () => span("ok"),
      (_err, _reset) => span("error"),
    ),
  ]);
  expect(node.toHTML()).toBe(`<div><!--sx:r--><span>ok</span><!--/sx:r--></div>`);
});

test("errorBoundary: renders fallback when children() throws (SSR)", () => {
  const node = div([
    errorBoundary(
      () => { throw new Error("boom"); },
      (_err, _reset) => span("error fallback"),
    ),
  ]);
  expect(node.toHTML()).toBe(`<div><!--sx:r--><span>error fallback</span><!--/sx:r--></div>`);
});

test("errorBoundary: renders children normally (live DOM)", () => {
  const host = document.createElement("div");

  div([
    errorBoundary(
      () => span("healthy"),
      (_err, _reset) => span("error"),
    ),
  ]).into(host);

  expect(host.querySelector("span")?.textContent).toBe("healthy");
});

test("errorBoundary: renders fallback when children() throws (live DOM)", () => {
  const host = document.createElement("div");

  div([
    errorBoundary(
      () => { throw new Error("boom"); },
      (_err, _reset) => span("caught"),
    ),
  ]).into(host);

  expect(host.querySelector("span")?.textContent).toBe("caught");
});

test("errorBoundary: reset() clears the error and re-attempts children", () => {
  const shouldThrow = signal(true);
  const host = document.createElement("div");
  let capturedReset: (() => void) | null = null;

  div([
    errorBoundary(
      () => {
        if (shouldThrow()) throw new Error("boom");
        return span("recovered");
      },
      (_err, reset) => {
        capturedReset = reset;
        return span("error");
      },
    ),
  ]).into(host);

  // Initially in error state
  expect(host.querySelector("span")?.textContent).toBe("error");
  expect(capturedReset).not.toBe(null);

  // Fix the condition and call reset
  shouldThrow.set(false);
  capturedReset!();

  expect(host.querySelector("span")?.textContent).toBe("recovered");
});
