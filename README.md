# sixframework (`sx`)

A purely functional, fine-grained reactive web framework — built from scratch.

**No JSX. No classes. No `this`. No Virtual DOM. No proxies.** Zero external
dependencies in the runtime. The reactive core is DOM-blind so it runs in the
browser **and** in Node (SSR).

```
Layer 2 — .sx compiler:   @styles (scoped CSS) · @html (Solid-style templates)
Layer 1 — DOM runtime:    tags · fluent API · events · when/each · .into / .toHTML
Layer 0 — Reactive core:  signal · computed · effect · createRoot · onCleanup · batch · untrack
```

---

## Layer 0 — the reactive core

```ts
import { signal, computed, effect } from "./src/reactive/index";

const count = signal(0); // mutable state
const doubled = computed(() => count() * 2); // derived, lazy, memoized
effect(() => console.log(doubled())); // side effect, auto-tracked

count.set(5); // -> effect logs 10
count.update((c) => c + 1); // -> effect logs 12
```

| Primitive      | Read  | Write                       | Role                              |
| -------------- | ----- | --------------------------- | --------------------------------- |
| `signal(v)`    | `s()` | `s.set(v)` / `s.update(fn)` | mutable state                     |
| `computed(fn)` | `c()` | —                           | derived, lazy, memoized           |
| `effect(fn)`   | —     | —                           | side-effect sink (no deps array)  |

Plus the foundation: `createRoot`, `onCleanup`, `batch`, `untrack`.

Push-pull engine with glitch-free `CLEAN`/`CHECK`/`DIRTY` coloring (the diamond
problem recomputes once), automatic dependency tracking (no deps arrays), and a
deterministic **ownership tree** for cleanup (no `WeakRef`, no GC reliance).

### Why it's different from React

- **No re-renders.** A change updates only the exact expression that reads it — `O(changes)`, not `O(component)`.
- **No dependency arrays.** `effect`/`computed` discover dependencies automatically.
- **No stale closures.** `count()` always reads the current value.
- **No Virtual DOM diff.** The signal already knows who depends on it.

---

## Layer 1 — the DOM runtime

```ts
import { div, h1, span, button, ul, li } from "./src/dom/tags";
import { when, each } from "./src/dom/control";

div([
  h1("Welcome to sx"),
  span(() => String(count())), // reactive text
  button("+").onClick(() => count.update((c) => c + 1)),
  when(() => count() > 5, () => span("high!")),
  ul(each(items, (i) => li(i.name), (i) => i.id)), // keyed list
])
  .class("app")
  .addClass("app--busy", () => count() > 10)
  .into(document.body); // mount to live DOM; returns dispose()
```

- **Tags** are named functions (`div`, `h1`…`h6`, `button`, `ul`…); `el(name)` is the escape hatch for custom elements / SVG.
- **Fluent API**: `.class` · `.addClass` · `.attr` · `.id` · `.text`, named events (`.onClick`, `.onInput`, `.onKeyDown`…) plus `.on(event, fn)`.
- **Control flow**: `when(cond, truthy, falsy?)` (mount/unmount) and `each(list, render, key)` (keyed reconciliation — unchanged items are reused).
- **Output**: `.toHTML()` → escaped, XSS-safe string for SSR · `.into(target)` → live DOM. Each reactive binding is just an `effect` mutating one node.

---

## Layer 2 — the `.sx` compiler

Single-file components compiled by a Bun plugin. Two directives:

### `@styles { }` — scoped CSS

```sx
import { div, h2 } from "../tags";

export const Card = () =>
  div([h2("Hi").class("card__title")]).class("card");

// @styles goes at the BOTTOM — keeps the TS code (and editor tooling) clean up top
@styles {
  .card { padding: 1rem }
  .card--active { outline: 2px solid blue }
}
```

Every class is scoped with a per-file hash (`.card` → `.card-x7k2`); `.class()` /
`.addClass()` references are rewritten via an **AST pass (Oxc)** — so a `.class()`
inside a comment or string is left untouched. Unknown classes (Tailwind) pass
through. The scoped CSS injects into `<head>` on the client and is collectable
for SSR (`collectStyles()`).

### `@html { }` — Solid-style precompiled templates (the speed path)

```sx
export const Counter = () => {
  const count = signal(0);
  const inc = () => count.update((c) => c + 1);
  // compiles to: clone a static template ONCE + bind only the holes
  return @html{<button onClick={inc}>{count()}</button>};
};
```

The compiler turns markup into a hoisted `template("…")` + targeted bindings
(`insert` / `bindAttr` / `bindEvent`) over a `cloneNode` — no runtime tree
construction, no descriptor. Forms:

- `@html(name){ markup }` — top-level factory (module-level / singleton state).
- `@html{ markup }` — inline expression, **per-instance state** (closes over the surrounding function scope).
- Holes: `{expr}` text · `attr={expr}` · `onEvent={expr}` events · `{cond ? a() : b()}` conditional · `{list().map(row)}` list.
- **Composes** with the fluent layer: `div([Counter(), Counter()])` works (each `@html` component is independent).

---

## Run it

```bash
bun install
bun run play        # reactive-core playground (✓ / ✗ per scenario)
bun run html        # SSR HTML generation playground
bun run serve       # live counter         -> http://127.0.0.1:3737
bun run todos       # live todo (when/each) -> http://127.0.0.1:3738
bun run sx          # .sx @styles demo      -> http://127.0.0.1:3739
bun run html-demo   # .sx @html composition -> http://127.0.0.1:3740
bun run products    # .sx store (@styles)   -> http://127.0.0.1:3741
bun test            # full suite (reactive · dom · control · render · compiler · e2e)
bun run typecheck   # tsc --noEmit (strict, no `any`)
```

## Toolchain

| Tool         | Role                                   |
| ------------ | -------------------------------------- |
| **Bun**      | runtime · bundler · test runner · pm   |
| **Oxc**      | TS parser for robust class rewriting   |
| **happy-dom**| DOM for live-render tests (dev only)   |
| **tsc**      | strict typecheck (no `any`)            |

`src/` stays runtime-neutral — Bun/Oxc/happy-dom are dev/build only. The
framework ships only standard JS + Web APIs (browser · Node SSR · Tauri).

## Status & known limitations

Layers 0–2 are implemented and tested (live DOM verified with happy-dom: fine-grained
updates and keyed reconciliation are asserted, not assumed). Still open:

- `@html` markup: lists are non-keyed (rebuild); text holes are appended (put static text before the hole); no SSR codegen for `@html` yet.
- No `.sx` language server, so `.sx` files are not typechecked by `tsc` (they are excluded).
- `.addStyle`, a router (Fase 3), and multiplatform adapters (Tauri/Capacitor) are not built yet.
