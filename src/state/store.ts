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

export function createStore<
  S extends StateShape,
  A extends Record<string, ActionDef<S>> = Record<string, never>,
  G extends Record<string, () => unknown> = Record<string, never>,
>(config: {
  state: S;
  actions?: (state: StateView<S>) => A;
  getters?: (state: StateView<S>) => G;
}): Store<S, A, G> {
  const keys = Object.keys(config.state) as (keyof S)[];

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
        batch(() => apply(untrack(() => fn(payload))));
      };
    }
  }

  api.dehydrate = (): S => {
    const out = {} as S;
    for (const key of keys) out[key] = untrack(signals[key]);
    return out;
  };

  api.hydrate = (patch: Partial<S>): void => {
    batch(() => apply(patch));
  };

  return api as Store<S, A, G>;
}
