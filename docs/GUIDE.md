# six — Usage Guide

`six` (`sx`) is a purely functional, fine-grained reactive web framework in
TypeScript. No JSX, no Virtual DOM, no classes, no `this`, no proxies, no `any`.
Tree-shakeable and SSR-compatible from the same source.

The mental model is Solid's, not React's: state is a **reactive graph** of
signals and effects, and each binding updates exactly one node in the DOM.
Components are just functions that return a node — there is no re-render.

---

## Table of contents

1. [Import surface](#1-import-surface)
2. [Reactivity core](#2-reactivity-core)
3. [Lifecycle & ownership](#3-lifecycle--ownership)
4. [Context](#4-context)
5. [Building DOM — tags & the fluent builder](#5-building-dom--tags--the-fluent-builder)
6. [Modifiers & events](#6-modifiers--events)
7. [Control flow](#7-control-flow)
8. [Async data — `resource`](#8-async-data--resource)
9. [State — `createStore`](#9-state--createstore)
10. [Messaging — `channel`](#10-messaging--channel)
11. [Scoped CSS, inline style & refs](#11-scoped-css-inline-style--refs)
12. [Router](#12-router)
13. [SSR & hydration](#13-ssr--hydration)
14. [DevTools](#14-devtools)
15. [HMR — design & status](#15-hmr--design--status)
16. [Full example](#16-full-example)

---

## 1. Import surface

Everything is re-exported from the root barrel. Each primitive still lives in
its own module, so bundlers tree-shake whatever you don't import.

```ts
import {
  // reactivity
  signal, computed, effect, batch, untrack,
  createRoot, onCleanup, onMount,
  createContext, provide, useContext,
  // dom
  div, span, button, ul, li, /* ...all tags */
  render, hydrate, renderToStream, streamToString,
  // control flow
  when, each, match, index, portal, errorBoundary, suspense,
  // async / state / messaging
  resource, createStore, channel,
  // css
  css,
  // router
  route, router, navigate, link, startRouter, withRouter, currentPath,
  // devtools
  enableDevtools, getDevtools,
} from "sixframework";
```

---

## 2. Reactivity core

### `signal<T>(value)`

The state primitive. Returns a callable accessor with `.set` and `.update`.

```ts
const count = signal(0);

count();                    // read (tracks the current effect)
count.set(5);               // write
count.update((n) => n + 1); // write from previous
```

Reading a signal **inside** an effect/computed subscribes that consumer to it.
Reading it outside any reactive scope just returns the value.

### `computed<T>(fn)`

A memoized derived value. Recomputes lazily, only when read and only when a
dependency actually changed.

```ts
const first = signal("Ada");
const last = signal("Lovelace");
const full = computed(() => `${first()} ${last()}`);

full(); // "Ada Lovelace" — cached until first/last change
```

### `effect(fn)`

A side effect that re-runs when its tracked dependencies change. This is the
bridge from the reactive graph to the outside world (the DOM layer is built
entirely on effects).

```ts
effect(() => {
  console.log("count is", count());
});
count.set(1); // logs "count is 1"
```

### `batch(fn)`

Coalesce multiple writes into a single flush. Effects run once, after `fn`.

```ts
batch(() => {
  first.set("Grace");
  last.set("Hopper");
}); // dependents recompute once, not twice
```

### `untrack(fn)`

Read signals **without** subscribing the current scope to them.

```ts
effect(() => {
  const a = tracked();               // subscribes
  const b = untrack(() => other());  // reads, does NOT subscribe
});
```

---

## 3. Lifecycle & ownership

Every reactive computation belongs to an **owner scope**. Disposing the scope
runs all registered cleanups and tears down child effects — deterministically,
with no reliance on the garbage collector.

### `createRoot(fn)`

Creates a top-level owner scope. `fn` receives a `dispose` function.

```ts
const dispose = createRoot((dispose) => {
  effect(() => { /* ... */ });
  return dispose;
});

dispose(); // stops every effect created inside
```

### `onCleanup(fn)`

Register a teardown callback for the current scope. Runs on dispose and before
each re-run of an enclosing effect.

```ts
effect(() => {
  const id = setInterval(tick, 1000);
  onCleanup(() => clearInterval(id));
});
```

### `onMount(fn)`

Run a callback once, after the current build completes (deferred to a
microtask). Safe place to touch a DOM element captured via `.ref()`.

```ts
onMount(() => console.log("mounted"));
```

---

## 4. Context

Dependency injection down the owner tree — no prop drilling, no globals.

```ts
const Theme = createContext<"light" | "dark">("light");

provide(Theme, "dark", () => {
  // anything built in here sees "dark"
  const t = useContext(Theme); // "dark"
});
```

`useContext` returns the nearest provided value, or the context's default.

### Deferred resolution — `getOwner` / `runWithOwner`

`useContext`/`useStore` resolve by walking the owner chain, which works during a
component's synchronous build and inside effects (an effect restores its owner
when it runs). But **deferred** code — an event handler, a `setTimeout`, a
`.then()` — runs with no active owner, so a bare `useStore()` there sees only the
default. Capture the owner during build and re-enter it:

```ts
const Cart = () => {
  const owner = getOwner();                    // capture during build (sync)
  return button("Add").onClick(() =>
    runWithOwner(owner, () => useStore(CartCtx).add("☕")),
  );
};
```

In practice you usually resolve the store once at the top of the component and
close over it — `const cart = useStore(CartCtx)` — and the handler just uses
`cart`. `runWithOwner` is the escape hatch for when you genuinely must resolve
lazily.

---

## 5. Building DOM — tags & the fluent builder

Tags are plain functions. Calling one returns an `SxNode` **descriptor** — it
records intent, it does not touch the DOM until you `.into()` (client) or
`.toHTML()` (server).

```ts
import { div, h1, p, button } from "sixframework";

const view =
  div([
    h1("Hello"),
    p("six is functional all the way down"),
    button("Click me"),
  ]);
```

A tag accepts children as its first argument: a string, number, another node,
an array, or a reactive thunk `() => value`.

```ts
const count = signal(0);
div(() => `Count: ${count()}`); // reactive text — updates in place
```

Mount it, or serialize it:

```ts
const dispose = view.into(document.getElementById("root")!); // live DOM
const html = view.toHTML();                                   // SSR string
const json = view.toJSON();                                   // debug/transport
```

---

## 6. Modifiers & events

Modifiers are chainable and only **record** intent. All accept static or
reactive (`() => value`) inputs.

```ts
div("content")
  .class(() => active() ? "on" : "off") // full className (reactive)
  .addClass("selected", () => selected()) // conditional single class
  .attr("data-id", () => item().id)       // any attribute
  .style("color", () => theme().fg)       // one CSS property (null removes it)
  .id("main")
  .text(() => label());                   // owns textContent
```

### Events

`.on(event, handler)` is the escape hatch; named helpers are autocomplete-friendly:

```ts
button("Save")
  .onClick((e) => save())
  .onMouseEnter(() => hover.set(true));

// available: onClick, onDblClick, onInput, onChange, onSubmit, onFocus,
// onBlur, onKeyDown, onKeyUp, onMouseEnter, onMouseLeave, onScroll
```

---

## 7. Control flow

All control-flow helpers return a `DynamicChild` — a live region the renderer
mounts/unmounts reactively, and `toHTML()` serializes as a snapshot (with
hydration markers where needed).

### `when(condition, then, else?)`

Conditional. Re-mounts only when the boolean actually flips.

```ts
when(() => loggedIn(), () => Dashboard(), () => Login());
```

### `each(list, renderItem, key?)`

Keyed list. Unchanged items are reused; only diffs touch the DOM. Use when items
have a **stable identity**.

```ts
each(() => todos(), (t) => li(t.title), (t) => t.id);
```

### `index(list, renderItem)`

Index-keyed list — sugar over `each` with position as key. Use when items are
values without stable identity (strings, numbers).

```ts
index(() => tags(), (tag) => span(tag));
```

> **`each` vs `index`:** `each` with a stable key preserves node+state when the
> list reorders. `index` treats position as identity — correct for value lists,
> wrong for reorderable entities (state would stick to the slot, not the item).

### `match(cases, fallback?)`

Multi-branch conditional (Switch/Match). Renders the first truthy case.

```ts
match(
  [
    [() => status() === "loading", () => Spinner()],
    [() => status() === "error",   () => ErrorView()],
    [() => status() === "ready",   () => Content()],
  ],
  () => Empty(), // optional fallback
);
```

### `portal(target, children)`

Render children into a different DOM element (modals, tooltips). Cleaned up when
the scope disposes. SSR: emits nothing in the local slot.

```ts
portal(document.getElementById("modal-root")!, () => Overlay());
```

### `errorBoundary(children, fallback)`

Catch synchronous errors thrown during child render. `reset` re-attempts.

```ts
errorBoundary(
  () => RiskyView(),
  (err, reset) => div([span(String(err)), button("Retry").onClick(reset)]),
);
```

### `suspense(sources, fallback, children)`

Coordinate **one shared fallback** across N async sources. `sources` is a
`resource` (or a `() => boolean` thunk), or an array of them. Shows `fallback`
while any source is loading; swaps to `children` once all settle.

```ts
const user  = resource(() => fetchUser(id));
const posts = resource(() => fetchPosts(id));

suspense([user, posts], () => Spinner(), () => Dashboard(user()!, posts()!));
```

> Because a `resource` starts fetching when **created** (not when mounted), six's
> suspense is explicit and needs no offscreen rendering. Combine with
> `errorBoundary` to handle rejected sources.

---

## 8. Async data — `resource`

Async data as a reactive primitive. Built on signal + effect.

```ts
// no source — fetch once
const posts = resource(() => fetch("/api/posts").then((r) => r.json()));

// with a reactive source — refetches when the source changes
const userId = signal(1);
const user = resource(userId, (id) => fetchUser(id));

user();          // T | undefined
user.loading();  // boolean
user.error();    // unknown
user.refetch();  // force reload
user.mutate(u);  // optimistic local write (value or updater)
user.match({ loading: () => ..., error: (e) => ..., ready: (u) => ... });
```

A `null`/`undefined`/`false` source gates the fetch (skips it). Stale results
from a superseded fetch are dropped via a generation guard.

---

## 9. State — `createStore`

Shared reactive state, built on signals. Each top-level key becomes its own
signal (fine-grained reads for free). Actions return a **patch** (Redux-style,
no proxy); getters are memoized `computed`s.

```ts
const counter = createStore({
  state: { count: 0 },
  actions: (s) => ({
    inc: () => ({ count: s.count() + 1 }),
    add: (n: number) => ({ count: s.count() + n }),
  }),
  getters: (s) => ({ doubled: () => s.count() * 2 }),
});

counter.count();     // read (fine-grained)
counter.inc();
counter.add(5);
counter.doubled();   // memoized
counter.dehydrate(); // JSON snapshot (server)
counter.hydrate(snapshot); // restore (client, before mount)
```

Share a store down the tree with `provideStore` / `useStore` (see
`createStoreContext`).

---

## 10. Messaging — `channel`

Typed pub/sub for **transient events** (fire-and-forget). The store holds
*state*; a channel carries *events*.

```ts
const loggedOut = channel<void>();
loggedOut.on(() => navigate("/login")); // subscribe (auto-cleanup in scope)
loggedOut.send();                        // publish

const itemAdded = channel<{ id: number }>();
itemAdded.on((p) => console.log(p.id));
itemAdded.send({ id: 5 });
```

Subscribing inside an owner scope auto-unsubscribes on dispose.

---

## 11. Scoped CSS, inline style & refs

### `css(object)`

Functional scoped CSS. Hashes the object for a stable dedup class, converts
camelCase to kebab-case, supports nesting via `&`, pseudo-selectors, and
descendant selectors. Injects a `<style>` in the browser; on the server it
collects into a registry for SSR flush.

```ts
const card = css({
  padding: "1rem",
  borderRadius: "8px",
  "&:hover": { transform: "scale(1.02)" },
  " .title": { fontWeight: 700 }, // descendant
});

div("...").class(card);
```

### Inline `.style()` and `.ref()`

```ts
div("box").style("background", () => color()); // reactive single property

let el: HTMLElement;
input().ref((node) => (el = node)); // capture the live element on build
onMount(() => el.focus());          // safe: ref fires before onMount
```

---

## 12. Router

A functional router built **on top of `match()`** + a reactive path signal — no
new reconciler. Supports `history` (default, clean URLs) and `hash` modes.

```ts
import { route, router, link, navigate, startRouter } from "sixframework";

const App = () =>
  div([
    nav([link("/", "Home"), link("/users/1", "User 1")]),
    router(
      [
        route("/",          () => Home()),
        route("/users/:id", (p) => UserPage(p.id)),   // :id captured
        route("/files/*",   (p) => Files(p.rest)),    // wildcard
      ],
      () => NotFound(),                                 // fallback
    ),
  ]);

// client bootstrap
startRouter();                 // wire popstate (history) or hashchange (hash)
App().into(document.getElementById("root")!);

// navigate imperatively
navigate("/users/42");
navigate("/users/42", { replace: true });
```

- `route(pattern, view)` — `:param` segments are captured and passed to the
  view; `*` is a catch-all named `rest`. The query string is ignored in matching.
- `link(to, ...children)` — an `<a>` that navigates without a full reload
  (falls back to normal navigation on ctrl/meta/middle click).
- `currentPath()` — read the active path reactively.

---

## 13. SSR & hydration

The same descriptor serves both sides. Render to a string on the server, then
attach reactivity on the client **without rebuilding the DOM**.

```ts
// --- server ---
import { withRouter } from "sixframework";

// withRouter isolates path state PER REQUEST (concurrent-safe):
const html = withRouter(req.url, () => App().toHTML());
res.send(`<div id="root">${html}</div>`);

// --- client ---
import { hydrate } from "sixframework";
startRouter();
hydrate(App(), document.getElementById("root")!); // reuses server DOM, no flash
```

`hydrate()` walks the descriptor and the existing DOM in parallel (via comment
markers `<!--sx:w-->`, `<!--sx:e-->`, `<!--sx:i:KEY-->`), adopting nodes and
wiring effects to them. On a tag mismatch it falls back to a fresh render.

### Streaming SSR — `renderToStream`

Emit the HTML in chunks instead of buffering one giant string (lower TTFB, less
peak memory on large trees).

```ts
import { renderToStream, streamToString, renderToReadableStream } from "sixframework";

for await (const chunk of renderToStream(App())) res.write(chunk);

const html = await streamToString(App());        // drain to a string (=== toHTML)
const stream = renderToReadableStream(App());     // WHATWG ReadableStream<string>
```

> **Scope:** this is *synchronous* chunked streaming (shell + each top-level
> region as its own chunk). It does **not** yet do async / suspense-aware
> out-of-order streaming (React-18-style placeholder-then-swap when a server
> resource resolves) — that needs async SSR and is future work.

---

## 14. DevTools

`six` has no component tree — it has a **reactive graph**. The DevTools layer is
the instrumentation hook a tool builds on (the equivalent of React's global
hook), exposing "which signal changed and which computations ran".

```ts
import { enableDevtools, getDevtools } from "sixframework";

enableDevtools(); // installs the hook + globalThis.__SX_DEVTOOLS__

const dt = getDevtools()!;
dt.stats();                 // { signals, computeds, effects, writes, runs }
dt.events();                // recent event ring buffer
const off = dt.onEvent((e) => console.log(e)); // subscribe
dt.clear();
off();
dt.disable();               // remove the hook (zero-cost when off)
```

When disabled, the reactive hot path pays exactly one `!== null` comparison —
no overhead in production if you never call `enableDevtools()`.

> **What's here vs. not:** this is the *instrumentation layer*. A browser
> extension with a visual panel is a separate project that consumes
> `__SX_DEVTOOLS__`; the framework's job is only to expose the graph.

### Redux-style store time-travel

Because `createStore` is Redux-shaped (actions → patches, serializable state),
six ships time-travel and an action log — and bridges to the **Redux DevTools
browser extension** you already have installed. No custom extension needed.

```ts
import { enableStoreDevtools, getStoreDevtools } from "sixframework";

enableStoreDevtools(); // bridges to window.__REDUX_DEVTOOLS_EXTENSION__ if present

const counter = createStore({
  name: "counter",                    // shows up under this name in the panel
  state: { count: 0 },
  actions: (s) => ({ inc: () => ({ count: s.count() + 1 }) }),
});

counter.inc();
counter.inc();

const dt = getStoreDevtools()!;
dt.history();          // [{ seq, store, action: "inc", payload, state }, ...]
dt.historyFor("counter");
dt.jumpTo(0);          // TIME-TRAVEL: restore the snapshot at seq 0 (via store.hydrate)
dt.reset("counter");   // back to initial state
const dump = dt.export();  // serialize the session to share a repro
dt.import(dump);           // reload it (then jumpTo)
dt.disable();
```

- **Action log** — every dispatch recorded with its `payload`, `patch`, and the
  resulting state snapshot.
- **Time-travel** — `jumpTo(seq)` restores that snapshot by calling the store's
  `hydrate()`, and the fine-grained signals update the DOM in place. Jumping
  *from the Redux DevTools panel* (JUMP_TO_ACTION / JUMP_TO_STATE) works too.
- **Standalone** — the in-memory recorder works with no extension installed;
  the extension bridge is purely additive and SSR-safe (`typeof window` guarded).
- **Zero-cost when off** — the store hot path pays one `!== null` check.

> **Call `enableStoreDevtools()` before creating your stores.** The hook only
> sees stores created after it is installed (retaining every store to register
> them retroactively would leak). Stores sharing a `name` are auto-disambiguated
> in the panel, and an extension injected *after* enable still bridges new stores.

---

## 15. HMR — design & status

Hot Module Replacement is **not a framework primitive** — it's a bundler
concern (a Vite/Rollup plugin). What the framework must provide is the piece the
plugin needs: **state preservation across a module swap**.

The design:

1. The bundler plugin intercepts a changed module and re-imports it.
2. Instead of a full page reload, the plugin disposes the old owner scope
   (`createRoot`'s `dispose`) and re-runs the module's view factory.
3. Signal/store values survive because they can be serialized
   (`store.dehydrate()` / `store.hydrate()`) and restored into the new scope.

The reactive core already gives the two hard requirements: **deterministic
disposal** (owner tree + `onCleanup`) and **serializable state**
(`dehydrate`/`hydrate`). What's missing is the bundler plugin that wires them to
the dev server's HMR API — that lives outside the framework package and is the
remaining work item.

---

## 16. Full example

```ts
import {
  signal, div, nav, span, button, h1, ul, li,
  each, match, resource, suspense,
  route, router, link, navigate, startRouter,
  css,
} from "sixframework";

const shell = css({ fontFamily: "system-ui", maxWidth: "40rem", margin: "0 auto" });

const Home = () => div([h1("Home"), link("/users/1", "See user 1")]);

const UserPage = (id: string) => {
  const user = resource(() => fetch(`/api/users/${id}`).then((r) => r.json()));
  return suspense(
    [user],
    () => span("Loading…"),
    () => div([h1(() => user()!.name), button("← Back").onClick(() => navigate("/"))]),
  );
};

const NotFound = () => div([h1("404"), link("/", "Home")]);

const App = () =>
  div([
    nav([link("/", "Home"), span(" · "), link("/users/1", "User 1")]),
    router(
      [
        route("/",          () => Home()),
        route("/users/:id", (p) => UserPage(p.id)),
      ],
      () => NotFound(),
    ),
  ]).class(shell);

startRouter();
App().into(document.getElementById("root")!);
```

---

*Every API in this guide is verified against the current source. The framework
ships 227 passing tests across the reactive core, DOM runtime, control flow,
async, state, messaging, CSS, router, SSR/hydration, streaming, graph devtools,
and Redux-style store time-travel.*
