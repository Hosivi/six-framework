// Store context — decoupled access to a store without prop-drilling, and
// per-request isolation on the server. A thin, store-flavored layer over the
// generic context primitive.
//
//   const CartStore = createStoreContext<typeof cart>();
//   provideStore(CartStore, cart, () => App());   // at the root / per request
//   const cart = useStore(CartStore);             // anywhere inside

import { createContext, provide, useContext, type Context } from "../reactive/index";

/** A typed handle identifying a store in the ownership tree. */
export type StoreContext<T> = Context<T | null>;

/** Create a store context handle (no default — a provider is required). */
export const createStoreContext = <T>(): StoreContext<T> =>
  createContext<T | null>(null);

/** Provide a store instance to the subtree built by `fn`. */
export const provideStore = <T, R>(
  context: StoreContext<T>,
  store: T,
  fn: () => R,
): R => provide(context, store, fn);

/** Read the store provided for `context`. Throws if none was provided. */
export const useStore = <T>(context: StoreContext<T>): T => {
  const store = useContext(context);
  if (store === null) {
    throw new Error(
      "useStore: no store provided for this context — wrap the tree in provideStore(...).",
    );
  }
  return store;
};
