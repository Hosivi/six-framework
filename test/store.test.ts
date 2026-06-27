// Tests for createStore — six's state primitive (signals under the hood,
// patch-returning actions, memoized getters, dehydrate/hydrate for SSR).

import { test, expect } from "bun:test";
import { effect, createRoot } from "../src/reactive/index";
import { createStore } from "../src/state/index";

test("state keys become reactive accessors with their initial values", () => {
  const s = createStore({ state: { count: 0, name: "Ana" } });
  expect(s.count()).toBe(0);
  expect(s.name()).toBe("Ana");
});

test("an action applies its returned patch", () => {
  const s = createStore({
    state: { count: 0 },
    actions: (st) => ({ inc: () => ({ count: st.count() + 1 }) }),
  });
  s.inc();
  expect(s.count()).toBe(1);
});

test("an action takes a single typed payload", () => {
  const s = createStore({
    state: { count: 0 },
    actions: (st) => ({ add: (n: number) => ({ count: st.count() + n }) }),
  });
  s.add(5);
  expect(s.count()).toBe(5);
});

test("an action returning void leaves state unchanged", () => {
  const s = createStore({
    state: { count: 3 },
    actions: () => ({ noop: () => {} }),
  });
  s.noop();
  expect(s.count()).toBe(3);
});

test("getters are reactive AND memoized", () => {
  let computeRuns = 0;
  const s = createStore({
    state: { count: 2 },
    actions: (st) => ({ inc: () => ({ count: st.count() + 1 }) }),
    getters: (st) => ({
      doubled: () => {
        computeRuns++;
        return st.count() * 2;
      },
    }),
  });

  expect(s.doubled()).toBe(4);
  expect(s.doubled()).toBe(4); // memoized
  expect(computeRuns).toBe(1);

  s.inc();
  expect(s.doubled()).toBe(6); // recomputed after dependency changed
  expect(computeRuns).toBe(2);
});

test("updates are fine-grained: an effect on count ignores other keys", () => {
  const s = createStore({
    state: { count: 0, other: "x" },
    actions: (st) => ({
      inc: () => ({ count: st.count() + 1 }),
      setOther: (v: string) => ({ other: v }),
    }),
  });

  let runs = 0;
  createRoot(() => {
    effect(() => {
      s.count();
      runs++;
    });
  });
  expect(runs).toBe(1);

  s.setOther("y"); // unrelated key
  expect(runs).toBe(1); // effect did NOT re-run -> fine-grained

  s.inc();
  expect(runs).toBe(2);
});

test("dehydrate returns a plain snapshot of current state", () => {
  const s = createStore({
    state: { count: 0 },
    actions: (st) => ({ inc: () => ({ count: st.count() + 1 }) }),
  });
  s.inc();
  expect(s.dehydrate()).toEqual({ count: 1 });
});

test("hydrate restores state from a snapshot (server -> client)", () => {
  const s = createStore({ state: { count: 0, name: "Ana" } });
  s.hydrate({ count: 7 });
  expect(s.count()).toBe(7);
  expect(s.name()).toBe("Ana"); // untouched keys preserved
});

test("two store instances are isolated (per-request safe)", () => {
  const make = () =>
    createStore({
      state: { count: 0 },
      actions: (st) => ({ inc: () => ({ count: st.count() + 1 }) }),
    });
  const a = make();
  const b = make();

  a.inc();
  expect(a.count()).toBe(1);
  expect(b.count()).toBe(0);
});
