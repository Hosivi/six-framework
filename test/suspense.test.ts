// Tests for suspense() — coordinate one shared fallback across N async sources.

import { test, expect } from "bun:test";
import { createRoot, signal } from "../src/reactive/index";
import { div, span } from "../src/dom/tags";
import { suspense } from "../src/dom/suspense";
import { resource } from "../src/async/resource";

// Flush all microtasks (let the fetcher promise chain settle).
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// ---- SSR ------------------------------------------------------------------

test("SSR: renders fallback while a source is loading", () => {
  const node = div([
    suspense(
      () => true, // loading
      () => span("loading"),
      () => span("ready"),
    ),
  ]);
  expect(node.toHTML()).toContain("loading");
  expect(node.toHTML()).not.toContain("ready");
});

test("SSR: renders children once the source has settled", () => {
  const node = div([
    suspense(
      () => false, // settled
      () => span("loading"),
      () => span("ready"),
    ),
  ]);
  expect(node.toHTML()).toContain("ready");
  expect(node.toHTML()).not.toContain("loading");
});

// ---- Multiple sources -----------------------------------------------------

test("SSR: fallback when ANY source in the array is loading", () => {
  const node = div([
    suspense(
      [() => false, () => true],
      () => span("loading"),
      () => span("ready"),
    ),
  ]);
  expect(node.toHTML()).toContain("loading");
});

test("SSR: children when EVERY source in the array has settled", () => {
  const node = div([
    suspense(
      [() => false, () => false],
      () => span("loading"),
      () => span("ready"),
    ),
  ]);
  expect(node.toHTML()).toContain("ready");
});

// ---- Live: real resource --------------------------------------------------

test("live: swaps spinner for children when a resource resolves", async () => {
  const host = document.createElement("div");
  let resolve!: (value: string) => void;
  const p = new Promise<string>((r) => {
    resolve = r;
  });

  createRoot(() => {
    const r = resource(() => p);
    div([
      suspense([r], () => span("spinner"), () => span("done")),
    ]).into(host);
  });

  // Resource is loading synchronously on creation → fallback shown.
  expect(host.querySelector("span")?.textContent).toBe("spinner");

  resolve("value");
  await tick();

  // Resource settled → children shown.
  expect(host.querySelector("span")?.textContent).toBe("done");
});

// ---- Live: signal thunk ---------------------------------------------------

test("live: swaps spinner for children when a signal thunk flips", () => {
  const host = document.createElement("div");
  const isBusy = signal(true);

  createRoot(() => {
    div([
      suspense(() => isBusy(), () => span("spinner"), () => span("done")),
    ]).into(host);
  });

  expect(host.querySelector("span")?.textContent).toBe("spinner");

  isBusy.set(false);
  expect(host.querySelector("span")?.textContent).toBe("done");
});
