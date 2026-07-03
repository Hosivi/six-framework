// DOM workload benchmark: sx vs React — create / update-all / update-every-10th
// / clear, the js-framework-benchmark shape. Each framework in its IDIOMATIC
// pattern: sx fine-grained (per-row label signal → only changed text nodes
// touch the DOM); React setState (whole-list re-render + VDOM reconciliation).
//
//   NODE_ENV=production bun bench/dom.ts
// production so React ships its optimized build (dev build has runtime checks
// that would unfairly slow it). sx runs from source, which is runtime-
// equivalent to minified (minification shrinks bytes, not execution).
//
// HONEST CAVEAT: happy-dom has NO layout/paint. This measures framework logic
// + DOM-API mutation cost, NOT pixels-on-screen. A real browser (raf, style,
// layout, paint) would add cost both frameworks share. Treat as relative JS
// cost, not wall-clock UX.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register();

// The Solid harness is compiled ahead of time by bench/build-solid.ts (babel
// runs under node resolution; this file runs under `--conditions browser` so
// solid-js/web loads the client runtime). Run order:
//   bun bench/build-solid.ts
//   NODE_ENV=production bun --conditions browser bench/dom.ts

import { signal, batch, createRoot } from "../src/reactive/index";
import { table, tr, td } from "../src/dom/tags";
import { each } from "../src/dom/control";
import { html } from "../src/dom/html";
import { insert, template, walkElements } from "../src/dom/template";
import type { WritableSignal } from "../src/reactive/types";

import { createElement as h, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createRoot as reactRoot } from "react-dom/client";
import { flushSync } from "react-dom";

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const time = (fn: () => void): number => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};

type Phase = "create" | "updateAll" | "update10th" | "clear";
type Harness = { run: (p: Phase) => number; rows: () => number };

// ---- sx harness (fine-grained per-row signal) ------------------------------

const makeSx = (host: HTMLElement, N: number): Harness => {
  type Row = { id: number; label: WritableSignal<string> };
  let rows: Row[] = [];
  const list = signal<Row[]>([]);
  createRoot(() => {
    table([
      each(
        () => list(),
        (r) => tr([td(String(r.id)), td(() => r.label())]),
        (r) => r.id,
      ),
    ]).into(host);
  });
  return {
    rows: () => host.querySelectorAll("tr").length,
    run: (p) =>
      time(() => {
        if (p === "create") {
          rows = Array.from({ length: N }, (_, i) => ({
            id: i + 1,
            label: signal(`row ${i + 1}`),
          }));
          list.set(rows);
        } else if (p === "updateAll") {
          batch(() => {
            for (const r of rows) r.label.update((s) => s + " !");
          });
        } else if (p === "update10th") {
          batch(() => {
            for (let i = 0; i < rows.length; i += 10) rows[i]!.label.update((s) => s + " !");
          });
        } else {
          rows = [];
          list.set([]);
        }
      }),
  };
};

// ---- sx via html`` (lit-html clone path — the existing "compiler") ---------
// Same fine-grained per-row signal, but rows are built by cloning a cached
// <template> instead of imperative createElement. This is the fast create path
// sx already ships; bench/RESULTS showed the BUILDER path, not this one.

const makeSxHtml = (host: HTMLElement, N: number): Harness => {
  type Row = { id: number; label: WritableSignal<string> };
  let rows: Row[] = [];
  const list = signal<Row[]>([]);
  createRoot(() => {
    const tableEl = document.createElement("table");
    host.appendChild(tableEl);
    // list-level insert re-runs only when `list` changes (create/clear); each
    // row's `${() => r.label()}` is its own fine-grained text hole.
    // NOTE: insert() cannot clear DocumentFragments (fragment.remove() throws),
    // so unwrap the cloned <tr> element from html``'s fragment before listing.
    insert(tableEl, () =>
      list().map((r) => {
        const frag = html`<tr><td>${r.id}</td><td>${() => r.label()}</td></tr>`;
        return frag.firstElementChild as ChildNode;
      }),
    );
  });
  return {
    rows: () => host.querySelectorAll("tr").length,
    run: (p) =>
      time(() => {
        if (p === "create") {
          rows = Array.from({ length: N }, (_, i) => ({ id: i + 1, label: signal(`row ${i + 1}`) }));
          list.set(rows);
        } else if (p === "updateAll") {
          batch(() => {
            for (const r of rows) r.label.update((s) => s + " !");
          });
        } else if (p === "update10th") {
          batch(() => {
            for (let i = 0; i < rows.length; i += 10) rows[i]!.label.update((s) => s + " !");
          });
        } else {
          rows = [];
          list.set([]);
        }
      }),
  };
};

// ---- sx "compiled" (what the .sx @html compiler emits, hand-written) -------
// template()+clone, then walkElements + INDEXED access (no runtime search) and
// insert() only at the reactive hole. This is exactly compiler/html.ts's codegen
// shape — the fairest measure of sx's build-time compiler output.

