import { getObserver, setObserver } from "./graph";

/**
 * Read reactive values WITHOUT subscribing to them. Useful inside an effect
 * when you want the current value of a signal but do not want changes to it
 * to re-trigger the effect.
 *
 *   effect(() => {
 *     a();                       // tracked
 *     untrack(() => b());        // read, but NOT a dependency
 *   });
 */
export function untrack<T>(fn: () => T): T {
  const prev = getObserver();
  setObserver(null);
  try {
    return fn();
  } finally {
    setObserver(prev);
  }
}
