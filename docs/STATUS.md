# sx — Status, Comparison & Architecture

A living snapshot of what the framework has, what it lacks, and how it behaves.
Legend: ✅ done & tested · 🟡 partial / different · ❌ missing.

---

## 1. Feature comparison — sx vs SolidJS vs React

### Reactivity (core) — on par with Solid, ahead of React
| Capability | React | Solid | sx |
| --- | --- | --- | --- |
| Primitive state | `useState` (re-render) | `createSignal` | `signal` ✅ |
| Derived / memo | `useMemo` | `createMemo` | `computed` ✅ |
| Side effect | `useEffect` | `createEffect` | `effect` ✅ |
| Batching | automatic | `batch` | `batch` ✅ |
| Untracked read | — | `untrack` | `untrack` ✅ |
| Ownership / disposal | — (GC) | `createRoot` / owner | `createRoot` ✅ |
| Context | `useContext` | `useContext` | `useContext` ✅ |

### State & async
| Capability | React | Solid | sx |
| --- | --- | --- | --- |
| Store | external (Redux/Zustand) | `createStore` (proxy) | `createStore` 🟡 (no proxy — signal-per-key + patch actions + getters + dehydrate/hydrate) |
| Store access | Provider / hook | module or context | module **or** `provideStore`/`useStore` ✅ |
| Async data | `use` / Suspense / libs | `createResource` | `resource` ✅ (source gating, race-safe, `mutate`, `.match`) |

### Control flow
| Capability | React | Solid | sx |
| --- | --- | --- | --- |
| Conditional | `cond && <X/>` | `Show` | `when` ✅ |
| Keyed list | `.map` + key | `For` | `each` ✅ |
| Switch / multi-branch | — | `Switch` / `Match` | `match` ✅ |
| Non-keyed index list | — | `Index` | `index` ✅ |
| Portal | `createPortal` | `Portal` | `portal` ✅ |
| Error boundary | `ErrorBoundary` | `ErrorBoundary` | `errorBoundary` ✅ |
| Suspense | `Suspense` | `Suspense` | `suspense` ✅ (explicit; resource-driven, no offscreen) |

### Lifecycle
| Capability | React | Solid | sx |
| --- | --- | --- | --- |
| Mount | `useEffect(fn, [])` | `onMount` | `onMount` ✅ |
| Cleanup | `useEffect` return | `onCleanup` | `onCleanup` ✅ |
| Update | `useEffect(fn, [deps])` | effects | effects ✅ |
| Ref | `useRef` | `ref=` | `.ref(callback)` ✅ (fires before `onMount`; SSR-safe) |

> **Lifecycle model:** sx === Solid. Component runs **once**; lifecycle is just
> `build → onMount → effects → onCleanup`. There is **no update hook** — fine-grained
> effects update the DOM at the node level, so the component never re-runs. React is
> the opposite: it re-renders and collapses mount/update/cleanup into `useEffect` with
> a dependency array.

### Rendering / SSR / messaging / DX
| Capability | React | Solid | sx |
| --- | --- | --- | --- |
| Client mount | `createRoot().render` | `render()` | `.into()` ✅ |
| SSR to string | `renderToString` | `renderToString` | `.toHTML()` ✅ |
| Hydration | `hydrateRoot` | `hydrate` | `hydrate()` ✅ (comment-marker based; reuses SSR nodes; when/each adopted) |
| Streaming SSR | `renderToPipeableStream` | `renderToStream` | `renderToStream` 🟡 (synchronous chunked; async out-of-order = future) |
| Templating | JSX (compiler) | JSX (compiler) | fluent API + `` html`` `` (**runtime**, no compiler) |
| Inline styles | `style={{}}` | `style={{}}` | `.style(name, value)` ✅ (reactive, SSR-serialized) |
| Scoped CSS | CSS Modules / libs | CSS Modules / `solid-styled` | `css({})` ✅ (runtime, functional object — camelCase, nesting, deduped) + `@styles {}` via `.sx` compiler |
| Messenger / pub-sub | libs | — | `channel` ✅ (built-in; Solid has none) |
| Router | react-router | @solidjs/router | `router` ✅ (built on `match`; history/hash; SSR via `withRouter`) |
| HMR / devtools | ✅ | ✅ | 🟡 devtools ✅ (reactive-graph + Redux-style store time-travel); HMR ❌ (bundler plugin) |
| Code splitting | `lazy` | `lazy` | ❌ |

---

## 2. What we HAVE vs what we LACK

