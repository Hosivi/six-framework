// Reactivity-core benchmark: sx vs Solid — no DOM, pull-based, self-verifying.
//
// MUST run with:  bun --conditions browser bench/reactivity.ts
// Reason: by default Bun resolves Solid's SSR build, whose signals/memos are
// NON-reactive (compute once) — that would compare sx against a dead Solid and
// produce garbage. `--conditions browser` loads Solid's real reactive core.
//
// WHY pull (memo + read) not effects: sx effects are synchronous; Solid defers
// effect scheduling — timing them across frameworks is apples-to-oranges.
// Reading a memo forces a deterministic recompute in BOTH, the fair core cost.
//
// Every scenario has a check() asserting the read value equals the analytic
// expected result. A failing check prints INVALID and the number is discarded.
//
// React is absent by design: it has NO standalone fine-grained reactivity; its
// update unit is the component re-render (measured in dom.ts).

import { signal, computed, batch, createRoot } from "../src/reactive/index";
import {
  createSignal as sSignal,
  createMemo as sMemo,
  batch as sBatch,
  createRoot as sRoot,
} from "solid-js";

const N = 10_000;
const D = 1_000;
const ITERS = 21;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

type Ctx = { update: () => number; check: () => boolean; dispose: () => void };

const measure = (make: () => Ctx): { ms: number; ok: boolean } => {
  const ctx = make();
  const ok = ctx.check(); // correctness gate BEFORE trusting timing
  for (let i = 0; i < 3; i++) ctx.update();
  const times: number[] = [];
  for (let i = 0; i < ITERS; i++) {
    const t0 = performance.now();
    ctx.update();
    times.push(performance.now() - t0);
  }
  ctx.dispose();
  return { ms: median(times), ok };
};

// ---- A: wide fan-out — 1 source, N memos.  sum = N*v + N(N-1)/2 -------------

const triangular = (N * (N - 1)) / 2;

const sxWide = (): Ctx =>
  createRoot((dispose) => {
    const src = signal(0);
    const memos = Array.from({ length: N }, (_, i) => computed(() => src() + i));
    const read = (): number => {
      let s = 0;
      for (let i = 0; i < memos.length; i++) s += memos[i]!();
      return s;
    };
    let k = 0;
    return {
      dispose,
      update: () => (src.set(++k), read()),
      check: () => (src.set(3), read() === 3 * N + triangular),
    };
  });

const solidWide = (): Ctx =>
  sRoot((dispose) => {
    const [src, setSrc] = sSignal(0);
    const memos = Array.from({ length: N }, (_, i) => sMemo(() => src() + i));
    const read = (): number => {
      let s = 0;
      for (let i = 0; i < memos.length; i++) s += memos[i]!();
      return s;
    };
    let k = 0;
    return {
      dispose,
      update: () => (setSrc(++k), read()),
      check: () => (setSrc(3), read() === 3 * N + triangular),
    };
  });

// ---- B: deep chain — source -> D memos, tail = src + (D-1) ------------------

const sxDeep = (): Ctx =>
  createRoot((dispose) => {
    const src = signal(0);
    let node = computed(() => src());
    for (let i = 1; i < D; i++) {
      const prev = node;
      node = computed(() => prev() + 1);
    }
    const tail = node;
    let k = 0;
    return {
      dispose,
      update: () => (src.set(++k), tail()),
      check: () => (src.set(5), tail() === 5 + (D - 1)),
    };
  });

const solidDeep = (): Ctx =>
  sRoot((dispose) => {
    const [src, setSrc] = sSignal(0);
    let node = sMemo(() => src());
    for (let i = 1; i < D; i++) {
      const prev = node;
      node = sMemo(() => prev() + 1);
    }
    const tail = node;
    let k = 0;
    return {
      dispose,
      update: () => (setSrc(++k), tail()),
      check: () => (setSrc(5), tail() === 5 + (D - 1)),
    };
  });

// ---- C: batched bulk — N signals, N memos, one batch. sum = N*(v+1) ---------

const sxBatch = (): Ctx =>
  createRoot((dispose) => {
    const sigs = Array.from({ length: N }, () => signal(0));
    const memos = sigs.map((s) => computed(() => s() + 1));
    const read = (): number => {
      let s = 0;
      for (let i = 0; i < memos.length; i++) s += memos[i]!();
      return s;
    };
    const setAll = (v: number): void =>
      batch(() => {
        for (let i = 0; i < sigs.length; i++) sigs[i]!.set(v);
      });
    let k = 0;
    return {
      dispose,
      update: () => (setAll(++k), read()),
      check: () => (setAll(4), read() === N * (4 + 1)),
    };
  });

const solidBatch = (): Ctx =>
  sRoot((dispose) => {
    const pairs = Array.from({ length: N }, () => sSignal(0));
    const memos = pairs.map(([get]) => sMemo(() => get() + 1));
    const read = (): number => {
      let s = 0;
      for (let i = 0; i < memos.length; i++) s += memos[i]!();
      return s;
    };
    const setAll = (v: number): void =>
      sBatch(() => {
        for (let i = 0; i < pairs.length; i++) pairs[i]![1](v);
      });
    let k = 0;
    return {
      dispose,
      update: () => (setAll(++k), read()),
      check: () => (setAll(4), read() === N * (4 + 1)),
    };
  });

// ---- D: create + dispose N (signal+memo) pairs -----------------------------

const createBench = (build: () => number): { ms: number; ok: boolean } => {
  const times: number[] = [];
  let ok = true;
  for (let it = 0; it < ITERS; it++) {
    const t0 = performance.now();
    const sum = build();
    times.push(performance.now() - t0);
    if (sum <= 0) ok = false; // realized work (sum of i*2 for i in [0,N)) > 0
  }
  return { ms: median(times), ok };
};

const sxCreate = (): number => {
  let sum = 0;
  const dispose = createRoot((d) => {
    const memos = Array.from({ length: N }, (_, i) => {
      const s = signal(i);
      return computed(() => s() * 2);
    });
    for (let i = 0; i < memos.length; i++) sum += memos[i]!();
    return d;
  });
  dispose();
  return sum;
};

const solidCreate = (): number => {
  let sum = 0;
  const dispose = sRoot((d) => {
    const memos = Array.from({ length: N }, (_, i) => {
      const [s] = sSignal(i);
      return sMemo(() => s() * 2);
    });
    for (let i = 0; i < memos.length; i++) sum += memos[i]!();
    return d;
  });
  dispose();
  return sum;
};

// ---- run -------------------------------------------------------------------

const fmt = (r: { ms: number; ok: boolean }): string =>
  r.ok ? r.ms.toFixed(3) + " ms" : "INVALID";

const row = (
  name: string,
  sx: { ms: number; ok: boolean },
  solid: { ms: number; ok: boolean },
): Record<string, string> => ({
  scenario: name,
  sx: fmt(sx),
  solid: fmt(solid),
  ratio: sx.ok && solid.ok ? (sx.ms / solid.ms).toFixed(2) + "×" : "—",
});

console.log(`Reactivity core — sx vs Solid  (N=${N}, D=${D}, median of ${ITERS})`);
console.log("ratio = sx / Solid   (>1 → Solid faster,  <1 → sx faster)\n");

const results = [
  row("A. wide fan-out (1→N)", measure(sxWide), measure(solidWide)),
  row("B. deep chain (depth D)", measure(sxDeep), measure(solidDeep)),
  row("C. batched bulk (N sigs)", measure(sxBatch), measure(solidBatch)),
  row("D. create+dispose", createBench(sxCreate), createBench(solidCreate)),
];

console.table(results);