const rowTemplate = template("<tr><td></td><td></td></tr>");

const makeSxCompiled = (host: HTMLElement, N: number): Harness => {
  type Row = { id: number; label: WritableSignal<string> };
  let rows: Row[] = [];
  const list = signal<Row[]>([]);
  createRoot(() => {
    const tableEl = document.createElement("table");
    host.appendChild(tableEl);
    insert(tableEl, () =>
      list().map((r) => {
        const el = rowTemplate(); // clone cached template
        const n = walkElements(el); // [tr, td#0, td#1]
        n[1]!.textContent = String(r.id); // static hole
        insert(n[2]!, () => r.label()); // reactive text hole
        return el as ChildNode;
      }),
    );
  });
  return {
    rows: () => host.querySelectorAll("tr").length,
    run: (p) =>
      time(() => {
        if (p === "create") {
          rows = Array.from({ length: N }, (_, i) => ({ id: i + 1, label: signal(`row ${i + 1}`) }));
          list.set(rows);
        } else if (p === "updateAll") {
          batch(() => {
            for (const r of rows) r.label.update((s) => s + " !");
          });
        } else if (p === "update10th") {
          batch(() => {
            for (let i = 0; i < rows.length; i += 10) rows[i]!.label.update((s) => s + " !");
          });
        } else {
          rows = [];
          list.set([]);
        }
      }),
  };
};

// ---- React harness (idiomatic setState + reconciliation) -------------------

type RRow = { id: number; label: string };
let setRows: Dispatch<SetStateAction<RRow[]>> | null = null;

const App = (): ReturnType<typeof h> => {
  const [rows, _set] = useState<RRow[]>([]);
  setRows = _set;
  return h(
    "table",
    null,
    rows.map((r) => h("tr", { key: r.id }, h("td", null, r.id), h("td", null, r.label))),
  );
};

const makeReact = (host: HTMLElement, N: number): Harness => {
  const root = reactRoot(host);
  flushSync(() => root.render(h(App)));
  const set = (u: SetStateAction<RRow[]>): void => flushSync(() => setRows!(u));
  return {
    rows: () => host.querySelectorAll("tr").length,
    run: (p) =>
      time(() => {
        if (p === "create") {
          set(Array.from({ length: N }, (_, i) => ({ id: i + 1, label: `row ${i + 1}` })));
        } else if (p === "updateAll") {
          set((cur) => cur.map((r) => ({ ...r, label: r.label + " !" })));
        } else if (p === "update10th") {
          set((cur) => cur.map((r, i) => (i % 10 === 0 ? { ...r, label: r.label + " !" } : r)));
        } else {
          set([]);
        }
      }),
  };
};

// ---- driver ----------------------------------------------------------------

const ROUNDS = 7;
const PHASES: Phase[] = ["create", "updateAll", "update10th", "clear"];

const benchOne = (
  name: string,
  make: (host: HTMLElement, N: number) => Harness,
  N: number,
): Record<Phase, number> => {
  const samples: Record<Phase, number[]> = {
    create: [],
    updateAll: [],
    update10th: [],
    clear: [],
  };
  for (let r = 0; r < ROUNDS; r++) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const hz = make(host, N);
    for (const p of PHASES) {
      const dt = hz.run(p);
      if (p === "create" && hz.rows() !== N) throw new Error(`${name}: created ${hz.rows()} ≠ ${N}`);
      if (p === "clear" && hz.rows() !== 0) throw new Error(`${name}: clear left ${hz.rows()} rows`);
      samples[p].push(dt);
    }
    host.remove();
  }
  return {
    create: median(samples.create),
    updateAll: median(samples.updateAll),
    update10th: median(samples.update10th),
    clear: median(samples.clear),
  };
};

const { makeSolid } = (await import("./solid-app.gen.js")) as {
  makeSolid: (host: HTMLElement, N: number) => Harness;
};

const run = (N: number): void => {
  const sx = benchOne("sx", makeSx, N);
  const sxHtml = benchOne("sx-html", makeSxHtml, N);
  const sxComp = benchOne("sx-compiled", makeSxCompiled, N);
  const solid = benchOne("solid", makeSolid, N);
  const rc = benchOne("react", makeReact, N);
  console.log(`\nDOM workload — ${N} rows  (median of ${ROUNDS}, ms)  [happy-dom, no paint]`);
  const rows = PHASES.map((p) => ({
    phase: p,
    builder: sx[p].toFixed(2),
    html: sxHtml[p].toFixed(2),
    compiled: sxComp[p].toFixed(2),
    solid: solid[p].toFixed(2),
    react: rc[p].toFixed(2),
    "comp/solid": (sxComp[p] / solid[p]).toFixed(2) + "×",
  }));
  console.table(rows);
};

console.log("sx paths: builder (imperative) · html (runtime clone) · compiled (indexed clone)");
console.log("comp/solid: does sx's compiled output reach Solid?  (<1 sx faster, >1 Solid faster)");
run(1_000);
run(10_000);
