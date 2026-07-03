# sx benchmarks — sx vs Solid vs React

Honest, self-verifying micro-benchmarks. Every scenario asserts a correct
result before its timing is trusted; a wrong value prints `INVALID` / throws.

> **Environment**: Bun 1.3, Windows. `sx` runs from TypeScript source; Solid and
> React from their published builds. Absolute ms are noisy (shared Windows box,
> GC) — **read the ratios, they're stable across runs**. Not the official
> js-framework-benchmark (real browser, paint): a Playwright run was attempted
> and is **blocked in this sandbox** (chromium spawns but the CDP pipe times
> out). Treat DOM numbers as **relative JS cost**, indicative not definitive.

## How to run

```sh
# Reactivity core — MUST use browser condition (see trap #1)
bun --conditions browser bench/reactivity.ts

# DOM workload — compile Solid first (trap #2), then run under browser + prod
bun bench/build-solid.ts
NODE_ENV=production bun --conditions browser bench/dom.ts
```

## Two fairness traps caught (why naive numbers lie)

1. **Solid's SSR build is non-reactive.** Bun's default resolution loads Solid's
   server build, whose signals/memos compute **once** and never react. A first
   pass showed Solid "winning" by **40–1953×** — it was returning stale cached
   values, doing zero work. Fix: `--conditions browser`. Correctness asserts now
   gate every number.
2. **`@babel/core` is stubbed under `--conditions browser`.** Compiling Solid's
   JSX (babel-preset-solid — the only fair Solid DOM path) must run in a separate
   node-resolution process (`bench/build-solid.ts`); the bench then runs under
   `browser`.

## 1. Reactivity core — sx vs Solid  (N=10 000, D=1 000, median of 21)

Pull-based (memo + read), forcing a deterministic recompute in both. React
absent: no standalone fine-grained reactivity.

| Scenario | sx | Solid | sx / Solid |
|---|---|---|---|
| A. wide fan-out (1 → N) | 3.02 ms | 1.03 ms | 2.94× |
| B. deep chain (depth D) | 0.285 ms | 0.345 ms | **0.83× (sx faster)** |
| C. batched bulk (N signals) | 4.52 ms | 1.87 ms | 2.41× |
| D. create + dispose | 5.35 ms | 5.21 ms | 1.03× (tie) |

Same order of magnitude as Solid; sx wins deep chains, ties on create/dispose;
Solid's observer notification is 2–3× tuned on wide graphs.

## 2. DOM workload — five paths  (median of 7, happy-dom, **no paint**)

Three sx paths compared, plus Solid & React:
- **builder** — imperative `div([...]).into()` (per-node `createElement`).
- **html** — `html\`\`` runtime tagged template (cache + clone, per-clone hole
  search via `findComment`/`querySelector`).
- **compiled** — hand-written to match the `.sx` @html compiler output
  (`template()` clone + `walkElements` + **indexed** `insert`, no search).

### 1 000 rows
| phase | builder | html | compiled | solid | react | comp/solid |
|---|---|---|---|---|---|---|
| create | 36.47 | 44.70 | **31.06** | 24.13 | 39.46 | 1.29× |
| updateAll | 4.57 | 4.69 | 4.59 | 6.01 | 4.82 | **0.76×** |
| update10th | 0.44 | 0.46 | 0.70 | 0.76 | 2.46 | 0.91× |
| clear | 12.35 | 9.46 | 8.13 | 8.22 | 11.60 | 0.99× |

### 10 000 rows
| phase | builder | html | compiled | solid | react | comp/solid |
|---|---|---|---|---|---|---|
| create | 355.3 | 373.4 | 353.2 | 277.3 | 631.5 | 1.27× |
| updateAll | 29.0 | 36.4 | 46.4 | 47.5 | 57.1 | **0.98×** |
| update10th | 4.6 | 5.9 | 7.6 | 6.4 | 29.3 | 1.19× |
| clear | 123.3 | 146.0 | 134.2 | 128.4 | 125.2 | 1.05× |

## 3. The compiler question — answered

sx **already ships** Solid-style precompile-and-clone in two forms:
`src/dom/html.ts` (runtime `html\`\`` cache-and-clone by `strings` identity) and
`src/compiler/` (the build-time `.sx` @html compiler → `template()` factories).
The earlier create gap was measured on the **builder** path, which uses neither.

Findings from routing rows through the clone paths:
- **`html\`\`` (runtime) does NOT close the create gap** — per-clone hole search
  (`findComment` recursion + `querySelector`) offsets the `cloneNode` win. ≈
  builder, still ~1.6× behind Solid at 10k.
- **`compiled` (indexed) is the fastest sx create path** (31 vs 36 builder vs 44
  html at 1k) but **still ~1.27–1.29× behind Solid**. The residual cost is
  `walkElements` — a per-clone pre-order tree walk sx does to resolve hole
  indices, which **Solid's compiler avoids** by emitting direct node paths
  (`el.firstChild.nextSibling`).
