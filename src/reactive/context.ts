// Context — pass a value down the ownership tree without prop-drilling.
//
// Built on the owner chain (no proxy, no global registry): `provide` runs `fn`
// in a child scope that carries the value; `useContext` walks UP the owner chain
// to find it, falling back to the default. The value is resolved at CALL time
// (while the component function runs) and captured in closures — the same timing
// as Solid's context during render.

import { type Owner, getOwner, setOwner } from "./graph";

export interface Context<T> {
  readonly id: symbol;
  readonly defaultValue: T;
}

/** Create a context handle with a default value used when no provider is found. */
export const createContext = <T>(defaultValue: T): Context<T> => ({
  id: Symbol("sx-context"),
  defaultValue,
});

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";

/**
 * Run `fn` in a scope where `useContext(context)` resolves to `value`.
 *
 * This is intentionally sync-only: owner/context resolution is stack-bound, so
 * an `await` would resume after the provider scope has already been popped.
 */
export function provide<T, R>(context: Context<T>, value: T, fn: () => Promise<R>): never;
export function provide<T, R>(context: Context<T>, value: T, fn: () => R): R;
export function provide<T, R>(context: Context<T>, value: T, fn: () => R): R {
  const parent = getOwner();
  const scope: Owner = {
    owned: null,
    cleanups: null,
    owner: parent,
    context: { [context.id]: value },
  };
  setOwner(scope);
  try {
    const result = fn();
    if (isPromiseLike(result)) {
      throw new Error("provide() callbacks must be synchronous; context is not preserved across await.");
    }
    return result;
  } finally {
    setOwner(parent);
  }
}

/** Read the nearest provided value for `context`, or its default. */
export const useContext = <T>(context: Context<T>): T => {
  let owner = getOwner();
  while (owner !== null) {
    if (owner.context !== null && context.id in owner.context) {
      return owner.context[context.id] as T;
    }
    owner = owner.owner;
  }
  return context.defaultValue;
};