**Have (verified — 214 tests passing):**
- Reactive core: `signal`, `computed`, `effect`, `createRoot`, `onCleanup`, `batch`, `untrack`, `context`
- Lifecycle: `onMount`, `onCleanup`
- Rendering: fluent API (`main([...]).class().onClick()`), `` html`` `` tagged template, `.into()` (live), `.toHTML()` (SSR string)
- Control flow: `when` (Show), `each` (**keyed** For), `match` (Switch/Match), `index` (Index), `portal` (Portal), `errorBoundary` (ErrorBoundary), `suspense` (Suspense — explicit, resource-driven)
- Styling: `.style(name, value)` (inline, reactive, SSR-serialized); `.ref(callback)`; `css({})` runtime scoped CSS (functional object, deduped); `@styles {}` via the `.sx` compiler
- State: `createStore` (signals + patch actions + getters + `dehydrate`/`hydrate`), `provideStore`/`useStore`
- Async: `resource` (source gating, race-safe, `mutate` for optimistic updates, `.match` for loading/error/ready)
- Messaging: `channel` (typed pub/sub)
- SSR: `.toHTML()`, `hydrate()` (comment-marker based; reuses SSR nodes), `renderToStream`/`streamToString`/`renderToReadableStream` (synchronous chunked)
- Router: `route`/`router`/`navigate`/`link`/`startRouter` (built on `match`; history + hash; SSR via `withRouter` request-local)
- DevTools: `enableDevtools` (reactive-graph instrumentation, zero-cost when off) + `enableStoreDevtools` (Redux-style time-travel + action log + Redux DevTools extension bridge)
- DX: fixed-port dev server, full usage manual (`docs/GUIDE.md`)

**Lack (remaining — all OUTSIDE the framework package):**
1. HMR — needs a Vite/bundler plugin (core already provides deterministic disposal + serializable state)
2. Streaming SSR — async / suspense-aware out-of-order (needs async SSR)
3. Code splitting — `lazy` primitive + bundler integration
4. A dedicated browser DevTools extension (the instrumentation hook `__SX_DEVTOOLS__` / `__SX_STORE_DEVTOOLS__` is ready to consume)

---

## 3. Render order

A component in sx is just a function returning an `SxNode` descriptor. Mounting
happens in distinct phases:

### Phase 1 — Build (descriptor)
`App()` runs and returns a descriptor tree. Because JS evaluates call arguments
before the enclosing call, **child component functions run before their parents**
(leaf → root, left → right):

```ts
main([ h1("title"), div([ button("+") ]) ])
//      (1)            (3) ↑ (2) button runs before div
//   order of calls: h1 → button → div → main
```

Anything reactive captured here (signals, `useStore`, `onMount` registrations) is
recorded in that order. The descriptor is plain data — no DOM yet.

### Phase 2 — Mount (`.into` / `render`)
`render` builds the real DOM **top → down** and attaches the whole subtree once:

```
render(node, target):
  createRoot:
    buildElement(node):           // parent element created first
      createElement(tag)
      applyProps / applyModifiers  // reactive bindings = effects, run initially here
      mountChild(children)         // recurse into children, appendChild to parent
    target.appendChild(el)         // entire tree attached to the document in ONE op
```

So **effects initialize top-down** as each element is built; the DOM is assembled
in memory and inserted in a single `appendChild` (no layout thrash).

### Phase 3 — onMount
Right after mount completes (a microtask), queued `onMount` callbacks fire in
**registration order = leaf → root** (children mounted before parents). The real
DOM is in place, so layout reads / focus / 3rd-party libs are safe here.

### Phase 4 — Updates
**No re-render.** A signal write marks only the effects that read it; each such
effect re-runs and mutates its one node. The component function never runs again.
`when`/`each` re-mount/reconcile only their own region.

```
signal.set(x) → mark dependent effects DIRTY → flush → each effect writes its node
```

---

## 4. Communication between components

Four mechanisms, all functional (no classes, no event-emitters on instances):

### a) Props — parent → child
Pass values or accessors as plain function arguments.
```ts
const Greeting = (name: () => string) => h1(() => `Hi ${name()}`);
main([ Greeting(user.name) ]);   // pass the accessor; child stays reactive
```

### b) Shared state — any ↔ any (reactive)
A `store` is the mediator. Component B reacts to A's change automatically by
reading the same store — no subscription, no event bus.
```ts
const AddButton  = () => button("Add").onClick(() => cart.add("☕"));
const CartBadge  = () => span(() => `🛒 ${cart.count()}`);  // updates when A dispatches
```

### c) Decoupled access — context (`provideStore` / `useStore`)
A deep component pulls a store/service from the ownership tree without prop-drilling.
Also gives per-request isolation for SSR.
```ts
const CartCtx = createStoreContext<typeof cart>();
provideStore(CartCtx, cart, () => App());     // at the root / per request
const cart = useStore(CartCtx);               // anywhere inside
```

### d) Transient events — `channel` (pub/sub)
Fire-and-forget events between decoupled parts (toast, logout → navigate).
```ts
const loggedOut = channel<void>();
loggedOut.on(() => router.go("/login"));   // subscriber (auto-cleanup on dispose)
loggedOut.send();                           // publisher
```

| Mechanism | Direction | Use for |
| --- | --- | --- |
| Props | parent → child | values / accessors |
| Store + `useStore` | any ↔ any | shared reactive **state** |
| `channel` | publisher → subscribers | transient **events** |
| `context` | ancestor → descendants | services / config |

**Rule of thumb:** if B must react to A's *state* → store. If it's a *transient event* → channel.

---

## 5. Roadmap (next, by priority)

Conceptual parity with Solid is reached. Everything remaining lives **outside**
the framework package (build tooling / a separate extension):

1. Vite plugin for HMR (wire the core's disposal + `dehydrate`/`hydrate` to the dev server)
2. `lazy` primitive + code splitting
3. Async / suspense-aware streaming SSR
4. Browser DevTools extension consuming `__SX_DEVTOOLS__` / `__SX_STORE_DEVTOOLS__`
