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
  const owner: Owner = { owned: null, cleanups: null, owner: getOwner() };
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

export { onCleanup } from "./graph";
