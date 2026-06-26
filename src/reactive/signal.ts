import type { SignalOptions, WritableSignal } from "./types";
import { createSignalState, readSignal, writeSignal } from "./graph";

const defaultEquals = Object.is;

/**
 * Create a writable reactive value.
 *
 *   const count = signal(0);
 *   count();              // read (and track)
 *   count.set(5);         // write
 *   count.update(c => c + 1);
 *
 * The returned value is a callable getter with `.set` / `.update` closures.
 * No `this`, no class, no proxy — and the callable getter doubles as the
 * thunk you hand to `h(...)` once the renderer exists.
 */
export function signal<T>(value: T, options?: SignalOptions<T>): WritableSignal<T> {
  const equals = (
    options?.equals === undefined ? defaultEquals : options.equals
  ) as ((a: T, b: T) => boolean) | false;

  const node = createSignalState(value, equals, options?.name);

  const accessor = (() => readSignal(node)) as unknown as WritableSignal<T>;
  accessor.set = (next: T): void => {
    writeSignal(node, next);
  };
  accessor.update = (fn: (prev: T) => T): void => {
    writeSignal(node, fn(node.value));
  };
  return accessor;
}