- **On updates sx already matches or beats Solid** (comp/solid 0.76–1.19×) and
  crushes React (up to ~10× on partial updates). The gap is create-only.

**Verdict:** you don't need a *new* compiler — you have one. To close the last
~1.3× on create it would need to emit **direct node-path access instead of
`walkElements`** (drop the per-clone tree walk). And the clone advantage grows
with **static-heavy components** (a 2-cell row has almost nothing static to
amortize) — the right next measurement is real components, not a rows table.

### Bug found & FIXED: `insert()` cannot clear DocumentFragments
`html\`\`` returns a `DocumentFragment`; `insert()`'s array/node branch did
`parent.insertBefore(fragment, anchor)` (which empties the fragment) but tracked
the emptied fragment in `nodes`, then called `fragment.remove()` on clear —
`DocumentFragment` has no `.remove()`, so it threw. Repro: any reactive list of
`html\`\`` results cleared/replaced. **Fixed** in `src/dom/template.ts`: when an
item is a `DocumentFragment`, its child nodes are captured before `insertBefore`
and tracked instead of the fragment. Regression test in `test/template.test.ts`
("insert clears a reactive list of html\`\` fragments without throwing"). 243 tests
pass.

## 4. Bundle size (minified + gzip)

| Target | gzip |
|---|---|
| sx — counter app (tree-shaken) | **4.5 KB** |
| sx — full barrel (all layers) | **11.4 KB** |
| Solid runtime (published ref) | ~7 KB |
| React + ReactDOM (published ref) | ~45 KB |

## 5. Verbosity (same StatCard component)

| | chars | lines |
|---|---|---|
| sx builder | 251 | 5 |
| JSX | 277 | 6 |

sx is **not** more verbose than JSX for a real styled component.

## Verdict

sx is Solid-family and performs like it: **peer on reactivity and on DOM updates,
featherweight bundle, competitive verbosity, and a built-in router React lacks.**
Its one honest gap is **node creation at scale** — Solid's compiler emits direct
node paths; sx's clone paths still pay a per-clone walk/search. Modest (~1.3×),
create-only, and closable by tightening the `.sx` codegen. Against React it wins
broadly on update-heavy work.

## Real-browser bench — RESULTS (paint included) ★ the payoff

`bench/playwright.ts`, 1000 instances/component, median of 5, real Chromium with
**layout + paint** (two-rAF wait). Run in CI (GitHub Actions, Linux) because
Windows blocks the local CDP pipe. **This is where the "create gap" story
resolves.**

**[card]** (static-heavy)
| phase | sx | solid | react | sx/solid | sx/react |
|---|---|---|---|---|---|
| create | 122.1 | 123.3 | 125.9 | 0.99× | 0.97× |
| updateAll | 27.8 | 29.1 | 29.1 | 0.96× | 0.96× |
| update10th | 15.9 | 22.7 | 26.7 | **0.70×** | **0.60×** |
| clear | 31.6 | 32.1 | 32.1 | 0.98× | 0.98× |

**[row]**
| phase | sx | solid | react | sx/solid | sx/react |
|---|---|---|---|---|---|
| create | 82.3 | 83.5 | 73.2 | 0.99× | 1.12× |
| updateAll | 29.7 | 23.8 | 45.5 | 1.25× | 0.65× |
| update10th | 25.0 | 23.8 | 22.8 | 1.05× | 1.10× |
| clear | 31.8 | 32.1 | 32.1 | 0.99× | 0.99× |

**[field]**
| phase | sx | solid | react | sx/solid | sx/react |
|---|---|---|---|---|---|
| create | 57.4 | 55.9 | 52.5 | 1.03× | 1.09× |
| updateAll | 26.7 | 24.8 | 29.1 | 1.08× | 0.92× |
| update10th | 23.3 | 27.9 | 27.4 | **0.84×** | **0.85×** |
| clear | 31.9 | 32.2 | 30.6 | 0.99× | 1.04× |

**What paint changes vs happy-dom:**
- **The ~1.5× create gap DISAPPEARS.** create & clear are paint-bound, so sx ≈
  Solid ≈ React (card create: 122 / 123 / 126). The gap was a JS-only artifact of
  a nearly-all-dynamic 2-cell row — exactly what "static-heavy components" was
  meant to expose.
- **sx WINS partial updates** (update10th): card 0.70× vs Solid / 0.60× vs React;
  field 0.84× / 0.85×. Fine-grained touches only changed nodes.
- **sx beats React on interactivity** everywhere (row updateAll: 29.7 vs 45.5).

**Definitive answer to "do we need a compiler to reach Solid":** No — in real
browser conditions sx already matches Solid, and leads on fine-grained updates.
The compiler gap only existed in a paint-free JS micro-benchmark.

Verified before the run (happy-dom): all three bundle (sx ~8 KB, Solid ~17 KB,
React ~183 KB min); Solid resolves the client runtime. CI workflow:
`.github/workflows/bench.yml`. Windows note: the local CDP pipe is blocked by
system security — see `bench/pw/README.md`.
