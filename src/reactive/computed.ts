import type { Accessor, ComputedOptions } from "./types";
import { createComputation, readComputation } from "./graph";

const defaultEquals = Object.is;

/**
 * Create a derived, read-only reactive value.
 *
 *   const full = computed(() => `${first()} ${last()}`);
 *   full();   // read (and track)
 *
 * Lazy (recomputes only when read and a dependency actually changed),
 * memoized, and glitch-free. Structurally it is a read-only signal:
 * the same `Accessor<T>` you get from a signal's getter, so `h(...)`,
 * effects, and other computeds treat it identically.
 */
export function computed<T>(
  fn: (prev: T | undefined) => T,
  options?: ComputedOptions<T>,
): Accessor<T> {
  const equals = (
    options?.equals === undefined ? defaultEquals : options.equals
  ) as ((a: T | undefined, b: T | undefined) => boolean) | false;

  const node = createComputation<T | undefined>(
    fn,
    undefined,
    true, // pure
    equals,
    options?.name,
  );
  return () => readComputation(node) as T;
}
