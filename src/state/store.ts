// createStore — six's state primitive (Layer 1.5).
//
// NOT a reactivity replacement: it is BUILT ON signals. Each top-level state
// key becomes its own signal, so reads are fine-grained for free. Actions are
// pure functions that return a PATCH (Redux-style) — no proxy needed, fully
// serializable. Getters are memoized `computed`s. dehydrate/hydrate carry state
// across the server↔client boundary (SSR isomorphism).
//
// actions/getters are FACTORIES — `(state) => ({...})` — so `state` is the
// typed accessor view and each member's signature is inferred from the return
// (a shared generic method param would lose contextual typing).
//
//   const counter = createStore({
//     state: { count: 0 },
//     actions: (s) => ({
//       inc: () => ({ count: s.count() + 1 }),     // read s.count(), return patch
//       add: (n: number) => ({ count: s.count() + n }),
//     }),
//     getters: (s) => ({ doubled: () => s.count() * 2 }),
//   });
//   counter.count();   // read (fine-grained)
//   counter.inc(); counter.add(5);
//   counter.doubled(); // memoized
//   counter.dehydrate() / counter.hydrate(snapshot)

import { signal, computed, batch, untrack } from "../reactive/index";
import type { Accessor, WritableSignal } from "../reactive/types";

type StateShape = Record<string, unknown>;

/** The read-only view passed to action/getter factories: each key is an accessor. */
export type StateView<S> = { readonly [K in keyof S]: Accessor<S[K]> };

/** An action returns a patch (or nothing). At most one payload argument. */
export type ActionDef<S> = (payload: never) => Partial<S> | void;

/** A dispatched action: no payload -> `()`, one payload -> `(payload)`. */
type BoundAction<F extends (...args: never[]) => unknown> = Parameters<F> extends []
  ? () => void
  : (payload: Parameters<F>[0]) => void;

export type Store<
  S extends StateShape,
  A extends Record<string, ActionDef<S>>,
  G extends Record<string, () => unknown>,
> = StateView<S> & {
  [K in keyof A]: BoundAction<A[K]>;
} & {
  [K in keyof G]: Accessor<ReturnType<G[K]>>;
} & {
  /** Plain JSON-serializable snapshot of the current state (server side). */
  dehydrate(): S;
  /** Restore state from a snapshot (client side, before mount). */
  hydrate(patch: Partial<S>): void;
};

// ---- store devtools instrumentation (opt-in, zero-cost when disabled) ----
// Same single-nullable-hook pattern as the reactive core (src/reactive/graph.ts):
// the ONLY tax when devtools is off is a `!== null` check per action dispatch and
// once at store creation. The store-devtools layer (src/devtools) installs itself
// here. six's createStore is already Redux-shaped, so this exposes exactly what a
// time-travel tool needs: an id/name, the state, and a hydrate to jump in time.
export interface StoreDevtoolsHook {
  onStoreCreate?: (meta: {
    id: number;
    name: string;
    state: Record<string, unknown>;
    hydrate: (patch: Record<string, unknown>) => void; // lets a tool time-travel this store
  }) => void;
  onAction?: (event: {
    id: number;
    name: string;
    action: string;
    payload: unknown;
    patch: Record<string, unknown> | undefined;
    state: Record<string, unknown>; // full state AFTER applying the patch
  }) => void;
}
let storeDevtoolsHook: StoreDevtoolsHook | null = null;
export function setStoreDevtoolsHook(hook: StoreDevtoolsHook | null): void {
  storeDevtoolsHook = hook;
}
let storeIdCounter = 0;

export function createStore<
  S extends StateShape,
  A extends Record<string, ActionDef<S>> = Record<string, never>,
  G extends Record<string, () => unknown> = Record<string, never>,
>(config: {
  state: S;
  actions?: (state: StateView<S>) => A;
  getters?: (state: StateView<S>) => G;
  /** Optional label surfaced to devtools/time-travel tools. */
  name?: string;
}): Store<S, A, G> {
  const keys = Object.keys(config.state) as (keyof S)[];

  // Always assigned (a trivial increment) so ids stay stable and deterministic;
  // the real devtools work only runs when the hook is installed.
  const storeId = ++storeIdCounter;
  const storeName = config.name ?? `store#${storeId}`;

  // One signal per top-level key — this is where fine-grained reactivity comes from.
  const signals = {} as { [K in keyof S]: WritableSignal<S[K]> };
  for (const key of keys) signals[key] = signal(config.state[key]);

  // The accessor view: reading state.count() tracks ONLY the count signal.
  const view = signals as unknown as StateView<S>;

  const apply = (patch: Partial<S> | void): void => {
    if (!patch) return;
    for (const k of Object.keys(patch) as (keyof S)[]) {
      const sig = signals[k];
      if (sig) sig.set((patch as S)[k]);
    }
  };

  // Untracked read of the full current state. Shared by dehydrate() and the
  // devtools hook so the snapshot shape stays identical in both.
  const readSnapshot = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key as string] = untrack(signals[key]);
    return out;
  };

  const api: Record<string, unknown> = {};

  // State accessors (the signal itself reads + tracks).
  for (const key of keys) api[key as string] = signals[key];

  // Getters: computed over the live view so they track and memoize.
  if (config.getters) {
    const defs = config.getters(view);
    for (const name of Object.keys(defs)) {
      api[name] = computed(defs[name] as () => unknown);
    }
  }

  // Actions: compute the patch (untracked, so dispatching never subscribes the
  // caller) and apply it in one batch so dependent effects flush once.
  if (config.actions) {
    const defs = config.actions(view);
    for (const name of Object.keys(defs)) {
      const fn = defs[name] as (payload?: unknown) => Partial<S> | void;
      api[name] = (payload?: unknown): void => {
        // Same behavior as before: compute untracked, apply in one batch. The
        // patch is captured separately only so devtools can observe it.
        const patch = untrack(() => fn(payload));
        batch(() => apply(patch));
        if (storeDevtoolsHook !== null) {
          storeDevtoolsHook.onAction?.({
            id: storeId,
            name: storeName,
            action: name,
            payload,
            patch: (patch ?? undefined) as Record<string, unknown> | undefined,
            state: readSnapshot(),
          });
        }
      };
    }
  }

  api.dehydrate = (): S => readSnapshot() as S;

  api.hydrate = (patch: Partial<S>): void => {
    batch(() => apply(patch));
  };

  // Announce the store to devtools once it's fully built, handing over a hydrate
  // closure so a time-travel tool can restore any recorded snapshot.
  if (storeDevtoolsHook !== null) {
    storeDevtoolsHook.onStoreCreate?.({
      id: storeId,
      name: storeName,
      state: readSnapshot(),
      hydrate: (patch) => (api.hydrate as (p: Record<string, unknown>) => void)(patch),
    });
  }

  return api as Store<S, A, G>;
}
