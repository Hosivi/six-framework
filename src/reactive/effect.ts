import type { Dispose, EffectOptions } from "./types";
import { createComputation, runInitial, disposeNode, type Computation } from "./graph";

/**
 * Create a side-effect sink: the only place side effects (DOM, network,
 * logging, storage) should live. Runs once immediately, then re-runs
 * whenever any signal/computed it READ changes.
 *
 *   effect(() => { document.title = `${count()} - ${name()}`; });
 *
 * There is NO dependency array — dependencies are discovered automatically
 * by tracking what you read. Register teardown with `onCleanup(...)`.
 * Returns a `dispose` that fully tears the effect down.
 */
export function effect(fn: (prev: void) => void, options?: EffectOptions): Dispose {
  const node = createComputation<unknown>(
    fn as unknown as (prev: unknown) => unknown,
    undefined,
    false, // not pure: it's a sink
    false, // effects don't memoize
    options?.name,
  );
  runInitial(node as Computation);
  return () => disposeNode(node as Computation, true);
}
