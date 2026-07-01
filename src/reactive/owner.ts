import type { Dispose } from "./types";
import {
  type Owner,
  getOwner,
  setOwner,
  getObserver,
  setObserver,
  disposeOwner,
} from "./graph";

/**
 * Create a root ownership scope. Everything reactive created inside is owned
 * by this root; calling the provided `dispose` tears it ALL down (effects,
 * children, cleanups) deterministically. This is how memory is reclaimed —
 * no reliance on the garbage collector for correctness.
 *
 *   const dispose = createRoot((dispose) => {
 *     effect(() => { ... });
 *     return dispose;
 *   });
 *   dispose(); // unsubscribes everything
 */
export function createRoot<T>(fn: (dispose: Dispose) => T): T {
  const owner: Owner = { owned: null, cleanups: null, owner: getOwner(), context: null };
  const prevOwner = getOwner();
  const prevObserver = getObserver();
  setOwner(owner);
  setObserver(null); // a root is detached from any outer tracking
  try {
    return fn(() => disposeOwner(owner));
  } finally {
    setOwner(prevOwner);
    setObserver(prevObserver);
  }
}

/**
 * Run `fn` under a captured `owner`, then restore the previous owner. This is
 * the escape hatch for DEFERRED code — event handlers, timers, promises — that
 * needs to resolve context (`useContext`/`useStore`) or register cleanups after
 * the synchronous component/provider scope has already been left.
 *
 *   const owner = getOwner();               // capture during component build
 *   button.onClick(() => runWithOwner(owner, () => useStore(CartCtx).add()));
 *
 * Tracking is detached (like a root), so reads inside `fn` don't subscribe the
 * outer computation.
 */
export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prevOwner = getOwner();
  const prevObserver = getObserver();
  setOwner(owner);
  setObserver(null);
  try {
    return fn();
  } finally {
    setOwner(prevOwner);
    setObserver(prevObserver);
  }
}

export { getOwner, onCleanup } from "./graph";
