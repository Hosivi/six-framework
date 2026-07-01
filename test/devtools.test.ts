// Tests for the devtools instrumentation layer.
//
// The reactive hook is module-global state, so every test MUST leave it OFF.
// The afterEach below disables devtools no matter how a test exits, which keeps
// this file from contaminating itself or the other 172 tests in the suite.

import { test, expect, afterEach } from "bun:test";
import { enableDevtools, getDevtools, type DevtoolsEvent } from "../src/devtools";
import { signal, computed, effect, createRoot } from "../src/reactive/index";

// Read the global handle without leaking `any`.
type Windowish = { __SX_DEVTOOLS__?: unknown };
const globalHandle = (): unknown => (globalThis as Windowish).__SX_DEVTOOLS__;

afterEach(() => {
  getDevtools()?.disable();
});

test("signal creation and writes are counted, with next/prev in the event", () => {
  const dt = enableDevtools();

  const s = signal(0);
  expect(dt.stats().signals).toBeGreaterThanOrEqual(1);

  s.set(1);
  expect(dt.stats().writes).toBeGreaterThanOrEqual(1);

  const write = dt.events().find(
    (e): e is Extract<DevtoolsEvent, { type: "signal:write" }> => e.type === "signal:write",
  );
  expect(write).toBeDefined();
  expect(write?.next).toBe(1);
  expect(write?.prev).toBe(0);
});

test("computeds and effects are distinguished by kind and both run", () => {
  const dt = enableDevtools();

  createRoot(() => {
    const s = signal(2);
    const doubled = computed(() => s() * 2);
    doubled(); // computeds are lazy: read to force the first run
    effect(() => {
      s(); // subscribe so the effect has a dependency
    });
  });

  const stats = dt.stats();
  expect(stats.computeds).toBeGreaterThanOrEqual(1);
  expect(stats.effects).toBeGreaterThanOrEqual(1);
  expect(stats.runs).toBeGreaterThan(0);

  const created = dt.events().filter((e) => e.type === "computation:create");
  const kinds = new Set(created.map((e) => (e.type === "computation:create" ? e.kind : "")));
  expect(kinds.has("computed")).toBe(true);
  expect(kinds.has("effect")).toBe(true);
});

test("onEvent subscribes and the returned function unsubscribes", () => {
  const dt = enableDevtools();
  const s = signal(0);

  const received: DevtoolsEvent[] = [];
  const unsubscribe = dt.onEvent((e) => received.push(e));

  s.set(1);
  expect(received.some((e) => e.type === "signal:write" && e.next === 1)).toBe(true);

  const countBefore = received.length;
  unsubscribe();
  s.set(2);
  expect(received.length).toBe(countBefore); // no new events after unsubscribe
});

test("the disabled path is inert: no hook, no handle, no throw", () => {
  // Make sure we start from OFF (a prior test's afterEach handles this, but be
  // explicit so this test is meaningful in isolation).
  getDevtools()?.disable();
  expect(getDevtools()).toBeNull();

  // Creating and writing signals through the OFF path must not throw...
  expect(() => {
    const s = signal(0);
    s.set(1);
    createRoot(() => {
      const c = computed(() => s() + 1);
      c();
      effect(() => {
        s();
      });
    });
  }).not.toThrow();

  // ...and nothing gets recorded, because there is no devtools instance.
  expect(getDevtools()).toBeNull();
});

test("the same handle is published on globalThis and cleared on disable", () => {
  const dt = enableDevtools();
  expect(globalHandle()).toBe(dt);

  dt.disable();
  expect(globalHandle() == null).toBe(true); // undefined or null after disable
  expect(getDevtools()).toBeNull();
});
