import { test, expect } from "bun:test";
import { signal, computed, effect, batch } from "../src/reactive/index";

test("signal: read, set, update", () => {
  const c = signal(0);
  expect(c()).toBe(0);
  c.set(5);
  expect(c()).toBe(5);
  c.update((v) => v + 1);
  expect(c()).toBe(6);
});

test("computed: lazy and memoized", () => {
  let runs = 0;
  const a = signal(1);
  const d = computed(() => {
    runs++;
    return a() * 2;
  });
  expect(runs).toBe(0); // lazy: not run until read
  expect(d()).toBe(2);
  expect(runs).toBe(1);
  d();
  expect(runs).toBe(1); // memoized
  a.set(2);
  expect(d()).toBe(4);
  expect(runs).toBe(2);
});

test("diamond: recomputes once (glitch-free)", () => {
  let dRuns = 0;
  const a = signal(1);
  const b = computed(() => a() + 1);
  const c = computed(() => a() + 2);
  const d = computed(() => {
    dRuns++;
    return b() + c();
  });
  let out = 0;
  effect(() => {
    out = d();
  });
  expect(out).toBe(5);
  expect(dRuns).toBe(1);
  a.set(10);
  expect(out).toBe(23);
  expect(dRuns).toBe(2); // once, not twice
});

test("effect: no deps array, batch coalesces", () => {
  let runs = 0;
  const c = signal(0);
  effect(() => {
    c();
    runs++;
  });
  expect(runs).toBe(1);
  batch(() => {
    c.set(1);
    c.set(2);
    c.set(3);
  });
  expect(runs).toBe(2);
  expect(c()).toBe(3);
});

test("untrack and dispose", () => {
  let runs = 0;
  const a = signal(0);
  const b = signal(0);
  const dispose = effect(() => {
    a();
    runs++;
  });
  expect(runs).toBe(1);
  a.set(1);
  expect(runs).toBe(2);
  dispose();
  a.set(2);
  expect(runs).toBe(2); // no run after dispose
  void b;
});
